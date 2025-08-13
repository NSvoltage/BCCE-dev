# BCCE Step Type System Design

> **Comprehensive guide to the extensible step type system enabling custom workflow operations**

## Overview

The BCCE Step Type System is the core extensibility mechanism that allows organizations to create custom workflow operations beyond the built-in step types. This system enables seamless integration of internal tools, third-party services, and complex business logic into BCCE workflows.

## Current Implementation Issues

### Problems with Existing Architecture

1. **Hard-coded Step Types**: Current implementation uses switch statements that require core code changes
2. **No Plugin Interface**: No standardized way to add new step types
3. **Tight Coupling**: Step execution logic mixed with workflow orchestration
4. **Limited Extensibility**: Organizations cannot add custom operations without forking BCCE

```typescript
// Current problematic implementation
switch (step.type) {
  case 'agent':
    return this.executeAgentStep(step, workflow);
  case 'cmd':
    return this.executeCmdStep(step);
  case 'apply_diff':
    return this.executeApplyDiffStep(step);
  // Adding new types requires core code changes
}
```

## Proposed Step Type Architecture

### 1. Core Interfaces and Abstractions

```typescript
// Core step execution interface
export interface StepExecutor {
  readonly name: string;
  readonly version: string;
  readonly supportedTypes: string[];
  
  // Execute a step and return result
  execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult>;
  
  // Validate step configuration
  validate(step: WorkflowStep): ValidationResult;
  
  // Get JSON schema for step parameters
  getParameterSchema(stepType: string): JSONSchema7;
  
  // Cleanup resources after execution
  cleanup?(context: ExecutionContext): Promise<void>;
}

// Execution context provided to step executors
export interface ExecutionContext {
  readonly runId: string;
  readonly workflowId: string;
  readonly stepIndex: number;
  readonly artifacts: ArtifactManager;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  readonly config: WorkflowConfiguration;
  readonly environment: Record<string, string>;
  readonly previousStepResults: Map<string, StepResult>;
}

// Step execution result
export interface StepResult {
  status: 'completed' | 'failed' | 'skipped' | 'cancelled';
  output?: string;
  exitCode?: number;
  artifacts?: Artifact[];
  metrics?: StepMetrics;
  error?: Error;
  nextSteps?: string[]; // For conditional workflows
}

// Step validation result
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}
```

### 2. Base Step Executor Class

```typescript
export abstract class BaseStepExecutor implements StepExecutor {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly supportedTypes: string[];

  protected context!: ExecutionContext;
  protected logger!: Logger;
  protected metrics!: MetricsCollector;

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    this.context = context;
    this.logger = context.logger;
    this.metrics = context.metrics;

    // Pre-execution validation
    const validation = this.validate(step);
    if (!validation.valid) {
      throw new ValidationError(
        `Step validation failed: ${validation.errors.map(e => e.message).join(', ')}`
      );
    }

    // Security policy enforcement
    await this.enforcePolicy(step);

    const startTime = Date.now();
    let result: StepResult;

    try {
      // Record execution start
      this.metrics.recordStepStart(step.id, step.type);
      this.logger.info(`Executing step ${step.id} (${step.type})`);

      // Execute the actual step logic
      result = await this.executeStep(step, context);

      // Record success metrics
      const duration = Date.now() - startTime;
      this.metrics.recordStepSuccess(step.id, step.type, duration);

    } catch (error) {
      // Record failure metrics
      const duration = Date.now() - startTime;
      this.metrics.recordStepFailure(step.id, step.type, duration, error);

      result = {
        status: 'failed',
        error: error as Error,
        output: error.message
      };
    }

    // Post-execution cleanup
    await this.postExecutionCleanup(step, result);

    return result;
  }

  // Abstract method for actual step execution
  protected abstract executeStep(
    step: WorkflowStep, 
    context: ExecutionContext
  ): Promise<StepResult>;

  // Base validation - can be overridden
  validate(step: WorkflowStep): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate required fields
    if (!step.id) {
      errors.push({ field: 'id', message: 'Step ID is required' });
    }

    if (!step.type) {
      errors.push({ field: 'type', message: 'Step type is required' });
    }

    // Validate against schema
    const schema = this.getParameterSchema(step.type);
    if (schema && step.parameters) {
      const ajv = new Ajv();
      const validate = ajv.compile(schema);
      if (!validate(step.parameters)) {
        errors.push(...(validate.errors || []).map(error => ({
          field: error.instancePath,
          message: error.message || 'Validation error'
        })));
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Default parameter schema - should be overridden
  getParameterSchema(stepType: string): JSONSchema7 {
    return {
      type: 'object',
      properties: {},
      additionalProperties: true
    };
  }

  // Policy enforcement
  private async enforcePolicy(step: WorkflowStep): Promise<void> {
    if (!step.policy) return;

    // Timeout enforcement
    if (step.policy.timeout_seconds) {
      setTimeout(() => {
        throw new PolicyViolationError(
          `Step ${step.id} exceeded timeout of ${step.policy!.timeout_seconds}s`
        );
      }, step.policy.timeout_seconds * 1000);
    }

    // Additional policy checks can be added here
  }

  // Post-execution cleanup
  protected async postExecutionCleanup(
    step: WorkflowStep, 
    result: StepResult
  ): Promise<void> {
    // Save artifacts if any
    if (result.artifacts) {
      for (const artifact of result.artifacts) {
        await this.context.artifacts.saveArtifact(
          step.id,
          artifact.name,
          artifact.content
        );
      }
    }

    // Log execution summary
    this.logger.info(`Step ${step.id} completed with status: ${result.status}`);
  }
}
```

### 3. Built-in Step Types

#### Agent Step Executor
```typescript
export class AgentStepExecutor extends BaseStepExecutor {
  readonly name = 'claude-code-agent';
  readonly version = '1.0.0';
  readonly supportedTypes = ['agent'];

  protected async executeStep(
    step: WorkflowStep, 
    context: ExecutionContext
  ): Promise<StepResult> {
    const agentStep = step as AgentWorkflowStep;
    
    // Build Claude Code command
    const claudeArgs = this.buildClaudeArgs(agentStep);
    
    // Execute Claude Code with policy constraints
    const claudeProcess = spawn('claude', claudeArgs, {
      env: this.buildSecureEnvironment(agentStep.policy),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: (agentStep.policy?.timeout_seconds || 300) * 1000
    });

    // Capture transcript
    const transcript = await this.captureTranscript(claudeProcess);
    
    // Enforce policy violations
    const violations = this.checkPolicyViolations(transcript, agentStep.policy);
    if (violations.length > 0) {
      throw new PolicyViolationError(
        `Policy violations detected: ${violations.join(', ')}`
      );
    }

    return {
      status: claudeProcess.exitCode === 0 ? 'completed' : 'failed',
      exitCode: claudeProcess.exitCode,
      output: transcript.output,
      artifacts: [
        { name: 'transcript.md', content: transcript.full },
        { name: 'policy.json', content: JSON.stringify(agentStep.policy, null, 2) }
      ]
    };
  }

  getParameterSchema(stepType: string): JSONSchema7 {
    return {
      type: 'object',
      properties: {
        policy: {
          type: 'object',
          required: ['timeout_seconds', 'max_files', 'max_edits'],
          properties: {
            timeout_seconds: { type: 'number', minimum: 1, maximum: 1800 },
            max_files: { type: 'number', minimum: 1, maximum: 1000 },
            max_edits: { type: 'number', minimum: 1, maximum: 1000 },
            allowed_paths: {
              type: 'array',
              items: { type: 'string' }
            },
            cmd_allowlist: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        available_tools: {
          type: 'array',
          items: {
            enum: ['ReadFile', 'Search', 'Diff', 'Apply', 'Cmd', 'Bash']
          }
        }
      },
      required: ['policy']
    };
  }

  private buildClaudeArgs(step: AgentWorkflowStep): string[] {
    const args = ['--use-bedrock'];
    
    if (step.available_tools) {
      args.push('--tools', step.available_tools.join(','));
    }
    
    if (step.policy?.allowed_paths) {
      args.push('--allowed-paths', step.policy.allowed_paths.join(','));
    }
    
    return args;
  }
}
```

#### Command Step Executor
```typescript
export class CommandStepExecutor extends BaseStepExecutor {
  readonly name = 'system-command';
  readonly version = '1.0.0';
  readonly supportedTypes = ['cmd', 'bash', 'shell'];

  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const cmdStep = step as CommandWorkflowStep;
    
    // Security check: validate command against allowlist
    if (!this.isCommandAllowed(cmdStep.command, cmdStep.policy?.cmd_allowlist)) {
      throw new SecurityError(
        `Command '${cmdStep.command}' not in allowlist: ${cmdStep.policy?.cmd_allowlist?.join(', ')}`
      );
    }

    // Execute command with timeout
    const childProcess = exec(cmdStep.command, {
      timeout: (cmdStep.policy?.timeout_seconds || 30) * 1000,
      env: { ...process.env, ...this.buildStepEnvironment(step) }
    });

    // Capture output
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout?.on('data', (data) => stdout += data);
    childProcess.stderr?.on('data', (data) => stderr += data);

    // Wait for completion
    const result = await new Promise<StepResult>((resolve) => {
      childProcess.on('close', (code) => {
        resolve({
          status: code === 0 ? 'completed' : 'failed',
          exitCode: code || 0,
          output: stdout,
          artifacts: [
            { name: 'stdout.txt', content: stdout },
            { name: 'stderr.txt', content: stderr },
            { name: 'command.txt', content: cmdStep.command }
          ]
        });
      });

      childProcess.on('error', (error) => {
        resolve({
          status: 'failed',
          error,
          output: error.message
        });
      });
    });

    return result;
  }

  getParameterSchema(stepType: string): JSONSchema7 {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          minLength: 1,
          description: 'Shell command to execute'
        },
        working_directory: {
          type: 'string',
          description: 'Working directory for command execution'
        },
        environment: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Environment variables'
        },
        on_error: {
          enum: ['fail', 'continue', 'retry'],
          default: 'fail',
          description: 'Error handling strategy'
        }
      },
      required: ['command']
    };
  }

  private isCommandAllowed(command: string, allowlist?: string[]): boolean {
    if (!allowlist || allowlist.length === 0) {
      // If no allowlist specified, only allow safe commands
      const safeCommands = ['echo', 'ls', 'pwd', 'cat', 'grep'];
      const firstWord = command.split(' ')[0];
      return safeCommands.includes(firstWord);
    }

    return allowlist.some(allowed => 
      command.startsWith(allowed) || 
      command.split(' ')[0] === allowed
    );
  }
}
```

### 4. Custom Step Type Examples

#### HTTP API Step Executor
```typescript
export class HttpApiStepExecutor extends BaseStepExecutor {
  readonly name = 'http-api';
  readonly version = '1.0.0';
  readonly supportedTypes = ['http:get', 'http:post', 'http:put', 'http:delete'];

  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const httpStep = step as HttpApiWorkflowStep;
    const startTime = Date.now();

    try {
      // Build request configuration
      const requestConfig = this.buildRequestConfig(httpStep);
      
      // Make HTTP request
      const response = await this.makeRequest(requestConfig);
      
      // Process response
      const responseBody = await this.processResponse(response);
      
      return {
        status: response.status >= 200 && response.status < 300 ? 'completed' : 'failed',
        output: `HTTP ${response.status}: ${response.statusText}`,
        artifacts: [
          { name: 'request.json', content: JSON.stringify(requestConfig, null, 2) },
          { name: 'response.json', content: JSON.stringify(responseBody, null, 2) },
          { name: 'headers.json', content: JSON.stringify(response.headers, null, 2) }
        ],
        metrics: {
          executionTime: Date.now() - startTime,
          httpStatus: response.status,
          responseSize: JSON.stringify(responseBody).length
        }
      };

    } catch (error) {
      return {
        status: 'failed',
        error: error as Error,
        output: error.message,
        metrics: {
          executionTime: Date.now() - startTime
        }
      };
    }
  }

  getParameterSchema(stepType: string): JSONSchema7 {
    const baseSchema = {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'Request URL'
        },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'HTTP headers'
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          default: 30000,
          description: 'Request timeout in milliseconds'
        },
        retry: {
          type: 'object',
          properties: {
            attempts: { type: 'number', minimum: 1, maximum: 5, default: 1 },
            delay: { type: 'number', minimum: 100, maximum: 10000, default: 1000 }
          }
        }
      },
      required: ['url']
    };

    // Add body property for POST/PUT requests
    if (stepType === 'http:post' || stepType === 'http:put') {
      baseSchema.properties.body = {
        oneOf: [
          { type: 'string' },
          { type: 'object' }
        ],
        description: 'Request body'
      };
    }

    return baseSchema;
  }

  private buildRequestConfig(step: HttpApiWorkflowStep): RequestConfig {
    return {
      method: step.type.split(':')[1].toUpperCase() as HttpMethod,
      url: step.url,
      headers: {
        'User-Agent': 'BCCE-HttpStep/1.0',
        'Content-Type': 'application/json',
        ...step.headers
      },
      body: step.body,
      timeout: step.timeout || 30000
    };
  }
}
```

#### Database Step Executor
```typescript
export class DatabaseStepExecutor extends BaseStepExecutor {
  readonly name = 'database';
  readonly version = '1.0.0';
  readonly supportedTypes = ['db:query', 'db:execute', 'db:migration'];

  private connectionPool = new Map<string, any>();

  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const dbStep = step as DatabaseWorkflowStep;
    
    // Get database connection
    const connection = await this.getConnection(dbStep.connection);
    
    try {
      let result: any;
      
      switch (step.type) {
        case 'db:query':
          result = await this.executeQuery(connection, dbStep.query, dbStep.parameters);
          break;
        case 'db:execute':
          result = await this.executeCommand(connection, dbStep.command, dbStep.parameters);
          break;
        case 'db:migration':
          result = await this.executeMigration(connection, dbStep.migration_file);
          break;
        default:
          throw new Error(`Unsupported database step type: ${step.type}`);
      }

      return {
        status: 'completed',
        output: `Database operation completed. Affected rows: ${result.affectedRows || result.rows?.length || 0}`,
        artifacts: [
          { name: 'query.sql', content: dbStep.query || dbStep.command || '' },
          { name: 'result.json', content: JSON.stringify(result, null, 2) }
        ],
        metrics: {
          rowsAffected: result.affectedRows || result.rows?.length || 0,
          executionTime: result.executionTime
        }
      };

    } catch (error) {
      return {
        status: 'failed',
        error: error as Error,
        output: `Database operation failed: ${error.message}`
      };
    }
  }

  getParameterSchema(stepType: string): JSONSchema7 {
    const baseSchema = {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Database connection string or connection name'
        },
        parameters: {
          type: 'object',
          description: 'Query/command parameters'
        }
      },
      required: ['connection']
    };

    switch (stepType) {
      case 'db:query':
        return {
          ...baseSchema,
          properties: {
            ...baseSchema.properties,
            query: {
              type: 'string',
              minLength: 1,
              description: 'SQL query to execute'
            }
          },
          required: [...baseSchema.required, 'query']
        };

      case 'db:execute':
        return {
          ...baseSchema,
          properties: {
            ...baseSchema.properties,
            command: {
              type: 'string',
              minLength: 1,
              description: 'SQL command to execute'
            }
          },
          required: [...baseSchema.required, 'command']
        };

      case 'db:migration':
        return {
          ...baseSchema,
          properties: {
            ...baseSchema.properties,
            migration_file: {
              type: 'string',
              description: 'Path to migration file'
            }
          },
          required: [...baseSchema.required, 'migration_file']
        };

      default:
        return baseSchema;
    }
  }

  private async getConnection(connectionString: string): Promise<any> {
    if (this.connectionPool.has(connectionString)) {
      return this.connectionPool.get(connectionString);
    }

    // Create new connection based on connection string type
    let connection;
    if (connectionString.startsWith('postgresql://')) {
      const { Pool } = require('pg');
      connection = new Pool({ connectionString });
    } else if (connectionString.startsWith('mysql://')) {
      const mysql = require('mysql2/promise');
      connection = await mysql.createConnection(connectionString);
    } else {
      throw new Error(`Unsupported database type: ${connectionString}`);
    }

    this.connectionPool.set(connectionString, connection);
    return connection;
  }
}
```

## Step Type Registration System

### 1. Step Type Registry

```typescript
export class StepTypeRegistry {
  private executors = new Map<string, StepExecutor>();
  private schemas = new Map<string, JSONSchema7>();

  registerExecutor(executor: StepExecutor): void {
    for (const stepType of executor.supportedTypes) {
      if (this.executors.has(stepType)) {
        throw new Error(
          `Step type '${stepType}' is already registered by ${this.executors.get(stepType)?.name}`
        );
      }
      
      this.executors.set(stepType, executor);
      this.schemas.set(stepType, executor.getParameterSchema(stepType));
      
      this.context.logger.info(
        `Registered step type '${stepType}' with executor '${executor.name}' v${executor.version}`
      );
    }
  }

  getExecutor(stepType: string): StepExecutor | undefined {
    return this.executors.get(stepType);
  }

  getSchema(stepType: string): JSONSchema7 | undefined {
    return this.schemas.get(stepType);
  }

  getSupportedTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  validateStep(step: WorkflowStep): ValidationResult {
    const executor = this.getExecutor(step.type);
    if (!executor) {
      return {
        valid: false,
        errors: [{ field: 'type', message: `Unsupported step type: ${step.type}` }]
      };
    }

    return executor.validate(step);
  }
}
```

### 2. Plugin-based Registration

```typescript
export class StepTypePlugin implements Plugin {
  readonly name = 'custom-step-types';
  readonly version = '1.0.0';

  async initialize(context: PluginContext): Promise<void> {
    const registry = context.registry.get<StepTypeRegistry>('stepTypeRegistry');

    // Register custom step executors
    registry.registerExecutor(new HttpApiStepExecutor());
    registry.registerExecutor(new DatabaseStepExecutor());
    registry.registerExecutor(new SlackNotificationStepExecutor());
    registry.registerExecutor(new FileOperationStepExecutor());
    
    context.logger.info('Custom step types plugin initialized');
  }

  async cleanup(): Promise<void> {
    // Cleanup resources if needed
  }
}
```

## Integration with Workflow Runner

### Updated Workflow Runner

```typescript
export class ExtensibleWorkflowRunner {
  constructor(
    private runId: string,
    private artifactManager: ArtifactManager,
    private stepRegistry: StepTypeRegistry,
    private eventBus: EventBus
  ) {}

  async run(workflowFile: string, options: RunOptions = {}): Promise<WorkflowRunResult> {
    const workflow = await this.loadWorkflow(workflowFile);
    
    // Validate all steps
    const validationErrors = this.validateWorkflow(workflow);
    if (validationErrors.length > 0) {
      throw new ValidationError(`Workflow validation failed: ${validationErrors.join(', ')}`);
    }

    // Execute workflow
    let currentStepIndex = options.resumeFrom ? 
      workflow.steps.findIndex(s => s.id === options.resumeFrom) : 0;

    for (let i = currentStepIndex; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      
      try {
        await this.executeStep(step, workflow, i);
      } catch (error) {
        if (step.on_error === 'continue') {
          this.logger.warn(`Step ${step.id} failed but continuing`, { error: error.message });
          continue;
        } else if (step.on_error === 'retry') {
          // Implement retry logic
          i--; // Retry current step
          continue;
        } else {
          // Fail workflow
          throw error;
        }
      }
    }

    return { status: 'completed', runId: this.runId };
  }

  private async executeStep(
    step: WorkflowStep, 
    workflow: WorkflowDefinition, 
    stepIndex: number
  ): Promise<StepResult> {
    
    // Get executor for step type
    const executor = this.stepRegistry.getExecutor(step.type);
    if (!executor) {
      throw new Error(`No executor found for step type: ${step.type}`);
    }

    // Create execution context
    const context: ExecutionContext = {
      runId: this.runId,
      workflowId: workflow.workflow,
      stepIndex,
      artifacts: this.artifactManager,
      logger: this.logger,
      metrics: this.metrics,
      config: workflow,
      environment: process.env as Record<string, string>,
      previousStepResults: this.previousStepResults
    };

    // Execute step
    const result = await executor.execute(step, context);
    
    // Store result for future steps
    this.previousStepResults.set(step.id, result);
    
    // Emit events
    await this.eventBus.publish({
      type: result.status === 'completed' ? 'step.completed' : 'step.failed',
      timestamp: new Date(),
      source: 'workflow-runner',
      data: { stepId: step.id, stepType: step.type, result }
    });

    return result;
  }

  private validateWorkflow(workflow: WorkflowDefinition): string[] {
    const errors: string[] = [];

    for (const step of workflow.steps) {
      const validation = this.stepRegistry.validateStep(step);
      if (!validation.valid) {
        errors.push(
          `Step ${step.id}: ${validation.errors.map(e => e.message).join(', ')}`
        );
      }
    }

    return errors;
  }
}
```

## Testing Framework for Step Types

```typescript
export class StepExecutorTestSuite {
  constructor(private executor: StepExecutor) {}

  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const stepType of this.executor.supportedTypes) {
      results.push(await this.testValidation(stepType));
      results.push(await this.testExecution(stepType));
      results.push(await this.testErrorHandling(stepType));
    }

    return results;
  }

  private async testValidation(stepType: string): Promise<TestResult> {
    const validStep = this.createValidStep(stepType);
    const invalidStep = this.createInvalidStep(stepType);

    const validResult = this.executor.validate(validStep);
    const invalidResult = this.executor.validate(invalidStep);

    return {
      name: `${stepType}-validation`,
      passed: validResult.valid && !invalidResult.valid,
      message: validResult.valid && !invalidResult.valid ? 
        'Validation working correctly' : 
        'Validation not working as expected'
    };
  }

  private async testExecution(stepType: string): Promise<TestResult> {
    const step = this.createValidStep(stepType);
    const context = this.createMockExecutionContext();

    try {
      const result = await this.executor.execute(step, context);
      return {
        name: `${stepType}-execution`,
        passed: result.status === 'completed',
        message: `Execution completed with status: ${result.status}`
      };
    } catch (error) {
      return {
        name: `${stepType}-execution`,
        passed: false,
        message: `Execution failed: ${error.message}`
      };
    }
  }
}
```

This comprehensive step type system transforms BCCE into a truly extensible platform where organizations can create custom workflow operations tailored to their specific needs while maintaining security, observability, and maintainability standards.