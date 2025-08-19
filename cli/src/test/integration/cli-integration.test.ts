/**
 * End-to-end integration tests for BCCE CLI
 * Tests real enterprise scenarios with actual CLI commands
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync, spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

describe('BCCE CLI Integration Tests', () => {
  let tempDir: string;
  let cliPath: string;

  beforeEach(() => {
    tempDir = `/tmp/bcce-integration-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    cliPath = path.resolve(__dirname, '../../../dist/bcce');
    
    // Ensure CLI is built
    if (!fs.existsSync(cliPath)) {
      execSync('npm run build', { cwd: path.resolve(__dirname, '../../..') });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Workflow Validation', () => {
    test('should validate correct workflow file', () => {
      const workflowPath = path.join(tempDir, 'valid-workflow.yml');
      const workflow = {
        version: 1,
        workflow: 'Valid Integration Test',
        model: '${BEDROCK_MODEL_ID}',
        guardrails: ['pii-basic'],
        env: {
          max_runtime_seconds: 600
        },
        steps: [
          {
            id: 'security_scan',
            type: 'agent',
            policy: {
              timeout_seconds: 300,
              max_files: 10,
              max_edits: 5,
              allowed_paths: ['src/**'],
              cmd_allowlist: ['npm', 'node']
            },
            available_tools: ['ReadFile', 'Search']
          }
        ]
      };

      fs.writeFileSync(workflowPath, yaml.stringify(workflow));

      const result = execSync(`node "${cliPath}" workflow validate "${workflowPath}"`, {
        encoding: 'utf8',
        env: { ...process.env, AWS_REGION: 'us-east-1' }
      });

      expect(result).toContain('✅ Workflow validation passed');
      expect(result).toContain('Steps: 1');
      expect(result).toContain('Guardrails: pii-basic');
    });

    test('should reject invalid workflow file', () => {
      const workflowPath = path.join(tempDir, 'invalid-workflow.yml');
      const invalidWorkflow = {
        version: 1,
        workflow: 'Invalid Workflow',
        steps: [
          {
            id: 'bad_agent',
            type: 'agent'
            // Missing required policy
          }
        ]
      };

      fs.writeFileSync(workflowPath, yaml.stringify(invalidWorkflow));

      expect(() => {
        execSync(`node "${cliPath}" workflow validate "${workflowPath}"`, {
          encoding: 'utf8',
          env: { ...process.env, AWS_REGION: 'us-east-1' }
        });
      }).toThrow();
    });

    test('should reject workflow with missing file', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.yml');

      expect(() => {
        execSync(`node "${cliPath}" workflow validate "${nonExistentPath}"`, {
          encoding: 'utf8',
          env: { ...process.env, AWS_REGION: 'us-east-1' }
        });
      }).toThrow();
    });
  });

  describe('Workflow Execution with Governance', () => {
    test('should perform dry run with governance enabled', () => {
      const workflowPath = path.join(tempDir, 'governance-test.yml');
      const promptPath = path.join(tempDir, 'prompt.md');
      
      const workflow = {
        version: 1,
        workflow: 'Governance Test Workflow',
        model: '${BEDROCK_MODEL_ID}',
        guardrails: ['pii-basic'],
        steps: [
          {
            id: 'analysis',
            type: 'prompt',
            prompt_file: 'prompt.md',
            available_tools: ['ReadFile', 'Search']
          }
        ]
      };

      const prompt = `# Security Analysis
Analyze the codebase for potential security vulnerabilities.

## Instructions
1. Scan for common security issues
2. Look for hardcoded secrets
3. Check for input validation problems
4. Generate a security report`;

      fs.writeFileSync(workflowPath, yaml.stringify(workflow));
      fs.writeFileSync(promptPath, prompt);

      const result = execSync(
        `node "${cliPath}" workflow run "${workflowPath}" --dry-run --engine=claude_code`,
        {
          encoding: 'utf8',
          cwd: tempDir,
          env: { 
            ...process.env, 
            AWS_REGION: 'us-east-1',
            BEDROCK_MODEL_ID: 'claude-3-5-sonnet-test'
          }
        }
      );

      expect(result).toContain('🚀 Executing Workflow with Governance');
      expect(result).toContain('Engine: claude_code');
      expect(result).toContain('🔍 Validating workflow...');
      expect(result).toContain('✅ Workflow validation passed');
      expect(result).toContain('📋 Dry run completed');
      expect(result).toContain('Governance: Enabled');
    });

    test('should validate governance configuration', () => {
      const workflowPath = path.join(tempDir, 'governance-validation.yml');
      
      const workflow = {
        version: 1,
        workflow: 'Governance Validation Test',
        steps: [
          {
            id: 'unsafe_agent',
            type: 'agent'
            // No policy - should trigger governance warnings
          }
        ]
      };

      fs.writeFileSync(workflowPath, yaml.stringify(workflow));

      expect(() => {
        execSync(
          `node "${cliPath}" workflow run "${workflowPath}" --dry-run --engine=claude_code`,
          {
            encoding: 'utf8',
            cwd: tempDir,
            env: { 
              ...process.env, 
              AWS_REGION: 'us-east-1',
              BEDROCK_MODEL_ID: 'claude-3-5-sonnet-test'
            }
          }
        );
      }).toThrow(); // Should fail validation due to missing policy
    });
  });

  describe('Cost Intelligence Commands', () => {
    test('should generate cost analysis report', () => {
      const result = execSync(`node "${cliPath}" cost analysis --period=30d --by=project`, {
        encoding: 'utf8',
        env: { ...process.env, AWS_REGION: 'us-east-1' }
      });

      expect(result).toContain('🎯 Advanced Cost Analysis');
      expect(result).toContain('📊 Cost Analysis Summary');
      expect(result).toContain('Total Spend:');
      expect(result).toContain('🔍 Top Cost Drivers');
      expect(result).toContain('💡 Optimization Opportunities');
      expect(result).toContain('🏛️ Governance Impact');
    });

    test('should display budget status', () => {
      const result = execSync(`node "${cliPath}" cost budget`, {
        encoding: 'utf8',
        env: { ...process.env, AWS_REGION: 'us-east-1' }
      });

      expect(result).toContain('💰 Budget Management');
      expect(result).toContain('Organization Budget');
      expect(result).toContain('Team Budgets');
      expect(result).toContain('Alert Status');
    });

    test('should generate cost forecast', () => {
      const result = execSync(`node "${cliPath}" cost forecast --period=90d --confidence=95`, {
        encoding: 'utf8',
        env: { ...process.env, AWS_REGION: 'us-east-1' }
      });

      expect(result).toContain('🔮 Cost Forecasting');
      expect(result).toContain('Confidence Level: 95%');
      expect(result).toContain('📈 Cost Forecast (90d)');
      expect(result).toContain('Projected Costs');
      expect(result).toContain('Conservative:');
      expect(result).toContain('Most Likely:');
      expect(result).toContain('Aggressive:');
      expect(result).toContain('Contributing Factors');
      expect(result).toContain('Recommendations');
    });
  });

  describe('Audit and Compliance', () => {
    test('should search audit logs', () => {
      const result = execSync(
        `node "${cliPath}" audit search "security review" --timeframe=7d --format=table`,
        {
          encoding: 'utf8',
          env: { ...process.env, AWS_REGION: 'us-east-1' }
        }
      );

      expect(result).toContain('🔍 Searching Audit Logs');
      expect(result).toContain('Found 47 audit entries');
      expect(result).toContain('Timestamp');
      expect(result).toContain('Event');
      expect(result).toContain('User');
      expect(result).toContain('Status');
      expect(result).toContain('✅ All sessions recorded with full context');
    });

    test('should generate compliance report', () => {
      const result = execSync(
        `node "${cliPath}" audit report --framework=soc2 --period=quarterly`,
        {
          encoding: 'utf8',
          env: { ...process.env, AWS_REGION: 'us-east-1' }
        }
      );

      expect(result).toContain('📋 Generating Compliance Report');
      expect(result).toContain('Framework: soc2');
      expect(result).toContain('Compliance Report - SOC2');
      expect(result).toContain('Summary');
      expect(result).toContain('Total Workflows:');
      expect(result).toContain('Compliance Rate:');
      expect(result).toContain('✅ Compliance status: SOC2 ready');
    });
  });

  describe('Doctor Command', () => {
    test('should perform comprehensive health check', () => {
      const result = execSync(`node "${cliPath}" doctor`, {
        encoding: 'utf8',
        env: { 
          ...process.env, 
          AWS_REGION: 'us-east-1',
          BEDROCK_MODEL_ID: 'claude-3-5-sonnet-test'
        }
      });

      expect(result).toContain('AWS region'); // Should check AWS configuration
    });
  });

  describe('Error Handling', () => {
    test('should provide helpful error for missing AWS region', () => {
      expect(() => {
        execSync(`node "${cliPath}" doctor`, {
          encoding: 'utf8',
          env: { 
            ...process.env,
            AWS_REGION: undefined // Remove AWS region
          }
        });
      }).toThrow();
    });

    test('should handle invalid command gracefully', () => {
      expect(() => {
        execSync(`node "${cliPath}" invalid-command`, {
          encoding: 'utf8',
          env: { ...process.env, AWS_REGION: 'us-east-1' }
        });
      }).toThrow();
    });

    test('should provide help when requested', () => {
      const result = execSync(`node "${cliPath}" --help`, {
        encoding: 'utf8',
        env: { ...process.env, AWS_REGION: 'us-east-1' }
      });

      expect(result).toContain('Enterprise Governance for AI Workflows');
      expect(result).toContain('setup');
      expect(result).toContain('doctor');
      expect(result).toContain('policy');
      expect(result).toContain('cost');
      expect(result).toContain('workflow');
      expect(result).toContain('audit');
    });
  });

  describe('Environment Integration', () => {
    test('should respect BEDROCK_MODEL_ID environment variable', () => {
      const workflowPath = path.join(tempDir, 'env-test.yml');
      const workflow = {
        version: 1,
        workflow: 'Environment Test',
        model: '${BEDROCK_MODEL_ID}',
        steps: [
          {
            id: 'simple_step',
            type: 'prompt',
            prompt_file: 'test.md'
          }
        ]
      };

      const promptPath = path.join(tempDir, 'test.md');
      fs.writeFileSync(workflowPath, yaml.stringify(workflow));
      fs.writeFileSync(promptPath, '# Test\nSimple test prompt.');

      const result = execSync(
        `node "${cliPath}" workflow validate "${workflowPath}"`,
        {
          encoding: 'utf8',
          cwd: tempDir,
          env: { 
            ...process.env, 
            AWS_REGION: 'us-east-1',
            BEDROCK_MODEL_ID: 'claude-3-haiku-custom'
          }
        }
      );

      expect(result).toContain('Model: ${BEDROCK_MODEL_ID}'); // Shows template in validation
    });

    test('should work with different AWS regions', () => {
      const regions = ['us-east-1', 'us-west-2', 'eu-west-1'];
      
      regions.forEach(region => {
        const result = execSync(`node "${cliPath}" cost budget`, {
          encoding: 'utf8',
          env: { ...process.env, AWS_REGION: region }
        });

        expect(result).toContain('💰 Budget Management');
      });
    });
  });
});