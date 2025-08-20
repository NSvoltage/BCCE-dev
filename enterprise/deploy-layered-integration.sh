#!/bin/bash
set -euo pipefail

# BCCE + AWS Solutions Library Layered Integration Deployment Script
# Deploys the complete integrated solution following the recommended architecture

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
ORGANIZATION_NAME="${ORGANIZATION_NAME:-CompanyName}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
SOLUTIONS_LIBRARY_DEPLOYED="${SOLUTIONS_LIBRARY_DEPLOYED:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is required but not installed"
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is required but not installed"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    fi
    
    # Check jq for JSON processing
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found - some features may be limited"
    fi
    
    log_success "Prerequisites check passed"
}

# Deploy AWS Solutions Library (if not already deployed)
deploy_solutions_library() {
    if [[ "$SOLUTIONS_LIBRARY_DEPLOYED" == "true" ]]; then
        log_info "AWS Solutions Library already deployed, skipping..."
        return 0
    fi
    
    log_info "Deploying AWS Solutions Library foundation..."
    
    # Clone the Solutions Library if not present
    if [[ ! -d "$PROJECT_ROOT/aws-solutions-library" ]]; then
        log_info "Cloning AWS Solutions Library..."
        git clone https://github.com/aws-solutions-library-samples/guidance-for-claude-code-with-amazon-bedrock.git \
            "$PROJECT_ROOT/aws-solutions-library"
    fi
    
    # Deploy Solutions Library CloudFormation stack
    cd "$PROJECT_ROOT/aws-solutions-library"
    
    # Check if stack already exists
    STACK_NAME="claude-code-bedrock-guidance"
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &> /dev/null; then
        log_info "Solutions Library stack already exists, updating..."
        OPERATION="update-stack"
    else
        log_info "Creating new Solutions Library stack..."
        OPERATION="create-stack"
    fi
    
    # Deploy/update the stack
    aws cloudformation "$OPERATION" \
        --stack-name "$STACK_NAME" \
        --template-body "file://$(pwd)/cloudformation/main.yaml" \
        --parameters ParameterKey=OrganizationName,ParameterValue="$ORGANIZATION_NAME" \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --region "$AWS_REGION" || {
        log_error "Failed to deploy Solutions Library stack"
        exit 1
    }
    
    # Wait for stack deployment to complete
    log_info "Waiting for Solutions Library stack deployment to complete..."
    aws cloudformation wait stack-"${OPERATION//-/_}"-complete \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" || {
        log_error "Stack deployment failed or timed out"
        exit 1
    }
    
    log_success "AWS Solutions Library deployed successfully"
    cd "$SCRIPT_DIR"
}

# Deploy BCCE governance layer
deploy_bcce_governance() {
    log_info "Deploying BCCE governance layer..."
    
    cd "$SCRIPT_DIR"
    
    # Initialize Terraform
    terraform init -upgrade
    
    # Create terraform.tfvars if it doesn't exist
    if [[ ! -f "terraform.tfvars" ]]; then
        log_info "Creating terraform.tfvars..."
        cat > terraform.tfvars <<EOF
organization_name = "$ORGANIZATION_NAME"
aws_solutions_library_deployed = $SOLUTIONS_LIBRARY_DEPLOYED

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
    fi
    
    # Plan the deployment
    log_info "Planning BCCE governance deployment..."
    terraform plan -out=bcce-governance.tfplan
    
    # Apply the deployment
    log_info "Applying BCCE governance deployment..."
    terraform apply bcce-governance.tfplan
    
    log_success "BCCE governance layer deployed successfully"
}

# Generate configuration files
generate_configurations() {
    log_info "Generating configuration files..."
    
    # Get Terraform outputs
    COGNITO_OUTPUT=$(terraform output -json cognito_integration 2>/dev/null || echo '{}')
    GOVERNANCE_OUTPUT=$(terraform output -json bcce_governance_resources 2>/dev/null || echo '{}')
    
    # Create configuration directory
    mkdir -p "$PROJECT_ROOT/config"
    
    # Generate unified configuration
    cat > "$PROJECT_ROOT/config/bcce-unified-config.yaml" <<EOF
# BCCE + AWS Solutions Library Unified Configuration
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

organization:
  name: "$ORGANIZATION_NAME"
  environment: "$ENVIRONMENT"
  region: "$AWS_REGION"

authentication:
  provider: "aws_solutions_library"
  method: "cognito_oidc"
  user_pool_id: "$(echo "$COGNITO_OUTPUT" | jq -r '.user_pool_id // "not-configured"')"
  session_based: true
  
governance:
  provider: "bcce"
  analytics_bucket: "$(echo "$GOVERNANCE_OUTPUT" | jq -r '.analytics_bucket // "not-configured"')"
  kms_key_id: "$(echo "$GOVERNANCE_OUTPUT" | jq -r '.kms_key_id // "not-configured"')"
  dashboard_name: "$(echo "$GOVERNANCE_OUTPUT" | jq -r '.dashboard_name // "not-configured"')"
  
departments:
  engineering:
    budget_limit: 10000
    access_tiers: ["sandbox", "integration", "production"]
  product:
    budget_limit: 5000
    access_tiers: ["sandbox", "integration"]
  data_science:
    budget_limit: 15000
    access_tiers: ["sandbox", "integration", "production"]

integration:
  status: "active"
  architecture: "layered"
  version: "1.0.0"
  deployment_date: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
EOF
    
    # Generate deployment summary
    cat > "$PROJECT_ROOT/config/deployment-summary.md" <<EOF
# BCCE + AWS Solutions Library Deployment Summary

**Deployment Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Organization:** $ORGANIZATION_NAME
**Environment:** $ENVIRONMENT
**Architecture:** Layered Integration

## Components Deployed

### AWS Solutions Library Foundation
- ✅ Cognito User Pool with OIDC integration
- ✅ Session-based authentication
- ✅ Cross-platform distribution support
- ✅ Regional inference routing

### BCCE Governance Layer
- ✅ Enhanced Cognito attributes (department, access_tier, budget_limit)
- ✅ Department-based IAM roles and policies
- ✅ Analytics S3 bucket with KMS encryption
- ✅ Cost budgets with multi-tier notifications
- ✅ CloudWatch dashboard for unified analytics
- ✅ Lambda function for analytics processing

## Access Configuration

| Department | Budget Limit | Access Tiers | Manager Email |
|------------|-------------|-------------|---------------|
| Engineering | \$10,000 | Sandbox, Integration, Production | engineering-manager@${ORGANIZATION_NAME,,}.com |
| Product | \$5,000 | Sandbox, Integration | product-manager@${ORGANIZATION_NAME,,}.com |
| Data Science | \$15,000 | Sandbox, Integration, Production | data-science-manager@${ORGANIZATION_NAME,,}.com |

## Next Steps

1. **Configure Identity Provider:** Set up OIDC with your enterprise IdP (Okta/Azure AD)
2. **Onboard Pilot Users:** Use the unified onboarding script to add initial developers
3. **Test Integration:** Verify authentication + governance workflow end-to-end
4. **Department Rollout:** Expand to additional departments and users

## Support Resources

- Configuration Files: \`./config/\`
- Onboarding Script: \`./enterprise/unified-onboarding.py\`
- Documentation: \`./AWS_SOLUTIONS_INTEGRATION_STRATEGY.md\`
- Terraform State: \`./enterprise/terraform.tfstate\`

**Status: ✅ Ready for pilot deployment**
EOF
    
    log_success "Configuration files generated successfully"
}

# Create Lambda deployment package
create_lambda_package() {
    log_info "Creating Lambda deployment package..."
    
    LAMBDA_DIR="$SCRIPT_DIR/lambda"
    mkdir -p "$LAMBDA_DIR"
    
    # Create analytics processor function
    cat > "$LAMBDA_DIR/index.py" <<'EOF'
import json
import boto3
import os
from datetime import datetime, timezone
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    BCCE Analytics Processor
    Processes usage events and stores analytics data
    """
    
    try:
        # Get environment variables
        analytics_bucket = os.environ['ANALYTICS_BUCKET']
        kms_key_id = os.environ['KMS_KEY_ID']
        organization = os.environ['ORGANIZATION']
        
        # Initialize AWS clients
        s3 = boto3.client('s3')
        cloudwatch = boto3.client('cloudwatch')
        
        # Process the event
        processed_data = process_analytics_event(event)
        
        # Store data in S3
        key = f"analytics/{datetime.now(timezone.utc).strftime('%Y/%m/%d')}/{context.aws_request_id}.json"
        
        s3.put_object(
            Bucket=analytics_bucket,
            Key=key,
            Body=json.dumps(processed_data),
            ServerSideEncryption='aws:kms',
            SSEKMSKeyId=kms_key_id,
            ContentType='application/json'
        )
        
        # Send metrics to CloudWatch
        send_cloudwatch_metrics(cloudwatch, processed_data, organization)
        
        logger.info(f"Successfully processed analytics event: {context.aws_request_id}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Analytics event processed successfully',
                'request_id': context.aws_request_id,
                'data_stored': key
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing analytics event: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process analytics event',
                'message': str(e)
            })
        }

def process_analytics_event(event):
    """Process and enrich analytics event data"""
    
    processed = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'event_id': event.get('event_id', 'unknown'),
        'user_email': event.get('user_email', 'unknown'),
        'department': event.get('department', 'unknown'),
        'access_tier': event.get('access_tier', 'unknown'),
        'operation': event.get('operation', 'unknown'),
        'model_used': event.get('model_used', 'unknown'),
        'tokens_used': event.get('tokens_used', 0),
        'cost_estimate': event.get('cost_estimate', 0.0),
        'duration_ms': event.get('duration_ms', 0),
        'success': event.get('success', True)
    }
    
    return processed

def send_cloudwatch_metrics(cloudwatch, data, organization):
    """Send custom metrics to CloudWatch"""
    
    try:
        # Usage metrics
        cloudwatch.put_metric_data(
            Namespace=f'BCCE/{organization}',
            MetricData=[
                {
                    'MetricName': 'TokensUsed',
                    'Dimensions': [
                        {'Name': 'Department', 'Value': data['department']},
                        {'Name': 'AccessTier', 'Value': data['access_tier']},
                        {'Name': 'Model', 'Value': data['model_used']}
                    ],
                    'Value': data['tokens_used'],
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'EstimatedCost',
                    'Dimensions': [
                        {'Name': 'Department', 'Value': data['department']},
                        {'Name': 'AccessTier', 'Value': data['access_tier']}
                    ],
                    'Value': data['cost_estimate'],
                    'Unit': 'None'
                },
                {
                    'MetricName': 'OperationDuration',
                    'Dimensions': [
                        {'Name': 'Operation', 'Value': data['operation']},
                        {'Name': 'Department', 'Value': data['department']}
                    ],
                    'Value': data['duration_ms'],
                    'Unit': 'Milliseconds'
                }
            ]
        )
        
        logger.info(f"CloudWatch metrics sent for department: {data['department']}")
        
    except Exception as e:
        logger.error(f"Failed to send CloudWatch metrics: {str(e)}")
EOF
    
    # Create deployment package
    cd "$LAMBDA_DIR"
    zip -q bcce-analytics-processor.zip index.py
    mv bcce-analytics-processor.zip "$SCRIPT_DIR/"
    cd "$SCRIPT_DIR"
    rm -rf "$LAMBDA_DIR"
    
    log_success "Lambda deployment package created"
}

# Validate deployment
validate_deployment() {
    log_info "Validating deployment..."
    
    # Check Terraform state
    if terraform show &> /dev/null; then
        log_success "Terraform deployment validation passed"
    else
        log_error "Terraform deployment validation failed"
        return 1
    fi
    
    # Check AWS resources
    USER_POOL_ID=$(terraform output -raw cognito_integration 2>/dev/null | jq -r '.user_pool_id // empty')
    if [[ -n "$USER_POOL_ID" ]]; then
        if aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" &> /dev/null; then
            log_success "Cognito User Pool validation passed"
        else
            log_error "Cognito User Pool validation failed"
            return 1
        fi
    fi
    
    # Check S3 bucket
    ANALYTICS_BUCKET=$(terraform output -raw bcce_governance_resources 2>/dev/null | jq -r '.analytics_bucket // empty')
    if [[ -n "$ANALYTICS_BUCKET" ]]; then
        if aws s3 ls "s3://$ANALYTICS_BUCKET" &> /dev/null; then
            log_success "Analytics S3 bucket validation passed"
        else
            log_error "Analytics S3 bucket validation failed"
            return 1
        fi
    fi
    
    log_success "Deployment validation completed successfully"
}

# Main deployment function
main() {
    log_info "Starting BCCE + AWS Solutions Library layered integration deployment..."
    log_info "Organization: $ORGANIZATION_NAME"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $AWS_REGION"
    
    # Run deployment steps
    check_prerequisites
    create_lambda_package
    deploy_solutions_library
    deploy_bcce_governance
    generate_configurations
    validate_deployment
    
    log_success "🚀 Layered integration deployment completed successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Review configuration files in ./config/"
    echo "2. Configure your enterprise identity provider (Okta/Azure AD)"
    echo "3. Use ./enterprise/unified-onboarding.py to onboard pilot users"
    echo "4. Test the complete authentication + governance workflow"
    echo ""
    echo "📄 Documentation: ./AWS_SOLUTIONS_INTEGRATION_STRATEGY.md"
    echo "🔧 Configuration: ./config/bcce-unified-config.yaml"
    echo "📊 Summary: ./config/deployment-summary.md"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --organization-name)
            ORGANIZATION_NAME="$2"
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --solutions-library-deployed)
            SOLUTIONS_LIBRARY_DEPLOYED="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --organization-name NAME    Organization name (default: CompanyName)"
            echo "  --region REGION            AWS region (default: us-east-1)"
            echo "  --environment ENV          Environment (default: production)"
            echo "  --solutions-library-deployed   Skip Solutions Library deployment"
            echo "  --help                     Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main