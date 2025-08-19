import { Command } from 'commander';
import inquirer from 'inquirer';
import { saveConfig, type BcceConfig, type AuthTrack } from '../../lib/config.js';
import { EnterpriseAnalyticsArchitecture } from '../../enterprise/analytics-architecture.js';
import fs from 'node:fs';

export const setupCmd = new Command('setup')
  .description('Environment setup and configuration for BCCE governance')
  .option('--auth <track>', 'Authentication track: identity-center|cognito-oidc')
  .option('--regions <csv>', 'AWS regions (comma-separated): e.g. us-east-1,us-west-2')  
  .option('--guardrails <onoff>', 'Enable Guardrails templates: on|off')
  .option('--privatelink <onoff>', 'Enable PrivateLink: on|off')
  .option('--force', 'Overwrite existing config')
  .action(async (opts) => {
    const configExists = fs.existsSync('.bcce.config.json');
    
    if (configExists && !opts.force) {
      console.log('⚠️  BCCE config already exists (.bcce.config.json)');
      const { overwrite } = await inquirer.prompt([{
        name: 'overwrite',
        type: 'confirm',
        message: 'Overwrite existing configuration?',
        default: false
      }]);
      
      if (!overwrite) {
        console.log('❌ Cancelled. Use --force to overwrite existing config.');
        return;
      }
    }

    console.log('🚀 Initializing BCCE configuration...\n');

    const answers = await inquirer.prompt([
      {
        name: 'auth',
        type: 'list',
        message: 'Choose authentication track:',
        choices: [
          {
            name: 'Identity Center (SSO) - Recommended for enterprise',
            value: 'identity-center',
            short: 'Identity Center'
          },
          {
            name: 'Cognito OIDC - For federated identity or custom setups',
            value: 'cognito-oidc', 
            short: 'Cognito OIDC'
          }
        ],
        when: !opts.auth
      },
      {
        name: 'regions',
        type: 'input',
        message: 'AWS regions (comma-separated):',
        default: 'us-east-1',
        validate: (input: string) => {
          const regions = input.split(',').map(r => r.trim()).filter(Boolean);
          if (regions.length === 0) return 'At least one region is required';
          // Basic region format validation
          const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
          for (const region of regions) {
            if (!regionPattern.test(region)) {
              return `Invalid region format: ${region}. Expected format: us-east-1`;
            }
          }
          return true;
        },
        when: !opts.regions
      },
      {
        name: 'guardrails',
        type: 'list',
        message: 'Enable Guardrails templates for content filtering?',
        choices: [
          { name: 'Yes - Enable PII/secrets filtering (recommended)', value: 'on', short: 'On' },
          { name: 'No - Skip Guardrails for now', value: 'off', short: 'Off' }
        ],
        when: !opts.guardrails
      },
      {
        name: 'privatelink',
        type: 'list',
        message: 'Enable PrivateLink for private connectivity?',
        choices: [
          { name: 'No - Use public internet (simpler setup)', value: 'off', short: 'Off' },
          { name: 'Yes - Enable VPC endpoints (enterprise security)', value: 'on', short: 'On' }
        ],
        when: !opts.privatelink
      },
      {
        name: 'analyticsModel',
        type: 'list',
        message: 'Choose enterprise analytics deployment model:',
        choices: [
          {
            name: 'Open Source Self-Hosted (10-500 devs) - $200-800/month',
            value: 'open-source-self-hosted',
            short: 'Open Source'
          },
          {
            name: 'Kubernetes Enterprise (100-1000 devs) - $500-1.5k/month',
            value: 'kubernetes-enterprise',
            short: 'Kubernetes'
          },
          {
            name: 'Serverless Analytics (50-200 devs) - $300-600/month',
            value: 'serverless-analytics',
            short: 'Serverless'
          }
        ],
        default: 'open-source-self-hosted'
      },
      {
        name: 'dashboardPlatform',
        type: 'list',
        message: 'Choose analytics dashboard platform:',
        choices: [
          {
            name: 'Grafana (Open Source) - Most popular, great for metrics',
            value: 'grafana',
            short: 'Grafana'
          },
          {
            name: 'Metabase (Open Source) - User-friendly, great for business users',
            value: 'metabase',
            short: 'Metabase'
          },
          {
            name: 'Apache Superset (Open Source) - Feature-rich, Airbnb-created',
            value: 'superset',
            short: 'Superset'
          }
        ],
        default: 'grafana'
      },
      {
        name: 'estimatedUsers',
        type: 'number',
        message: 'Estimated number of developers/users:',
        default: 25,
        validate: (input: number) => {
          if (input < 1) return 'Must have at least 1 user';
          if (input > 10000) return 'For >10k users, contact enterprise support';
          return true;
        }
      }
    ]);

    // Process inputs
    const auth = (opts.auth || answers.auth) as AuthTrack;
    const regionList = String(opts.regions || answers.regions)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const guardrails = (opts.guardrails || answers.guardrails) === 'on';
    const privatelink = (opts.privatelink || answers.privatelink) === 'on';
    const analyticsModel = answers.analyticsModel;
    const dashboardPlatform = answers.dashboardPlatform;
    const estimatedUsers = answers.estimatedUsers;

    // Import open source analytics architecture
    const { OpenSourceAnalyticsArchitecture } = await import('../../enterprise/analytics-architecture-v2.js');

    // Generate open source analytics configuration
    let analyticsConfig;
    switch (analyticsModel) {
      case 'kubernetes-enterprise':
        analyticsConfig = OpenSourceAnalyticsArchitecture.createKubernetesModel();
        break;
      case 'serverless-analytics':
        analyticsConfig = OpenSourceAnalyticsArchitecture.createServerlessModel();
        break;
      case 'open-source-self-hosted':
      default:
        analyticsConfig = OpenSourceAnalyticsArchitecture.createSelfHostedModel();
        break;
    }

    // Customize visualization platform
    analyticsConfig.visualization.primary = dashboardPlatform;

    // Calculate estimated costs using open source architecture
    const costEstimate = OpenSourceAnalyticsArchitecture.estimateOpenSourceCosts(analyticsConfig, estimatedUsers);
    
    // Validate configuration
    const validation = EnterpriseAnalyticsArchitecture.validateConfiguration(analyticsConfig);

    const config: Partial<BcceConfig> = {
      auth,
      regions: regionList,
      guardrails,
      privatelink,
      analytics: {
        model: analyticsModel,
        platform: dashboardPlatform,
        estimatedUsers,
        monthlyCostEstimate: costEstimate.total,
        savingsVsQuickSight: costEstimate.savings.vsQuickSight,
        configuration: analyticsConfig
      }
    };

    try {
      const configPath = saveConfig(config);
      
      console.log('\n✅ BCCE configuration saved!');
      console.log(`📄 Config file: ${configPath}\n`);
      
      // Display summary
      console.log('📋 Configuration Summary:');
      console.log(`   Auth Track: ${auth}`);
      console.log(`   Regions: ${regionList.join(', ')}`);  
      console.log(`   Guardrails: ${guardrails ? 'Enabled' : 'Disabled'}`);
      console.log(`   PrivateLink: ${privatelink ? 'Enabled' : 'Disabled'}`);
      console.log(`   Analytics Model: ${analyticsModel}`);
      console.log(`   Dashboard Platform: ${dashboardPlatform} (Open Source)`);
      console.log(`   Estimated Users: ${estimatedUsers}`);
      console.log(`   Monthly Cost Estimate: $${costEstimate.total.toFixed(2)}\n`);

      // Display cost breakdown
      console.log('💰 Cost Breakdown:');
      Object.entries(costEstimate.breakdown).forEach(([service, cost]) => {
        console.log(`   ${service}: $${cost.toFixed(2)}/month`);
      });
      
      // Show savings vs commercial solutions
      console.log('\n💡 Cost Savings vs Commercial:');
      console.log(`   vs QuickSight: $${costEstimate.savings.vsQuickSight.toFixed(2)}/month saved`);
      console.log(`   vs Tableau: $${costEstimate.savings.vsCommercial.toFixed(2)}/month saved`);
      console.log();

      // Display validation warnings
      if (validation.warnings.length > 0) {
        console.log('⚠️  Configuration Warnings:');
        validation.warnings.forEach(warning => console.log(`   • ${warning}`));
        console.log();
      }

      if (validation.errors.length > 0) {
        console.log('❌ Configuration Errors:');
        validation.errors.forEach(error => console.log(`   • ${error}`));
        console.log();
      }

      // Next steps
      console.log('🎯 Next Steps:');
      if (auth === 'identity-center') {
        console.log('1. 🔑 Set up AWS SSO: aws configure sso');
        console.log('2. 🩺 Run health check: bcce doctor');
        console.log('3. 🚀 Deploy infrastructure: bcce deploy');
      } else {
        console.log('1. 🏗️  Deploy Cognito infrastructure: bcce deploy');
        console.log('2. 📦 Build credential helpers: bcce package');
        console.log('3. 🩺 Run health check: bcce doctor');
      }
      console.log('4. 📊 Launch analytics dashboard: bcce dashboard');
      console.log('5. 🔄 Try a workflow: bcce workflow scaffold my-first-workflow');
      
      // Analytics-specific next steps
      console.log('\n📊 Analytics Setup:');
      if (analyticsModel === 'open-source-self-hosted') {
        console.log(`• Open source dashboard: ${dashboardPlatform} self-hosted on AWS`);
        console.log('• Enterprise features: SSO, custom branding, full control');
        console.log('• No vendor lock-in: All components open source');
        console.log('• Cost efficient: ~80% savings vs commercial solutions');
      } else if (analyticsModel === 'kubernetes-enterprise') {
        console.log(`• Kubernetes deployment: ${dashboardPlatform} on EKS cluster`);
        console.log('• High availability: Multi-zone, auto-scaling');
        console.log('• GitOps ready: Infrastructure as code');
        console.log('• Enterprise grade: Production ready at scale');
      } else {
        console.log(`• Serverless analytics: ${dashboardPlatform} on AWS Lambda`);
        console.log('• Zero maintenance: Fully managed infrastructure');
        console.log('• Pay per use: Scale to zero when not in use');
        console.log('• Quick deployment: 5-minute setup');
      }
      
      console.log('\n🎯 Premium Upgrade Options (Optional):');
      console.log('• Grafana Enterprise: $7/user/month for advanced features');
      console.log('• AWS QuickSight: $18/user/month for ML insights');
      console.log('• Commercial support: Available from platform vendors');

      // Warnings
      if (privatelink) {
        console.log('\n⚠️  PrivateLink enabled: Ensure VPC endpoints are configured');
      }
      
    } catch (error: any) {
      console.error('❌ Failed to save configuration:', error.message);
      process.exit(1);
    }
  });