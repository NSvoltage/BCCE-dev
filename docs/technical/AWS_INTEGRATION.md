# BCCE AWS Integration Guide

## Overview

BCCE integrates with AWS services to enable Claude Code usage through Amazon Bedrock. This document details all AWS touchpoints, requirements, and configuration options.

## AWS Service Dependencies

### 1. Amazon Bedrock (Required)

**Purpose**: Provides Claude model inference endpoints

**Requirements**:
- Bedrock enabled in your AWS account
- Claude model access granted (via AWS Console)
- Appropriate service quotas
- Region with Bedrock availability

**IAM Permissions Required**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*:*:foundation-model/anthropic.claude-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:ListFoundationModels",
        "bedrock:GetFoundationModel"
      ],
      "Resource": "*"
    }
  ]
}
```

**Configuration**:
```bash
# Required environment variables
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID="us.anthropic.claude-3-5-sonnet-20250219-v1:0"
export CLAUDE_CODE_USE_BEDROCK=1
```

### 2. AWS Identity and Access Management (IAM)

**Purpose**: Authentication and authorization for Bedrock access

**Supported Authentication Methods**:

#### Option A: IAM User with Access Keys
```bash
aws configure
# Enter Access Key ID
# Enter Secret Access Key
# Enter Region
```

#### Option B: IAM Roles (EC2/ECS/Lambda)
```bash
# Automatic credential discovery via instance metadata
# No configuration needed
```

#### Option C: AWS SSO / Identity Center
```bash
# Configure SSO profile
aws configure sso
# Use profile
export AWS_PROFILE=my-sso-profile
aws sso login
```

#### Option D: Temporary Credentials (STS)
```bash
# Assume role
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/BedrockRole
# Export temporary credentials
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
```

### 3. Amazon S3 (Optional)

**Purpose**: Long-term artifact storage

**Use Cases**:
- Archive workflow runs
- Share artifacts across team
- Compliance retention
- Cost optimization (vs local storage)

**IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bcce-artifacts/*",
        "arn:aws:s3:::bcce-artifacts"
      ]
    }
  ]
}
```

**Configuration** (future feature):
```yaml
# .bcce.config.yaml
artifacts:
  storage: s3
  bucket: bcce-artifacts
  prefix: runs/
  encryption: AES256
  retention_days: 90
```

### 4. AWS KMS (Optional)

**Purpose**: Encryption of artifacts at rest

**Use Cases**:
- Encrypt S3 artifacts
- Encrypt local configuration
- Secure credential storage

**IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:*:key/*"
    }
  ]
}
```

### 5. Amazon CloudWatch (Optional)

**Purpose**: Monitoring and observability

**Metrics Tracked** (planned):
- Workflow execution times
- Step success/failure rates
- Token usage per workflow
- Cost tracking

**IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### 6. AWS Systems Manager Parameter Store (Optional)

**Purpose**: Centralized configuration management

**Use Cases**:
- Store model IDs
- Team workflow templates
- Shared policies
- Environment configuration

**IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/bcce/*"
    }
  ]
}
```

## Network Architecture

### Internet Connectivity (Default)

```
BCCE CLI → Internet → AWS Bedrock API Endpoints
                    ↓
              AWS Public Cloud
```

### VPC Endpoints / PrivateLink (Enterprise)

```
BCCE CLI → VPC Endpoint → AWS Bedrock (Private)
         ↓
    No Internet Required
```

**VPC Endpoint Configuration**:
```bash
# Create VPC endpoint for Bedrock
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-12345678 \
  --service-name com.amazonaws.region.bedrock \
  --route-table-ids rtb-12345678
```

## Regional Considerations

### Model Availability by Region

| Region | Claude 3.5 Sonnet | Claude 3 Opus | Claude 3 Haiku |
|--------|------------------|---------------|----------------|
| us-east-1 | ✅ | ✅ | ✅ |
| us-west-2 | ✅ | ✅ | ✅ |
| eu-west-1 | ✅ | ❌ | ✅ |
| ap-northeast-1 | ✅ | ❌ | ✅ |

**Check Available Models**:
```bash
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query "modelSummaries[?contains(modelId, 'claude')]"
```

### Cross-Region Failover

```yaml
# Future feature: Multi-region configuration
regions:
  primary: us-east-1
  fallback:
    - us-west-2
    - eu-west-1
  strategy: latency  # or 'round-robin', 'cost'
```

## Cost Management

### Bedrock Pricing Model

**Token-Based Pricing**:
- Input tokens: $X per 1000 tokens
- Output tokens: $Y per 1000 tokens
- Varies by model (Sonnet > Opus > Haiku)

**Cost Optimization Strategies**:
1. Use Haiku for simple tasks
2. Set token limits in workflows
3. Cache common responses
4. Batch similar requests

### Cost Tracking

```bash
# Get usage metrics (planned feature)
bcce metrics cost --period 7d

# Example output:
# Model: claude-3-5-sonnet
# Total Tokens: 1,234,567
# Estimated Cost: $12.34
# By Workflow:
#   - code-review: $5.67
#   - bug-hunt: $4.56
#   - docs-gen: $2.11
```

## Security Best Practices

### 1. Least Privilege IAM

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-east-1:*:foundation-model/anthropic.claude-3-5-sonnet-*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Environment": "development"
        }
      }
    }
  ]
}
```

### 2. Resource Tagging

```yaml
# Tag all Bedrock requests
tags:
  Project: BCCE
  Environment: development
  Team: platform
  CostCenter: engineering
```

### 3. Audit Logging

```json
{
  "eventVersion": "1.05",
  "userIdentity": {
    "type": "IAMUser",
    "principalId": "AIDACKCEVSQ6C2EXAMPLE",
    "arn": "arn:aws:iam::123456789012:user/developer"
  },
  "eventTime": "2025-08-13T10:30:45Z",
  "eventSource": "bedrock.amazonaws.com",
  "eventName": "InvokeModel",
  "requestParameters": {
    "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
  }
}
```

### 4. Network Security

```yaml
# Restrict Bedrock access to specific IPs
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "bedrock:*",
      "Resource": "*",
      "Condition": {
        "NotIpAddress": {
          "aws:SourceIp": ["10.0.0.0/8", "172.16.0.0/12"]
        }
      }
    }
  ]
}
```

## Compliance and Governance

### Data Residency

```bash
# Ensure data stays in specific region
export AWS_REGION=us-east-1
export BEDROCK_ENDPOINT=https://bedrock.us-east-1.amazonaws.com

# Disable cross-region requests
export AWS_STS_REGIONAL_ENDPOINTS=regional
```

### Audit Requirements

1. **CloudTrail Integration**:
   - All Bedrock API calls logged
   - Workflow execution events
   - Policy violations

2. **Compliance Tagging**:
   ```yaml
   compliance:
     classification: internal
     data_handling: confidential
     retention: 90days
   ```

3. **Guardrails Integration**:
   ```bash
   # Apply content filtering
   export BEDROCK_GUARDRAIL_ID="arn:aws:bedrock:us-east-1:*:guardrail/abc123"
   ```

## Troubleshooting AWS Issues

### Common Problems and Solutions

#### 1. "Access Denied" Error
```bash
# Check IAM permissions
aws bedrock list-foundation-models

# Verify credentials
aws sts get-caller-identity
```

#### 2. "Model Not Found" Error
```bash
# List available models
aws bedrock list-foundation-models --region us-east-1

# Check model access
aws bedrock get-foundation-model --model-identifier anthropic.claude-3-5-sonnet
```

#### 3. "Throttling" Error
```bash
# Check service quotas
aws service-quotas get-service-quota \
  --service-code bedrock \
  --quota-code L-1234ABCD

# Implement exponential backoff
export BCCE_RETRY_ATTEMPTS=3
export BCCE_RETRY_DELAY=1000
```

#### 4. "Network Timeout" Error
```bash
# Test connectivity
aws bedrock list-foundation-models --debug

# Check VPC endpoints
aws ec2 describe-vpc-endpoints

# Verify DNS resolution
nslookup bedrock.us-east-1.amazonaws.com
```

## AWS Organization Setup

### Multi-Account Strategy

```
Organization Root
├── Security Account (IAM roles, audit)
├── Shared Services (Bedrock, logging)
└── Developer Accounts (BCCE execution)
```

### Cross-Account Access

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT-B:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "bcce-shared-access"
        }
      }
    }
  ]
}
```

## Migration from Direct Anthropic API

### Key Differences

| Aspect | Anthropic API | AWS Bedrock |
|--------|--------------|-------------|
| Authentication | API Key | IAM/STS |
| Endpoint | api.anthropic.com | bedrock.region.amazonaws.com |
| Billing | Credit card | AWS billing |
| Rate Limits | Per API key | Per account/region |
| Model Names | claude-3-sonnet | anthropic.claude-3-5-sonnet-* |

### Migration Steps

1. **Enable Bedrock Access**:
   ```bash
   # Via AWS Console
   # Bedrock → Model access → Request access to Claude models
   ```

2. **Update Environment**:
   ```bash
   # Remove Anthropic API key
   unset ANTHROPIC_API_KEY
   
   # Add AWS configuration
   export AWS_REGION=us-east-1
   export CLAUDE_CODE_USE_BEDROCK=1
   export BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0"
   ```

3. **Test Connectivity**:
   ```bash
   bcce doctor
   ```

## Future AWS Integrations

### Planned Features

1. **AWS Lambda Integration**:
   - Serverless workflow execution
   - Auto-scaling
   - Cost optimization

2. **Amazon SQS/SNS**:
   - Async workflow processing
   - Event notifications
   - Dead letter queues

3. **AWS Batch**:
   - Large-scale parallel workflows
   - Spot instance usage
   - Cost optimization

4. **Amazon ECS/EKS**:
   - Containerized execution
   - Kubernetes operators
   - Horizontal scaling

5. **AWS Step Functions**:
   - Visual workflow design
   - State machine execution
   - Error handling

## Summary

BCCE's AWS integration is designed to be:
- **Secure**: IAM-based authentication, VPC endpoints
- **Scalable**: Multi-region, multi-account support
- **Cost-Effective**: Usage tracking, model selection
- **Compliant**: CloudTrail, tagging, guardrails
- **Flexible**: Multiple auth methods, optional services

The integration leverages AWS's enterprise features while maintaining simplicity for individual developers.