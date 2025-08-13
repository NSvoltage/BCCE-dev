# BCCE Plugin Development Guide

> **Complete guide for developing, testing, and distributing BCCE plugins**

## Quick Start: Build Your First Plugin

### 1. Plugin Setup (5 minutes)

```bash
# Create plugin project
mkdir bcce-plugin-my-service
cd bcce-plugin-my-service

# Initialize with template
npx create-bcce-plugin@latest \
  --name="My Service Integration" \
  --type="step" \
  --author="Your Organization"

# Install dependencies
npm install
```

### 2. Basic Plugin Structure

```
bcce-plugin-my-service/
├── src/
│   ├── index.ts                 # Plugin entry point
│   ├── executors/
│   │   └── my-service-executor.ts
│   ├── schemas/
│   │   └── my-service.schema.json
│   └── __tests__/
│       └── my-service.test.ts
├── package.json
├── bcce.plugin.json            # Plugin metadata
├── tsconfig.json
└── README.md
```

### 3. Plugin Implementation

**src/index.ts:**
```typescript
import { StepPlugin, PluginContext } from '@bcce/plugin-sdk';
import { MyServiceExecutor } from './executors/my-service-executor';

export default class MyServicePlugin implements StepPlugin {
  readonly name = 'my-service-integration';
  readonly version = '1.0.0';
  readonly supportedTypes = ['myservice:deploy', 'myservice:status'];

  async initialize(context: PluginContext): Promise<void> {
    context.logger.info('MyService plugin initializing...');
    
    // Plugin initialization logic
    await this.validateConfiguration(context.config);
    
    context.logger.info('MyService plugin initialized successfully');
  }

  createExecutor(stepType: string): StepExecutor | null {
    switch (stepType) {
      case 'myservice:deploy':
        return new MyServiceDeployExecutor(this.context);
      case 'myservice:status':
        return new MyServiceStatusExecutor(this.context);
      default:
        return null;
    }
  }

  validateStep(step: WorkflowStep): ValidationResult {
    // Custom validation logic
    return { valid: true };
  }

  getSchema(stepType: string): JSONSchema7 {
    const schemas = require('../schemas/my-service.schema.json');
    return schemas[stepType] || {};
  }

  private async validateConfiguration(config: any): Promise<void> {
    if (!config.apiKey) {
      throw new Error('MyService API key is required');
    }
    
    if (!config.endpoint) {
      throw new Error('MyService endpoint is required');
    }
  }
}
```

## Plugin Types and Examples

### 1. Step Type Plugin

Creates new workflow step types for custom operations.

```typescript
// src/executors/http-api-executor.ts
export class HttpApiExecutor extends BaseStepExecutor {
  readonly name = 'http-api';
  readonly version = '1.0.0';
  readonly supportedTypes = ['http:get', 'http:post'];

  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const httpStep = step as HttpApiStep;
    
    const startTime = Date.now();
    
    try {
      // Make HTTP request
      const response = await fetch(httpStep.url, {
        method: httpStep.type.split(':')[1].toUpperCase(),
        headers: httpStep.headers || {},
        body: httpStep.body ? JSON.stringify(httpStep.body) : undefined,
        signal: AbortSignal.timeout((httpStep.timeout || 30) * 1000)
      });

      const responseData = await response.json();
      
      return {
        status: response.ok ? 'completed' : 'failed',
        output: `HTTP ${response.status}: ${response.statusText}`,
        artifacts: [
          { 
            name: 'response.json', 
            content: JSON.stringify(responseData, null, 2) 
          }
        ],
        metrics: {
          httpStatus: response.status,
          responseTime: Date.now() - startTime,
          responseSize: JSON.stringify(responseData).length
        }
      };
      
    } catch (error) {
      return {
        status: 'failed',
        error: error as Error,
        output: error.message,
        metrics: {
          responseTime: Date.now() - startTime
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
          minimum: 1,
          maximum: 300,
          default: 30,
          description: 'Timeout in seconds'
        }
      },
      required: ['url']
    };

    if (stepType === 'http:post') {
      baseSchema.properties.body = {
        description: 'Request body',
        oneOf: [
          { type: 'string' },
          { type: 'object' }
        ]
      };
    }

    return baseSchema;
  }
}
```

**Usage in workflows:**
```yaml
steps:
  - id: call_api
    type: http:post
    url: "https://api.myservice.com/deploy"
    headers:
      Authorization: "Bearer ${API_TOKEN}"
      Content-Type: "application/json"
    body:
      environment: "production"
      version: "${BUILD_VERSION}"
    timeout: 60
```

### 2. Integration Plugin

Connects BCCE to external systems for notifications, approvals, etc.

```typescript
// src/integrations/slack-integration.ts
export class SlackIntegrationPlugin implements IntegrationPlugin {
  readonly name = 'slack-notifications';
  readonly version = '1.0.0';
  readonly integrationTypes = ['notification:slack', 'approval:slack'];

  async initialize(context: PluginContext): Promise<void> {
    // Validate Slack configuration
    if (!context.config.webhookUrl && !context.config.botToken) {
      throw new Error('Slack webhook URL or bot token is required');
    }
  }

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

class SlackNotificationIntegration implements Integration {
  constructor(private config: SlackConfig) {}

  async notify(message: NotificationMessage): Promise<void> {
    const slackMessage = {
      channel: this.config.channel,
      text: message.title,
      attachments: [{
        color: this.getColorForSeverity(message.severity),
        fields: [
          { title: 'Workflow', value: message.workflowName, short: true },
          { title: 'Status', value: message.status, short: true },
          { title: 'Duration', value: message.duration, short: true }
        ],
        footer: 'BCCE Workflow Automation',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });
  }

  private getColorForSeverity(severity: string): string {
    switch (severity) {
      case 'success': return 'good';
      case 'warning': return 'warning';
      case 'error': return 'danger';
      default: return '#439FE0';
    }
  }
}
```

**Configuration:**
```yaml
# workflow.yml
integrations:
  - type: notification:slack
    webhook_url: "${SLACK_WEBHOOK_URL}"
    channel: "#deployments"
    events: ["workflow.completed", "workflow.failed"]
    
  - type: approval:slack
    bot_token: "${SLACK_BOT_TOKEN}"
    channel: "#approvals"
    approvers: ["@john.doe", "@jane.smith"]
```

### 3. Storage Backend Plugin

Custom artifact storage implementations.

```typescript
// src/storage/s3-storage.ts
export class S3StoragePlugin implements StorageBackend {
  readonly name = 's3-storage';
  private s3Client!: S3Client;
  private bucketName!: string;

  async initialize(config: S3StorageConfig): Promise<void> {
    this.s3Client = new S3Client({
      region: config.region,
      credentials: config.credentials
    });
    this.bucketName = config.bucket;

    // Verify bucket access
    try {
      await this.s3Client.send(new HeadBucketCommand({ 
        Bucket: this.bucketName 
      }));
    } catch (error) {
      throw new Error(`Cannot access S3 bucket ${this.bucketName}: ${error.message}`);
    }
  }

  async store(key: string, data: Buffer): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'bcce-version': process.env.BCCE_VERSION || 'unknown',
        'upload-time': new Date().toISOString()
      }
    });

    await this.s3Client.send(command);
  }

  async retrieve(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    const response = await this.s3Client.send(command);
    
    if (!response.Body) {
      throw new Error(`Object not found: ${key}`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    await this.s3Client.send(command);
  }

  async list(prefix: string): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix
    });

    const response = await this.s3Client.send(command);
    return response.Contents?.map(obj => obj.Key!) || [];
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') return false;
      throw error;
    }
  }
}
```

## Advanced Plugin Patterns

### 1. Composite Step Plugin

Combines multiple operations into a single step type.

```typescript
export class DeploymentPipelineExecutor extends BaseStepExecutor {
  readonly name = 'deployment-pipeline';
  readonly version = '1.0.0';
  readonly supportedTypes = ['deploy:full-pipeline'];

  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const pipelineStep = step as DeploymentPipelineStep;
    const results: StepResult[] = [];

    // Define pipeline stages
    const stages = [
      { name: 'build', executor: this.buildStage },
      { name: 'test', executor: this.testStage },
      { name: 'deploy', executor: this.deployStage },
      { name: 'verify', executor: this.verifyStage }
    ];

    for (const stage of stages) {
      context.logger.info(`Executing pipeline stage: ${stage.name}`);
      
      try {
        const stageResult = await stage.executor.call(this, pipelineStep, context);
        results.push(stageResult);

        if (stageResult.status === 'failed') {
          // Handle failure based on pipeline configuration
          if (pipelineStep.continueOnFailure?.[stage.name]) {
            context.logger.warn(`Stage ${stage.name} failed but continuing`);
            continue;
          } else {
            return this.aggregateResults(results, 'failed');
          }
        }
      } catch (error) {
        return {
          status: 'failed',
          error: error as Error,
          output: `Pipeline failed at stage: ${stage.name}`,
          artifacts: this.aggregateArtifacts(results)
        };
      }
    }

    return this.aggregateResults(results, 'completed');
  }

  private async buildStage(
    step: DeploymentPipelineStep, 
    context: ExecutionContext
  ): Promise<StepResult> {
    // Build stage implementation
    const buildCommand = step.build?.command || 'npm run build';
    // Execute build command...
    return { status: 'completed', output: 'Build completed' };
  }

  private async testStage(
    step: DeploymentPipelineStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Test stage implementation
    const testCommand = step.test?.command || 'npm test';
    // Execute tests...
    return { status: 'completed', output: 'Tests passed' };
  }

  private async deployStage(
    step: DeploymentPipelineStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Deployment stage implementation
    // Deploy to specified environment...
    return { status: 'completed', output: 'Deployment successful' };
  }

  private async verifyStage(
    step: DeploymentPipelineStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Verification stage implementation
    // Health checks, smoke tests...
    return { status: 'completed', output: 'Verification passed' };
  }
}
```

### 2. Conditional Execution Plugin

Implements conditional logic within workflows.

```typescript
export class ConditionalStepExecutor extends BaseStepExecutor {
  readonly name = 'conditional-logic';
  readonly version = '1.0.0';
  readonly supportedTypes = ['conditional:if', 'conditional:switch'];

  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    if (step.type === 'conditional:if') {
      return this.executeIfCondition(step as ConditionalIfStep, context);
    } else if (step.type === 'conditional:switch') {
      return this.executeSwitchCondition(step as ConditionalSwitchStep, context);
    }
    
    throw new Error(`Unsupported conditional step type: ${step.type}`);
  }

  private async executeIfCondition(
    step: ConditionalIfStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Evaluate condition
    const conditionResult = await this.evaluateExpression(
      step.condition, 
      context
    );

    context.logger.info(`Condition evaluation result: ${conditionResult}`);

    if (conditionResult) {
      return this.executeNestedStep(step.then, context);
    } else if (step.else) {
      return this.executeNestedStep(step.else, context);
    } else {
      return {
        status: 'skipped',
        output: 'Condition not met, no else branch defined'
      };
    }
  }

  private async executeSwitchCondition(
    step: ConditionalSwitchStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const switchValue = await this.evaluateExpression(step.switch, context);
    
    // Find matching case
    const matchingCase = step.cases.find(c => 
      c.value === switchValue || 
      (Array.isArray(c.value) && c.value.includes(switchValue))
    );

    if (matchingCase) {
      return this.executeNestedStep(matchingCase.steps, context);
    } else if (step.default) {
      return this.executeNestedStep(step.default, context);
    } else {
      return {
        status: 'skipped',
        output: `No matching case for value: ${switchValue}`
      };
    }
  }

  private async evaluateExpression(
    expression: string,
    context: ExecutionContext
  ): Promise<any> {
    // Simple expression evaluator - in production, use a proper expression engine
    const evaluationContext = {
      env: context.environment,
      previous: context.previousStepResults,
      workflow: context.config
    };

    // Replace variables in expression
    let evaluatedExpression = expression;
    
    // Replace environment variables
    evaluatedExpression = evaluatedExpression.replace(
      /\$\{env\.([^}]+)\}/g, 
      (_, varName) => evaluationContext.env[varName] || ''
    );
    
    // Replace previous step results
    evaluatedExpression = evaluatedExpression.replace(
      /\$\{previous\.([^.}]+)\.([^}]+)\}/g,
      (_, stepId, property) => {
        const stepResult = evaluationContext.previous.get(stepId);
        return stepResult?.[property] || '';
      }
    );

    // Evaluate simple boolean expressions
    return this.evaluateBooleanExpression(evaluatedExpression);
  }

  private evaluateBooleanExpression(expr: string): boolean {
    // Simple boolean expression evaluator
    // In production, use a proper expression parser
    try {
      // Remove dangerous functions and only allow safe operations
      const safeExpr = expr.replace(/[^a-zA-Z0-9\s\(\)===!==<><=>=&&||\+\-\*\/\._'"]/g, '');
      return Boolean(eval(safeExpr));
    } catch {
      return false;
    }
  }
}
```

## Plugin Configuration

### Plugin Metadata (bcce.plugin.json)

```json
{
  "name": "my-service-plugin",
  "version": "1.2.0",
  "description": "Integration with MyService API for deployments and monitoring",
  "author": "My Organization <devops@myorg.com>",
  "homepage": "https://github.com/myorg/bcce-plugin-myservice",
  "repository": {
    "type": "git",
    "url": "https://github.com/myorg/bcce-plugin-myservice.git"
  },
  "keywords": ["bcce", "deployment", "myservice", "devops"],
  "license": "MIT",
  
  "bcce": {
    "version": ">=2.0.0",
    "apiVersion": "v1"
  },
  
  "type": "step",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  
  "permissions": [
    "network:https",
    "filesystem:read", 
    "env:read"
  ],
  
  "configuration": {
    "schema": "./schemas/config.json",
    "required": ["apiKey", "endpoint"],
    "properties": {
      "apiKey": {
        "type": "string",
        "description": "MyService API key",
        "secret": true
      },
      "endpoint": {
        "type": "string",
        "format": "uri",
        "description": "MyService API endpoint"
      },
      "timeout": {
        "type": "number",
        "minimum": 1000,
        "maximum": 300000,
        "default": 30000,
        "description": "Request timeout in milliseconds"
      }
    }
  },
  
  "healthCheck": {
    "enabled": true,
    "interval": 60000,
    "timeout": 10000,
    "endpoint": "/health"
  }
}
```

### Environment Configuration

```bash
# Plugin-specific configuration
BCCE_PLUGIN_MYSERVICE_API_KEY=your-api-key-here
BCCE_PLUGIN_MYSERVICE_ENDPOINT=https://api.myservice.com
BCCE_PLUGIN_MYSERVICE_TIMEOUT=60000

# Plugin discovery paths
BCCE_PLUGIN_PATH=/opt/bcce/plugins:/usr/local/bcce/plugins

# Plugin security settings
BCCE_PLUGIN_SANDBOX_ENABLED=true
BCCE_PLUGIN_TIMEOUT=300000
BCCE_PLUGIN_MEMORY_LIMIT=256MB
```

## Testing Your Plugin

### Unit Tests

```typescript
// src/__tests__/my-service-executor.test.ts
import { MyServiceExecutor } from '../executors/my-service-executor';
import { PluginTestHarness } from '@bcce/plugin-test-utils';

describe('MyServiceExecutor', () => {
  let harness: PluginTestHarness;
  let executor: MyServiceExecutor;

  beforeEach(() => {
    harness = new PluginTestHarness();
    executor = new MyServiceExecutor(harness.mockContext);
  });

  describe('deployment step', () => {
    it('should deploy successfully with valid parameters', async () => {
      const step = harness.createMockStep({
        type: 'myservice:deploy',
        parameters: {
          environment: 'staging',
          version: '1.2.3',
          healthcheck: true
        }
      });

      const result = await executor.execute(step, harness.createExecutionContext());

      expect(result.status).toBe('completed');
      expect(result.output).toContain('Deployment successful');
      expect(result.artifacts).toHaveLength(2); // deployment-info.json, health-check.json
    });

    it('should fail with invalid environment', async () => {
      const step = harness.createMockStep({
        type: 'myservice:deploy',
        parameters: {
          environment: 'invalid-env',
          version: '1.2.3'
        }
      });

      await expect(executor.execute(step, harness.createExecutionContext()))
        .rejects.toThrow('Invalid environment: invalid-env');
    });
  });

  describe('status check step', () => {
    it('should check service status', async () => {
      // Mock HTTP response
      harness.mockHttpResponse('https://api.myservice.com/status', {
        status: 'healthy',
        version: '1.2.3',
        uptime: 3600
      });

      const step = harness.createMockStep({
        type: 'myservice:status',
        parameters: {
          service: 'web-api'
        }
      });

      const result = await executor.execute(step, harness.createExecutionContext());

      expect(result.status).toBe('completed');
      expect(result.output).toContain('Service is healthy');
    });
  });

  describe('parameter validation', () => {
    it('should validate required parameters', () => {
      const step = harness.createMockStep({
        type: 'myservice:deploy',
        parameters: {} // Missing required parameters
      });

      const validation = executor.validate(step);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        expect.objectContaining({
          field: 'environment',
          message: 'environment is required'
        })
      );
    });

    it('should validate parameter types', () => {
      const step = harness.createMockStep({
        type: 'myservice:deploy',
        parameters: {
          environment: 'production',
          version: 123, // Should be string
          healthcheck: 'yes' // Should be boolean
        }
      });

      const validation = executor.validate(step);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBe(2);
    });
  });
});
```

### Integration Tests

```typescript
// src/__tests__/integration.test.ts
import { PluginManager } from '@bcce/core';
import { WorkflowRunner } from '@bcce/core';
import MyServicePlugin from '../index';

describe('MyService Plugin Integration', () => {
  let pluginManager: PluginManager;
  let workflowRunner: WorkflowRunner;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    await pluginManager.loadPlugin(new MyServicePlugin());
    
    workflowRunner = new WorkflowRunner(pluginManager);
  });

  it('should execute deployment workflow end-to-end', async () => {
    const workflow = {
      version: 1,
      workflow: 'MyService Deployment',
      steps: [
        {
          id: 'deploy_staging',
          type: 'myservice:deploy',
          parameters: {
            environment: 'staging',
            version: '${BUILD_VERSION}',
            healthcheck: true
          }
        },
        {
          id: 'run_tests',
          type: 'cmd',
          command: 'npm run integration-tests'
        },
        {
          id: 'deploy_production',
          type: 'myservice:deploy',
          parameters: {
            environment: 'production',
            version: '${BUILD_VERSION}',
            healthcheck: true
          }
        }
      ]
    };

    const result = await workflowRunner.execute(workflow, {
      environment: {
        BUILD_VERSION: '1.2.3'
      }
    });

    expect(result.status).toBe('completed');
    expect(result.stepResults).toHaveLength(3);
    expect(result.stepResults.every(r => r.status === 'completed')).toBe(true);
  });
});
```

## Plugin Distribution

### 1. NPM Package

**package.json:**
```json
{
  "name": "@myorg/bcce-plugin-myservice",
  "version": "1.2.0",
  "description": "BCCE plugin for MyService integration",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/**/*",
    "schemas/**/*",
    "bcce.plugin.json",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "prepublish": "npm run build && npm run test"
  },
  "keywords": [
    "bcce",
    "plugin",
    "myservice",
    "deployment",
    "devops"
  ],
  "peerDependencies": {
    "@bcce/plugin-sdk": "^2.0.0"
  },
  "devDependencies": {
    "@bcce/plugin-test-utils": "^2.0.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 2. Plugin Installation

```bash
# Install from NPM
npm install -g @myorg/bcce-plugin-myservice

# Install from Git repository
bcce plugin install https://github.com/myorg/bcce-plugin-myservice.git

# Install from local path
bcce plugin install ./my-plugin

# List installed plugins
bcce plugin list

# Enable/disable plugins
bcce plugin enable myservice-integration
bcce plugin disable myservice-integration
```

### 3. Plugin Registry

```typescript
// Corporate plugin registry
export class CorporatePluginRegistry {
  private registryUrl = 'https://plugins.corp.com/bcce';
  
  async searchPlugins(query: string): Promise<PluginInfo[]> {
    const response = await fetch(`${this.registryUrl}/search?q=${query}`);
    return response.json();
  }
  
  async getPlugin(name: string, version?: string): Promise<PluginPackage> {
    const url = version ? 
      `${this.registryUrl}/${name}/${version}` : 
      `${this.registryUrl}/${name}/latest`;
    
    const response = await fetch(url);
    return response.json();
  }
  
  async publishPlugin(plugin: PluginPackage): Promise<void> {
    await fetch(`${this.registryUrl}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plugin)
    });
  }
}
```

## Best Practices

### 1. Error Handling

```typescript
export class RobustStepExecutor extends BaseStepExecutor {
  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    try {
      return await this.performOperation(step, context);
    } catch (error) {
      // Categorize errors
      if (error instanceof ValidationError) {
        return {
          status: 'failed',
          error,
          output: `Validation error: ${error.message}`,
          artifacts: [
            { name: 'validation-errors.json', content: JSON.stringify(error.details) }
          ]
        };
      }
      
      if (error instanceof NetworkError) {
        return {
          status: 'failed',
          error,
          output: `Network error: ${error.message}`,
          artifacts: [
            { name: 'network-diagnostics.json', content: JSON.stringify(error.diagnostics) }
          ]
        };
      }
      
      // Unknown error - include context for debugging
      return {
        status: 'failed',
        error,
        output: `Unexpected error: ${error.message}`,
        artifacts: [
          { 
            name: 'error-context.json', 
            content: JSON.stringify({
              step: step.id,
              type: step.type,
              parameters: step.parameters,
              timestamp: new Date().toISOString(),
              stack: error.stack
            }) 
          }
        ]
      };
    }
  }
}
```

### 2. Resource Management

```typescript
export class ResourceManagedExecutor extends BaseStepExecutor {
  private resources: Resource[] = [];
  
  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    try {
      // Acquire resources
      const database = await this.acquireResource('database');
      const apiClient = await this.acquireResource('api-client');
      
      // Perform operation
      return await this.performOperationWithResources(step, { database, apiClient });
      
    } finally {
      // Always cleanup resources
      await this.releaseAllResources();
    }
  }
  
  private async acquireResource(type: string): Promise<Resource> {
    const resource = await ResourceFactory.create(type);
    this.resources.push(resource);
    return resource;
  }
  
  private async releaseAllResources(): Promise<void> {
    for (const resource of this.resources) {
      try {
        await resource.release();
      } catch (error) {
        this.context.logger.warn('Failed to release resource', { error });
      }
    }
    this.resources = [];
  }
}
```

### 3. Security Considerations

```typescript
export class SecureStepExecutor extends BaseStepExecutor {
  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Validate permissions
    await this.checkPermissions(step, context);
    
    // Sanitize inputs
    const sanitizedStep = this.sanitizeStep(step);
    
    // Execute in sandbox if required
    if (this.requiresSandbox(step)) {
      return this.executeInSandbox(sanitizedStep, context);
    }
    
    return this.performSecureOperation(sanitizedStep, context);
  }
  
  private async checkPermissions(
    step: WorkflowStep, 
    context: ExecutionContext
  ): Promise<void> {
    const requiredPermissions = this.getRequiredPermissions(step);
    
    for (const permission of requiredPermissions) {
      if (!context.permissions.has(permission)) {
        throw new SecurityError(
          `Permission denied: ${permission} required for step ${step.id}`
        );
      }
    }
  }
  
  private sanitizeStep(step: WorkflowStep): WorkflowStep {
    // Remove potentially dangerous parameters
    const sanitized = { ...step };
    
    if (sanitized.parameters) {
      // Remove script injections
      for (const [key, value] of Object.entries(sanitized.parameters)) {
        if (typeof value === 'string') {
          sanitized.parameters[key] = this.sanitizeString(value);
        }
      }
    }
    
    return sanitized;
  }
  
  private sanitizeString(input: string): string {
    // Remove potentially dangerous characters and patterns
    return input
      .replace(/[<>'"&]/g, '') // HTML/XML injection
      .replace(/(\$\(|\`)/g, '') // Command injection
      .replace(/javascript:/gi, '') // JavaScript injection
      .trim();
  }
}
```

This comprehensive plugin development guide provides everything needed to create, test, and distribute production-ready BCCE plugins that integrate seamlessly with enterprise workflows.