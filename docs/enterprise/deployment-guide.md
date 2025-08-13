# Enterprise Deployment Guide

## Overview

This guide covers deploying BCCE in enterprise environments with proper security, scalability, and compliance considerations.

## Prerequisites

### AWS Account Requirements
- AWS Account with Bedrock enabled in target regions
- Organization-level AWS account preferred for enterprise features
- AWS Identity Center (SSO) configured (recommended)
- CloudTrail logging enabled
- Config rules and conformance packs configured

### Permissions Required
Administrator will need these permissions during setup:
- `BedrockFullAccess` (temporary, for model access setup)
- `IAMFullAccess` (for role and policy creation)
- `VPCFullAccess` (for network setup)
- `CloudWatchFullAccess` (for monitoring)
- Access to deploy CloudFormation/Terraform

### Infrastructure Prerequisites
- VPC with private subnets (for PrivateLink deployment)
- NAT Gateway or Instance (for internet access from private subnets)
- Corporate DNS resolution configured
- Enterprise certificate authority (if using custom certificates)

## Architecture Decisions

### Deployment Pattern Selection

#### Option 1: Single Account (Small Teams < 50 users)
```
Production AWS Account
├── BCCE Infrastructure (Terraform)
├── Bedrock Models & Guardrails
├── Identity Center Integration
└── CloudWatch Monitoring
```

#### Option 2: Multi-Account (Enterprise Scale)
```
Management Account (Identity Center)
├── Development Account
│   ├── BCCE Dev Environment
│   └── Test Workflows
├── Staging Account  
│   ├── BCCE Staging
│   └── Pre-prod Validation
└── Production Account
    ├── BCCE Production
    └── Production Workflows
```

### Network Architecture

#### Standard Deployment
```
Internet Gateway
├── Public Subnets (NAT Gateway)
└── Private Subnets
    ├── BCCE CLI (workstations)
    ├── Container Runtime (ECS/EKS)
    └── VPC Endpoints (Bedrock, SSM)
```

#### High-Security Deployment
```
Corporate Network
├── VPN/DirectConnect
└── Private VPC
    ├── BCCE Infrastructure
    ├── PrivateLink Endpoints
    └── No Internet Access
```

## Deployment Steps

### Phase 1: Infrastructure Deployment (30 minutes)

#### 1.1 Deploy Core Infrastructure
```bash
# Clone infrastructure repository
git clone https://github.com/aws-samples/guidance-for-claude-code-with-amazon-bedrock.git
cd guidance-for-claude-code-with-amazon-bedrock

# Configure deployment
export AWS_REGION="us-east-1"
export ENVIRONMENT="prod"
export VPC_ID="vpc-12345678"

# Deploy with Terraform
cd terraform/examples/enterprise
terraform init
terraform plan -var="environment=${ENVIRONMENT}"
terraform apply
```

#### 1.2 Configure Identity Center Integration
```bash
# Get Identity Center Instance ARN
aws sso-admin list-instances

# Create BCCE permission set
aws sso-admin create-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-12345678 \
  --name BCCEUsers \
  --description "BCCE Workflow Users"

# Attach managed policy
aws sso-admin attach-managed-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-12345678 \
  --permission-set-arn arn:aws:sso:::permissionSet/ps-12345678 \
  --managed-policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
```

#### 1.3 Enable Model Access
```bash
# Request model access (may require approval)
aws bedrock put-model-invocation-logging-configuration \
  --logging-config cloudWatchConfig='{logGroupName=/aws/bedrock/modelinvocations,roleArn=arn:aws:iam::123456789012:role/BedrockLoggingRole}'

# List available models
aws bedrock list-foundation-models --region $AWS_REGION
```

### Phase 2: BCCE Installation (10 minutes)

#### 2.1 Install BCCE CLI
```bash
# Method 1: NPM Global Install (Development)
npm install -g @your-org/bcce

# Method 2: Container Image (Production)
docker pull your-org/bcce:latest

# Method 3: Binary Release (CI/CD)
curl -L -o bcce https://github.com/your-org/bcce/releases/latest/download/bcce-linux-x64
chmod +x bcce
sudo mv bcce /usr/local/bin/
```

#### 2.2 Initialize Configuration
```bash
# For Identity Center (Recommended)
bcce init --auth identity-center \
  --region $AWS_REGION \
  --guardrails enabled \
  --environment production

# Verify configuration
bcce doctor
```

### Phase 3: Security Hardening (20 minutes)

#### 3.1 Configure Guardrails
```bash
# Enable content filtering
aws bedrock create-guardrail \
  --name enterprise-content-filter \
  --blocked-input-messaging "Content blocked by enterprise policy" \
  --blocked-outputs-messaging "Response blocked by enterprise policy" \
  --content-policy-config '{
    "filtersConfig": [
      {
        "type": "SEXUAL",
        "inputStrength": "HIGH",
        "outputStrength": "HIGH"
      },
      {
        "type": "VIOLENCE",
        "inputStrength": "HIGH", 
        "outputStrength": "HIGH"
      },
      {
        "type": "HATE",
        "inputStrength": "HIGH",
        "outputStrength": "HIGH"
      },
      {
        "type": "INSULTS",
        "inputStrength": "MEDIUM",
        "outputStrength": "MEDIUM"
      },
      {
        "type": "MISCONDUCT",
        "inputStrength": "HIGH",
        "outputStrength": "HIGH"
      }
    ]
  }'
```

#### 3.2 Setup VPC Endpoints (for private deployments)
```bash
# Bedrock Runtime endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id $VPC_ID \
  --service-name com.amazonaws.$AWS_REGION.bedrock-runtime \
  --route-table-ids rtb-12345678

# Systems Manager endpoint (for credentials)
aws ec2 create-vpc-endpoint \
  --vpc-id $VPC_ID \
  --service-name com.amazonaws.$AWS_REGION.ssm \
  --subnet-ids subnet-12345678
```

#### 3.3 Configure Monitoring
```bash
# Enable CloudTrail for API auditing
aws cloudtrail create-trail \
  --name bcce-api-audit \
  --s3-bucket-name your-audit-bucket \
  --include-global-service-events \
  --is-multi-region-trail

# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name BCCE-Monitoring \
  --dashboard-body file://monitoring-dashboard.json
```

## Enterprise Configuration

### Multi-Environment Setup

#### Development Environment
```yaml
# dev.bcce.yaml
environment: development
aws:
  region: us-east-1
  account_id: "111111111111"
security:
  guardrails: ["dev-content-filter"]
  max_runtime: 3600
policies:
  default_agent_policy:
    timeout_seconds: 1200
    max_files: 100
    max_edits: 50
    allowed_paths: ["**"]
    cmd_allowlist: ["npm", "yarn", "jest", "eslint"]
```

#### Production Environment  
```yaml
# prod.bcce.yaml
environment: production
aws:
  region: us-east-1
  account_id: "333333333333"
security:
  guardrails: ["enterprise-content-filter", "pii-detection"]
  max_runtime: 1800
policies:
  default_agent_policy:
    timeout_seconds: 300
    max_files: 20
    max_edits: 5
    allowed_paths: ["src/**", "test/**"]
    cmd_allowlist: ["npm"]
```

### Role-Based Access Control

#### Security Team Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bcce:ViewPolicies",
        "bcce:CreatePolicies",
        "bcce:ViewAuditLogs"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Developer Role
```json
{
  "Version": "2012-10-17", 
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bcce:RunWorkflow",
        "bcce:ViewArtifacts"
      ],
      "Resource": "arn:aws:bcce:*:*:workflow/dev-*"
    }
  ]
}
```

### Policy Templates by Risk Level

#### Low Risk (Documentation, Analysis)
```yaml
policy_templates:
  low_risk:
    timeout_seconds: 600
    max_files: 100
    max_edits: 0  # Read-only
    allowed_paths: ["**"]
    cmd_allowlist: []
    guardrails: ["basic-content-filter"]
```

#### Medium Risk (Development Tasks)
```yaml
policy_templates:
  medium_risk:
    timeout_seconds: 900
    max_files: 50
    max_edits: 15
    allowed_paths: ["src/**", "test/**", "docs/**"]
    cmd_allowlist: ["npm", "yarn", "jest", "eslint"]
    guardrails: ["enterprise-content-filter"]
```

#### High Risk (Production Changes)
```yaml
policy_templates:
  high_risk:
    timeout_seconds: 300
    max_files: 10
    max_edits: 3
    allowed_paths: ["src/critical/**"]
    cmd_allowlist: []
    guardrails: ["enterprise-content-filter", "pii-detection"]
    approval_required: true
    security_review: true
```

## Compliance Configuration

### Audit Logging
```bash
# Enable comprehensive audit logging
export BCCE_AUDIT_LEVEL=FULL
export BCCE_AUDIT_DESTINATION=cloudwatch://bcce-audit-logs

# Configure log retention
aws logs put-retention-policy \
  --log-group-name /aws/bcce/audit \
  --retention-in-days 2555  # 7 years for compliance
```

### Data Residency
```yaml
# Region-specific deployment
data_governance:
  primary_region: us-east-1
  data_residency: us-only
  cross_border_transfer: false
  artifact_retention: 90d
  artifact_encryption: aws-managed
```

### SOC2 Compliance Template
```yaml
soc2_controls:
  cc6.1_logical_access:
    identity_provider: aws-identity-center
    mfa_required: true
    session_timeout: 8h
  cc6.2_authentication:
    password_policy: corporate-standard
    privileged_access: break-glass-only
  cc6.3_authorization:
    rbac_enabled: true
    least_privilege: enforced
```

## Operational Procedures

### Backup and Recovery
```bash
# Backup configuration
aws s3 sync .bcce_config s3://your-backup-bucket/bcce-config/
aws s3 sync .bcce_runs s3://your-backup-bucket/bcce-artifacts/

# Disaster recovery validation
bcce doctor --compliance-check
```

### Capacity Planning
```yaml
capacity_planning:
  concurrent_users: 100
  workflows_per_day: 1000
  artifact_storage_gb: 500
  estimated_monthly_cost_usd: 2500
```

### Update Procedures
```bash
# Staged rollout procedure
# 1. Update development environment
bcce version # Record current version
npm update -g @your-org/bcce
bcce doctor # Validate

# 2. Validate with test workflows
bcce workflow validate workflows/starters/*.yml

# 3. Update staging environment
# 4. Production deployment (during maintenance window)
```

## Troubleshooting Enterprise Issues

### Identity Center Integration Issues
```bash
# Debug SSO configuration
aws sso-admin describe-instance --instance-arn $INSTANCE_ARN
aws sso-admin list-permission-sets --instance-arn $INSTANCE_ARN

# Test authentication flow
aws sso login --profile bcce-prod
bcce doctor --auth-check
```

### Network Connectivity Issues
```bash
# Test VPC endpoints
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids vpce-12345678
nslookup bedrock-runtime.us-east-1.amazonaws.com

# Test private network access
bcce doctor --network-check
```

### Performance Optimization
```bash
# Monitor resource usage
aws logs filter-log-events \
  --log-group-name /aws/bcce/performance \
  --filter-pattern "TIMEOUT"

# Optimize policies
bcce analyze-policy-usage --report monthly
```

## Security Incident Response

### Incident Classification
1. **P1**: Credential exposure, policy bypass
2. **P2**: Unauthorized workflow execution
3. **P3**: Performance degradation
4. **P4**: Configuration issues

### Response Procedures
```bash
# Emergency shutdown
bcce emergency-stop --all-workflows
aws bedrock put-model-invocation-logging-configuration --disable

# Forensics
aws logs export-task \
  --log-group-name /aws/bcce/audit \
  --from-time $(date -d "1 hour ago" +%s)000
```

This enterprise deployment guide provides a comprehensive foundation for deploying BCCE in production environments with proper security, compliance, and operational considerations.