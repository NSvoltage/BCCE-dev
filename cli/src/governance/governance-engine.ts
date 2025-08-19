/**
 * BCCE Governance Engine
 * Provides policy enforcement, compliance logging, and approval orchestration
 */

import type { Workflow, GovernanceConfig, AuditEntry } from '../adapters/workflow-adapter.js';

export interface PolicyResult {
  allowed: boolean;
  violations: PolicyViolation[];
  appliedPolicies: string[];
}

export interface PolicyViolation {
  policyName: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  step?: string;
}

export interface ApprovalRequest {
  id: string;
  workflow: Workflow;
  reason: string;
  requester: string;
  timestamp: Date;
  approvers: string[];
  status: 'pending' | 'approved' | 'denied';
}

export class GovernanceEngine {
  private policies: Map<string, Policy> = new Map();
  private approvalQueue: Map<string, ApprovalRequest> = new Map();
  
  constructor() {
    this.initializeDefaultPolicies();
  }
  
  /**
   * Enforce policies against a workflow
   */
  async enforcePolicy(workflow: Workflow, governance: GovernanceConfig): Promise<PolicyResult> {
    const violations: PolicyViolation[] = [];
    const appliedPolicies: string[] = [];
    
    for (const policyName of governance.policies) {
      const policy = this.policies.get(policyName);
      if (!policy) {
        console.warn(`Policy not found: ${policyName}`);
        continue;
      }
      
      appliedPolicies.push(policyName);
      const policyViolations = await policy.evaluate(workflow, governance);
      violations.push(...policyViolations);
    }
    
    return {
      allowed: violations.filter(v => v.severity === 'high').length === 0,
      violations,
      appliedPolicies
    };
  }
  
  /**
   * Create approval request for workflow
   */
  async requestApproval(
    workflow: Workflow, 
    reason: string, 
    requester: string = 'system'
  ): Promise<string> {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    const approval: ApprovalRequest = {
      id: approvalId,
      workflow,
      reason,
      requester,
      timestamp: new Date(),
      approvers: this.getRequiredApprovers(workflow),
      status: 'pending'
    };
    
    this.approvalQueue.set(approvalId, approval);
    
    // In real implementation, this would send notifications to approvers
    console.log(`📋 Approval requested: ${approvalId}`);
    console.log(`   Workflow: ${workflow.workflow}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Required approvers: ${approval.approvers.join(', ')}`);
    
    return approvalId;
  }
  
  /**
   * Process approval decision
   */
  async processApproval(approvalId: string, approved: boolean, approver: string): Promise<boolean> {
    const approval = this.approvalQueue.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }
    
    if (!approval.approvers.includes(approver)) {
      throw new Error(`User ${approver} is not authorized to approve this request`);
    }
    
    approval.status = approved ? 'approved' : 'denied';
    
    console.log(`✅ Approval ${approved ? 'granted' : 'denied'} by ${approver}`);
    
    return approved;
  }
  
  /**
   * Generate audit trail for workflow execution
   */
  generateAuditTrail(
    workflow: Workflow,
    governance: GovernanceConfig,
    policyResult: PolicyResult,
    executionStart: Date,
    executionEnd: Date
  ): AuditEntry[] {
    const auditEntries: AuditEntry[] = [];
    
    // Governance check entry
    auditEntries.push({
      timestamp: executionStart,
      event: 'governance_check_start',
      details: {
        workflow: workflow.workflow,
        policies: governance.policies,
        complianceLogging: governance.complianceLogging
      }
    });
    
    // Policy enforcement entries
    for (const violation of policyResult.violations) {
      auditEntries.push({
        timestamp: new Date(),
        event: 'policy_violation',
        details: {
          policy: violation.policyName,
          severity: violation.severity,
          description: violation.description,
          step: violation.step
        }
      });
    }
    
    // Execution completion entry
    auditEntries.push({
      timestamp: executionEnd,
      event: 'governance_check_complete',
      details: {
        allowed: policyResult.allowed,
        violationsCount: policyResult.violations.length,
        duration: executionEnd.getTime() - executionStart.getTime()
      }
    });
    
    return auditEntries;
  }
  
  /**
   * Initialize default enterprise policies
   */
  private initializeDefaultPolicies(): void {
    // Security policy
    this.policies.set('security', new SecurityPolicy());
    
    // Cost control policy
    this.policies.set('cost-control', new CostControlPolicy());
    
    // Compliance policy
    this.policies.set('compliance', new CompliancePolicy());
  }
  
  /**
   * Determine required approvers based on workflow characteristics
   */
  private getRequiredApprovers(workflow: Workflow): string[] {
    const approvers: string[] = [];
    
    // Basic approval requirements
    if (workflow.steps.some(s => s.type === 'agent')) {
      approvers.push('security_team');
    }
    
    if (workflow.steps.some(s => s.type === 'apply_diff')) {
      approvers.push('engineering_manager');
    }
    
    // Default approver if none specified
    if (approvers.length === 0) {
      approvers.push('workflow_admin');
    }
    
    return approvers;
  }
}

/**
 * Base policy interface
 */
abstract class Policy {
  abstract evaluate(workflow: Workflow, governance: GovernanceConfig): Promise<PolicyViolation[]>;
}

/**
 * Security policy implementation
 */
class SecurityPolicy extends Policy {
  async evaluate(workflow: Workflow, _governance: GovernanceConfig): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];
    
    // Check for guardrails
    if (!workflow.guardrails || workflow.guardrails.length === 0) {
      violations.push({
        policyName: 'security',
        severity: 'medium',
        description: 'No guardrails configured - PII and secrets detection recommended'
      });
    }
    
    // Check for agent steps without proper constraints
    for (const step of workflow.steps) {
      if (step.type === 'agent' && !step.policy) {
        violations.push({
          policyName: 'security',
          severity: 'high',
          description: 'Agent step must have policy constraints',
          step: step.id
        });
      }
    }
    
    return violations;
  }
}

/**
 * Cost control policy implementation
 */
class CostControlPolicy extends Policy {
  async evaluate(workflow: Workflow, governance: GovernanceConfig): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];
    
    // Check budget limits
    if (governance.costControls.budgetLimit) {
      const estimatedCost = this.estimateWorkflowCost(workflow);
      if (estimatedCost > governance.costControls.budgetLimit) {
        violations.push({
          policyName: 'cost-control',
          severity: 'high',
          description: `Estimated cost $${estimatedCost} exceeds budget limit $${governance.costControls.budgetLimit}`
        });
      }
    }
    
    // Check model restrictions
    if (governance.costControls.modelRestrictions && workflow.model) {
      if (!governance.costControls.modelRestrictions.includes(workflow.model)) {
        violations.push({
          policyName: 'cost-control',
          severity: 'medium',
          description: `Model ${workflow.model} not in approved list`
        });
      }
    }
    
    return violations;
  }
  
  private estimateWorkflowCost(workflow: Workflow): number {
    // Simple cost estimation
    return workflow.steps.length * 0.05; // $0.05 per step
  }
}

/**
 * Compliance policy implementation
 */
class CompliancePolicy extends Policy {
  async evaluate(workflow: Workflow, governance: GovernanceConfig): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];
    
    // Check compliance logging requirement
    if (!governance.complianceLogging) {
      violations.push({
        policyName: 'compliance',
        severity: 'medium',
        description: 'Compliance logging should be enabled for audit trail'
      });
    }
    
    // Check for proper workflow documentation
    if (!workflow.workflow || workflow.workflow.trim().length < 10) {
      violations.push({
        policyName: 'compliance',
        severity: 'low',
        description: 'Workflow should have descriptive name for compliance tracking'
      });
    }
    
    return violations;
  }
}