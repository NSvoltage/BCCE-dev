# BCCE Enterprise Model Strategy

## Why Model Flexibility Matters

Enterprise teams need a **future-proof model configuration strategy** that:

1. **Adapts to new releases**: Claude 3.7, Claude 4.0, new Haiku variants, etc.
2. **Works across regions**: Models available vary by AWS region
3. **Supports governance**: Centralized control while maintaining developer productivity
4. **Eliminates hardcoding**: No workflow updates when models change

## ❌ **What We Don't Do (Anti-Patterns)**

### Don't Hardcode Models in Workflows
```yaml
# ❌ BAD - Hardcoded model
model: "anthropic.claude-3-5-sonnet-20241022-v2:0"
```

**Problems:**
- Breaks when new models release
- Requires updating every workflow file
- Developers can't choose optimal models for their use case
- No enterprise governance

### Don't Use "Latest" Without Discovery
```bash
# ❌ BAD - Assumes specific model exists
export BEDROCK_MODEL_ID="anthropic.claude-latest"  # Not a real model ID
```

**Problems:**
- Model IDs don't follow "latest" pattern
- Different regions have different model availability
- No validation that model actually exists

## ✅ **BCCE Enterprise Approach**

### 1. **Environment Variable Architecture**
All workflows use environment variable substitution:

```yaml
# ✅ GOOD - Dynamic model configuration
model: ${BEDROCK_MODEL_ID}
```

**Benefits:**
- Zero workflow updates when models change
- Enterprise control via environment configuration
- Developer flexibility to choose models
- Supports both direct models and inference profiles

### 2. **Discovery-Based Model Selection**

#### Discover Available Models
```bash
# See all Claude models in your region
bcce models list

# Example output:
# 🧠 Claude Sonnet (Balanced performance & cost):
#   anthropic.claude-3-5-sonnet-20241022-v2:0 🔥 LATEST
#   anthropic.claude-3-sonnet-20240229-v1:0
#
# ⚡ Claude Haiku (Fast & lightweight):  
#   anthropic.claude-3-haiku-20240307-v1:0
```

#### Get Recommendations by Use Case
```bash
# For coding tasks
bcce models recommend --use-case coding

# Example output:
# 🥇 RECOMMENDED: anthropic.claude-3-5-sonnet-20241022-v2:0
#    └─ Best for: Code generation, debugging, refactoring
#    └─ Balance: High capability + reasonable cost
```

### 3. **Enterprise Deployment Options**

#### Option A: Direct Model IDs (Simple)
```bash
# Discover latest available model
LATEST_MODEL=$(bcce models list --format ids | grep sonnet | head -1)
export BEDROCK_MODEL_ID="$LATEST_MODEL"

# Add to organization shell profiles
echo "export BEDROCK_MODEL_ID=\"$LATEST_MODEL\"" >> ~/.bashrc
```

**Use When:**
- Getting started quickly
- Small teams
- Direct control over model selection

#### Option B: Inference Profiles (Enterprise)
```bash
# Create organizational inference profile
aws bedrock create-inference-profile \
  --inference-profile-name "claude-coding" \
  --model-source modelId=$(bcce models recommend --use-case coding --format json | jq -r '.recommended.id')

# Set organization-wide
export BEDROCK_MODEL_ID="arn:aws:bedrock:us-east-1:ACCOUNT:inference-profile/claude-coding"
```

**Use When:**
- Large organizations
- Need centralized model governance
- Want automatic model updates
- Cross-region deployments

### 4. **Future-Proof Update Process**

#### When New Models Release (e.g., Claude 4.0)
```bash
# 1. Discover new models
bcce models list
# Shows: anthropic.claude-4-sonnet-20250101-v1:0 🔥 LATEST

# 2. Test new model
export BEDROCK_MODEL_ID="anthropic.claude-4-sonnet-20250101-v1:0"
bcce doctor  # Verify access
bcce workflow validate workflows/starters/test-grader.yml  # Test workflows

# 3. Update organization configuration
# Option A: Update environment variables
# Option B: Update inference profile
aws bedrock update-inference-profile \
  --inference-profile-id "claude-coding" \
  --model-source modelId="anthropic.claude-4-sonnet-20250101-v1:0"

# 4. Zero workflow file changes needed! ✅
```

## Regional Model Availability

### Handle Regional Differences
```bash
# Check what's available in your region
export AWS_REGION=eu-west-1  # or your region
bcce models list

# Get region-specific recommendation
bcce models recommend --use-case coding --region eu-west-1
```

### Multi-Region Strategy
```bash
# Create region-specific profiles
aws bedrock create-inference-profile \
  --inference-profile-name "claude-coding-us" \
  --model-source modelId=$(bcce models list --region us-east-1 --format ids | grep sonnet | head -1)

aws bedrock create-inference-profile \
  --inference-profile-name "claude-coding-eu" \
  --model-source modelId=$(bcce models list --region eu-west-1 --format ids | grep sonnet | head -1)

# Use in CI/CD
if [ "$AWS_REGION" = "us-east-1" ]; then
  export BEDROCK_MODEL_ID="arn:aws:bedrock:us-east-1:ACCOUNT:inference-profile/claude-coding-us"
else
  export BEDROCK_MODEL_ID="arn:aws:bedrock:eu-west-1:ACCOUNT:inference-profile/claude-coding-eu"
fi
```

## Use Case Specific Models

### Coding Tasks
```bash
bcce models recommend --use-case coding
# Recommends: Latest Claude Sonnet (balanced performance)
```

### Analysis & Architecture
```bash
bcce models recommend --use-case analysis  
# Recommends: Claude Opus (maximum reasoning) or latest Sonnet
```

### Fast Operations
```bash
bcce models recommend --use-case general
# May recommend: Claude Haiku for speed + cost efficiency
```

## Enterprise Governance Controls

### 1. **Centralized Model Policy**
```bash
# Organization sets allowed models via inference profiles
# Developers use inference profile ARNs, not direct model IDs
export BEDROCK_MODEL_ID="arn:aws:bedrock:REGION:ACCOUNT:inference-profile/approved-claude"
```

### 2. **Cost Management** 
```bash
# Track usage by inference profile
aws bedrock get-inference-profile-usage \
  --inference-profile-id "claude-coding" \
  --start-date "2024-01-01" \
  --end-date "2024-01-31"
```

### 3. **Access Control**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel"],
    "Resource": [
      "arn:aws:bedrock:*:*:inference-profile/claude-*",
      "arn:aws:bedrock:*:*:foundation-model/anthropic.claude-3-5-sonnet*"
    ]
  }]
}
```

## Migration Examples

### From Hardcoded to Flexible
```bash
# Before (❌ fragile)
# workflows had: model: "anthropic.claude-3-5-sonnet-20241022-v2:0"

# After (✅ robust)
# 1. Update workflows to use: model: ${BEDROCK_MODEL_ID}
# 2. Set environment: export BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0" 
# 3. When new models release, just update the environment variable
```

### From Static to Discovery-Based
```bash
# Old approach - manual updates
echo "export BEDROCK_MODEL_ID='anthropic.claude-3-5-sonnet-20241022-v2:0'" >> ~/.bashrc

# New approach - discovery-based  
RECOMMENDED=$(bcce models recommend --use-case coding --format json | jq -r '.recommended.id')
echo "export BEDROCK_MODEL_ID='$RECOMMENDED'" >> ~/.bashrc
```

## Validation & Testing

### Always Validate Model Configuration
```bash
# After setting BEDROCK_MODEL_ID
bcce doctor  # Checks model availability and access

# Before deploying workflows
bcce workflow validate workflows/starters/test-grader.yml
```

### Test New Models Safely
```bash
# Test in isolated environment
export BEDROCK_MODEL_ID="anthropic.claude-NEW-model"
bcce workflow validate workflows/starters/test-grader.yml
# Only proceed if validation passes
```

## Summary: Enterprise Best Practices

1. **✅ Use `${BEDROCK_MODEL_ID}` in all workflows**
2. **✅ Discover models with `bcce models list`**
3. **✅ Get recommendations with `bcce models recommend`**
4. **✅ Use inference profiles for governance**
5. **✅ Validate with `bcce doctor` after changes**
6. **✅ Test workflows after model updates**
7. **❌ Never hardcode model IDs in workflows**
8. **❌ Never assume specific models exist without checking**

This approach ensures your BCCE deployment stays current with the latest Claude models while maintaining enterprise control and governance.