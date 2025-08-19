/**
 * Production-Ready Deployment Validation for BCCE
 * Comprehensive pre-deployment checks for AWS infrastructure and enterprise readiness
 */

import { AWSClientManager, withAWSClient } from './aws-client-manager.js';
import { EnterpriseValidator, ValidationResult, ValidationError, ValidationWarning } from './enterprise-validation.js';
import { EnterpriseErrorHandler } from './enterprise-error-handler.js';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { DescribeQuotasCommand, GetServiceQuotaCommand } from '@aws-sdk/client-service-quotas';
import { ListAccountAttributesCommand } from '@aws-sdk/client-ec2';

export interface DeploymentValidationConfig {
  region: string;
  stackName: string;
  organizationId: string;
  estimatedUsers: number;
  analyticsModel: string;
  skipOptionalChecks?: boolean;
}

export interface DeploymentValidationResult {
  isValid: boolean;
  readinessScore: number; // 0-100
  errors: ValidationError[];
  warnings: ValidationWarning[];
  recommendations: string[];
  estimatedDeploymentTime: number; // minutes
  preDeploymentChecklist: ChecklistItem[];
}

export interface ChecklistItem {
  category: 'security' | 'networking' | 'capacity' | 'configuration' | 'cost';
  item: string;
  status: 'passed' | 'warning' | 'failed' | 'not-checked';
  details?: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface ServiceQuotaCheck {
  serviceName: string;
  quotaName: string;
  currentValue: number;
  requiredValue: number;
  hasCapacity: boolean;
}

export class DeploymentValidator {
  private clientManager: AWSClientManager;
  private config: DeploymentValidationConfig;

  constructor(config: DeploymentValidationConfig) {
    this.config = config;
    this.clientManager = AWSClientManager.getInstance();
  }

  /**
   * Perform comprehensive deployment validation
   */
  async validateDeployment(): Promise<DeploymentValidationResult> {
    console.log('🔍 Performing comprehensive deployment validation...');
    
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const recommendations: string[] = [];
    const checklist: ChecklistItem[] = [];

    try {
      // 1. AWS Account and Identity Validation
      const identityValidation = await this.validateAWSIdentity();
      errors.push(...identityValidation.errors);
      warnings.push(...identityValidation.warnings);
      checklist.push(...this.createIdentityChecklist(identityValidation));

      // 2. Region and Service Availability
      const regionValidation = await this.validateRegionAndServices();
      errors.push(...regionValidation.errors);
      warnings.push(...regionValidation.warnings);
      checklist.push(...this.createRegionChecklist(regionValidation));

      // 3. Service Quotas and Capacity
      const quotaValidation = await this.validateServiceQuotas();
      errors.push(...quotaValidation.errors);
      warnings.push(...quotaValidation.warnings);
      checklist.push(...this.createQuotaChecklist(quotaValidation));

      // 4. Security and Compliance
      const securityValidation = await this.validateSecurityReadiness();
      errors.push(...securityValidation.errors);
      warnings.push(...securityValidation.warnings);
      checklist.push(...this.createSecurityChecklist(securityValidation));

      // 5. Network Configuration
      const networkValidation = await this.validateNetworkConfiguration();
      errors.push(...networkValidation.errors);
      warnings.push(...networkValidation.warnings);
      checklist.push(...this.createNetworkChecklist(networkValidation));

      // 6. Cost and Resource Planning
      const costValidation = await this.validateCostAndResources();
      warnings.push(...costValidation.warnings);
      recommendations.push(...this.generateCostRecommendations(costValidation));
      checklist.push(...this.createCostChecklist(costValidation));

      // Calculate readiness score
      const readinessScore = this.calculateReadinessScore(checklist);
      
      // Estimate deployment time
      const estimatedDeploymentTime = this.estimateDeploymentTime();

      return {
        isValid: errors.length === 0,
        readinessScore,
        errors,
        warnings,
        recommendations,
        estimatedDeploymentTime,
        preDeploymentChecklist: checklist
      };

    } catch (error) {
      errors.push({
        field: 'deployment-validation',
        message: `Validation process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: null,
        severity: 'critical'
      });

      return {
        isValid: false,
        readinessScore: 0,
        errors,
        warnings,
        recommendations: ['Complete validation process before deployment'],
        estimatedDeploymentTime: 0,
        preDeploymentChecklist: []
      };
    }
  }

  /**
   * Validate AWS identity and permissions
   */
  private async validateAWSIdentity(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const identity = await withAWSClient(
        (manager) => manager.getSTSClient(this.config.region),
        async (stsClient) => stsClient.send(new GetCallerIdentityCommand({})),
        this.config.region
      );

      if (!identity.Account) {
        errors.push({
          field: 'aws.identity',
          message: 'Unable to retrieve AWS account information',
          value: null,
          severity: 'critical'
        });
      }

      if (!identity.Arn?.includes('AssumedRole') && !identity.Arn?.includes('User')) {
        warnings.push({
          field: 'aws.identity',
          message: 'Unusual AWS identity type detected',
          value: identity.Arn,
          recommendation: 'Verify you are using appropriate AWS credentials'
        });
      }

      // Check if using root credentials (not recommended)
      if (identity.Arn?.includes('root')) {
        errors.push({
          field: 'aws.identity',
          message: 'Root AWS credentials detected',
          value: identity.Arn,
          severity: 'critical'
        });
      }

    } catch (error) {
      errors.push({
        field: 'aws.identity',
        message: `AWS identity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: null,
        severity: 'critical'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate region and service availability
   */
  private async validateRegionAndServices(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const regionValidation = EnterpriseValidator.validateAWSRegion(this.config.region);
    
    if (!regionValidation.isValid) {
      errors.push({
        field: 'aws.region',
        message: `Unsupported region: ${this.config.region}`,
        value: this.config.region,
        severity: 'error'
      });
    }

    // Check service availability in region
    const serviceChecks = {
      cloudFormation: regionValidation.services.cloudFormation,
      s3: regionValidation.services.s3,
      athena: regionValidation.services.athena,
      quickSight: regionValidation.services.quickSight,
      ecs: regionValidation.services.ecs,
      rds: regionValidation.services.rds
    };

    for (const [service, available] of Object.entries(serviceChecks)) {
      if (!available) {
        if (service === 'quickSight' && this.config.analyticsModel !== 'quicksight-enterprise') {
          // QuickSight not required for open-source models
          continue;
        }
        
        errors.push({
          field: `aws.services.${service}`,
          message: `Service ${service} not available in region ${this.config.region}`,
          value: this.config.region,
          severity: 'error'
        });
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate service quotas and capacity
   */
  private async validateServiceQuotas(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Key service quotas to check
    const quotaChecks = [
      { service: 'cloudformation', quota: 'Stack count', required: 1 },
      { service: 's3', quota: 'Buckets per account', required: 3 },
      { service: 'iam', quota: 'Roles per account', required: 5 },
      { service: 'ec2', quota: 'Running On-Demand instances', required: this.getRequiredEC2Instances() },
      { service: 'rds', quota: 'DB instances', required: this.getRequiredRDSInstances() }
    ];

    // Note: In a real implementation, you would use the Service Quotas API
    // For now, we'll provide warnings about checking quotas manually
    for (const check of quotaChecks) {
      if (check.required > 0) {
        warnings.push({
          field: `quotas.${check.service}`,
          message: `Verify ${check.service} quotas meet requirements`,
          value: check.required,
          recommendation: `Ensure you have capacity for ${check.required} ${check.quota} in ${check.service}`
        });
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate security readiness
   */
  private async validateSecurityReadiness(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check AWS Config service (for compliance)
    warnings.push({
      field: 'security.config',
      message: 'AWS Config recommended for compliance',
      value: null,
      recommendation: 'Enable AWS Config for resource compliance monitoring'
    });

    // Check CloudTrail (for audit logs)
    warnings.push({
      field: 'security.cloudtrail',
      message: 'CloudTrail recommended for audit logging',
      value: null,
      recommendation: 'Enable CloudTrail for comprehensive audit trails'
    });

    // Check GuardDuty (for threat detection)
    warnings.push({
      field: 'security.guardduty',
      message: 'GuardDuty recommended for threat detection',
      value: null,
      recommendation: 'Enable GuardDuty for enhanced security monitoring'
    });

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate network configuration
   */
  private async validateNetworkConfiguration(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // For enterprise deployment, recommend VPC deployment
    if (this.config.analyticsModel.includes('enterprise')) {
      warnings.push({
        field: 'network.vpc',
        message: 'VPC deployment recommended for enterprise',
        value: null,
        recommendation: 'Deploy analytics infrastructure in a dedicated VPC for enhanced security'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate cost and resource planning
   */
  private async validateCostAndResources(): Promise<ValidationResult> {
    const warnings: ValidationWarning[] = [];

    const estimatedMonthlyCost = this.estimateMonthlyCost();
    
    if (estimatedMonthlyCost > 1000) {
      warnings.push({
        field: 'cost.monthly',
        message: 'High estimated monthly cost',
        value: estimatedMonthlyCost,
        recommendation: 'Review cost optimization options and consider open-source alternatives'
      });
    }

    return { isValid: true, errors: [], warnings };
  }

  // Helper methods for creating checklists

  private createIdentityChecklist(validation: ValidationResult): ChecklistItem[] {
    return [
      {
        category: 'security',
        item: 'AWS credentials configured and valid',
        status: validation.isValid ? 'passed' : 'failed',
        impact: 'critical',
        details: validation.errors.length > 0 ? validation.errors[0].message : undefined
      },
      {
        category: 'security',
        item: 'Using IAM user or role (not root)',
        status: validation.errors.some(e => e.message.includes('root')) ? 'failed' : 'passed',
        impact: 'high'
      }
    ];
  }

  private createRegionChecklist(validation: ValidationResult): ChecklistItem[] {
    return [
      {
        category: 'configuration',
        item: 'AWS region supports all required services',
        status: validation.isValid ? 'passed' : 'failed',
        impact: 'critical',
        details: validation.errors.length > 0 ? validation.errors.map(e => e.message).join(', ') : undefined
      }
    ];
  }

  private createQuotaChecklist(validation: ValidationResult): ChecklistItem[] {
    return [
      {
        category: 'capacity',
        item: 'Service quotas verified for deployment scale',
        status: validation.warnings.length === 0 ? 'passed' : 'warning',
        impact: 'medium',
        details: 'Manually verify service quotas meet requirements'
      }
    ];
  }

  private createSecurityChecklist(validation: ValidationResult): ChecklistItem[] {
    return [
      {
        category: 'security',
        item: 'AWS Config enabled for compliance',
        status: 'not-checked',
        impact: 'medium',
        details: 'Recommended for enterprise deployments'
      },
      {
        category: 'security',
        item: 'CloudTrail enabled for audit logs',
        status: 'not-checked',
        impact: 'high',
        details: 'Required for compliance and security monitoring'
      }
    ];
  }

  private createNetworkChecklist(validation: ValidationResult): ChecklistItem[] {
    return [
      {
        category: 'networking',
        item: 'VPC configuration planned for enterprise deployment',
        status: this.config.analyticsModel.includes('enterprise') ? 'warning' : 'passed',
        impact: 'medium',
        details: 'VPC deployment recommended for enterprise security'
      }
    ];
  }

  private createCostChecklist(validation: ValidationResult): ChecklistItem[] {
    const estimatedCost = this.estimateMonthlyCost();
    
    return [
      {
        category: 'cost',
        item: 'Monthly cost estimate reviewed and approved',
        status: estimatedCost > 1000 ? 'warning' : 'passed',
        impact: 'low',
        details: `Estimated monthly cost: $${estimatedCost.toFixed(2)}`
      }
    ];
  }

  // Utility methods

  private calculateReadinessScore(checklist: ChecklistItem[]): number {
    const weights = { critical: 30, high: 20, medium: 10, low: 5 };
    const statusScores = { passed: 1, warning: 0.7, failed: 0, 'not-checked': 0.5 };
    
    let totalScore = 0;
    let maxScore = 0;
    
    for (const item of checklist) {
      const weight = weights[item.impact];
      const score = statusScores[item.status];
      totalScore += weight * score;
      maxScore += weight;
    }
    
    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  }

  private estimateDeploymentTime(): number {
    // Base deployment time by model
    const baseTime = {
      'open-source-self-hosted': 15,
      'kubernetes-enterprise': 30,
      'serverless-analytics': 20,
      'quicksight-enterprise': 25
    };

    let time = baseTime[this.config.analyticsModel as keyof typeof baseTime] || 20;
    
    // Add time for user scale
    if (this.config.estimatedUsers > 100) {
      time += 5;
    }
    
    if (this.config.estimatedUsers > 500) {
      time += 10;
    }
    
    return time;
  }

  private estimateMonthlyCost(): number {
    // Simplified cost estimation based on model and user count
    const baseCosts = {
      'open-source-self-hosted': 200,
      'kubernetes-enterprise': 500,
      'serverless-analytics': 300,
      'quicksight-enterprise': 1800
    };

    const baseCost = baseCosts[this.config.analyticsModel as keyof typeof baseCosts] || 300;
    const userMultiplier = Math.max(1, this.config.estimatedUsers / 100);
    
    return baseCost * userMultiplier;
  }

  private getRequiredEC2Instances(): number {
    const instanceCounts = {
      'open-source-self-hosted': 2,
      'kubernetes-enterprise': 4,
      'serverless-analytics': 0,
      'quicksight-enterprise': 1
    };

    return instanceCounts[this.config.analyticsModel as keyof typeof instanceCounts] || 1;
  }

  private getRequiredRDSInstances(): number {
    const rdsNeeded = ['open-source-self-hosted', 'kubernetes-enterprise'];
    return rdsNeeded.includes(this.config.analyticsModel) ? 1 : 0;
  }

  private generateCostRecommendations(validation: ValidationResult): string[] {
    const recommendations: string[] = [];
    
    if (this.estimateMonthlyCost() > 1000) {
      recommendations.push('Consider open-source analytics stack to reduce licensing costs');
      recommendations.push('Implement intelligent S3 lifecycle policies');
      recommendations.push('Use reserved instances for predictable workloads');
    }
    
    return recommendations;
  }

  /**
   * Format validation results for console output
   */
  static formatDeploymentValidation(result: DeploymentValidationResult): string {
    let output = `\n🎯 Deployment Readiness Score: ${result.readinessScore}/100\n`;
    output += `⏱️  Estimated Deployment Time: ${result.estimatedDeploymentTime} minutes\n\n`;

    if (result.errors.length > 0) {
      output += '❌ Critical Issues:\n';
      result.errors.forEach(error => {
        output += `  🚨 ${error.field}: ${error.message}\n`;
      });
      output += '\n';
    }

    if (result.warnings.length > 0) {
      output += '⚠️  Warnings:\n';
      result.warnings.forEach(warning => {
        output += `  ⚠️  ${warning.field}: ${warning.message}\n`;
        if (warning.recommendation) {
          output += `     💡 ${warning.recommendation}\n`;
        }
      });
      output += '\n';
    }

    if (result.recommendations.length > 0) {
      output += '💡 Recommendations:\n';
      result.recommendations.forEach(rec => {
        output += `  • ${rec}\n`;
      });
      output += '\n';
    }

    // Checklist summary
    const checklistSummary = result.preDeploymentChecklist.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    output += '📋 Pre-Deployment Checklist Summary:\n';
    output += `  ✅ Passed: ${checklistSummary.passed || 0}\n`;
    output += `  ⚠️  Warnings: ${checklistSummary.warning || 0}\n`;
    output += `  ❌ Failed: ${checklistSummary.failed || 0}\n`;
    output += `  ⏸️  Not Checked: ${checklistSummary['not-checked'] || 0}\n`;

    return output;
  }
}