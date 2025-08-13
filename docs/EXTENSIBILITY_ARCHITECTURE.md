# BCCE Extensibility Architecture

> **Comprehensive guide to extending BCCE with plugins, custom step types, and integrations**

## Overview

BCCE is designed as an extensible framework that enables organizations to customize workflows, add integrations, and implement custom step types without modifying core functionality. This document outlines the plugin architecture, extension points, and best practices for building enterprise-grade extensions.

## Architecture Principles

### 1. **Plugin-First Design**
- Core functionality implemented as plugins
- Hot-swappable components without service restart
- Version-aware compatibility checking

### 2. **Dependency Injection**
- Loose coupling between components
- Testable and mockable dependencies
- Configuration-driven component assembly

### 3. **Event-Driven Architecture**
- Observable workflow execution
- Real-time monitoring and alerting
- Audit trail generation

### 4. **Security by Design**
- Sandboxed plugin execution
- Fine-grained permission model
- Code signing and verification

## Core Extension Points

### 1. Step Type Plugins

Custom step types enable organizations to integrate their own tools and processes into workflows.

```typescript
// Example: Database operations step plugin
export class DatabaseStepPlugin extends BaseStepPlugin {
  readonly name = 'database-operations';
  readonly version = '1.2.0';
  readonly supportedTypes = ['db:query', 'db:migrate', 'db:backup'];

  createExecutor(stepType: string): StepExecutor | null {
    switch (stepType) {
      case 'db:query':
        return new DatabaseQueryExecutor(this.context);
      case 'db:migrate': 
        return new DatabaseMigrateExecutor(this.context);
      default:
        return null;
    }
  }

  getSchema(stepType: string): JSONSchema7 {
    return {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Database connection string' },
        query: { type: 'string', description: 'SQL query to execute' },
        timeout: { type: 'number', default: 30000 }
      },
      required: ['connection', 'query']
    };
  }
}
```

**Usage in Workflows:**
```yaml
steps:
  - id: backup_database
    type: db:backup
    connection: "${DATABASE_URL}"
    backup_location: "s3://backups/daily/"
    retention_days: 7
```

### 2. Integration Plugins

Integration plugins connect BCCE to external systems and services.

```typescript
// Example: Slack notification plugin
export class SlackIntegrationPlugin implements IntegrationPlugin {
  readonly name = 'slack-notifications';
  readonly version = '1.0.0';
  readonly integrationTypes = ['notification:slack', 'approval:slack'];

  createIntegration(type: string, config: SlackConfig): Integration {
    switch (type) {
      case 'notification:slack':
        return new SlackNotificationIntegration(config);
      case 'approval:slack':
        return new SlackApprovalIntegration(config);
      default:
        throw new Error(`Unsupported integration type: ${type}`);
    }
  }
}
```

**Configuration:**
```yaml
# workflow.yml
integrations:
  - type: notification:slack
    webhook: "${SLACK_WEBHOOK_URL}"
    channel: "#deployments"
    events: ["workflow.started", "workflow.completed", "workflow.failed"]
```

### 3. Storage Backend Plugins

Custom storage backends enable different artifact storage strategies.

```typescript
// Example: Azure Blob Storage backend
export class AzureBlobStoragePlugin implements StorageBackend {
  readonly name = 'azure-blob';

  async initialize(config: AzureStorageConfig): Promise<void> {
    this.blobServiceClient = new BlobServiceClient(
      config.connectionString
    );
    this.containerName = config.container;
  }

  async store(key: string, data: Buffer): Promise<void> {
    const blockBlobClient = this.blobServiceClient
      .getContainerClient(this.containerName)
      .getBlockBlobClient(key);
    
    await blockBlobClient.upload(data, data.length);
  }
}
```

### 4. Authentication Provider Plugins

Custom authentication providers for enterprise identity systems.

```typescript
// Example: LDAP authentication provider
export class LDAPAuthProvider implements AuthenticationProvider {
  readonly name = 'ldap';
  
  async authenticate(credentials: LDAPCredentials): Promise<AuthResult> {
    const client = ldap.createClient({
      url: this.config.server
    });
    
    return new Promise((resolve, reject) => {
      client.bind(credentials.dn, credentials.password, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ 
            success: true, 
            user: { id: credentials.username, groups: [] }
          });
        }
      });
    });
  }
}
```

## Plugin Development Guide

### 1. Setting Up Plugin Development Environment

```bash
# Create new plugin project
mkdir bcce-plugin-example
cd bcce-plugin-example

# Initialize with BCCE plugin template
npx create-bcce-plugin --name="My Custom Plugin" --type="step"

# Install dependencies
npm install
```

**Project Structure:**
```
bcce-plugin-example/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── executors/            # Step executors
│   ├── schemas/              # JSON schemas
│   └── tests/                # Unit tests
├── package.json              # Plugin metadata
├── bcce.plugin.json         # BCCE plugin configuration
└── README.md                # Plugin documentation
```

### 2. Plugin Configuration

**bcce.plugin.json:**
```json
{
  "name": "my-custom-plugin",
  "version": "1.0.0",
  "description": "Custom plugin for My Organization",
  "author": "My Organization <support@myorg.com>",
  "bcceVersion": ">=2.0.0",
  "apiVersion": "v1",
  "type": "step",
  "entryPoint": "./dist/index.js",
  "permissions": [
    "filesystem:read",
    "network:http",
    "env:read"
  ],
  "configuration": {
    "schema": "./schemas/config.json",
    "required": ["apiKey", "endpoint"]
  }
}
```

### 3. Step Executor Implementation

```typescript
// src/executors/custom-step-executor.ts
export class CustomStepExecutor implements StepExecutor {
  constructor(
    private context: PluginContext,
    private config: CustomStepConfig
  ) {}

  async execute(
    step: WorkflowStep, 
    context: ExecutionContext
  ): Promise<StepResult> {
    
    // Validate step configuration
    const validation = this.validateStep(step);
    if (!validation.valid) {
      throw new Error(`Step validation failed: ${validation.errors.join(', ')}`);
    }

    // Execute step logic
    const startTime = Date.now();
    
    try {
      // Record execution start
      this.context.metrics.recordStart(step);
      
      // Perform custom operation
      const result = await this.performCustomOperation(step);
      
      // Record success metrics
      const duration = Date.now() - startTime;
      this.context.metrics.recordSuccess(step, duration);
      
      return {
        status: 'completed',
        output: result.output,
        artifacts: result.artifacts,
        metrics: {
          executionTime: duration,
          resourcesUsed: result.resourcesUsed
        }
      };
      
    } catch (error) {
      // Record failure metrics
      const duration = Date.now() - startTime;
      this.context.metrics.recordFailure(step, duration, error);
      
      throw error;
    }
  }

  private async performCustomOperation(step: WorkflowStep): Promise<OperationResult> {
    // Implementation specific to your custom step type
    const api = new CustomAPI(this.config.apiKey);
    const response = await api.call(step.parameters);
    
    return {
      output: response.data,
      artifacts: [
        { name: 'response.json', content: JSON.stringify(response) }
      ],
      resourcesUsed: {
        apiCalls: 1,
        dataProcessed: response.data.length
      }
    };
  }

  private validateStep(step: WorkflowStep): ValidationResult {
    // Step-specific validation logic
    const errors: string[] = [];
    
    if (!step.parameters?.endpoint) {
      errors.push('endpoint parameter is required');
    }
    
    if (!step.parameters?.operation) {
      errors.push('operation parameter is required');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Advanced Extension Patterns

### 1. Composite Step Types

Create complex step types by combining multiple operations:

```typescript
export class CompositeStepExecutor implements StepExecutor {
  constructor(
    private stepRegistry: Map<string, StepExecutor>,
    private context: PluginContext
  ) {}

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const compositeStep = step as CompositeWorkflowStep;
    const results: StepResult[] = [];
    
    for (const subStep of compositeStep.steps) {
      const executor = this.stepRegistry.get(subStep.type);
      if (!executor) {
        throw new Error(`No executor found for sub-step type: ${subStep.type}`);
      }
      
      const result = await executor.execute(subStep, context);
      results.push(result);
      
      // Handle sub-step failure based on strategy
      if (result.status === 'failed' && compositeStep.failureStrategy === 'abort') {
        break;
      }
    }
    
    return this.aggregateResults(results);
  }
}
```

### 2. Conditional Step Execution

Implement conditional logic within workflows:

```typescript
export class ConditionalStepExecutor implements StepExecutor {
  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const conditionalStep = step as ConditionalWorkflowStep;
    
    // Evaluate condition
    const conditionResult = await this.evaluateCondition(
      conditionalStep.condition, 
      context
    );
    
    if (conditionResult) {
      return this.executeSubStep(conditionalStep.then, context);
    } else if (conditionalStep.else) {
      return this.executeSubStep(conditionalStep.else, context);
    } else {
      return { status: 'skipped', output: 'Condition not met' };
    }
  }
}
```

### 3. Parallel Step Execution

Execute multiple steps concurrently:

```typescript
export class ParallelStepExecutor implements StepExecutor {
  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const parallelStep = step as ParallelWorkflowStep;
    
    // Execute all sub-steps in parallel
    const promises = parallelStep.steps.map(async (subStep) => {
      const executor = this.getExecutor(subStep.type);
      return executor.execute(subStep, context);
    });
    
    // Wait for all to complete or handle failures based on strategy
    const results = await Promise.allSettled(promises);
    
    return this.aggregateParallelResults(results, parallelStep.failureStrategy);
  }
}
```

## Plugin Discovery and Loading

### 1. Auto-Discovery Mechanism

```typescript
export class PluginDiscovery {
  private readonly searchPaths = [
    './plugins',
    './node_modules/@bcce/',
    process.env.BCCE_PLUGIN_PATH
  ].filter(Boolean);

  async discoverPlugins(): Promise<PluginDescriptor[]> {
    const plugins: PluginDescriptor[] = [];
    
    for (const searchPath of this.searchPaths) {
      const discoveredPlugins = await this.scanDirectory(searchPath);
      plugins.push(...discoveredPlugins);
    }
    
    return this.deduplicatePlugins(plugins);
  }

  private async scanDirectory(directory: string): Promise<PluginDescriptor[]> {
    const plugins: PluginDescriptor[] = [];
    
    if (!existsSync(directory)) return plugins;
    
    const entries = readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginConfigPath = path.join(
          directory, 
          entry.name, 
          'bcce.plugin.json'
        );
        
        if (existsSync(pluginConfigPath)) {
          const config = JSON.parse(readFileSync(pluginConfigPath, 'utf-8'));
          plugins.push({
            name: config.name,
            version: config.version,
            path: path.join(directory, entry.name),
            config
          });
        }
      }
    }
    
    return plugins;
  }
}
```

### 2. Plugin Lifecycle Management

```typescript
export class PluginLifecycleManager {
  private loadedPlugins = new Map<string, LoadedPlugin>();
  private healthChecker = new PluginHealthChecker();

  async loadPlugin(descriptor: PluginDescriptor): Promise<void> {
    // Version compatibility check
    if (!this.isVersionCompatible(descriptor.config)) {
      throw new Error(
        `Plugin ${descriptor.name} requires BCCE ${descriptor.config.bcceVersion}`
      );
    }

    // Load and initialize plugin
    const pluginModule = await import(descriptor.path);
    const plugin = new pluginModule.default();
    
    await plugin.initialize(this.createPluginContext(descriptor));
    
    this.loadedPlugins.set(descriptor.name, {
      descriptor,
      instance: plugin,
      loadTime: Date.now(),
      status: 'active'
    });

    // Start health monitoring
    this.healthChecker.monitor(descriptor.name, plugin);
  }

  async unloadPlugin(pluginName: string): Promise<void> {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin) return;

    // Stop health monitoring
    this.healthChecker.stopMonitoring(pluginName);
    
    // Call cleanup if available
    if ('cleanup' in loadedPlugin.instance) {
      await loadedPlugin.instance.cleanup();
    }
    
    this.loadedPlugins.delete(pluginName);
  }

  async reloadPlugin(pluginName: string): Promise<void> {
    const descriptor = this.loadedPlugins.get(pluginName)?.descriptor;
    if (!descriptor) return;
    
    await this.unloadPlugin(pluginName);
    await this.loadPlugin(descriptor);
  }
}
```

## Security Framework

### 1. Plugin Sandboxing

```typescript
export class PluginSandbox {
  private readonly seccomp: SeccompProfile;
  private readonly resourceLimits: ResourceLimits;

  constructor(permissions: Permission[]) {
    this.seccomp = this.buildSeccompProfile(permissions);
    this.resourceLimits = this.buildResourceLimits(permissions);
  }

  async executeInSandbox<T>(
    operation: () => Promise<T>,
    timeout: number = 30000
  ): Promise<T> {
    
    // Create isolated execution context
    const context = vm.createContext({
      require: this.createSafeRequire(),
      console: this.createSafeConsole(),
      process: this.createSafeProcess()
    });

    // Apply resource limits
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    try {
      // Execute with resource monitoring
      const result = await this.executeWithLimits(
        operation, 
        this.resourceLimits,
        controller.signal
      );
      
      return result;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private createSafeRequire(): NodeRequire {
    const allowedModules = new Set([
      'util', 'crypto', 'path', 'url',
      // Add more safe modules as needed
    ]);

    return (id: string) => {
      if (!allowedModules.has(id)) {
        throw new Error(`Module '${id}' is not allowed in plugin context`);
      }
      return require(id);
    };
  }
}
```

### 2. Permission System

```typescript
export interface Permission {
  resource: 'filesystem' | 'network' | 'process' | 'env';
  action: 'read' | 'write' | 'execute';
  scope?: string; // Path, URL pattern, etc.
}

export class PermissionChecker {
  constructor(private grantedPermissions: Permission[]) {}

  checkPermission(requiredPermission: Permission): boolean {
    return this.grantedPermissions.some(granted => 
      this.isPermissionGranted(granted, requiredPermission)
    );
  }

  private isPermissionGranted(
    granted: Permission, 
    required: Permission
  ): boolean {
    // Resource must match
    if (granted.resource !== required.resource) return false;
    
    // Action must match or be broader
    if (granted.action !== required.action && granted.action !== '*') return false;
    
    // Scope must match if specified
    if (required.scope && granted.scope) {
      return this.matchScope(granted.scope, required.scope);
    }
    
    return true;
  }

  private matchScope(grantedScope: string, requiredScope: string): boolean {
    // Support glob patterns in granted scope
    if (grantedScope.includes('*')) {
      const pattern = new RegExp(
        grantedScope.replace(/\*/g, '.*').replace(/\?/g, '.')
      );
      return pattern.test(requiredScope);
    }
    
    return grantedScope === requiredScope;
  }
}
```

## Best Practices

### 1. Error Handling and Recovery

```typescript
export class ResilientStepExecutor implements StepExecutor {
  constructor(
    private baseExecutor: StepExecutor,
    private retryPolicy: RetryPolicy,
    private fallbackExecutor?: StepExecutor
  ) {}

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    let lastError: Error | undefined;
    
    // Retry with exponential backoff
    for (let attempt = 0; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      try {
        return await this.baseExecutor.execute(step, context);
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryPolicy.maxAttempts) break;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) break;
        
        // Wait before retry
        const delay = this.retryPolicy.baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    
    // Try fallback if available
    if (this.fallbackExecutor) {
      try {
        context.logger.warn(`Primary executor failed, trying fallback`, { 
          step: step.id, 
          error: lastError?.message 
        });
        
        return await this.fallbackExecutor.execute(step, context);
      } catch (fallbackError) {
        context.logger.error(`Both primary and fallback executors failed`, {
          step: step.id,
          primaryError: lastError?.message,
          fallbackError: fallbackError.message
        });
      }
    }
    
    throw lastError || new Error('Execution failed after all retry attempts');
  }
}
```

### 2. Monitoring and Observability

```typescript
export class ObservableStepExecutor implements StepExecutor {
  constructor(
    private baseExecutor: StepExecutor,
    private metricsCollector: MetricsCollector,
    private eventBus: EventBus
  ) {}

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    // Emit start event
    await this.eventBus.publish({
      type: 'step.started',
      timestamp: new Date(),
      source: 'step-executor',
      data: { 
        stepId: step.id, 
        stepType: step.type, 
        executionId,
        workflowId: context.workflowId 
      }
    });
    
    try {
      const result = await this.baseExecutor.execute(step, context);
      const duration = Date.now() - startTime;
      
      // Record metrics
      this.metricsCollector.recordGauge('step.execution.duration', duration, {
        stepType: step.type,
        status: result.status
      });
      
      this.metricsCollector.recordCounter('step.execution.completed', 1, {
        stepType: step.type
      });
      
      // Emit completion event
      await this.eventBus.publish({
        type: 'step.completed',
        timestamp: new Date(),
        source: 'step-executor',
        data: { 
          stepId: step.id, 
          stepType: step.type, 
          executionId,
          workflowId: context.workflowId,
          duration,
          result: result.status 
        }
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record error metrics
      this.metricsCollector.recordCounter('step.execution.failed', 1, {
        stepType: step.type,
        errorType: error.constructor.name
      });
      
      // Emit failure event
      await this.eventBus.publish({
        type: 'step.failed',
        timestamp: new Date(),
        source: 'step-executor',
        data: { 
          stepId: step.id, 
          stepType: step.type, 
          executionId,
          workflowId: context.workflowId,
          duration,
          error: error.message 
        }
      });
      
      throw error;
    }
  }
}
```

### 3. Testing Plugins

```typescript
// Test utilities for plugin development
export class PluginTestHarness {
  private mockContext: PluginContext;
  private mockEventBus: EventBus;
  
  constructor() {
    this.mockContext = this.createMockContext();
    this.mockEventBus = new MockEventBus();
  }

  async testStepExecutor(
    executor: StepExecutor,
    step: WorkflowStep,
    expectedResult: Partial<StepResult>
  ): Promise<void> {
    const context = this.createExecutionContext();
    const result = await executor.execute(step, context);
    
    // Assert result properties
    expect(result.status).toBe(expectedResult.status);
    if (expectedResult.output) {
      expect(result.output).toContain(expectedResult.output);
    }
    
    // Verify events were emitted
    const events = this.mockEventBus.getEmittedEvents();
    expect(events).toHaveLength(2); // start and complete/fail
  }

  createMockStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
    return {
      id: 'test-step',
      type: 'test',
      policy: {
        timeout_seconds: 30,
        max_files: 10,
        max_edits: 5,
        allowed_paths: ['**/*'],
        cmd_allowlist: []
      },
      ...overrides
    };
  }
}

// Example plugin test
describe('CustomStepExecutor', () => {
  let harness: PluginTestHarness;
  let executor: CustomStepExecutor;

  beforeEach(() => {
    harness = new PluginTestHarness();
    executor = new CustomStepExecutor(harness.mockContext, testConfig);
  });

  it('should execute custom operation successfully', async () => {
    const step = harness.createMockStep({
      type: 'custom:operation',
      parameters: {
        endpoint: 'https://api.example.com',
        operation: 'getData'
      }
    });

    await harness.testStepExecutor(executor, step, {
      status: 'completed',
      output: 'Operation completed successfully'
    });
  });
});
```

## Configuration Reference

### Plugin Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BCCE Plugin Configuration",
  "type": "object",
  "required": ["name", "version", "type", "entryPoint"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "Plugin name (lowercase, hyphens allowed)"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$",
      "description": "Semantic version"
    },
    "description": {
      "type": "string",
      "maxLength": 500,
      "description": "Plugin description"
    },
    "author": {
      "type": "string",
      "description": "Plugin author"
    },
    "bcceVersion": {
      "type": "string",
      "description": "Minimum BCCE version required"
    },
    "apiVersion": {
      "type": "string",
      "enum": ["v1"],
      "description": "BCCE API version"
    },
    "type": {
      "type": "string",
      "enum": ["step", "integration", "storage", "auth"],
      "description": "Plugin type"
    },
    "entryPoint": {
      "type": "string",
      "description": "Main plugin file path"
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "filesystem:read",
          "filesystem:write", 
          "network:http",
          "network:https",
          "env:read",
          "process:spawn"
        ]
      },
      "description": "Required permissions"
    },
    "configuration": {
      "type": "object",
      "properties": {
        "schema": {
          "type": "string",
          "description": "Path to configuration schema"
        },
        "required": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Required configuration properties"
        }
      }
    }
  }
}
```

This extensibility architecture transforms BCCE into a true enterprise platform where organizations can customize every aspect of their workflow automation while maintaining security, observability, and maintainability.