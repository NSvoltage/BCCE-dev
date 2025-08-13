# BCCE Troubleshooting Guide

## Quick Diagnosis

Run the doctor command for immediate environment diagnosis:
```bash
./cli/dist/bcce doctor
```

## Common Issues and Solutions

### Environment Issues

#### ❌ "AWS_REGION not set"
**Problem**: AWS region is not configured in environment.

**Solution**:
```bash
export AWS_REGION=us-east-1
# Add to ~/.bashrc or ~/.zshrc for persistence
echo 'export AWS_REGION=us-east-1' >> ~/.bashrc
```

#### ❌ "Claude CLI not found"
**Problem**: Claude Code CLI is not installed or not in PATH.

**Solution**:
```bash
# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code

# Enable Bedrock mode
export CLAUDE_CODE_USE_BEDROCK=1

# Verify installation
claude --version
```

#### ⚠️ "Bedrock DNS: Skipped"
**Problem**: Go binary not available for DNS probes (non-critical).

**Solution**: This is informational only. The system will use built-in checks. To enable Go probes:
```bash
# Install Go if needed
brew install go  # macOS
# or
sudo apt install golang  # Ubuntu/Debian

# Build the probe
cd go-tools/doctor-probes
go build -o doctor-probes .
```

### Authentication Issues

#### ❌ "No AWS credentials configured"
**Problem**: AWS CLI is not configured with credentials.

**Solution for IAM Users**:
```bash
aws configure
# Enter your Access Key ID, Secret Access Key, and region
```

**Solution for SSO/Identity Center**:
```bash
# Configure SSO profile
aws configure sso
# Follow the prompts

# Login
aws sso login --profile your-profile
export AWS_PROFILE=your-profile
```

#### ❌ "Token expired"
**Problem**: SSO session has expired.

**Solution**:
```bash
aws sso login --profile your-profile
```

### Model Access Issues

#### ❌ "No models found"
**Problem**: Bedrock is not enabled in your region or account lacks access.

**Solution**:
1. Verify Bedrock is available in your region
2. Check AWS Console → Bedrock → Model access
3. Request access to Claude models if needed
4. Wait for approval (usually instant for Claude Instant, may take time for Claude 3)

#### ❌ "Model not found: xxx"
**Problem**: Specified model ID is incorrect or not available.

**Solution**:
```bash
# List available models
./cli/dist/bcce models list

# Use the exact model ID
export BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0"
```

### Workflow Issues

#### ❌ "Workflow validation failed"
**Problem**: Workflow YAML has syntax or schema errors.

**Common Fixes**:
1. Check YAML syntax:
```bash
# Install yamllint if needed
pip install yamllint
yamllint workflows/my-workflow.yml
```

2. Verify required fields:
- `version: 1`
- `workflow: "name"`
- `model: ${BEDROCK_MODEL_ID}`
- `steps:` with at least one step

3. Check step structure:
```yaml
steps:
  - id: unique_id        # Must be unique
    type: agent          # Valid types: prompt, agent, cmd, apply_diff
    policy:              # Required for agent steps
      timeout_seconds: 300
      max_files: 10
      max_edits: 5
      allowed_paths: ["**"]
      cmd_allowlist: []
```

#### ❌ "Step failed with exit code 1"
**Problem**: A workflow step failed during execution.

**Debugging Steps**:
1. Check the error message for the specific step
2. Review artifacts:
```bash
# Find your run ID in the output
ls -la .bcce_runs/2025-01-15T10-30-45-abc123/

# Check step output
cat .bcce_runs/2025-01-15T10-30-45-abc123/failed_step/error.txt
cat .bcce_runs/2025-01-15T10-30-45-abc123/failed_step/output.txt
```

3. Resume from the failed step:
```bash
./cli/dist/bcce workflow resume 2025-01-15T10-30-45-abc123 --from failed_step
```

#### ❌ "Agent step timeout"
**Problem**: Agent step exceeded timeout limit.

**Solutions**:
1. Increase timeout in workflow:
```yaml
policy:
  timeout_seconds: 900  # Increase from default
```

2. Reduce scope:
```yaml
policy:
  max_files: 20        # Reduce from 50
  allowed_paths:       # Narrow paths
    - "src/specific/**"
```

#### ❌ "Permission denied"
**Problem**: Trying to access restricted paths or execute forbidden commands.

**Solutions**:
1. Check agent policy:
```yaml
policy:
  allowed_paths:       # Add needed paths
    - "src/**"
    - "test/**"
  cmd_allowlist:       # Add needed commands
    - "npm"
    - "node"
```

2. Verify file permissions:
```bash
ls -la path/to/file
chmod 644 path/to/file  # If needed
```

### Performance Issues

#### Slow Workflow Execution
**Problem**: Workflows take too long to complete.

**Solutions**:
1. Optimize agent policies:
```yaml
policy:
  max_files: 20      # Reduce from higher number
  allowed_paths:     # Be specific
    - "src/module/**"
```

2. Split into smaller workflows
3. Use `--dry-run` first to understand execution plan

#### High Memory Usage
**Problem**: CLI consumes too much memory.

**Solutions**:
1. Clear old artifacts:
```bash
rm -rf .bcce_runs/old-run-*
```

2. Reduce file size limits:
```yaml
inputs:
  file_size_limit_kb: 256  # Reduce from 512
```

### Platform-Specific Issues

#### Windows Issues

**Path Separator Problems**:
```bash
# Use forward slashes even on Windows
./cli/dist/bcce workflow run workflows/test.yml

# Or use double backslashes
.\\cli\\dist\\bcce workflow run workflows\\test.yml
```

**Line Ending Issues**:
```bash
# Configure git for Windows
git config --global core.autocrlf true
```

#### macOS Issues

**Code Signing**:
```bash
# If you get "cannot be opened" error
xattr -d com.apple.quarantine ./cli/dist/bcce
```

**Path Issues**:
```bash
# Add to PATH in ~/.zshrc
export PATH="$PATH:/path/to/bcce/cli/dist"
```

#### Linux Issues

**Permission Issues**:
```bash
# Make executable
chmod +x ./cli/dist/bcce

# If permission denied on execution
sudo chmod +x ./cli/dist/bcce
```

### Debugging Techniques

#### Enable Verbose Output
```bash
# Set debug environment variable (future feature)
DEBUG=bcce:* ./cli/dist/bcce workflow run test.yml
```

#### Check Artifact Logs
```bash
# List all runs
ls -la .bcce_runs/

# Find latest run
ls -lt .bcce_runs/ | head -2

# Examine run state
cat .bcce_runs/latest-run/run-state.json | jq .

# Check step transcript (for agent steps)
cat .bcce_runs/latest-run/step_name/transcript.md
```

#### Test in Isolation
```bash
# Test just one step by creating minimal workflow
cat > test-single.yml << EOF
version: 1
workflow: "Test Single Step"
model: \${BEDROCK_MODEL_ID}
steps:
  - id: test
    type: cmd
    command: "echo 'Testing'"
EOF

./cli/dist/bcce workflow run test-single.yml
```

#### Validate Environment
```bash
# Check all environment variables
env | grep -E "(AWS|BEDROCK|CLAUDE)"

# Verify AWS credentials
aws sts get-caller-identity

# Test Bedrock access
aws bedrock list-foundation-models --region $AWS_REGION
```

## Getting Help

### Self-Service Resources
1. Run `./cli/dist/bcce doctor` for environment check
2. Check `--help` for any command: `./cli/dist/bcce workflow --help`
3. Review examples in `workflows/starters/`
4. Read [Workflow Schema](../workflow-schema.md) documentation

### Community Support
1. Search existing issues: [GitHub Issues](https://github.com/your-org/bcce/issues)
2. Ask in discussions: [GitHub Discussions](https://github.com/your-org/bcce/discussions)
3. File bug reports with:
   - Output of `./cli/dist/bcce doctor`
   - Workflow file that's failing
   - Full error message
   - Environment details (OS, Node version, etc.)

### Error Reporting Template
```markdown
## Environment
- OS: [e.g., macOS 14.0, Ubuntu 22.04, Windows 11]
- Node version: [run: node --version]
- BCCE version: [run: git rev-parse HEAD]
- AWS Region: [echo $AWS_REGION]

## Problem
[Describe what you're trying to do]

## Error Message
```
[Paste full error output]
```

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc.]

## Doctor Output
```
[Paste output of ./cli/dist/bcce doctor]
```
```

## Preventive Measures

### Regular Maintenance
```bash
# Weekly: Clean old artifacts
find .bcce_runs -type d -mtime +7 -exec rm -rf {} \;

# Monthly: Update dependencies
cd cli && npm update

# Before major work: Verify environment
./cli/dist/bcce doctor
```

### Best Practices
1. Always run `doctor` before starting work
2. Use `--dry-run` before executing workflows
3. Start with small test workflows
4. Keep artifacts for debugging (clean periodically)
5. Version control your workflows
6. Document custom workflows thoroughly
7. Test workflows in development before production