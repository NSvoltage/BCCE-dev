# ROAST Principles for Developer Teams

## What is ROAST?

ROAST (Reproducible, Observable, Auditable, Secure, Testable) is a set of principles originally developed by Shopify for reliable AI workflows. BCCE adapts these principles for AWS Bedrock and enterprise Claude Code deployments.

## Why ROAST Matters for Your Team

### The Problem: Unreliable AI Workflows
```bash
# Traditional approach - fragile and unpredictable
claude "fix my tests" --input src/  # Works sometimes, fails randomly
# No artifacts, no resume capability, no audit trail
```

### The Solution: ROAST-Compliant Workflows
```bash
# BCCE approach - reliable and auditable
bcce workflow run workflows/starters/test-grader.yml
# Creates .bcce_runs/RUN_ID/ artifacts
# Resume with: bcce workflow resume RUN_ID --from step_3
```

## The Five ROAST Principles

### 1. **Reproducible** 
**Goal**: Same inputs produce identical outputs across runs

#### How BCCE Implements This:
```yaml
# workflow.yml
env:
  seed: 42                    # Deterministic model sampling
  artifacts_dir: .bcce_runs/${RUN_ID}  # Isolated execution context

steps:
  - id: analyze_code
    type: agent
    policy:
      timeout_seconds: 300    # Predictable resource limits
```

#### Developer Benefits:
- **Debugging**: Re-run exact same conditions to isolate issues
- **CI/CD**: Predictable build outcomes in automated pipelines
- **Team Collaboration**: Share artifacts and reproduce teammate's results

### 2. **Observable**
**Goal**: Clear visibility into what's happening and why

#### How BCCE Implements This:
```bash
🩺 BCCE Doctor Report

✅ AWS_REGION: Set to: us-east-1
✅ Claude CLI: Found: 1.0.77 (Claude Code)  
❌ Bedrock DNS: Failed to resolve bedrock-runtime.us-east-1.amazonaws.com
   Fix: Check internet connectivity and DNS settings

❌ Critical issues found. Please fix the above failures.
```

#### Developer Benefits:
- **Quick Diagnosis**: Understand environment issues at a glance
- **Status Awareness**: Know exactly what's working and what's not
- **Progress Tracking**: See workflow execution progress in real-time

### 3. **Auditable**
**Goal**: Every failure has a clear path to resolution

#### How BCCE Implements This:
```bash
# Every failure MUST include a Fix: line
❌ AWS_REGION: AWS_REGION environment variable not set
   Fix: export AWS_REGION=us-east-1

❌ Claude CLI: Not found in PATH  
   Fix: npm install -g @anthropic-ai/claude-code
```

#### Developer Benefits:
- **Self-Service**: Copy-paste commands to fix issues independently
- **Security Compliance**: Complete remediation trails for auditors
- **Onboarding**: New team members can resolve setup issues without help

### 4. **Secure**
**Goal**: Safe execution with proper isolation and access controls

#### How BCCE Implements This:
```yaml
# Workflow security controls
policy:
  timeout_seconds: 600              # Resource limits
  max_files: 50                     # File access limits  
  max_edits: 10                     # Change limits
  allowed_paths: ["src/**", "test/**"]  # Path restrictions
  cmd_allowlist: ["npm", "pytest", "go"]   # Command restrictions

guardrails: ["pii-basic", "secrets-default"]  # AWS Bedrock content filtering
```

#### Developer Benefits:
- **Safe Experimentation**: Try AI workflows without fear of system damage
- **Credential Protection**: No static keys or secrets in workflow definitions
- **Compliance**: Built-in PII and secrets filtering via AWS Guardrails

### 5. **Testable** 
**Goal**: Workflows work reliably across different environments

#### How BCCE Implements This:
```bash
# Cross-platform compatibility
bcce doctor  # Works on macOS, Linux, Windows
             # Works in containers, CI systems, air-gapped networks
             # Works with corporate proxies and restricted PATH
```

#### Developer Benefits:
- **Environment Agnostic**: Same workflow runs on laptop, CI, and production
- **Confidence**: Know that local testing predicts production behavior  
- **Reduced Friction**: Less time debugging environment-specific issues

## Practical ROAST in Daily Development

### Morning Routine: Environment Check
```bash
# Start each day with ROAST observability
bcce doctor
# Clear green ✅ means ready to work
# Any ❌ gets copy-paste fix commands
```

### Feature Development: Test-Driven AI
```bash
# Use ROAST auditability for systematic improvement
bcce workflow run test-grader.yml
# Artifacts in .bcce_runs/latest/ show exactly what was analyzed
# Resume from any step if interrupted
```

### Code Review: Reproducible Analysis  
```bash
# Share exact workflow conditions with reviewers
bcce workflow run pr-summarizer.yml --seed 42
# Reviewers can reproduce identical analysis
```

### Debugging: Observable Execution
```bash
# When workflows fail, inspect artifacts
ls .bcce_runs/RUN_ID/step_3/
cat .bcce_runs/RUN_ID/step_3/transcript.md
# See exactly what the AI agent was thinking
```

## ROAST vs Traditional Approaches

| Aspect | Traditional AI Tools | ROAST-Compliant BCCE |
|--------|---------------------|----------------------|
| **Reproducibility** | "Works on my machine" | Identical results with seed control |
| **Debugging** | Black box failures | Step-by-step artifacts and transcripts |
| **Security** | Ad-hoc restrictions | Explicit allowlists and Guardrails |
| **Team Sharing** | Copy-paste prompts | Versioned workflow definitions |
| **Enterprise Ready** | Individual usage | Audit trails and compliance controls |

## Getting Started with ROAST

### 1. Validate Your Environment
```bash
bcce doctor
# Fix any ❌ issues using provided commands
```

### 2. Run Your First ROAST Workflow
```bash
bcce workflow validate workflows/starters/test-grader.yml
bcce workflow run workflows/starters/test-grader.yml
```

### 3. Inspect the Results
```bash
ls .bcce_runs/  # See all execution runs
cat .bcce_runs/latest/step_1/output.json  # Inspect step outputs
```

### 4. Resume from Failures
```bash
# If workflow fails at step 3, resume from there
bcce workflow resume RUN_ID --from step_3
```

## Best Practices

### ✅ DO: Embrace ROAST Principles
- Always use `bcce doctor` before important work
- Include `seed` values for reproducible experiments  
- Keep workflow files in version control
- Inspect artifacts when debugging issues

### ❌ DON'T: Bypass ROAST Safety  
- Don't disable security policies without good reason
- Don't ignore ❌ failures in doctor output
- Don't hardcode credentials in workflow files
- Don't skip workflow schema validation

## Next Steps

- **Learn More**: Read [ROAST Evolution](../ROAST-EVOLUTION.md) for architectural deep-dive
- **Advanced Usage**: See [Admin Guide](../admin/) for enterprise deployment patterns
- **Troubleshooting**: Check [Common Issues](../troubleshooting/) for ROAST-specific debugging