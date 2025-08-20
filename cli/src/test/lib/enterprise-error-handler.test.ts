/**
 * Enterprise Error Handler Tests
 * Validates circuit breaker patterns, retry logic, and comprehensive error context
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { EnterpriseErrorHandler, EnterpriseError } from '../../lib/enterprise-error-handler.js';

describe('EnterpriseErrorHandler', () => {
  beforeEach(() => {
    // Clear any existing circuit breaker state
    jest.clearAllMocks();
  });

  describe('Retry Logic', () => {
    test('should succeed on first attempt', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      const result = await EnterpriseErrorHandler.withRetry(
        operation,
        { operation: 'test-operation', component: 'test' }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ThrottlingException'))
        .mockRejectedValueOnce(new Error('InternalServerError'))
        .mockResolvedValue('success');
      
      const result = await EnterpriseErrorHandler.withRetry(
        operation,
        { operation: 'test-operation', component: 'test' }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ThrottlingException'));
      
      await expect(EnterpriseErrorHandler.withRetry(
        operation,
        { operation: 'test-operation', component: 'test' },
        { maxRetries: 2 }
      )).rejects.toThrow(EnterpriseError);
      
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should not retry non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ValidationError'));
      
      await expect(EnterpriseErrorHandler.withRetry(
        operation,
        { operation: 'test-operation', component: 'test' }
      )).rejects.toThrow(EnterpriseError);
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      const result = await EnterpriseErrorHandler.withRetry(
        operation,
        { operation: 'test-operation', component: 'test' },
        { baseDelayMs: 100, exponentialBackoff: true }
      );
      
      const duration = Date.now() - startTime;
      expect(result).toBe('success');
      expect(duration).toBeGreaterThan(300); // Should have waited ~100ms + ~200ms
    });
  });

  describe('Circuit Breaker', () => {
    test('should allow operations when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await EnterpriseErrorHandler.withCircuitBreaker(
        operation,
        'test-circuit',
        { operation: 'test-operation', component: 'test' }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should open circuit after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      
      // Exceed failure threshold (default 5)
      for (let i = 0; i < 6; i++) {
        try {
          await EnterpriseErrorHandler.withCircuitBreaker(
            operation,
            'test-circuit-2',
            { operation: 'test-operation', component: 'test' }
          );
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Circuit should now be open
      await expect(EnterpriseErrorHandler.withCircuitBreaker(
        operation,
        'test-circuit-2',
        { operation: 'test-operation', component: 'test' }
      )).rejects.toThrow('Circuit breaker test-circuit-2 is OPEN');
    });

    test('should reset circuit after timeout', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('Service unavailable'))
        .mockResolvedValue('success');
      
      const config = { failureThreshold: 2, resetTimeoutMs: 100 };
      
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await EnterpriseErrorHandler.withCircuitBreaker(
            operation,
            'test-circuit-3',
            { operation: 'test-operation', component: 'test' },
            config
          );
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should now work again
      const result = await EnterpriseErrorHandler.withCircuitBreaker(
        operation,
        'test-circuit-3',
        { operation: 'test-operation', component: 'test' },
        config
      );
      
      expect(result).toBe('success');
    });

    test('should provide circuit breaker status', () => {
      const status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      expect(typeof status).toBe('object');
      
      // Should include circuits from previous tests
      for (const [name, circuitStatus] of Object.entries(status)) {
        expect(circuitStatus).toHaveProperty('state');
        expect(circuitStatus).toHaveProperty('consecutiveFailures');
        expect(circuitStatus).toHaveProperty('isHealthy');
      }
    });
  });

  describe('Combined Resilience', () => {
    test('should combine retry and circuit breaker', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ThrottlingException'))
        .mockResolvedValue('success');
      
      const result = await EnterpriseErrorHandler.withResilience(
        operation,
        'resilient-circuit',
        { operation: 'test-operation', component: 'test' }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2); // First failure, then retry success
    });
  });

  describe('Error Context', () => {
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

    test('should include environment region', () => {
      process.env.AWS_REGION = 'us-west-2';
      
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation'
      });
      
      expect(context.region).toBe('us-west-2');
      
      // Reset
      process.env.AWS_REGION = 'us-east-1';
    });
  });

  describe('EnterpriseError', () => {
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
      expect(json).toHaveProperty('isRetryable');
      expect(json).toHaveProperty('stack');
    });
  });

  describe('Error Formatting', () => {
    test('should format enterprise errors', () => {
      const context = EnterpriseErrorHandler.createErrorContext({
        operation: 'test-operation'
      });
      
      const error = new EnterpriseError('Test error', context);
      const formatted = EnterpriseErrorHandler.formatError(error);
      
      expect(formatted).toContain('EnterpriseError');
      expect(formatted).toContain('Test error');
      expect(formatted).toContain('test-operation');
    });

    test('should format regular errors', () => {
      const error = new Error('Regular error');
      const formatted = EnterpriseErrorHandler.formatError(error);
      
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Regular error');
    });
  });
});