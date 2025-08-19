/**
 * Enterprise-Grade Input Validation for BCCE
 * Provides comprehensive validation for AWS configurations, deployment parameters, and user inputs
 */

import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  value: any;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  field: string;
  message: string;
  value: any;
  recommendation: string;
}

export interface AWSRegionValidation {
  region: string;
  isValid: boolean;
  services: {
    cloudFormation: boolean;
    s3: boolean;
    athena: boolean;
    quickSight: boolean;
    ecs: boolean;
    rds: boolean;
  };
}

export interface DeploymentConfigValidation {
  stackName: string;
  region: string;
  organizationId: string;
  analyticsModel: string;
  estimatedUsers: number;
}

export class EnterpriseValidator {
  private static readonly ajv = new Ajv({ allErrors: true, strict: false });
  
  // AWS regions that support all required services
  private static readonly SUPPORTED_AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
    'ca-central-1', 'sa-east-1'
  ];

  private static readonly VALID_ANALYTICS_MODELS = [
    'open-source-self-hosted',
    'kubernetes-enterprise',
    'serverless-analytics',
    'quicksight-enterprise'
  ];

  private static readonly VALID_DASHBOARD_PLATFORMS = [
    'grafana',
    'metabase',
    'superset'
  ];

  static {
    addFormats(this.ajv);
  }

  /**
   * Validate deployment configuration comprehensively
   */
  static validateDeploymentConfig(config: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate stack name
    const stackNameValidation = this.validateStackName(config.stackName);
    if (!stackNameValidation.isValid) {
      errors.push({
        field: 'stackName',
        message: 'Invalid CloudFormation stack name',
        value: config.stackName,
        severity: 'error'
      });
    }

    // Validate region
    const regionValidation = this.validateAWSRegion(config.region);
    if (!regionValidation.isValid) {
      errors.push({
        field: 'region',
        message: `Unsupported AWS region: ${config.region}`,
        value: config.region,
        severity: 'error'
      });
    }

    // Validate organization ID
    if (!this.validateOrganizationId(config.organizationId)) {
      errors.push({
        field: 'organizationId',
        message: 'Organization ID must be 3-50 characters, alphanumeric with hyphens',
        value: config.organizationId,
        severity: 'error'
      });
    }

    // Validate analytics configuration
    if (config.analytics) {
      const analyticsValidation = this.validateAnalyticsConfig(config.analytics);
      errors.push(...analyticsValidation.errors);
      warnings.push(...analyticsValidation.warnings);
    }

    // Security validations
    const securityValidation = this.validateSecurityConfig(config);
    errors.push(...securityValidation.errors);
    warnings.push(...securityValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate AWS region and service availability
   */
  static validateAWSRegion(region: string): AWSRegionValidation {
    const isSupported = this.SUPPORTED_AWS_REGIONS.includes(region);
    
    return {
      region,
      isValid: isSupported,
      services: {
        cloudFormation: isSupported,
        s3: isSupported,
        athena: isSupported && region !== 'ap-northeast-3', // Athena not available in all regions
        quickSight: isSupported && !['ca-central-1', 'sa-east-1'].includes(region),
        ecs: isSupported,
        rds: isSupported
      }
    };
  }

  /**
   * Validate CloudFormation stack name
   */
  static validateStackName(stackName: string): { isValid: boolean; message?: string } {
    if (!stackName || typeof stackName !== 'string') {
      return { isValid: false, message: 'Stack name is required' };
    }

    // CloudFormation stack name requirements
    const stackNameRegex = /^[a-zA-Z][a-zA-Z0-9-]*$/;
    
    if (!stackNameRegex.test(stackName)) {
      return { isValid: false, message: 'Stack name must start with a letter and contain only letters, numbers, and hyphens' };
    }

    if (stackName.length < 1 || stackName.length > 128) {
      return { isValid: false, message: 'Stack name must be 1-128 characters long' };
    }

    if (stackName.endsWith('-')) {
      return { isValid: false, message: 'Stack name cannot end with a hyphen' };
    }

    return { isValid: true };
  }

  /**
   * Validate organization ID
   */
  static validateOrganizationId(orgId: string): boolean {
    if (!orgId || typeof orgId !== 'string') {
      return false;
    }

    // Must be 3-50 characters, alphanumeric with hyphens, not start/end with hyphen
    const orgIdRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,48}[a-zA-Z0-9]$/;
    return orgIdRegex.test(orgId);
  }

  /**
   * Validate analytics configuration
   */
  static validateAnalyticsConfig(analytics: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate analytics model
    if (!this.VALID_ANALYTICS_MODELS.includes(analytics.model)) {
      errors.push({
        field: 'analytics.model',
        message: `Invalid analytics model. Must be one of: ${this.VALID_ANALYTICS_MODELS.join(', ')}`,
        value: analytics.model,
        severity: 'error'
      });
    }

    // Validate estimated users
    if (typeof analytics.estimatedUsers !== 'number' || analytics.estimatedUsers < 1 || analytics.estimatedUsers > 10000) {
      errors.push({
        field: 'analytics.estimatedUsers',
        message: 'Estimated users must be between 1 and 10,000',
        value: analytics.estimatedUsers,
        severity: 'error'
      });
    }

    // Validate cost estimate
    if (typeof analytics.monthlyCostEstimate !== 'number' || analytics.monthlyCostEstimate < 0) {
      errors.push({
        field: 'analytics.monthlyCostEstimate',
        message: 'Monthly cost estimate must be a positive number',
        value: analytics.monthlyCostEstimate,
        severity: 'error'
      });
    }

    // Cost optimization warnings
    if (analytics.monthlyCostEstimate > 5000) {
      warnings.push({
        field: 'analytics.monthlyCostEstimate',
        message: 'High monthly cost estimate',
        value: analytics.monthlyCostEstimate,
        recommendation: 'Consider using open-source alternatives to reduce costs'
      });
    }

    // Validate dashboard platform if specified
    if (analytics.configuration?.platform && !this.VALID_DASHBOARD_PLATFORMS.includes(analytics.configuration.platform)) {
      errors.push({
        field: 'analytics.configuration.platform',
        message: `Invalid dashboard platform. Must be one of: ${this.VALID_DASHBOARD_PLATFORMS.join(', ')}`,
        value: analytics.configuration.platform,
        severity: 'error'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate security configuration
   */
  static validateSecurityConfig(config: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if encryption is enabled
    if (config.analytics?.configuration?.encryption === false) {
      errors.push({
        field: 'analytics.configuration.encryption',
        message: 'Encryption must be enabled for enterprise deployment',
        value: false,
        severity: 'critical'
      });
    }

    // Check authentication configuration
    if (config.auth !== 'identity-center' && config.auth !== 'cognito-oidc') {
      errors.push({
        field: 'auth',
        message: 'Authentication must be either identity-center or cognito-oidc',
        value: config.auth,
        severity: 'error'
      });
    }

    // Check if guardrails are disabled
    if (config.guardrails === false) {
      warnings.push({
        field: 'guardrails',
        message: 'Guardrails are disabled',
        value: false,
        recommendation: 'Enable guardrails for enhanced security and compliance'
      });
    }

    // Check if PrivateLink is disabled
    if (config.privatelink === false) {
      warnings.push({
        field: 'privatelink',
        message: 'PrivateLink is disabled',
        value: false,
        recommendation: 'Enable PrivateLink for enhanced network security'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate AWS credentials and permissions
   */
  static async validateAWSCredentials(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for AWS credentials
    const hasCredentials = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_ROLE_ARN;
    
    if (!hasCredentials) {
      errors.push({
        field: 'aws.credentials',
        message: 'AWS credentials not found',
        value: null,
        severity: 'critical'
      });
    }

    // Check AWS region
    if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
      warnings.push({
        field: 'aws.region',
        message: 'AWS region not set',
        value: null,
        recommendation: 'Set AWS_REGION environment variable'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate resource names for AWS compliance
   */
  static validateResourceName(name: string, resourceType: 'bucket' | 'role' | 'policy' | 'key'): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!name || typeof name !== 'string') {
      errors.push({
        field: 'resourceName',
        message: 'Resource name is required',
        value: name,
        severity: 'error'
      });
      return { isValid: false, errors, warnings };
    }

    switch (resourceType) {
      case 'bucket':
        if (!/^[a-z0-9.-]{3,63}$/.test(name)) {
          errors.push({
            field: 'resourceName',
            message: 'S3 bucket name must be 3-63 characters, lowercase letters, numbers, dots, and hyphens only',
            value: name,
            severity: 'error'
          });
        }
        if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) {
          errors.push({
            field: 'resourceName',
            message: 'S3 bucket name cannot start/end with dots or contain consecutive dots',
            value: name,
            severity: 'error'
          });
        }
        break;

      case 'role':
        if (!/^[a-zA-Z0-9+=,.@_-]{1,64}$/.test(name)) {
          errors.push({
            field: 'resourceName',
            message: 'IAM role name must be 1-64 characters, alphanumeric with specific special characters only',
            value: name,
            severity: 'error'
          });
        }
        break;

      case 'policy':
        if (!/^[a-zA-Z0-9+=,.@_-]{1,128}$/.test(name)) {
          errors.push({
            field: 'resourceName',
            message: 'IAM policy name must be 1-128 characters, alphanumeric with specific special characters only',
            value: name,
            severity: 'error'
          });
        }
        break;

      case 'key':
        if (name.length > 256) {
          errors.push({
            field: 'resourceName',
            message: 'KMS key alias must be 256 characters or less',
            value: name,
            severity: 'error'
          });
        }
        break;
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Format validation results for display
   */
  static formatValidationResults(result: ValidationResult): string {
    let output = '';

    if (result.errors.length > 0) {
      output += '❌ Validation Errors:\n';
      result.errors.forEach(error => {
        const severity = error.severity === 'critical' ? '🚨' : '❌';
        output += `  ${severity} ${error.field}: ${error.message}\n`;
        if (error.value !== undefined) {
          output += `     Current value: ${JSON.stringify(error.value)}\n`;
        }
      });
    }

    if (result.warnings.length > 0) {
      output += '\n⚠️  Validation Warnings:\n';
      result.warnings.forEach(warning => {
        output += `  ⚠️  ${warning.field}: ${warning.message}\n`;
        if (warning.value !== undefined) {
          output += `     Current value: ${JSON.stringify(warning.value)}\n`;
        }
        output += `     Recommendation: ${warning.recommendation}\n`;
      });
    }

    if (result.isValid) {
      output += '✅ All validations passed\n';
    }

    return output;
  }

  /**
   * Validate JSON schema
   */
  static validateSchema<T>(data: any, schema: JSONSchemaType<T>): ValidationResult {
    const validate = this.ajv.compile(schema);
    const isValid = validate(data);

    const errors: ValidationError[] = [];
    
    if (!isValid && validate.errors) {
      validate.errors.forEach(error => {
        errors.push({
          field: error.instancePath || error.schemaPath,
          message: error.message || 'Validation failed',
          value: error.data,
          severity: 'error'
        });
      });
    }

    return {
      isValid,
      errors,
      warnings: []
    };
  }
}