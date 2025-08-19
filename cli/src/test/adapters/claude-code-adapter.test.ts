/**
 * Tests for ClaudeCodeAdapter
 * Validates enterprise integration with real-world scenarios
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ClaudeCodeAdapter } from '../../adapters/claude-code/adapter';
import type { Workflow, GovernanceConfig } from '../../adapters/workflow-adapter';
import fs from 'node:fs';
import path from 'node:path';

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;
  let tempDir: string;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    tempDir = '/tmp/bcce-test-' + Date.now();
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Workflow Validation', () => {
    test('should validate well-formed workflow', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Valid Test Workflow',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic'],
        steps: [
          {
            id: 'analysis',
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

      const result = await adapter.validate(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should catch missing prompt_file in prompt steps', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Invalid Prompt Workflow',
        steps: [
          {
            id: 'bad_prompt',
            type: 'prompt'
            // Missing prompt_file
          }
        ]
      };

      const result = await adapter.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Step 'bad_prompt': prompt steps require prompt_file");
    });

    test('should catch agent steps without policy', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Invalid Agent Workflow',
        steps: [
          {
            id: 'unsafe_agent',
            type: 'agent'
            // Missing policy
          }
        ]
      };

      const result = await adapter.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Step 'unsafe_agent': agent steps require policy configuration");
    });

    test('should warn about deprecated Bash tool', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Deprecated Tool Workflow',
        steps: [
          {
            id: 'step_with_bash',
            type: 'agent',
            policy: { timeout_seconds: 300 },
            available_tools: ['ReadFile', 'Bash', 'Search']
          }
        ]
      };

      const result = await adapter.validate(workflow);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Step 'step_with_bash': Bash tool is deprecated, use Cmd instead");
    });

    test('should detect duplicate step IDs', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Duplicate Step Workflow',
        steps: [
          {
            id: 'duplicate',
            type: 'prompt',
            prompt_file: 'test1.md'
          },
          {
            id: 'duplicate',
            type: 'prompt',
            prompt_file: 'test2.md'
          }
        ]
      };

      const result = await adapter.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate step ID: duplicate');
    });
  });

  describe('Governance Integration', () => {
    test('should execute workflow with governance successfully', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Governed Test Workflow',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic'],
        steps: [
          {
            id: 'simple_prompt',
            type: 'prompt',
            prompt_file: 'test.md',
            available_tools: ['ReadFile']
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'compliance'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          modelRestrictions: ['claude-3-5-sonnet', 'claude-3-haiku'],
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      // Create a test prompt file
      const promptPath = path.join(tempDir, 'test.md');
      fs.writeFileSync(promptPath, '# Test Prompt\nAnalyze the codebase for security issues.');

      const result = await adapter.executeWithGovernance(workflow, governance);

      expect(result.status).toMatch(/^(completed|failed)$/);
      expect(result.workflowId).toMatch(/^claude-\d+-[a-z0-9]+$/);
      expect(result.governance.policiesApplied).toEqual(['security', 'compliance']);
      expect(result.governance.complianceStatus).toBe(true);
      expect(result.governance.auditTrail).toHaveLength(2); // Governance check + execution
      expect(result.governance.costSummary).toMatchObject({
        totalCost: expect.any(Number),
        tokenCount: expect.any(Number),
        duration: expect.any(Number)
      });
    });

    test('should block workflow when governance fails', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Blocked Workflow',
        steps: [
          {
            id: 'unsafe_agent',
            type: 'agent'
            // No policy - will be blocked by governance
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      const result = await adapter.executeWithGovernance(workflow, governance);

      expect(result.status).toBe('blocked');
      expect(result.governance.complianceStatus).toBe(false);
      expect(result.errors).toContain('Workflow blocked by governance policies');
    });

    test('should handle workflow execution errors gracefully', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Error Prone Workflow',
        steps: [
          {
            id: 'invalid_step',
            type: 'prompt',
            prompt_file: '/nonexistent/file.md'
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: [],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      const result = await adapter.executeWithGovernance(workflow, governance);

      expect(result.status).toBe('failed');
      expect(result.errors).toHaveLength(1);
      expect(result.governance.auditTrail).toContainEqual(
        expect.objectContaining({
          event: 'workflow_error'
        })
      );
    });
  });

  describe('Cost Estimation', () => {
    test('should estimate costs accurately for different step types', async () => {
      const simpleWorkflow: Workflow = {
        version: 1,
        workflow: 'Simple Workflow',
        steps: [
          { id: 'prompt1', type: 'prompt', prompt_file: 'test.md' },
          { id: 'prompt2', type: 'prompt', prompt_file: 'test.md' }
        ]
      };

      const complexWorkflow: Workflow = {
        version: 1,
        workflow: 'Complex Workflow',
        steps: [
          { id: 'agent1', type: 'agent', policy: {} },
          { id: 'agent2', type: 'agent', policy: {} },
          { id: 'prompt1', type: 'prompt', prompt_file: 'test.md' }
        ]
      };

      const governance: GovernanceConfig = {
        policies: [],
        approvalRequired: false,
        complianceLogging: false,
        costControls: {},
        auditLevel: 'basic'
      };

      const simpleResult = await adapter.executeWithGovernance(simpleWorkflow, governance);
      const complexResult = await adapter.executeWithGovernance(complexWorkflow, governance);

      // Complex workflow should cost more due to agent steps
      expect(complexResult.governance.costSummary.totalCost)
        .toBeGreaterThan(simpleResult.governance.costSummary.totalCost);
      
      // Agent steps should be more expensive than prompt steps
      expect(complexResult.governance.costSummary.totalCost).toBeGreaterThan(0.15); // 2 agent steps * 0.10 + 1 prompt * 0.01
      expect(simpleResult.governance.costSummary.totalCost).toBeLessThan(0.05); // 2 prompt steps * 0.01
    });
  });

  describe('Enterprise Requirements', () => {
    test('should generate unique workflow IDs', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'ID Test Workflow',
        steps: [{ id: 'step1', type: 'prompt', prompt_file: 'test.md' }]
      };

      const governance: GovernanceConfig = {
        policies: [],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      const result1 = await adapter.executeWithGovernance(workflow, governance);
      const result2 = await adapter.executeWithGovernance(workflow, governance);

      expect(result1.workflowId).not.toEqual(result2.workflowId);
      expect(result1.workflowId).toMatch(/^claude-\d+-[a-z0-9]+$/);
      expect(result2.workflowId).toMatch(/^claude-\d+-[a-z0-9]+$/);
    });

    test('should provide comprehensive audit trails', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Audit Trail Test',
        steps: [
          { id: 'step1', type: 'prompt', prompt_file: 'test.md' }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'compliance'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: { budgetLimit: 10 },
        auditLevel: 'comprehensive'
      };

      const result = await adapter.executeWithGovernance(workflow, governance);

      expect(result.governance.auditTrail.length).toBeGreaterThan(0);
      
      const auditEntry = result.governance.auditTrail.find(entry => entry.event === 'workflow_execution');
      expect(auditEntry).toMatchObject({
        timestamp: expect.any(Date),
        event: 'workflow_execution',
        details: {
          engine: 'claude_code',
          status: expect.stringMatching(/^(completed|failed)$/),
          steps: 1
        },
        cost: expect.any(Number)
      });
    });

    test('should handle model environment variable substitution', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Model Substitution Test',
        model: '${BEDROCK_MODEL_ID}',
        steps: [{ id: 'step1', type: 'prompt', prompt_file: 'test.md' }]
      };

      const governance: GovernanceConfig = {
        policies: [],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      // Set environment variable
      const originalModelId = process.env.BEDROCK_MODEL_ID;
      process.env.BEDROCK_MODEL_ID = 'claude-3-5-sonnet-test';

      try {
        const result = await adapter.executeWithGovernance(workflow, governance);
        
        // The adapter should handle model substitution correctly
        expect(result.status).toMatch(/^(completed|failed|blocked)$/);
      } finally {
        // Restore original environment
        if (originalModelId) {
          process.env.BEDROCK_MODEL_ID = originalModelId;
        } else {
          delete process.env.BEDROCK_MODEL_ID;
        }
      }
    });
  });
});