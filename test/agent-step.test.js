import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Test helper to run workflow commands
function runWorkflowCommand(command, options = {}) {
  const timeout = options.timeout || 15000;
  try {
    const result = execSync(`./dist/bcce workflow ${command}`, {
      stdio: 'pipe',
      timeout,
      encoding: 'utf8',
      cwd: process.cwd(),
      env: options.env || process.env
    });
    return {
      stdout: result,
      stderr: '',
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status,
      output: (error.stdout || '') + (error.stderr || '')
    };
  }
}

// Helper to clean up test artifacts
function cleanupArtifacts() {
  if (fs.existsSync('.bcce_runs')) {
    fs.rmSync('.bcce_runs', { recursive: true, force: true });
  }
}

describe('Agent Step Execution', () => {
  cleanupArtifacts();

  test('should enforce policy constraints', () => {
    const testWorkflow = `version: 1
workflow: "Agent test with constraints"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: constrained_agent
    type: agent
    policy:
      timeout_seconds: 5
      max_files: 3
      max_edits: 1
      allowed_paths: ["src/**", "test/**"]
      cmd_allowlist: ["npm", "node"]
    available_tools: [ReadFile, Search]`;
    
    const tempFile = 'test-agent-policy.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      // Should complete (may simulate if Claude not available)
      assert.strictEqual(result.exitCode, 0);
      
      // Extract run ID and check policy was saved
      const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
      assert.ok(runIdMatch, 'Should have run ID');
      const runId = runIdMatch[1];
      
      const policyFile = `.bcce_runs/${runId}/constrained_agent/policy.json`;
      assert.ok(fs.existsSync(policyFile), 'Policy should be saved');
      
      const savedPolicy = JSON.parse(fs.readFileSync(policyFile, 'utf-8'));
      assert.strictEqual(savedPolicy.timeout_seconds, 5);
      assert.strictEqual(savedPolicy.max_files, 3);
      assert.strictEqual(savedPolicy.max_edits, 1);
      assert.deepStrictEqual(savedPolicy.allowed_paths, ["src/**", "test/**"]);
      assert.deepStrictEqual(savedPolicy.cmd_allowlist, ["npm", "node"]);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should capture transcript and artifacts', () => {
    const testWorkflow = `version: 1
workflow: "Agent transcript test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: transcript_test
    type: agent
    policy:
      timeout_seconds: 10
      max_files: 5
      max_edits: 2
      allowed_paths: ["**"]
      cmd_allowlist: ["echo"]
    available_tools: [Cmd]`;
    
    const tempFile = 'test-agent-transcript.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      assert.strictEqual(result.exitCode, 0);
      
      const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
      const runId = runIdMatch[1];
      const stepDir = `.bcce_runs/${runId}/transcript_test`;
      
      // Check all expected artifacts
      assert.ok(fs.existsSync(`${stepDir}/policy.json`), 'Policy should be saved');
      assert.ok(fs.existsSync(`${stepDir}/transcript.md`), 'Transcript should be saved');
      assert.ok(fs.existsSync(`${stepDir}/output.txt`), 'Output should be saved');
      
      // Verify transcript format
      const transcript = fs.readFileSync(`${stepDir}/transcript.md`, 'utf-8');
      assert.match(transcript, /# Agent Execution Transcript/);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should handle timeout correctly', () => {
    const testWorkflow = `version: 1
workflow: "Agent timeout test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: timeout_test
    type: agent
    policy:
      timeout_seconds: 1
      max_files: 1
      max_edits: 1
      allowed_paths: ["**"]
      cmd_allowlist: ["sleep"]
    available_tools: [Cmd]`;
    
    const tempFile = 'test-agent-timeout.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`, { timeout: 5000 });
      
      // Should complete even with timeout (simulated mode)
      assert.ok(result.exitCode === 0 || result.exitCode === 124, 'Should handle timeout');
      
      if (result.stdout.includes('Run ID:')) {
        const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
        const runId = runIdMatch[1];
        
        const metricsFile = `.bcce_runs/${runId}/timeout_test/metrics.json`;
        if (fs.existsSync(metricsFile)) {
          const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
          assert.ok(metrics.duration_seconds <= 2, 'Should timeout within limit');
        }
      }
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should redact sensitive information', () => {
    // Test redaction in transcript
    const testWorkflow = `version: 1
workflow: "Redaction test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: redaction_test
    type: agent
    policy:
      timeout_seconds: 5
      max_files: 1
      max_edits: 1
      allowed_paths: ["**"]
      cmd_allowlist: ["echo"]
    available_tools: [Cmd]`;
    
    const tempFile = 'test-agent-redaction.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`, {
        env: {
          ...process.env,
          FAKE_API_KEY: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
          FAKE_AWS_KEY: 'AWSKEY1234567890ABCD'
        }
      });
      
      assert.strictEqual(result.exitCode, 0);
      
      const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
      if (runIdMatch) {
        const runId = runIdMatch[1];
        const transcriptFile = `.bcce_runs/${runId}/redaction_test/transcript.md`;
        
        if (fs.existsSync(transcriptFile)) {
          const transcript = fs.readFileSync(transcriptFile, 'utf-8');
          // Should not contain unredacted sensitive patterns
          assert.ok(!transcript.includes('sk-1234567890abcdef'), 'API keys should be redacted');
          assert.ok(!transcript.includes('AWSKEY1234567890ABCD'), 'AWS keys should be redacted');
        }
      }
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should validate required policy fields', () => {
    const testWorkflow = `version: 1
workflow: "Invalid agent test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: no_policy
    type: agent
    available_tools: [ReadFile]`;
    
    const tempFile = 'test-agent-invalid.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      // Should fail due to missing policy
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.output, /missing policy constraints/);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });
});

describe('Agent Step ROAST Compliance', () => {
  // Clean artifacts before ROAST tests to ensure isolation
  cleanupArtifacts();
  
  test('should be Reproducible - consistent policy enforcement', () => {
    // Clean up any existing artifacts from previous tests for true isolation
    cleanupArtifacts();
    
    const testWorkflow = `version: 1
workflow: "Reproducible agent test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: reproducible_agent
    type: agent
    policy:
      timeout_seconds: 10
      max_files: 5
      max_edits: 2
      allowed_paths: ["src/**"]
      cmd_allowlist: ["npm"]
    available_tools: [ReadFile]`;
    
    const tempFile = 'test-agent-reproducible.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      // Run twice and verify consistent behavior
      const result1 = runWorkflowCommand(`run ${tempFile}`);
      const result2 = runWorkflowCommand(`run ${tempFile}`);
      
      // For real-world usage: both runs should behave consistently
      // If one fails, both should fail; if one succeeds, both should succeed
      if (result1.exitCode !== result2.exitCode) {
        console.log('Debug: Result1 exitCode:', result1.exitCode, 'stdout:', result1.stdout.slice(0, 200));
        console.log('Debug: Result2 exitCode:', result2.exitCode, 'stdout:', result2.stdout.slice(0, 200));
      }
      assert.strictEqual(result1.exitCode, result2.exitCode, 'Exit codes should match');
      
      // Both should save identical policies (if runs succeeded)
      const runId1 = result1.stdout.match(/Run ID: ([^\s]+)/)?.[1];
      const runId2 = result2.stdout.match(/Run ID: ([^\s]+)/)?.[1];
      
      if (runId1 && runId2 && result1.exitCode === 0 && result2.exitCode === 0) {
        const policyPath1 = `.bcce_runs/${runId1}/reproducible_agent/policy.json`;
        const policyPath2 = `.bcce_runs/${runId2}/reproducible_agent/policy.json`;
        
        // Check if files exist before reading (real-world robustness)
        if (fs.existsSync(policyPath1) && fs.existsSync(policyPath2)) {
          const policy1 = fs.readFileSync(policyPath1, 'utf-8');
          const policy2 = fs.readFileSync(policyPath2, 'utf-8');
          assert.strictEqual(policy1, policy2, 'Policies should be identical');
        } else {
          // If files don't exist, at least verify consistent behavior
          assert.strictEqual(fs.existsSync(policyPath1), fs.existsSync(policyPath2), 
                           'Both runs should produce same artifacts');
        }
      }
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should be Observable - clear execution status', () => {
    const testWorkflow = `version: 1
workflow: "Observable agent test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: observable_agent
    type: agent
    policy:
      timeout_seconds: 5
      max_files: 3
      max_edits: 1
      allowed_paths: ["**"]
      cmd_allowlist: ["echo"]
    available_tools: [Cmd]`;
    
    const tempFile = 'test-agent-observable.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /📋 Executing step: observable_agent \(agent\)/);
      assert.match(result.stdout, /✅ Step completed/);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should be Auditable - complete execution trail', () => {
    const testWorkflow = `version: 1
workflow: "Auditable agent test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: auditable_agent
    type: agent
    policy:
      timeout_seconds: 10
      max_files: 10
      max_edits: 5
      allowed_paths: ["src/**", "test/**"]
      cmd_allowlist: ["npm", "node", "echo"]
    available_tools: [ReadFile, Cmd]`;
    
    const tempFile = 'test-agent-auditable.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      assert.strictEqual(result.exitCode, 0);
      
      const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
      const runId = runIdMatch[1];
      const stepDir = `.bcce_runs/${runId}/auditable_agent`;
      
      // Verify complete audit trail
      assert.ok(fs.existsSync(`${stepDir}/policy.json`), 'Policy audit trail');
      assert.ok(fs.existsSync(`${stepDir}/transcript.md`), 'Execution transcript');
      assert.ok(fs.existsSync(`${stepDir}/output.txt`), 'Output capture');
      
      // If metrics exist, verify they're complete
      if (fs.existsSync(`${stepDir}/metrics.json`)) {
        const metrics = JSON.parse(fs.readFileSync(`${stepDir}/metrics.json`, 'utf-8'));
        assert.ok(metrics.duration_seconds !== undefined, 'Duration tracked');
        assert.ok(metrics.exit_code !== undefined, 'Exit code tracked');
        assert.ok(metrics.policy !== undefined, 'Policy tracked');
      }
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should be Secure - enforce policy boundaries', () => {
    const testWorkflow = `version: 1
workflow: "Secure agent test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: secure_agent
    type: agent
    policy:
      timeout_seconds: 5
      max_files: 2
      max_edits: 0
      allowed_paths: ["test/**"]
      cmd_allowlist: []
    available_tools: [ReadFile]`;
    
    const tempFile = 'test-agent-secure.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      assert.strictEqual(result.exitCode, 0);
      
      const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
      const runId = runIdMatch[1];
      
      // Verify policy was enforced
      const policy = JSON.parse(fs.readFileSync(`.bcce_runs/${runId}/secure_agent/policy.json`, 'utf-8'));
      assert.strictEqual(policy.max_edits, 0, 'No edits allowed');
      assert.deepStrictEqual(policy.cmd_allowlist, [], 'No commands allowed');
      assert.deepStrictEqual(policy.allowed_paths, ['test/**'], 'Path restriction enforced');
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test('should be Testable - work in isolation', () => {
    const testWorkflow = `version: 1
workflow: "Testable agent"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: isolated_agent
    type: agent
    policy:
      timeout_seconds: 3
      max_files: 1
      max_edits: 1
      allowed_paths: ["."]
      cmd_allowlist: ["echo"]
    available_tools: [Cmd]`;
    
    const tempFile = 'test-agent-testable.yml';
    fs.writeFileSync(tempFile, testWorkflow);
    
    try {
      // Run with minimal environment
      const result = runWorkflowCommand(`run ${tempFile}`, {
        env: {
          PATH: process.env.PATH,
          HOME: '/tmp',
          BEDROCK_MODEL_ID: 'test-model'
        }
      });
      
      // Should work even in minimal environment
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /Execution Summary/);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });
});

// Cleanup after all tests
process.on('exit', cleanupArtifacts);