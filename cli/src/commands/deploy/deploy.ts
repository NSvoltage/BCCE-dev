import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../lib/config.js';
import path from 'node:path';

export const deployCmd = new Command('deploy')
  .description('Deploy BCCE infrastructure using Terraform modules')
  .option('--module <name>', 'Deploy specific module only')
  .option('--dry-run', 'Show what would be deployed without making changes')
  .option('--auto-approve', 'Auto-approve Terraform changes (dangerous)')
  .action(async (opts) => {
    try {
      const config = loadConfig();
      console.log('🚀 Deploying BCCE infrastructure...');
      console.log(`   Auth Track: ${config.auth}`);
      console.log(`   Regions: ${config.regions.join(', ')}`);
      
      // Check for Terraform
      try {
        execSync('terraform version', { stdio: 'pipe' });
      } catch (error) {
        console.error('❌ Terraform not found in PATH');
        console.error('   Fix: Install Terraform from https://terraform.io');
        process.exit(1);
      }

      const terraformDir = path.resolve('iac/terraform');
      if (!existsSync(terraformDir)) {
        console.error('❌ Terraform modules not found');
        console.error('   Expected directory: iac/terraform/');
        console.error('   Ensure you have the BCCE infrastructure modules');
        process.exit(1);
      }

      // Determine modules to deploy based on config
      const modules = [];
      
      if (config.auth === 'identity-center') {
        modules.push('identity-center');
      } else if (config.auth === 'cognito-oidc') {
        modules.push('cognito-oidc-sts');
      }
      
      if (config.guardrails) {
        modules.push('guardrails');
      }
      
      if (config.privatelink) {
        modules.push('privatelink');
      }
      
      modules.push('observability'); // Always include observability

      // Filter modules if specific module requested
      const targetModules = opts.module ? [opts.module] : modules;

      console.log(`\n📋 Deployment Plan:`);
      for (const module of targetModules) {
        console.log(`   ✓ ${module}`);
      }

      if (opts.dryRun) {
        console.log('\n🔍 Dry run mode - would execute:');
        for (const module of targetModules) {
          console.log(`   terraform -chdir=iac/terraform/${module} plan`);
        }
        return;
      }

      // Deploy each module
      for (const module of targetModules) {
        const moduleDir = path.join(terraformDir, module);
        
        if (!existsSync(moduleDir)) {
          console.error(`❌ Module not found: ${module}`);
          console.error(`   Expected: ${moduleDir}`);
          continue;
        }

        console.log(`\n🔧 Deploying module: ${module}`);
        
        try {
          // Initialize Terraform
          console.log('   Initializing...');
          execSync(`terraform -chdir=${moduleDir} init`, { 
            stdio: ['ignore', 'pipe', 'pipe'] 
          });

          // Plan
          console.log('   Planning...');
          const planArgs = config.regions.map(r => `-var="region=${r}"`).join(' ');
          execSync(`terraform -chdir=${moduleDir} plan ${planArgs}`, { 
            stdio: ['ignore', 'inherit', 'inherit'] 
          });

          // Apply
          const applyFlags = opts.autoApprove ? '-auto-approve' : '';
          console.log(`   Applying${opts.autoApprove ? ' (auto-approved)' : ''}...`);
          execSync(`terraform -chdir=${moduleDir} apply ${applyFlags} ${planArgs}`, { 
            stdio: ['inherit', 'inherit', 'inherit'] 
          });

          console.log(`   ✅ Module ${module} deployed successfully`);

        } catch (error: any) {
          console.error(`   ❌ Failed to deploy module ${module}:`);
          console.error(`   ${error.message}`);
          
          if (error.status !== undefined) {
            console.error(`\n💡 Terraform troubleshooting:`);
            console.error('   1. Check AWS credentials: aws sts get-caller-identity');
            console.error('   2. Verify permissions for the target resources');
            console.error('   3. Check for resource conflicts or naming collisions');
            console.error(`   4. Review Terraform state: terraform -chdir=${moduleDir} show`);
          }
          
          process.exit(1);
        }
      }

      console.log('\n🎉 Deployment completed successfully!');
      console.log('\n🔍 Next steps:');
      console.log('1. Run: bcce doctor');
      console.log('2. Test a workflow: bcce workflow run workflows/starters/test-grader.yml');

      if (config.auth === 'cognito-oidc') {
        console.log('3. Build credential helpers: bcce package');
      }

    } catch (error: any) {
      if (error.message?.includes('Config not found')) {
        console.error('❌ No BCCE configuration found');
        console.error('   Fix: Run bcce init first');
      } else {
        console.error('❌ Deployment failed:', error.message);
      }
      process.exit(1);
    }
  });