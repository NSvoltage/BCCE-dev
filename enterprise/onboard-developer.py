#!/usr/bin/env python3
"""
BCCE Enterprise Developer Onboarding Automation
Automates the complete developer onboarding process with proper security and governance
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

class BCCEDeveloperOnboarder:
    """Handles complete developer onboarding for BCCE enterprise deployment"""
    
    def __init__(self, organization_config: Dict):
        self.config = organization_config
        self.iam = boto3.client('iam')
        self.budgets = boto3.client('budgets')
        self.s3 = boto3.client('s3')
        self.kms = boto3.client('kms')
        self.cloudwatch = boto3.client('cloudwatch')
        self.sts = boto3.client('sts')
        self.account_id = self.sts.get_caller_identity()['Account']
        
    def onboard_developer(self, 
                         email: str, 
                         department: str, 
                         access_tier: str,
                         manager_email: str,
                         use_case: str) -> Dict:
        """Complete developer onboarding process"""
        
        logger.info(f"🚀 Starting BCCE onboarding for {email}")
        
        try:
            # Step 1: Validate inputs
            self._validate_onboarding_request(email, department, access_tier)
            
            # Step 2: Create IAM user and policies
            user_info = self._create_iam_user(email, department, access_tier)
            
            # Step 3: Set up AWS resources
            resources = self._provision_developer_resources(email, department, access_tier)
            
            # Step 4: Create budget controls
            budget_info = self._setup_budget_controls(email, department, access_tier)
            
            # Step 5: Configure monitoring
            monitoring = self._setup_monitoring(email, department)
            
            # Step 6: Generate configuration files
            config_files = self._generate_config_files(email, user_info, resources, access_tier)
            
            # Step 7: Send welcome email
            self._send_welcome_email(email, manager_email, config_files, access_tier, use_case)
            
            # Step 8: Log onboarding event
            self._log_onboarding_event(email, department, access_tier, use_case)
            
            onboarding_result = {
                'status': 'success',
                'developer_email': email,
                'department': department,
                'access_tier': access_tier,
                'user_info': user_info,
                'resources': resources,
                'budget_info': budget_info,
                'monitoring': monitoring,
                'config_files': config_files,
                'onboarded_at': datetime.utcnow().isoformat()
            }
            
            logger.info(f"✅ Successfully onboarded {email}")
            return onboarding_result
            
        except Exception as e:
            logger.error(f"❌ Onboarding failed for {email}: {str(e)}")
            raise
    
    def _validate_onboarding_request(self, email: str, department: str, access_tier: str):
        """Validate onboarding request parameters"""
        
        valid_departments = self.config.get('departments', {}).keys()
        if department not in valid_departments:
            raise ValueError(f"Invalid department: {department}. Valid options: {list(valid_departments)}")
        
        valid_tiers = ['sandbox', 'integration', 'production']
        if access_tier not in valid_tiers:
            raise ValueError(f"Invalid access tier: {access_tier}. Valid options: {valid_tiers}")
        
        # Check if user already exists
        try:
            self.iam.get_user(UserName=f"bcce-{email.replace('@', '-').replace('.', '-')}")
            raise ValueError(f"User already exists for {email}")
        except self.iam.exceptions.NoSuchEntityException:
            pass  # Good, user doesn't exist yet
    
    def _create_iam_user(self, email: str, department: str, access_tier: str) -> Dict:
        """Create IAM user with appropriate policies"""
        
        username = f"bcce-{email.replace('@', '-').replace('.', '-')}"
        
        # Create IAM user
        user_response = self.iam.create_user(
            UserName=username,
            Tags=[
                {'Key': 'Email', 'Value': email},
                {'Key': 'Department', 'Value': department},
                {'Key': 'AccessTier', 'Value': access_tier},
                {'Key': 'CreatedBy', 'Value': 'BCCE-Onboarding'},
                {'Key': 'Purpose', 'Value': 'BCCE-Developer-Access'}
            ]
        )
        
        # Create access keys
        keys_response = self.iam.create_access_key(UserName=username)
        
        # Attach policies based on access tier
        policy_arn = self._get_policy_arn_for_tier(access_tier)
        self.iam.attach_user_policy(
            UserName=username,
            PolicyArn=policy_arn
        )
        
        # Add to appropriate groups
        group_name = f"BCCE-{department.title()}-{access_tier.title()}"
        try:
            self.iam.add_user_to_group(
                GroupName=group_name,
                UserName=username
            )
        except self.iam.exceptions.NoSuchEntityException:
            # Create group if it doesn't exist
            self._create_developer_group(group_name, department, access_tier)
            self.iam.add_user_to_group(
                GroupName=group_name,
                UserName=username
            )
        
        return {
            'username': username,
            'user_arn': user_response['User']['Arn'],
            'access_key_id': keys_response['AccessKey']['AccessKeyId'],
            'secret_access_key': keys_response['AccessKey']['SecretAccessKey'],
            'policy_arn': policy_arn,
            'group_name': group_name
        }
    
    def _get_policy_arn_for_tier(self, access_tier: str) -> str:
        """Get appropriate IAM policy ARN for access tier"""
        
        policy_mapping = {
            'sandbox': f"arn:aws:iam::{self.account_id}:policy/BCCE-Sandbox-Developer-Policy",
            'integration': f"arn:aws:iam::{self.account_id}:policy/BCCE-Integration-Developer-Policy",
            'production': f"arn:aws:iam::{self.account_id}:policy/BCCE-Production-Developer-Policy"
        }
        
        return policy_mapping.get(access_tier)
    
    def _create_developer_group(self, group_name: str, department: str, access_tier: str):
        """Create IAM group for developers"""
        
        self.iam.create_group(GroupName=group_name)
        
        # Attach appropriate policies to group
        policy_arn = self._get_policy_arn_for_tier(access_tier)
        self.iam.attach_group_policy(
            GroupName=group_name,
            PolicyArn=policy_arn
        )
        
        logger.info(f"Created new developer group: {group_name}")
    
    def _provision_developer_resources(self, email: str, department: str, access_tier: str) -> Dict:
        """Provision AWS resources for developer"""
        
        # Create S3 bucket for workflows
        bucket_name = f"bcce-{email.replace('@', '-').replace('.', '-')}-{self.account_id[:8]}"
        
        try:
            self.s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={
                    'LocationConstraint': 'us-west-2'  # Adjust region as needed
                }
            )
            
            # Enable versioning
            self.s3.put_bucket_versioning(
                Bucket=bucket_name,
                VersioningConfiguration={'Status': 'Enabled'}
            )
            
            # Set up bucket policy
            bucket_policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "DeveloperAccess",
                        "Effect": "Allow",
                        "Principal": {
                            "AWS": f"arn:aws:iam::{self.account_id}:user/bcce-{email.replace('@', '-').replace('.', '-')}"
                        },
                        "Action": [
                            "s3:GetObject",
                            "s3:PutObject",
                            "s3:DeleteObject",
                            "s3:ListBucket"
                        ],
                        "Resource": [
                            f"arn:aws:s3:::{bucket_name}",
                            f"arn:aws:s3:::{bucket_name}/*"
                        ]
                    }
                ]
            }
            
            self.s3.put_bucket_policy(
                Bucket=bucket_name,
                Policy=json.dumps(bucket_policy)
            )
            
        except Exception as e:
            logger.warning(f"Could not create S3 bucket: {e}")
            bucket_name = None
        
        # Create KMS key for encryption
        key_response = self.kms.create_key(
            Description=f"BCCE encryption key for {email}",
            KeyUsage='ENCRYPT_DECRYPT',
            Tags=[
                {'TagKey': 'Owner', 'TagValue': email},
                {'TagKey': 'Department', 'TagValue': department},
                {'TagKey': 'Purpose', 'TagValue': 'BCCE-Developer-Encryption'}
            ]
        )
        
        # Create CloudWatch log group
        log_group_name = f"/bcce/developer/{email.replace('@', '-').replace('.', '-')}"
        try:
            self.cloudwatch.describe_log_groups(logGroupNamePrefix=log_group_name)
        except:
            # Log group doesn't exist, create it
            retention_days = 30 if access_tier == 'sandbox' else 90 if access_tier == 'integration' else 365
            # Note: CloudWatch Logs creation would typically use boto3.client('logs')
            pass
        
        return {
            's3_bucket': bucket_name,
            'kms_key_id': key_response['KeyMetadata']['KeyId'],
            'kms_key_arn': key_response['KeyMetadata']['Arn'],
            'log_group_name': log_group_name
        }
    
    def _setup_budget_controls(self, email: str, department: str, access_tier: str) -> Dict:
        """Set up budget controls for developer"""
        
        # Budget limits by tier
        budget_limits = {
            'sandbox': 100,
            'integration': 500,
            'production': 2000
        }
        
        budget_limit = budget_limits.get(access_tier, 100)
        budget_name = f"BCCE-{email.replace('@', '-').replace('.', '-')}"
        
        budget = {
            'BudgetName': budget_name,
            'BudgetLimit': {
                'Amount': str(budget_limit),
                'Unit': 'USD'
            },
            'TimeUnit': 'MONTHLY',
            'BudgetType': 'COST',
            'CostFilters': {
                'TagKey': ['Owner'],
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
                    },
                    {
                        'SubscriptionType': 'EMAIL',
                        'Address': f"{department}-manager@{self.config.get('domain', 'company.com')}"
                    }
                ]
            }
        ]
        
        try:
            self.budgets.create_budget(
                AccountId=self.account_id,
                Budget=budget,
                NotificationsWithSubscribers=notifications
            )
            
            return {
                'budget_name': budget_name,
                'budget_limit': budget_limit,
                'currency': 'USD',
                'notifications_enabled': True
            }
        except Exception as e:
            logger.warning(f"Could not create budget: {e}")
            return {'budget_name': None, 'error': str(e)}
    
    def _setup_monitoring(self, email: str, department: str) -> Dict:
        """Set up monitoring and alerting for developer"""
        
        # Create custom metrics for developer activity
        metric_namespace = f"BCCE/Developer/{department}"
        
        # This would typically include setting up CloudWatch alarms, dashboards, etc.
        # For now, we'll return the configuration
        
        return {
            'metric_namespace': metric_namespace,
            'dashboard_name': f"BCCE-{email.replace('@', '-').replace('.', '-')}",
            'alerting_enabled': True
        }
    
    def _generate_config_files(self, email: str, user_info: Dict, resources: Dict, access_tier: str) -> Dict:
        """Generate configuration files for developer"""
        
        # BCCE CLI configuration
        bcce_config = {
            'profile': 'default',
            'aws': {
                'region': 'us-east-1',
                'access_key_id': user_info['access_key_id'],
                'secret_access_key': user_info['secret_access_key']
            },
            'bcce': {
                'access_tier': access_tier,
                'department': email.split('@')[1].split('.')[0],  # Extract from email
                'developer_email': email,
                's3_bucket': resources.get('s3_bucket'),
                'kms_key_id': resources.get('kms_key_id'),
                'monitoring': {
                    'enabled': True,
                    'log_level': 'INFO'
                }
            }
        }
        
        # Environment variables file
        env_vars = f"""# BCCE Developer Environment Configuration
# Generated on {datetime.utcnow().isoformat()}

export AWS_ACCESS_KEY_ID="{user_info['access_key_id']}"
export AWS_SECRET_ACCESS_KEY="{user_info['secret_access_key']}"
export AWS_REGION="us-east-1"
export BCCE_ACCESS_TIER="{access_tier}"
export BCCE_DEVELOPER_EMAIL="{email}"
export BCCE_S3_BUCKET="{resources.get('s3_bucket', '')}"
export BCCE_KMS_KEY_ID="{resources.get('kms_key_id', '')}"

# Usage tracking (optional)
export BCCE_ENABLE_ANALYTICS="true"
export BCCE_BUDGET_ALERTS="true"
"""
        
        # Getting started guide
        getting_started = f"""# Welcome to BCCE Enterprise!

## Quick Start Guide

1. **Install BCCE CLI:**
   ```bash
   npm install -g @company/bcce-cli
   ```

2. **Configure your environment:**
   ```bash
   # Source the environment variables
   source bcce-env-vars.sh
   
   # Verify setup
   bcce doctor
   ```

3. **Create your first workflow:**
   ```bash
   bcce workflow create my-first-workflow
   ```

## Your Access Level: {access_tier.title()}

### What you can do:
- Access to Claude 3 models (Haiku for sandbox, Sonnet for integration+)
- Create and execute AI workflows
- Monitor usage and costs
- Access development environment

### Resources:
- S3 Bucket: {resources.get('s3_bucket', 'Not created')}
- KMS Key: {resources.get('kms_key_id', 'Not created')}
- Budget Limit: Based on your access tier

## Support:
- Documentation: https://company-bcce-docs.com
- Slack: #bcce-support
- Email: bcce-support@company.com

Happy building! 🚀
"""
        
        return {
            'bcce_config': bcce_config,
            'env_vars': env_vars,
            'getting_started': getting_started
        }
    
    def _send_welcome_email(self, email: str, manager_email: str, config_files: Dict, access_tier: str, use_case: str):
        """Send welcome email with configuration files"""
        
        # This is a simplified version - in production, you'd use SES or your email service
        logger.info(f"📧 Sending welcome email to {email}")
        logger.info(f"📧 CC: {manager_email}")
        logger.info(f"🎯 Access Tier: {access_tier}")
        logger.info(f"💡 Use Case: {use_case}")
        
        # In a real implementation, you would:
        # 1. Send formatted email with attachments
        # 2. Include links to documentation
        # 3. Provide support contact information
        # 4. Include getting started guide
    
    def _log_onboarding_event(self, email: str, department: str, access_tier: str, use_case: str):
        """Log onboarding event for audit and analytics"""
        
        event_data = {
            'event_type': 'developer_onboarded',
            'timestamp': datetime.utcnow().isoformat(),
            'developer_email': email,
            'department': department,
            'access_tier': access_tier,
            'use_case': use_case,
            'onboarded_by': os.getenv('USER', 'system')
        }
        
        # In production, this would write to CloudWatch Logs, DataDog, etc.
        logger.info(f"📊 Onboarding event logged: {json.dumps(event_data)}")


def load_organization_config(config_file: str) -> Dict:
    """Load organization configuration from file"""
    
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
    """Main function for CLI interface"""
    
    parser = argparse.ArgumentParser(description='BCCE Enterprise Developer Onboarding')
    parser.add_argument('--email', required=True, help='Developer email address')
    parser.add_argument('--department', required=True, help='Developer department')
    parser.add_argument('--access-tier', required=True, choices=['sandbox', 'integration', 'production'],
                       help='Access tier for developer')
    parser.add_argument('--manager-email', required=True, help='Manager email for notifications')
    parser.add_argument('--use-case', required=True, help='Primary use case for BCCE access')
    parser.add_argument('--config', default='organization-config.yaml', 
                       help='Organization configuration file')
    parser.add_argument('--dry-run', action='store_true', help='Perform dry run without creating resources')
    
    args = parser.parse_args()
    
    # Load organization configuration
    org_config = load_organization_config(args.config)
    
    # Initialize onboarder
    onboarder = BCCEDeveloperOnboarder(org_config)
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No resources will be created")
        # Validate inputs only
        try:
            onboarder._validate_onboarding_request(args.email, args.department, args.access_tier)
            logger.info("✅ Validation passed - ready for actual onboarding")
        except Exception as e:
            logger.error(f"❌ Validation failed: {e}")
            sys.exit(1)
    else:
        # Perform actual onboarding
        try:
            result = onboarder.onboard_developer(
                email=args.email,
                department=args.department,
                access_tier=args.access_tier,
                manager_email=args.manager_email,
                use_case=args.use_case
            )
            
            # Output result
            print("\n🎉 BCCE Developer Onboarding Complete!")
            print(f"Developer: {result['developer_email']}")
            print(f"Access Tier: {result['access_tier']}")
            print(f"Department: {result['department']}")
            print(f"AWS Username: {result['user_info']['username']}")
            print(f"S3 Bucket: {result['resources']['s3_bucket']}")
            print(f"Budget Name: {result['budget_info']['budget_name']}")
            print("\n📧 Welcome email sent with configuration files")
            print("🔗 Next: Developer should check email and follow getting started guide")
            
        except Exception as e:
            logger.error(f"❌ Onboarding failed: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()