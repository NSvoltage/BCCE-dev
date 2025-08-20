/**
 * Governance Policy Tests
 * Validates individual policy enforcement and compliance validation
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceEngine } from '../../governance/governance-engine.js';
import type { Workflow, GovernanceConfig } from '../../adapters/workflow-adapter.js';

describe('Governance Policy Validation', () => {
  let governanceEngine: GovernanceEngine;

  beforeEach(() => {
    governanceEngine = new GovernanceEngine();
  });

  describe('Security Policy', () => {
    test('should pass with proper guardrails configured', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Secure Test Workflow',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic', 'toxicity-detection'],
        steps: [
          {
            id: 'secure_step',
            type: 'agent',
            policy: {
              maxTokens: 1000,
              temperature: 0.1
            }
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

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.appliedPolicies).toContain('security');
    });

    test('should flag missing guardrails as medium violation', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Insecure Workflow',
        model: 'claude-3-5-sonnet',
        guardrails: [], // No guardrails
        steps: [
          {
            id: 'insecure_step',
            type: 'agent'
            // No policy constraints
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

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.allowed).toBe(false); // High severity violations block execution
      expect(result.violations).toHaveLength(2); // Missing guardrails + missing policy
      
      const guardrailViolation = result.violations.find(v => v.description.includes('guardrails'));
      expect(guardrailViolation).toBeDefined();
      expect(guardrailViolation?.severity).toBe('medium');

      const policyViolation = result.violations.find(v => v.description.includes('policy constraints'));
      expect(policyViolation).toBeDefined();
      expect(policyViolation?.severity).toBe('high');
      expect(policyViolation?.step).toBe('insecure_step');
    });

    test('should block workflows with high-severity violations', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Dangerous Workflow',
        model: 'claude-3-5-sonnet',
        steps: [
          {
            id: 'dangerous_step',
            type: 'agent'
            // No policy - high severity violation
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

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.allowed).toBe(false); // High severity blocks execution
      expect(result.violations.some(v => v.severity === 'high')).toBe(true);
    });
  });

  describe('Cost Control Policy', () => {
    test('should pass within budget limits', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Budget-Friendly Workflow',
        model: 'claude-3-5-sonnet',
        steps: [
          {
            id: 'cheap_step',
            type: 'prompt',
            prompt_file: 'simple.md'
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['cost-control'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30,
          modelRestrictions: ['claude-3-5-sonnet', 'claude-3-haiku']
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('should flag budget overruns as high violation', async () => {
      const expensiveWorkflow: Workflow = {
        version: 1,
        workflow: 'Expensive Workflow',
        model: 'claude-3-5-sonnet',
        steps: Array.from({ length: 100 }, (_, i) => ({
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
          budgetLimit: 1, // Very low budget
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(expensiveWorkflow, governance);

      expect(result.allowed).toBe(false); // Should block due to budget
      expect(result.violations.some(v => 
        v.severity === 'high' && v.description.includes('budget limit')
      )).toBe(true);
    });

    test('should flag unauthorized models', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Unauthorized Model Workflow',
        model: 'gpt-4', // Not in allowed list
        steps: [
          {
            id: 'unauthorized_step',
            type: 'agent'
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['cost-control'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30,
          modelRestrictions: ['claude-3-5-sonnet', 'claude-3-haiku']
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.violations.some(v => 
        v.description.includes('not in approved list')
      )).toBe(true);
    });
  });

  describe('Compliance Policy', () => {
    test('should pass with proper compliance configuration', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Comprehensive Compliance Test Workflow',
        model: 'claude-3-5-sonnet',
        steps: [
          {
            id: 'compliant_step',
            type: 'prompt',
            prompt_file: 'compliance-test.md'
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['compliance'],
        approvalRequired: false,
        complianceLogging: true, // Proper compliance logging
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('should flag missing compliance logging', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Compliance Test Workflow',
        model: 'claude-3-5-sonnet',
        steps: []
      };

      const governance: GovernanceConfig = {
        policies: ['compliance'],
        approvalRequired: false,
        complianceLogging: false, // Missing compliance logging
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.violations.some(v => 
        v.description.includes('Compliance logging should be enabled')
      )).toBe(true);
    });

    test('should flag inadequate workflow documentation', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Bad', // Too short
        model: 'claude-3-5-sonnet',
        steps: []
      };

      const governance: GovernanceConfig = {
        policies: ['compliance'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.violations.some(v => 
        v.description.includes('descriptive name for compliance tracking')
      )).toBe(true);
    });
  });

  describe('Multi-Policy Enforcement', () => {
    test('should apply all specified policies', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Multi-Policy Test Workflow',
        model: 'claude-3-5-sonnet',
        guardrails: ['pii-basic'],
        steps: [
          {
            id: 'multi_policy_step',
            type: 'agent',
            policy: { maxTokens: 1000 }
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'cost-control', 'compliance'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(result.appliedPolicies).toContain('security');
      expect(result.appliedPolicies).toContain('cost-control');
      expect(result.appliedPolicies).toContain('compliance');
      expect(result.appliedPolicies).toHaveLength(3);
    });

    test('should handle unknown policies gracefully', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Unknown Policy Test',
        model: 'claude-3-5-sonnet',
        steps: []
      };

      const governance: GovernanceConfig = {
        policies: ['unknown-policy', 'security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30
        },
        auditLevel: 'comprehensive'
      };

      // Should not throw error, but warn about unknown policy
      const consoleSpy = jest.spyOn(console, 'warn');
      
      const result = await governanceEngine.enforcePolicy(workflow, governance);

      expect(consoleSpy).toHaveBeenCalledWith('Policy not found: unknown-policy');
      expect(result.appliedPolicies).toContain('security');
      expect(result.appliedPolicies).not.toContain('unknown-policy');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Policy Violation Aggregation', () => {
    test('should aggregate violations from multiple policies', async () => {
      const problematicWorkflow: Workflow = {
        version: 1,
        workflow: 'Bad', // Compliance violation
        model: 'unauthorized-model', // Cost control violation
        // No guardrails - Security violation
        steps: [
          {
            id: 'bad_step',
            type: 'agent'
            // No policy - Security violation
          }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'cost-control', 'compliance'],
        approvalRequired: false,
        complianceLogging: false, // Another compliance violation
        costControls: {
          budgetLimit: 100,
          timeoutMinutes: 30,
          modelRestrictions: ['claude-3-5-sonnet']
        },
        auditLevel: 'comprehensive'
      };

      const result = await governanceEngine.enforcePolicy(problematicWorkflow, governance);

      expect(result.violations.length).toBeGreaterThan(3); // Multiple violations
      expect(result.violations.some(v => v.policyName === 'security')).toBe(true);
      expect(result.violations.some(v => v.policyName === 'cost-control')).toBe(true);
      expect(result.violations.some(v => v.policyName === 'compliance')).toBe(true);
    });
  });
});