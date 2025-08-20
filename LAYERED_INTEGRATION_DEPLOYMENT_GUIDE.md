# BCCE + AWS Solutions Library Layered Integration Deployment Guide

## 🎯 Complete Implementation of the Recommended Architecture

This guide provides step-by-step instructions for deploying the **layered integration approach** that combines AWS Solutions Library authentication with BCCE enterprise governance, as outlined in the `AWS_SOLUTIONS_INTEGRATION_STRATEGY.md`.

---

## 📋 Prerequisites

### Required Tools
- **AWS CLI** (v2.x) with administrative credentials
- **Terraform** (>= 1.0)
- **Python 3.8+** with boto3
- **Git** for repository management
- **jq** for JSON processing (optional but recommended)

### AWS Permissions
Your AWS credentials must have permissions for:
- AWS Organizations (if setting up multi-account)
- IAM roles and policies
- Cognito User Pools
- S3 buckets and KMS keys
- AWS Budgets
- CloudWatch dashboards and alarms
- Lambda functions

### Organization Setup
- AWS Organization configured (or single account for testing)
- Domain email addresses for notifications
- Enterprise identity provider details (Okta/Azure AD/etc.)

---

## 🚀 Phase 1: Deploy AWS Solutions Library Foundation

### Option A: New Solutions Library Deployment

```bash
# Clone the AWS Solutions Library
git clone https://github.com/aws-solutions-library-samples/guidance-for-claude-code-with-amazon-bedrock.git
cd guidance-for-claude-code-with-amazon-bedrock

# Configure your organization settings
export ORGANIZATION_NAME="YourCompany"
export AWS_REGION="us-east-1"

# Deploy the Solutions Library CloudFormation stack
aws cloudformation create-stack \
  --stack-name claude-code-bedrock-guidance \
  --template-body file://cloudformation/main.yaml \
  --parameters ParameterKey=OrganizationName,ParameterValue="$ORGANIZATION_NAME" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION"

# Wait for deployment to complete
aws cloudformation wait stack-create-complete \
  --stack-name claude-code-bedrock-guidance \
  --region "$AWS_REGION"
```

### Option B: Use Existing Solutions Library Deployment

If you already have AWS Solutions Library deployed:

```bash
# Set flag to skip Solutions Library deployment
export SOLUTIONS_LIBRARY_DEPLOYED=true

# Verify existing deployment
aws cognito-idp list-user-pools --max-results 50 --region "$AWS_REGION" | \
  jq '.UserPools[] | select(.Name | contains("claude"))'
```

---

## 🏗️ Phase 2: Deploy BCCE Governance Layer

### 1. Navigate to Enterprise Directory

```bash
cd /path/to/bcce-dev/enterprise
```

### 2. Configure Deployment Variables

```bash
# Set your organization details
export ORGANIZATION_NAME="YourCompany"
export AWS_REGION="us-east-1"
export ENVIRONMENT="production"

# Indicate if Solutions Library is already deployed
export SOLUTIONS_LIBRARY_DEPLOYED="true"  # or "false"
```

### 3. Deploy Using Automated Script

```bash
# Run the complete deployment
./deploy-layered-integration.sh \
  --organization-name "$ORGANIZATION_NAME" \
  --region "$AWS_REGION" \
  --environment "$ENVIRONMENT"
```

### 4. Manual Terraform Deployment (Alternative)

```bash
# Initialize Terraform
terraform init

# Create configuration file
cat > terraform.tfvars <<EOF
organization_name = "$ORGANIZATION_NAME"
aws_solutions_library_deployed = true

departments = {
  engineering = {
    budget_limit = 10000
    access_tiers = ["sandbox", "integration", "production"]
    manager_email = "engineering-manager@${ORGANIZATION_NAME,,}.com"
  }
  product = {
    budget_limit = 5000
    access_tiers = ["sandbox", "integration"]
    manager_email = "product-manager@${ORGANIZATION_NAME,,}.com"
  }
  data_science = {
    budget_limit = 15000
    access_tiers = ["sandbox", "integration", "production"]
    manager_email = "data-science-manager@${ORGANIZATION_NAME,,}.com"
  }
}
EOF

# Deploy BCCE governance layer
terraform plan -out=bcce-governance.tfplan
terraform apply bcce-governance.tfplan
```

---

## 🧪 Phase 3: Validate Integration

### 1. Run Integration Tests

```bash
# Run comprehensive integration tests
./test-layered-integration.py --verbose

# Check test results
cat /tmp/bcce-integration-test-report.json | jq '.test_summary'
```

### 2. Verify Infrastructure Components

```bash
# Check Cognito User Pool with BCCE attributes
aws cognito-idp describe-user-pool \
  --user-pool-id $(terraform output -raw cognito_integration | jq -r '.user_pool_id') \
  --region "$AWS_REGION"

# Verify BCCE analytics bucket
aws s3 ls s3://$(terraform output -raw bcce_governance_resources | jq -r '.analytics_bucket')

# Check department budgets
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

### 3. Test Configuration Generation

```bash
# Verify configuration files were created
ls -la ../config/
cat ../config/bcce-unified-config.yaml
```

---

## 👥 Phase 4: Onboard Pilot Users

### 1. Configure Enterprise Identity Provider

**For Okta:**
```bash
# Configure Cognito identity provider
aws cognito-idp create-identity-provider \
  --user-pool-id YOUR_USER_POOL_ID \
  --provider-name Okta \
  --provider-type OIDC \
  --provider-details '{
    "client_id": "your-okta-client-id",
    "client_secret": "your-okta-client-secret",
    "authorize_scopes": "openid email profile",
    "oidc_issuer": "https://your-org.okta.com"
  }'
```

**For Azure AD:**
```bash
# Configure Azure AD identity provider
aws cognito-idp create-identity-provider \
  --user-pool-id YOUR_USER_POOL_ID \
  --provider-name AzureAD \
  --provider-type OIDC \
  --provider-details '{
    "client_id": "your-azure-client-id",
    "client_secret": "your-azure-client-secret",
    "authorize_scopes": "openid email profile",
    "oidc_issuer": "https://login.microsoftonline.com/your-tenant-id/v2.0"
  }'
```

### 2. Onboard First Developer

```bash
# Use the unified onboarding system
./unified-onboarding-enhanced.py \
  --email john.doe@yourcompany.com \
  --department engineering \
  --access-tier sandbox \
  --manager-email engineering-manager@yourcompany.com \
  --use-case "AI-powered code review automation" \
  --idp-provider okta \
  --config ../config/bcce-unified-config.yaml
```

### 3. Test End-to-End Workflow

```bash
# Test authentication flow (as the developer)
claude auth

# Verify governance integration
claude governance status
claude budget status

# Test a simple workflow
echo "Test workflow" | claude
```

---

## 📊 Phase 5: Configure Monitoring and Analytics

### 1. Set Up CloudWatch Dashboard

The deployment automatically creates a unified dashboard. Access it via:

```bash
# Get dashboard URL
echo "https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#dashboards:name=$(terraform output -raw bcce_governance_resources | jq -r '.dashboard_name')"
```

### 2. Configure Alerting

```bash
# Create cost alerting for organization
aws cloudwatch put-metric-alarm \
  --alarm-name "BCCE-Organization-High-Cost" \
  --alarm-description "Alert when BCCE costs exceed threshold" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 5000 \
  --comparison-operator GreaterThanThreshold
```

### 3. Enable Analytics Processing

```bash
# Test analytics Lambda function
aws lambda invoke \
  --function-name bcce-analytics-processor \
  --payload '{
    "event_id": "test-event",
    "user_email": "test@yourcompany.com",
    "department": "engineering",
    "access_tier": "sandbox",
    "operation": "model_invocation",
    "model_used": "claude-3-haiku",
    "tokens_used": 100,
    "cost_estimate": 0.01
  }' \
  /tmp/analytics-test-response.json

cat /tmp/analytics-test-response.json
```

---

## 🔧 Phase 6: Production Configuration

### 1. Update DNS and SSL

```bash
# Configure custom domain for Cognito (optional)
aws cognito-idp create-user-pool-domain \
  --domain yourcompany-claude-code \
  --user-pool-id YOUR_USER_POOL_ID
```

### 2. Configure Backup and Recovery

```bash
# Enable AWS Backup for critical resources
aws backup put-backup-plan \
  --backup-plan '{
    "BackupPlanName": "BCCE-Daily-Backup",
    "Rules": [{
      "RuleName": "DailyBackups",
      "TargetBackupVault": "default",
      "ScheduleExpression": "cron(0 6 ? * * *)",
      "Lifecycle": {
        "DeleteAfterDays": 30
      }
    }]
  }'
```

### 3. Set Up Cross-Region Replication

```bash
# Configure S3 cross-region replication for analytics bucket
aws s3api put-bucket-replication \
  --bucket $(terraform output -raw bcce_governance_resources | jq -r '.analytics_bucket') \
  --replication-configuration file://replication-config.json
```

---

## 📚 Configuration Files Reference

### Generated Configuration Files

After deployment, you'll find these files in `../config/`:

- **`bcce-unified-config.yaml`** - Main configuration for the integrated system
- **`deployment-summary.md`** - Deployment summary and next steps
- **`terraform.tfvars`** - Terraform variables used for deployment

### Environment Variables for Developers

```bash
# Authentication (AWS Solutions Library)
export COGNITO_USER_POOL_ID="us-east-1_XXXXXXXXX"
export AWS_REGION="us-east-1"

# BCCE Governance
export BCCE_ACCESS_TIER="sandbox"
export BCCE_DEPARTMENT="engineering"
export BCCE_ANALYTICS_BUCKET="bcce-analytics-yourcompany-12345678"
export BCCE_BUDGET_LIMIT="100"

# Integration
export BCCE_INTEGRATION_MODE="layered"
export BCCE_AUTH_PROVIDER="aws_solutions_library"
export BCCE_GOVERNANCE_PROVIDER="bcce"
```

---

## 🚨 Troubleshooting

### Common Issues

#### 1. Cognito User Pool Not Found
```bash
# List all user pools to find the correct one
aws cognito-idp list-user-pools --max-results 50 --region $AWS_REGION

# Update configuration with correct pool ID
```

#### 2. S3 Bucket Access Denied
```bash
# Check bucket policy
aws s3api get-bucket-policy --bucket YOUR_BUCKET_NAME

# Verify IAM permissions
aws iam simulate-principal-policy \
  --policy-source-arn $(aws sts get-caller-identity --query Arn --output text) \
  --action-names s3:GetObject s3:PutObject \
  --resource-arns arn:aws:s3:::YOUR_BUCKET_NAME/*
```

#### 3. Budget Creation Failed
```bash
# Check AWS Budgets service limits
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)

# Verify permissions for budget management
```

#### 4. Terraform State Issues
```bash
# Import existing resources if needed
terraform import aws_cognito_user_pool.claude_code_pool_minimal YOUR_POOL_ID

# Refresh state
terraform refresh
```

### Validation Commands

```bash
# Complete system validation
./test-layered-integration.py --verbose

# Check specific components
aws cognito-idp list-groups --user-pool-id YOUR_POOL_ID
aws s3 ls s3://$(terraform output -raw bcce_governance_resources | jq -r '.analytics_bucket')
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

---

## 📈 Success Metrics

### Week 1-2: Foundation
- [ ] AWS Solutions Library deployed and functional
- [ ] BCCE governance layer integrated
- [ ] Configuration files generated
- [ ] Integration tests passing (>90% success rate)

### Week 3-4: Pilot Deployment
- [ ] 5-10 pilot users onboarded successfully
- [ ] Authentication flow working end-to-end
- [ ] Budget controls and alerts functional
- [ ] Analytics data flowing to dashboards

### Month 2-3: Production Rollout
- [ ] 50+ users across departments
- [ ] Cost optimization showing measurable savings
- [ ] Zero security incidents
- [ ] Developer satisfaction >85%

---

## 🔗 Next Steps

1. **Review the deployment summary**: `../config/deployment-summary.md`
2. **Configure your identity provider** for production SSO
3. **Onboard pilot users** using the unified onboarding system
4. **Monitor usage and costs** through the CloudWatch dashboard
5. **Scale to additional departments** as needed

## 📞 Support

- **Documentation**: `AWS_SOLUTIONS_INTEGRATION_STRATEGY.md`
- **Test Reports**: `/tmp/bcce-integration-test-report.json`
- **Configuration**: `../config/bcce-unified-config.yaml`
- **Logs**: CloudWatch Logs `/aws/lambda/bcce-analytics-processor`

**Deployment Status: ✅ Ready for production enterprise use**