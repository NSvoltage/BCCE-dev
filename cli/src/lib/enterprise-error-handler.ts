/**
 * Enterprise-Grade Error Handling for BCCE
 * Provides retry logic, circuit breaker patterns, and comprehensive error context
 */

export interface ErrorContext {
  operation: string;
  timestamp: Date;
  region?: string;
  accountId?: string;
  component: string;
  correlationId: string;
  metadata: Record<string, any>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
  exponentialBackoff: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringPeriodMs: number;
}

export class EnterpriseError extends Error {
  public readonly context: ErrorContext;
  public readonly originalError?: Error;
  public readonly isRetryable: boolean;

  constructor(message: string, context: ErrorContext, originalError?: Error, isRetryable: boolean = false) {
    super(message);
    this.name = 'EnterpriseError';
    this.context = context;
    this.originalError = originalError;
    this.isRetryable = isRetryable;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      isRetryable: this.isRetryable,
      originalError: this.originalError?.message,
      stack: this.stack
    };
  }
}

export class EnterpriseErrorHandler {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBackoff: true,
    retryableErrors: [
      'ThrottlingException',
      'InternalServerError',
      'ServiceUnavailable',
      'RequestTimeout',
      'NetworkError',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND'
    ]
  };

  private static readonly DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    monitoringPeriodMs: 300000
  };

  private static circuitBreakers = new Map<string, CircuitBreakerState>();

  /**
   * Execute operation with retry logic and error context
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext>,
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig };
    const fullContext = this.createErrorContext(context);
    let lastError: Error;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError, config.retryableErrors);
        
        if (!isRetryable || attempt === config.maxRetries) {
          throw new EnterpriseError(
            `Operation failed after ${attempt + 1} attempts: ${lastError.message}`,
            { ...fullContext, metadata: { ...fullContext.metadata, attempts: attempt + 1 } },
            lastError,
            isRetryable
          );
        }

        // Calculate delay with exponential backoff
        const delay = config.exponentialBackoff 
          ? Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs)
          : config.baseDelayMs;

        console.warn(`Operation failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  static async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitName: string,
    context: Partial<ErrorContext>,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    const circuitConfig = { ...this.DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    const circuitState = this.getCircuitBreakerState(circuitName, circuitConfig);
    const fullContext = this.createErrorContext(context);

    // Check circuit state
    if (circuitState.state === 'OPEN') {
      if (Date.now() - circuitState.lastFailureTime < circuitConfig.resetTimeoutMs) {
        throw new EnterpriseError(
          `Circuit breaker ${circuitName} is OPEN`,
          { ...fullContext, metadata: { ...fullContext.metadata, circuitState: 'OPEN' } }
        );
      } else {
        // Reset to half-open
        circuitState.state = 'HALF_OPEN';
        circuitState.consecutiveFailures = 0;
      }
    }

    try {
      const result = await operation();
      
      // Success - reset circuit breaker
      circuitState.state = 'CLOSED';
      circuitState.consecutiveFailures = 0;
      
      return result;
    } catch (error) {
      const enterpriseError = error instanceof EnterpriseError 
        ? error 
        : new EnterpriseError(
            `Circuit breaker operation failed: ${error instanceof Error ? error.message : String(error)}`,
            fullContext,
            error instanceof Error ? error : undefined
          );

      // Update circuit breaker state
      circuitState.consecutiveFailures++;
      circuitState.lastFailureTime = Date.now();

      if (circuitState.consecutiveFailures >= circuitConfig.failureThreshold) {
        circuitState.state = 'OPEN';
        console.error(`Circuit breaker ${circuitName} opened after ${circuitState.consecutiveFailures} failures`);
      }

      throw enterpriseError;
    }
  }

  /**
   * Execute operation with both retry and circuit breaker
   */
  static async withResilience<T>(
    operation: () => Promise<T>,
    circuitName: string,
    context: Partial<ErrorContext>,
    retryConfig: Partial<RetryConfig> = {},
    circuitConfig: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    return this.withCircuitBreaker(
      () => this.withRetry(operation, context, retryConfig),
      circuitName,
      context,
      circuitConfig
    );
  }

  /**
   * Create comprehensive error context
   */
  static createErrorContext(partial: Partial<ErrorContext>): ErrorContext {
    return {
      operation: partial.operation || 'unknown',
      timestamp: new Date(),
      region: partial.region || process.env.AWS_REGION || 'us-east-1',
      accountId: partial.accountId,
      component: partial.component || 'bcce',
      correlationId: partial.correlationId || this.generateCorrelationId(),
      metadata: partial.metadata || {}
    };
  }

  /**
   * Check if error is retryable based on error patterns
   */
  private static isRetryableError(error: Error, retryableErrors: string[]): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name;

    return retryableErrors.some(pattern => 
      errorMessage.includes(pattern.toLowerCase()) || 
      errorName.includes(pattern)
    );
  }

  /**
   * Get or create circuit breaker state
   */
  private static getCircuitBreakerState(name: string, config: CircuitBreakerConfig): CircuitBreakerState {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        config
      });
    }
    return this.circuitBreakers.get(name)!;
  }

  /**
   * Generate unique correlation ID for request tracking
   */
  private static generateCorrelationId(): string {
    return `bcce-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format error for logging
   */
  static formatError(error: Error): string {
    if (error instanceof EnterpriseError) {
      return JSON.stringify(error.toJSON(), null, 2);
    }
    
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack
    }, null, 2);
  }

  /**
   * Get circuit breaker status for monitoring
   */
  static getCircuitBreakerStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, state] of this.circuitBreakers.entries()) {
      status[name] = {
        state: state.state,
        consecutiveFailures: state.consecutiveFailures,
        lastFailureTime: state.lastFailureTime,
        isHealthy: state.state === 'CLOSED'
      };
    }
    
    return status;
  }
}

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  lastFailureTime: number;
  config: CircuitBreakerConfig;
}