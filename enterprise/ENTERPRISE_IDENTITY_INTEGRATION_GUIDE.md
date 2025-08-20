# BCCE Enterprise Identity Provider Integration Guide

## 🎯 Overview

This guide provides comprehensive instructions for integrating BCCE + AWS Solutions Library with enterprise identity providers. We cover the most common enterprise scenarios and provide automation scripts for seamless setup.

---

## 📊 Enterprise Identity Landscape Analysis

### **Most Common Enterprise Identity Systems:**

| Identity Provider | Enterprise Usage | Implementation Complexity | BCCE Support |
|------------------|------------------|---------------------------|--------------|
| **Active Directory (ADFS)** | 85% of enterprises | Medium | ✅ Full |
| **AWS IAM Identity Center** | 40% (growing rapidly) | Low | ✅ Full |
| **Google Workspace** | 30% mid-market | Low | ✅ Full |
| **Okta** | 25% enterprises | Low | ✅ Full |
| **Azure AD** | 60% Microsoft shops | Medium | ✅ Full |
| **Direct Cognito** | 15% smaller orgs | Low | ✅ Full |

---

## 🚀 Quick Start by Identity Provider

### **Option 1: AWS IAM Identity Center (Recommended for AWS-native orgs)**

**Best for**: Organizations already using AWS, wanting minimal complexity

```bash
# Step 1: Ensure Identity Center is set up
aws sso-admin list-instances --region us-east-1

# Step 2: Configure Identity Center integration
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type aws-identity-center \
  --domain-name yourcompany

# Step 3: Assign users to BCCE permission set
aws sso-admin list-permission-sets \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef
```

**Advantages:**
- ✅ Native AWS integration
- ✅ No external identity provider needed
- ✅ Built-in MFA and session management
- ✅ Automatic credential rotation

---

### **Option 2: Active Directory Federation Services (ADFS)**

**Best for**: Traditional enterprises with on-premises Active Directory

```bash
# Step 1: Get your ADFS metadata URL
# Typically: https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml

# Step 2: Configure ADFS integration
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type adfs \
  --metadata-url "https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml" \
  --domain-name yourcompany.com

# Step 3: Configure ADFS relying party trust (see detailed steps below)
```

**ADFS Configuration Steps:**
1. Open ADFS Management Console
2. Add Relying Party Trust → Import from metadata URL (provided by script)
3. Configure Claim Rules:
   - Email Address → email
   - Given Name → given_name  
   - Surname → family_name
   - Department → custom:department
   - Access Tier → custom:access_tier

---

### **Option 3: Google Workspace SAML**

**Best for**: Organizations using Google Workspace/G Suite

```bash
# Step 1: Set up SAML app in Google Admin Console
# Apps → Web and mobile apps → Add app → Add custom SAML app

# Step 2: Get your Google IDP ID (from the SAML app URL)
GOOGLE_IDP_ID="your-google-idp-id-here"

# Step 3: Configure Google Workspace integration
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type google-workspace \
  --google-idp-id "$GOOGLE_IDP_ID" \
  --domain-name yourcompany.com
```

---

### **Option 4: Azure Active Directory (Azure AD)**

**Best for**: Microsoft 365/Azure-centric organizations

```bash
# Step 1: Create Enterprise Application in Azure AD
# Azure Portal → Azure Active Directory → Enterprise Applications → New Application

# Step 2: Configure SAML SSO and get metadata URL
AZURE_METADATA_URL="https://login.microsoftonline.com/your-tenant-id/federationmetadata/2007-06/federationmetadata.xml"

# Step 3: Configure Azure AD integration
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type generic-saml \
  --metadata-url "$AZURE_METADATA_URL" \
  --provider-name "AzureAD"
```

---

### **Option 5: Okta SAML**

**Best for**: Organizations using Okta as primary IdP

```bash
# Step 1: Create SAML application in Okta Admin Console
# Applications → Create App Integration → SAML 2.0

# Step 2: Get Okta metadata URL
OKTA_METADATA_URL="https://yourcompany.okta.com/app/your-app-id/sso/saml/metadata"

# Step 3: Configure Okta integration
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type generic-saml \
  --metadata-url "$OKTA_METADATA_URL" \
  --provider-name "Okta"
```

---

### **Option 6: Direct Cognito (No External IdP)**

**Best for**: Smaller organizations or isolated deployments

```bash
# No additional configuration needed - already set up!
# Users can register directly in Cognito or be created via onboarding script

# Create test user
./unified-onboarding-enhanced.py \
  --email user@yourcompany.com \
  --department engineering \
  --access-tier sandbox \
  --manager-email manager@yourcompany.com \
  --use-case "AI development" \
  --idp-provider cognito
```

---

## 🔧 Advanced Configuration Scenarios

### **Hybrid Multi-Provider Setup**

For organizations with multiple identity sources:

```bash
# Configure primary provider (e.g., ADFS)
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type adfs \
  --metadata-url "https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml" \
  --domain-name yourcompany.com

# Add secondary provider (e.g., Google for contractors)
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type google-workspace \
  --google-idp-id "your-google-idp-id" \
  --domain-name yourcompany.com

# Users can choose provider at login
```

### **Department-Specific Identity Routing**

```yaml
# Add to bcce-unified-config.yaml
identity_routing:
  engineering: "CompanyADFS"
  contractors: "GoogleWorkspace"  
  external_partners: "Okta"
  default: "AWSIdentityCenter"
```

---

## 🏢 Enterprise-Specific Implementation Guides

### **Fortune 500 / Large Enterprise Setup**

**Recommended Stack:**
1. **Primary**: Active Directory Federation Services (ADFS)
2. **Secondary**: AWS IAM Identity Center for AWS-native teams
3. **External**: Okta for partners/contractors

**Implementation:**
```bash
# 1. Deploy base infrastructure
./deploy-layered-integration.sh --organization-name "YourCorpName"

# 2. Configure ADFS for primary authentication
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type adfs \
  --metadata-url "https://adfs.yourcorp.com/FederationMetadata/2007-06/FederationMetadata.xml" \
  --domain-name yourcorp.com

# 3. Set up Identity Center for cloud-native teams
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type aws-identity-center \
  --domain-name yourcorp-aws

# 4. Configure department mapping in ADFS claim rules
# Engineering → ADFS
# Cloud Engineering → Identity Center  
# Contractors → External Okta
```

### **Mid-Market / Growing Company Setup**

**Recommended Stack:**
1. **Primary**: Google Workspace or AWS Identity Center
2. **Fallback**: Direct Cognito for special cases

**Implementation:**
```bash
# Option A: Google Workspace Primary
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type google-workspace \
  --google-idp-id "your-workspace-idp-id"

# Option B: AWS Identity Center Primary  
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type aws-identity-center \
  --domain-name yourcompany
```

### **Startup / Small Company Setup**

**Recommended Stack:**
1. **Primary**: Direct Cognito with optional Google Workspace

**Implementation:**
```bash
# Deploy with Cognito-only setup
./deploy-layered-integration.sh --organization-name "YourStartup"

# Optional: Add Google Workspace later
./identity-provider-configurator.py \
  --config ../config/bcce-unified-config.yaml \
  --provider-type google-workspace \
  --google-idp-id "your-workspace-idp-id"
```

---

## 🔐 Security and Compliance Considerations

### **Enterprise Security Requirements**

| Requirement | Implementation | Configuration |
|-------------|----------------|---------------|
| **MFA Enforcement** | Identity provider level | Required for production tier |
| **Session Management** | Cognito + IdP sessions | 8-hour max, auto-refresh |
| **Audit Logging** | CloudTrail + IdP logs | Full authentication trail |
| **Conditional Access** | IdP policies + Cognito | IP restrictions, device trust |
| **Just-in-Time Access** | Dynamic group assignment | Time-limited access grants |

### **Compliance Framework Support**

```yaml
# SOC2 Configuration
compliance:
  soc2:
    authentication_logging: enabled
    session_timeout: "8h"
    mfa_required: true
    
# HIPAA Configuration  
compliance:
  hipaa:
    encryption_in_transit: required
    audit_trail: comprehensive
    access_controls: strict
    
# PCI-DSS Configuration
compliance:
  pci_dss:
    network_segmentation: enabled
    access_logging: detailed
    credential_management: automated
```

---

## 🧪 Testing and Validation

### **End-to-End Authentication Test**

```bash
# Test authentication flow
./test-layered-integration.py --verbose

# Test specific identity provider
python3 -c "
import boto3
cognito = boto3.client('cognito-idp')
response = cognito.admin_initiate_auth(
    UserPoolId='your-pool-id',
    ClientId='your-client-id',
    AuthFlow='ADMIN_NO_SRP_AUTH',
    AuthParameters={
        'USERNAME': 'test@yourcompany.com',
        'PASSWORD': 'test-password'
    }
)
print('Authentication successful:', response['AuthenticationResult']['AccessToken'][:20] + '...')
"
```

### **Department Access Validation**

```bash
# Test department group assignment
aws cognito-idp admin_list_groups_for_user \
  --user-pool-id your-pool-id \
  --username test-user@yourcompany.com

# Test budget access
aws budgets describe-budgets \
  --account-id $(aws sts get-caller-identity --query Account --output text)
```

---

## 🚨 Troubleshooting Common Issues

### **ADFS Integration Issues**

```bash
# Check ADFS metadata accessibility
curl -I "https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml"

# Validate claim mapping
aws cognito-idp describe-identity-provider \
  --user-pool-id your-pool-id \
  --provider-name CompanyADFS
```

### **AWS Identity Center Issues**

```bash
# Check SSO instance status
aws sso-admin list-instances --region us-east-1

# Verify permission set assignment
aws sso-admin list-accounts-for-provisioned-permission-set \
  --instance-arn your-instance-arn \
  --permission-set-arn your-permission-set-arn
```

### **General Cognito Issues**

```bash
# Check user pool configuration
aws cognito-idp describe-user-pool --user-pool-id your-pool-id

# List identity providers
aws cognito-idp list-identity-providers --user-pool-id your-pool-id

# Test user authentication
aws cognito-idp admin-get-user \
  --user-pool-id your-pool-id \
  --username test@yourcompany.com
```

---

## 📈 Migration Strategies

### **From Existing Identity System**

1. **Assessment Phase** (Week 1)
   - Audit current identity providers
   - Map user groups to BCCE departments
   - Plan migration timeline

2. **Parallel Setup** (Week 2-3)
   - Deploy BCCE with new identity integration
   - Test with pilot group of 5-10 users
   - Validate all workflows

3. **Gradual Migration** (Week 4-8)
   - Migrate department by department
   - Maintain parallel access during transition
   - Monitor and adjust

4. **Cutover** (Week 9)
   - Complete migration
   - Decommission old systems
   - Post-migration validation

### **Choosing the Right Identity Provider**

**Decision Matrix:**

```
Current State → Recommended BCCE Integration

On-premises AD only → ADFS integration
Microsoft 365 heavy → Azure AD integration  
Google Workspace → Google Workspace SAML
AWS-native org → AWS Identity Center
Multi-cloud/hybrid → AWS Identity Center + ADFS
Startup/simple → Direct Cognito
Complex enterprise → ADFS primary + Identity Center secondary
```

---

## 🎯 Success Metrics

### **Week 1-2: Setup Validation**
- [ ] Identity provider integration successful
- [ ] Test users can authenticate end-to-end
- [ ] Department groups properly assigned
- [ ] BCCE governance features accessible

### **Month 1: Pilot Success**
- [ ] 10+ pilot users onboarded successfully
- [ ] Zero authentication failures
- [ ] All identity provider features working
- [ ] Positive user feedback (>8/10)

### **Month 3: Production Readiness**
- [ ] 100+ users across all departments
- [ ] <2% authentication error rate
- [ ] Full compliance audit passed
- [ ] Identity provider failover tested

---

## 📞 Support and Resources

### **Documentation References**
- **AWS Solutions Library**: Authentication patterns and best practices
- **BCCE Integration Strategy**: `AWS_SOLUTIONS_INTEGRATION_STRATEGY.md`
- **Deployment Guide**: `LAYERED_INTEGRATION_DEPLOYMENT_GUIDE.md`

### **Configuration Tools**
- **Identity Provider Setup**: `./identity-provider-configurator.py`
- **Integration Testing**: `./test-layered-integration.py`
- **User Onboarding**: `./unified-onboarding-enhanced.py`

### **Common Configuration Files**
- **Main Config**: `../config/bcce-unified-config.yaml`
- **Terraform State**: `./terraform.tfstate`
- **Identity Provider Results**: `identity-provider-config-*.json`

**Ready for enterprise identity integration across any organization size and complexity!** 🚀
    
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
            region = boto3.Session().region_name
            sso_metadata_url = f"https://portal.sso.{region}.amazonaws.com/saml/metadata/{instance_arn.split('/')[-1]}"
            
            try:
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
                        'custom:department': 'http://schemas.amazon.com/claims/department'
                    }
                )
            except self.cognito.exceptions.DuplicateProviderException:
                logger.info("Identity provider already exists")
            
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
            try:
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
            except self.cognito.exceptions.DuplicateProviderException:
                logger.info("ADFS provider already exists")
            
            # Get Cognito SAML metadata for ADFS configuration
            pool_details = self.cognito.describe_user_pool(UserPoolId=self.user_pool_id)
            region = boto3.Session().region_name
            cognito_metadata_url = f"https://cognito-idp.{region}.amazonaws.com/{self.user_pool_id}/saml2/metadata"
            cognito_domain = pool_details['UserPool'].get('Domain', f"bcce-{self.user_pool_id[:8]}")
            
            return {
                'status': 'success',
                'provider_name': 'CompanyADFS',
                'entity_id': entity_id,
                'cognito_metadata_url': cognito_metadata_url,
                'cognito_acs_url': f"https://{cognito_domain}.auth.{region}.amazoncognito.com/saml2/idpresponse",
                'cognito_entity_id': f"urn:amazon:cognito:sp:{self.user_pool_id}",
                'next_steps': [
                    'Configure ADFS relying party trust using provided URLs',
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
            try:
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
            except self.cognito.exceptions.DuplicateProviderException:
                logger.info("Google Workspace provider already exists")
            
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
    
    def configure_generic_saml(self, metadata_url: str, provider_name: str, attribute_mapping: Dict = None) -> Dict:
        """Configure generic SAML identity provider"""
        
        logger.info(f"🔧 Configuring generic SAML provider: {provider_name}...")
        
        if not attribute_mapping:
            attribute_mapping = {
                'email': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                'given_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                'family_name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
            }
        
        try:
            # Create SAML identity provider
            try:
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
            except self.cognito.exceptions.DuplicateProviderException:
                logger.info(f"{provider_name} provider already exists")
            
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
                
                # Get current client details
                client_details = self.cognito.describe_user_pool_client(
                    UserPoolId=self.user_pool_id,
                    ClientId=client_id
                )
                
                current_providers = client_details['UserPoolClient'].get('SupportedIdentityProviders', [])
                new_providers = list(set(current_providers + provider_names + ['COGNITO']))
                
                # Update client to support identity providers
                self.cognito.update_user_pool_client(
                    UserPoolId=self.user_pool_id,
                    ClientId=client_id,
                    SupportedIdentityProviders=new_providers
                )
                
                logger.info(f"Updated app client {client_id} with providers: {new_providers}")
            
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
        
        # Default attribute mapping for common SAML providers
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
        
        # Print configuration details for ADFS
        if args.provider_type == 'adfs':
            print(f"\n📋 ADFS Configuration Details:")
            print(f"  Cognito Entity ID: {result['cognito_entity_id']}")
            print(f"  ACS URL: {result['cognito_acs_url']}")
            print(f"  Metadata URL: {result['cognito_metadata_url']}")
        
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