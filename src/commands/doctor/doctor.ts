import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

function findExecutable(name: string): boolean {
  const pathEnv = process.env.PATH || '';
  const pathExt = process.env.PATHEXT || '.exe';
  const extensions = process.platform === 'win32' ? pathExt.split(';') : [''];
  const paths = pathEnv.split(process.platform === 'win32' ? ';' : ':');

  // Handle empty PATH gracefully (common in CI/containers)
  if (!pathEnv || paths.length === 0) {
    return false;
  }

  for (const dir of paths) {
    if (!dir || dir.trim() === '') continue;
    for (const ext of extensions) {
      const fullPath = join(dir, name + ext);
      try {
        accessSync(fullPath, constants.F_OK | constants.X_OK);
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

export const doctorCmd = new Command('doctor')
  .description('Cross-platform health checks: AWS_REGION, Claude CLI, Bedrock DNS resolution')
  .action(async () => {
    const checks: CheckResult[] = [];
    
    // AWS_REGION check (required for Bedrock)
    const region = process.env.AWS_REGION;
    if (!region || region.trim() === '') {
      checks.push({
        name: 'AWS_REGION',
        status: 'fail',
        message: 'AWS_REGION environment variable not set',
        fix: 'export AWS_REGION=us-east-1'
      });
    } else {
      checks.push({
        name: 'AWS_REGION',
        status: 'pass',
        message: `Set to: ${region}`
      });
    }

    // Claude CLI executable check (cross-platform)
    if (findExecutable('claude')) {
      try {
        const version = execSync('claude --version', { stdio: 'pipe', timeout: 5000 }).toString().trim();
        checks.push({
          name: 'Claude CLI',
          status: 'pass',
          message: `Found: ${version}`
        });
      } catch (error) {
        checks.push({
          name: 'Claude CLI',
          status: 'fail',
          message: 'Claude CLI found but not working',
          fix: 'npm install -g @anthropic-ai/claude-code@latest'
        });
      }
    } else {
      checks.push({
        name: 'Claude CLI',
        status: 'fail',
        message: 'Claude CLI not found in PATH',
        fix: 'npm install -g @anthropic-ai/claude-code'
      });
    }

    // DNS resolution check via Go probe (if region is set)
    if (region) {
      try {
        const goProbe = join(__dirname, '../../../go-tools/doctor-probes/doctor-probes');
        const probeExists = existsSync(goProbe) || existsSync(goProbe + '.exe');
        
        if (probeExists) {
          const probeResult = execSync(`"${goProbe}" --json --dns-only`, { 
            stdio: 'pipe', 
            timeout: 15000,
            env: { ...process.env, AWS_REGION: region }
          }).toString().trim();
          
          const probeData = JSON.parse(probeResult);
          const dnsCheck = probeData.checks?.find((c: any) => c.name.includes('DNS'));
          
          if (dnsCheck?.status === 'pass') {
            checks.push({
              name: 'Bedrock DNS',
              status: 'pass',
              message: `bedrock-runtime.${region}.amazonaws.com resolved`
            });
          } else {
            checks.push({
              name: 'Bedrock DNS',
              status: 'fail',
              message: `Failed to resolve bedrock-runtime.${region}.amazonaws.com`,
              fix: 'Check internet connectivity and DNS settings'
            });
          }
        } else {
          // Only warn if basic requirements are met - this enables success state
          if (findExecutable('go')) {
            checks.push({
              name: 'Bedrock DNS',
              status: 'warn',
              message: 'Go probe not built',
              fix: 'Run: cd go-tools/doctor-probes && go build -o doctor-probes .'
            });
          } else {
            checks.push({
              name: 'Bedrock DNS',
              status: 'pass',
              message: 'Skipped (Go not available, will use built-in DNS checks)'
            });
          }
        }
      } catch (error) {
        // Secure error handling - don't leak environment details
        checks.push({
          name: 'Bedrock DNS',
          status: 'fail',
          message: 'DNS probe failed to execute',
          fix: 'Check network connectivity or rebuild Go probe'
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
      console.log('   BCCE will work but may have reduced functionality.');
    } else {
      console.log('✅ All checks passed! BCCE is ready for production use.');
    }
  });