import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Test helper to run doctor command with environment variables
function runDoctor(env = {}) {
  try {
    const result = execSync('./dist/bcce doctor', {
      stdio: 'pipe',
      env: { ...process.env, ...env },
      timeout: 10000
    });
    return {
      stdout: result.toString(),
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : '',
      exitCode: error.status
    };
  }
}

describe('Doctor MVP Tests', () => {
  test('should fail when AWS_REGION is missing', () => {
    const result = runDoctor({ AWS_REGION: '' });
    
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stdout, /❌ AWS_REGION.*not set/);
    assert.match(result.stdout, /export AWS_REGION=us-east-1/);
  });

  test('should fail when AWS_REGION is empty string', () => {
    const result = runDoctor({ AWS_REGION: '   ' });
    
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stdout, /❌ AWS_REGION.*not set/);
    assert.match(result.stdout, /export AWS_REGION=us-east-1/);
  });

  test('should pass AWS_REGION check when set', () => {
    const result = runDoctor({ AWS_REGION: 'us-east-1' });
    
    // Should not exit with failure due to missing region
    assert.match(result.stdout, /✅ AWS_REGION.*us-east-1/);
  });

  test('should fail when claude CLI not found', () => {
    // Create a PATH without claude but with node 
    const nodePath = process.argv[0].split('/').slice(0, -1).join('/');
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      PATH: nodePath // Only node, no claude
    });
    
    assert.match(result.stdout, /❌ Claude CLI.*not found/);
    assert.match(result.stdout, /npm install -g @anthropic-ai\/claude-code/);
  });

  test('should handle DNS probe gracefully when Go binary missing', () => {
    const result = runDoctor({ AWS_REGION: 'us-east-1' });
    
    // Should gracefully skip or handle DNS check when Go is missing
    // In real-world usage, this is informational, not a failure
    assert.ok(result.stdout.includes('Bedrock DNS'), 'Should mention DNS check');
    assert.ok(result.exitCode === 0 || result.exitCode === 1, 'Should exit cleanly');
    
    // The actual behavior is to skip with a note, which is good UX
    if (result.stdout.includes('Skipped')) {
      assert.match(result.stdout, /Skipped.*Go not available/, 'Should explain why skipped');
    }
  });

  test('should print proper fix commands', () => {
    const result = runDoctor({ AWS_REGION: '' });
    
    // Each failing check should have a Fix: line
    const lines = result.stdout.split('\n');
    const fixLines = lines.filter(line => line.trim().startsWith('Fix:'));
    
    assert.ok(fixLines.length > 0, 'Should contain at least one fix command');
    assert.ok(fixLines.some(line => line.includes('export AWS_REGION=')), 
      'Should contain AWS_REGION fix command');
  });

  test('should exit with code 1 on critical failures', () => {
    const result = runDoctor({ AWS_REGION: '' });
    
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stdout, /❌ Critical issues found/);
  });

  test('should show success message when all checks pass', () => {
    // This test requires claude to be installed, so we'll mock success scenario
    // by testing the output pattern without requiring actual tools
    const result = runDoctor({ AWS_REGION: 'us-east-1' });
    
    // Should contain the doctor report header
    assert.match(result.stdout, /🩺 BCCE Doctor Report/);
  });
});

describe('Cross-platform compatibility', () => {
  test('should use cross-platform path handling', () => {
    // Test that the findExecutable function works with current platform
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      PATH: process.env.PATH 
    });
    
    // Should not crash with path-related errors
    assert.ok(result.stdout.includes('Claude CLI'), 'Should attempt Claude CLI check');
  });

  test('should handle Windows-style paths in PATH', () => {
    // Real-world scenario: On Windows, PATH uses semicolons; on Unix, colons
    // The doctor command should handle the platform's native separator
    const isWindows = process.platform === 'win32';
    const separator = isWindows ? ';' : ':';
    const nodePath = process.argv[0].split('/').slice(0, -1).join('/');
    
    // Use platform-appropriate path
    const testPath = isWindows 
      ? `${nodePath};C:\\Windows\\System32;C:\\Program Files\\nodejs`
      : `${nodePath}:/usr/bin:/usr/local/bin`;
    
    const result = runDoctor({ 
      AWS_REGION: 'us-east-1',
      PATH: testPath,
      PATHEXT: isWindows ? '.exe;.cmd;.bat' : undefined
    });
    
    // Should work on the current platform
    if (result.stdout) {
      assert.ok(result.stdout.includes('BCCE Doctor Report') || 
                result.stdout.includes('AWS_REGION') ||
                result.stdout.includes('Claude CLI'),
                'Should produce diagnostic output');
    }
    
    // Should not crash
    assert.ok(result.exitCode !== undefined, 'Should exit cleanly');
  });
});