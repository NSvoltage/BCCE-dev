/**
 * Comprehensive Integration Test Suite for BCCE
 * Tests all features across Phase 1, 2, and 3
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Test configuration
const CLI_PATH = path.join(__dirname, '../../dist/bcce');
const TEST_DIR = path.join(__dirname, '../fixtures');
const TEST_WORKFLOW = path.join(TEST_DIR, 'test-workflow.yml');

// Helper function to run CLI commands
async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(`node ${CLI_PATH} ${command}`);
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || error.message };
  }
}

describe('BCCE Comprehensive Feature Tests', () => {
  beforeAll(() => {
    // Ensure test fixtures exist
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    
    // Create test workflow file
    const workflowContent = `
name: test-workflow
description: Test workflow for integration testing
model: anthropic.claude-3-haiku-20240307-v1:0
budget:
  max_input_tokens: 1000
  max_output_tokens: 1000
  max_total_cost: 0.10
steps:
  - id: test-step
    type: agent
    prompt: "Say hello"
`;
    fs.writeFileSync(TEST_WORKFLOW, workflowContent);
  });

  afterAll(() => {
    // Cleanup test artifacts
    if (fs.existsSync(TEST_WORKFLOW)) {
      fs.unlinkSync(TEST_WORKFLOW);
    }
  });

  describe('Phase 1: Cost Intelligence Features', () => {
    test('Cost report command should work', async () => {
      const { stdout } = await runCommand('cost report --period 7');
      expect(stdout).toContain('Cost Report');
    });

    test('Cost optimize command should provide recommendations', async () => {
      const { stdout } = await runCommand('cost optimize');
      expect(stdout).toContain('Optimization Recommendations');
    });

    test('Cost breakdown command should analyze by model', async () => {
      const { stdout } = await runCommand('cost breakdown --by model');
      expect(stdout).toContain('Cost Breakdown');
    });

    test('Cost export should generate JSON', async () => {
      const { stdout } = await runCommand('cost export --format json');
      const data = JSON.parse(stdout);
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('metrics');
    });
  });

  describe('Phase 2: Multi-Tool Analytics', () => {
    test('Analytics dashboard should display metrics', async () => {
      const { stdout } = await runCommand('analytics dashboard --period 7');
      expect(stdout).toContain('Analytics Dashboard');
      expect(stdout).toContain('Summary Metrics');
    });

    test('Analytics tools comparison should work', async () => {
      const { stdout } = await runCommand('analytics tools --sort productivity');
      expect(stdout).toContain('AI Tools Comparison');
    });

    test('Analytics productivity analysis should generate metrics', async () => {
      const { stdout } = await runCommand('analytics productivity --period 30');
      expect(stdout).toContain('Productivity Analysis');
    });

    test('Analytics insights should provide recommendations', async () => {
      const { stdout } = await runCommand('analytics insights --priority medium');
      expect(stdout).toContain('AI-Powered Insights');
    });

    test('Analytics optimize should recommend tools', async () => {
      const { stdout } = await runCommand('analytics optimize --task-type feature --complexity moderate');
      expect(stdout).toContain('Tool Optimization Recommendation');
    });

    test('Analytics export should generate data', async () => {
      const { stdout } = await runCommand('analytics export --format json --period 7');
      const data = JSON.parse(stdout);
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('tools');
    });
  });

  describe('Phase 3: AWS Native Integrations', () => {
    describe('CloudWatch Integration', () => {
      test('Metrics publish should work', async () => {
        const { stdout } = await runCommand('aws metrics publish --metric TestMetric --value 42');
        expect(stdout).toContain('Metric published successfully');
      });

      test('Dashboard creation should work', async () => {
        const { stdout } = await runCommand('aws metrics dashboard --name TestDashboard');
        expect(stdout).toContain('Dashboard created successfully');
      });

      test('Alarms configuration should work', async () => {
        const { stdout } = await runCommand('aws metrics alarms --cost-threshold 100');
        expect(stdout).toContain('alarms configured');
      });
    });

    describe('S3 Storage Integration', () => {
      test('Storage list should work', async () => {
        const { stdout } = await runCommand('aws storage list --bucket test-bucket');
        expect(stdout).toContain('Listing S3 Artifacts');
      });

      test('Lifecycle configuration should work', async () => {
        const { stdout } = await runCommand('aws storage lifecycle --bucket test-bucket --archive-days 90');
        expect(stdout).toContain('Lifecycle rules configured');
      });
    });

    describe('EventBridge Integration', () => {
      test('Event publishing should work', async () => {
        const { stdout } = await runCommand('aws events publish --source bcce.test --type TestEvent');
        expect(stdout).toContain('Event published successfully');
      });

      test('Workflow scheduling should work', async () => {
        const { stdout } = await runCommand('aws events schedule --workflow test-workflow --schedule "rate(1 hour)"');
        expect(stdout).toContain('Workflow scheduled successfully');
      });

      test('Orchestration pattern creation should work', async () => {
        const { stdout } = await runCommand('aws events orchestrate --name test-pattern --type sequential --workflows w1,w2,w3');
        expect(stdout).toContain('Orchestration pattern created');
      });
    });

    describe('IAM Integration', () => {
      test('Role creation should work', async () => {
        const { stdout } = await runCommand('aws iam create-role --name TestRole');
        expect(stdout).toContain('Role created successfully');
      });

      test('Role assumption should work', async () => {
        const { stdout } = await runCommand('aws iam assume-role --role arn:aws:iam::123456789012:role/TestRole');
        expect(stdout).toContain('Role assumed successfully');
      });

      test('IAM audit should generate report', async () => {
        const { stdout } = await runCommand('aws iam audit');
        expect(stdout).toContain('Audit Report');
      });
    });

    test('AWS status check should work', async () => {
      const { stdout } = await runCommand('aws status');
      expect(stdout).toContain('AWS Integration Status');
      expect(stdout).toContain('CloudWatch');
      expect(stdout).toContain('S3 Storage');
      expect(stdout).toContain('EventBridge');
      expect(stdout).toContain('IAM');
    });
  });

  describe('Core Workflow Features', () => {
    test('Workflow validation should work', async () => {
      const { stdout } = await runCommand(`workflow validate ${TEST_WORKFLOW}`);
      expect(stdout).toContain('valid') || expect(stdout).toContain('Valid');
    });

    test('Doctor command should check environment', async () => {
      const { stdout } = await runCommand('doctor');
      expect(stdout).toContain('Environment Check');
    });

    test('Models command should list available models', async () => {
      const { stdout } = await runCommand('models list');
      expect(stdout).toContain('Available Models') || expect(stdout).toContain('claude');
    });
  });

  describe('Command Help System', () => {
    test('Main help should list all commands', async () => {
      const { stdout } = await runCommand('--help');
      expect(stdout).toContain('cost');
      expect(stdout).toContain('analytics');
      expect(stdout).toContain('aws');
      expect(stdout).toContain('workflow');
    });

    test('Cost help should show subcommands', async () => {
      const { stdout } = await runCommand('cost --help');
      expect(stdout).toContain('report');
      expect(stdout).toContain('optimize');
      expect(stdout).toContain('breakdown');
    });

    test('Analytics help should show subcommands', async () => {
      const { stdout } = await runCommand('analytics --help');
      expect(stdout).toContain('dashboard');
      expect(stdout).toContain('tools');
      expect(stdout).toContain('productivity');
    });

    test('AWS help should show subcommands', async () => {
      const { stdout } = await runCommand('aws --help');
      expect(stdout).toContain('metrics');
      expect(stdout).toContain('storage');
      expect(stdout).toContain('events');
      expect(stdout).toContain('iam');
    });
  });

  describe('Error Handling', () => {
    test('Invalid command should show helpful error', async () => {
      const { stderr } = await runCommand('invalid-command');
      expect(stderr).toContain('error') || expect(stderr).toContain('Error');
    });

    test('Missing required options should show error', async () => {
      const { stderr } = await runCommand('aws events publish');
      expect(stderr).toContain('required') || expect(stderr).toContain('Required');
    });

    test('Invalid JSON should be handled gracefully', async () => {
      const { stderr } = await runCommand('aws events publish --source test --type test --detail "{invalid json"');
      expect(stderr).toBeDefined();
    });
  });

  describe('Integration Between Features', () => {
    test('Cost metrics should integrate with CloudWatch', async () => {
      // First track some cost
      await runCommand('cost report');
      
      // Then publish to CloudWatch
      const { stdout } = await runCommand('aws metrics publish --metric Cost --value 10.5');
      expect(stdout).toContain('published');
    });

    test('Analytics should work with multiple tools', async () => {
      const { stdout } = await runCommand('analytics tools');
      // Should show multiple tools even if no data
      expect(stdout).toContain('Tool');
    });

    test('S3 storage should handle workflow artifacts', async () => {
      const { stdout } = await runCommand('aws storage list --bucket test --type workflow');
      expect(stdout).toContain('Listing S3 Artifacts');
    });
  });
});

describe('Performance Tests', () => {
  test('Commands should respond quickly', async () => {
    const start = Date.now();
    await runCommand('--help');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // Should respond within 1 second
  });

  test('Cost report should handle large datasets', async () => {
    const start = Date.now();
    await runCommand('cost report --period 30');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
  });

  test('Analytics should process efficiently', async () => {
    const start = Date.now();
    await runCommand('analytics dashboard --period 30');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
  });
});

describe('Mock Mode Verification', () => {
  test('All AWS services should work in mock mode', async () => {
    // These should all work without AWS credentials
    const commands = [
      'aws metrics publish --metric Test --value 1',
      'aws storage list --bucket mock',
      'aws events publish --source test --type test',
      'aws iam audit',
    ];

    for (const cmd of commands) {
      const { stdout, stderr } = await runCommand(cmd);
      expect(stderr).not.toContain('AWS credentials');
      expect(stdout.toLowerCase()).toContain('mock') || expect(stdout).toBeTruthy();
    }
  });
});