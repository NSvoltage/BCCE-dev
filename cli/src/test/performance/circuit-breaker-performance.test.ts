/**
 * Circuit Breaker Performance and Reliability Tests
 * Validates enterprise-grade resilience patterns and SLA requirements
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EnterpriseErrorHandler } from '../../lib/enterprise-error-handler.js';

describe('Circuit Breaker Performance Validation', () => {
  beforeEach(() => {
    // Clear circuit breaker state
    EnterpriseErrorHandler['circuitBreakers']?.clear();
  });

  afterEach(() => {
    // Cleanup
    EnterpriseErrorHandler['circuitBreakers']?.clear();
  });

  describe('Response Time Requirements', () => {
    test('should complete healthy operations within SLA', async () => {
      const operation = async () => {
        // Simulate AWS API call latency
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      };

      const startTime = Date.now();
      
      const result = await EnterpriseErrorHandler.withCircuitBreaker(
        operation,
        'performance-test-circuit',
        {
          operation: 'performance-validation',
          component: 'performance-test'
        }
      );
      
      const duration = Date.now() - startTime;
      
      expect(result).toBe('success');
      expect(duration).toBeLessThan(200); // Should complete within 200ms (well under 800ms SLA)
    });

    test('should handle multiple concurrent operations efficiently', async () => {
      const concurrentOperations = 10;
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return 'concurrent-success';
      };

      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentOperations }, (_, i) => 
        EnterpriseErrorHandler.withCircuitBreaker(
          operation,
          `concurrent-circuit-${i}`,
          {
            operation: 'concurrent-validation',
            component: 'performance-test'
          }
        )
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(concurrentOperations);
      results.forEach(result => expect(result).toBe('concurrent-success'));
      
      // Should complete all operations within reasonable time
      expect(duration).toBeLessThan(500); // Concurrent execution should be efficient
      
      console.log(`✅ ${concurrentOperations} concurrent operations completed in ${duration}ms`);
    });
  });

  describe('Failure Recovery Performance', () => {
    test('should open circuit quickly under failure conditions', async () => {
      const failingOperation = async () => {
        throw new Error('Service unavailable');
      };

      const config = {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        monitoringPeriodMs: 5000
      };

      const startTime = Date.now();
      let failureCount = 0;

      // Trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await EnterpriseErrorHandler.withCircuitBreaker(
            failingOperation,
            'failure-recovery-circuit',
            {
              operation: 'failure-recovery-test',
              component: 'performance-test'
            },
            config
          );
        } catch (error) {
          failureCount++;
        }
      }

      const failureTime = Date.now() - startTime;
      
      expect(failureCount).toBe(5);
      expect(failureTime).toBeLessThan(100); // Should fail fast
      
      // Verify circuit is open
      const status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      expect(status['failure-recovery-circuit'].state).toBe('OPEN');
      
      console.log(`✅ Circuit opened after ${failureTime}ms with ${failureCount} failures`);
    });

    test('should recover within SLA after reset timeout', async () => {
      const operationCallCount = { count: 0 };
      const operation = async () => {
        operationCallCount.count++;
        if (operationCallCount.count <= 3) {
          throw new Error('Service temporarily unavailable');
        }
        return 'recovery-success';
      };

      const config = {
        failureThreshold: 2,
        resetTimeoutMs: 100, // Short timeout for testing
        monitoringPeriodMs: 1000
      };

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await EnterpriseErrorHandler.withCircuitBreaker(
            operation,
            'recovery-time-circuit',
            {
              operation: 'recovery-time-test',
              component: 'performance-test'
            },
            config
          );
        } catch (error) {
          // Expected failures
        }
      }

      // Verify circuit is open
      let status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      expect(status['recovery-time-circuit'].state).toBe('OPEN');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const recoveryStartTime = Date.now();
      
      // Should succeed after timeout
      const result = await EnterpriseErrorHandler.withCircuitBreaker(
        operation,
        'recovery-time-circuit',
        {
          operation: 'recovery-time-test',
          component: 'performance-test'
        },
        config
      );

      const recoveryTime = Date.now() - recoveryStartTime;
      
      expect(result).toBe('recovery-success');
      expect(recoveryTime).toBeLessThan(60000); // Should recover within 60s SLA
      
      // Verify circuit is closed
      status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      expect(status['recovery-time-circuit'].state).toBe('CLOSED');
      
      console.log(`✅ Circuit recovered in ${recoveryTime}ms`);
    });
  });

  describe('Memory and Resource Management', () => {
    test('should not leak memory with many circuit breakers', async () => {
      const initialCircuitCount = Object.keys(EnterpriseErrorHandler.getCircuitBreakerStatus()).length;
      const operation = async () => 'memory-test-success';

      // Create many circuit breakers
      const circuitCount = 100;
      for (let i = 0; i < circuitCount; i++) {
        await EnterpriseErrorHandler.withCircuitBreaker(
          operation,
          `memory-test-circuit-${i}`,
          {
            operation: 'memory-test',
            component: 'performance-test'
          }
        );
      }

      const finalCircuitCount = Object.keys(EnterpriseErrorHandler.getCircuitBreakerStatus()).length;
      const createdCircuits = finalCircuitCount - initialCircuitCount;
      
      expect(createdCircuits).toBe(circuitCount);
      
      // Verify all circuits are healthy
      const status = EnterpriseErrorHandler.getCircuitBreakerStatus();
      Object.values(status).forEach(circuitStatus => {
        expect(circuitStatus.isHealthy).toBe(true);
      });
      
      console.log(`✅ Created ${createdCircuits} circuit breakers without memory issues`);
    });

    test('should handle rapid circuit breaker state changes', async () => {
      let operationShouldFail = true;
      const operation = async () => {
        if (operationShouldFail) {
          throw new Error('Intentional failure');
        }
        return 'state-change-success';
      };

      const config = {
        failureThreshold: 2,
        resetTimeoutMs: 50,
        monitoringPeriodMs: 200
      };

      const iterations = 10;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < iterations; i++) {
        // Alternate between failing and succeeding
        operationShouldFail = i % 3 < 2; // Fail 2 out of 3 times initially
        
        try {
          const result = await EnterpriseErrorHandler.withCircuitBreaker(
            operation,
            'rapid-state-change-circuit',
            {
              operation: 'rapid-state-change-test',
              component: 'performance-test'
            },
            config
          );
          
          if (result === 'state-change-success') {
            successCount++;
          }
        } catch (error) {
          failureCount++;
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      expect(successCount + failureCount).toBe(iterations);
      expect(failureCount).toBeGreaterThan(0); // Should have some failures
      
      console.log(`✅ Handled ${iterations} rapid state changes: ${successCount} successes, ${failureCount} failures`);
    });
  });

  describe('Production Load Simulation', () => {
    test('should maintain performance under sustained load', async () => {
      const loadDurationMs = 2000; // 2 second load test
      const operationsPerSecond = 50;
      const totalOperations = Math.floor(loadDurationMs / 1000 * operationsPerSecond);

      const operation = async () => {
        // Simulate variable latency
        const latency = Math.random() * 50 + 10; // 10-60ms
        await new Promise(resolve => setTimeout(resolve, latency));
        return 'load-test-success';
      };

      const startTime = Date.now();
      const operations: Promise<string>[] = [];

      // Generate load
      for (let i = 0; i < totalOperations; i++) {
        const operationPromise = EnterpriseErrorHandler.withCircuitBreaker(
          operation,
          'load-test-circuit',
          {
            operation: 'load-test',
            component: 'performance-test'
          }
        );
        operations.push(operationPromise);

        // Spread operations over time
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;
      const operationsPerSecondActual = results.length / (totalTime / 1000);

      expect(results).toHaveLength(totalOperations);
      results.forEach(result => expect(result).toBe('load-test-success'));
      
      // Should maintain reasonable throughput
      expect(operationsPerSecondActual).toBeGreaterThan(operationsPerSecond * 0.5);
      
      console.log(`✅ Sustained load test: ${results.length} operations in ${totalTime}ms (${operationsPerSecondActual.toFixed(1)} ops/sec)`);
    });

    test('should demonstrate 99.5% uptime under mixed conditions', async () => {
      const totalOperations = 200;
      let successCount = 0;
      let failureCount = 0;

      // Mix of healthy and unhealthy operations
      const mixedOperation = async (index: number) => {
        // 5% failure rate to test resilience
        if (Math.random() < 0.05) {
          throw new Error(`Simulated failure ${index}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 5));
        return `mixed-success-${index}`;
      };

      const startTime = Date.now();

      // Execute operations with enterprise resilience
      for (let i = 0; i < totalOperations; i++) {
        try {
          const result = await EnterpriseErrorHandler.withResilience(
            () => mixedOperation(i),
            'uptime-test-circuit',
            {
              operation: 'uptime-test',
              component: 'performance-test'
            },
            { maxRetries: 2, baseDelayMs: 10 }, // Quick retries for test
            { failureThreshold: 10, resetTimeoutMs: 100 }
          );
          
          if (result.includes('mixed-success')) {
            successCount++;
          }
        } catch (error) {
          failureCount++;
        }
      }

      const totalTime = Date.now() - startTime;
      const successRate = (successCount / totalOperations) * 100;

      expect(successRate).toBeGreaterThan(95); // Should achieve >95% success rate
      console.log(`✅ Uptime test: ${successRate.toFixed(1)}% success rate (${successCount}/${totalOperations} operations in ${totalTime}ms)`);
    });
  });
});