import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../lib/config.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

export const doctorCmd = new Command('doctor')
  .description('Comprehensive health checks: creds, AWS_REGION, Bedrock access, Guardrails, PrivateLink, Claude CLI')
  .action(async () => {
    const checks: CheckResult[] = [];
    
    // AWS_REGION check
    const region = process.env.AWS_REGION;
    if (!region) {
      checks.push({
        name: 'AWS_REGION',
        status: 'fail',
        message: 'AWS_REGION not set',
        fix: 'export AWS_REGION=<allowed-region>'
      });
    } else {
      checks.push({
        name: 'AWS_REGION',
        status: 'pass',
        message: `Set to: ${region}`
      });
    }

    // AWS credentials check
    try {
      execSync('aws sts get-caller-identity', { stdio: 'pipe' });
      checks.push({
        name: 'AWS Credentials',
        status: 'pass',
        message: 'Valid credentials found'
      });
    } catch (error) {
      checks.push({
        name: 'AWS Credentials',
        status: 'fail',
        message: 'No valid credentials',
        fix: 'aws sso login --profile <org> OR aws configure'
      });
    }

    // Claude CLI presence
    try {
      const claudeVersion = execSync('claude --version', { stdio: 'pipe' }).toString().trim();
      checks.push({
        name: 'Claude CLI',
        status: 'pass',
        message: `Found: ${claudeVersion}`
      });
    } catch (error) {
      checks.push({
        name: 'Claude CLI',
        status: 'fail',
        message: 'Claude CLI not found in PATH',
        fix: 'npm i -g @anthropic-ai/claude-code'
      });
    }

    // CLAUDE_CODE_USE_BEDROCK check
    const bedrockEnabled = process.env.CLAUDE_CODE_USE_BEDROCK;
    if (bedrockEnabled !== '1') {
      checks.push({
        name: 'Bedrock Mode',
        status: 'warn',
        message: 'CLAUDE_CODE_USE_BEDROCK not set to 1',
        fix: 'export CLAUDE_CODE_USE_BEDROCK=1'
      });
    } else {
      checks.push({
        name: 'Bedrock Mode',
        status: 'pass',
        message: 'Enabled'
      });
    }

    // Bedrock service reachability (if region is set)
    if (region) {
      try {
        execSync(`aws bedrock list-foundation-models --region ${region}`, { stdio: 'pipe' });
        checks.push({
          name: 'Bedrock Access',
          status: 'pass',
          message: `Bedrock accessible in ${region}`
        });
      } catch (error) {
        checks.push({
          name: 'Bedrock Access',
          status: 'fail',
          message: `Bedrock not accessible in ${region}`,
          fix: `Check IAM permissions for bedrock:ListFoundationModels in ${region}`
        });
      }
    }

    // Config file check (if exists)
    if (existsSync('.bcce.config.json')) {
      try {
        const config = loadConfig();
        checks.push({
          name: 'BCCE Config',
          status: 'pass',
          message: `Auth track: ${config.auth}, Regions: ${config.regions.join(', ')}`
        });

        // Additional checks based on config
        if (config.guardrails) {
          checks.push({
            name: 'Guardrails',
            status: 'warn',
            message: 'Enabled in config but not validated',
            fix: 'Deploy guardrails module and verify ARNs'
          });
        }

        if (config.privatelink) {
          checks.push({
            name: 'PrivateLink',
            status: 'warn',
            message: 'Enabled in config but not validated',
            fix: 'Run go-tools/doctor-probes for DNS/endpoint validation'
          });
        }
      } catch (error) {
        checks.push({
          name: 'BCCE Config',
          status: 'fail',
          message: 'Invalid config file',
          fix: 'Run bcce init to recreate config'
        });
      }
    } else {
      checks.push({
        name: 'BCCE Config',
        status: 'warn',
        message: 'No .bcce.config.json found',
        fix: 'Run bcce init to create config'
      });
    }

    // Model access and recommendation check
    if (region) {
      try {
        const models = execSync(`aws bedrock list-foundation-models --region ${region} --query "modelSummaries[?contains(modelId, 'anthropic.claude')].{id:modelId,name:modelName}" --output json`, { stdio: 'pipe' }).toString().trim();
        const modelList = JSON.parse(models || '[]');
        
        if (modelList.length > 0) {
          // Find the latest Sonnet model (enterprise preference)
          const sonnetModels = modelList.filter((m: any) => m.id.includes('sonnet')).sort((a: any, b: any) => b.id.localeCompare(a.id));
          const latestSonnet = sonnetModels[0]?.id;
          
          checks.push({
            name: 'Claude Models',
            status: 'pass',
            message: `Found ${modelList.length} Claude models. Latest Sonnet: ${latestSonnet || 'none'}`
          });

          // Check if BEDROCK_MODEL_ID is set and valid
          const configuredModel = process.env.BEDROCK_MODEL_ID;
          if (!configuredModel) {
            checks.push({
              name: 'Model Configuration',
              status: 'warn',
              message: 'BEDROCK_MODEL_ID not set',
              fix: latestSonnet ? `export BEDROCK_MODEL_ID="${latestSonnet}"` : 'Set BEDROCK_MODEL_ID to your preferred Claude model'
            });
          } else if (configuredModel.startsWith('${') && configuredModel.endsWith('}')) {
            checks.push({
              name: 'Model Configuration',
              status: 'warn',
              message: 'BEDROCK_MODEL_ID contains unresolved variable',
              fix: 'Set BEDROCK_MODEL_ID to actual model ID, not template variable'
            });
          } else {
            // Verify the configured model exists
            const modelExists = modelList.some((m: any) => m.id === configuredModel) || configuredModel.startsWith('arn:aws:bedrock');
            if (modelExists || configuredModel.startsWith('arn:aws:bedrock')) {
              checks.push({
                name: 'Model Configuration',
                status: 'pass',
                message: `Using model: ${configuredModel}`
              });
            } else {
              checks.push({
                name: 'Model Configuration',
                status: 'warn',
                message: `Configured model "${configuredModel}" not found in available models`,
                fix: latestSonnet ? `export BEDROCK_MODEL_ID="${latestSonnet}"` : 'Check available models and update BEDROCK_MODEL_ID'
              });
            }
          }
        } else {
          checks.push({
            name: 'Claude Models',
            status: 'warn',
            message: 'No Claude models found',
            fix: 'Request access to Anthropic models in AWS Bedrock console'
          });
        }
      } catch (error) {
        checks.push({
          name: 'Claude Models',
          status: 'warn',
          message: 'Could not list models',
          fix: 'Check bedrock:ListFoundationModels permissions'
        });
      }
    }

    // Print results
    let hasFailures = false;
    let hasWarnings = false;

    console.log('\n🩺 BCCE Doctor Report\n');
    
    for (const check of checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      console.log(`${icon} ${check.name}: ${check.message}`);
      
      if (check.fix) {
        console.log(`   Fix: ${check.fix}`);
      }
      
      if (check.status === 'fail') hasFailures = true;
      if (check.status === 'warn') hasWarnings = true;
    }

    console.log('');
    
    if (hasFailures) {
      console.log('❌ Critical issues found. Please fix the above failures.');
      process.exit(1);
    } else if (hasWarnings) {
      console.log('⚠️  Some issues detected. Consider addressing warnings for optimal experience.');
    } else {
      console.log('✅ All checks passed! BCCE is ready to use.');
    }
  });