/**
 * Comprehensive tests for GovernanceEngine
 * Tests real-world enterprise scenarios with proper validation
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceEngine } from '../../governance/governance-engine';
import type { Workflow, GovernanceConfig } from '../../adapters/workflow-adapter';

describe('GovernanceEngine', () => {
  let governanceEngine: GovernanceEngine;

  beforeEach(() => {
    governanceEngine = new GovernanceEngine();
  });

  describe('Policy Enforcement', () => {
    test('should block workflows without guardrails in security policy', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Test Workflow',
        steps: [
          { id: 'step1', type: 'prompt', prompt_file: 'test.md' }
        ]
        // Note: No guardrails configured
      };

      const governance: GovernanceConfig = {
        policies: ['security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);
      
      expect(result.allowed).toBe(true); // Should allow but with warnings
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({
        policyName: 'security',
        severity: 'medium',
        description: expect.stringContaining('guardrails')
      });
    });

    test('should block agent steps without policy constraints', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Unsafe Agent Workflow',
        steps: [
          { 
            id: 'unsafe_agent', 
            type: 'agent'
            // Note: No policy constraints
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

      const result = await governanceEngine.enforcePolicy(workflow, governance);
      
      expect(result.allowed).toBe(false); // Should block high severity violations
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
      
      const highSeverityViolation = result.violations.find(v => v.severity === 'high');
      expect(highSeverityViolation).toMatchObject({
        policyName: 'security',
        severity: 'high',
        description: 'Agent step must have policy constraints',
        step: 'unsafe_agent'
      });
    });

    test('should enforce cost control policies', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Expensive Workflow',
        steps: [
          { id: 'step1', type: 'agent', policy: { timeout: 300 } },
          { id: 'step2', type: 'agent', policy: { timeout: 300 } },
          { id: 'step3', type: 'agent', policy: { timeout: 300 } },
          { id: 'step4', type: 'agent', policy: { timeout: 300 } },
          { id: 'step5', type: 'agent', policy: { timeout: 300 } }
          // 5 agent steps = estimated $0.50, exceeds $0.20 limit
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['cost-control'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          budgetLimit: 0.20 // Very low limit to trigger violation
        },
        auditLevel: 'basic'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);
      
      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({
        policyName: 'cost-control',
        severity: 'high',
        description: expect.stringContaining('budget limit')
      });
    });

    test('should validate model restrictions', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Restricted Model Workflow',
        model: 'claude-3-opus', // Not in approved list
        steps: [
          { id: 'step1', type: 'prompt', prompt_file: 'test.md' }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['cost-control'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {
          modelRestrictions: ['claude-3-5-sonnet', 'claude-3-haiku']
        },
        auditLevel: 'basic'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);
      
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          policyName: 'cost-control',
          severity: 'medium',
          description: expect.stringContaining('not in approved list')
        })
      );
    });
  });

  describe('Approval Workflows', () => {
    test('should create approval request for high-risk workflows', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'High Risk Workflow',
        steps: [
          { 
            id: 'risky_agent', 
            type: 'agent',
            policy: { timeout: 300, max_edits: 10 }
          },
          {
            id: 'apply_changes',
            type: 'apply_diff',
            approve: false
          }
        ]
      };

      const approvalId = await governanceEngine.requestApproval(
        workflow,
        'Agent workflow with code modifications',
        'test-user'
      );

      expect(approvalId).toMatch(/^approval-\d+-[a-z0-9]+$/);
    });

    test('should process approval correctly', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Test Workflow',
        steps: [{ id: 'step1', type: 'agent', policy: {} }]
      };

      const approvalId = await governanceEngine.requestApproval(
        workflow,
        'Test approval',
        'requester'
      );

      // Should succeed with authorized approver
      const approved = await governanceEngine.processApproval(
        approvalId,
        true,
        'security_team'
      );

      expect(approved).toBe(true);
    });

    test('should reject unauthorized approvers', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Test Workflow',
        steps: [{ id: 'step1', type: 'prompt', prompt_file: 'test.md' }]
      };

      const approvalId = await governanceEngine.requestApproval(
        workflow,
        'Test approval',
        'requester'
      );

      // Should fail with unauthorized approver
      await expect(
        governanceEngine.processApproval(approvalId, true, 'unauthorized_user')
      ).rejects.toThrow('not authorized to approve');
    });
  });

  describe('Audit Trail Generation', () => {
    test('should generate comprehensive audit trail', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Audited Workflow',
        steps: [
          { id: 'step1', type: 'prompt', prompt_file: 'test.md' }
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security', 'compliance'],
        approvalRequired: true,
        complianceLogging: true,
        costControls: { budgetLimit: 100 },
        auditLevel: 'comprehensive'
      };

      const policyResult = await governanceEngine.enforcePolicy(workflow, governance);
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 5000); // 5 seconds later

      const auditTrail = governanceEngine.generateAuditTrail(
        workflow,
        governance,
        policyResult,
        startTime,
        endTime
      );

      expect(auditTrail).toHaveLength(3); // Start, violations (if any), completion
      expect(auditTrail[0]).toMatchObject({
        event: 'governance_check_start',
        details: {
          workflow: 'Audited Workflow',
          policies: ['security', 'compliance']
        }
      });
      expect(auditTrail[auditTrail.length - 1]).toMatchObject({
        event: 'governance_check_complete',
        details: {
          allowed: expect.any(Boolean),
          duration: 5000
        }
      });
    });

    test('should include policy violations in audit trail', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Violating Workflow',
        steps: [
          { id: 'bad_agent', type: 'agent' } // No policy constraints
        ]
      };

      const governance: GovernanceConfig = {
        policies: ['security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'comprehensive'
      };

      const policyResult = await governanceEngine.enforcePolicy(workflow, governance);
      const auditTrail = governanceEngine.generateAuditTrail(
        workflow,
        governance,
        policyResult,
        new Date(),
        new Date()
      );

      const violationEntries = auditTrail.filter(entry => entry.event === 'policy_violation');
      expect(violationEntries.length).toBeGreaterThanOrEqual(1);
      
      const highSeverityViolation = violationEntries.find(entry => 
        entry.details.severity === 'high' && entry.details.step === 'bad_agent'
      );
      expect(highSeverityViolation).toMatchObject({
        event: 'policy_violation',
        details: {
          policy: 'security',
          severity: 'high',
          step: 'bad_agent'
        }
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty workflow gracefully', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: '',
        steps: []
      };

      const governance: GovernanceConfig = {
        policies: ['compliance'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      const result = await governanceEngine.enforcePolicy(workflow, governance);
      
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          policyName: 'compliance',
          description: expect.stringContaining('descriptive name')
        })
      );
    });

    test('should handle unknown policy names gracefully', async () => {
      const workflow: Workflow = {
        version: 1,
        workflow: 'Test Workflow',
        steps: [{ id: 'step1', type: 'prompt', prompt_file: 'test.md' }]
      };

      const governance: GovernanceConfig = {
        policies: ['unknown-policy', 'security'],
        approvalRequired: false,
        complianceLogging: true,
        costControls: {},
        auditLevel: 'basic'
      };

      // Should not throw, but warn about unknown policy
      const result = await governanceEngine.enforcePolicy(workflow, governance);
      expect(result.appliedPolicies).toEqual(['security']); // Only known policies applied
    });

    test('should handle approval for non-existent workflow', async () => {
      await expect(
        governanceEngine.processApproval('non-existent-id', true, 'approver')
      ).rejects.toThrow('Approval not found');
    });
  });
});