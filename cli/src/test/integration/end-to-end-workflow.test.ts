/**
 * End-to-End Workflow Integration Tests
 * Tests complete workflow execution with governance enforcement
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ClaudeCodeAdapter } from '../../adapters/claude-code/adapter.js';
import { GovernanceEngine } from '../../governance/governance-engine.js';
import type { Workflow, GovernanceConfig } from '../../adapters/workflow-adapter.js';
import fs from 'node:fs';
import path from 'node:path';

describe('End-to-End Workflow Integration', () => {
  let adapter: ClaudeCodeAdapter;
  let governanceEngine: GovernanceEngine;
  const tempDir = '/tmp/bcce-e2e-test';

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    governanceEngine = new GovernanceEngine();
    
    // Create temp directory for test artifacts
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Set test environment
    process.env.BCCE_TEST_MODE = '1';
  });

  afterEach(() => {
    // Cleanup test artifacts
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    delete process.env.BCCE_TEST_MODE;
  });

  describe('Workflow Validation', () => {
    test('should validate compliant workflow successfully', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Compliant Test Workflow for Enterprise Validation',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic', 'content-policy'],
        env: {
          ENVIRONMENT: 'test'
        },
        steps: [
          {
            id: 'validation_step',
            type: 'prompt',
            prompt_file: 'validation-prompt.md'
          }
        ]
      };

      const result = await adapter.validate(workflow);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should identify workflow validation errors', async () => {
      const invalidWorkflow: Workflow = {
        version: 1,
        workflow: 'Invalid Workflow',
        model: 'claude-3-5-sonnet',
        steps: [
          {
            id: 'invalid_agent_step',
            type: 'agent'
            // Missing required policy
          },
          {
            id: 'invalid_prompt_step',
            type: 'prompt'
            // Missing required prompt_file
          }
        ]
      };

      const result = await adapter.validate(invalidWorkflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('agent steps require policy'))).toBe(true);
      expect(result.errors.some(e => e.includes('prompt steps require prompt_file'))).toBe(true);
    });

    test('should identify deprecated features', async () => {
      const workflowWithDeprecated: Workflow = {
        version: 1,
        workflow: 'Workflow with Deprecated Features',
        model: 'claude-3-5-sonnet',
        steps: [
          {
            id: 'deprecated_step',
            type: 'agent',
            policy: { maxTokens: 1000 },
            available_tools: ['Bash'] // Deprecated tool
          }
        ]
      };

      const result = await adapter.validate(workflowWithDeprecated);
      
      expect(result.valid).toBe(true); // Warnings don't make it invalid
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Bash tool is deprecated'))).toBe(true);
    });
  });

  describe('Governance Integration', () => {
    test('should enforce security policies', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Security Policy Test Workflow',
        model: 'claude-3-5-sonnet',
        // Intentionally missing guardrails for security policy test
        steps: [
          {
            id: 'security_test_step',
            type: 'agent'
            // Intentionally missing policy for high-severity violation
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await adapter.executeWithGovernance(workflow, governance);
      
      expect(result.status).toBe('blocked');
      expect(result.governance.complianceStatus).toBe(false);
      expect(result.errors).toContain('Workflow blocked by governance policies');
      expect(result.governance.auditTrail.length).toBeGreaterThan(0);
    });

    test('should enforce cost control policies', async () => {
      const expensiveWorkflow: Workflow = {
        version: 1,
        workflow: 'Cost Control Test - Expensive Operations',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic'],
        steps: Array.from({ length: 50 }, (_, i) => ({
          id: `expensive_step_${i}`,
          type: 'agent',
          policy: { maxTokens: 10000 }
        }))
      };

      const governance: GovernanceConfig = {
        policies: ['cost-control'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 1, // Very restrictive budget
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await adapter.executeWithGovernance(expensiveWorkflow, governance);
      
      expect(result.status).toBe('blocked');
      expect(result.governance.complianceStatus).toBe(false);
      
      // Should have cost-related audit entries
      const costViolation = result.governance.auditTrail.find(
        entry => entry.event === 'policy_violation' && 
                 entry.details.description?.includes('budget limit')
      );
      expect(costViolation).toBeTruthy();
    });

    test('should allow compliant workflows to execute', async () => {
      const compliantWorkflow: Workflow = {
        version: 1,
        workflow: 'Fully Compliant Enterprise Workflow',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic', 'content-policy'],
        steps: [
          {
            id: 'compliant_step',
            type: 'prompt',
            prompt_file: 'test-prompt.md'
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'cost-control', 'compliance'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30,
          modelRestrictions: ['claude-3-5-sonnet', 'claude-3-haiku']
        },
        auditLevel: 'comprehensive'
      };

      // Create required prompt file
      const promptPath = path.join(tempDir, 'test-prompt.md');
      fs.writeFileSync(promptPath, 'Test prompt for compliance validation');

      // Mock workflow runner to avoid actual execution
      const originalRun = adapter['convertToRunnerFormat'];
      adapter['convertToRunnerFormat'] = () => ({
        version: 1,
        workflow: compliantWorkflow.workflow,
        model: compliantWorkflow.model,
        steps: compliantWorkflow.steps
      });

      const result = await adapter.executeWithGovernance(compliantWorkflow, governance);
      
      expect(result.governance.complianceStatus).toBe(true);
      expect(result.governance.policiesApplied).toContain('security');
      expect(result.governance.policiesApplied).toContain('cost-control');
      expect(result.governance.policiesApplied).toContain('compliance');
      
      // Should have comprehensive audit trail
      expect(result.governance.auditTrail.length).toBeGreaterThan(0);
      expect(result.governance.auditTrail.some(e => e.event === 'governance_check_start')).toBe(true);
      expect(result.governance.auditTrail.some(e => e.event === 'governance_check_complete')).toBe(true);
      
      // Should have cost summary
      expect(result.governance.costSummary).toBeTruthy();
      expect(result.governance.costSummary.totalCost).toBeGreaterThan(0);
      expect(result.governance.costSummary.duration).toBeGreaterThan(0);
    });
  });

  describe('Approval Workflow Integration', () => {
    test('should handle approval workflow for high-risk operations', async () => {
      const highRiskWorkflow: Workflow = {
        version: 1,
        workflow: 'High Risk Production Deployment',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic'],
        steps: [
          {
            id: 'production_deploy',
            type: 'agent',
            policy: { maxTokens: 5000 }
          },
          {
            id: 'apply_changes',
            type: 'apply_diff'
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'compliance'],
        approvalRequired: true,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 60
        },
        auditLevel: 'comprehensive'
      };

      // Test approval request creation
      const approvalId = await governanceEngine.requestApproval(
        highRiskWorkflow,
        'High-risk production deployment requiring approval',
        'test-user'
      );

      expect(approvalId).toBeTruthy();
      expect(approvalId).toMatch(/^approval-\d+-[a-z0-9]+$/);

      // Test approval processing
      const approvalResult = await governanceEngine.processApproval(
        approvalId,
        true,
        'security_team'
      );

      expect(approvalResult).toBe(true);
    });

    test('should determine correct approvers based on workflow type', async () => {
      const workflows = [
        // Agent workflow should require security team approval
        {
          workflow: {
            version: 1,
            workflow: 'Agent Workflow',
            model: 'claude-3-5-sonnet',
            steps: [{ id: 'agent_step', type: 'agent' as const, policy: {} }]
          },
          expectedApprover: 'security_team'
        },
        // Apply diff workflow should require engineering manager approval
        {
          workflow: {
            version: 1,
            workflow: 'Deploy Workflow',
            model: 'claude-3-5-sonnet',
            steps: [{ id: 'deploy_step', type: 'apply_diff' as const }]
          },
          expectedApprover: 'engineering_manager'
        },
        // Simple workflow should require default approver
        {
          workflow: {
            version: 1,
            workflow: 'Simple Workflow',
            model: 'claude-3-5-sonnet',
            steps: [{ id: 'simple_step', type: 'prompt' as const, prompt_file: 'test.md' }]
          },
          expectedApprover: 'workflow_admin'
        }
      ];

      for (const { workflow, expectedApprover } of workflows) {
        const approvalId = await governanceEngine.requestApproval(
          workflow,
          `Test approval for ${workflow.workflow}`,
          'test-user'
        );

        // Access private method for testing - in real implementation would check through approval API
        const approvers = governanceEngine['getRequiredApprovers'](workflow);
        expect(approvers).toContain(expectedApprover);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle workflow execution errors gracefully', async () => {
      const problematicWorkflow: Workflow = {
        version: 1,
        workflow: 'Workflow That Will Fail',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic'],
        steps: [
          {
            id: 'failing_step',
            type: 'prompt',
            prompt_file: 'nonexistent-file.md' // This will cause failure
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await adapter.executeWithGovernance(problematicWorkflow, governance);
      
      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.governance.complianceStatus).toBe(false);
      
      // Should still have audit trail for failed execution
      expect(result.governance.auditTrail.length).toBeGreaterThan(0);
      expect(result.governance.auditTrail.some(e => e.event === 'workflow_error')).toBe(true);
    });

    test('should provide comprehensive error context', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Error Context Test',
        model: 'invalid-model', // This will cause validation error
        steps: []
      };

      const governance: GovernanceConfig = {
        policies: ['cost-control'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30,
          modelRestrictions: ['claude-3-5-sonnet'] // Restricted model list
        },
        auditLevel: 'comprehensive'
      };

      const result = await adapter.executeWithGovernance(workflow, governance);
      
      expect(result.status).toBe('blocked');
      expect(result.governance.auditTrail.length).toBeGreaterThan(0);
      
      // Find policy violation in audit trail
      const policyViolation = result.governance.auditTrail.find(
        entry => entry.event === 'policy_violation'
      );
      
      expect(policyViolation).toBeTruthy();
      expect(policyViolation?.details).toBeTruthy();
    });
  });
});