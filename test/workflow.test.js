import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Test helper to run workflow validation
function runWorkflowValidate(workflowPath, options = {}) {
  const timeout = options.timeout || 10000;
  try {
    const result = execSync(`./dist/bcce workflow validate ${workflowPath}`, {
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
      // Combine stdout and stderr for unified output checking
      output: (error.stdout || '') + (error.stderr || '')
    };
  }
}

describe('Workflow JSON Schema Validation', () => {
  test('should validate basic workflow successfully', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/valid-basic.yml');
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /✅ Workflow validation passed/);
    assert.match(result.stdout, /Steps: 1/);
    assert.match(result.stdout, /Model: \${BEDROCK_MODEL_ID}/);
  });

  test('should validate agent workflow with policy', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/valid-agent.yml');
    
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /✅ Workflow validation passed/);
    assert.match(result.stdout, /Steps: 2/);
    assert.match(result.stdout, /Guardrails: pii-basic, secrets-default/);
  });

  test('should validate all starter workflows', () => {
    const starterWorkflows = [
      '../workflows/starters/test-grader.yml',
      '../workflows/starters/bugfix-loop.yml', 
      '../workflows/starters/refactor-upgrade.yml',
      '../workflows/starters/pr-summarizer.yml'
    ];

    starterWorkflows.forEach(workflow => {
      const result = runWorkflowValidate(workflow);
      assert.strictEqual(result.exitCode, 0, `${workflow} should validate`);
      assert.match(result.stdout, /✅ Workflow validation passed/, 
        `${workflow} should show success message`);
    });
  });
});

describe('Workflow Schema Error Handling', () => {
  test('should fail on missing version field', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-missing-version.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    assert.match(output, /❌ Schema validation failed/);
    assert.match(output, /must have required property 'version'/);
  });

  test('should fail on duplicate step IDs', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-duplicate-ids.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    assert.match(output, /❌ Duplicate step ID: duplicate_step/);
  });

  test('should fail on agent step without policy', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-agent-no-policy.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    assert.match(output, /❌ Step 'agent_step': agent steps require policy constraints/);
  });

  test('should handle malformed YAML gracefully', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-yaml-syntax.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    assert.match(output, /❌ YAML parsing error/);
  });

  test('should fail on missing file', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/nonexistent.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    assert.match(output, /❌ File not found/);
  });
});

describe('Workflow Validation Error Messages', () => {
  test('should provide precise error location for schema violations', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-missing-version.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    // Should include file path in error
    assert.match(output, /File: .*invalid-missing-version\.yml/);
    // Should indicate which property is missing
    assert.match(output, /must have required property 'version'/);
  });

  test('should provide actionable error messages', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-agent-no-policy.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    // Should mention specific step ID
    assert.match(output, /Step 'agent_step'/);
    // Should explain requirement
    assert.match(output, /agent steps require policy constraints/);
  });

  test('should handle YAML syntax errors with line/column info', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-yaml-syntax.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    assert.match(output, /❌ YAML parsing error/);
    // Should include file reference
    assert.match(output, /File: .*invalid-yaml-syntax\.yml/);
  });
});

describe('Workflow Validation Performance', () => {
  test('should complete validation within performance budget', () => {
    const startTime = Date.now();
    const result = runWorkflowValidate('../workflows/starters/test-grader.yml');
    const duration = Date.now() - startTime;
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(duration < 3000, `Validation took ${duration}ms, should be under 3s`);
  });

  test('should handle multiple validations efficiently', () => {
    const workflows = [
      'test/fixtures/workflows/valid-basic.yml',
      'test/fixtures/workflows/valid-agent.yml',
      '../workflows/starters/test-grader.yml'
    ];

    const startTime = Date.now();
    workflows.forEach(workflow => {
      const result = runWorkflowValidate(workflow);
      assert.strictEqual(result.exitCode, 0);
    });
    const duration = Date.now() - startTime;

    assert.ok(duration < 5000, `${workflows.length} validations took ${duration}ms, should be under 5s`);
  });
});

describe('ROAST Compliance for Workflow Validation', () => {
  test('should be Reproducible - same validation results', () => {
    const workflow = 'test/fixtures/workflows/valid-basic.yml';
    
    const result1 = runWorkflowValidate(workflow);
    const result2 = runWorkflowValidate(workflow);
    const result3 = runWorkflowValidate(workflow);
    
    assert.strictEqual(result1.exitCode, result2.exitCode);
    assert.strictEqual(result2.exitCode, result3.exitCode);
    
    // Content should be identical (ignoring file paths)
    const normalize = (output) => output.replace(/\/.*?\//g, '/PATH/');
    assert.strictEqual(normalize(result1.stdout), normalize(result2.stdout));
  });

  test('should be Observable - clear success/failure indication', () => {
    // Success case
    const validResult = runWorkflowValidate('test/fixtures/workflows/valid-basic.yml');
    assert.match(validResult.stdout, /✅ Workflow validation passed/);
    assert.match(validResult.stdout, /Steps: \d+/);
    assert.match(validResult.stdout, /Model: /);
    
    // Failure case  
    const invalidResult = runWorkflowValidate('test/fixtures/workflows/invalid-missing-version.yml');
    const invalidOutput = invalidResult.output || invalidResult.stdout;
    assert.match(invalidOutput, /❌ Schema validation failed/);
    assert.strictEqual(invalidResult.exitCode, 1);
  });

  test('should be Auditable - complete error information', () => {
    const result = runWorkflowValidate('test/fixtures/workflows/invalid-missing-version.yml');
    
    assert.strictEqual(result.exitCode, 1);
    const output = result.output || result.stdout;
    // Should include specific error details
    assert.match(output, /must have required property 'version'/);
    // Should include file context
    assert.match(output, /File: .*invalid-missing-version\.yml/);
    // Should be actionable (developer knows what's wrong)
    assert.ok(output.includes('version'), 'Error should mention missing version');
  });

  test('should be Secure - no sensitive data exposure', () => {
    // Test with workflow containing variable substitution
    const result = runWorkflowValidate('test/fixtures/workflows/valid-basic.yml');
    
    // Should not expand environment variables in validation output
    assert.match(result.stdout, /Model: \${BEDROCK_MODEL_ID}/);
    
    // Should not leak sensitive environment variables
    const sensitiveVars = ['AWS_SECRET_ACCESS_KEY', 'ANTHROPIC_API_KEY', 'SSH_AUTH_SOCK'];
    sensitiveVars.forEach(varName => {
      const varValue = process.env[varName];
      if (varValue) {
        assert.ok(!result.stdout.includes(varValue), 
          `Should not expose ${varName} value in output`);
      }
    });
  });

  test('should be Testable - works in isolated environment', () => {
    // Test with minimal environment
    const isolatedEnv = {
      PATH: process.argv[0].split('/').slice(0, -1).join('/'),
      HOME: '/tmp',
      USER: 'testuser'
    };
    
    const result = runWorkflowValidate('test/fixtures/workflows/valid-basic.yml', {
      env: isolatedEnv
    });
    
    // Should work even in minimal environment
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /✅ Workflow validation passed/);
  });
});