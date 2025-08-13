import { Command } from 'commander';
import { loadConfig } from '../../lib/config.js';

const BASELINE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow", 
      "Action": [
        "bedrock:ListInferenceProfiles",
        "bedrock:GetInferenceProfile"
      ],
      "Resource": "*"
    }
  ]
};

const INFERENCE_PROFILE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*:*:inference-profile/*",
        "arn:aws:bedrock:*:*:foundation-model/anthropic.*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:ListInferenceProfiles",
        "bedrock:GetInferenceProfile",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    }
  ]
};

const GUARDRAILS_ADDON = {
  "Effect": "Allow",
  "Action": [
    "bedrock:GetGuardrail",
    "bedrock:ListGuardrails"
  ],
  "Resource": "*"
};

export const policyCmd = new Command('policy')
  .description('Generate IAM policy templates for BCCE deployments');

policyCmd
  .command('print')
  .description('Print IAM policy JSON')
  .argument('[type]', 'Policy type: baseline|inference-profile|guardrails', 'baseline')
  .option('--region <region>', 'Specific AWS region for policy scoping')
  .option('--account-id <id>', 'AWS account ID for resource ARNs')
  .action((type, opts) => {
    let policy;
    
    switch (type) {
      case 'baseline':
        policy = { ...BASELINE_POLICY };
        break;
      case 'inference-profile':
        policy = { ...INFERENCE_PROFILE_POLICY };
        break;
      case 'guardrails':
        policy = { ...BASELINE_POLICY };
        policy.Statement.push(GUARDRAILS_ADDON);
        break;
      default:
        console.error('❌ Invalid policy type. Use: baseline, inference-profile, or guardrails');
        process.exit(1);
    }

    // Apply region/account scoping if provided
    if (opts.region || opts.accountId) {
      for (const statement of policy.Statement) {
        if (statement.Resource && Array.isArray(statement.Resource)) {
          statement.Resource = statement.Resource.map((resource: string) => {
            if (opts.region) {
              resource = resource.replace(/\*:/g, `${opts.region}:`);
            }
            if (opts.accountId) {
              resource = resource.replace(/:(\*:)/g, `:${opts.accountId}:`);
            }
            return resource;
          });
        }
      }
    }

    console.log(JSON.stringify(policy, null, 2));
  });

policyCmd
  .command('generate-config')
  .description('Generate policy based on current BCCE configuration')
  .action(() => {
    try {
      const config = loadConfig();
      
      console.log('# BCCE IAM Policy Configuration\n');
      console.log(`Auth Track: ${config.auth}`);
      console.log(`Regions: ${config.regions.join(', ')}`);
      console.log(`Guardrails: ${config.guardrails ? 'Enabled' : 'Disabled'}`);
      console.log(`PrivateLink: ${config.privatelink ? 'Enabled' : 'Disabled'}\n`);

      // Generate appropriate policy
      let policy = { ...BASELINE_POLICY };
      
      if (config.guardrails) {
        policy.Statement.push(GUARDRAILS_ADDON);
      }
      
      // Add PrivateLink specific permissions if needed
      if (config.privatelink) {
        policy.Statement.push({
          "Effect": "Allow",
          "Action": [
            "ec2:DescribeVpcEndpoints",
            "ec2:DescribeNetworkInterfaces"
          ],
          "Resource": "*"
        });
      }

      // Scope to specific regions if configured
      if (config.regions.length > 0 && !config.regions.includes('*')) {
        for (const statement of policy.Statement) {
          if (statement.Resource === "*") continue;
          
          if (Array.isArray(statement.Resource)) {
            statement.Resource = statement.Resource.flatMap((resource: string) => 
              config.regions.map(region => 
                resource.includes('*') ? resource.replace('*', region) : resource
              )
            );
          }
        }
      }

      console.log('## Generated Policy\n```json');
      console.log(JSON.stringify(policy, null, 2));
      console.log('```\n');

      console.log('## Usage Instructions\n');
      
      if (config.auth === 'identity-center') {
        console.log('### Identity Center Setup');
        console.log('1. Create a Permission Set in AWS IAM Identity Center');
        console.log('2. Attach the above policy JSON as an inline policy');
        console.log('3. Assign the Permission Set to users/groups');
        console.log('4. Users configure: `aws configure sso`\n');
      } else {
        console.log('### Cognito Identity Pool Setup');
        console.log('1. Create IAM roles for authenticated identities');
        console.log('2. Attach the above policy to the role');
        console.log('3. Configure role trust relationship for your OIDC provider');
        console.log('4. Set COGNITO_IDENTITY_POOL_ID environment variable\n');
      }

      console.log('## Security Notes');
      console.log('- This policy provides minimum required permissions');
      console.log('- Consider further restrictions based on your security requirements');
      console.log('- Use Inference Profiles for additional model access control');
      console.log('- Enable CloudTrail for audit logging');

    } catch (error: any) {
      if (error.message?.includes('Config not found')) {
        console.error('❌ No BCCE configuration found');
        console.error('   Fix: Run bcce init first');
      } else {
        console.error('❌ Policy generation failed:', error.message);
      }
      process.exit(1);
    }
  });

policyCmd
  .command('validate')
  .description('Validate current IAM permissions')
  .action(async () => {
    console.log('🔍 Validating current IAM permissions...');
    
    const { execSync } = await import('node:child_process');
    
    const checks = [
      { action: 'bedrock:ListFoundationModels', required: true },
      { action: 'bedrock:InvokeModel', required: true },
      { action: 'bedrock:ListInferenceProfiles', required: false },
      { action: 'bedrock:ListGuardrails', required: false }
    ];

    for (const check of checks) {
      try {
        // Attempt dry-run of the permission
        const service = check.action.split(':')[0];
        const action = check.action.split(':')[1];
        
        if (service === 'bedrock') {
          if (action === 'ListFoundationModels') {
            execSync('aws bedrock list-foundation-models --max-items 1', { stdio: 'pipe' });
            console.log(`✅ ${check.action}`);
          } else if (action === 'ListInferenceProfiles') {
            try {
              execSync('aws bedrock list-inference-profiles --max-items 1', { stdio: 'pipe' });
              console.log(`✅ ${check.action}`);
            } catch {
              console.log(`⚠️  ${check.action} (not available in this region)`);
            }
          } else if (action === 'ListGuardrails') {
            try {
              execSync('aws bedrock list-guardrails --max-items 1', { stdio: 'pipe' });
              console.log(`✅ ${check.action}`);
            } catch {
              console.log(`⚠️  ${check.action} (not available or no guardrails)`);
            }
          } else {
            console.log(`⏭️  ${check.action} (cannot test without invoking models)`);
          }
        }
      } catch (error) {
        const icon = check.required ? '❌' : '⚠️';
        console.log(`${icon} ${check.action} - Permission denied`);
        if (check.required) {
          console.log('   This permission is required for BCCE to function');
        }
      }
    }
    
    console.log('\n💡 Run `bcce doctor` for comprehensive validation');
  });