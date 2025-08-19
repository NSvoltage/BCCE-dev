/**
 * Unit Tests for AWS Integrations
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CloudWatchIntegration } from '../../src/lib/aws/cloudwatch-integration';
import { createS3Storage } from '../../src/lib/aws/s3-storage';
import { EventBridgeOrchestrator } from '../../src/lib/aws/eventbridge-orchestrator';
import { IAMIntegration } from '../../src/lib/aws/iam-integration';

describe('CloudWatchIntegration', () => {
  let cloudWatch: CloudWatchIntegration;

  beforeEach(() => {
    cloudWatch = new CloudWatchIntegration();
    cloudWatch.enableMockMode();
  });

  describe('Metrics Publishing', () => {
    test('should publish cost metrics correctly', async () => {
      const costMetrics = {
        tokenUsage: { inputTokens: 1000, outputTokens: 500 },
        totalCost: 0.05,
        model: 'claude-3-haiku',
        metadata: { team: 'test', workflowId: 'test-workflow' }
      };

      await expect(cloudWatch.publishCostMetrics(costMetrics))
        .resolves.not.toThrow();
    });

    test('should publish tool metrics correctly', async () => {
      const toolMetrics = {
        tool: 'claude-code',
        timestamp: new Date(),
        usage: { activeTime: 60000, tokensProcessed: 1000, requestCount: 5 },
        productivity: { linesGenerated: 100, linesModified: 20, filesAffected: 3 },
        cost: { estimatedCost: 0.02 },
        context: { user: 'test', language: 'typescript' }
      };

      await expect(cloudWatch.publishToolMetrics(toolMetrics))
        .resolves.not.toThrow();
    });

    test('should publish workflow metrics correctly', async () => {
      await expect(cloudWatch.publishWorkflowMetrics(
        'test-workflow',
        'completed',
        5000,
        { team: 'test' }
      )).resolves.not.toThrow();
    });
  });

  describe('Alarms Creation', () => {
    test('should create cost threshold alarm', async () => {
      const alarms = await cloudWatch.createAlarms({
        costThreshold: 100,
        snsTopicArn: 'arn:aws:sns:us-east-1:123456789012:alerts'
      });

      expect(alarms).toContainEqual(
        expect.objectContaining({
          alarmName: 'BCCE-High-Cost-Alert',
          threshold: 100
        })
      );
    });

    test('should create token usage alarm', async () => {
      const alarms = await cloudWatch.createAlarms({
        tokenThreshold: 10000
      });

      expect(alarms).toContainEqual(
        expect.objectContaining({
          alarmName: 'BCCE-High-Token-Usage-Alert',
          threshold: 10000
        })
      );
    });
  });

  describe('Dashboard Creation', () => {
    test('should create dashboard with standard widgets', async () => {
      const dashboard = await cloudWatch.createDashboard('Test-Dashboard');

      expect(dashboard.name).toBe('Test-Dashboard');
      expect(dashboard.widgets.length).toBeGreaterThan(0);
      expect(dashboard.widgets).toContainEqual(
        expect.objectContaining({
          title: 'Cost Trends',
          type: 'metric'
        })
      );
    });
  });

  describe('Metrics Query', () => {
    test('should query metric statistics', async () => {
      const stats = await cloudWatch.getMetricStatistics(
        'Cost',
        new Date(Date.now() - 3600000),
        new Date(),
        300,
        'Sum'
      );

      expect(Array.isArray(stats)).toBe(true);
      if (stats.length > 0) {
        expect(stats[0]).toHaveProperty('timestamp');
        expect(stats[0]).toHaveProperty('value');
      }
    });
  });
});

describe('S3Storage', () => {
  let s3Storage: any;

  beforeEach(() => {
    s3Storage = createS3Storage({
      bucketName: 'test-bucket',
      enableVersioning: true,
      enableEncryption: true
    });
    s3Storage.enableMockMode();
  });

  describe('Artifact Storage', () => {
    test('should store artifact correctly', async () => {
      // Create a test file
      const fs = require('fs');
      const testFile = '/tmp/test-artifact.json';
      fs.writeFileSync(testFile, JSON.stringify({ test: 'data' }));

      const s3Key = await s3Storage.storeArtifact(testFile, {
        workflowId: 'test-workflow',
        type: 'workflow',
        contentType: 'application/json'
      });

      expect(s3Key).toContain('test-workflow');
      expect(s3Key).toContain('workflow');

      // Cleanup
      fs.unlinkSync(testFile);
    });

    test('should retrieve artifact correctly', async () => {
      // First store an artifact
      const fs = require('fs');
      const testFile = '/tmp/test-artifact.json';
      const testData = { test: 'data', timestamp: Date.now() };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      const s3Key = await s3Storage.storeArtifact(testFile, {
        workflowId: 'test-workflow',
        type: 'workflow',
        contentType: 'application/json'
      });

      // Extract artifact ID from the key
      const artifactId = s3Key.split('/').pop();
      
      // Now retrieve it
      const retrieved = await s3Storage.retrieveArtifact(artifactId);
      
      expect(Buffer.isBuffer(retrieved)).toBe(true);

      // Cleanup
      fs.unlinkSync(testFile);
    });
  });

  describe('Lifecycle Management', () => {
    test('should configure lifecycle rules', async () => {
      await expect(s3Storage.configureLifecycle([
        {
          id: 'test-rule',
          status: 'Enabled',
          transitions: [{ days: 30, storageClass: 'GLACIER' }],
          expiration: { days: 365 }
        }
      ])).resolves.not.toThrow();
    });
  });

  describe('Storage Statistics', () => {
    test('should return storage stats', async () => {
      const stats = await s3Storage.getStorageStats();

      expect(stats).toHaveProperty('totalObjects');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('storageClasses');
      expect(typeof stats.totalObjects).toBe('number');
    });
  });
});

describe('EventBridgeOrchestrator', () => {
  let eventBridge: EventBridgeOrchestrator;

  beforeEach(() => {
    eventBridge = new EventBridgeOrchestrator();
    eventBridge.enableMockMode();
  });

  describe('Event Publishing', () => {
    test('should publish events correctly', async () => {
      const eventId = await eventBridge.publishEvent({
        source: 'bcce.test',
        detailType: 'Test Event',
        detail: { message: 'test event' }
      });

      expect(typeof eventId).toBe('string');
      expect(eventId.length).toBeGreaterThan(0);
    });

    test('should emit event-published event', (done) => {
      eventBridge.on('event-published', (event) => {
        expect(event.source).toBe('bcce.test');
        expect(event.detailType).toBe('Test Event');
        done();
      });

      eventBridge.publishEvent({
        source: 'bcce.test',
        detailType: 'Test Event',
        detail: { message: 'test' }
      });
    });
  });

  describe('Rule Management', () => {
    test('should create event rules', async () => {
      const rule = {
        name: 'test-rule',
        description: 'Test rule',
        eventPattern: {
          source: ['bcce.test']
        },
        state: 'ENABLED' as const,
        targets: [{
          id: '1',
          input: JSON.stringify({ action: 'test' })
        }]
      };

      await expect(eventBridge.createRule(rule)).resolves.not.toThrow();
    });

    test('should validate rule requirements', async () => {
      const invalidRule = {
        name: '',
        state: 'ENABLED' as const,
        targets: []
      };

      await expect(eventBridge.createRule(invalidRule))
        .rejects.toThrow();
    });
  });

  describe('Workflow Scheduling', () => {
    test('should schedule workflows correctly', async () => {
      const scheduled = await eventBridge.scheduleWorkflow(
        'test-workflow',
        'rate(1 hour)',
        { param1: 'value1' }
      );

      expect(scheduled.workflowId).toBe('test-workflow');
      expect(scheduled.schedule).toBe('rate(1 hour)');
      expect(scheduled.enabled).toBe(true);
      expect(scheduled.nextRun).toBeInstanceOf(Date);
    });
  });

  describe('Orchestration Patterns', () => {
    test('should create sequential pattern', async () => {
      await expect(eventBridge.createOrchestrationPattern({
        name: 'test-sequential',
        type: 'sequential',
        workflows: [
          { id: 'workflow1' },
          { id: 'workflow2' },
          { id: 'workflow3' }
        ]
      })).resolves.not.toThrow();
    });

    test('should create parallel pattern', async () => {
      await expect(eventBridge.createOrchestrationPattern({
        name: 'test-parallel',
        type: 'parallel',
        workflows: [
          { id: 'workflow1' },
          { id: 'workflow2' }
        ]
      })).resolves.not.toThrow();
    });
  });

  describe('Metrics and History', () => {
    test('should return orchestration metrics', () => {
      const metrics = eventBridge.getMetrics();

      expect(metrics).toHaveProperty('totalRules');
      expect(metrics).toHaveProperty('activeSchedules');
      expect(metrics).toHaveProperty('totalTriggers');
      expect(metrics).toHaveProperty('recentEvents');
    });

    test('should track execution history', async () => {
      await eventBridge.publishEvent({
        source: 'bcce.test',
        detailType: 'Test Event',
        detail: { workflowId: 'test' }
      });

      const history = await eventBridge.getExecutionHistory('test');
      expect(Array.isArray(history)).toBe(true);
    });
  });
});

describe('IAMIntegration', () => {
  let iam: IAMIntegration;

  beforeEach(() => {
    iam = new IAMIntegration();
    iam.enableMockMode();
  });

  describe('Role Management', () => {
    test('should create IAM roles', async () => {
      const roleArn = await iam.createRole({
        name: 'TestRole',
        description: 'Test role for BCCE',
        assumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole'
          }]
        },
        policies: []
      });

      expect(roleArn).toContain('arn:aws:iam::');
      expect(roleArn).toContain('role/TestRole');
    });

    test('should assume roles and get credentials', async () => {
      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';
      
      const credentials = await iam.assumeRole(roleArn, 'test-session');

      expect(credentials).toHaveProperty('accessKeyId');
      expect(credentials).toHaveProperty('secretAccessKey');
      expect(credentials).toHaveProperty('sessionToken');
      expect(credentials).toHaveProperty('expiration');
      expect(credentials.expiration).toBeInstanceOf(Date);
    });
  });

  describe('Policy Management', () => {
    test('should create IAM policies', async () => {
      const policyArn = await iam.createPolicy({
        name: 'TestPolicy',
        type: 'custom',
        description: 'Test policy',
        document: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: ['s3:GetObject'],
            Resource: ['arn:aws:s3:::test-bucket/*']
          }]
        }
      });

      expect(policyArn).toContain('arn:aws:iam::');
      expect(policyArn).toContain('policy/TestPolicy');
    });

    test('should generate workflow-specific policies', async () => {
      const policy = await iam.generateWorkflowPolicy(
        'test-workflow',
        ['bedrock:InvokeModel', 's3:GetObject'],
        ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:s3:::test-bucket/*']
      );

      expect(policy.name).toContain('test-workflow');
      expect(policy.document?.Statement).toContainEqual(
        expect.objectContaining({
          Action: expect.arrayContaining(['bedrock:InvokeModel'])
        })
      );
    });
  });

  describe('Permission Sets', () => {
    test('should create permission sets', async () => {
      const permissionSet = {
        name: 'test-permissions',
        description: 'Test permission set',
        level: 'developer' as const,
        workflows: ['test-workflow'],
        resources: [{
          service: 'bedrock',
          actions: ['bedrock:InvokeModel'],
          resources: ['*']
        }]
      };

      await expect(iam.createPermissionSet(permissionSet))
        .resolves.not.toThrow();
    });
  });

  describe('Permission Validation', () => {
    test('should validate permissions correctly', async () => {
      const result = await iam.validatePermissions(
        'test-user',
        'bedrock:InvokeModel',
        'arn:aws:bedrock:*::foundation-model/claude-3-haiku'
      );

      expect(result).toHaveProperty('allowed');
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  describe('IAM Audit', () => {
    test('should perform security audit', async () => {
      const audit = await iam.auditPermissions();

      expect(audit).toHaveProperty('overprivileged');
      expect(audit).toHaveProperty('unused');
      expect(audit).toHaveProperty('recommendations');
      expect(Array.isArray(audit.overprivileged)).toBe(true);
      expect(Array.isArray(audit.unused)).toBe(true);
      expect(Array.isArray(audit.recommendations)).toBe(true);
    });
  });
});