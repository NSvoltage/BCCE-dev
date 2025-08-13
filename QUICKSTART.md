# BCCE Quick Start Guide

Get BCCE running in 5 minutes and execute your first AI workflow.

## Prerequisites

Before starting, ensure you have:
- **AWS Account** with Bedrock access and IAM permissions
- **Node.js 20+** and npm installed  
- **AWS CLI** configured with credentials
- **Claude Code CLI**: `npm install -g @anthropic-ai/claude-code`

## 5-Minute Setup

### Step 1: Clone and Build
```bash
# Clone repository  
git clone https://github.com/NSvoltage/BCCE-dev.git
cd BCCE-dev/cli

npm install && npm run build
```

### Step 2: Configure Environment
```bash
# Set required environment variables
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1
export BEDROCK_MODEL_ID="us.anthropic.claude-3-5-sonnet-20250219-v1:0"

# If using AWS SSO:
aws sso login --profile your-profile
```

### Step 3: Verify Setup
```bash
# Health check
./dist/bcce doctor

# Expected output:
# ✅ AWS_REGION: Set to: us-east-1  
# ✅ Claude CLI: Found: 1.0.77 (Claude Code)
# ✅ All checks passed! BCCE is ready for production use.
```

### Step 4: Discover Models (30 seconds)
```bash
# List available Claude models in your region
./cli/dist/bcce models list

# Get recommended model for coding
./cli/dist/bcce models recommend --use-case coding

# Set the model (use the ID from above)
export BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0"
```

### Step 5: Run Your First Workflow (1 minute)
```bash
# Validate a starter workflow
./cli/dist/bcce workflow validate workflows/starters/test-grader.yml

# See what it will do (dry run)
./cli/dist/bcce workflow run --dry-run workflows/starters/test-grader.yml

# Run it for real
./cli/dist/bcce workflow run workflows/starters/test-grader.yml
```

## Common Workflows

### Test Grader
Analyzes your test suite and suggests improvements:
```bash
./cli/dist/bcce workflow run workflows/starters/test-grader.yml
```

### Bug Fix Loop
Systematic bug investigation with safety constraints:
```bash
./cli/dist/bcce workflow run workflows/starters/bugfix-loop.yml
```

### Code Refactoring
Improve code quality with controlled edits:
```bash
./cli/dist/bcce workflow run workflows/starters/refactor-upgrade.yml
```

### PR Summarizer
Generate pull request summaries:
```bash
./cli/dist/bcce workflow run workflows/starters/pr-summarizer.yml
```

## Workflow Management

### Resume Failed Workflows
If a workflow fails, you can resume from the failed step:
```bash
# The failed run will show a resume command like:
./cli/dist/bcce workflow resume 2025-01-15T10-30-45-abc123 --from step_name
```

### View Workflow Artifacts
All workflow artifacts are stored in `.bcce_runs/`:
```bash
# List all runs
ls -la .bcce_runs/

# View a specific run's artifacts
ls -la .bcce_runs/2025-01-15T10-30-45-abc123/

# Check step outputs
cat .bcce_runs/2025-01-15T10-30-45-abc123/step_name/output.txt
```

### Generate Workflow Diagrams
Visualize workflow structure:
```bash
# Generate DOT file
./cli/dist/bcce workflow diagram workflows/starters/test-grader.yml

# If you have GraphViz installed, it auto-generates PNG
# Otherwise, use online tool: https://dreampuf.github.io/GraphvizOnline/
```

## Creating Custom Workflows

### Basic Workflow Structure
Create a file `my-workflow.yml`:
```yaml
version: 1
workflow: "My Custom Workflow"
model: ${BEDROCK_MODEL_ID}

steps:
  - id: analyze
    type: prompt
    prompt_file: analyze.md
    available_tools: [ReadFile, Search]
    
  - id: process
    type: agent
    policy:
      timeout_seconds: 300
      max_files: 20
      max_edits: 5
      allowed_paths: ["src/**", "test/**"]
      cmd_allowlist: ["npm", "node"]
    available_tools: [ReadFile, Search, Cmd]
    
  - id: verify
    type: cmd
    command: npm test
    on_error: continue
```

### Scaffold a New Workflow
```bash
./cli/dist/bcce workflow scaffold my-project --template agent
cd workflows/examples/my-project/
# Edit prompt.md and workflow.yml
```

## Troubleshooting

### Issue: "AWS_REGION not set"
```bash
export AWS_REGION=us-east-1
```

### Issue: "Claude CLI not found"
```bash
npm install -g @anthropic-ai/claude-code
export CLAUDE_CODE_USE_BEDROCK=1
```

### Issue: "No models found"
Ensure your AWS account has Bedrock access enabled for your region.

### Issue: Workflow fails
1. Check the error message for specific step that failed
2. Review artifacts in `.bcce_runs/<run-id>/<step-id>/`
3. Use the resume command shown in the output
4. Adjust workflow constraints if needed

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `BEDROCK_MODEL_ID` | Claude model to use | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `AWS_PROFILE` | AWS profile (SSO users) | `my-sso-profile` |
| `CLAUDE_CODE_USE_BEDROCK` | Enable Bedrock mode | `1` |

## Next Steps

1. **Explore Workflows**: Check `workflows/starters/` for more examples
2. **Read Schema Docs**: See [Workflow Schema](docs/workflow-schema.md) for all options
3. **Learn ROAST**: Understand [ROAST principles](docs/ROAST-EVOLUTION.md)
4. **Join Community**: Report issues at [GitHub Issues](https://github.com/your-org/bcce/issues)

## Getting Help

- Run `./cli/dist/bcce --help` for command help
- Run `./cli/dist/bcce doctor` for environment diagnosis
- Check [Troubleshooting Guide](docs/troubleshooting/README.md) for common issues
- File issues at [GitHub](https://github.com/your-org/bcce/issues)