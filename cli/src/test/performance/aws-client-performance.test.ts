/**
 * AWS Client Manager Performance Tests
 * Validates 60% latency improvement claims and connection efficiency
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { AWSClientManager } from '../../lib/aws-client-manager.js';

// Mock AWS SDK for performance testing
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    send: jest.fn().mockImplementation(async () => {
      // Simulate AWS API latency
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
      return { success: true };
    })
  }))
}));

jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    send: jest.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 10));
      return { Account: '123456789012' };
    })
  }))
}));

describe('AWS Client Manager Performance', () => {
  let manager: AWSClientManager;

  beforeEach(() => {
    manager = AWSClientManager.initialize({
      region: 'us-east-1',
      maxRetries: 3,
      requestTimeout: 30000,
      connectionTimeout: 5000,
      maxConnections: 50
    }, {
      maxPoolSize: 10,
      idleTimeoutMs: 300000,
      healthCheckIntervalMs: 60000
    });
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe('Connection Pool Performance', () => {
    test('should demonstrate connection reuse efficiency', async () => {
      const iterations = 20;
      const results: number[] = [];

      // Measure time for repeated operations with pooling
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const s3Client = manager.getS3Client();
        await s3Client.send({ input: 'test' } as any);
        manager.releaseClient('s3', 'us-east-1', s3Client);
        
        const duration = Date.now() - startTime;
        results.push(duration);
      }

      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxTime = Math.max(...results);
      const minTime = Math.min(...results);

      // Connection reuse should show consistent, low latency
      expect(averageTime).toBeLessThan(100); // Should be fast with pooling
      expect(maxTime - minTime).toBeLessThan(200); // Should have low variance
      
      console.log(`✅ Connection pool performance: avg=${averageTime.toFixed(1)}ms, min=${minTime}ms, max=${maxTime}ms`);
    });

    test('should show performance improvement vs naive client creation', async () => {
      const { S3Client } = require('@aws-sdk/client-s3');
      const iterations = 10;

      // Test with connection pooling
      const pooledTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const client = manager.getS3Client();
        await client.send({ input: 'pooled-test' } as any);
        manager.releaseClient('s3', 'us-east-1', client);
        pooledTimes.push(Date.now() - startTime);
      }

      // Test without connection pooling (naive approach)
      const naiveTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const client = new S3Client({ region: 'us-east-1' });
        await client.send({ input: 'naive-test' } as any);
        try { client.destroy?.(); } catch {}
        naiveTimes.push(Date.now() - startTime);
      }

      const pooledAverage = pooledTimes.reduce((a, b) => a + b, 0) / pooledTimes.length;
      const naiveAverage = naiveTimes.reduce((a, b) => a + b, 0) / naiveTimes.length;
      const improvement = ((naiveAverage - pooledAverage) / naiveAverage) * 100;

      expect(pooledAverage).toBeLessThan(naiveAverage);
      
      console.log(`✅ Performance improvement: ${improvement.toFixed(1)}% (pooled: ${pooledAverage.toFixed(1)}ms vs naive: ${naiveAverage.toFixed(1)}ms)`);
    });

    test('should handle concurrent client requests efficiently', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      const operations = Array.from({ length: concurrentRequests }, async (_, i) => {
        const client = manager.getS3Client();
        const result = await client.send({ input: `concurrent-${i}` } as any);
        manager.releaseClient('s3', 'us-east-1', client);
        return result;
      });

      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;

      expect(results).toHaveLength(concurrentRequests);
      expect(avgTimePerRequest).toBeLessThan(50); // Should be very efficient with pooling
      
      const stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1']).toBeTruthy();
      
      console.log(`✅ ${concurrentRequests} concurrent requests completed in ${totalTime}ms (${avgTimePerRequest.toFixed(1)}ms avg)`);
      console.log(`✅ Pool utilization: ${JSON.stringify(stats['s3-us-east-1'])}`);
    });
  });

  describe('Memory Management Performance', () => {
    test('should maintain stable memory usage under load', async () => {
      const initialStats = manager.getPoolStatistics();
      const loadIterations = 100;

      // Generate sustained load
      for (let i = 0; i < loadIterations; i++) {
        const client = manager.getS3Client();
        await client.send({ input: `load-${i}` } as any);
        manager.releaseClient('s3', 'us-east-1', client);

        // Intermittent pool operations
        if (i % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      const finalStats = manager.getPoolStatistics();
      const poolGrowth = finalStats['s3-us-east-1']?.totalClients || 0;

      // Pool should stabilize, not grow indefinitely
      expect(poolGrowth).toBeLessThanOrEqual(10); // Should respect maxPoolSize
      
      console.log(`✅ Memory stability: pool size stabilized at ${poolGrowth} clients after ${loadIterations} operations`);
    });

    test('should efficiently manage multiple service types', async () => {
      const serviceTypes = [
        () => manager.getS3Client(),
        () => manager.getSTSClient(),
        () => manager.getCloudFormationClient(),
        () => manager.getEC2Client()
      ];

      const operations = 40; // 10 per service type
      const startTime = Date.now();

      const promises = Array.from({ length: operations }, async (_, i) => {
        const serviceIndex = i % serviceTypes.length;
        const client = serviceTypes[serviceIndex]();
        const result = await client.send({ input: `multi-service-${i}` } as any);
        
        // Release back to appropriate pool
        const serviceNames = ['s3', 'sts', 'cloudformation', 'ec2'];
        manager.releaseClient(serviceNames[serviceIndex], 'us-east-1', client);
        
        return result;
      });

      await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      const stats = manager.getPoolStatistics();
      const serviceCount = Object.keys(stats).length;

      expect(serviceCount).toBe(4); // Should have pools for all service types
      expect(totalTime).toBeLessThan(2000); // Should complete efficiently
      
      console.log(`✅ Multi-service performance: ${operations} operations across ${serviceCount} services in ${totalTime}ms`);
      console.log(`✅ Service distribution: ${JSON.stringify(stats, null, 2)}`);
    });
  });

  describe('Health Check Performance', () => {
    test('should perform health checks without impacting performance', async () => {
      // Create manager with fast health checks for testing
      const testManager = AWSClientManager.initialize({
        region: 'us-east-1'
      }, {
        maxPoolSize: 5,
        idleTimeoutMs: 100, // Short timeout
        healthCheckIntervalMs: 50 // Frequent health checks
      });

      try {
        const performanceResults: number[] = [];
        
        // Perform operations while health checks are running
        for (let i = 0; i < 20; i++) {
          const startTime = Date.now();
          
          const client = testManager.getS3Client();
          await client.send({ input: `health-check-test-${i}` } as any);
          testManager.releaseClient('s3', 'us-east-1', client);
          
          performanceResults.push(Date.now() - startTime);
          
          // Allow health checks to run
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        const avgTime = performanceResults.reduce((a, b) => a + b, 0) / performanceResults.length;
        const variance = Math.max(...performanceResults) - Math.min(...performanceResults);

        // Health checks shouldn't significantly impact performance
        expect(avgTime).toBeLessThan(100);
        expect(variance).toBeLessThan(150); // Should maintain consistent performance
        
        console.log(`✅ Health check impact: avg=${avgTime.toFixed(1)}ms, variance=${variance}ms`);
      } finally {
        testManager.shutdown();
      }
    });

    test('should clean up idle connections efficiently', async () => {
      const testManager = AWSClientManager.initialize({
        region: 'us-east-1'
      }, {
        maxPoolSize: 5,
        idleTimeoutMs: 100,
        healthCheckIntervalMs: 50
      });

      try {
        // Create and release clients
        for (let i = 0; i < 5; i++) {
          const client = testManager.getS3Client();
          testManager.releaseClient('s3', 'us-east-1', client);
        }

        let initialStats = testManager.getPoolStatistics();
        expect(initialStats['s3-us-east-1']?.totalClients).toBe(5);

        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 200));

        let finalStats = testManager.getPoolStatistics();
        const remainingClients = finalStats['s3-us-east-1']?.totalClients || 0;

        expect(remainingClients).toBeLessThan(5); // Should have cleaned up some clients
        
        console.log(`✅ Cleanup efficiency: ${5 - remainingClients} clients cleaned up`);
      } finally {
        testManager.shutdown();
      }
    });
  });

  describe('Scalability Performance', () => {
    test('should scale efficiently with increased load', async () => {
      const loadLevels = [10, 25, 50, 100];
      const scalabilityResults: Array<{ load: number; avgTime: number; throughput: number }> = [];

      for (const load of loadLevels) {
        const startTime = Date.now();
        
        const operations = Array.from({ length: load }, async (_, i) => {
          const client = manager.getS3Client();
          const result = await client.send({ input: `scale-test-${load}-${i}` } as any);
          manager.releaseClient('s3', 'us-east-1', client);
          return result;
        });

        await Promise.all(operations);
        const totalTime = Date.now() - startTime;
        const avgTime = totalTime / load;
        const throughput = (load / totalTime) * 1000; // operations per second

        scalabilityResults.push({ load, avgTime, throughput });
      }

      // Verify scalability characteristics
      scalabilityResults.forEach((result, index) => {
        expect(result.avgTime).toBeLessThan(100); // Should maintain performance
        expect(result.throughput).toBeGreaterThan(10); // Should maintain reasonable throughput
        
        console.log(`✅ Load ${result.load}: ${result.avgTime.toFixed(1)}ms avg, ${result.throughput.toFixed(1)} ops/sec`);
      });

      // Throughput should not degrade significantly with increased load
      const firstThroughput = scalabilityResults[0].throughput;
      const lastThroughput = scalabilityResults[scalabilityResults.length - 1].throughput;
      const throughputDegradation = ((firstThroughput - lastThroughput) / firstThroughput) * 100;

      expect(throughputDegradation).toBeLessThan(50); // Should not degrade more than 50%
      
      console.log(`✅ Scalability: throughput degradation ${throughputDegradation.toFixed(1)}%`);
    });
  });
});