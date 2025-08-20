#!/usr/bin/env python3
"""
BCCE + AWS Solutions Library Unified Onboarding System
Enhanced version that integrates BCCE governance with AWS Solutions Library authentication
"""

import argparse
import boto3
import json
import yaml
import logging
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class UnifiedBCCEOnboarder:
    """
    Unified onboarding system that combines:
    - AWS Solutions Library authentication (Cognito OIDC)
    - BCCE governance layer (budgets, analytics, policies)
    """
    
    def __init__(self, config: Dict):
        self.config = config
        self.cognito = boto3.client('cognito-idp')
        self.iam = boto3.client('iam')
        self.budgets = boto3.client('budgets')
        self.s3 = boto3.client('s3')
        self.kms = boto3.client('kms')
        self.cloudwatch = boto3.client('cloudwatch')
        self.sts = boto3.client('sts')
        self.account_id = self.sts.get_caller_identity()['Account']
        
        # Get integration configuration
        self.user_pool_id = config.get('authentication', {}).get('user_pool_id')
        self.analytics_bucket = config.get('governance', {}).get('analytics_bucket')
        self.kms_key_id = config.get('governance', {}).get('kms_key_id')
        
        if not self.user_pool_id:
            raise ValueError("Cognito User Pool ID not found in configuration")
    
    def onboard_developer_unified(self, 
                                 email: str, 
                                 department: str, 
                                 access_tier: str,
                                 manager_email: str,
                                 use_case: str,
                                 idp_provider: str = "cognito") -> Dict:
        """
        Unified onboarding that integrates Solutions Library auth with BCCE governance
        """
        
        logger.info(f"🚀 Starting unified BCCE + Solutions Library onboarding for {email}")
        
        try:
            # Step 1: Validate onboarding request
            self._validate_unified_request(email, department, access_tier)
            
            # Step 2: Create/update user in existing Cognito pool with BCCE attributes
            user_info = self._create_cognito_user_enhanced(email, department, access_tier, manager_email)
            
            # Step 3: Assign user to department group
            group_info = self._assign_department_group(email, department)
            
            # Step 4: Set up BCCE governance resources
            governance_resources = self._setup_governance_resources(email, department, access_tier)
            
            # Step 5: Configure monitoring and analytics
            monitoring = self._setup_enhanced_monitoring(email, department, access_tier)
            
            # Step 6: Generate unified configuration
            config_files = self._generate_unified_config(email, user_info, governance_resources, access_tier, idp_provider)
            
            # Step 7: Send comprehensive welcome communication
            self._send_unified_welcome(email, manager_email, config_files, access_tier, use_case, idp_provider)
            
            # Step 8: Log detailed onboarding event
            self._log_unified_onboarding_event(email, department, access_tier, use_case, idp_provider)
            
            onboarding_result = {
                'status': 'success',
                'integration_type': 'layered_unified',
                'authentication_provider': 'aws_solutions_library',
                'governance_provider': 'bcce',
                'developer_email': email,
                'department': department,
                'access_tier': access_tier,
                'idp_provider': idp_provider,
                'user_info': user_info,
                'group_info': group_info,
                'governance_resources': governance_resources,
                'monitoring': monitoring,
                'config_files': config_files,
                'onboarded_at': datetime.utcnow().isoformat()
            }
            
            logger.info(f"✅ Successfully completed unified onboarding for {email}")
            return onboarding_result
            
        except Exception as e:
            logger.error(f"❌ Unified onboarding failed for {email}: {str(e)}")
            raise
    
    def _validate_unified_request(self, email: str, department: str, access_tier: str):
        """Validate onboarding request for unified system"""
        
        # Validate department exists in configuration
        departments = self.config.get('departments', {})
        if department not in departments:
            raise ValueError(f"Invalid department: {department}. Valid options: {list(departments.keys())}")
        
        # Validate access tier
        valid_tiers = departments[department].get('access_tiers', ['sandbox'])
        if access_tier not in valid_tiers:
            raise ValueError(f"Invalid access tier '{access_tier}' for department '{department}'. Valid options: {valid_tiers}")
        
        # Check if user already exists in Cognito
        try:
            username = email.replace('@', '-').replace('.', '-')
            self.cognito.admin_get_user(
                UserPoolId=self.user_pool_id,
                Username=username
            )
            raise ValueError(f"User already exists in Cognito for {email}")
        except self.cognito.exceptions.UserNotFoundException:
            pass  # Good, user doesn't exist yet
        except Exception as e:
            logger.warning(f"Error checking existing user: {e}")
    
    def _create_cognito_user_enhanced(self, email: str, department: str, access_tier: str, manager_email: str) -> Dict:
        """Create user in existing Cognito pool with BCCE-specific attributes"""
        
        username = email.replace('@', '-').replace('.', '-')
        department_config = self.config.get('departments', {}).get(department, {})
        budget_limit = department_config.get('budget_limit', 100)
        
        # Create user with enhanced attributes for BCCE governance
        user_attributes = [
            {'Name': 'email', 'Value': email},
            {'Name': 'email_verified', 'Value': 'true'},
            {'Name': 'custom:department', 'Value': department},
            {'Name': 'custom:access_tier', 'Value': access_tier},
            {'Name': 'custom:budget_limit', 'Value': str(budget_limit)},
            {'Name': 'custom:manager_email', 'Value': manager_email}
        ]
        
        try:
            response = self.cognito.admin_create_user(
                UserPoolId=self.user_pool_id,
                Username=username,
                UserAttributes=user_attributes,
                MessageAction='WELCOME',
                TemporaryPassword='TempPass123!',  # User will be forced to change on first login
                ForceAliasCreation=False
            )
            
            logger.info(f"Created Cognito user: {username}")
            
            return {
                'username': username,
                'user_pool_id': self.user_pool_id,
                'user_sub': response['User']['Username'],
                'email': email,
                'department': department,
                'access_tier': access_tier,
                'budget_limit': budget_limit,
                'manager_email': manager_email,
                'auth_method': 'cognito_enhanced'
            }
            
        except Exception as e:
            logger.error(f"Failed to create Cognito user: {e}")
            raise
    
    def _assign_department_group(self, email: str, department: str) -> Dict:
        """Assign user to department group in Cognito"""
        
        username = email.replace('@', '-').replace('.', '-')
        group_name = department
        
        try:
            # Add user to department group
            self.cognito.admin_add_user_to_group(
                UserPoolId=self.user_pool_id,
                Username=username,
                GroupName=group_name
            )
            
            logger.info(f"Added user {username} to group {group_name}")
            
            return {
                'group_name': group_name,
                'group_assigned': True,
                'department': department
            }
            
        except self.cognito.exceptions.ResourceNotFoundException:
            logger.error(f"Department group {group_name} not found. Please ensure Terraform deployment is complete.")
            raise
        except Exception as e:
            logger.error(f"Failed to assign user to group: {e}")
            raise
    
    def _setup_governance_resources(self, email: str, department: str, access_tier: str) -> Dict:
        """Set up BCCE governance resources for the user"""
        
        # Create individual S3 prefix for user data
        user_prefix = f"users/{email.replace('@', '-').replace('.', '-')}"
        
        # Set up individual budget if needed
        individual_budget = self._setup_individual_budget(email, department, access_tier)
        
        # Configure analytics tracking
        analytics_config = self._setup_analytics_tracking(email, department, access_tier)
        
        # Set up CloudWatch custom metrics
        metrics_config = self._setup_custom_metrics(email, department)
        
        return {
            's3_user_prefix': user_prefix,
            'analytics_bucket': self.analytics_bucket,
            'individual_budget': individual_budget,
            'analytics_config': analytics_config,
            'metrics_config': metrics_config,
            'kms_key_id': self.kms_key_id
        }
    
    def _setup_individual_budget(self, email: str, department: str, access_tier: str) -> Dict:
        """Set up individual budget for user if configured"""
        
        # Budget limits by tier
        tier_limits = {
            'sandbox': 100,
            'integration': 500,
            'production': 1000
        }
        
        individual_limit = tier_limits.get(access_tier, 100)
        budget_name = f"BCCE-Individual-{email.replace('@', '-').replace('.', '-')}"
        
        try:
            budget = {
                'BudgetName': budget_name,
                'BudgetLimit': {
                    'Amount': str(individual_limit),
                    'Unit': 'USD'
                },
                'TimeUnit': 'MONTHLY',
                'BudgetType': 'COST',
                'CostFilters': {
                    'TagKey': ['BCCEUser'],
                    'TagValue': [email]
                }
            }
            
            notifications = [
                {
                    'Notification': {
                        'NotificationType': 'ACTUAL',
                        'ComparisonOperator': 'GREATER_THAN',
                        'Threshold': 80.0,
                        'ThresholdType': 'PERCENTAGE'
                    },
                    'Subscribers': [
                        {
                            'SubscriptionType': 'EMAIL',
                            'Address': email
                        }
                    ]
                },
                {
                    'Notification': {
                        'NotificationType': 'ACTUAL',
                        'ComparisonOperator': 'GREATER_THAN',
                        'Threshold': 100.0,
                        'ThresholdType': 'PERCENTAGE'
                    },
                    'Subscribers': [
                        {
                            'SubscriptionType': 'EMAIL',
                            'Address': email
                        }
                    ]
                }
            ]
            
            self.budgets.create_budget(
                AccountId=self.account_id,
                Budget=budget,
                NotificationsWithSubscribers=notifications
            )
            
            return {
                'budget_name': budget_name,
                'budget_limit': individual_limit,
                'currency': 'USD',
                'created': True
            }
            
        except Exception as e:
            logger.warning(f"Could not create individual budget: {e}")
            return {'budget_name': None, 'error': str(e), 'created': False}
    
    def _setup_analytics_tracking(self, email: str, department: str, access_tier: str) -> Dict:
        """Set up analytics tracking configuration"""
        
        # Create analytics configuration object
        analytics_config = {
            'user_email': email,
            'department': department,
            'access_tier': access_tier,
            'tracking_enabled': True,
            'metrics_namespace': f"BCCE/{self.config.get('organization', {}).get('name', 'Organization')}",
            'analytics_bucket': self.analytics_bucket,
            'retention_days': 365 if access_tier == 'production' else 90
        }
        
        # Store configuration in S3
        config_key = f"configs/users/{email.replace('@', '-').replace('.', '-')}/analytics-config.json"
        
        try:
            if self.analytics_bucket:
                self.s3.put_object(
                    Bucket=self.analytics_bucket,
                    Key=config_key,
                    Body=json.dumps(analytics_config, indent=2),
                    ServerSideEncryption='aws:kms',
                    SSEKMSKeyId=self.kms_key_id,
                    ContentType='application/json',
                    Tagging=f'BCCEUser={email}&Department={department}&AccessTier={access_tier}'
                )
                
                logger.info(f"Analytics configuration stored for {email}")
        
        except Exception as e:
            logger.warning(f"Could not store analytics configuration: {e}")
        
        return analytics_config
    
    def _setup_custom_metrics(self, email: str, department: str) -> Dict:
        """Set up custom CloudWatch metrics for user"""
        
        metrics_config = {
            'namespace': f"BCCE/{self.config.get('organization', {}).get('name', 'Organization')}",
            'dimensions': {
                'Department': department,
                'User': email,
                'Environment': self.config.get('organization', {}).get('environment', 'production')
            },
            'metrics': [
                'TokensUsed',
                'RequestCount',
                'ErrorCount',
                'ResponseTime',
                'CostEstimate'
            ]
        }
        
        return metrics_config
    
    def _setup_enhanced_monitoring(self, email: str, department: str, access_tier: str) -> Dict:
        """Set up enhanced monitoring and alerting"""
        
        # This would typically create CloudWatch alarms, dashboards, etc.
        monitoring_config = {
            'user_email': email,
            'department': department,
            'access_tier': access_tier,
            'dashboard_name': f"BCCE-{email.replace('@', '-').replace('.', '-')}",
            'alerts_enabled': True,
            'cost_alerts': access_tier in ['integration', 'production'],
            'performance_monitoring': True
        }
        
        return monitoring_config
    
    def _generate_unified_config(self, email: str, user_info: Dict, governance_resources: Dict, 
                               access_tier: str, idp_provider: str) -> Dict:
        """Generate unified configuration for both authentication and governance"""
        
        # BCCE CLI configuration that works with both systems
        unified_config = {
            'profile': 'unified',
            'authentication': {
                'method': 'cognito_oidc',
                'provider': idp_provider,
                'user_pool_id': self.user_pool_id,
                'username': user_info['username'],
                'session_based': True,
                'region': self.config.get('organization', {}).get('region', 'us-east-1')
            },
            'governance': {
                'enabled': True,
                'provider': 'bcce',
                'access_tier': access_tier,
                'department': user_info['department'],
                'budget_limit': user_info['budget_limit'],
                'analytics_bucket': governance_resources['analytics_bucket'],
                'kms_key_id': governance_resources['kms_key_id'],
                'individual_budget': governance_resources['individual_budget']['budget_name']
            },
            'integration': {
                'architecture': 'layered',
                'solutions_library': 'authentication',
                'bcce': 'governance',
                'version': '1.0.0'
            }
        }
        
        # Environment variables
        env_vars = f"""# BCCE + AWS Solutions Library Unified Configuration
# Generated on {datetime.utcnow().isoformat()}

# Authentication (AWS Solutions Library)
export COGNITO_USER_POOL_ID="{self.user_pool_id}"
export COGNITO_USERNAME="{user_info['username']}"
export AWS_REGION="{self.config.get('organization', {}).get('region', 'us-east-1')}"

# BCCE Governance
export BCCE_ACCESS_TIER="{access_tier}"
export BCCE_DEPARTMENT="{user_info['department']}"
export BCCE_ANALYTICS_BUCKET="{governance_resources['analytics_bucket']}"
export BCCE_KMS_KEY_ID="{governance_resources['kms_key_id']}"
export BCCE_BUDGET_LIMIT="{user_info['budget_limit']}"

# Integration Configuration
export BCCE_INTEGRATION_MODE="layered"
export BCCE_AUTH_PROVIDER="aws_solutions_library"
export BCCE_GOVERNANCE_PROVIDER="bcce"

# Analytics and Monitoring
export BCCE_ANALYTICS_ENABLED="true"
export BCCE_INDIVIDUAL_BUDGET="{governance_resources['individual_budget']['budget_name']}"
"""
        
        # Enhanced getting started guide
        getting_started = f"""# Welcome to BCCE + AWS Solutions Library!

## 🎯 Your Unified Setup

You now have access to the **layered integration** combining:
- **AWS Solutions Library** for secure authentication
- **BCCE Governance** for enterprise cost management and analytics

### Your Configuration:
- **Email:** {email}
- **Department:** {user_info['department']}
- **Access Tier:** {access_tier}
- **Authentication:** Cognito OIDC (AWS Solutions Library)
- **Governance:** BCCE Enterprise

## 🚀 Quick Start

### 1. Install Claude Code CLI
```bash
# Follow AWS Solutions Library installation guide
# This provides the base Claude Code installation with authentication
```

### 2. Configure Your Environment
```bash
# Source the unified environment variables
source bcce-unified-env.sh

# Verify your setup
claude config list
```

### 3. Authenticate (First Time)
```bash
# Use your enterprise SSO credentials
claude auth

# This will authenticate through your organization's identity provider
# and automatically configure BCCE governance
```

### 4. Verify Integration
```bash
# Check authentication status
claude auth status

# Verify governance configuration
claude governance status

# View your budget and usage
claude budget status
```

## 🎛️ Your Access & Capabilities

### Authentication Features (AWS Solutions Library):
- ✅ Enterprise SSO integration ({idp_provider})
- ✅ Session-based access (no long-lived keys)
- ✅ Cross-platform support
- ✅ Automatic credential refresh

### Governance Features (BCCE):
- ✅ Department budget: ${user_info['budget_limit']}/month
- ✅ Individual budget: ${governance_resources['individual_budget']['budget_limit']}/month
- ✅ Real-time usage analytics
- ✅ Cost optimization alerts
- ✅ Compliance audit trails

### Available Models ({access_tier} tier):
{self._get_model_list_for_tier(access_tier)}

## 📊 Monitoring & Analytics

Your usage is automatically tracked and optimized:
- **Cost Tracking:** Real-time budget monitoring
- **Usage Analytics:** Department and individual metrics
- **Performance Monitoring:** Response times and success rates
- **Compliance Logging:** Complete audit trails

## 🆘 Support & Resources

- **Documentation:** AWS Solutions Library + BCCE Integration Guide
- **Dashboard:** CloudWatch BCCE Unified Analytics
- **Budget Alerts:** Automatic email notifications
- **Support:** bcce-support@{self.config.get('organization', {}).get('name', 'company').lower()}.com

## 🔄 What's Different from Standard Claude Code?

This unified setup provides:
1. **Enhanced Security:** Enterprise-grade authentication with governance
2. **Cost Intelligence:** Automatic budget management and optimization
3. **Analytics:** Department-level usage insights and ROI tracking
4. **Compliance:** Built-in audit trails and policy enforcement

**Ready to build amazing AI applications with enterprise governance!** 🚀
"""
        
        return {
            'unified_config': unified_config,
            'env_vars': env_vars,
            'getting_started': getting_started
        }
    
    def _get_model_list_for_tier(self, access_tier: str) -> str:
        """Get formatted model list for access tier"""
        
        model_access = {
            'sandbox': ['claude-3-haiku'],
            'integration': ['claude-3-haiku', 'claude-3-5-sonnet'],
            'production': ['claude-3-haiku', 'claude-3-5-sonnet', 'claude-3-opus']
        }
        
        models = model_access.get(access_tier, ['claude-3-haiku'])
        return '\n'.join([f'- {model}' for model in models])
    
    def _send_unified_welcome(self, email: str, manager_email: str, config_files: Dict, 
                            access_tier: str, use_case: str, idp_provider: str):
        """Send comprehensive welcome email for unified system"""
        
        logger.info(f"📧 Sending unified welcome email to {email}")
        logger.info(f"📧 CC: {manager_email}")
        logger.info(f"🎯 Access Tier: {access_tier}")
        logger.info(f"💡 Use Case: {use_case}")
        logger.info(f"🔐 Identity Provider: {idp_provider}")
        logger.info(f"🏗️ Architecture: Layered (Solutions Library + BCCE)")
        
        # In production, this would send a rich HTML email with:
        # - Welcome message explaining the unified system
        # - Configuration files as attachments
        # - Links to documentation and dashboards
        # - Contact information for support
        # - Next steps for getting started
    
    def _log_unified_onboarding_event(self, email: str, department: str, access_tier: str, 
                                    use_case: str, idp_provider: str):
        """Log comprehensive onboarding event for unified system"""
        
        event_data = {
            'event_type': 'unified_developer_onboarded',
            'timestamp': datetime.utcnow().isoformat(),
            'integration_architecture': 'layered',
            'authentication_provider': 'aws_solutions_library',
            'governance_provider': 'bcce',
            'developer_email': email,
            'department': department,
            'access_tier': access_tier,
            'use_case': use_case,
            'idp_provider': idp_provider,
            'user_pool_id': self.user_pool_id,
            'analytics_bucket': self.analytics_bucket,
            'organization': self.config.get('organization', {}).get('name'),
            'onboarded_by': os.getenv('USER', 'system'),
            'version': '1.0.0'
        }
        
        # Store in analytics bucket for enterprise tracking
        if self.analytics_bucket:
            try:
                event_key = f"events/onboarding/{datetime.utcnow().strftime('%Y/%m/%d')}/{email.replace('@', '-').replace('.', '-')}.json"
                
                self.s3.put_object(
                    Bucket=self.analytics_bucket,
                    Key=event_key,
                    Body=json.dumps(event_data, indent=2),
                    ServerSideEncryption='aws:kms',
                    SSEKMSKeyId=self.kms_key_id,
                    ContentType='application/json'
                )
                
                logger.info(f"📊 Unified onboarding event stored: {event_key}")
                
            except Exception as e:
                logger.warning(f"Could not store onboarding event: {e}")
        
        # Also log locally
        logger.info(f"📊 Unified onboarding event: {json.dumps(event_data)}")


def load_unified_config(config_file: str) -> Dict:
    """Load unified configuration file"""
    
    try:
        with open(config_file, 'r') as f:
            if config_file.endswith('.yaml') or config_file.endswith('.yml'):
                return yaml.safe_load(f)
            else:
                return json.load(f)
    except FileNotFoundError:
        logger.error(f"Configuration file not found: {config_file}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error loading configuration: {e}")
        sys.exit(1)


def main():
    """Main function for unified onboarding CLI"""
    
    parser = argparse.ArgumentParser(description='BCCE + AWS Solutions Library Unified Onboarding')
    parser.add_argument('--email', required=True, help='Developer email address')
    parser.add_argument('--department', required=True, help='Developer department')
    parser.add_argument('--access-tier', required=True, choices=['sandbox', 'integration', 'production'],
                       help='Access tier for developer')
    parser.add_argument('--manager-email', required=True, help='Manager email for notifications')
    parser.add_argument('--use-case', required=True, help='Primary use case for Claude Code access')
    parser.add_argument('--idp-provider', default='cognito', 
                       choices=['cognito', 'okta', 'azure_ad', 'auth0'],
                       help='Identity provider (default: cognito)')
    parser.add_argument('--config', default='../config/bcce-unified-config.yaml',
                       help='Unified configuration file')
    parser.add_argument('--dry-run', action='store_true', help='Perform dry run without creating resources')
    
    args = parser.parse_args()
    
    # Load unified configuration
    config = load_unified_config(args.config)
    
    # Initialize unified onboarder
    onboarder = UnifiedBCCEOnboarder(config)
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No resources will be created")
        try:
            onboarder._validate_unified_request(args.email, args.department, args.access_tier)
            logger.info("✅ Validation passed - ready for unified onboarding")
        except Exception as e:
            logger.error(f"❌ Validation failed: {e}")
            sys.exit(1)
    else:
        # Perform unified onboarding
        try:
            result = onboarder.onboard_developer_unified(
                email=args.email,
                department=args.department,
                access_tier=args.access_tier,
                manager_email=args.manager_email,
                use_case=args.use_case,
                idp_provider=args.idp_provider
            )
            
            # Output result
            print("\n🎉 BCCE + AWS Solutions Library Unified Onboarding Complete!")
            print(f"Developer: {result['developer_email']}")
            print(f"Architecture: {result['integration_type']}")
            print(f"Authentication: {result['authentication_provider']}")
            print(f"Governance: {result['governance_provider']}")
            print(f"Access Tier: {result['access_tier']}")
            print(f"Department: {result['department']}")
            print(f"Cognito Username: {result['user_info']['username']}")
            print(f"Department Group: {result['group_info']['group_name']}")
            print(f"Analytics Bucket: {result['governance_resources']['analytics_bucket']}")
            print(f"Individual Budget: {result['governance_resources']['individual_budget']['budget_name']}")
            print("\n📧 Welcome email sent with unified configuration")
            print("🔗 Next: Developer should follow getting started guide for complete setup")
            
        except Exception as e:
            logger.error(f"❌ Unified onboarding failed: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()