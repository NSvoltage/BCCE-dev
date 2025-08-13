# BCCE Developer Guide

## Overview

This guide covers development, testing, and contribution to BCCE. For end-user documentation, see the main [README](../../README.md) and [QUICKSTART](../../QUICKSTART.md).

## Development Setup

### Prerequisites
- Node.js 20+ with npm
- Go 1.22+ (for utilities)
- Git
- AWS CLI (for testing)

### Initial Setup
```bash
# Clone repository
git clone https://github.com/your-org/bcce.git
cd bcce

# Install CLI dependencies
cd cli
npm install

# Build CLI
npm run build

# Run tests
npm test

# Build Go utilities (optional)
cd ../go-tools/doctor-probes
go build -o doctor-probes .
```

### Development Commands
```bash
# CLI Development
cd cli
npm run dev          # Watch mode for development
npm run build        # Production build
npm run test         # Run test suite
npm run lint         # Code linting
npm run type-check   # TypeScript checking

# Full Project
make setup           # Setup all dependencies
make build           # Build all components
make test            # Run all tests
make lint            # Lint all code
make clean           # Clean build artifacts
```

## Architecture

### Project Structure
```
bcce/
├── cli/                    # Main TypeScript CLI
│   ├── src/
│   │   ├── commands/      # CLI command implementations
│   │   ├── lib/           # Core libraries
│   │   └── index.ts       # CLI entry point
│   ├── test/              # Test files
│   └── dist/              # Built output
├── go-tools/              # Go utilities
│   ├── doctor-probes/     # Health check probes
│   └── credproc/          # Credential processing
├── workflows/             # Workflow definitions
│   ├── schemas/           # JSON schemas
│   ├── starters/          # Example workflows
│   └── examples/          # Community examples
├── docs/                  # Documentation
└── iac/                   # Infrastructure as Code
```

### Core Components

#### CLI Commands
- `doctor.ts` - Environment validation
- `workflow.ts` - Workflow management
- `models.ts` - Model discovery
- `init.ts` - Configuration setup
- `deploy.ts` - Infrastructure deployment

#### Core Libraries
- `workflow-runner.ts` - Workflow execution engine
- `config.ts` - Configuration management

#### Test Structure
- `*.test.js` - Unit and integration tests
- `fixtures/` - Test data and workflows
- Production tests with ROAST compliance validation

## Coding Standards

### TypeScript Guidelines
```typescript
// Use explicit types
export interface WorkflowStep {
  id: string;
  type: 'prompt' | 'agent' | 'cmd' | 'apply_diff';
  // ...
}

// Prefer async/await over promises
async function executeStep(): Promise<StepResult> {
  const result = await processStep();
  return result;
}

// Use meaningful error messages
throw new Error(`Step ${step.id} failed: ${reason}`);
```

### Error Handling
```typescript
// Structured error handling
try {
  const result = await executeWorkflow();
  return result;
} catch (error) {
  console.error('❌ Workflow execution failed:', error.message);
  process.exit(1);
}

// User-friendly errors
if (!fs.existsSync(file)) {
  console.error('❌ File not found:', file);
  console.error('💡 Create the file or check the path');
  process.exit(1);
}
```

### CLI Output Standards
```typescript
// Use consistent symbols
console.log('✅ Success message');
console.log('⚠️ Warning message');
console.error('❌ Error message');
console.log('💡 Helpful tip');
console.log('🔧 Fix command');

// Structured output
console.log('📊 Execution Summary:');
console.log(`   Status: ${status}`);
console.log(`   Duration: ${duration}ms`);
```

## Testing

### Test Categories

#### Unit Tests
Test individual functions and classes:
```javascript
test('should validate workflow schema', () => {
  const workflow = { version: 1, workflow: 'test' };
  const result = validateWorkflow(workflow);
  assert.strictEqual(result.valid, true);
});
```

#### Integration Tests
Test command execution and file operations:
```javascript
test('should execute basic workflow', () => {
  const result = runWorkflowCommand('run test.yml');
  assert.strictEqual(result.exitCode, 0);
  assert.match(result.stdout, /Execution Summary/);
});
```

#### ROAST Compliance Tests
Test production readiness:
```javascript
describe('ROAST Compliance', () => {
  test('should be Reproducible', () => {
    // Test deterministic behavior
  });
  
  test('should be Observable', () => {
    // Test clear output and status
  });
  
  // ... etc for Auditable, Secure, Testable
});
```

### Test Helpers
```javascript
// Workflow command helper
function runWorkflowCommand(command, options = {}) {
  const result = execSync(`./dist/bcce workflow ${command}`, {
    stdio: 'pipe',
    timeout: options.timeout || 15000,
    encoding: 'utf8'
  });
  return { stdout: result, exitCode: 0 };
}

// Artifact cleanup
function cleanupArtifacts() {
  if (fs.existsSync('.bcce_runs')) {
    fs.rmSync('.bcce_runs', { recursive: true, force: true });
  }
}
```

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test test/doctor.test.js

# Run tests with pattern
npm test -- --grep "workflow"

# Run tests with coverage
npm run test:coverage
```

## Workflow Development

### Creating New Step Types
1. Define interface in `workflow-runner.ts`:
```typescript
interface CustomStep extends WorkflowStep {
  type: 'custom';
  customConfig: CustomConfig;
}
```

2. Implement executor method:
```typescript
private async executeCustomStep(
  step: CustomStep, 
  workflow: WorkflowDefinition
): Promise<StepResult> {
  // Implementation
}
```

3. Add to step dispatcher:
```typescript
switch (step.type) {
  case 'custom':
    return this.executeCustomStep(step, workflow);
  // ...
}
```

4. Update JSON schema:
```json
{
  "properties": {
    "type": {
      "enum": ["prompt", "agent", "cmd", "apply_diff", "custom"]
    }
  }
}
```

### Adding New Commands
1. Create command file in `src/commands/`:
```typescript
// src/commands/analyze/analyze.ts
import { Command } from 'commander';

export const analyzeCmd = new Command('analyze')
  .description('Analyze code quality')
  .argument('<path>', 'Path to analyze')
  .option('--format <format>', 'Output format', 'text')
  .action((path, options) => {
    console.log(`Analyzing ${path} in ${options.format} format`);
  });
```

2. Register in main CLI:
```typescript
// src/index.ts
import { analyzeCmd } from './commands/analyze/analyze.js';

program.addCommand(analyzeCmd);
```

3. Add tests:
```javascript
// test/analyze.test.js
describe('Analyze Command', () => {
  test('should analyze code', () => {
    const result = execSync('./dist/bcce analyze src/');
    assert.match(result.toString(), /Analyzing src\//);
  });
});
```

## Documentation

### Writing Documentation
- Use clear, actionable headings
- Include code examples for all concepts
- Provide troubleshooting for common issues
- Test all code examples before publishing

### Documentation Structure
- `README.md` - Project overview and quick start
- `QUICKSTART.md` - Step-by-step getting started
- `docs/` - Detailed documentation
  - `workflow-schema.md` - Schema reference
  - `agent-policies.md` - Policy documentation
  - `troubleshooting/` - Problem resolution
  - `dev/` - Developer resources

### Code Comments
```typescript
/**
 * Execute a workflow step with proper error handling and artifact storage.
 * 
 * @param step - The workflow step to execute
 * @param workflow - The parent workflow definition
 * @returns Promise resolving to step result with exit code and output
 */
async executeStep(
  step: WorkflowStep, 
  workflow: WorkflowDefinition
): Promise<StepResult> {
  // Implementation
}
```

## Release Process

### Version Management
Follow semantic versioning:
- `MAJOR.MINOR.PATCH`
- Major: Breaking changes
- Minor: New features, backward compatible
- Patch: Bug fixes

### Pre-Release Checklist
- [ ] All tests passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] Examples validated

### Release Steps
```bash
# 1. Update version
npm version patch  # or minor, major

# 2. Update CHANGELOG
# Edit CHANGELOG.md with new version

# 3. Commit and tag
git add .
git commit -m "Release v1.2.3"
git tag v1.2.3

# 4. Push
git push origin main --tags

# 5. GitHub Actions will handle the rest
```

## Debugging

### CLI Debugging
```bash
# Enable debug output (when implemented)
DEBUG=bcce:* ./cli/dist/bcce workflow run test.yml

# Verbose logging
./cli/dist/bcce --verbose workflow run test.yml
```

### Workflow Debugging
```bash
# Use dry run to understand execution plan
./cli/dist/bcce workflow run --dry-run workflow.yml

# Check artifacts after execution
ls -la .bcce_runs/latest-run-id/
cat .bcce_runs/latest-run-id/step-name/transcript.md
```

### Test Debugging
```bash
# Run single test with output
npm test -- --grep "specific test" --reporter spec

# Debug test with node inspect
node --inspect-brk node_modules/.bin/mocha test/specific.test.js
```

## Contributing

### Pull Request Process
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes with tests
4. Ensure all tests pass: `npm test`
5. Update documentation if needed
6. Commit with conventional commit format
7. Push and create pull request

### Commit Message Format
```
type(scope): description

- feat: new feature
- fix: bug fix
- docs: documentation changes
- test: test additions/changes
- refactor: code refactoring
- style: formatting changes
- chore: maintenance tasks
```

Examples:
```
feat(workflow): add resume capability from any step
fix(doctor): handle empty PATH environment gracefully
docs(agent): add policy constraint examples
test(workflow): add ROAST compliance validation
```

### Code Review Guidelines
- Focus on correctness, security, and maintainability
- Ensure adequate test coverage
- Verify documentation is updated
- Check for consistent error handling
- Validate CLI output standards

## Performance Considerations

### CLI Performance
- Minimize startup time
- Cache expensive operations
- Use streaming for large files
- Implement timeouts for external calls

### Workflow Performance  
- Optimize artifact storage
- Implement step-level caching
- Monitor resource usage
- Provide progress indicators

### Memory Management
- Clean up temporary files
- Limit artifact retention
- Stream large file operations
- Monitor memory usage in tests

## Security

### Input Validation
- Sanitize all user inputs
- Validate file paths
- Check command arguments
- Escape shell operations

### Credential Handling
- Never log credentials
- Use secure storage
- Implement redaction
- Follow AWS best practices

### File Operations
- Validate file permissions
- Check for path traversal
- Limit file sizes
- Use safe parsing

This developer guide should evolve as the project grows. Keep it updated with new patterns, tools, and best practices discovered during development.