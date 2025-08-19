/**
 * Workflow Adapter Interface
 * Provides a standard interface for different workflow engines with governance
 */

export interface WorkflowAdapter {
  readonly engineType: 'claude_code' | 'roast' | 'custom';
  
  /**
   * Execute workflow with governance wrapper
   */
  executeWithGovernance(
    workflow: Workflow, 
    governance: GovernanceConfig
  ): Promise<GovernedResult>;
  
  /**
   * Validate workflow for this engine
   */
  validate(workflow: Workflow): Promise<ValidationResult>;
  
  /**
   * Resume workflow from specific step
   */
  resume(workflowId: string, step: string): Promise<ResumeResult>;
  
  /**
   * Abort running workflow
   */
  abort(workflowId: string, reason: string): Promise<AbortResult>;
}

export interface Workflow {
  id?: string;
  version: number;
  workflow: string;
  model?: string;
  guardrails?: string[];
  env?: Record<string, any>;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  type: 'prompt' | 'agent' | 'cmd' | 'apply_diff';
  prompt_file?: string;
  command?: string;
  policy?: any;
  available_tools?: string[];
  inputs?: Record<string, any>;
  on_error?: 'continue' | 'fail';
  approve?: boolean;
}

export interface GovernanceConfig {
  policies: string[];
  approvalRequired: boolean;
  complianceLogging: boolean;
  costControls: {
    budgetLimit?: number;
    modelRestrictions?: string[];
    timeoutMinutes?: number;
  };
  auditLevel: 'basic' | 'detailed' | 'comprehensive';
}

export interface GovernedResult {
  status: 'completed' | 'failed' | 'pending_approval' | 'blocked';
  workflowId: string;
  governance: {
    policiesApplied: string[];
    complianceStatus: boolean;
    auditTrail: AuditEntry[];
    costSummary: CostSummary;
  };
  executionResult?: any;
  errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ResumeResult {
  status: 'resumed' | 'failed';
  workflowId: string;
  resumedFromStep: string;
}

export interface AbortResult {
  status: 'aborted' | 'failed';
  workflowId: string;
  reason: string;
}

export interface AuditEntry {
  timestamp: Date;
  event: string;
  details: Record<string, any>;
  user?: string;
  cost?: number;
}

export interface CostSummary {
  totalCost: number;
  tokenCount: number;
  duration: number;
  budgetRemaining?: number;
}

/**
 * Base implementation for workflow adapters
 */
export abstract class BaseWorkflowAdapter implements WorkflowAdapter {
  abstract readonly engineType: 'claude_code' | 'roast' | 'custom';
  
  abstract executeWithGovernance(
    workflow: Workflow, 
    governance: GovernanceConfig
  ): Promise<GovernedResult>;
  
  async validate(workflow: Workflow): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic validation
    if (!workflow.workflow) {
      errors.push('Workflow name is required');
    }
    
    if (!workflow.steps || workflow.steps.length === 0) {
      errors.push('At least one step is required');
    }
    
    // Validate step IDs are unique
    const stepIds = new Set<string>();
    for (const step of workflow.steps || []) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  async resume(workflowId: string, step: string): Promise<ResumeResult> {
    // Default implementation - override in specific adapters
    return {
      status: 'failed',
      workflowId,
      resumedFromStep: step
    };
  }
  
  async abort(workflowId: string, reason: string): Promise<AbortResult> {
    // Default implementation - override in specific adapters
    return {
      status: 'aborted',
      workflowId,
      reason
    };
  }
  
  /**
   * Apply governance policies to workflow execution
   */
  protected async applyGovernance(
    workflow: Workflow,
    governance: GovernanceConfig
  ): Promise<{ allowed: boolean; auditEntries: AuditEntry[] }> {
    const auditEntries: AuditEntry[] = [];
    
    // Log governance check
    auditEntries.push({
      timestamp: new Date(),
      event: 'governance_check',
      details: {
        policies: governance.policies,
        workflow: workflow.workflow
      }
    });
    
    // Check cost controls
    if (governance.costControls.budgetLimit) {
      auditEntries.push({
        timestamp: new Date(),
        event: 'budget_check',
        details: {
          limit: governance.costControls.budgetLimit,
          workflow: workflow.workflow
        }
      });
    }
    
    // For now, allow all executions (will be enhanced with real policy engine)
    return { allowed: true, auditEntries };
  }
}