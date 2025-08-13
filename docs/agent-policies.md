# Agent Step Policies and Constraints

## Overview

Agent steps in BCCE workflows execute Claude Code with mandatory policy constraints to ensure security, resource management, and predictable behavior. Every agent step MUST define a policy with explicit limits.

## Policy Architecture

### Security Model
- **Fail-Closed**: No access by default, explicit allowlists only
- **Least Privilege**: Minimum permissions needed for the task
- **Time-Boxed**: All execution has strict time limits
- **Resource-Bounded**: Explicit limits on files and edits
- **Path-Restricted**: Only allowed directories accessible

### Policy Enforcement
- **Pre-execution**: Policy validation before agent starts
- **Runtime**: Continuous monitoring during execution
- **Post-execution**: Audit trail with metrics and constraints

## Required Policy Fields

Every agent step must include all these fields:

```yaml
policy:
  timeout_seconds: 300        # Required: 1-3600 seconds
  max_files: 50              # Required: 0-1000 files
  max_edits: 10              # Required: 0-100 edits
  allowed_paths:             # Required: List of glob patterns
    - "src/**"
    - "test/**"
  cmd_allowlist:             # Required: List of allowed commands
    - "npm"
    - "node"
```

### Field Descriptions

#### `timeout_seconds`
- **Purpose**: Maximum execution time for the agent step
- **Range**: 1-3600 seconds (1 second to 1 hour)
- **Behavior**: Agent is terminated after timeout
- **Recommendation**: Start with 300s (5 min), adjust based on task complexity

#### `max_files`
- **Purpose**: Maximum number of files agent can read
- **Range**: 0-1000 files
- **Behavior**: Agent stops reading new files after limit
- **Recommendation**: Use 20-50 for focused tasks, 100+ for analysis

#### `max_edits`
- **Purpose**: Maximum number of file modifications allowed
- **Range**: 0-100 edits
- **Behavior**: Agent cannot modify files after limit reached
- **Special**: Set to 0 for read-only analysis

#### `allowed_paths`
- **Purpose**: Glob patterns defining accessible file paths
- **Format**: Array of glob patterns
- **Behavior**: Agent can only access files matching patterns
- **Examples**:
  - `["**"]` - Access all files (use carefully)
  - `["src/**", "test/**"]` - Only source and test directories
  - `["*.js", "*.ts"]` - Only JavaScript/TypeScript files
  - `["!node_modules/**"]` - Exclude node_modules

#### `cmd_allowlist`
- **Purpose**: Commands agent is allowed to execute
- **Format**: Array of command names (executable names only)
- **Behavior**: Agent can only run listed commands
- **Security**: Empty list `[]` means no commands allowed
- **Examples**:
  - `[]` - No commands (safest)
  - `["npm", "yarn"]` - Package managers only
  - `["npm", "jest", "eslint"]` - Testing and linting

## Policy Templates

### Read-Only Analysis
For code analysis, documentation, or review tasks:
```yaml
policy:
  timeout_seconds: 300
  max_files: 100
  max_edits: 0              # No modifications
  allowed_paths: ["**"]     # Read everything
  cmd_allowlist: []         # No commands
```

### Focused Development
For targeted bug fixes or feature implementation:
```yaml
policy:
  timeout_seconds: 600
  max_files: 30
  max_edits: 10
  allowed_paths:
    - "src/components/**"
    - "src/utils/**" 
    - "test/**"
  cmd_allowlist:
    - "npm"
    - "jest"
```

### Test Development
For writing or improving tests:
```yaml
policy:
  timeout_seconds: 900
  max_files: 50
  max_edits: 20
  allowed_paths:
    - "test/**"
    - "spec/**"
    - "src/**"           # Need to read source
  cmd_allowlist:
    - "npm"
    - "jest"
    - "mocha"
    - "pytest"
```

### Refactoring
For code improvements and restructuring:
```yaml
policy:
  timeout_seconds: 1200
  max_files: 75
  max_edits: 25
  allowed_paths:
    - "src/**"
    - "lib/**"
    - "index.js"
  cmd_allowlist:
    - "npm"
    - "eslint"
    - "prettier"
```

### Build and Deploy
For build system modifications:
```yaml
policy:
  timeout_seconds: 600
  max_files: 20
  max_edits: 5
  allowed_paths:
    - "package.json"
    - "webpack.config.js"
    - "tsconfig.json"
    - ".github/**"
    - "scripts/**"
  cmd_allowlist:
    - "npm"
    - "yarn"
    - "webpack"
    - "tsc"
```

## Advanced Policy Patterns

### Gradual Permission Escalation
Start restrictive, then expand as needed:

**Step 1: Investigate**
```yaml
policy:
  timeout_seconds: 300
  max_files: 50
  max_edits: 0          # Read-only first
  allowed_paths: ["**"]
  cmd_allowlist: []
```

**Step 2: Implement**
```yaml
policy:
  timeout_seconds: 600
  max_files: 30
  max_edits: 10         # Now allow changes
  allowed_paths:        # Narrow scope based on findings
    - "src/specific/**"
  cmd_allowlist:
    - "npm"             # Add needed commands
```

### Multi-Language Projects
Different constraints per language/framework:

**JavaScript/Node.js**
```yaml
policy:
  allowed_paths:
    - "src/**/*.js"
    - "test/**/*.js"
    - "package.json"
  cmd_allowlist:
    - "npm"
    - "node"
    - "jest"
```

**Python**
```yaml
policy:
  allowed_paths:
    - "src/**/*.py"
    - "tests/**/*.py"
    - "requirements.txt"
    - "setup.py"
  cmd_allowlist:
    - "python"
    - "pytest"
    - "pip"
```

**Go**
```yaml
policy:
  allowed_paths:
    - "**/*.go"
    - "go.mod"
    - "go.sum"
  cmd_allowlist:
    - "go"
```

### Environment-Specific Policies

**Development**
```yaml
policy:
  timeout_seconds: 1200    # Generous timeout
  max_files: 100
  max_edits: 50
  allowed_paths: ["**"]
  cmd_allowlist:
    - "npm"
    - "yarn"
    - "jest"
    - "eslint"
    - "prettier"
```

**CI/CD**
```yaml
policy:
  timeout_seconds: 300     # Strict timeout
  max_files: 20
  max_edits: 5
  allowed_paths:           # Very restricted
    - "src/critical/**"
  cmd_allowlist:
    - "npm"                # Only essential commands
```

**Production**
```yaml
policy:
  timeout_seconds: 180     # Very strict
  max_files: 10
  max_edits: 2
  allowed_paths:
    - "config/**"          # Only config changes
  cmd_allowlist: []        # No commands in prod
```

## Monitoring and Compliance

### Artifact Tracking
Every agent execution creates artifacts for audit:

- `policy.json` - Applied policy constraints
- `transcript.md` - Full execution log
- `metrics.json` - Performance and compliance metrics

### Metrics Collected
```json
{
  "duration_seconds": 45,
  "exit_code": 0,
  "timed_out": false,
  "files_accessed": 23,
  "files_modified": 7,
  "commands_executed": 3,
  "policy": {
    "timeout_seconds": 300,
    "max_files": 50,
    "max_edits": 10
  }
}
```

### Compliance Alerts
The system tracks and reports:
- Policy violations
- Resource usage patterns
- Execution time trends
- File access patterns

## Security Considerations

### Sensitive Data Protection
Agent transcripts automatically redact:
- API keys (`sk-***`, `AWSKEY***`)
- Passwords (`password=***`)
- Bearer tokens (`Bearer ***`)
- Common secret patterns

### Command Injection Prevention
- Only exact command names allowed (no shell operators)
- No piping, redirection, or chaining
- Arguments are filtered for safety
- Working directory is controlled

### Path Traversal Protection
- All paths validated against allowed patterns
- No `../` traversal outside allowed directories
- Symlinks followed safely
- Hidden files (`.env`, `.secrets`) require explicit inclusion

### Resource Exhaustion Prevention
- Hard limits on execution time
- Memory usage monitoring
- File access rate limiting
- Network isolation (if configured)

## Best Practices

### Policy Design
1. **Start Restrictive**: Begin with minimal permissions
2. **Principle of Least Privilege**: Only grant necessary access
3. **Time-Box Everything**: Always set reasonable timeouts
4. **Document Rationale**: Comment why specific permissions are needed
5. **Regular Review**: Audit and adjust policies periodically

### Testing Policies
```bash
# Test with dry run first
./cli/dist/bcce workflow run --dry-run my-workflow.yml

# Start with read-only policy
max_edits: 0

# Gradually expand permissions
# Monitor artifacts to understand actual usage
```

### Policy Evolution
Track policy effectiveness:
```yaml
# Version 1: Initial restrictive policy
policy:
  timeout_seconds: 300
  max_files: 20
  max_edits: 5

# Version 2: Adjusted based on metrics
policy:
  timeout_seconds: 450     # Increased due to timeouts
  max_files: 30           # Increased due to file access patterns
  max_edits: 8            # Slightly increased for task completion
```

### Common Mistakes

❌ **Too Permissive**
```yaml
policy:
  timeout_seconds: 3600    # Too long
  max_files: 1000         # Too many
  max_edits: 100          # Too many
  allowed_paths: ["**"]    # Too broad
  cmd_allowlist:          # Too many commands
    - "bash"              # NEVER allow bash
    - "sh"
    - "curl"
    - "wget"
```

✅ **Well-Balanced**
```yaml
policy:
  timeout_seconds: 600     # Reasonable for task
  max_files: 50           # Enough for analysis
  max_edits: 15           # Sufficient for changes
  allowed_paths:          # Task-specific
    - "src/feature/**"
    - "test/feature/**"
  cmd_allowlist:          # Only necessary
    - "npm"
    - "jest"
```

## Troubleshooting Policies

### Agent Stops Early
**Cause**: Hit resource limit
**Solution**: Check metrics, adjust limits appropriately
```bash
cat .bcce_runs/run-id/step/metrics.json | jq .
```

### Permission Denied Errors
**Cause**: Path not in `allowed_paths`
**Solution**: Add necessary paths or use broader patterns

### Command Not Found
**Cause**: Command not in `cmd_allowlist`
**Solution**: Add command to allowlist or find alternative

### Timeout Issues
**Cause**: `timeout_seconds` too low for task complexity
**Solution**: Analyze task scope, increase timeout reasonably

## Policy Validation

The system validates policies at workflow validation time:

```bash
./cli/dist/bcce workflow validate workflow.yml
```

Validation checks:
- All required fields present
- Values within acceptable ranges
- Path patterns are valid globs
- Command names are valid executables
- No obviously dangerous configurations