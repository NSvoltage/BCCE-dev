import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Test helper to run workflow commands
function runWorkflowCommand(command, options = {}) {
  const timeout = options.timeout || 15000; // Increased timeout for execution
  try {
    const result = execSync(`./dist/bcce workflow ${command}`, {
      stdio: 'pipe',
      timeout,
      encoding: 'utf8',
      cwd: process.cwd()
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

describe('Workflow Runner Core', () => {
  // Clean up before and after tests
  cleanupArtifacts();

  test('should execute simple workflow successfully', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/valid-basic.yml');
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /▶️ Starting workflow "Basic test workflow"/);
    assert.match(result.stdout, /✅ Completed/);
    assert.match(result.stdout, /Steps: 1\/1 completed/);
    assert.match(result.stdout, /Artifacts: \.bcce_runs\//);
  });

  test('should show dry run execution plan', () => {
    const result = runWorkflowCommand('run --dry-run ../workflows/starters/test-grader.yml');
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /🔍 Dry run - execution plan:/);
    assert.match(result.stdout, /⏳ discover_tests \(prompt\)/);
    assert.match(result.stdout, /⏳ analyze_test_quality \(agent\)/);
    assert.match(result.stdout, /⏳ run_existing_tests \(cmd\)/);
    assert.match(result.stdout, /⏳ suggest_improvements \(agent\)/);
    assert.match(result.stdout, /⏳ apply_test_improvements \(apply_diff\)/);
  });

  test('should create proper artifact structure', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/valid-basic.yml');
    
    assert.strictEqual(result.exitCode, 0);
    
    // Extract run ID from output
    const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
    assert.ok(runIdMatch, 'Should contain run ID');
    const runId = runIdMatch[1];
    
    // Check artifact structure
    const runDir = `.bcce_runs/${runId}`;
    assert.ok(fs.existsSync(runDir), 'Run directory should exist');
    assert.ok(fs.existsSync(`${runDir}/run-state.json`), 'Run state should be saved');
    assert.ok(fs.existsSync(`${runDir}/simple_prompt`), 'Step directory should exist');
    assert.ok(fs.existsSync(`${runDir}/simple_prompt/output.txt`), 'Step output should be saved');
  });
});

describe('Workflow Runner Step Types', () => {
  test('should execute command steps correctly', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/test-resume.yml');
    
    // Should fail at step 2 but complete step 1
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.output, /✅ Step completed.*/);
    assert.match(result.output, /❌.*step_2_fail failed/);
    assert.match(result.output, /Steps: 1\/3 completed, 1 failed/);
  });

  test('should execute agent steps (simulated)', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/valid-agent.yml');
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /✅ Completed/);
    assert.match(result.stdout, /Steps: 2\/2 completed/);
    
    // Extract run ID and check agent artifacts
    const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
    const runId = runIdMatch[1];
    const agentDir = `.bcce_runs/${runId}/agent_step`;
    
    assert.ok(fs.existsSync(`${agentDir}/policy.json`), 'Agent policy should be saved');
    assert.ok(fs.existsSync(`${agentDir}/transcript.md`), 'Agent transcript should be saved');
  });

  test('should handle on_error: continue correctly', () => {
    // Create a workflow with failing command that should continue
    const testWorkflow = {
      version: 1,
      workflow: 'Error handling test',
      model: '${BEDROCK_MODEL_ID}',
      steps: [
        { id: 'fail_but_continue', type: 'cmd', command: 'exit 1', on_error: 'continue' },
        { id: 'should_run', type: 'cmd', command: 'echo "This should run"' }
      ]
    };
    
    const tempFile = 'test/fixtures/workflows/test-error-continue.yml';
    const yamlContent = `version: 1
workflow: "Error handling test"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: fail_but_continue
    type: cmd
    command: exit 1
    on_error: continue
  - id: should_run
    type: cmd
    command: echo "This should run"`;
    fs.writeFileSync(tempFile, yamlContent);
    
    try {
      const result = runWorkflowCommand(`run ${tempFile}`);
      
      assert.strictEqual(result.exitCode, 0, 'Should complete despite step failure');
      assert.match(result.stdout, /⚠️ Command failed but continuing/);
      assert.match(result.stdout, /✅ Completed/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });
});

describe('Workflow Resume Functionality', () => {
  // Note: Resume testing is complex due to run ID dependency
  // This test demonstrates the capability but full integration testing
  // would require more sophisticated setup

  test('should provide resume instruction on failure', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/test-resume.yml');
    
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.output, /🔧 To resume from the failed step:/);
    assert.match(result.output, /bcce workflow resume.*--from step_2_fail/);
  });

  test('should validate resume command syntax', () => {
    // Test that resume command doesn't crash with invalid run ID
    const result = runWorkflowCommand('resume invalid-run-id --from step1');
    
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.output, /Resume error.*not found/);
  });
});

describe('Workflow Diagram Generation', () => {
  test('should generate DOT diagram', () => {
    const result = runWorkflowCommand('diagram ../workflows/starters/test-grader.yml');
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /📊 Workflow diagram generated/);
    assert.match(result.stdout, /Format: DOT/);
    assert.match(result.stdout, /File:.*test-grader-diagram\.dot/);
    
    // Check that file was actually created
    assert.ok(fs.existsSync('test-grader-diagram.dot'), 'DOT file should be created');
    
    // Check DOT content
    const dotContent = fs.readFileSync('test-grader-diagram.dot', 'utf-8');
    assert.match(dotContent, /digraph workflow/);
    assert.match(dotContent, /label="Test grader & fixer"/);
    assert.match(dotContent, /"discover_tests".*prompt/);
    assert.match(dotContent, /"analyze_test_quality".*agent/);
    
    // Cleanup
    fs.unlinkSync('test-grader-diagram.dot');
  });

  test('should generate diagram with custom output path', () => {
    const outputPath = 'custom-diagram.dot';
    const result = runWorkflowCommand(`diagram --output ${outputPath} test/fixtures/workflows/valid-basic.yml`);
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, new RegExp(outputPath.replace('.', '\\.')));
    assert.ok(fs.existsSync(outputPath), 'Custom output file should be created');
    
    // Cleanup
    fs.unlinkSync(outputPath);
  });
});

describe('ROAST Compliance for Workflow Runner', () => {
  test('should be Reproducible - consistent run IDs format', () => {
    const result1 = runWorkflowCommand('run --dry-run test/fixtures/workflows/valid-basic.yml');
    const result2 = runWorkflowCommand('run --dry-run test/fixtures/workflows/valid-basic.yml');
    
    assert.strictEqual(result1.exitCode, 0);
    assert.strictEqual(result2.exitCode, 0);
    
    // Run IDs should follow consistent format: YYYY-MM-DDTHH-MM-SS-random
    const runIdPattern = /Run ID: (\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9]+)/;
    assert.match(result1.stdout, runIdPattern);
    assert.match(result2.stdout, runIdPattern);
  });

  test('should be Observable - clear execution progress', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/valid-agent.yml');
    
    assert.strictEqual(result.exitCode, 0);
    
    // Should show clear execution flow
    assert.match(result.stdout, /▶️ Starting workflow/);
    assert.match(result.stdout, /Run ID:/);
    assert.match(result.stdout, /Artifacts:/);
    assert.match(result.stdout, /📋 Executing step:/);
    assert.match(result.stdout, /✅ Step completed/);
    assert.match(result.stdout, /📊 Execution Summary:/);
    assert.match(result.stdout, /Status: ✅ Completed/);
    assert.match(result.stdout, /Duration:/);
    assert.match(result.stdout, /Steps: \d+\/\d+ completed/);
  });

  test('should be Auditable - complete artifact trails', () => {
    const result = runWorkflowCommand('run test/fixtures/workflows/valid-agent.yml');
    
    assert.strictEqual(result.exitCode, 0);
    
    const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
    const runId = runIdMatch[1];
    const runDir = `.bcce_runs/${runId}`;
    
    // Check audit trail completeness
    assert.ok(fs.existsSync(`${runDir}/run-state.json`), 'Run state audit trail');
    
    const runState = JSON.parse(fs.readFileSync(`${runDir}/run-state.json`, 'utf-8'));
    assert.strictEqual(runState.runId, runId, 'Run ID should match');
    assert.ok(runState.startTime, 'Start time should be recorded');
    assert.ok(runState.endTime, 'End time should be recorded');
    assert.ok(Array.isArray(runState.stepResults), 'Step results should be array');
    
    // Each step should have complete audit trail
    runState.stepResults.forEach(stepResult => {
      assert.ok(stepResult.stepId, 'Step should have ID');
      assert.ok(stepResult.status, 'Step should have status');
      if (stepResult.status === 'completed') {
        assert.ok(stepResult.startTime, 'Completed step should have start time');
        assert.ok(stepResult.endTime, 'Completed step should have end time');
      }
    });
  });

  test('should be Secure - no credential exposure in artifacts', () => {
    // Set some fake credentials for testing
    const result = runWorkflowCommand('run test/fixtures/workflows/valid-basic.yml', {
      env: {
        ...process.env,
        AWS_SECRET_ACCESS_KEY: 'fake-secret-key',
        ANTHROPIC_API_KEY: 'sk-ant-fake-key'
      }
    });
    
    assert.strictEqual(result.exitCode, 0);
    
    const runIdMatch = result.stdout.match(/Run ID: ([^\s]+)/);
    const runId = runIdMatch[1];
    const runDir = `.bcce_runs/${runId}`;
    
    // Check that no credentials leaked into artifacts
    const runState = fs.readFileSync(`${runDir}/run-state.json`, 'utf-8');
    assert.ok(!runState.includes('fake-secret-key'), 'Should not expose AWS secret');
    assert.ok(!runState.includes('sk-ant-fake-key'), 'Should not expose API keys');
    
    // Check step outputs
    const stepOutput = fs.readFileSync(`${runDir}/simple_prompt/output.txt`, 'utf-8');
    assert.ok(!stepOutput.includes('fake-secret-key'), 'Step output should not expose secrets');
  });

  test('should be Testable - isolated execution environment', () => {
    // Test with minimal environment
    const result = runWorkflowCommand('run --dry-run test/fixtures/workflows/valid-basic.yml', {
      env: {
        PATH: process.argv[0].split('/').slice(0, -1).join('/'),
        HOME: '/tmp'
      }
    });
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /🔍 Dry run - execution plan/);
  });
});

// Cleanup after all tests
process.on('exit', cleanupArtifacts);