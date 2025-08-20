/**
 * AWS Client Manager Tests
 * Validates connection pooling, client lifecycle, and performance optimization
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AWSClientManager, withAWSClient } from '../../lib/aws-client-manager.js';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    send: jest.fn().mockResolvedValue({ success: true })
  }))
}));

jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    send: jest.fn().mockResolvedValue({ success: true })
  }))
}));

jest.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    send: jest.fn().mockResolvedValue({ success: true })
  }))
}));

describe('AWSClientManager', () => {
  let manager: AWSClientManager;

  beforeEach(() => {
    // Create fresh manager for each test
    manager = AWSClientManager.initialize({
      region: 'us-east-1',
      maxRetries: 3,
      requestTimeout: 30000,
      connectionTimeout: 5000,
      maxConnections: 50
    }, {
      maxPoolSize: 5,
      idleTimeoutMs: 30000,
      healthCheckIntervalMs: 10000
    });
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const manager = AWSClientManager.initialize({
        region: 'us-west-2'
      });
      
      expect(manager).toBeInstanceOf(AWSClientManager);
      manager.shutdown();
    });

    test('should throw error if accessed before initialization', () => {
      // Shutdown existing instance
      manager.shutdown();
      
      expect(() => {
        AWSClientManager.getInstance();
      }).toThrow('AWS Client Manager not initialized');
    });

    test('should return singleton instance after initialization', () => {
      const instance1 = AWSClientManager.getInstance();
      const instance2 = AWSClientManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Client Pool Management', () => {
    test('should create new client when pool is empty', () => {
      const s3Client = manager.getS3Client();
      
      expect(s3Client).toBeDefined();
      
      const stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1']).toBeDefined();
      expect(stats['s3-us-east-1'].totalClients).toBe(1);
      expect(stats['s3-us-east-1'].activeClients).toBe(1);
    });

    test('should reuse clients from pool', () => {
      // Get client and release it
      const s3Client1 = manager.getS3Client();
      manager.releaseClient('s3', 'us-east-1', s3Client1);
      
      // Get another client - should reuse
      const s3Client2 = manager.getS3Client();
      
      expect(s3Client1).toBe(s3Client2);
      
      const stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1'].totalClients).toBe(1);
    });

    test('should create new client when pool limit reached', () => {
      // Fill up the pool (maxPoolSize = 5)
      const clients = [];
      for (let i = 0; i < 5; i++) {
        clients.push(manager.getS3Client());
      }
      
      // Request another client - should create temporary one
      const extraClient = manager.getS3Client();
      
      expect(extraClient).toBeDefined();
      
      const stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1'].totalClients).toBe(5); // Pool stays at max
      expect(stats['s3-us-east-1'].activeClients).toBe(5);
    });

    test('should handle different regions separately', () => {
      const usEast1Client = manager.getS3Client('us-east-1');
      const usWest2Client = manager.getS3Client('us-west-2');
      
      expect(usEast1Client).toBeDefined();
      expect(usWest2Client).toBeDefined();
      
      const stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1']).toBeDefined();
      expect(stats['s3-us-west-2']).toBeDefined();
    });
  });

  describe('Multiple Service Types', () => {
    test('should manage different service types independently', () => {
      const s3Client = manager.getS3Client();
      const stsClient = manager.getSTSClient();
      const cfClient = manager.getCloudFormationClient();
      
      const stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1']).toBeDefined();
      expect(stats['sts-us-east-1']).toBeDefined();
      expect(stats['cloudformation-us-east-1']).toBeDefined();
      
      expect(stats['s3-us-east-1'].totalClients).toBe(1);
      expect(stats['sts-us-east-1'].totalClients).toBe(1);
      expect(stats['cloudformation-us-east-1'].totalClients).toBe(1);
    });

    test('should provide all supported client types', () => {
      expect(manager.getS3Client()).toBeDefined();
      expect(manager.getSTSClient()).toBeDefined();
      expect(manager.getCloudFormationClient()).toBeDefined();
      expect(manager.getCloudWatchLogsClient()).toBeDefined();
      expect(manager.getKinesisClient()).toBeDefined();
      expect(manager.getQuickSightClient()).toBeDefined();
      expect(manager.getECSClient()).toBeDefined();
      expect(manager.getEC2Client()).toBeDefined();
      expect(manager.getRDSClient()).toBeDefined();
    });
  });

  describe('Client Release and Cleanup', () => {
    test('should mark client as available after release', () => {
      const s3Client = manager.getS3Client();
      
      let stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1'].activeClients).toBe(1);
      expect(stats['s3-us-east-1'].idleClients).toBe(0);
      
      manager.releaseClient('s3', 'us-east-1', s3Client);
      
      stats = manager.getPoolStatistics();
      expect(stats['s3-us-east-1'].activeClients).toBe(0);
      expect(stats['s3-us-east-1'].idleClients).toBe(1);
    });

    test('should clear all pools on shutdown', () => {
      manager.getS3Client();
      manager.getSTSClient();
      
      let stats = manager.getPoolStatistics();
      expect(Object.keys(stats)).toHaveLength(2);
      
      manager.clearPools();
      
      stats = manager.getPoolStatistics();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  describe('Performance Optimization', () => {
    test('should configure clients with optimized settings', () => {
      // Mock to capture configuration
      const { S3Client } = require('@aws-sdk/client-s3');
      
      manager.getS3Client();
      
      expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
        region: 'us-east-1',
        maxAttempts: 3,
        retryMode: 'adaptive',
        requestHandler: expect.objectContaining({
          connectionTimeout: 5000,
          socketTimeout: 30000,
          maxSockets: 50
        })
      }));
    });

    test('should enable development logging when appropriate', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const { S3Client } = require('@aws-sdk/client-s3');
      S3Client.mockClear();
      
      manager.getS3Client();
      
      expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
        logger: console
      }));
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Health Check and Idle Cleanup', () => {
    test('should remove idle clients after timeout', async () => {
      // Create manager with short idle timeout for testing
      const testManager = AWSClientManager.initialize({
        region: 'us-east-1'
      }, {
        maxPoolSize: 5,
        idleTimeoutMs: 100,
        healthCheckIntervalMs: 50
      });
      
      try {
        const s3Client = testManager.getS3Client();
        testManager.releaseClient('s3', 'us-east-1', s3Client);
        
        let stats = testManager.getPoolStatistics();
        expect(stats['s3-us-east-1'].totalClients).toBe(1);
        
        // Wait for health check to run and clean up idle client
        await new Promise(resolve => setTimeout(resolve, 200));
        
        stats = testManager.getPoolStatistics();
        expect(stats['s3-us-east-1']?.totalClients || 0).toBe(0);
      } finally {
        testManager.shutdown();
      }
    });
  });
});

describe('withAWSClient Utility', () => {
  let manager: AWSClientManager;

  beforeEach(() => {
    manager = AWSClientManager.initialize({
      region: 'us-east-1'
    });
  });

  afterEach(() => {
    manager.shutdown();
  });

  test('should execute operation with client', async () => {
    const operation = jest.fn().mockResolvedValue('operation-result');
    
    const result = await withAWSClient(
      (mgr) => mgr.getS3Client(),
      operation
    );
    
    expect(result).toBe('operation-result');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('should handle operation errors', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
    
    await expect(withAWSClient(
      (mgr) => mgr.getS3Client(),
      operation
    )).rejects.toThrow('Operation failed after 4 attempts');
  });

  test('should apply retry logic automatically', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('ThrottlingException'))
      .mockResolvedValue('success');
    
    const result = await withAWSClient(
      (mgr) => mgr.getS3Client(),
      operation
    );
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});