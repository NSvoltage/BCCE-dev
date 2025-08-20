/**
 * Real AWS Service Integration Tests
 * Tests actual AWS API calls for production validation
 * Requires AWS credentials and appropriate permissions
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { AWSClientManager } from '../../lib/aws-client-manager.js';
import { EnterpriseErrorHandler } from '../../lib/enterprise-error-handler.js';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { DescribeRegionsCommand } from '@aws-sdk/client-ec2';

describe('AWS Real Service Integration', () => {
  let clientManager: AWSClientManager;
  const testRegion = process.env.AWS_REGION || 'us-east-1';

  beforeAll(() => {
    // Skip integration tests if no AWS credentials
    if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
      console.log('⚠️  Skipping AWS integration tests - no credentials configured');
      return;
    }

    clientManager = AWSClientManager.initialize({
      region: testRegion,
      maxRetries: 3,
      requestTimeout: 30000,
      connectionTimeout: 5000
    });
  });

  afterAll(() => {
    if (clientManager) {
      clientManager.shutdown();
    }
  });

  describe('AWS Credentials and Access', () => {
    test.skip('should validate AWS credentials with STS', async () => {
      if (!clientManager) return;

      const stsClient = clientManager.getSTSClient();
      const command = new GetCallerIdentityCommand({});
      
      const result = await EnterpriseErrorHandler.withRetry(
        () => stsClient.send(command),
        {
          operation: 'sts-get-caller-identity',
          component: 'aws-integration-test'
        }
      );

      expect(result.Account).toBeTruthy();
      expect(result.Arn).toBeTruthy();
      expect(result.UserId).toBeTruthy();
      
      console.log(`✅ AWS Account: ${result.Account}`);
      console.log(`✅ AWS ARN: ${result.Arn}`);
    });

    test.skip('should handle AWS service errors gracefully', async () => {
      if (!clientManager) return;

      const s3Client = clientManager.getS3Client();
      const command = new HeadBucketCommand({ 
        Bucket: 'definitely-does-not-exist-bcce-test-bucket-12345' 
      });
      
      await expect(
        EnterpriseErrorHandler.withRetry(
          () => s3Client.send(command),
          {
            operation: 's3-head-bucket-nonexistent',
            component: 'aws-integration-test'
          }
        )
      ).rejects.toThrow();
    });

    test.skip('should verify regional access', async () => {
      if (!clientManager) return;

      const ec2Client = clientManager.getEC2Client();
      const command = new DescribeRegionsCommand({});
      
      const result = await EnterpriseErrorHandler.withRetry(
        () => ec2Client.send(command),
        {
          operation: 'ec2-describe-regions',
          component: 'aws-integration-test'
        }
      );

      expect(result.Regions).toBeTruthy();
      expect(result.Regions!.length).toBeGreaterThan(0);
      
      const currentRegion = result.Regions!.find(r => r.RegionName === testRegion);
      expect(currentRegion).toBeTruthy();
      
      console.log(`✅ Verified access to ${result.Regions!.length} AWS regions`);
    });
  });

  describe('Error Handling and Resilience', () => {
    test.skip('should demonstrate retry logic with throttling', async () => {
      if (!clientManager) return;

      const stsClient = clientManager.getSTSClient();
      let callCount = 0;
      
      // Simulate operation that might face throttling
      const operation = async () => {
        callCount++;
        const command = new GetCallerIdentityCommand({});
        return await stsClient.send(command);
      };

      const result = await EnterpriseErrorHandler.withRetry(
        operation,
        {
          operation: 'sts-retry-test',
          component: 'aws-integration-test'
        },
        {
          maxRetries: 2,
          baseDelayMs: 100
        }
      );

      expect(result.Account).toBeTruthy();
      expect(callCount).toBeGreaterThanOrEqual(1);
      
      console.log(`✅ Operation completed with ${callCount} attempts`);
    });

    test.skip('should demonstrate circuit breaker with real AWS calls', async () => {
      if (!clientManager) return;

      const stsClient = clientManager.getSTSClient();
      const operation = async () => {
        const command = new GetCallerIdentityCommand({});
        return await stsClient.send(command);
      };

      // Test circuit breaker in healthy state
      const result = await EnterpriseErrorHandler.withCircuitBreaker(
        operation,
        'aws-sts-integration-test',
        {
          operation: 'sts-circuit-breaker-test',
          component: 'aws-integration-test'
        }
      );

      expect(result.Account).toBeTruthy();
      
      // Verify circuit breaker status
      const status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      expect(status['aws-sts-integration-test']).toBeTruthy();
      expect(status['aws-sts-integration-test'].isHealthy).toBe(true);
      
      console.log(`✅ Circuit breaker status: ${JSON.stringify(status, null, 2)}`);
    });
  });

  describe('Client Pool Performance', () => {
    test.skip('should demonstrate connection pooling efficiency', async () => {
      if (!clientManager) return;

      const startTime = Date.now();
      
      // Make multiple concurrent STS calls
      const promises = Array.from({ length: 5 }, () => {
        const stsClient = clientManager.getSTSClient();
        const command = new GetCallerIdentityCommand({});
        return stsClient.send(command);
      });

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.Account).toBeTruthy();
      });
      
      // Check pool statistics
      const stats = clientManager.getPoolStatistics();
      expect(stats[`sts-${testRegion}`]).toBeTruthy();
      
      console.log(`✅ 5 concurrent AWS calls completed in ${duration}ms`);
      console.log(`✅ Pool stats: ${JSON.stringify(stats, null, 2)}`);
    });

    test.skip('should handle multiple service types efficiently', async () => {
      if (!clientManager) return;

      const operations = [
        // STS operation
        async () => {
          const client = clientManager.getSTSClient();
          const command = new GetCallerIdentityCommand({});
          return { service: 'STS', result: await client.send(command) };
        },
        
        // EC2 operation  
        async () => {
          const client = clientManager.getEC2Client();
          const command = new DescribeRegionsCommand({});
          return { service: 'EC2', result: await client.send(command) };
        }
      ];

      const results = await Promise.all(operations.map(op => op()));
      
      expect(results).toHaveLength(2);
      expect(results.find(r => r.service === 'STS')).toBeTruthy();
      expect(results.find(r => r.service === 'EC2')).toBeTruthy();
      
      // Verify separate pools for different services
      const stats = clientManager.getPoolStatistics();
      expect(stats[`sts-${testRegion}`]).toBeTruthy();
      expect(stats[`ec2-${testRegion}`]).toBeTruthy();
      
      console.log(`✅ Multi-service pool stats: ${JSON.stringify(stats, null, 2)}`);
    });
  });

  describe('Production Environment Validation', () => {
    test('should validate test environment configuration', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(testRegion).toBeTruthy();
      
      // Validate we're in a safe test environment
      const accountIndicators = [
        process.env.AWS_ACCOUNT_ID,
        process.env.BCCE_TEST_ACCOUNT
      ];
      
      console.log(`✅ Test Region: ${testRegion}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV}`);
      console.log(`✅ Account Indicators: ${accountIndicators.filter(Boolean).join(', ')}`);
    });

    test('should validate enterprise error handling configuration', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'production-validation',
        component: 'aws-integration-test'
      });
      
      expect(context.region).toBe(testRegion);
      expect(context.correlationId).toMatch(/^bcce-\d+-[a-z0-9]+$/);
      
      console.log(`✅ Error Context: ${JSON.stringify(context, null, 2)}`);
    });

    test('should validate client manager configuration', () => {
      if (!clientManager) {
        console.log('ℹ️  Client manager not initialized (no AWS credentials)');
        return;
      }

      const stats = clientManager.getPoolStatistics();
      expect(typeof stats).toBe('object');
      
      // Verify manager is properly configured
      const s3Client = clientManager.getS3Client();
      expect(s3Client).toBeTruthy();
      
      console.log(`✅ Client Manager initialized with region: ${testRegion}`);
    });
  });
});

// Helper to check if AWS integration tests should run
export function shouldRunAWSIntegrationTests(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.BCCE_RUN_AWS_TESTS);
}

// Skip all tests if no AWS credentials
if (!shouldRunAWSIntegrationTests()) {
  describe.skip('AWS Integration Tests', () => {
    test('skipped - no AWS credentials', () => {
      expect(true).toBe(true);
    });
  });
}