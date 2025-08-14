# BCCE Project Overview - Complete Context for Claude Code

## Executive Summary

**BCCE (Bedrock Claude Code Enablement Kit)** is a structured workflow orchestration framework that transforms ad-hoc Claude Code CLI usage into secure, auditable, and reproducible enterprise workflows when using AWS Bedrock as the model provider.

## The Problem BCCE Solves

### Current State (Without BCCE)
Developers using Claude Code with AWS Bedrock face several challenges:
1. **Unstructured Usage**: Developers run Claude Code commands manually with no standardization
2. **Security Concerns**: No enforcement of file access limits, command restrictions, or timeout controls
3. **No Audit Trail**: Commands and outputs are ephemeral, making compliance and debugging difficult
4. **No Reproducibility**: Each developer uses Claude differently, leading to inconsistent results
5. **Manual Configuration**: Each developer must configure AWS credentials, Bedrock settings, and model IDs individually

### Desired State (With BCCE)
BCCE provides:
1. **Structured Workflows**: YAML-defined, version-controlled workflows that standardize AI usage
2. **Policy Enforcement**: Explicit security constraints on file access, commands, and execution time
3. **Complete Artifacts**: All interactions stored in timestamped directories for audit and resume
4. **Team Standardization**: Shared workflows ensure consistent AI assistance across the team
5. **Simplified Setup**: Centralized configuration with environment variables and health checks

## How BCCE Fits Into the AWS Ecosystem

### Architecture Layers

```
┌─────────────────────────────────────────┐
│         Developer Workstation           │
├─────────────────────────────────────────┤
│            BCCE CLI Layer               │
│  (Workflow orchestration & policies)    │
├─────────────────────────────────────────┤
│         Claude Code CLI                 │
│   (AI interaction & tool execution)     │
├─────────────────────────────────────────┤
│      AWS Bedrock Claude Models          │
│  (Model inference via AWS credentials)  │
└─────────────────────────────────────────┘
```

### Integration Points

1. **Claude Code CLI Integration**
   - BCCE spawns Claude Code as a subprocess
   - Passes `CLAUDE_CODE_USE_BEDROCK=1` to enable Bedrock mode
   - Provides `BEDROCK_MODEL_ID` for model selection
   - Captures all stdout/stderr for artifact storage

2. **AWS Bedrock Configuration**
   - Requires AWS credentials (IAM, SSO, or STS tokens)
   - Uses standard AWS SDK credential chain
   - Supports all Bedrock-available Claude models
   - Compatible with AWS PrivateLink and VPC endpoints

3. **Enterprise Features**
   - IAM policy generation for least-privilege access
   - CloudWatch integration for monitoring (planned)
   - S3 artifact storage with KMS encryption (optional)
   - AWS Organizations support for multi-account setups

## Core Design Principles

### 1. Workflow-First Philosophy
**Principle**: All AI interactions should be defined as workflows, not ad-hoc commands.
**Implementation**: YAML schema with steps, policies, and constraints.
**Rationale**: Ensures governance, reproducibility, and team alignment.

### 2. Security by Default
**Principle**: Every AI step must have explicit security policies.
**Implementation**: Mandatory policy blocks with timeout, file limits, and command restrictions.
**Rationale**: Prevents runaway AI processes and limits potential damage.

### 3. Complete Observability
**Principle**: Every AI interaction must be recorded and retrievable.
**Implementation**: Artifact directories with transcripts, policies, and outputs.
**Rationale**: Enables debugging, compliance audits, and workflow resumption.

### 4. Model Agnostic
**Principle**: Workflows should work with any Claude model without modification.
**Implementation**: `${BEDROCK_MODEL_ID}` environment variable substitution.
**Rationale**: Future-proofs workflows as new models are released.

## Technical Architecture

### Component Overview

```
bcce/
├── cli/                    # TypeScript CLI application
│   ├── src/
│   │   ├── commands/       # CLI command implementations
│   │   │   ├── doctor/     # Environment health checks
│   │   │   ├── workflow/   # Workflow validation & execution
│   │   │   ├── init/       # Configuration initialization
│   │   │   └── models/     # Model discovery & listing
│   │   └── lib/
│   │       └── workflow-runner.ts  # Core execution engine
│   └── dist/               # Compiled JavaScript output
│
├── workflows/              # Example workflow templates
│   └── starters/          # Production-ready starter workflows
│
├── docs/                   # Documentation
│   ├── ARCHITECTURE_OVERVIEW.md
│   ├── EXTENSIBILITY_ARCHITECTURE.md
│   └── troubleshooting/
│
└── .bcce_runs/            # Runtime artifacts (gitignored)
    └── <timestamp-runid>/  # Per-run directory
        └── <step-id>/      # Per-step artifacts
            ├── transcript.md
            ├── policy.json
            └── output.txt
```

### Key Implementation Details

#### 1. Workflow Execution Flow
```typescript
// Simplified execution logic from workflow-runner.ts
async executeAgentStep(step) {
  // 1. Validate policy constraints
  validatePolicy(step.policy);
  
  // 2. Build secure environment
  const env = {
    ...process.env,
    CLAUDE_CODE_USE_BEDROCK: '1',
    BEDROCK_MODEL_ID: step.model || process.env.BEDROCK_MODEL_ID,
    AWS_REGION: process.env.AWS_REGION
  };
  
  // 3. Spawn Claude Code subprocess
  const claudeProcess = spawn('claude', ['--print', prompt], { env });
  
  // 4. Enforce timeout
  setTimeout(() => claudeProcess.kill('SIGTERM'), step.policy.timeout_seconds * 1000);
  
  // 5. Capture and store artifacts
  claudeProcess.stdout.on('data', data => {
    transcript += data;
    artifacts.writeStepOutput(step.id, 'transcript.md', transcript);
  });
}
```

#### 2. Policy Enforcement
```yaml
# Example policy block
policy:
  timeout_seconds: 300      # Kill process after 5 minutes
  max_files: 30             # Limit file reads to 30
  max_edits: 5              # Limit file modifications to 5
  allowed_paths:            # Restrict file access
    - "src/**"
    - "test/**"
  cmd_allowlist:            # Only allow specific commands
    - "npm"
    - "git"
```

#### 3. Apply Diff Implementation
The `apply_diff` step type can apply code changes suggested by Claude:
- Parses diff blocks from agent transcripts
- Validates changes against security policies
- Creates backups before applying
- Supports rollback on failure

### State Management

BCCE maintains workflow state in `run-state.json`:
```json
{
  "runId": "2025-08-13T10-30-45-abc123",
  "workflow": { /* workflow definition */ },
  "currentStepIndex": 2,
  "status": "running",
  "stepResults": [
    {
      "stepId": "analyze_code",
      "status": "completed",
      "exitCode": 0,
      "output": "Analysis complete"
    }
  ]
}
```

This enables workflow resumption after failures:
```bash
bcce workflow resume <runId> --from <stepId>
```

## Relationship to AWS Bedrock

### Direct Integration
- BCCE does NOT replace Claude Code CLI
- BCCE orchestrates Claude Code CLI with AWS Bedrock
- All model inference happens through AWS Bedrock APIs
- Billing and quotas are managed by AWS Bedrock

### Required AWS Resources
1. **Bedrock Model Access**: Must have Claude models enabled in your AWS account
2. **IAM Permissions**: Requires `bedrock:InvokeModel` permissions
3. **AWS Credentials**: Via IAM users, roles, or SSO
4. **Network**: Internet access or VPC endpoints for Bedrock

### Cost Implications
- All Claude model usage is billed through AWS Bedrock
- Costs depend on selected model and token usage
- BCCE itself has no usage costs (open source)
- Artifact storage in S3 incurs standard AWS storage costs (if enabled)

## Use Cases and Benefits

### Primary Use Cases
1. **Code Review Automation**: Standardized code review workflows
2. **Bug Investigation**: Systematic debugging with constraints
3. **Documentation Generation**: Consistent documentation creation
4. **Test Generation**: Automated test suite creation
5. **Refactoring**: Safe, controlled code improvements

### Key Benefits
1. **Governance**: IT can define and enforce AI usage policies
2. **Compliance**: Complete audit trails for regulatory requirements
3. **Consistency**: Team-wide standardization of AI workflows
4. **Safety**: Prevents runaway processes and limits damage potential
5. **Efficiency**: Resume interrupted workflows instead of restarting

## Current Limitations

### Technical Limitations
1. **CLI Only**: No web UI (intentional - follows Unix philosophy)
2. **Bedrock Specific**: Only works with AWS Bedrock, not Anthropic API
3. **Serial Execution**: Steps run sequentially, no parallel execution
4. **Local Artifacts**: No built-in cloud storage (S3 integration planned)

### Operational Limitations
1. **Requires Claude Code CLI**: Must be installed separately
2. **AWS Account Required**: Cannot work without AWS credentials
3. **Model Availability**: Limited to models available in your AWS region
4. **No Real-time Streaming**: Batch output only, no streaming responses

## Future Roadmap

### Near Term (1-3 months)
- S3 artifact storage with KMS encryption
- CloudWatch metrics integration
- Parallel step execution
- Web UI for artifact viewing

### Medium Term (3-6 months)
- GitHub Actions integration
- Custom step type plugins
- Distributed execution
- Cost tracking and budgets

### Long Term (6-12 months)
- Multi-model support (non-Claude models)
- Workflow marketplace
- Enterprise control plane
- Advanced policy languages

## Getting Started

### Minimum Requirements
```bash
# Environment setup
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1
export BEDROCK_MODEL_ID="us.anthropic.claude-3-5-sonnet-20250219-v1:0"

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Build BCCE
cd cli && npm install && npm run build

# Verify setup
./dist/bcce doctor

# Run first workflow
./dist/bcce workflow run workflows/starters/test-grader.yml
```

## For Claude Code Instances

If you are a Claude Code instance examining this codebase:

1. **Primary Purpose**: Enable structured, secure AI workflows for enterprise teams using AWS Bedrock
2. **Your Role**: You would be invoked via the Claude Code CLI with specific constraints
3. **Key Constraints**: File access limits, command restrictions, timeout enforcement
4. **Output Expectations**: Your responses are captured in transcript.md for audit
5. **Integration Point**: You interact through Claude Code CLI, not directly with BCCE
6. **Model Selection**: Determined by BEDROCK_MODEL_ID environment variable
7. **Security Context**: Running in a sandboxed environment with explicit policies

## Summary

BCCE is the **orchestration and governance layer** that sits between developers and Claude Code when using AWS Bedrock. It transforms chaotic, ad-hoc AI usage into structured, secure, auditable workflows that enterprises can trust and scale. Think of it as "Infrastructure as Code" but for AI workflows - bringing the same rigor to AI usage that Terraform brought to cloud infrastructure.