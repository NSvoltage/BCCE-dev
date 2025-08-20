#!/usr/bin/env python3
"""
BCCE Enterprise Identity Provider Configuration
Automated setup for common enterprise identity scenarios
"""

import argparse
import boto3
import json
import yaml
import logging
import sys
from typing import Dict, Optional
import xml.etree.ElementTree as ET
import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class IdentityProviderConfigurator:
    """Configure identity providers for BCCE + AWS Solutions Library integration"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.cognito = boto3.client('cognito-idp')
        self.sso_admin = boto3.client('sso-admin')
        self.identity_store = boto3.client('identitystore')
        self.sts = boto3.client('sts')
        
        self.user_pool_id = config.get('authentication', {}).get('user_pool_id')
        if not self.user_pool_id:
            raise ValueError("User Pool ID must be configured")
    
    def configure_aws_identity_center(self, domain_name: str, organization_name: str) -> Dict:
        """Configure AWS IAM Identity Center as identity provider"""
        
        logger.info("🔧 Configuring AWS IAM Identity Center integration...")
        
        try:
            # List existing SSO instances
            response = self.sso_admin.list_instances()
            instances = response.get('Instances', [])
            
            if instances:
                instance_arn = instances[0]['InstanceArn']
                identity_store_id = instances[0]['IdentityStoreId']
                logger.info(f"Using existing SSO instance: {instance_arn}")
            else:
                logger.error("No AWS IAM Identity Center instance found. Please set up Identity Center first.")
                return {'status': 'error', 'message': 'No Identity Center instance'}
            
            # Create permission set for BCCE users
            permission_set_name = "BCCE-Developers"
            try:
                ps_response = self.sso_admin.create_permission_set(
                    InstanceArn=instance_arn,
                    Name=permission_set_name,
                    Description="BCCE Developer Access with Bedrock permissions",
                    SessionDuration="PT8H",  # 8 hours
                    Tags=[
                        {'Key': 'Purpose', 'Value': 'BCCE-Integration'},
                        {'Key': 'ManagedBy', 'Value': 'BCCE-Automation'}
                    ]
                )
                permission_set_arn = ps_response['PermissionSet']['PermissionSetArn']
                logger.info(f"Created permission set: {permission_set_name}")
                
            except self.sso_admin.exceptions.ConflictException:
                # Permission set already exists
                ps_list = self.sso_admin.list_permission_sets(InstanceArn=instance_arn)
                for ps_arn in ps_list['PermissionSets']:
                    ps_details = self.sso_admin.describe_permission_set(
                        InstanceArn=instance_arn,
                        PermissionSetArn=ps_arn
                    )
                    if ps_details['PermissionSet']['Name'] == permission_set_name:
                        permission_set_arn = ps_arn
                        break
                logger.info(f"Using existing permission set: {permission_set_name}")
            
            # Attach Bedrock policies
            bedrock_policies = [
                "arn:aws:iam::aws:policy/AmazonBedrockFullAccess",
                "arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"
            ]
            
            for policy_arn in bedrock_policies:
                try:
                    self.sso_admin.attach_managed_policy_to_permission_set(
                        InstanceArn=instance_arn,
                        PermissionSetArn=permission_set_arn,
                        ManagedPolicyArn=policy_arn
                    )
                    logger.info(f"Attached policy: {policy_arn}")
                except Exception as e:
                    logger.warning(f"Policy already attached or error: {e}")
            
            # Configure Cognito to use Identity Center SAML
            sso_metadata_url = f"https://portal.sso.us-east-1.amazonaws.com/saml/metadata/{instance_arn.split('/')[-1]}"
            
            idp_response = self.cognito.create_identity_provider(
                UserPoolId=self.user_pool_id,
                ProviderName="AWSIdentityCenter",
                ProviderType="SAML",
                ProviderDetails={
                    'MetadataURL': sso_metadata_url,
                    'RequestSigningAlgorithm': 'rsa-sha256'
                },
                AttributeMapping={
                    'email': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                    'given_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                    'family_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
                    'custom:department': 'http://schemas.yourcompany.com/identity/claims/department'
                }
            )
            
            return {
                'status': 'success',
                'provider_name': 'AWSIdentityCenter',
                'instance_arn': instance_arn,
                'permission_set_arn': permission_set_arn,
                'identity_store_id': identity_store_id,
                'sso_start_url': f"https://{domain_name}.awsapps.com/start",
                'next_steps': [
                    'Assign users to the BCCE-Developers permission set',
                    'Update Cognito app client to include AWSIdentityCenter provider',
                    'Test authentication flow'
                ]
            }
            
        except Exception as e:
            logger.error(f"Error configuring AWS Identity Center: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def configure_active_directory_federation(self, adfs_metadata_url: str, domain_name: str) -> Dict:
        """Configure Active Directory Federation Services (ADFS) integration"""
        
        logger.info("🔧 Configuring Active Directory Federation...")
        
        try:
            # Validate ADFS metadata URL
            response = requests.get(adfs_metadata_url, timeout=10)
            if response.status_code != 200:
                raise Exception(f"Cannot access ADFS metadata: {response.status_code}")
            
            # Parse metadata to extract entity ID
            root = ET.fromstring(response.content)
            entity_id = root.get('entityID', adfs_metadata_url)
            
            # Create SAML identity provider
            idp_response = self.cognito.create_identity_provider(
                UserPoolId=self.user_pool_id,
                ProviderName="CompanyADFS",
                ProviderType="SAML",
                ProviderDetails={
                    'MetadataURL': adfs_metadata_url,
                    'RequestSigningAlgorithm': 'rsa-sha256',
                    'EncryptedResponses': 'false'
                },
                AttributeMapping={
                    'email': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                    'given_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                    'family_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
                    'custom:department': f'http://schemas.{domain_name}/claims/department',
                    'custom:access_tier': f'http://schemas.{domain_name}/claims/access_tier'
                }
            )
            
            # Get Cognito SAML metadata for ADFS configuration
            pool_details = self.cognito.describe_user_pool(UserPoolId=self.user_pool_id)
            region = boto3.Session().region_name
            cognito_metadata_url = f"https://cognito-idp.{region}.amazonaws.com/{self.user_pool_id}/saml2/metadata"
            
            return {
                'status': 'success',
                'provider_name': 'CompanyADFS',
                'entity_id': entity_id,
                'cognito_metadata_url': cognito_metadata_url,
                'cognito_acs_url': f"https://{pool_details['UserPool']['Domain']}.auth.{region}.amazoncognito.com/saml2/idpresponse",
                'next_steps': [
                    'Configure ADFS relying party trust using Cognito metadata URL',
                    'Set up claim rules in ADFS for department and access_tier',
                    'Update Cognito app client to include CompanyADFS provider',
                    'Test authentication flow'
                ]
            }
            
        except Exception as e:
            logger.error(f"Error configuring ADFS: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def configure_google_workspace(self, google_idp_id: str, domain_name: str) -> Dict:
        """Configure Google Workspace SAML integration"""
        
        logger.info("🔧 Configuring Google Workspace integration...")
        
        try:
            google_metadata_url = f"https://accounts.google.com/o/saml2/idp?idpid={google_idp_id}"
            
            # Create SAML identity provider
            idp_response = self.cognito.create_identity_provider(
                UserPoolId=self.user_pool_id,
                ProviderName="GoogleWorkspace",
                ProviderType="SAML",
                ProviderDetails={
                    'MetadataURL': google_metadata_url,
                    'RequestSigningAlgorithm': 'rsa-sha256'
                },
                AttributeMapping={
                    'email': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                    'given_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                    'family_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
                }
            )
            
            return {
                'status': 'success',
                'provider_name': 'GoogleWorkspace',
                'google_idp_id': google_idp_id,
                'next_steps': [
                    'Configure SAML app in Google Admin Console',
                    'Set ACS URL and Entity ID in Google SAML app',
                    'Update Cognito app client to include GoogleWorkspace provider'
                ]
            }
            
        except Exception as e:
            logger.error(f"Error configuring Google Workspace: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def configure_generic_saml(self, metadata_url: str, provider_name: str, attribute_mapping: Dict) -> Dict:
        """Configure generic SAML identity provider"""
        
        logger.info(f"🔧 Configuring generic SAML provider: {provider_name}...")
        
        try:
            # Create SAML identity provider
            idp_response = self.cognito.create_identity_provider(
                UserPoolId=self.user_pool_id,
                ProviderName=provider_name,
                ProviderType="SAML", 
                ProviderDetails={
                    'MetadataURL': metadata_url,
                    'RequestSigningAlgorithm': 'rsa-sha256'
                },
                AttributeMapping=attribute_mapping
            )
            
            return {
                'status': 'success',
                'provider_name': provider_name,
                'metadata_url': metadata_url,
                'next_steps': [
                    'Configure relying party/SAML app in your IdP',
                    'Update Cognito app client to include the new provider',
                    'Test authentication flow'
                ]
            }
            
        except Exception as e:
            logger.error(f"Error configuring SAML provider: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def update_cognito_app_client(self, provider_names: list) -> Dict:
        """Update Cognito app client to support identity providers"""
        
        try:
            # Get app clients
            clients_response = self.cognito.list_user_pool_clients(UserPoolId=self.user_pool_id)
            
            for client in clients_response['UserPoolClients']:
                client_id = client['ClientId']
                
                # Update client to support identity providers
                self.cognito.update_user_pool_client(
                    UserPoolId=self.user_pool_id,
                    ClientId=client_id,
                    SupportedIdentityProviders=provider_names + ['COGNITO']
                )
                
                logger.info(f"Updated app client {client_id} with providers: {provider_names}")
            
            return {'status': 'success', 'updated_clients': len(clients_response['UserPoolClients'])}
            
        except Exception as e:
            logger.error(f"Error updating app clients: {e}")
            return {'status': 'error', 'message': str(e)}


def load_config(config_file: str) -> Dict:
    """Load configuration file"""
    try:
        with open(config_file, 'r') as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        sys.exit(1)


def main():
    """Main configuration function"""
    
    parser = argparse.ArgumentParser(description='BCCE Identity Provider Configuration')
    parser.add_argument('--config', required=True, help='Configuration file path')
    parser.add_argument('--provider-type', required=True, 
                       choices=['aws-identity-center', 'adfs', 'google-workspace', 'generic-saml'],
                       help='Identity provider type')
    
    # Provider-specific arguments
    parser.add_argument('--domain-name', help='Organization domain name')
    parser.add_argument('--metadata-url', help='SAML metadata URL')
    parser.add_argument('--google-idp-id', help='Google Workspace IDP ID')
    parser.add_argument('--provider-name', help='Custom provider name for generic SAML')
    
    args = parser.parse_args()
    
    # Load configuration
    config = load_config(args.config)
    configurator = IdentityProviderConfigurator(config)
    
    # Configure based on provider type
    if args.provider_type == 'aws-identity-center':
        if not args.domain_name:
            logger.error("--domain-name required for AWS Identity Center")
            sys.exit(1)
        
        result = configurator.configure_aws_identity_center(
            args.domain_name, 
            config.get('organization', {}).get('name', 'Company')
        )
        
    elif args.provider_type == 'adfs':
        if not args.metadata_url or not args.domain_name:
            logger.error("--metadata-url and --domain-name required for ADFS")
            sys.exit(1)
        
        result = configurator.configure_active_directory_federation(
            args.metadata_url,
            args.domain_name
        )
        
    elif args.provider_type == 'google-workspace':
        if not args.google_idp_id:
            logger.error("--google-idp-id required for Google Workspace")
            sys.exit(1)
        
        result = configurator.configure_google_workspace(
            args.google_idp_id,
            args.domain_name or 'yourcompany.com'
        )
        
    elif args.provider_type == 'generic-saml':
        if not args.metadata_url or not args.provider_name:
            logger.error("--metadata-url and --provider-name required for generic SAML")
            sys.exit(1)
        
        # Default attribute mapping
        attribute_mapping = {
            'email': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
            'given_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
            'family_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
        }
        
        result = configurator.configure_generic_saml(
            args.metadata_url,
            args.provider_name,
            attribute_mapping
        )
    
    # Update app clients if successful
    if result['status'] == 'success':
        client_result = configurator.update_cognito_app_client([result['provider_name']])
        result['app_client_update'] = client_result
    
    # Output results
    print("\n" + "="*80)
    print("🔐 Identity Provider Configuration Results")
    print("="*80)
    print(f"Status: {result['status'].upper()}")
    
    if result['status'] == 'success':
        print(f"Provider: {result['provider_name']}")
        if 'next_steps' in result:
            print("\n📋 Next Steps:")
            for i, step in enumerate(result['next_steps'], 1):
                print(f"  {i}. {step}")
    else:
        print(f"Error: {result.get('message', 'Unknown error')}")
    
    print("="*80)
    
    # Save results to file
    output_file = f"identity-provider-config-{args.provider_type}.json"
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2)
    
    print(f"📄 Detailed results saved to: {output_file}")


if __name__ == "__main__":
    main()