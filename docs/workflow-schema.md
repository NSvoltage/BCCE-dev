# Workflow Schema Documentation

## Overview

BCCE workflows are YAML files that define multi-step automation tasks executed serially with policy constraints and artifact isolation. Workflows follow ROAST principles for enterprise-grade reliability.

## Schema Version 1

### Top-Level Fields

```yaml
version: 1                    # Required: Schema version
workflow: "Workflow Name"     # Required: Human-readable name
model: ${BEDROCK_MODEL_ID}    # Required: Bedrock model ID (can use env var)
guardrails:                   # Optional: List of guardrail IDs
  - "pii-basic"
  - "secrets-default"
env:                          # Optional: Environment configuration
  max_runtime_seconds: 1200   # Max total runtime (default: 3600)
  artifacts_dir: .bcce_runs/${RUN_ID}  # Artifact storage location
  seed: 42                    # Optional: For reproducibility
steps: []                     # Required: List of workflow steps
```

### Step Types

#### 1. Prompt Step
Execute a prompt with optional tools:
```yaml
- id: analyze_code
  type: prompt
  prompt_file: prompts/analyze.md    # Required: Path to prompt file
  available_tools:                   # Optional: Available tools
    - ReadFile
    - Search
  inputs:                            # Optional: Step inputs
    paths: ["src/**", "test/**"]
    file_size_limit_kb: 512
```

#### 2. Agent Step
Execute Claude Code with policy constraints:
```yaml
- id: fix_bugs
  type: agent
  policy:                            # Required: Policy constraints
    timeout_seconds: 600            # Max execution time
    max_files: 50                   # Max files to read
    max_edits: 10                   # Max file edits allowed
    allowed_paths:                  # Path restrictions (globs)
      - "src/**"
      - "test/**"
      - "*.js"
    cmd_allowlist:                  # Allowed commands (empty = none)
      - "npm"
      - "node"
      - "jest"
  available_tools:                  # Required: Available tools
    - ReadFile
    - Search
    - Diff
    - Apply
    - Cmd
```

#### 3. Command Step
Execute shell commands:
```yaml
- id: run_tests
  type: cmd
  command: "npm test"               # Required: Command to execute
  on_error: continue                # Optional: continue or fail (default: fail)
  timeout: 30                       # Optional: Timeout in seconds
```

#### 4. Apply Diff Step
Apply code changes with approval:
```yaml
- id: apply_changes
  type: apply_diff
  approve: false                    # Required: false = manual approval required
```

#### 5. Custom Step
For future extensions:
```yaml
- id: custom_task
  type: custom
  handler: "my-custom-handler"
  config:
    key: value
```

## Policy Constraints

Agent steps MUST include policy constraints for security:

### Required Policy Fields
- `timeout_seconds`: Maximum execution time (1-3600)
- `max_files`: Maximum files agent can read (0-1000)
- `max_edits`: Maximum file modifications (0-100)
- `allowed_paths`: List of glob patterns for accessible paths
- `cmd_allowlist`: List of allowed commands (empty list = no commands)

### Policy Examples

#### Read-Only Analysis
```yaml
policy:
  timeout_seconds: 300
  max_files: 100
  max_edits: 0          # No edits allowed
  allowed_paths: ["**"]
  cmd_allowlist: []     # No commands allowed
```

#### Controlled Editing
```yaml
policy:
  timeout_seconds: 600
  max_files: 50
  max_edits: 10
  allowed_paths: 
    - "src/**"
    - "test/**"
  cmd_allowlist:
    - "npm"
    - "yarn"
```

#### Test Execution
```yaml
policy:
  timeout_seconds: 900
  max_files: 200
  max_edits: 5
  allowed_paths: ["**"]
  cmd_allowlist:
    - "npm"
    - "jest"
    - "pytest"
    - "go"
```

## Available Tools

Tools available to prompt and agent steps:

| Tool | Description | Use Case |
|------|-------------|----------|
| `ReadFile` | Read file contents | Code analysis |
| `Search` | Search for patterns | Finding implementations |
| `Diff` | Generate diffs | Proposing changes |
| `Apply` | Apply diffs | Making changes |
| `Cmd` | Execute commands | Running tests |
| `WriteFile` | Write new files | Creating configs |

## Environment Variables

Workflows can reference environment variables:

```yaml
model: ${BEDROCK_MODEL_ID}
env:
  artifacts_dir: .bcce_runs/${RUN_ID}
  custom_var: ${MY_ENV_VAR}
```

Standard variables:
- `${BEDROCK_MODEL_ID}`: Claude model ID
- `${RUN_ID}`: Unique workflow run ID
- `${AWS_REGION}`: AWS region

## Artifacts

All workflow artifacts are stored in `.bcce_runs/${RUN_ID}/`:

```
.bcce_runs/
└── 2025-01-15T10-30-45-abc123/     # Run ID
    ├── run-state.json               # Workflow state
    ├── step1/                       # Step artifacts
    │   ├── output.txt
    │   ├── error.txt
    │   └── metrics.json
    ├── step2/
    │   ├── policy.json              # Agent policy
    │   ├── transcript.md            # Execution transcript
    │   └── output.txt
    └── workflow-diagram.dot         # Generated diagram
```

## Validation

Validate workflows before running:
```bash
./cli/dist/bcce workflow validate my-workflow.yml
```

Validation checks:
- YAML syntax
- Schema compliance
- Required fields
- Step ID uniqueness
- Policy constraints
- Tool availability

## Examples

### Simple Analysis Workflow
```yaml
version: 1
workflow: "Code Analysis"
model: ${BEDROCK_MODEL_ID}

steps:
  - id: analyze
    type: prompt
    prompt_file: analyze.md
    available_tools: [ReadFile, Search]
    inputs:
      paths: ["src/**"]
```

### Multi-Step Processing
```yaml
version: 1
workflow: "Test and Fix"
model: ${BEDROCK_MODEL_ID}
guardrails: ["pii-basic"]

steps:
  - id: find_issues
    type: prompt
    prompt_file: find-issues.md
    available_tools: [ReadFile, Search]
    
  - id: fix_issues
    type: agent
    policy:
      timeout_seconds: 600
      max_files: 30
      max_edits: 10
      allowed_paths: ["src/**"]
      cmd_allowlist: ["npm"]
    available_tools: [ReadFile, Search, Diff, Apply]
    
  - id: verify_fixes
    type: cmd
    command: "npm test"
    on_error: continue
    
  - id: apply_fixes
    type: apply_diff
    approve: false
```

### Error Handling
```yaml
steps:
  - id: risky_operation
    type: cmd
    command: "npm run risky-task"
    on_error: continue    # Continue even if this fails
    
  - id: cleanup
    type: cmd
    command: "npm run cleanup"
    # This runs regardless of previous step
```

## Best Practices

1. **Start Small**: Begin with read-only analysis before allowing edits
2. **Constrain Paths**: Limit `allowed_paths` to necessary directories
3. **Minimize Commands**: Only allow essential commands in `cmd_allowlist`
4. **Set Timeouts**: Use reasonable `timeout_seconds` to prevent runaway execution
5. **Version Control**: Store workflows in git for change tracking
6. **Test First**: Use `--dry-run` to preview execution plan
7. **Monitor Artifacts**: Check `.bcce_runs/` for debugging
8. **Use Guardrails**: Enable content filtering for sensitive data

## Troubleshooting

### Workflow Won't Validate
- Check YAML syntax with `yamllint`
- Ensure all required fields are present
- Verify step IDs are unique
- Confirm file paths exist

### Agent Step Fails
- Check policy constraints aren't too restrictive
- Verify Claude CLI is installed
- Review transcript in artifacts
- Adjust timeouts if needed

### Command Step Fails
- Ensure command is in `cmd_allowlist`
- Check working directory
- Verify command exists in PATH
- Use `on_error: continue` for non-critical steps

### Resume Doesn't Work
- Ensure run ID is correct
- Check step ID matches workflow
- Verify artifacts directory exists
- Confirm workflow file hasn't changed

## Advanced Features

### Conditional Execution (Future)
```yaml
- id: conditional_step
  type: cmd
  command: "npm test"
  when: "${PREVIOUS_STEP_EXIT_CODE} == 0"
```

### Parallel Execution (Future)
```yaml
- id: parallel_tasks
  type: parallel
  steps:
    - id: task1
      type: cmd
      command: "npm run task1"
    - id: task2
      type: cmd  
      command: "npm run task2"
```

### Loops (Future)
```yaml
- id: retry_task
  type: cmd
  command: "npm test"
  retry:
    max_attempts: 3
    backoff: exponential
```