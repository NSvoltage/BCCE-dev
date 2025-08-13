import { Command } from 'commander';
import inquirer from 'inquirer';
import { saveConfig, type BcceConfig, type AuthTrack } from '../../lib/config.js';
import fs from 'node:fs';

export const initCmd = new Command('init')
  .description('Initialize BCCE config - choose auth track, regions, and feature toggles')
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

    const config: Partial<BcceConfig> = {
      auth,
      regions: regionList,
      guardrails,
      privatelink
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
      console.log(`   PrivateLink: ${privatelink ? 'Enabled' : 'Disabled'}\n`);

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
      console.log('4. 🔄 Try a workflow: bcce workflow scaffold my-first-workflow');

      // Warnings
      if (privatelink) {
        console.log('\n⚠️  PrivateLink enabled: Ensure VPC endpoints are configured');
      }
      
    } catch (error: any) {
      console.error('❌ Failed to save configuration:', error.message);
      process.exit(1);
    }
  });