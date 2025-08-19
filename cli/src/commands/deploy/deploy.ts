/**
 * Deploy command for BCCE enterprise analytics infrastructure
 * Orchestrates deployment of AWS services and analytics stack
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { loadConfig } from '../../lib/config.js';
import { AnalyticsInfrastructureManager } from '../../aws/analytics-infrastructure.js';
import { QuickSightDashboardManager } from '../../aws/quicksight-dashboard.js';
import { EnterpriseLogAggregator } from '../../analytics/log-aggregator.js';
import { EnterpriseAnalyticsArchitecture } from '../../enterprise/analytics-architecture.js';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { EnterpriseValidator } from '../../lib/enterprise-validation.js';
import { EnterpriseErrorHandler } from '../../lib/enterprise-error-handler.js';
import { DeploymentValidator } from '../../lib/deployment-validator.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

export const deployCmd = new Command('deploy')
  .description('Deploy BCCE enterprise analytics infrastructure to AWS')
  .option('--component <component>', 'Deploy specific component: infrastructure|dashboards|log-aggregation|all', 'all')
  .option('--region <region>', 'AWS region for deployment')
  .option('--stack-name <name>', 'CloudFormation stack name')
  .option('--dry-run', 'Show what would be deployed without making changes')
  .option('--force', 'Force deployment even if validation fails')
  .action(async (options) => {
    console.log(`\n${colors.bright}🚀 BCCE Enterprise Analytics Deployment${colors.reset}\n`);

    try {
      // Load BCCE configuration
      const config = loadConfig();
      if (!config) {
        console.error(`${colors.red}❌ No BCCE configuration found. Run 'bcce setup' first.${colors.reset}`);
        return;
      }

      // Comprehensive validation
      console.log(`${colors.cyan}🔍 Validating deployment configuration...${colors.reset}`);
      
      const validationResult = EnterpriseValidator.validateDeploymentConfig({
        stackName: options.stackName || `bcce-analytics-${config.organizationId || 'default'}`,
        region: options.region || config.regions?.[0] || 'us-east-1',
        organizationId: config.organizationId || 'default-org',
        analytics: config.analytics
      });

      if (!validationResult.isValid) {
        console.error(`${colors.red}❌ Configuration validation failed:${colors.reset}`);
        console.error(EnterpriseValidator.formatValidationResults(validationResult));
        
        if (!options.force) {
          console.log(`${colors.yellow}💡 Use --force to deploy despite validation errors${colors.reset}`);
          return;
        } else {
          console.log(`${colors.yellow}⚠️  Proceeding with deployment despite validation errors (--force)${colors.reset}`);
        }
      } else if (validationResult.warnings.length > 0) {
        console.log(`${colors.yellow}⚠️  Configuration warnings:${colors.reset}`);
        console.log(EnterpriseValidator.formatValidationResults(validationResult));
      } else {
        console.log(`${colors.green}✅ Configuration validation passed${colors.reset}`);
      }

      // AWS credentials validation
      const credentialsValidation = await EnterpriseValidator.validateAWSCredentials();
      if (!credentialsValidation.isValid) {
        console.error(`${colors.red}❌ AWS credentials validation failed:${colors.reset}`);
        console.error(EnterpriseValidator.formatValidationResults(credentialsValidation));
        return;
      }

      // Validate configuration
      if (!config.analytics) {
        console.error(`${colors.red}❌ Analytics configuration not found. Re-run 'bcce setup' to configure analytics.${colors.reset}`);
        return;
      }

      console.log(`${colors.cyan}📋 Deployment Configuration:${colors.reset}`);
      console.log(`   Model: ${config.analytics.model}`);
      console.log(`   Estimated Users: ${config.analytics.estimatedUsers}`);
      console.log(`   Monthly Cost: $${config.analytics.monthlyCostEstimate.toFixed(2)}`);
      console.log(`   Component: ${options.component}`);
      console.log(`   Region: ${options.region || config.regions[0]}`);

      // Comprehensive deployment validation
      console.log(`${colors.cyan}🔍 Performing comprehensive deployment validation...${colors.reset}`);
      
      const deploymentValidator = new DeploymentValidator({
        region: options.region || config.regions[0],
        stackName: options.stackName || `bcce-analytics-${config.organizationId || 'default'}`,
        organizationId: config.organizationId || 'default-org',
        estimatedUsers: config.analytics.estimatedUsers,
        analyticsModel: config.analytics.model,
        skipOptionalChecks: options.force
      });

      const deploymentValidation = await deploymentValidator.validateDeployment();
      
      console.log(DeploymentValidator.formatDeploymentValidation(deploymentValidation));

      if (!deploymentValidation.isValid && !options.force) {
        console.log(`${colors.red}❌ Deployment validation failed. Use --force to deploy anyway${colors.reset}`);
        return;
      } else if (deploymentValidation.readinessScore < 70 && !options.force) {
        console.log(`${colors.yellow}⚠️  Low readiness score (${deploymentValidation.readinessScore}/100). Consider addressing issues before deployment.${colors.reset}`);
        console.log(`${colors.gray}Use --force to proceed anyway${colors.reset}`);
        return;
      } else if (deploymentValidation.readinessScore >= 70) {
        console.log(`${colors.green}✅ Deployment validation passed (${deploymentValidation.readinessScore}/100)${colors.reset}`);
      }

      if (validation.warnings.length > 0) {
        console.log(`\n${colors.yellow}⚠️  Configuration warnings:${colors.reset}`);
        validation.warnings.forEach(warning => console.log(`   • ${warning}`));
      }

      // Confirm deployment unless dry-run
      if (!options.dryRun) {
        const { confirmDeploy } = await inquirer.prompt([{
          name: 'confirmDeploy',
          type: 'confirm',
          message: `Deploy ${options.component} to AWS ${options.region || config.regions[0]}?`,
          default: false
        }]);

        if (!confirmDeploy) {
          console.log(`${colors.yellow}❌ Deployment cancelled.${colors.reset}`);
          return;
        }
      }

      // Initialize deployment managers
      const region = options.region || config.regions[0];
      const stackName = options.stackName || `bcce-analytics-${config.analytics.model}`;
      
      const infrastructureConfig = {
        stackName,
        region,
        organizationId: generateOrganizationId(),
        analyticsConfig: config.analytics.configuration,
        tags: {
          'BCCE:Component': 'Analytics',
          'BCCE:Model': config.analytics.model,
          'BCCE:Environment': 'production'
        }
      };

      const infrastructureManager = new AnalyticsInfrastructureManager(infrastructureConfig);

      // Execute deployment based on component selection
      const deploymentResults = {
        infrastructure: { success: false, errors: [] as string[] },
        dashboards: { success: false, errors: [] as string[] },
        logAggregation: { success: false, errors: [] as string[] }
      };

      if (options.dryRun) {
        console.log(`\n${colors.bright}🔍 DRY RUN - No changes will be made${colors.reset}\n`);
        await performDryRun(options.component, infrastructureConfig, config);
        return;
      }

      // Deploy infrastructure
      if (options.component === 'all' || options.component === 'infrastructure') {
        console.log(`\n${colors.bright}🏗️ Deploying Infrastructure${colors.reset}`);
        deploymentResults.infrastructure = await infrastructureManager.deployInfrastructure();
        
        if (deploymentResults.infrastructure.success) {
          console.log(`${colors.green}✅ Infrastructure deployed successfully${colors.reset}`);
        } else {
          console.log(`${colors.red}❌ Infrastructure deployment failed${colors.reset}`);
          deploymentResults.infrastructure.errors.forEach(error => console.log(`   ${error}`));
        }
      }

      // Deploy dashboards
      if (options.component === 'all' || options.component === 'dashboards') {
        console.log(`\n${colors.bright}📊 Deploying QuickSight Dashboards${colors.reset}`);
        
        // Import self-hosted dashboard manager
        const { SelfHostedDashboardManager } = await import('../../aws/self-hosted-dashboard.js');
        
        const dashboardConfig = {
          platform: config.analytics.platform || 'grafana',
          deployment: getDeploymentType(config.analytics.model),
          database: 'postgresql',
          region,
          organizationId: infrastructureConfig.organizationId,
          authentication: {
            enableSSO: config.auth === 'identity-center',
            adminUsers: ['admin@company.com']
          },
          networking: {
            enableHTTPS: true,
            customDomain: `analytics.${infrastructureConfig.organizationId}.com`
          },
          scaling: {
            minInstances: 1,
            maxInstances: 3,
            targetCPU: 70
          }
        };

        const dashboardManager = new SelfHostedDashboardManager(dashboardConfig);
        const dashboardResult = await dashboardManager.deployDashboard();
        
        deploymentResults.dashboards = {
          success: dashboardResult.success,
          errors: dashboardResult.errors
        };

        if (dashboardResult.success) {
          console.log(`${colors.green}✅ ${config.analytics.platform} dashboard deployed successfully${colors.reset}`);
          console.log(`   Dashboard URL: ${dashboardResult.dashboardUrl}`);
          if (dashboardResult.adminCredentials) {
            console.log(`   Admin Username: ${dashboardResult.adminCredentials.username}`);
            console.log(`   Admin Password: ${dashboardResult.adminCredentials.password}`);
          }
        } else {
          console.log(`${colors.red}❌ Dashboard deployment failed${colors.reset}`);
          dashboardResult.errors?.forEach(error => console.log(`   ${error}`));
        }
      }

      // Deploy log aggregation
      if (options.component === 'all' || options.component === 'log-aggregation') {
        console.log(`\n${colors.bright}📝 Setting up Log Aggregation${colors.reset}`);
        
        const logAggregatorConfig = {
          syncMode: getSyncMode(config.analytics.model),
          destination: config.analytics.configuration.awsServices.logIngestion.service === 'kinesis-data-firehose' ? 'kinesis' : 'cloudwatch',
          region,
          logGroupName: `/bcce/analytics/${infrastructureConfig.organizationId}`,
          bucketName: `bcce-analytics-${infrastructureConfig.organizationId}-${region}`,
          streamName: `bcce-analytics-${infrastructureConfig.organizationId}`,
          encryption: {
            enabled: config.analytics.configuration.dataProtection.encryption.atRest === 'aws-kms',
            keyId: undefined // Will be set from infrastructure outputs
          },
          privacy: {
            scrubPII: true,
            scrubSecrets: true,
            allowedPaths: ['/Users/*/claude', '~/.claude']
          },
          compliance: {
            auditLevel: config.analytics.configuration.dataProtection.auditLogging.level,
            retentionDays: config.analytics.configuration.dataProtection.dataClassification.retentionDays.internal
          }
        } as const;

        const logAggregator = new EnterpriseLogAggregator(logAggregatorConfig);
        
        try {
          await logAggregator.startLogAggregation();
          deploymentResults.logAggregation = { success: true, errors: [] };
          console.log(`${colors.green}✅ Log aggregation configured successfully${colors.reset}`);
        } catch (error) {
          deploymentResults.logAggregation = {
            success: false,
            errors: [error instanceof Error ? error.message : 'Log aggregation setup failed']
          };
          console.log(`${colors.red}❌ Log aggregation setup failed${colors.reset}`);
        }
      }

      // Deployment summary
      console.log(`\n${colors.bright}📋 Deployment Summary${colors.reset}`);
      
      const allSuccessful = Object.values(deploymentResults).every(result => result.success);
      
      if (allSuccessful) {
        console.log(`${colors.green}🎉 All components deployed successfully!${colors.reset}`);
        
        console.log(`\n${colors.bright}🔗 Access Your Analytics:${colors.reset}`);
        console.log(`   • Local Dashboard: bcce dashboard`);
        console.log(`   • Self-Hosted Dashboard: https://analytics.${infrastructureConfig.organizationId}.com`);
        console.log(`   • AWS Console: https://${region}.console.aws.amazon.com/cloudformation/`);
        
        console.log(`\n${colors.bright}🎯 Next Steps:${colors.reset}`);
        console.log(`   1. 🔄 Start using Claude Code to generate analytics data`);
        console.log(`   2. 📊 Monitor dashboards for insights`);
        console.log(`   3. 🔍 Review cost optimization recommendations`);
        console.log(`   4. 🛡️ Configure additional governance policies`);
      } else {
        console.log(`${colors.yellow}⚠️ Deployment completed with some failures${colors.reset}`);
        
        Object.entries(deploymentResults).forEach(([component, result]) => {
          if (!result.success) {
            console.log(`   ${colors.red}❌ ${component}: ${result.errors.join(', ')}${colors.reset}`);
          } else {
            console.log(`   ${colors.green}✅ ${component}${colors.reset}`);
          }
        });
      }

    } catch (error) {
      console.error(`${colors.red}❌ Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
      process.exit(1);
    }
  });

/**
 * Perform dry run to show what would be deployed
 */
async function performDryRun(component: string, infrastructureConfig: any, config: any): Promise<void> {
  console.log(`${colors.cyan}🏗️ Infrastructure (CloudFormation):${colors.reset}`);
  console.log(`   Stack Name: ${infrastructureConfig.stackName}`);
  console.log(`   Resources: S3 Data Lake, KMS Key, CloudWatch Logs, IAM Roles`);
  
  if (config.analytics.configuration.awsServices.logIngestion.service === 'kinesis-data-firehose') {
    console.log(`   Streaming: Kinesis Data Firehose`);
  }
  
  if (config.analytics.configuration.awsServices.analyticsEngine.secondary === 'opensearch') {
    console.log(`   Search: OpenSearch Service domain`);
  }

  console.log(`\n${colors.cyan}📊 Open Source Dashboards:${colors.reset}`);
  const deploymentType = getDeploymentType(config.analytics.model);
  console.log(`   Platform: ${config.analytics.platform || 'grafana'}`);
  console.log(`   Deployment: ${deploymentType}`);
  console.log(`   Data Sources: S3, Athena, PostgreSQL`);
  console.log(`   Features: Self-hosted, Open source, Enterprise SSO`);

  console.log(`\n${colors.cyan}📝 Log Aggregation:${colors.reset}`);
  console.log(`   Source: ~/.claude (Claude Code logs)`);
  console.log(`   Destination: ${config.analytics.configuration.awsServices.logIngestion.service}`);
  console.log(`   Privacy: PII scrubbing enabled`);
  console.log(`   Compliance: ${config.analytics.configuration.dataProtection.auditLogging.level} audit level`);

  console.log(`\n${colors.cyan}💰 Estimated Monthly Costs:${colors.reset}`);
  
  // Import the correct architecture for cost estimation
  const { OpenSourceAnalyticsArchitecture } = await import('../../enterprise/analytics-architecture-v2.js');
  const costs = OpenSourceAnalyticsArchitecture.estimateOpenSourceCosts(
    config.analytics.configuration,
    config.analytics.estimatedUsers
  );
  
  Object.entries(costs.breakdown).forEach(([service, cost]) => {
    console.log(`   ${service}: $${cost.toFixed(2)}`);
  });
  console.log(`   ${colors.bright}Total: $${costs.total.toFixed(2)}/month${colors.reset}`);
}

/**
 * Get deployment type based on analytics model
 */
function getDeploymentType(model: string): 'docker' | 'kubernetes' | 'ecs' | 'ec2' {
  switch (model) {
    case 'kubernetes-enterprise':
      return 'kubernetes';
    case 'serverless-analytics':
      return 'ecs';
    case 'open-source-self-hosted':
    default:
      return 'docker';
  }
}

/**
 * Get sync mode based on analytics model
 */
function getSyncMode(model: string): 'real-time' | 'batch' | 'hybrid' {
  switch (model) {
    case 'centralized':
      return 'real-time';
    case 'federated-pods':
      return 'hybrid';
    case 'hybrid-local':
    default:
      return 'batch';
  }
}

/**
 * Generate organization ID from config or hostname
 */
function generateOrganizationId(): string {
  // This would typically be based on AWS account ID or organization name
  return 'demo-org-' + Math.random().toString(36).substring(2, 8);
}

/**
 * Get AWS account ID
 */
async function getAwsAccountId(region: string = 'us-east-1'): Promise<string> {
  try {
    const sts = new STSClient({ region });
    const response = await sts.send(new GetCallerIdentityCommand({}));
    if (!response.Account) {
      throw new Error('Unable to retrieve AWS account ID from STS');
    }
    return response.Account;
  } catch (error) {
    throw new Error(`Failed to get AWS account ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}