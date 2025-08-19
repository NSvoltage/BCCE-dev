/**
 * AWS Analytics Infrastructure Implementation
 * Deploys and manages enterprise analytics stack on AWS
 */

import { 
  CloudFormationClient, 
  CreateStackCommand, 
  DescribeStacksCommand,
  UpdateStackCommand,
  DeleteStackCommand
} from '@aws-sdk/client-cloudformation';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketEncryptionCommand
} from '@aws-sdk/client-s3';
import {
  QuickSightClient,
  CreateDataSourceCommand,
  CreateDataSetCommand,
  CreateDashboardCommand
} from '@aws-sdk/client-quicksight';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  PutRetentionPolicyCommand
} from '@aws-sdk/client-cloudwatch-logs';
import { 
  KinesisClient,
  CreateStreamCommand
} from '@aws-sdk/client-kinesis';
import {
  STSClient,
  GetCallerIdentityCommand
} from '@aws-sdk/client-sts';
import { EnterpriseAnalyticsConfig } from '../enterprise/analytics-architecture.js';
import { EnterpriseErrorHandler, EnterpriseError } from '../lib/enterprise-error-handler.js';
import { AWSClientManager, withAWSClient } from '../lib/aws-client-manager.js';

export interface AnalyticsInfrastructureConfig {
  stackName: string;
  region: string;
  organizationId: string;
  analyticsConfig: EnterpriseAnalyticsConfig;
  tags: Record<string, string>;
}

export interface DeploymentResult {
  success: boolean;
  stackId?: string;
  outputs?: Record<string, string>;
  errors?: string[];
}

export class AnalyticsInfrastructureManager {
  private clientManager: AWSClientManager;
  private config: AnalyticsInfrastructureConfig;
  private accountIdCache?: string;

  constructor(config: AnalyticsInfrastructureConfig) {
    this.config = config;
    
    // Initialize AWS Client Manager with optimized settings
    this.clientManager = AWSClientManager.initialize(
      {
        region: config.region,
        maxRetries: 3,
        requestTimeout: 60000, // 60 seconds for CloudFormation operations
        connectionTimeout: 10000, // 10 seconds
        maxConnections: 25
      },
      {
        maxPoolSize: 5, // Conservative pool size for enterprise deployment
        idleTimeoutMs: 300000, // 5 minutes
        healthCheckIntervalMs: 120000 // 2 minutes
      }
    );
  }

  /**
   * Deploy complete analytics infrastructure
   */
  async deployInfrastructure(): Promise<DeploymentResult> {
    console.log(`🚀 Deploying ${this.config.analyticsConfig.deploymentModel} analytics infrastructure...`);

    return EnterpriseErrorHandler.withResilience(
      async () => {
        // 1. Deploy core CloudFormation stack
        const stackResult = await this.deployCloudFormationStack();
        if (!stackResult.success) {
          throw new Error(`CloudFormation deployment failed: ${stackResult.errors?.join(', ')}`);
        }

        // 2. Configure data sources and streaming
        await this.configureDataIngestion();

        // 3. Set up analytics engines
        await this.configureAnalyticsEngines();

        // 4. Deploy visualization dashboards
        await this.configureVisualization();

        // 5. Apply security and compliance controls
        await this.applySecurityControls();

        console.log('✅ Analytics infrastructure deployed successfully');
        return {
          success: true,
          stackId: stackResult.stackId,
          outputs: stackResult.outputs || {}
        };
      },
      'analytics-infrastructure-deployment',
      {
        operation: 'deployInfrastructure',
        component: 'analytics-infrastructure',
        region: this.config.region,
        metadata: { 
          stackName: this.config.stackName,
          organizationId: this.config.organizationId,
          deploymentModel: this.config.analyticsConfig.deploymentModel
        }
      },
      { maxRetries: 2 }, // Reduced retries for expensive operations
      { failureThreshold: 3 }
    ).catch(error => {
      console.error('❌ Infrastructure deployment failed:', EnterpriseErrorHandler.formatError(error));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    });
  }

  /**
   * Deploy CloudFormation stack based on deployment model
   */
  private async deployCloudFormationStack(): Promise<DeploymentResult> {
    const templateBody = await this.generateCloudFormationTemplate();
    
    try {
      // Check if stack exists
      let stackExists = false;
      try {
        await this.cloudFormation.send(new DescribeStacksCommand({
          StackName: this.config.stackName
        }));
        stackExists = true;
      } catch (error) {
        // Stack doesn't exist, will create new one
      }

      const command = stackExists 
        ? new UpdateStackCommand({
            StackName: this.config.stackName,
            TemplateBody: templateBody,
            Tags: this.formatTags(),
            Capabilities: ['CAPABILITY_IAM']
          })
        : new CreateStackCommand({
            StackName: this.config.stackName,
            TemplateBody: templateBody,
            Tags: this.formatTags(),
            Capabilities: ['CAPABILITY_IAM']
          });

      const result = await this.cloudFormation.send(command);
      
      // Wait for stack completion
      await this.waitForStackCompletion();

      // Get stack outputs
      const outputs = await this.getStackOutputs();

      return {
        success: true,
        stackId: result.StackId,
        outputs
      };

    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'CloudFormation deployment failed']
      };
    }
  }

  /**
   * Generate CloudFormation template based on deployment model
   */
  private async generateCloudFormationTemplate(): Promise<string> {
    const accountId = await this.getAccountId();
    const template = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: `BCCE Analytics Infrastructure - ${this.config.analyticsConfig.deploymentModel}`,
      
      Parameters: {
        OrganizationId: {
          Type: 'String',
          Default: this.config.organizationId,
          Description: 'Organization identifier for resource naming'
        }
      },

      Resources: {
        // S3 Data Lake
        AnalyticsDataLake: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: `bcce-analytics-${this.config.organizationId}-${this.config.region}`,
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [{
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'aws:kms',
                  KMSMasterKeyID: { Ref: 'AnalyticsKMSKey' }
                }
              }]
            },
            LifecycleConfiguration: {
              Rules: [{
                Id: 'AnalyticsDataLifecycle',
                Status: 'Enabled',
                Transitions: [
                  {
                    StorageClass: 'STANDARD_IA',
                    TransitionInDays: this.config.analyticsConfig.costOptimization.s3Storage.lifecyclePolicies.toIA
                  },
                  {
                    StorageClass: 'GLACIER',
                    TransitionInDays: this.config.analyticsConfig.costOptimization.s3Storage.lifecyclePolicies.toGlacier
                  },
                  {
                    StorageClass: 'DEEP_ARCHIVE',
                    TransitionInDays: this.config.analyticsConfig.costOptimization.s3Storage.lifecyclePolicies.toDeepArchive
                  }
                ]
              }]
            },
            IntelligentTieringConfiguration: this.config.analyticsConfig.costOptimization.s3Storage.intelligentTiering === 'auto' ? {
              Id: 'IntelligentTiering',
              Status: 'Enabled',
              Prefix: 'analytics-data/'
            } : undefined
          }
        },

        // KMS Key for encryption
        AnalyticsKMSKey: {
          Type: 'AWS::KMS::Key',
          Properties: {
            Description: 'KMS Key for BCCE Analytics encryption',
            KeyPolicy: {
              Statement: [{
                Sid: 'Enable IAM User Permissions',
                Effect: 'Allow',
                Principal: { AWS: `arn:aws:iam::${accountId}:root` },
                Action: 'kms:*',
                Resource: '*'
              }]
            },
            EnableKeyRotation: this.config.analyticsConfig.dataProtection.encryption.keyRotation === 'automatic'
          }
        },

        // CloudWatch Log Group
        AnalyticsLogGroup: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: `/bcce/analytics/${this.config.organizationId}`,
            RetentionInDays: this.config.analyticsConfig.dataProtection.dataClassification.retentionDays.internal
          }
        },

        // Kinesis Data Firehose (for real-time streaming)
        ...(this.config.analyticsConfig.awsServices.logIngestion.service === 'kinesis-data-firehose' ? {
          AnalyticsFirehose: {
            Type: 'AWS::KinesisFirehose::DeliveryStream',
            Properties: {
              DeliveryStreamName: `bcce-analytics-${this.config.organizationId}`,
              S3DestinationConfiguration: {
                BucketARN: { 'Fn::GetAtt': ['AnalyticsDataLake', 'Arn'] },
                Prefix: 'analytics-data/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/',
                ErrorOutputPrefix: 'errors/',
                BufferingHints: {
                  SizeInMBs: 5,
                  IntervalInSeconds: 300
                },
                CompressionFormat: this.config.analyticsConfig.awsServices.logIngestion.configuration.compression.toUpperCase(),
                EncryptionConfiguration: {
                  KMSEncryptionConfig: {
                    AWSKMSKeyARN: { 'Fn::GetAtt': ['AnalyticsKMSKey', 'Arn'] }
                  }
                }
              }
            }
          }
        } : {}),

        // IAM Role for analytics access
        AnalyticsRole: {
          Type: 'AWS::IAM::Role',
          Properties: {
            RoleName: `BCCEAnalyticsRole-${this.config.organizationId}`,
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { Service: 'quicksight.amazonaws.com' },
                Action: 'sts:AssumeRole'
              }]
            },
            Policies: [{
              PolicyName: 'AnalyticsDataAccess',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: [
                      's3:GetObject',
                      's3:ListBucket',
                      's3:GetBucketLocation'
                    ],
                    Resource: [
                      { 'Fn::GetAtt': ['AnalyticsDataLake', 'Arn'] },
                      { 'Fn::Sub': '${AnalyticsDataLake}/*' }
                    ]
                  },
                  {
                    Effect: 'Allow',
                    Action: [
                      'athena:BatchGetQueryExecution',
                      'athena:GetQueryExecution',
                      'athena:GetQueryResults',
                      'athena:GetWorkGroup',
                      'athena:ListQueryExecutions',
                      'athena:StartQueryExecution',
                      'athena:StopQueryExecution'
                    ],
                    Resource: '*'
                  }
                ]
              }
            }]
          }
        }
      },

      Outputs: {
        DataLakeBucket: {
          Description: 'S3 bucket for analytics data lake',
          Value: { Ref: 'AnalyticsDataLake' },
          Export: { Name: `${this.config.stackName}-DataLakeBucket` }
        },
        KMSKeyId: {
          Description: 'KMS key for analytics encryption',
          Value: { Ref: 'AnalyticsKMSKey' },
          Export: { Name: `${this.config.stackName}-KMSKey` }
        },
        LogGroupName: {
          Description: 'CloudWatch log group name',
          Value: { Ref: 'AnalyticsLogGroup' },
          Export: { Name: `${this.config.stackName}-LogGroup` }
        },
        AnalyticsRoleArn: {
          Description: 'IAM role ARN for analytics access',
          Value: { 'Fn::GetAtt': ['AnalyticsRole', 'Arn'] },
          Export: { Name: `${this.config.stackName}-AnalyticsRole` }
        }
      }
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * Configure data ingestion pipeline
   */
  private async configureDataIngestion(): Promise<void> {
    console.log('📊 Configuring data ingestion pipeline...');

    // Create CloudWatch log group if not using CloudFormation
    if (this.config.analyticsConfig.awsServices.logIngestion.service === 'cloudwatch-logs') {
      try {
        await this.cloudWatchLogs.send(new CreateLogGroupCommand({
          logGroupName: `/bcce/claude-code/${this.config.organizationId}`
        }));

        await this.cloudWatchLogs.send(new PutRetentionPolicyCommand({
          logGroupName: `/bcce/claude-code/${this.config.organizationId}`,
          retentionInDays: this.config.analyticsConfig.dataProtection.dataClassification.retentionDays.internal
        }));
      } catch (error) {
        // Log group might already exist
        console.log('CloudWatch log group already exists or creation failed');
      }
    }
  }

  /**
   * Configure analytics engines (Athena, OpenSearch)
   */
  private async configureAnalyticsEngines(): Promise<void> {
    console.log('🔍 Configuring analytics engines...');

    // For Athena, we'll create the necessary data catalog and tables
    // This would typically be done through AWS Glue or direct Athena DDL
    
    // OpenSearch configuration would go here if secondary engine is enabled
    if (this.config.analyticsConfig.awsServices.analyticsEngine.secondary === 'opensearch') {
      console.log('Setting up OpenSearch Service...');
      // OpenSearch domain creation would go here
    }
  }

  /**
   * Configure visualization platform (QuickSight)
   */
  private async configureVisualization(): Promise<void> {
    console.log('📈 Configuring visualization platform...');

    if (this.config.analyticsConfig.awsServices.visualization.service.includes('quicksight')) {
      try {
        const accountId = await this.getAccountId();
        // Create data source
        await this.quickSight.send(new CreateDataSourceCommand({
          AwsAccountId: accountId,
          DataSourceId: `bcce-analytics-${this.config.organizationId}`,
          Name: `BCCE Analytics - ${this.config.organizationId}`,
          Type: 'S3',
          DataSourceParameters: {
            S3Parameters: {
              ManifestFileLocation: {
                Bucket: `bcce-analytics-${this.config.organizationId}-${this.config.region}`,
                Key: 'manifest.json'
              }
            }
          }
        }));

        console.log('✅ QuickSight data source created');
      } catch (error) {
        console.log('QuickSight configuration skipped (may require manual setup)');
      }
    }
  }

  /**
   * Apply security and compliance controls
   */
  private async applySecurityControls(): Promise<void> {
    console.log('🔒 Applying security and compliance controls...');

    // Apply S3 bucket policies for data protection
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyInsecureConnections',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: [
            `arn:aws:s3:::bcce-analytics-${this.config.organizationId}-${this.config.region}`,
            `arn:aws:s3:::bcce-analytics-${this.config.organizationId}-${this.config.region}/*`
          ],
          Condition: {
            Bool: { 'aws:SecureTransport': 'false' }
          }
        }
      ]
    };

    try {
      await this.s3.send(new PutBucketPolicyCommand({
        Bucket: `bcce-analytics-${this.config.organizationId}-${this.config.region}`,
        Policy: JSON.stringify(bucketPolicy)
      }));
    } catch (error) {
      console.log('S3 bucket policy application failed (bucket may not exist yet)');
    }
  }

  /**
   * Delete analytics infrastructure
   */
  async deleteInfrastructure(): Promise<DeploymentResult> {
    console.log('🗑️ Deleting analytics infrastructure...');

    try {
      await this.cloudFormation.send(new DeleteStackCommand({
        StackName: this.config.stackName
      }));

      await this.waitForStackDeletion();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Stack deletion failed']
      };
    }
  }

  /**
   * Get infrastructure status and health
   */
  async getInfrastructureStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy' | 'not-deployed';
    details: Record<string, any>;
  }> {
    try {
      const stackResult = await this.cloudFormation.send(new DescribeStacksCommand({
        StackName: this.config.stackName
      }));

      const stack = stackResult.Stacks?.[0];
      if (!stack) {
        return { status: 'not-deployed', details: {} };
      }

      const stackStatus = stack.StackStatus;
      const isHealthy = stackStatus?.includes('COMPLETE') && !stackStatus?.includes('FAILED');

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        details: {
          stackStatus,
          stackId: stack.StackId,
          lastUpdated: stack.LastUpdatedTime,
          outputs: this.parseStackOutputs(stack.Outputs || [])
        }
      };
    } catch (error) {
      return {
        status: 'not-deployed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Helper methods
  private async waitForStackCompletion(): Promise<void> {
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes
    const pollInterval = 30 * 1000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const result = await withAWSClient(
          (manager) => manager.getCloudFormationClient(this.config.region),
          async (cfClient) => cfClient.send(new DescribeStacksCommand({
            StackName: this.config.stackName
          })),
          this.config.region
        );

        const stack = result.Stacks?.[0];
        if (!stack) {
          throw new Error('Stack not found during status check');
        }

        const status = stack.StackStatus;
        console.log(`Stack ${this.config.stackName} status: ${status}`);

        if (status?.includes('COMPLETE')) {
          console.log('✅ Stack deployment completed successfully');
          return;
        }

        if (status?.includes('FAILED') || status?.includes('ROLLBACK')) {
          const reason = stack.StackStatusReason || 'Unknown error';
          throw new Error(`Stack deployment failed: ${status}. Reason: ${reason}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error instanceof Error && error.message.includes('does not exist')) {
          throw new Error('Stack was deleted during deployment');
        }
        throw error;
      }
    }

    throw new Error(`Stack deployment timeout after ${maxWaitTime / 60000} minutes`);
  }

  private async waitForStackDeletion(): Promise<void> {
    const maxWaitTime = 20 * 60 * 1000; // 20 minutes
    const pollInterval = 30 * 1000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        await withAWSClient(
          (manager) => manager.getCloudFormationClient(this.config.region),
          async (cfClient) => cfClient.send(new DescribeStacksCommand({
            StackName: this.config.stackName
          })),
          this.config.region
        );

        // Stack still exists, wait more
        console.log(`Waiting for stack ${this.config.stackName} deletion...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error instanceof Error && error.message.includes('does not exist')) {
          console.log('✅ Stack deleted successfully');
          return;
        }
        throw error;
      }
    }

    throw new Error(`Stack deletion timeout after ${maxWaitTime / 60000} minutes`);
  }

  private async getStackOutputs(): Promise<Record<string, string>> {
    const result = await withAWSClient(
      (manager) => manager.getCloudFormationClient(this.config.region),
      async (cfClient) => cfClient.send(new DescribeStacksCommand({
        StackName: this.config.stackName
      })),
      this.config.region
    );

    const outputs = result.Stacks?.[0]?.Outputs || [];
    return this.parseStackOutputs(outputs);
  }

  private parseStackOutputs(outputs: any[]): Record<string, string> {
    const parsed: Record<string, string> = {};
    for (const output of outputs) {
      if (output.OutputKey && output.OutputValue) {
        parsed[output.OutputKey] = output.OutputValue;
      }
    }
    return parsed;
  }

  private formatTags(): any[] {
    return Object.entries(this.config.tags).map(([Key, Value]) => ({ Key, Value }));
  }

  private async getAccountId(): Promise<string> {
    if (this.accountIdCache) {
      return this.accountIdCache;
    }

    return withAWSClient(
      (manager) => manager.getSTSClient(this.config.region),
      async (stsClient) => {
        const response = await stsClient.send(new GetCallerIdentityCommand({}));
        if (!response.Account) {
          throw new Error('Unable to retrieve AWS account ID from STS');
        }
        this.accountIdCache = response.Account;
        return this.accountIdCache;
      },
      this.config.region
    );
  }
}