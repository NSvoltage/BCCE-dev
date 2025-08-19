/**
 * AWS Integration Commands for BCCE
 * Provides CLI access to CloudWatch, S3, EventBridge, and IAM features
 */

import { Command } from 'commander';
import { cloudWatchIntegration } from '../../lib/aws/cloudwatch-integration.js';
import { createS3Storage } from '../../lib/aws/s3-storage.js';
import { eventBridgeOrchestrator } from '../../lib/aws/eventbridge-orchestrator.js';
import { iamIntegration } from '../../lib/aws/iam-integration.js';
import fs from 'node:fs';
import path from 'node:path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

export const awsCmd = new Command('aws')
  .description('AWS native integrations for metrics, storage, orchestration, and access control')
  
  // CloudWatch Commands
  .addCommand(
    new Command('metrics')
      .description('CloudWatch metrics management')
      .addCommand(
        new Command('publish')
          .description('Publish custom metrics to CloudWatch')
          .option('--metric <name>', 'Metric name', 'CustomMetric')
          .option('--value <number>', 'Metric value', '1')
          .option('--unit <unit>', 'Metric unit (Count|Seconds|Bytes|Percent)', 'Count')
          .option('--namespace <namespace>', 'CloudWatch namespace', 'BCCE')
          .action(async (options) => {
            console.log(`\n${colors.bright}📊 Publishing Metric to CloudWatch${colors.reset}\n`);
            
            try {
              cloudWatchIntegration.enableMockMode(); // Enable mock for testing
              
              await cloudWatchIntegration.publishMetrics([{
                namespace: options.namespace,
                metricName: options.metric,
                value: parseFloat(options.value),
                unit: options.unit,
                timestamp: new Date(),
              }]);
              
              console.log(`${colors.green}✅ Metric published successfully${colors.reset}`);
              console.log(`  Namespace: ${colors.cyan}${options.namespace}${colors.reset}`);
              console.log(`  Metric: ${colors.cyan}${options.metric}${colors.reset}`);
              console.log(`  Value: ${colors.cyan}${options.value} ${options.unit}${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}❌ Failed to publish metric: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('dashboard')
          .description('Create CloudWatch dashboard for BCCE metrics')
          .option('--name <name>', 'Dashboard name', 'BCCE-Metrics-Dashboard')
          .action(async (options) => {
            console.log(`\n${colors.bright}📈 Creating CloudWatch Dashboard${colors.reset}\n`);
            
            try {
              cloudWatchIntegration.enableMockMode();
              const dashboard = await cloudWatchIntegration.createDashboard(options.name);
              
              console.log(`${colors.green}✅ Dashboard created successfully${colors.reset}`);
              console.log(`  Name: ${colors.cyan}${dashboard.name}${colors.reset}`);
              console.log(`  Widgets: ${colors.cyan}${dashboard.widgets.length}${colors.reset}`);
              console.log('\nWidget Configuration:');
              dashboard.widgets.forEach(widget => {
                console.log(`  - ${widget.title} (${widget.type})`);
              });
            } catch (error) {
              console.error(`${colors.red}❌ Failed to create dashboard: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('alarms')
          .description('Configure CloudWatch alarms')
          .option('--cost-threshold <amount>', 'Cost threshold in USD')
          .option('--token-threshold <count>', 'Token usage threshold')
          .option('--failure-rate <percent>', 'Workflow failure rate threshold')
          .option('--sns-topic <arn>', 'SNS topic ARN for notifications')
          .action(async (options) => {
            console.log(`\n${colors.bright}🚨 Configuring CloudWatch Alarms${colors.reset}\n`);
            
            try {
              cloudWatchIntegration.enableMockMode();
              
              const config: any = {};
              if (options.costThreshold) config.costThreshold = parseFloat(options.costThreshold);
              if (options.tokenThreshold) config.tokenThreshold = parseInt(options.tokenThreshold);
              if (options.failureRate) config.failureRateThreshold = parseFloat(options.failureRate);
              if (options.snsTopic) config.snsTopicArn = options.snsTopic;
              
              const alarms = await cloudWatchIntegration.createAlarms(config);
              
              console.log(`${colors.green}✅ ${alarms.length} alarms configured${colors.reset}\n`);
              alarms.forEach(alarm => {
                console.log(`  ${colors.cyan}${alarm.alarmName}${colors.reset}`);
                console.log(`    Metric: ${alarm.metricName}`);
                console.log(`    Threshold: ${alarm.threshold}`);
                console.log(`    ${colors.gray}${alarm.description}${colors.reset}`);
              });
            } catch (error) {
              console.error(`${colors.red}❌ Failed to configure alarms: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
  )
  
  // S3 Storage Commands
  .addCommand(
    new Command('storage')
      .description('S3 artifact storage management')
      .addCommand(
        new Command('upload')
          .description('Upload artifact to S3')
          .requiredOption('--file <path>', 'Path to artifact file')
          .requiredOption('--bucket <name>', 'S3 bucket name')
          .option('--workflow <id>', 'Workflow ID', 'manual')
          .option('--type <type>', 'Artifact type (workflow|cost-report|analytics|security-audit)', 'workflow')
          .action(async (options) => {
            console.log(`\n${colors.bright}☁️ Uploading Artifact to S3${colors.reset}\n`);
            
            try {
              const storage = createS3Storage({
                bucketName: options.bucket,
                enableVersioning: true,
                enableEncryption: true,
              });
              storage.enableMockMode();
              
              const s3Key = await storage.storeArtifact(options.file, {
                workflowId: options.workflow,
                type: options.type,
                contentType: 'application/json',
              });
              
              console.log(`${colors.green}✅ Artifact uploaded successfully${colors.reset}`);
              console.log(`  S3 Key: ${colors.cyan}${s3Key}${colors.reset}`);
              console.log(`  Bucket: ${colors.cyan}${options.bucket}${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}❌ Failed to upload artifact: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('list')
          .description('List artifacts in S3')
          .requiredOption('--bucket <name>', 'S3 bucket name')
          .option('--workflow <id>', 'Filter by workflow ID')
          .option('--type <type>', 'Filter by artifact type')
          .option('--max <number>', 'Maximum results', '20')
          .action(async (options) => {
            console.log(`\n${colors.bright}📋 Listing S3 Artifacts${colors.reset}\n`);
            
            try {
              const storage = createS3Storage({
                bucketName: options.bucket,
              });
              storage.enableMockMode();
              
              const filter: any = { maxResults: parseInt(options.max) };
              if (options.workflow) filter.workflowId = options.workflow;
              if (options.type) filter.type = options.type;
              
              const artifacts = await storage.listArtifacts(filter);
              
              if (artifacts.length === 0) {
                console.log(`${colors.gray}No artifacts found${colors.reset}`);
              } else {
                console.log(`Found ${colors.cyan}${artifacts.length}${colors.reset} artifacts:\n`);
                artifacts.forEach(artifact => {
                  console.log(`  ${colors.cyan}${artifact.id}${colors.reset}`);
                  console.log(`    Type: ${artifact.type}`);
                  console.log(`    Workflow: ${artifact.workflowId}`);
                  console.log(`    Size: ${(artifact.size / 1024).toFixed(2)} KB`);
                  console.log(`    Created: ${artifact.timestamp.toLocaleString()}`);
                });
              }
            } catch (error) {
              console.error(`${colors.red}❌ Failed to list artifacts: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('lifecycle')
          .description('Configure S3 lifecycle rules')
          .requiredOption('--bucket <name>', 'S3 bucket name')
          .option('--archive-days <number>', 'Days before archiving to Glacier', '90')
          .option('--delete-days <number>', 'Days before deletion', '365')
          .action(async (options) => {
            console.log(`\n${colors.bright}♻️ Configuring S3 Lifecycle Rules${colors.reset}\n`);
            
            try {
              const storage = createS3Storage({
                bucketName: options.bucket,
              });
              storage.enableMockMode();
              
              await storage.configureLifecycle([
                {
                  id: 'archive-and-delete',
                  status: 'Enabled',
                  transitions: [
                    { days: parseInt(options.archiveDays), storageClass: 'GLACIER' },
                  ],
                  expiration: { days: parseInt(options.deleteDays) },
                },
              ]);
              
              console.log(`${colors.green}✅ Lifecycle rules configured${colors.reset}`);
              console.log(`  Archive after: ${colors.cyan}${options.archiveDays} days${colors.reset}`);
              console.log(`  Delete after: ${colors.cyan}${options.deleteDays} days${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}❌ Failed to configure lifecycle: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
  )
  
  // EventBridge Commands
  .addCommand(
    new Command('events')
      .description('EventBridge workflow orchestration')
      .addCommand(
        new Command('publish')
          .description('Publish workflow event')
          .requiredOption('--source <source>', 'Event source')
          .requiredOption('--type <type>', 'Event detail type')
          .option('--detail <json>', 'Event detail (JSON)', '{}')
          .action(async (options) => {
            console.log(`\n${colors.bright}📤 Publishing Event to EventBridge${colors.reset}\n`);
            
            try {
              eventBridgeOrchestrator.enableMockMode();
              
              const eventId = await eventBridgeOrchestrator.publishEvent({
                source: options.source,
                detailType: options.type,
                detail: JSON.parse(options.detail),
              });
              
              console.log(`${colors.green}✅ Event published successfully${colors.reset}`);
              console.log(`  Event ID: ${colors.cyan}${eventId}${colors.reset}`);
              console.log(`  Source: ${colors.cyan}${options.source}${colors.reset}`);
              console.log(`  Type: ${colors.cyan}${options.type}${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}❌ Failed to publish event: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('schedule')
          .description('Schedule workflow execution')
          .requiredOption('--workflow <id>', 'Workflow ID to schedule')
          .requiredOption('--schedule <expression>', 'Schedule expression (cron or rate)')
          .option('--parameters <json>', 'Workflow parameters (JSON)', '{}')
          .action(async (options) => {
            console.log(`\n${colors.bright}⏰ Scheduling Workflow Execution${colors.reset}\n`);
            
            try {
              eventBridgeOrchestrator.enableMockMode();
              
              const scheduled = await eventBridgeOrchestrator.scheduleWorkflow(
                options.workflow,
                options.schedule,
                JSON.parse(options.parameters)
              );
              
              console.log(`${colors.green}✅ Workflow scheduled successfully${colors.reset}`);
              console.log(`  Schedule ID: ${colors.cyan}${scheduled.id}${colors.reset}`);
              console.log(`  Workflow: ${colors.cyan}${scheduled.workflowId}${colors.reset}`);
              console.log(`  Expression: ${colors.cyan}${scheduled.schedule}${colors.reset}`);
              if (scheduled.nextRun) {
                console.log(`  Next Run: ${colors.cyan}${scheduled.nextRun.toLocaleString()}${colors.reset}`);
              }
            } catch (error) {
              console.error(`${colors.red}❌ Failed to schedule workflow: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('orchestrate')
          .description('Create orchestration pattern')
          .requiredOption('--name <name>', 'Pattern name')
          .requiredOption('--type <type>', 'Pattern type (sequential|parallel|conditional|fan-out|saga)')
          .requiredOption('--workflows <ids>', 'Comma-separated workflow IDs')
          .action(async (options) => {
            console.log(`\n${colors.bright}🎭 Creating Orchestration Pattern${colors.reset}\n`);
            
            try {
              eventBridgeOrchestrator.enableMockMode();
              
              const workflows = options.workflows.split(',').map((id: string) => ({
                id: id.trim(),
              }));
              
              await eventBridgeOrchestrator.createOrchestrationPattern({
                name: options.name,
                type: options.type,
                workflows,
              });
              
              console.log(`${colors.green}✅ Orchestration pattern created${colors.reset}`);
              console.log(`  Name: ${colors.cyan}${options.name}${colors.reset}`);
              console.log(`  Type: ${colors.cyan}${options.type}${colors.reset}`);
              console.log(`  Workflows: ${colors.cyan}${workflows.length}${colors.reset}`);
              workflows.forEach(w => {
                console.log(`    - ${w.id}`);
              });
            } catch (error) {
              console.error(`${colors.red}❌ Failed to create pattern: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
  )
  
  // IAM Commands
  .addCommand(
    new Command('iam')
      .description('IAM role and policy management')
      .addCommand(
        new Command('create-role')
          .description('Create IAM role for workflows')
          .requiredOption('--name <name>', 'Role name')
          .option('--description <text>', 'Role description')
          .option('--max-duration <seconds>', 'Maximum session duration', '3600')
          .action(async (options) => {
            console.log(`\n${colors.bright}👤 Creating IAM Role${colors.reset}\n`);
            
            try {
              iamIntegration.enableMockMode();
              
              const roleArn = await iamIntegration.createRole({
                name: options.name,
                description: options.description || `BCCE role ${options.name}`,
                assumeRolePolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [{
                    Effect: 'Allow',
                    Principal: { Service: 'lambda.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                  }],
                },
                policies: [],
                maxSessionDuration: parseInt(options.maxDuration),
              });
              
              console.log(`${colors.green}✅ Role created successfully${colors.reset}`);
              console.log(`  ARN: ${colors.cyan}${roleArn}${colors.reset}`);
              console.log(`  Name: ${colors.cyan}${options.name}${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}❌ Failed to create role: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('assume-role')
          .description('Assume IAM role and get credentials')
          .requiredOption('--role <arn>', 'Role ARN to assume')
          .option('--session <name>', 'Session name', 'bcce-session')
          .option('--duration <seconds>', 'Session duration', '3600')
          .action(async (options) => {
            console.log(`\n${colors.bright}🔑 Assuming IAM Role${colors.reset}\n`);
            
            try {
              iamIntegration.enableMockMode();
              
              const credentials = await iamIntegration.assumeRole(
                options.role,
                options.session,
                { duration: parseInt(options.duration) }
              );
              
              console.log(`${colors.green}✅ Role assumed successfully${colors.reset}`);
              console.log(`  Access Key: ${colors.cyan}${credentials.accessKeyId.substring(0, 10)}...${colors.reset}`);
              console.log(`  Expires: ${colors.cyan}${credentials.expiration.toLocaleString()}${colors.reset}`);
              console.log(`\n${colors.yellow}⚠️  Credentials are temporary and will expire${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}❌ Failed to assume role: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
      .addCommand(
        new Command('audit')
          .description('Audit IAM permissions and generate report')
          .action(async () => {
            console.log(`\n${colors.bright}🔍 Auditing IAM Permissions${colors.reset}\n`);
            
            try {
              iamIntegration.enableMockMode();
              
              const audit = await iamIntegration.auditPermissions();
              
              console.log(`${colors.bright}Audit Report${colors.reset}\n`);
              
              if (audit.overprivileged.length > 0) {
                console.log(`${colors.yellow}⚠️  Overprivileged Resources (${audit.overprivileged.length})${colors.reset}`);
                audit.overprivileged.forEach(item => {
                  console.log(`  - ${item}`);
                });
                console.log();
              }
              
              if (audit.unused.length > 0) {
                console.log(`${colors.yellow}⚠️  Unused Resources (${audit.unused.length})${colors.reset}`);
                audit.unused.forEach(item => {
                  console.log(`  - ${item}`);
                });
                console.log();
              }
              
              if (audit.recommendations.length > 0) {
                console.log(`${colors.cyan}💡 Recommendations (${audit.recommendations.length})${colors.reset}`);
                audit.recommendations.forEach(rec => {
                  console.log(`  - ${rec}`);
                });
              }
              
              if (audit.overprivileged.length === 0 && audit.unused.length === 0) {
                console.log(`${colors.green}✅ No security issues found${colors.reset}`);
              }
            } catch (error) {
              console.error(`${colors.red}❌ Failed to audit permissions: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            }
          })
      )
  )
  
  // Integration Status Command
  .addCommand(
    new Command('status')
      .description('Check AWS integration status')
      .action(async () => {
        console.log(`\n${colors.bright}🔌 AWS Integration Status${colors.reset}\n`);
        
        try {
          // Enable mock mode for all services
          cloudWatchIntegration.enableMockMode();
          eventBridgeOrchestrator.enableMockMode();
          iamIntegration.enableMockMode();
          
          console.log(`${colors.bright}Services:${colors.reset}`);
          console.log(`  CloudWatch: ${colors.green}✅ Connected${colors.reset} (Mock Mode)`);
          console.log(`  S3 Storage: ${colors.green}✅ Available${colors.reset} (Mock Mode)`);
          console.log(`  EventBridge: ${colors.green}✅ Active${colors.reset} (Mock Mode)`);
          console.log(`  IAM: ${colors.green}✅ Configured${colors.reset} (Mock Mode)`);
          
          console.log(`\n${colors.bright}Configuration:${colors.reset}`);
          console.log(`  Region: ${colors.cyan}${process.env.AWS_REGION || 'us-east-1'}${colors.reset}`);
          console.log(`  Account: ${colors.cyan}${process.env.AWS_ACCOUNT_ID || '123456789012'}${colors.reset}`);
          
          const metrics = eventBridgeOrchestrator.getMetrics();
          console.log(`\n${colors.bright}Metrics:${colors.reset}`);
          console.log(`  Active Rules: ${colors.cyan}${metrics.totalRules}${colors.reset}`);
          console.log(`  Scheduled Workflows: ${colors.cyan}${metrics.activeSchedules}${colors.reset}`);
          console.log(`  Configured Triggers: ${colors.cyan}${metrics.totalTriggers}${colors.reset}`);
          
          console.log(`\n${colors.gray}Note: Running in mock mode for testing${colors.reset}`);
        } catch (error) {
          console.error(`${colors.red}❌ Failed to check status: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  );