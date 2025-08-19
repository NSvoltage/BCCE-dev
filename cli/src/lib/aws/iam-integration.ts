/**
 * IAM Integration for BCCE
 * Provides role-based access control, policy management, and identity federation
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export interface IAMConfig {
  region?: string;
  accountId?: string;
  enableMFA?: boolean;
  enableSessionTags?: boolean;
  maxSessionDuration?: number; // seconds
}

export interface IAMRole {
  name: string;
  arn?: string;
  description?: string;
  assumeRolePolicyDocument: AssumeRolePolicy;
  policies: IAMPolicy[];
  tags?: Record<string, string>;
  maxSessionDuration?: number;
  permissionsBoundary?: string;
}

export interface AssumeRolePolicy {
  Version: string;
  Statement: Array<{
    Effect: 'Allow' | 'Deny';
    Principal: {
      Service?: string | string[];
      AWS?: string | string[];
      Federated?: string | string[];
    };
    Action: string | string[];
    Condition?: Record<string, any>;
  }>;
}

export interface IAMPolicy {
  name: string;
  arn?: string;
  type: 'inline' | 'managed' | 'custom';
  document?: PolicyDocument;
  description?: string;
}

export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

export interface PolicyStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, any>;
}

export interface STSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  assumedRoleArn?: string;
}

export interface PermissionSet {
  name: string;
  description: string;
  level: 'read-only' | 'developer' | 'admin' | 'custom';
  workflows: string[];
  resources: ResourcePermission[];
  conditions?: AccessCondition[];
}

export interface ResourcePermission {
  service: string;
  actions: string[];
  resources: string[];
  effect?: 'Allow' | 'Deny';
}

export interface AccessCondition {
  type: 'ip-address' | 'mfa' | 'time-based' | 'tag-based' | 'service-principal';
  operator: string;
  values: string[];
}

export interface IdentityProvider {
  type: 'saml' | 'oidc' | 'cognito';
  name: string;
  arn?: string;
  metadata?: string;
  clientIds?: string[];
  thumbprints?: string[];
}

export class IAMIntegration extends EventEmitter {
  private config: IAMConfig;
  private roles: Map<string, IAMRole> = new Map();
  private policies: Map<string, IAMPolicy> = new Map();
  private permissionSets: Map<string, PermissionSet> = new Map();
  private identityProviders: Map<string, IdentityProvider> = new Map();
  private sessionCache: Map<string, STSCredentials> = new Map();
  private mockMode = false;
  private sts?: STSClient;
  private accountIdCache?: string;

  constructor(config: IAMConfig = {}) {
    super();
    this.config = {
      region: process.env.AWS_REGION || 'us-east-1',
      accountId: process.env.AWS_ACCOUNT_ID || undefined, // Will fetch dynamically if not provided
      enableMFA: true,
      enableSessionTags: true,
      maxSessionDuration: 3600, // 1 hour default
      ...config,
    };
    this.sts = new STSClient({ region: this.config.region });
    this.initializeIAM();
  }

  /**
   * Enable mock mode for testing
   */
  enableMockMode(): void {
    this.mockMode = true;
    console.log('IAM Integration running in mock mode');
  }

  /**
   * Get AWS account ID dynamically
   */
  private async getAccountId(): Promise<string> {
    if (this.config.accountId) {
      return this.config.accountId;
    }

    if (this.accountIdCache) {
      return this.accountIdCache;
    }

    if (this.mockMode) {
      return '123456789012'; // Mock account ID for testing
    }

    try {
      const response = await this.sts!.send(new GetCallerIdentityCommand({}));
      if (!response.Account) {
        throw new Error('Unable to retrieve AWS account ID from STS');
      }
      this.accountIdCache = response.Account;
      return this.accountIdCache;
    } catch (error) {
      throw new Error(`Failed to get AWS account ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async initializeIAM(): Promise<void> {
    // Create default permission sets
    await this.createDefaultPermissionSets();
    
    // Create default roles
    await this.createDefaultRoles();

    if (this.mockMode) {
      console.log('Mock mode: IAM integration initialized');
    }
  }

  /**
   * Create an IAM role for BCCE workflows
   */
  async createRole(role: IAMRole): Promise<string> {
    try {
      const roleArn = this.generateRoleArn(role.name);
      role.arn = roleArn;

      if (this.mockMode) {
        this.roles.set(role.name, role);
        console.log(`Mock mode: Role created - ${role.name}`);
        this.emit('role-created', role);
        return roleArn;
      }

      // In production, create role using AWS SDK
      await this.createIAMRole(role);
      this.roles.set(role.name, role);
      
      this.emit('role-created', role);
      return roleArn;
    } catch (error) {
      console.error(`Failed to create role ${role.name}:`, error);
      throw error;
    }
  }

  /**
   * Create a custom IAM policy
   */
  async createPolicy(policy: IAMPolicy): Promise<string> {
    try {
      const policyArn = this.generatePolicyArn(policy.name);
      policy.arn = policyArn;

      if (this.mockMode) {
        this.policies.set(policy.name, policy);
        console.log(`Mock mode: Policy created - ${policy.name}`);
        this.emit('policy-created', policy);
        return policyArn;
      }

      // In production, create policy using AWS SDK
      await this.createIAMPolicy(policy);
      this.policies.set(policy.name, policy);
      
      this.emit('policy-created', policy);
      return policyArn;
    } catch (error) {
      console.error(`Failed to create policy ${policy.name}:`, error);
      throw error;
    }
  }

  /**
   * Assume a role and get temporary credentials
   */
  async assumeRole(
    roleArn: string,
    sessionName: string,
    options?: {
      duration?: number;
      mfaToken?: string;
      sessionTags?: Record<string, string>;
      externalId?: string;
    }
  ): Promise<STSCredentials> {
    try {
      // Check cache first
      const cacheKey = `${roleArn}-${sessionName}`;
      const cached = this.sessionCache.get(cacheKey);
      if (cached && cached.expiration > new Date()) {
        return cached;
      }

      const credentials: STSCredentials = {
        accessKeyId: this.mockMode ? 'MOCK-ACCESS-KEY' : '',
        secretAccessKey: this.mockMode ? 'MOCK-SECRET-KEY' : '',
        sessionToken: this.mockMode ? 'MOCK-SESSION-TOKEN' : '',
        expiration: new Date(Date.now() + (options?.duration || this.config.maxSessionDuration!) * 1000),
        assumedRoleArn: roleArn,
      };

      if (this.mockMode) {
        console.log(`Mock mode: Assumed role ${roleArn} for session ${sessionName}`);
        this.sessionCache.set(cacheKey, credentials);
        this.emit('role-assumed', { roleArn, sessionName });
        return credentials;
      }

      // In production, assume role using AWS STS
      const stsCredentials = await this.assumeRoleWithSTS(roleArn, sessionName, options);
      this.sessionCache.set(cacheKey, stsCredentials);
      
      this.emit('role-assumed', { roleArn, sessionName });
      return stsCredentials;
    } catch (error) {
      console.error(`Failed to assume role ${roleArn}:`, error);
      throw error;
    }
  }

  /**
   * Create a permission set for team/project access control
   */
  async createPermissionSet(permissionSet: PermissionSet): Promise<void> {
    try {
      // Generate corresponding IAM policy
      const policy = this.generatePolicyFromPermissionSet(permissionSet);
      await this.createPolicy(policy);

      // Generate IAM role
      const role = this.generateRoleFromPermissionSet(permissionSet);
      await this.createRole(role);

      this.permissionSets.set(permissionSet.name, permissionSet);
      this.emit('permission-set-created', permissionSet);
    } catch (error) {
      console.error(`Failed to create permission set ${permissionSet.name}:`, error);
      throw error;
    }
  }

  /**
   * Configure identity provider for federation
   */
  async configureIdentityProvider(provider: IdentityProvider): Promise<string> {
    try {
      const providerArn = this.generateProviderArn(provider.type, provider.name);
      provider.arn = providerArn;

      if (this.mockMode) {
        this.identityProviders.set(provider.name, provider);
        console.log(`Mock mode: Identity provider configured - ${provider.name}`);
        this.emit('identity-provider-configured', provider);
        return providerArn;
      }

      // In production, configure identity provider using AWS SDK
      await this.configureIdP(provider);
      this.identityProviders.set(provider.name, provider);
      
      this.emit('identity-provider-configured', provider);
      return providerArn;
    } catch (error) {
      console.error(`Failed to configure identity provider ${provider.name}:`, error);
      throw error;
    }
  }

  /**
   * Validate permissions for a specific action
   */
  async validatePermissions(
    principal: string,
    action: string,
    resource: string,
    context?: Record<string, any>
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // Find applicable policies for the principal
      const applicablePolicies = await this.getApplicablePolicies(principal);
      
      // Evaluate policies
      for (const policy of applicablePolicies) {
        const result = this.evaluatePolicy(policy, action, resource, context);
        if (result.effect === 'Deny') {
          return { allowed: false, reason: `Denied by policy ${policy.name}` };
        }
      }

      // Check if any policy explicitly allows
      const allowingPolicy = applicablePolicies.find(p => 
        this.evaluatePolicy(p, action, resource, context).effect === 'Allow'
      );

      if (allowingPolicy) {
        return { allowed: true };
      }

      return { allowed: false, reason: 'No explicit allow found' };
    } catch (error) {
      console.error('Failed to validate permissions:', error);
      return { allowed: false, reason: 'Validation error' };
    }
  }

  /**
   * Generate least-privilege policy for a workflow
   */
  async generateWorkflowPolicy(
    workflowId: string,
    requiredActions: string[],
    resources: string[]
  ): Promise<IAMPolicy> {
    const policy: IAMPolicy = {
      name: `bcce-workflow-${workflowId}-policy`,
      type: 'custom',
      description: `Auto-generated least-privilege policy for workflow ${workflowId}`,
      document: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'WorkflowExecutionPermissions',
            Effect: 'Allow',
            Action: requiredActions,
            Resource: resources,
            Condition: {
              StringEquals: {
                'aws:RequestTag/WorkflowId': workflowId,
              },
            },
          },
          {
            Sid: 'BedrockModelAccess',
            Effect: 'Allow',
            Action: [
              'bedrock:InvokeModel',
              'bedrock:InvokeModelWithResponseStream',
            ],
            Resource: [
              `arn:aws:bedrock:${this.config.region}::foundation-model/anthropic.claude-*`,
            ],
          },
          {
            Sid: 'CloudWatchLogging',
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Resource: [
              `arn:aws:logs:${this.config.region}:${this.config.accountId}:log-group:/aws/bcce/*`,
            ],
          },
        ],
      },
    };

    await this.createPolicy(policy);
    return policy;
  }

  /**
   * Create service-linked role for BCCE
   */
  async createServiceLinkedRole(serviceName = 'bcce.amazonaws.com'): Promise<string> {
    const role: IAMRole = {
      name: `AWSServiceRoleFor${serviceName.split('.')[0].toUpperCase()}`,
      description: 'Service-linked role for BCCE',
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: serviceName,
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      policies: [
        {
          name: 'BCCEServicePolicy',
          type: 'inline',
          document: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'bedrock:*',
                  's3:GetObject',
                  's3:PutObject',
                  'cloudwatch:PutMetricData',
                  'events:PutEvents',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
    };

    return this.createRole(role);
  }

  /**
   * Audit IAM permissions and generate report
   */
  async auditPermissions(): Promise<{
    overprivileged: string[];
    unused: string[];
    recommendations: string[];
  }> {
    const audit = {
      overprivileged: [] as string[],
      unused: [] as string[],
      recommendations: [] as string[],
    };

    // Check for overly permissive policies
    for (const [name, policy] of this.policies) {
      if (policy.document) {
        for (const statement of policy.document.Statement) {
          if (statement.Effect === 'Allow' && 
              Array.isArray(statement.Action) && 
              statement.Action.includes('*')) {
            audit.overprivileged.push(`Policy ${name} has wildcard actions`);
            audit.recommendations.push(`Refine policy ${name} to use specific actions`);
          }
          if (statement.Effect === 'Allow' && 
              Array.isArray(statement.Resource) && 
              statement.Resource.includes('*')) {
            audit.overprivileged.push(`Policy ${name} has wildcard resources`);
            audit.recommendations.push(`Restrict policy ${name} to specific resources`);
          }
        }
      }
    }

    // Check for unused roles (simplified for mock)
    for (const [name, role] of this.roles) {
      // In production, would check CloudTrail for usage
      const lastUsed = this.mockMode ? Date.now() - Math.random() * 86400000 * 30 : 0;
      if (lastUsed > 86400000 * 30) { // 30 days
        audit.unused.push(`Role ${name} hasn't been used in 30+ days`);
        audit.recommendations.push(`Consider removing unused role ${name}`);
      }
    }

    // General recommendations
    if (!this.config.enableMFA) {
      audit.recommendations.push('Enable MFA for enhanced security');
    }

    if (this.roles.size > 10) {
      audit.recommendations.push('Consider consolidating roles to reduce complexity');
    }

    this.emit('audit-completed', audit);
    return audit;
  }

  /**
   * Rotate credentials for a role
   */
  async rotateCredentials(roleArn: string): Promise<void> {
    // Clear cached sessions for this role
    for (const [key, creds] of this.sessionCache) {
      if (creds.assumedRoleArn === roleArn) {
        this.sessionCache.delete(key);
      }
    }

    if (this.mockMode) {
      console.log(`Mock mode: Credentials rotated for role ${roleArn}`);
    } else {
      // In production, would rotate access keys
      await this.rotateRoleCredentials(roleArn);
    }

    this.emit('credentials-rotated', { roleArn });
  }

  // Private helper methods

  private async createDefaultPermissionSets(): Promise<void> {
    const defaultSets: PermissionSet[] = [
      {
        name: 'bcce-read-only',
        description: 'Read-only access to BCCE resources',
        level: 'read-only',
        workflows: ['*'],
        resources: [
          {
            service: 'bedrock',
            actions: ['bedrock:GetModel', 'bedrock:ListModels'],
            resources: ['*'],
          },
          {
            service: 's3',
            actions: ['s3:GetObject', 's3:ListBucket'],
            resources: [`arn:aws:s3:::bcce-*/*`],
          },
          {
            service: 'cloudwatch',
            actions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
            resources: ['*'],
          },
        ],
      },
      {
        name: 'bcce-developer',
        description: 'Developer access to BCCE resources',
        level: 'developer',
        workflows: ['*'],
        resources: [
          {
            service: 'bedrock',
            actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            resources: [`arn:aws:bedrock:*::foundation-model/anthropic.claude-*`],
          },
          {
            service: 's3',
            actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
            resources: [`arn:aws:s3:::bcce-*/*`],
          },
          {
            service: 'cloudwatch',
            actions: ['cloudwatch:PutMetricData'],
            resources: ['*'],
          },
        ],
        conditions: [
          {
            type: 'ip-address',
            operator: 'IpAddress',
            values: ['10.0.0.0/8', '172.16.0.0/12'],
          },
        ],
      },
      {
        name: 'bcce-admin',
        description: 'Admin access to BCCE resources',
        level: 'admin',
        workflows: ['*'],
        resources: [
          {
            service: '*',
            actions: ['*'],
            resources: ['*'],
            effect: 'Allow',
          },
        ],
        conditions: [
          {
            type: 'mfa',
            operator: 'Bool',
            values: ['true'],
          },
        ],
      },
    ];

    for (const set of defaultSets) {
      await this.createPermissionSet(set);
    }
  }

  private async createDefaultRoles(): Promise<void> {
    // Create execution role for workflows
    await this.createRole({
      name: 'BCCEWorkflowExecutionRole',
      description: 'Default execution role for BCCE workflows',
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: ['lambda.amazonaws.com', 'states.amazonaws.com'],
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      policies: [
        {
          name: 'BCCEWorkflowExecutionPolicy',
          type: 'inline',
          document: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'bedrock:InvokeModel',
                  's3:GetObject',
                  's3:PutObject',
                  'cloudwatch:PutMetricData',
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
      maxSessionDuration: 3600,
    });
  }

  private generateRoleArn(roleName: string): string {
    return `arn:aws:iam::${this.config.accountId}:role/${roleName}`;
  }

  private generatePolicyArn(policyName: string): string {
    return `arn:aws:iam::${this.config.accountId}:policy/${policyName}`;
  }

  private generateProviderArn(type: string, name: string): string {
    return `arn:aws:iam::${this.config.accountId}:${type}-provider/${name}`;
  }

  private generatePolicyFromPermissionSet(set: PermissionSet): IAMPolicy {
    const statements: PolicyStatement[] = set.resources.map(resource => ({
      Sid: `${set.name}-${resource.service}`,
      Effect: resource.effect || 'Allow',
      Action: resource.actions,
      Resource: resource.resources,
    }));

    // Add conditions if specified
    if (set.conditions && set.conditions.length > 0) {
      statements.forEach(stmt => {
        stmt.Condition = {};
        for (const condition of set.conditions) {
          stmt.Condition[condition.operator] = {
            [`aws:${condition.type}`]: condition.values,
          };
        }
      });
    }

    return {
      name: `${set.name}-policy`,
      type: 'custom',
      description: set.description,
      document: {
        Version: '2012-10-17',
        Statement: statements,
      },
    };
  }

  private generateRoleFromPermissionSet(set: PermissionSet): IAMRole {
    return {
      name: `${set.name}-role`,
      description: set.description,
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${this.config.accountId}:root`,
            },
            Action: 'sts:AssumeRole',
            Condition: set.conditions ? {
              StringEquals: {
                'sts:ExternalId': crypto.randomBytes(16).toString('hex'),
              },
            } : undefined,
          },
        ],
      },
      policies: [
        {
          name: `${set.name}-policy`,
          type: 'managed',
          arn: this.generatePolicyArn(`${set.name}-policy`),
        },
      ],
      tags: {
        'bcce:permission-set': set.name,
        'bcce:level': set.level,
      },
    };
  }

  private async getApplicablePolicies(principal: string): Promise<IAMPolicy[]> {
    // Simplified - in production would resolve all attached policies
    return Array.from(this.policies.values());
  }

  private evaluatePolicy(
    policy: IAMPolicy,
    action: string,
    resource: string,
    context?: Record<string, any>
  ): { effect: 'Allow' | 'Deny' | 'NoMatch' } {
    if (!policy.document) return { effect: 'NoMatch' };

    for (const statement of policy.document.Statement) {
      const actionMatch = this.matchAction(action, statement.Action);
      const resourceMatch = this.matchResource(resource, statement.Resource);
      const conditionMatch = this.evaluateConditions(statement.Condition, context);

      if (actionMatch && resourceMatch && conditionMatch) {
        return { effect: statement.Effect };
      }
    }

    return { effect: 'NoMatch' };
  }

  private matchAction(action: string, policyActions: string | string[]): boolean {
    const actions = Array.isArray(policyActions) ? policyActions : [policyActions];
    return actions.some(a => 
      a === '*' || a === action || 
      (a.endsWith('*') && action.startsWith(a.slice(0, -1)))
    );
  }

  private matchResource(resource: string, policyResources: string | string[]): boolean {
    const resources = Array.isArray(policyResources) ? policyResources : [policyResources];
    return resources.some(r => 
      r === '*' || r === resource || 
      (r.endsWith('*') && resource.startsWith(r.slice(0, -1)))
    );
  }

  private evaluateConditions(conditions?: Record<string, any>, context?: Record<string, any>): boolean {
    if (!conditions) return true;
    if (!context) return false;
    
    // Simplified condition evaluation
    return true;
  }

  // AWS SDK integration methods (stubbed)

  private async createIAMRole(role: IAMRole): Promise<void> {
    console.log(`Would create IAM role: ${role.name}`);
  }

  private async createIAMPolicy(policy: IAMPolicy): Promise<void> {
    console.log(`Would create IAM policy: ${policy.name}`);
  }

  private async assumeRoleWithSTS(
    roleArn: string,
    sessionName: string,
    options?: any
  ): Promise<STSCredentials> {
    console.log(`Would assume role ${roleArn} with STS`);
    return {
      accessKeyId: 'AWS-ACCESS-KEY',
      secretAccessKey: 'AWS-SECRET-KEY',
      sessionToken: 'AWS-SESSION-TOKEN',
      expiration: new Date(Date.now() + 3600000),
      assumedRoleArn: roleArn,
    };
  }

  private async configureIdP(provider: IdentityProvider): Promise<void> {
    console.log(`Would configure identity provider: ${provider.name}`);
  }

  private async rotateRoleCredentials(roleArn: string): Promise<void> {
    console.log(`Would rotate credentials for role: ${roleArn}`);
  }
}

// Export singleton instance
export const iamIntegration = new IAMIntegration();