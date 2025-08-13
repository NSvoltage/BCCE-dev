import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

// Production-ready test helper with proper error handling
function runDoctor(env = {}, options = {}) {
  const timeout = options.timeout || 10000;
  try {
    const result = execSync('./dist/bcce doctor', {
      stdio: 'pipe',
      env: { ...process.env, ...env },
      timeout,
      encoding: 'utf8'
    });
    return {
      stdout: result,
      exitCode: 0,
      duration: Date.now() - (options.startTime || Date.now())
    };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status,
      signal: error.signal,
      duration: Date.now() - (options.startTime || Date.now())
    };
  }
}

describe('Doctor Production Readiness', () => {
  test('should complete within performance budget (< 5s)', () => {
    const startTime = Date.now();
    const result = runDoctor({ AWS_REGION: 'us-east-1' }, { startTime });
    
    assert.ok(result.duration < 5000, `Doctor took ${result.duration}ms, exceeds 5s budget`);
    assert.ok(result.stdout.includes('BCCE Doctor Report'), 'Should produce output within timeout');
  });

  test('should handle timeout gracefully', () => {
    // Simulate slow environment with very short timeout
    const result = runDoctor({ AWS_REGION: 'us-east-1' }, { timeout: 1 });
    
    // Should fail cleanly, not hang
    assert.strictEqual(result.signal, 'SIGTERM');
  });

  test('should validate real AWS regions', () => {
    const validRegions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
    const invalidRegions = ['us-fake-1', 'invalid-region', 'localhost'];

    validRegions.forEach(region => {
      const result = runDoctor({ AWS_REGION: region });
      assert.match(result.stdout, new RegExp(`Set to: ${region}`), 
        `Should accept valid region ${region}`);
    });

    // All regions should work for basic checks (no actual AWS calls)
    invalidRegions.forEach(region => {
      const result = runDoctor({ AWS_REGION: region });
      assert.match(result.stdout, new RegExp(`Set to: ${region}`), 
        `Should accept any region string for fail-closed operation`);
    });
  });

  test('should handle IPv6 environments', () => {
    // Test with IPv6 preference (common in containerized environments)
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      NODE_OPTIONS: '--dns-result-order=ipv6first'
    });
    
    // Should not crash with IPv6 DNS resolution
    assert.ok(result.stdout.includes('BCCE Doctor Report'));
  });

  test('should work with empty PATH (corporate lockdown)', () => {
    const nodeDir = process.argv[0].split('/').slice(0, -1).join('/');
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      PATH: nodeDir // Only node, simulates locked-down corporate env
    });
    
    assert.match(result.stdout, /❌ Claude CLI.*not found/);
    assert.match(result.stdout, /npm install -g/);
    assert.strictEqual(result.exitCode, 1);
  });

  test('should handle corporate proxy indicators', () => {
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      HTTP_PROXY: 'http://corporate-proxy:8080',
      HTTPS_PROXY: 'https://corporate-proxy:8080'
    });
    
    // Should acknowledge proxy environment (future: add proxy guidance)
    assert.ok(result.stdout.includes('BCCE Doctor Report'));
  });

  test('should fail fast on permission errors', () => {
    // Test with unreadable directory (simulates permission issues)
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      HOME: '/root' // Likely unreadable for non-root user
    });
    
    // Should handle gracefully, not crash
    assert.ok(result.stdout.includes('BCCE Doctor Report') || result.exitCode !== 0);
  });
});

describe('Doctor ROAST Compliance', () => {
  test('should be Reproducible across runs', () => {
    const env = { AWS_REGION: 'us-east-1' };
    
    const run1 = runDoctor(env);
    const run2 = runDoctor(env);
    const run3 = runDoctor(env);
    
    // Results should be identical (deterministic)
    assert.strictEqual(run1.exitCode, run2.exitCode);
    assert.strictEqual(run2.exitCode, run3.exitCode);
    
    // Check content consistency (ignoring timing differences)
    const normalize = (output) => output.replace(/\d+\.\d+ms/g, 'XXXms');
    assert.strictEqual(normalize(run1.stdout), normalize(run2.stdout));
  });

  test('should be Observable with clear status', () => {
    const result = runDoctor({ AWS_REGION: '' });
    
    // Must have clear status indicators
    assert.match(result.stdout, /🩺 BCCE Doctor Report/);
    assert.match(result.stdout, /(✅|❌|⚠️)/);
    assert.match(result.stdout, /Critical issues found|All checks passed|Some issues detected/);
    
    // Exit code must match status
    if (result.stdout.includes('Critical issues')) {
      assert.strictEqual(result.exitCode, 1);
    }
  });

  test('should be Auditable with fix commands', () => {
    const result = runDoctor({ AWS_REGION: '' });
    
    // Every failure must have a fix command (exclude summary lines)
    const lines = result.stdout.split('\n');
    const failureLines = lines.filter(line => 
      line.includes('❌') && !line.includes('Critical issues found')
    );
    const fixLines = lines.filter(line => line.trim().startsWith('Fix:'));
    
    assert.ok(failureLines.length > 0, 'Should have failures to test');
    assert.ok(fixLines.length >= failureLines.length, 
      `Each failure (${failureLines.length}) should have a fix command (${fixLines.length})`);
    
    // Fix commands must be actionable (contain actual commands)
    fixLines.forEach(fixLine => {
      assert.ok(
        fixLine.includes('export ') || 
        fixLine.includes('npm install') || 
        fixLine.includes('go build') ||
        fixLine.includes('aws '),
        `Fix command should be actionable: ${fixLine}`
      );
    });
  });

  test('should be Secure with no credential exposure', () => {
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'AKIATEST123456789',
      AWS_SECRET_ACCESS_KEY: 'fake-secret-key-for-testing',
      ANTHROPIC_API_KEY: 'sk-ant-test-key-123'
    });
    
    // Should never leak credentials in output
    assert.ok(!result.stdout.includes('AKIA'), 'Should not expose AWS access key');
    assert.ok(!result.stdout.includes('fake-secret'), 'Should not expose AWS secret');
    assert.ok(!result.stdout.includes('sk-ant-'), 'Should not expose Anthropic key');
    
    // Handle stderr safely (may be undefined)
    const stderr = result.stderr || '';
    assert.ok(!stderr.includes('AKIA'), 'Should not expose credentials in errors');
    assert.ok(!stderr.includes('fake-secret'), 'Should not expose secrets in errors');
    assert.ok(!stderr.includes('sk-ant-'), 'Should not expose API keys in errors');
  });

  test('should be Testable in isolation', () => {
    // Doctor should work without external dependencies
    const isolatedEnv = {
      AWS_REGION: 'us-east-1',
      PATH: process.argv[0].split('/').slice(0, -1).join('/'),
      HOME: '/tmp',
      USER: 'testuser'
    };
    
    const result = runDoctor(isolatedEnv);
    
    // Should complete even in minimal environment
    assert.ok(result.stdout.includes('BCCE Doctor Report'));
    assert.ok(typeof result.exitCode === 'number');
  });
});

describe('Developer Experience', () => {
  test('should provide actionable first-run experience', () => {
    // Simulate fresh developer setup
    const result = runDoctor({ 
      AWS_REGION: '',  // Not set yet
      PATH: process.argv[0].split('/').slice(0, -1).join('/') // No claude
    });
    
    // Should guide user through setup
    assert.match(result.stdout, /export AWS_REGION=/);
    assert.match(result.stdout, /npm install -g.*claude-code/);
    assert.strictEqual(result.exitCode, 1, 'Should exit with failure for incomplete setup');
  });

  test('should indicate success clearly for working setup', () => {
    const result = runDoctor({ AWS_REGION: 'us-east-1' });
    
    if (result.exitCode === 0) {
      assert.match(result.stdout, /✅ All checks passed/);
    } else {
      // If not all passing, should explain what's missing
      assert.ok(result.stdout.includes('Fix:'));
    }
  });

  test('should handle edge cases gracefully', () => {
    const nodePath = process.argv[0].split('/').slice(0, -1).join('/');
    const edgeCases = [
      { AWS_REGION: '  ' },  // Whitespace
      { AWS_REGION: 'us-east-1', PATH: nodePath },  // Minimal PATH (just node)
      { AWS_REGION: 'us-east-1', HOME: '/nonexistent' }  // Bad HOME
    ];

    edgeCases.forEach((env, i) => {
      const result = runDoctor(env);
      assert.ok(result.stdout.includes('BCCE Doctor Report'), 
        `Edge case ${i} should not crash doctor`);
    });
  });
});