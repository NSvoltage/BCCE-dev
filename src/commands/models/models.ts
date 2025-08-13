import { Command } from 'commander';
import { execSync } from 'node:child_process';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputModalities: string[];
  outputModalities: string[];
}

export const modelsCmd = new Command('models')
  .description('Discover and select Claude models available in your AWS region');

modelsCmd
  .command('list')
  .description('List all available Claude models')
  .option('--region <region>', 'AWS region to check', process.env.AWS_REGION)
  .option('--format <format>', 'Output format: table, json, ids', 'table')
  .action(async (opts) => {
    const region = opts.region || process.env.AWS_REGION;
    
    if (!region) {
      console.error('❌ AWS_REGION not set. Use --region or export AWS_REGION=<region>');
      process.exit(1);
    }

    try {
      console.log(`🔍 Discovering Claude models in ${region}...`);
      
      const modelsJson = execSync(
        `aws bedrock list-foundation-models --region ${region} --query "modelSummaries[?contains(modelId, 'anthropic.claude')]" --output json`,
        { stdio: 'pipe' }
      ).toString().trim();
      
      const models: ModelInfo[] = JSON.parse(modelsJson || '[]');
      
      if (models.length === 0) {
        console.log('⚠️  No Claude models found in this region.');
        console.log('💡 Request access to Anthropic models in the AWS Bedrock console.');
        return;
      }

      if (opts.format === 'json') {
        console.log(JSON.stringify(models, null, 2));
        return;
      }
      
      if (opts.format === 'ids') {
        models.forEach(model => console.log(model.modelId));
        return;
      }

      // Table format (default)
      console.log(`\n📋 Found ${models.length} Claude models:\n`);
      
      // Group by model family
      const sonnetModels = models.filter(m => m.modelId.includes('sonnet'));
      const haikuModels = models.filter(m => m.modelId.includes('haiku'));
      const opusModels = models.filter(m => m.modelId.includes('opus'));
      const otherModels = models.filter(m => !m.modelId.includes('sonnet') && !m.modelId.includes('haiku') && !m.modelId.includes('opus'));

      const printModelGroup = (title: string, groupModels: ModelInfo[]) => {
        if (groupModels.length === 0) return;
        
        console.log(`${title}:`);
        groupModels
          .sort((a, b) => b.modelId.localeCompare(a.modelId)) // Latest first
          .forEach((model, index) => {
            const isLatest = index === 0 && groupModels.length > 1;
            const marker = isLatest ? '🔥 LATEST' : '';
            console.log(`  ${model.modelId} ${marker}`);
            console.log(`     └─ ${model.modelName || 'Claude model'}`);
          });
        console.log('');
      };

      printModelGroup('🧠 Claude Sonnet (Balanced performance & cost)', sonnetModels);
      printModelGroup('⚡ Claude Haiku (Fast & lightweight)', haikuModels);  
      printModelGroup('🎯 Claude Opus (Maximum capability)', opusModels);
      printModelGroup('📦 Other Claude models', otherModels);

    } catch (error: any) {
      console.error('❌ Failed to list models:', error.message);
      console.error('💡 Check AWS credentials and bedrock:ListFoundationModels permissions');
      process.exit(1);
    }
  });

modelsCmd
  .command('recommend')
  .description('Get model recommendations based on use case')
  .option('--use-case <type>', 'Use case: coding, analysis, creative, general', 'coding')
  .option('--region <region>', 'AWS region to check', process.env.AWS_REGION)
  .action(async (opts) => {
    const region = opts.region || process.env.AWS_REGION;
    
    if (!region) {
      console.error('❌ AWS_REGION not set. Use --region or export AWS_REGION=<region>');
      process.exit(1);
    }

    try {
      const modelsJson = execSync(
        `aws bedrock list-foundation-models --region ${region} --query "modelSummaries[?contains(modelId, 'anthropic.claude')]" --output json`,
        { stdio: 'pipe' }
      ).toString().trim();
      
      const models: ModelInfo[] = JSON.parse(modelsJson || '[]');
      
      if (models.length === 0) {
        console.log('⚠️  No Claude models found. Request access in AWS Bedrock console.');
        return;
      }

      // Find latest models by family
      const sonnetModels = models.filter(m => m.modelId.includes('sonnet')).sort((a, b) => b.modelId.localeCompare(a.modelId));
      const haikuModels = models.filter(m => m.modelId.includes('haiku')).sort((a, b) => b.modelId.localeCompare(a.modelId));
      const opusModels = models.filter(m => m.modelId.includes('opus')).sort((a, b) => b.modelId.localeCompare(a.modelId));

      const latestSonnet = sonnetModels[0];
      const latestHaiku = haikuModels[0];
      const latestOpus = opusModels[0];

      console.log(`🎯 Model recommendations for ${opts.useCase} use case:\n`);

      switch (opts.useCase) {
        case 'coding':
          if (latestSonnet) {
            console.log(`🥇 RECOMMENDED: ${latestSonnet.modelId}`);
            console.log('   └─ Best for: Code generation, debugging, refactoring, test writing');
            console.log('   └─ Balance: High capability + reasonable cost');
          }
          if (latestHaiku) {
            console.log(`🥈 ALTERNATIVE: ${latestHaiku.modelId}`);
            console.log('   └─ Best for: Fast code reviews, simple fixes, bulk operations');
            console.log('   └─ Balance: Speed + cost efficiency');
          }
          break;
          
        case 'analysis':
          if (latestOpus) {
            console.log(`🥇 RECOMMENDED: ${latestOpus.modelId}`);
            console.log('   └─ Best for: Deep code analysis, architecture reviews, complex reasoning');
          } else if (latestSonnet) {
            console.log(`🥇 RECOMMENDED: ${latestSonnet.modelId}`);
            console.log('   └─ Best for: Code analysis, pattern detection, technical reviews');
          }
          break;
          
        case 'creative':
          if (latestOpus) {
            console.log(`🥇 RECOMMENDED: ${latestOpus.modelId}`);
            console.log('   └─ Best for: Creative problem solving, documentation writing');
          } else if (latestSonnet) {
            console.log(`🥇 RECOMMENDED: ${latestSonnet.modelId}`);
            console.log('   └─ Best for: Technical documentation, API design');
          }
          break;
          
        default:
          if (latestSonnet) {
            console.log(`🥇 RECOMMENDED: ${latestSonnet.modelId}`);
            console.log('   └─ Best general-purpose model for most enterprise use cases');
          }
          break;
      }

      console.log('\n💡 To use this model:');
      const recommended = latestSonnet || latestHaiku || latestOpus;
      if (recommended) {
        console.log(`export BEDROCK_MODEL_ID="${recommended.modelId}"`);
        console.log('bcce doctor  # Verify configuration');
      }

      console.log('\n🚀 Pro tip: Use Inference Profiles for automatic model updates:');
      console.log('export BEDROCK_MODEL_ID="arn:aws:bedrock:us-east-1:ACCOUNT:inference-profile/claude-latest"');

    } catch (error: any) {
      console.error('❌ Failed to get recommendations:', error.message);
      process.exit(1);
    }
  });

modelsCmd
  .command('set')
  .description('Set BEDROCK_MODEL_ID environment variable')
  .argument('<model-id>', 'Model ID or inference profile ARN')
  .option('--shell <shell>', 'Shell to configure: bash, zsh, fish', 'bash')
  .option('--global', 'Set globally in shell profile')
  .action(async (modelId, opts) => {
    if (opts.global) {
      const profileFile = opts.shell === 'zsh' ? '~/.zshrc' : 
                         opts.shell === 'fish' ? '~/.config/fish/config.fish' :
                         '~/.bashrc';
      
      console.log(`To set globally, add this line to ${profileFile}:`);
      console.log(`export BEDROCK_MODEL_ID="${modelId}"`);
    } else {
      console.log('Set for current session:');
      console.log(`export BEDROCK_MODEL_ID="${modelId}"`);
    }
    
    console.log('\nVerify configuration:');
    console.log('bcce doctor');
  });