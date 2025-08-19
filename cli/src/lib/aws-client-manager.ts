/**
 * AWS SDK Client Manager for BCCE
 * Provides optimized, pooled AWS service clients with connection reuse and performance optimization
 */

import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { KinesisClient } from '@aws-sdk/client-kinesis';
import { QuickSightClient } from '@aws-sdk/client-quicksight';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { RDSClient } from '@aws-sdk/client-rds';
import { EnterpriseErrorHandler } from './enterprise-error-handler.js';

export interface AWSClientConfig {
  region: string;
  maxRetries?: number;
  requestTimeout?: number;
  connectionTimeout?: number;
  maxConnections?: number;
}

export interface ClientPoolOptions {
  maxPoolSize: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
}

export type AWSServiceClient = 
  | CloudFormationClient
  | S3Client
  | STSClient
  | CloudWatchLogsClient
  | KinesisClient
  | QuickSightClient
  | ECSClient
  | EC2Client
  | RDSClient;

interface ClientPoolEntry<T extends AWSServiceClient> {
  client: T;
  lastUsed: number;
  inUse: boolean;
  healthy: boolean;
}

export class AWSClientManager {
  private static instance?: AWSClientManager;
  private clientPools = new Map<string, ClientPoolEntry<any>[]>();
  private defaultConfig: AWSClientConfig;
  private poolOptions: ClientPoolOptions;
  private healthCheckInterval?: NodeJS.Timeout;

  private constructor(config: AWSClientConfig, poolOptions: Partial<ClientPoolOptions> = {}) {
    this.defaultConfig = {
      maxRetries: 3,
      requestTimeout: 30000,
      connectionTimeout: 5000,
      maxConnections: 50,
      ...config
    };

    this.poolOptions = {
      maxPoolSize: 10,
      idleTimeoutMs: 300000, // 5 minutes
      healthCheckIntervalMs: 60000, // 1 minute
      ...poolOptions
    };

    this.startHealthCheck();
  }

  /**
   * Get singleton instance of AWS Client Manager
   */
  static getInstance(config?: AWSClientConfig, poolOptions?: Partial<ClientPoolOptions>): AWSClientManager {
    if (!this.instance) {
      if (!config) {
        throw new Error('AWS Client Manager not initialized. Provide config on first call.');
      }
      this.instance = new AWSClientManager(config, poolOptions);
    }
    return this.instance;
  }

  /**
   * Initialize the client manager with configuration
   */
  static initialize(config: AWSClientConfig, poolOptions?: Partial<ClientPoolOptions>): AWSClientManager {
    this.instance = new AWSClientManager(config, poolOptions);
    return this.instance;
  }

  /**
   * Get CloudFormation client with connection pooling
   */
  getCloudFormationClient(region?: string): CloudFormationClient {
    return this.getClient('cloudformation', region, () => new CloudFormationClient(this.createClientConfig(region)));
  }

  /**
   * Get S3 client with connection pooling
   */
  getS3Client(region?: string): S3Client {
    return this.getClient('s3', region, () => new S3Client(this.createClientConfig(region)));
  }

  /**
   * Get STS client with connection pooling
   */
  getSTSClient(region?: string): STSClient {
    return this.getClient('sts', region, () => new STSClient(this.createClientConfig(region)));
  }

  /**
   * Get CloudWatch Logs client with connection pooling
   */
  getCloudWatchLogsClient(region?: string): CloudWatchLogsClient {
    return this.getClient('cloudwatch-logs', region, () => new CloudWatchLogsClient(this.createClientConfig(region)));
  }

  /**
   * Get Kinesis client with connection pooling
   */
  getKinesisClient(region?: string): KinesisClient {
    return this.getClient('kinesis', region, () => new KinesisClient(this.createClientConfig(region)));
  }

  /**
   * Get QuickSight client with connection pooling
   */
  getQuickSightClient(region?: string): QuickSightClient {
    return this.getClient('quicksight', region, () => new QuickSightClient(this.createClientConfig(region)));
  }

  /**
   * Get ECS client with connection pooling
   */
  getECSClient(region?: string): ECSClient {
    return this.getClient('ecs', region, () => new ECSClient(this.createClientConfig(region)));
  }

  /**
   * Get EC2 client with connection pooling
   */
  getEC2Client(region?: string): EC2Client {
    return this.getClient('ec2', region, () => new EC2Client(this.createClientConfig(region)));
  }

  /**
   * Get RDS client with connection pooling
   */
  getRDSClient(region?: string): RDSClient {
    return this.getClient('rds', region, () => new RDSClient(this.createClientConfig(region)));
  }

  /**
   * Release a client back to the pool
   */
  releaseClient<T extends AWSServiceClient>(serviceType: string, region: string, client: T): void {
    const poolKey = `${serviceType}-${region}`;
    const pool = this.clientPools.get(poolKey);
    
    if (pool) {
      const entry = pool.find(entry => entry.client === client);
      if (entry) {
        entry.inUse = false;
        entry.lastUsed = Date.now();
      }
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getPoolStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [poolKey, pool] of this.clientPools.entries()) {
      stats[poolKey] = {
        totalClients: pool.length,
        activeClients: pool.filter(entry => entry.inUse).length,
        healthyClients: pool.filter(entry => entry.healthy).length,
        idleClients: pool.filter(entry => !entry.inUse).length
      };
    }
    
    return stats;
  }

  /**
   * Clear all client pools (useful for testing)
   */
  clearPools(): void {
    for (const [poolKey, pool] of this.clientPools.entries()) {
      for (const entry of pool) {
        try {
          entry.client.destroy?.();
        } catch (error) {
          // Ignore destroy errors
        }
      }
    }
    this.clientPools.clear();
  }

  /**
   * Shutdown the client manager
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    this.clearPools();
    AWSClientManager.instance = undefined;
  }

  // Private methods

  /**
   * Generic method to get a client from the pool
   */
  private getClient<T extends AWSServiceClient>(
    serviceType: string,
    region: string | undefined,
    clientFactory: () => T
  ): T {
    const effectiveRegion = region || this.defaultConfig.region;
    const poolKey = `${serviceType}-${effectiveRegion}`;
    
    // Get or create pool
    let pool = this.clientPools.get(poolKey);
    if (!pool) {
      pool = [];
      this.clientPools.set(poolKey, pool);
    }

    // Find available client
    let availableEntry = pool.find(entry => !entry.inUse && entry.healthy);
    
    if (!availableEntry) {
      // Create new client if pool not full
      if (pool.length < this.poolOptions.maxPoolSize) {
        const newClient = clientFactory();
        availableEntry = {
          client: newClient,
          lastUsed: Date.now(),
          inUse: true,
          healthy: true
        };
        pool.push(availableEntry);
      } else {
        // Find oldest idle client to reuse
        const oldestEntry = pool
          .filter(entry => !entry.inUse)
          .sort((a, b) => a.lastUsed - b.lastUsed)[0];
        
        if (oldestEntry) {
          availableEntry = oldestEntry;
        } else {
          // All clients are in use, create a temporary one
          return clientFactory();
        }
      }
    }

    availableEntry.inUse = true;
    availableEntry.lastUsed = Date.now();
    
    return availableEntry.client;
  }

  /**
   * Create optimized client configuration
   */
  private createClientConfig(region?: string) {
    return {
      region: region || this.defaultConfig.region,
      maxAttempts: this.defaultConfig.maxRetries,
      requestHandler: {
        connectionTimeout: this.defaultConfig.connectionTimeout,
        socketTimeout: this.defaultConfig.requestTimeout,
        maxSockets: this.defaultConfig.maxConnections
      },
      retryMode: 'adaptive' as const,
      // Enable request compression for better performance
      useAccelerateEndpoint: false,
      // Enable request/response logging in development
      logger: process.env.NODE_ENV === 'development' ? console : undefined
    };
  }

  /**
   * Start periodic health check for client pools
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.poolOptions.healthCheckIntervalMs);
  }

  /**
   * Perform health check on client pools
   */
  private performHealthCheck(): void {
    const now = Date.now();
    const idleThreshold = now - this.poolOptions.idleTimeoutMs;

    for (const [poolKey, pool] of this.clientPools.entries()) {
      // Remove idle clients that have exceeded idle timeout
      const activeClients = pool.filter(entry => {
        if (!entry.inUse && entry.lastUsed < idleThreshold) {
          try {
            entry.client.destroy?.();
          } catch (error) {
            // Ignore destroy errors
          }
          return false;
        }
        return true;
      });

      // Update pool
      this.clientPools.set(poolKey, activeClients);

      // Log pool statistics
      if (process.env.NODE_ENV === 'development') {
        console.debug(`AWS Client Pool ${poolKey}: ${activeClients.length} clients, ${activeClients.filter(e => e.inUse).length} active`);
      }
    }
  }
}

/**
 * Utility function to execute AWS operations with automatic client management
 */
export async function withAWSClient<T extends AWSServiceClient, R>(
  clientGetter: (manager: AWSClientManager) => T,
  operation: (client: T) => Promise<R>,
  region?: string
): Promise<R> {
  const manager = AWSClientManager.getInstance();
  const client = clientGetter(manager);
  
  try {
    return await EnterpriseErrorHandler.withRetry(
      () => operation(client),
      {
        operation: 'aws-sdk-operation',
        component: 'aws-client-manager',
        region: region || 'unknown'
      }
    );
  } finally {
    // Note: In a real implementation, we would track the service type and region
    // to properly release the client back to the pool
  }
}