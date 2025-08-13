# BCCE Usage Guide

This guide shows practical examples of using BCCE for real development workflows.

## Quick Start Example

Instead of running Claude Code commands manually, create structured workflows:

```bash
# 1. Set up environment (one-time)
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1
export BEDROCK_MODEL_ID="us.anthropic.claude-3-5-sonnet-20250219-v1:0"

# 2. Validate your setup
./dist/bcce doctor

# 3. Run a workflow
./dist/bcce workflow run workflows/starters/test-grader.yml
```

## Common Development Workflows

### 1. Code Review Assistant

**Scenario**: Get structured analysis of your codebase before a PR

```yaml
# code-review.yml
version: 1
workflow: "Code Review Assistant"
model: "us.anthropic.claude-3-5-sonnet-20250219-v1:0"

steps:
  - id: analyze_changes
    type: agent
    policy:
      timeout_seconds: 300
      max_files: 30
      max_edits: 5
      allowed_paths: ["src/**", "test/**", "*.md"]
      cmd_allowlist: ["npm", "git"]
    available_tools: [ReadFile, Search, Diff]
    
  - id: run_tests
    type: cmd
    command: "npm test"
    on_error: continue
```

**Usage**:
```bash
bcce workflow run code-review.yml
# Creates artifacts in .bcce_runs/2025-08-13T10-30-45-abc123/
# View analysis: cat .bcce_runs/*/analyze_changes/transcript.md
```

### 2. Bug Investigation

**Scenario**: Systematically investigate and fix bugs

```yaml
# bug-hunt.yml
version: 1
workflow: "Bug Investigation"
model: "us.anthropic.claude-3-5-sonnet-20250219-v1:0"

steps:
  - id: reproduce_issue
    type: agent
    policy:
      timeout_seconds: 600
      max_files: 50
      max_edits: 1
      allowed_paths: ["src/**", "test/**", "logs/**"]
      cmd_allowlist: ["npm", "node"]
      
  - id: develop_fix
    type: agent
    policy:
      timeout_seconds: 900
      max_files: 20
      max_edits: 10
      allowed_paths: ["src/**"]
      cmd_allowlist: ["npm", "git"]
      
  - id: test_fix
    type: cmd
    command: "npm test"
    on_error: fail
```

### 3. Documentation Generator

**Scenario**: Generate docs for your code

```yaml
# doc-gen.yml  
version: 1
workflow: "Documentation Generator"
model: "us.anthropic.claude-3-5-sonnet-20250219-v1:0"

steps:
  - id: analyze_api
    type: agent
    policy:
      timeout_seconds: 300
      max_files: 100
      max_edits: 1
      allowed_paths: ["src/**", "lib/**", "*.ts", "*.js"]
      cmd_allowlist: []
      
  - id: generate_docs
    type: agent
    policy:
      timeout_seconds: 600
      max_files: 20
      max_edits: 20
      allowed_paths: ["docs/**", "README.md", "*.md"]
      cmd_allowlist: ["npm"]
```

## Real Developer Experience

### Day-to-Day Usage

```bash
# Morning: Review overnight changes
bcce workflow run code-review.yml

# During dev: Investigate bug reports  
bcce workflow run bug-hunt.yml

# Before PR: Generate updated docs
bcce workflow run doc-gen.yml

# Check all artifacts
ls .bcce_runs/
```

### Team Usage

```bash
# Team lead creates workflow
cat > team-standards.yml << EOF
version: 1
workflow: "Team Code Standards Check"
model: "us.anthropic.claude-3-5-sonnet-20250219-v1:0"
steps:
  - id: lint_check
    type: cmd
    command: "npm run lint"
  - id: security_scan
    type: agent
    policy:
      timeout_seconds: 300
      max_files: 100
      max_edits: 1
      allowed_paths: ["src/**", "package*.json"]
      cmd_allowlist: []
EOF

# Developers run standard checks
bcce workflow run team-standards.yml
```

## Advanced Features

### Resume Interrupted Workflows

```bash
# Workflow fails on step 3 of 5
bcce workflow run complex-refactor.yml
# ❌ Failed at step: optimize_performance

# Resume from where it failed
bcce workflow resume abc123 --from optimize_performance
```

### Policy Enforcement Examples

```yaml
# Read-only analysis
policy:
  timeout_seconds: 300
  max_files: 50
  max_edits: 1        # Minimal suggestions only
  allowed_paths: ["src/**", "test/**"]
  cmd_allowlist: []   # No commands

# Controlled development
policy:
  timeout_seconds: 900
  max_files: 20
  max_edits: 15
  allowed_paths: ["src/components/**"]
  cmd_allowlist: ["npm", "jest", "git"]

# High-trust environment
policy:
  timeout_seconds: 1800
  max_files: 100
  max_edits: 50
  allowed_paths: ["**"]
  cmd_allowlist: ["npm", "git", "docker", "make"]
```

## Understanding Artifacts

Each workflow run creates a timestamped directory:

```
.bcce_runs/2025-08-13T10-30-45-abc123/
├── analyze_changes/
│   ├── transcript.md      # AI conversation
│   ├── policy.json       # Enforced constraints  
│   ├── metrics.json      # Performance data
│   └── output.txt        # Results
├── run_tests/
│   ├── command.txt       # Command executed
│   └── output.txt        # Command output
└── run-state.json        # Workflow state
```

**Key files**:
- `transcript.md` - Complete AI interaction log
- `policy.json` - Security constraints enforced
- `run-state.json` - Resume information
- `output.txt` - Step results

## Integration Patterns

### CI/CD Integration

```yaml
# .github/workflows/bcce.yml
name: BCCE Quality Check
on: [pull_request]
jobs:
  bcce-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run BCCE analysis
        env:
          AWS_REGION: us-east-1
          CLAUDE_CODE_USE_BEDROCK: 1
          BEDROCK_MODEL_ID: "us.anthropic.claude-3-5-sonnet-20250219-v1:0"
        run: |
          ./dist/bcce workflow run .github/workflows/pr-analysis.yml
          # Upload artifacts for review
```

### Pre-commit Hooks

```bash
# .git/hooks/pre-commit
#!/bin/bash
bcce workflow run pre-commit-checks.yml
if [ $? -ne 0 ]; then
  echo "❌ Pre-commit BCCE checks failed"
  exit 1
fi
```

## Tips & Best Practices

### Workflow Design
- **Start small**: Begin with 1-2 step workflows
- **Be explicit**: Define clear policies for each step
- **Test first**: Use `--dry-run` to verify execution plan
- **Iterate**: Refine workflows based on results

### Security
- **Least privilege**: Start with restrictive policies, open up as needed
- **Path restrictions**: Use `allowed_paths` to limit file access
- **Command limits**: Whitelist only necessary commands
- **Timeout safety**: Set reasonable timeout values

### Team Adoption  
- **Share workflows**: Version control your `.yml` files
- **Document policies**: Explain why constraints exist
- **Review artifacts**: Check `.bcce_runs/` for quality
- **Standardize models**: Use consistent Bedrock model IDs

## Troubleshooting Common Issues

### Environment Setup
```bash
# Check configuration
bcce doctor

# Common fixes
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1
aws configure  # Set up AWS credentials
```

### Workflow Failures
```bash
# Validate workflow syntax
bcce workflow validate my-workflow.yml

# Check execution plan
bcce workflow run --dry-run my-workflow.yml

# Review failure artifacts
cat .bcce_runs/*/run-state.json
```

### Policy Violations
```bash
# Too restrictive? Increase limits
max_files: 100      # Was: 10
max_edits: 20       # Was: 5
timeout_seconds: 900  # Was: 300

# Add missing paths
allowed_paths: ["src/**", "test/**", "docs/**"]

# Enable needed commands  
cmd_allowlist: ["npm", "git", "make"]
```