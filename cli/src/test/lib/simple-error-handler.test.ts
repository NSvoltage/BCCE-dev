/**
 * Simplified Enterprise Error Handler Tests
 * Tests core functionality without complex TypeScript typing
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { EnterpriseErrorHandler, EnterpriseError } from '../../lib/enterprise-error-handler.js';

describe('EnterpriseErrorHandler - Core Functionality', () => {
  beforeEach(() => {
    // Reset any circuit breaker state
    EnterpriseErrorHandler['circuitBreakers']?.clear();
  });

  describe('Error Context Creation', () => {
    test('should create comprehensive error context', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation',
        component: 'test-component'
      });
      
      expect(context).toHaveProperty('operation', 'test-operation');
      expect(context).toHaveProperty('component', 'test-component');
      expect(context).toHaveProperty('timestamp');
      expect(context).toHaveProperty('region');
      expect(context).toHaveProperty('correlationId');
      expect(context.correlationId).toMatch(/^bcce-\d+-[a-z0-9]+$/);
    });

    test('should use environment region', () => {
      const originalRegion = process.env.AWS_REGION;
      process.env.AWS_REGION = 'us-west-2';
      
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation'
      });
      
      expect(context.region).toBe('us-west-2');
      
      // Reset
      process.env.AWS_REGION = originalRegion;
    });

    test('should include default values', () => {
      const context = EnterpriseErrorHandler.createErrorContext({});
      
      expect(context.operation).toBe('unknown');
      expect(context.component).toBe('bcce');
      expect(context.region).toBe('us-east-1'); // Default from setup
      expect(context.correlationId).toBeTruthy();
      expect(context.metadata).toEqual({});
    });
  });

  describe('EnterpriseError Class', () => {
    test('should create enterprise error with context', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation',
        component: 'test-component'
      });
      
      const originalError = new Error('Original error message');
      const enterpriseError = new EnterpriseError(
        'Enterprise error message',
        context,
        originalError,
        true
      );
      
      expect(enterpriseError.message).toBe('Enterprise error message');
      expect(enterpriseError.context).toBe(context);
      expect(enterpriseError.originalError).toBe(originalError);
      expect(enterpriseError.isRetryable).toBe(true);
      expect(enterpriseError.name).toBe('EnterpriseError');
    });

    test('should serialize to JSON properly', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation'
      });
      
      const error = new EnterpriseError('Test error', context);
      const json = error.toJSON();
      
      expect(json).toHaveProperty('name', 'EnterpriseError');
      expect(json).toHaveProperty('message', 'Test error');
      expect(json).toHaveProperty('context');
      expect(json).toHaveProperty('isRetryable', false);
      expect(json).toHaveProperty('stack');
      expect(json.context).toBe(context);
    });

    test('should handle optional parameters', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation'
      });
      
      const error = new EnterpriseError('Simple error', context);
      
      expect(error.originalError).toBeUndefined();
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('Error Formatting', () => {
    test('should format enterprise errors', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation',
        component: 'test-component'
      });
      
      const error = new EnterpriseError('Test error', context);
      const formatted = EnterpriseErrorHandler.formatError(error);
      
      expect(formatted).toContain('EnterpriseError');
      expect(formatted).toContain('Test error');
      expect(formatted).toContain('test-operation');
      expect(formatted).toContain('test-component');
    });

    test('should format regular errors', () => {
      const error = new Error('Regular error');
      const formatted = EnterpriseErrorHandler.formatError(error);
      
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Regular error');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    test('should handle errors with stack traces', () => {
      const error = new Error('Error with stack');
      error.stack = 'Error: Error with stack\n    at test.js:1:1';
      
      const formatted = EnterpriseErrorHandler.formatError(error);
      const parsed = JSON.parse(formatted);
      
      expect(parsed.stack).toContain('Error with stack');
    });
  });

  describe('Circuit Breaker Status', () => {
    test('should return empty status initially', () => {
      const status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      expect(typeof status).toBe('object');
      expect(Object.keys(status)).toHaveLength(0);
    });

    test('should track circuit breaker state format', () => {
      // This test validates the expected format without triggering circuit breaker logic
      const status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      
      // Should be empty initially but have consistent structure
      expect(status).toEqual({});
      
      // After circuit breaker usage, we would expect:
      // {
      //   "circuit-name": {
      //     state: "CLOSED" | "OPEN" | "HALF_OPEN",
      //     consecutiveFailures: number,
      //     lastFailureTime: number,
      //     isHealthy: boolean
      //   }
      // }
    });
  });

  describe('Utility Functions', () => {
    test('should generate unique correlation IDs', () => {
      const context1 = EnterpriseErrorHandler.createErrorContext({});
      const context2 = EnterpriseErrorHandler.createErrorContext({});
      
      expect(context1.correlationId).not.toBe(context2.correlationId);
      expect(context1.correlationId).toMatch(/^bcce-\d+-[a-z0-9]+$/);
      expect(context2.correlationId).toMatch(/^bcce-\d+-[a-z0-9]+$/);
    });

    test('should include timestamp in context', () => {
      const before = new Date();
      const context = EnterpriseErrorHandler.createErrorContext({});
      const after = new Date();
      
      expect(context.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(context.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('should preserve metadata', () => {
      const metadata = { userId: '123', action: 'test' };
      const context = EnterpriseErrorHandler.createErrorContext({ metadata });
      
      expect(context.metadata).toEqual(metadata);
    });
  });
});