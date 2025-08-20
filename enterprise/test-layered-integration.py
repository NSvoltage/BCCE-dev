#!/usr/bin/env python3
"""
BCCE + AWS Solutions Library Layered Integration Test Suite
Comprehensive testing of the integrated solution
"""

import argparse
import boto3
import json
import yaml
import logging
import os
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional
import subprocess
import tempfile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class LayeredIntegrationTester:
    """Test suite for BCCE + AWS Solutions Library integration"""
    
    def __init__(self, config_file: str = None):
        self.config = self._load_config(config_file)
        self.test_results = []
        self.failed_tests = []
        
        # Initialize AWS clients
        self.cognito = boto3.client('cognito-idp')
        self.s3 = boto3.client('s3')
        self.budgets = boto3.client('budgets')
        self.cloudwatch = boto3.client('cloudwatch')
        self.sts = boto3.client('sts')
        self.account_id = self.sts.get_caller_identity()['Account']
        
        # Test configuration
        self.test_email = f"test-user-{int(time.time())}@testdomain.com"
        self.test_department = "engineering"
        self.test_access_tier = "sandbox"
    
    def _load_config(self, config_file: str) -> Dict:
        """Load configuration file"""
        
        if not config_file:
            # Try to find config file
            possible_configs = [
                '../config/bcce-unified-config.yaml',
                './config/bcce-unified-config.yaml',
                './bcce-unified-config.yaml'
            ]
            
            for config_path in possible_configs:
                if os.path.exists(config_path):
                    config_file = config_path
                    break
            else:
                logger.warning("No configuration file found, using minimal test config")
                return self._get_minimal_test_config()
        
        try:
            with open(config_file, 'r') as f:
                if config_file.endswith('.yaml') or config_file.endswith('.yml'):
                    return yaml.safe_load(f)
                else:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")
            return self._get_minimal_test_config()
    
    def _get_minimal_test_config(self) -> Dict:
        """Get minimal configuration for testing"""
        
        return {
            'organization': {
                'name': 'TestOrg',
                'environment': 'test',
                'region': 'us-east-1'
            },
            'authentication': {
                'provider': 'aws_solutions_library',
                'method': 'cognito_oidc',
                'user_pool_id': None  # Will be discovered
            },
            'governance': {
                'provider': 'bcce',
                'analytics_bucket': None,  # Will be discovered
                'kms_key_id': None
            },
            'departments': {
                'engineering': {
                    'budget_limit': 10000,
                    'access_tiers': ['sandbox', 'integration', 'production']
                }
            }
        }
    
    def run_all_tests(self) -> Dict:
        """Run complete test suite"""
        
        logger.info("🧪 Starting BCCE + AWS Solutions Library Integration Test Suite")
        start_time = time.time()
        
        # Test phases
        test_phases = [
            ("Infrastructure Discovery", self.test_infrastructure_discovery),
            ("Cognito Integration", self.test_cognito_integration),
            ("Department Groups", self.test_department_groups),
            ("BCCE Governance Resources", self.test_governance_resources),
            ("Budget Controls", self.test_budget_controls),
            ("Analytics Infrastructure", self.test_analytics_infrastructure),
            ("Unified Onboarding", self.test_unified_onboarding),
            ("Configuration Generation", self.test_configuration_generation),
            ("Monitoring and Alerts", self.test_monitoring_alerts),
            ("Integration Validation", self.test_integration_validation)
        ]
        
        for phase_name, test_function in test_phases:
            logger.info(f"\n📋 Testing: {phase_name}")
            try:
                result = test_function()
                self.test_results.append({
                    'phase': phase_name,
                    'status': 'PASSED' if result else 'FAILED',
                    'timestamp': datetime.utcnow().isoformat(),
                    'details': result if isinstance(result, dict) else {}
                })
                
                if result:
                    logger.info(f"✅ {phase_name}: PASSED")
                else:
                    logger.error(f"❌ {phase_name}: FAILED")
                    self.failed_tests.append(phase_name)
                    
            except Exception as e:
                logger.error(f"❌ {phase_name}: ERROR - {str(e)}")
                self.failed_tests.append(phase_name)
                self.test_results.append({
                    'phase': phase_name,
                    'status': 'ERROR',
                    'error': str(e),
                    'timestamp': datetime.utcnow().isoformat()
                })
        
        # Generate test report
        duration = time.time() - start_time
        return self._generate_test_report(duration)
    
    def test_infrastructure_discovery(self) -> bool:
        """Test discovery of existing infrastructure"""
        
        logger.info("Discovering existing infrastructure...")
        
        # Discover Cognito User Pool
        try:
            response = self.cognito.list_user_pools(MaxResults=50)
            claude_pools = [
                pool for pool in response['UserPools']
                if 'claude' in pool['Name'].lower()
            ]
            
            if claude_pools:
                self.config['authentication']['user_pool_id'] = claude_pools[0]['Id']
                logger.info(f"Found Cognito User Pool: {claude_pools[0]['Name']}")
            else:
                logger.warning("No Claude Code User Pool found")
                
        except Exception as e:
            logger.error(f"Error discovering Cognito pools: {e}")
            return False
        
        # Discover BCCE resources
        try:
            response = self.s3.list_buckets()
            bcce_buckets = [
                bucket['Name'] for bucket in response['Buckets']
                if 'bcce' in bucket['Name'].lower() and 'analytics' in bucket['Name'].lower()
            ]
            
            if bcce_buckets:
                self.config['governance']['analytics_bucket'] = bcce_buckets[0]
                logger.info(f"Found BCCE Analytics Bucket: {bcce_buckets[0]}")
            else:
                logger.warning("No BCCE Analytics bucket found")
                
        except Exception as e:
            logger.error(f"Error discovering S3 buckets: {e}")
            return False
        
        return True
    
    def test_cognito_integration(self) -> bool:
        """Test Cognito User Pool integration"""
        
        user_pool_id = self.config.get('authentication', {}).get('user_pool_id')
        if not user_pool_id:
            logger.error("No User Pool ID configured")
            return False
        
        try:
            # Test User Pool details
            pool_details = self.cognito.describe_user_pool(UserPoolId=user_pool_id)
            logger.info(f"User Pool Details: {pool_details['UserPool']['Name']}")
            
            # Check for BCCE custom attributes
            custom_attributes = []
            schema = pool_details['UserPool'].get('Schema', [])
            for attr in schema:
                if attr['Name'].startswith('custom:'):
                    custom_attributes.append(attr['Name'])
            
            expected_attributes = [
                'custom:department',
                'custom:access_tier',
                'custom:budget_limit',
                'custom:manager_email'
            ]
            
            missing_attributes = set(expected_attributes) - set(custom_attributes)
            if missing_attributes:
                logger.warning(f"Missing custom attributes: {missing_attributes}")
            else:
                logger.info("✅ All BCCE custom attributes found")
            
            return len(missing_attributes) == 0
            
        except Exception as e:
            logger.error(f"Error testing Cognito integration: {e}")
            return False
    
    def test_department_groups(self) -> bool:
        """Test department groups in Cognito"""
        
        user_pool_id = self.config.get('authentication', {}).get('user_pool_id')
        if not user_pool_id:
            return False
        
        try:
            # List groups
            response = self.cognito.list_groups(UserPoolId=user_pool_id)
            group_names = [group['GroupName'] for group in response['Groups']]
            
            # Check for department groups
            departments = self.config.get('departments', {}).keys()
            missing_groups = set(departments) - set(group_names)
            
            if missing_groups:
                logger.warning(f"Missing department groups: {missing_groups}")
                return False
            else:
                logger.info(f"✅ All department groups found: {group_names}")
                return True
                
        except Exception as e:
            logger.error(f"Error testing department groups: {e}")
            return False
    
    def test_governance_resources(self) -> bool:
        """Test BCCE governance resources"""
        
        analytics_bucket = self.config.get('governance', {}).get('analytics_bucket')
        if not analytics_bucket:
            logger.warning("No analytics bucket configured")
            return False
        
        try:
            # Test S3 bucket access
            self.s3.head_bucket(Bucket=analytics_bucket)
            logger.info(f"✅ Analytics bucket accessible: {analytics_bucket}")
            
            # Test bucket encryption
            encryption = self.s3.get_bucket_encryption(Bucket=analytics_bucket)
            if encryption['ServerSideEncryptionConfiguration']['Rules'][0]['ApplyServerSideEncryptionByDefault']['SSEAlgorithm'] == 'aws:kms':
                logger.info("✅ Bucket encryption configured (KMS)")
            else:
                logger.warning("Bucket encryption not using KMS")
            
            # Test bucket versioning
            versioning = self.s3.get_bucket_versioning(Bucket=analytics_bucket)
            if versioning.get('Status') == 'Enabled':
                logger.info("✅ Bucket versioning enabled")
            else:
                logger.warning("Bucket versioning not enabled")
            
            return True
            
        except Exception as e:
            logger.error(f"Error testing governance resources: {e}")
            return False
    
    def test_budget_controls(self) -> bool:
        """Test budget controls"""
        
        try:
            # List budgets
            response = self.budgets.describe_budgets(AccountId=self.account_id)
            budget_names = [budget['BudgetName'] for budget in response['Budgets']]
            
            # Check for BCCE department budgets
            bcce_budgets = [name for name in budget_names if 'BCCE' in name]
            
            if bcce_budgets:
                logger.info(f"✅ BCCE budgets found: {bcce_budgets}")
                
                # Test budget details for first BCCE budget
                budget_details = self.budgets.describe_budget(
                    AccountId=self.account_id,
                    BudgetName=bcce_budgets[0]
                )
                
                # Check for notifications
                notifications = self.budgets.describe_notifications_for_budget(
                    AccountId=self.account_id,
                    BudgetName=bcce_budgets[0]
                )
                
                if notifications['Notifications']:
                    logger.info(f"✅ Budget notifications configured: {len(notifications['Notifications'])}")
                else:
                    logger.warning("No budget notifications configured")
                
                return True
            else:
                logger.warning("No BCCE budgets found")
                return False
                
        except Exception as e:
            logger.error(f"Error testing budget controls: {e}")
            return False
    
    def test_analytics_infrastructure(self) -> bool:
        """Test analytics infrastructure"""
        
        try:
            # Test CloudWatch dashboard
            response = self.cloudwatch.list_dashboards()
            bcce_dashboards = [
                dash for dash in response['DashboardEntries']
                if 'bcce' in dash['DashboardName'].lower()
            ]
            
            if bcce_dashboards:
                logger.info(f"✅ BCCE dashboards found: {[d['DashboardName'] for d in bcce_dashboards]}")
            else:
                logger.warning("No BCCE dashboards found")
            
            # Test custom metrics namespace
            namespaces = self.cloudwatch.list_metrics(Namespace='BCCE')
            if namespaces['Metrics']:
                logger.info(f"✅ BCCE metrics namespace configured")
            else:
                logger.info("No BCCE metrics found (expected for new deployment)")
            
            return True
            
        except Exception as e:
            logger.error(f"Error testing analytics infrastructure: {e}")
            return False
    
    def test_unified_onboarding(self) -> bool:
        """Test unified onboarding process"""
        
        try:
            # Test onboarding script validation
            script_path = './unified-onboarding-enhanced.py'
            if not os.path.exists(script_path):
                logger.error("Unified onboarding script not found")
                return False
            
            # Run dry-run validation
            cmd = [
                'python3', script_path,
                '--email', self.test_email,
                '--department', self.test_department,
                '--access-tier', self.test_access_tier,
                '--manager-email', 'test-manager@testdomain.com',
                '--use-case', 'Integration testing',
                '--dry-run'
            ]
            
            # Add config if available
            if os.path.exists('../config/bcce-unified-config.yaml'):
                cmd.extend(['--config', '../config/bcce-unified-config.yaml'])
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info("✅ Unified onboarding validation passed")
                return True
            else:
                logger.error(f"Unified onboarding validation failed: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"Error testing unified onboarding: {e}")
            return False
    
    def test_configuration_generation(self) -> bool:
        """Test configuration generation"""
        
        try:
            # Check if configuration files exist
            config_files = [
                '../config/bcce-unified-config.yaml',
                '../config/deployment-summary.md'
            ]
            
            for config_file in config_files:
                if os.path.exists(config_file):
                    logger.info(f"✅ Configuration file found: {config_file}")
                else:
                    logger.warning(f"Configuration file missing: {config_file}")
            
            # Validate configuration content
            if os.path.exists('../config/bcce-unified-config.yaml'):
                with open('../config/bcce-unified-config.yaml', 'r') as f:
                    config = yaml.safe_load(f)
                    
                required_sections = ['organization', 'authentication', 'governance', 'departments']
                missing_sections = [section for section in required_sections if section not in config]
                
                if missing_sections:
                    logger.warning(f"Missing configuration sections: {missing_sections}")
                    return False
                else:
                    logger.info("✅ Configuration structure validated")
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error testing configuration generation: {e}")
            return False
    
    def test_monitoring_alerts(self) -> bool:
        """Test monitoring and alerting setup"""
        
        try:
            # Check CloudWatch alarms
            response = self.cloudwatch.describe_alarms()
            bcce_alarms = [
                alarm for alarm in response['MetricAlarms']
                if 'bcce' in alarm['AlarmName'].lower()
            ]
            
            if bcce_alarms:
                logger.info(f"✅ BCCE alarms found: {len(bcce_alarms)}")
            else:
                logger.info("No BCCE-specific alarms found (may be expected)")
            
            # Test metric data availability
            end_time = datetime.utcnow()
            start_time = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            
            try:
                metrics = self.cloudwatch.get_metric_statistics(
                    Namespace='AWS/Budgets',
                    MetricName='ActualCost',
                    Dimensions=[],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=3600,
                    Statistics=['Average']
                )
                
                logger.info("✅ CloudWatch metrics accessible")
                
            except Exception:
                logger.info("Budget metrics not yet available (expected for new deployment)")
            
            return True
            
        except Exception as e:
            logger.error(f"Error testing monitoring alerts: {e}")
            return False
    
    def test_integration_validation(self) -> bool:
        """Test overall integration validation"""
        
        try:
            # Validate deployment completeness
            user_pool_id = self.config.get('authentication', {}).get('user_pool_id')
            analytics_bucket = self.config.get('governance', {}).get('analytics_bucket')
            
            integration_components = {
                'cognito_user_pool': user_pool_id is not None,
                'analytics_bucket': analytics_bucket is not None,
                'departments_configured': len(self.config.get('departments', {})) > 0,
                'organization_configured': self.config.get('organization', {}).get('name') is not None
            }
            
            missing_components = [
                component for component, configured in integration_components.items()
                if not configured
            ]
            
            if missing_components:
                logger.warning(f"Missing integration components: {missing_components}")
                return False
            else:
                logger.info("✅ All integration components validated")
                
            # Test end-to-end configuration
            test_config = {
                'architecture': 'layered',
                'solutions_library': 'authentication',
                'bcce': 'governance',
                'components': integration_components
            }
            
            logger.info(f"✅ Integration configuration: {test_config}")
            return True
            
        except Exception as e:
            logger.error(f"Error in integration validation: {e}")
            return False
    
    def _generate_test_report(self, duration: float) -> Dict:
        """Generate comprehensive test report"""
        
        passed_tests = [result for result in self.test_results if result['status'] == 'PASSED']
        failed_tests = [result for result in self.test_results if result['status'] in ['FAILED', 'ERROR']]
        
        report = {
            'test_summary': {
                'total_tests': len(self.test_results),
                'passed': len(passed_tests),
                'failed': len(failed_tests),
                'success_rate': len(passed_tests) / len(self.test_results) * 100 if self.test_results else 0,
                'duration_seconds': round(duration, 2)
            },
            'test_results': self.test_results,
            'configuration': self.config,
            'timestamp': datetime.utcnow().isoformat(),
            'integration_status': 'READY' if len(failed_tests) == 0 else 'NEEDS_ATTENTION'
        }
        
        # Generate test report file
        with open('/tmp/bcce-integration-test-report.json', 'w') as f:
            json.dump(report, f, indent=2)
        
        # Print summary
        print("\n" + "="*80)
        print("🧪 BCCE + AWS Solutions Library Integration Test Report")
        print("="*80)
        print(f"Total Tests: {report['test_summary']['total_tests']}")
        print(f"Passed: {report['test_summary']['passed']}")
        print(f"Failed: {report['test_summary']['failed']}")
        print(f"Success Rate: {report['test_summary']['success_rate']:.1f}%")
        print(f"Duration: {report['test_summary']['duration_seconds']} seconds")
        print(f"Status: {report['integration_status']}")
        
        if failed_tests:
            print(f"\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"  - {test['phase']}: {test.get('error', 'Failed')}")
        
        print(f"\n📄 Detailed report: /tmp/bcce-integration-test-report.json")
        print("="*80)
        
        return report


def main():
    """Main function for integration testing"""
    
    parser = argparse.ArgumentParser(description='BCCE + AWS Solutions Library Integration Tester')
    parser.add_argument('--config', help='Configuration file path')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Initialize and run tests
    tester = LayeredIntegrationTester(args.config)
    report = tester.run_all_tests()
    
    # Exit with appropriate code
    if report['integration_status'] == 'READY':
        logger.info("🎉 Integration testing completed successfully!")
        sys.exit(0)
    else:
        logger.error("❌ Integration testing found issues that need attention")
        sys.exit(1)


if __name__ == "__main__":
    main()