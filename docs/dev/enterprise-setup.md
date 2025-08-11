# BCCE Enterprise Setup Guide

## Overview
This guide helps enterprise platform teams roll out Claude Code on Amazon Bedrock with BCCE, achieving the target of 80% developer activation within 7 days and <10 minute setup time.

## Prerequisites

### Platform Team Setup
```bash
# Infrastructure requirements
- AWS CLI v2+
- Terraform 1.6+
- Node.js 20+ (for CLI development)
- Go 1.22+ (for utilities)

# Permissions needed
- IAM permission management
- Bedrock service access
- Identity Center OR Cognito management
```

### Developer Workstation Requirements
```bash
# Minimum requirements
- AWS CLI v2+
- Claude Code CLI: npm i -g @anthropic-ai/claude-code
- Git (for workflows)
```

## 1. Initial BCCE Setup

### Clone and Build
```bash
git clone <bcce-repo>
cd bcce
make setup
make build
```

### Initialize Configuration
```bash
./cli/dist/bcce init --auth identity-center --regions us-east-1 --guardrails on --privatelink off
```

**Configuration Options:**
- **Auth Track**: 
  - `identity-center` (Recommended): Uses AWS SSO for seamless enterprise auth
  - `cognito-oidc`: For federated identity or custom OIDC providers
- **Regions**: Comma-separated list of allowed regions
- **Guardrails**: Content filtering (recommended: `on` for enterprise)
- **PrivateLink**: VPC endpoint routing (enterprise security requirement)

## 2. Model Discovery & Configuration

### Step 1: Discover Available Models
```bash
# Set your region
export AWS_REGION=us-east-1

# Discover all Claude models available in your region
./cli/dist/bcce models list

# Get model recommendations for coding use cases
./cli/dist/bcce models recommend --use-case coding
```

### Step 2: Select Your Model Strategy

**🎯 Enterprise Recommended Approach:**

#### Option A: Latest Available Model (Dynamic)
```bash
# Let BCCE automatically detect the latest Sonnet model
./cli/dist/bcce doctor  # Shows recommended model in output

# Set the recommended model (example output will show actual available model)
export BEDROCK_MODEL_ID="<latest-claude-sonnet-from-doctor-output>"
```

#### Option B: Inference Profiles (Best for Governance)
```bash
# Create enterprise inference profile (requires AWS CLI setup)
aws bedrock create-inference-profile \
  --inference-profile-name "claude-latest" \
  --model-source modelId=$(bcce models list --format ids | grep sonnet | head -1)

# Use inference profile (automatically updates with new models)
export BEDROCK_MODEL_ID="arn:aws:bedrock:us-east-1:YOUR-ACCOUNT:inference-profile/claude-latest"
```

#### Option C: Specific Model (Testing/Validation)
```bash
# For specific testing or validation needs
export BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0"  # Example - use actual available model
```

### Step 3: Core Environment Variables
```bash
# Required for Claude Code
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1

# Model selection (set using one of the options above)
export BEDROCK_MODEL_ID="<your-selected-model-or-profile>"
```

### Enterprise Model Strategy
**Why This Approach Works:**

1. **Future-Proof**: No hardcoded models in workflows
2. **Flexible**: Choose latest models, inference profiles, or specific versions
3. **Discoverable**: `bcce models` command shows what's actually available
4. **Governance-Ready**: Inference profiles provide centralized control
5. **Region-Aware**: Works with any region and available models

## 3. Deploy Infrastructure

### Identity Center Track (Recommended)
```bash
# Deploy core infrastructure
./cli/dist/bcce deploy

# Modules deployed:
# - identity-center (Permission Sets)  
# - guardrails (Content filtering)
# - observability (CloudWatch dashboards)
```

### Cognito OIDC Track
```bash
# Deploy Cognito infrastructure
./cli/dist/bcce deploy --module cognito-oidc-sts

# Build credential helpers for distribution
./cli/dist/bcce package --platforms darwin,linux,windows

# Distribute dist/ folder to developers
```

## 4. Developer Onboarding

### Identity Center (SSO) Users
```bash
# 1. Configure AWS SSO
aws configure sso --profile my-org

# 2. Set basic environment
export AWS_PROFILE=my-org
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1

# 3. Discover and set model
bcce models recommend --use-case coding
# Follow the recommendation output to set BEDROCK_MODEL_ID

# 4. Test setup
bcce doctor

# 5. Test Claude Code
claude

# 6. Try a workflow
bcce workflow run workflows/starters/test-grader.yml
```

### Cognito OIDC Users
```bash
# 1. Install credential helpers
chmod +x install.sh && ./install.sh
export PATH=$HOME/.bcce/bin:$PATH

# 2. Configure OIDC
export COGNITO_IDENTITY_POOL_ID=us-east-1:12345678-1234-1234-1234-123456789012
export OIDC_ID_TOKEN=<your-id-token>
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1

# 3. Discover and set model
bcce models recommend --use-case coding
# Follow the recommendation output to set BEDROCK_MODEL_ID

# 4. Test setup  
bcce doctor

# 5. Test Claude Code
claude
```

## 5. Security & Governance

### IAM Policies
Generate baseline policies:
```bash
# Generate policy for current config
bcce policy generate-config > iam-policy.json

# Validate current permissions
bcce policy validate
```

### Guardrails Configuration
```bash
# Deploy guardrails templates
bcce deploy --module guardrails

# Available templates:
# - pii-basic: Social Security numbers, credit cards
# - secrets-default: API keys, passwords, tokens
# - custom: Organization-specific patterns
```

### Monitoring & Observability
```bash
# Deploy CloudWatch dashboard
bcce deploy --module observability

# View in AWS Console:
# CloudWatch > Dashboards > BCCE-Usage-Dashboard
```

## 6. Workflow Management

### Available Starter Workflows
1. **test-grader**: Analyze and improve test coverage
2. **bugfix-loop**: Systematic bug investigation and resolution  
3. **refactor-upgrade**: Code quality improvements and dependency updates
4. **pr-summarizer**: Generate comprehensive pull request summaries

### Custom Workflows
```bash
# Create new workflow
bcce workflow scaffold my-custom-workflow --template agent

# Validate workflow
BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0" bcce workflow validate my-custom-workflow/workflow.yml

# Run workflow
bcce workflow run my-custom-workflow/workflow.yml
```

## 7. Troubleshooting

### Common Issues

**Doctor Failures:**
```bash
# AWS_REGION not set
export AWS_REGION=us-east-1

# SSO expired  
aws sso login --profile my-org

# Claude CLI missing
npm i -g @anthropic-ai/claude-code

# Bedrock access denied
# Check IAM permissions for bedrock:ListFoundationModels
```

**Model Access Issues:**
```bash
# Check available models
aws bedrock list-foundation-models --region us-east-1

# Request model access in AWS Console
# Bedrock > Model access > Manage model access
```

**Workflow Validation Errors:**
```bash
# Always set BEDROCK_MODEL_ID when validating
BEDROCK_MODEL_ID="your-model-id" bcce workflow validate workflow.yml
```

## 8. Enterprise Rollout Strategy

### Phase 1: Pilot (Week 1)
- 5-10 volunteer developers
- Identity Center setup
- Basic workflows (test-grader)
- Gather feedback

### Phase 2: Early Adopters (Week 2-3)
- 50-100 developers  
- All starter workflows
- Custom workflow templates
- Usage monitoring

### Phase 3: Broad Rollout (Week 4+)
- All development teams
- Guardrails enforcement
- PrivateLink (if required)
- Advanced observability

### Success Metrics
- **Activation Rate**: ≥80% of invited devs active within 7 days
- **Time to First Use**: ≤10 minutes from fresh laptop to first Claude Code call
- **Weekly Usage**: ≥3 workflow runs/dev/week by week 4
- **Zero Static Keys**: 100% short-lived credentials

## 9. Model Future-Proofing Strategy

### Dynamic Model Discovery Approach
```bash
# For CI/CD pipelines - use latest available
export BEDROCK_MODEL_ID=$(bcce models list --format ids | grep sonnet | head -1)

# For developer shells - discover and set once
bcce models recommend --use-case coding
# Copy the recommended model ID to your shell profile

# For new model releases:
# 1. Run: bcce models list  # See new models
# 2. Run: bcce models recommend --use-case coding  # Get updated recommendation
# 3. Update BEDROCK_MODEL_ID environment variable
# 4. No workflow file changes needed
```

### Enterprise Governance with Inference Profiles
```bash
# Create enterprise inference profile with latest available model
LATEST_SONNET=$(bcce models list --format ids | grep sonnet | head -1)
aws bedrock create-inference-profile \
  --inference-profile-name "claude-latest" \
  --model-source modelId=$LATEST_SONNET

# Set organization-wide environment variable
export BEDROCK_MODEL_ID=arn:aws:bedrock:us-east-1:ACCOUNT:inference-profile/claude-latest

# Benefits:
# - Centralized model governance
# - Automatic updates by updating inference profile
# - Cross-region failover capability
# - Usage tracking and cost allocation
# - Zero developer workflow changes
```

### Why This Approach Is Superior

1. **No Hardcoded Models**: Workflows use `${BEDROCK_MODEL_ID}` variables
2. **Discovery-Based**: `bcce models` shows what's actually available in your region/account
3. **Recommendation Engine**: Suggests optimal models for specific use cases
4. **Future-Proof**: New Claude models (3.7, 4.0, Haiku variants) automatically detected
5. **Enterprise Control**: Inference profiles provide centralized model management
6. **Zero Breaking Changes**: Environment variable approach never breaks existing workflows

This setup ensures BCCE remains robust as new Claude models are released while providing enterprise teams with the governance and security controls they need.