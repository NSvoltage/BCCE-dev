/**
 * Claude Code Workflow Adapter
 * Integrates Claude Code execution with BCCE enterprise governance
 */

import { BaseWorkflowAdapter, type Workflow, type GovernanceConfig, type GovernedResult, type ValidationResult } from '../workflow-adapter.js';
import { WorkflowRunner } from '../../lib/workflow-runner.js';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

export class ClaudeCodeAdapter extends BaseWorkflowAdapter {
  readonly engineType = 'claude_code' as const;
  
  async executeWithGovernance(
    workflow: Workflow, 
    governance: GovernanceConfig
  ): Promise<GovernedResult> {
    const workflowId = this.generateWorkflowId();
    const startTime = Date.now();
    
    try {
      // Apply governance checks
      const governanceResult = await this.applyGovernance(workflow, governance);
      
      if (!governanceResult.allowed) {
        return {
          status: 'blocked',
          workflowId,
          governance: {
            policiesApplied: governance.policies,
            complianceStatus: false,
            auditTrail: governanceResult.auditEntries,
            costSummary: {
              totalCost: 0,
              tokenCount: 0,
              duration: Date.now() - startTime
            }
          },
          errors: ['Workflow blocked by governance policies']
        };
      }
      
      // Create temporary workflow file for execution
      const tempDir = `/tmp/bcce-workflows`;
      fs.mkdirSync(tempDir, { recursive: true });
      const tempWorkflowPath = path.join(tempDir, `${workflowId}.yml`);
      
      // Convert workflow to YAML format expected by WorkflowRunner
      const workflowYaml = this.convertToRunnerFormat(workflow);
      fs.writeFileSync(tempWorkflowPath, yaml.stringify(workflowYaml));
      
      // Execute using existing WorkflowRunner
      const runner = new WorkflowRunner(workflowId);
      const result = await runner.run(tempWorkflowPath, {
        dryRun: false
      });
      
      // Cleanup temp file
      fs.unlinkSync(tempWorkflowPath);
      
      // Calculate cost summary (mock implementation)
      const costSummary = {
        totalCost: this.estimateCost(workflow),
        tokenCount: this.estimateTokens(workflow),
        duration: Date.now() - startTime
      };
      
      // Create comprehensive audit trail
      const auditTrail = [
        ...governanceResult.auditEntries,
        {
          timestamp: new Date(),
          event: 'workflow_execution',
          details: {
            engine: 'claude_code',
            status: result.status,
            steps: workflow.steps.length
          },
          cost: costSummary.totalCost
        }
      ];
      
      return {
        status: result.status === 'completed' ? 'completed' : 'failed',
        workflowId,
        governance: {
          policiesApplied: governance.policies,
          complianceStatus: true,
          auditTrail,
          costSummary
        },
        executionResult: result,
        errors: result.errors
      };
      
    } catch (error) {
      const auditTrail = [{
        timestamp: new Date(),
        event: 'workflow_error',
        details: {
          engine: 'claude_code',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }];
      
      return {
        status: 'failed',
        workflowId,
        governance: {
          policiesApplied: governance.policies,
          complianceStatus: false,
          auditTrail,
          costSummary: {
            totalCost: 0,
            tokenCount: 0,
            duration: Date.now() - startTime
          }
        },
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
  
  async validate(workflow: Workflow): Promise<ValidationResult> {
    const baseResult = await super.validate(workflow);
    
    // Add Claude Code specific validation
    const errors = [...baseResult.errors];
    const warnings = [...baseResult.warnings];
    
    // Check for Claude Code specific requirements
    for (const step of workflow.steps || []) {
      if (step.type === 'agent' && !step.policy) {
        errors.push(`Step '${step.id}': agent steps require policy configuration`);
      }
      
      if (step.type === 'prompt' && !step.prompt_file) {
        errors.push(`Step '${step.id}': prompt steps require prompt_file`);
      }
      
      // Warn about deprecated features
      if (step.available_tools?.includes('Bash')) {
        warnings.push(`Step '${step.id}': Bash tool is deprecated, use Cmd instead`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  private generateWorkflowId(): string {
    return `claude-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  private convertToRunnerFormat(workflow: Workflow): any {
    // Convert BCCE workflow format to existing WorkflowRunner format
    return {
      version: workflow.version || 1,
      workflow: workflow.workflow,
      model: workflow.model || process.env.BEDROCK_MODEL_ID,
      guardrails: workflow.guardrails || [],
      env: workflow.env || {},
      steps: workflow.steps
    };
  }
  
  private estimateCost(workflow: Workflow): number {
    // Simple cost estimation based on steps and complexity
    // In real implementation, this would use AWS Pricing API
    const baseCostPerStep = 0.01;
    const agentStepMultiplier = 10;
    
    let totalCost = 0;
    for (const step of workflow.steps) {
      if (step.type === 'agent') {
        totalCost += baseCostPerStep * agentStepMultiplier;
      } else {
        totalCost += baseCostPerStep;
      }
    }
    
    return Math.round(totalCost * 100) / 100; // Round to 2 decimal places
  }
  
  private estimateTokens(workflow: Workflow): number {
    // Simple token estimation
    // In real implementation, this would use model-specific token counting
    return workflow.steps.length * 1000; // Rough estimate
  }
}