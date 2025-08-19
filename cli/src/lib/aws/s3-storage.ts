/**
 * S3 Storage Integration for BCCE
 * Provides artifact storage, lifecycle management, and versioning
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface S3StorageConfig {
  bucketName: string;
  region?: string;
  prefix?: string;
  enableVersioning?: boolean;
  enableEncryption?: boolean;
  kmsKeyId?: string;
  lifecycleRules?: LifecycleRule[];
}

export interface LifecycleRule {
  id: string;
  status: 'Enabled' | 'Disabled';
  prefix?: string;
  transitions?: Array<{
    days: number;
    storageClass: 'STANDARD_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'DEEP_ARCHIVE';
  }>;
  expiration?: {
    days: number;
  };
  noncurrentVersionExpiration?: {
    days: number;
  };
}

export interface ArtifactMetadata {
  id: string;
  workflowId: string;
  stepId?: string;
  type: 'workflow' | 'step' | 'cost-report' | 'analytics' | 'security-audit';
  timestamp: Date;
  size: number;
  contentType: string;
  tags?: Record<string, string>;
  encryption?: {
    algorithm: string;
    kmsKeyId?: string;
  };
}

export interface StorageStats {
  totalObjects: number;
  totalSize: number;
  storageClasses: Record<string, number>;
  oldestObject: Date;
  newestObject: Date;
}

export class S3Storage extends EventEmitter {
  private config: S3StorageConfig;
  private mockMode = false;
  private localCache: Map<string, Buffer> = new Map();
  private metadataIndex: Map<string, ArtifactMetadata> = new Map();

  constructor(config: S3StorageConfig) {
    super();
    this.config = {
      region: process.env.AWS_REGION || 'us-east-1',
      prefix: 'bcce-artifacts',
      enableVersioning: true,
      enableEncryption: true,
      ...config,
    };
    this.initializeStorage();
  }

  /**
   * Enable mock mode for testing
   */
  enableMockMode(): void {
    this.mockMode = true;
    console.log('S3 Storage running in mock mode');
  }

  /**
   * Initialize S3 bucket and configure settings
   */
  private async initializeStorage(): Promise<void> {
    if (this.mockMode) {
      console.log('Mock mode: S3 bucket initialized:', this.config.bucketName);
      return;
    }

    try {
      // In production, this would:
      // 1. Check if bucket exists
      // 2. Create bucket if needed
      // 3. Configure versioning
      // 4. Configure encryption
      // 5. Apply lifecycle rules
      await this.configureBucket();
    } catch (error) {
      console.error('Failed to initialize S3 storage:', error);
      throw error;
    }
  }

  /**
   * Store workflow artifacts in S3
   */
  async storeArtifact(
    artifactPath: string,
    metadata: Omit<ArtifactMetadata, 'id' | 'size' | 'timestamp'>
  ): Promise<string> {
    const artifactId = this.generateArtifactId(metadata.workflowId, metadata.stepId);
    const s3Key = this.buildS3Key(metadata.type, metadata.workflowId, artifactId);

    try {
      const fileBuffer = fs.readFileSync(artifactPath);
      const fileSize = fileBuffer.length;

      const fullMetadata: ArtifactMetadata = {
        ...metadata,
        id: artifactId,
        size: fileSize,
        timestamp: new Date(),
      };

      if (this.config.enableEncryption) {
        fullMetadata.encryption = {
          algorithm: 'AES256',
          kmsKeyId: this.config.kmsKeyId,
        };
      }

      if (this.mockMode) {
        this.localCache.set(s3Key, fileBuffer);
        this.metadataIndex.set(artifactId, fullMetadata);
        console.log(`Mock mode: Artifact stored at ${s3Key} (${fileSize} bytes)`);
        this.emit('artifact-stored', { artifactId, s3Key, size: fileSize });
        return s3Key;
      }

      // In production, upload to S3
      await this.uploadToS3(s3Key, fileBuffer, fullMetadata);
      this.metadataIndex.set(artifactId, fullMetadata);
      
      this.emit('artifact-stored', { artifactId, s3Key, size: fileSize });
      return s3Key;
    } catch (error) {
      console.error(`Failed to store artifact ${artifactPath}:`, error);
      this.emit('artifact-store-error', { artifactPath, error });
      throw error;
    }
  }

  /**
   * Retrieve artifact from S3
   */
  async retrieveArtifact(artifactId: string, downloadPath?: string): Promise<Buffer> {
    const metadata = this.metadataIndex.get(artifactId);
    if (!metadata) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const s3Key = this.buildS3Key(metadata.type, metadata.workflowId, artifactId);

    try {
      let data: Buffer;

      if (this.mockMode) {
        data = this.localCache.get(s3Key) || Buffer.from('mock-data');
        console.log(`Mock mode: Retrieved artifact ${s3Key}`);
      } else {
        // In production, download from S3
        data = await this.downloadFromS3(s3Key);
      }

      if (downloadPath) {
        fs.writeFileSync(downloadPath, data);
        console.log(`Artifact saved to ${downloadPath}`);
      }

      this.emit('artifact-retrieved', { artifactId, size: data.length });
      return data;
    } catch (error) {
      console.error(`Failed to retrieve artifact ${artifactId}:`, error);
      this.emit('artifact-retrieve-error', { artifactId, error });
      throw error;
    }
  }

  /**
   * List artifacts with filtering
   */
  async listArtifacts(filter?: {
    workflowId?: string;
    type?: ArtifactMetadata['type'];
    startDate?: Date;
    endDate?: Date;
    maxResults?: number;
  }): Promise<ArtifactMetadata[]> {
    try {
      let artifacts = Array.from(this.metadataIndex.values());

      if (filter) {
        if (filter.workflowId) {
          artifacts = artifacts.filter(a => a.workflowId === filter.workflowId);
        }
        if (filter.type) {
          artifacts = artifacts.filter(a => a.type === filter.type);
        }
        if (filter.startDate) {
          artifacts = artifacts.filter(a => a.timestamp >= filter.startDate!);
        }
        if (filter.endDate) {
          artifacts = artifacts.filter(a => a.timestamp <= filter.endDate!);
        }
        if (filter.maxResults) {
          artifacts = artifacts.slice(0, filter.maxResults);
        }
      }

      return artifacts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Failed to list artifacts:', error);
      throw error;
    }
  }

  /**
   * Delete artifact from S3
   */
  async deleteArtifact(artifactId: string): Promise<void> {
    const metadata = this.metadataIndex.get(artifactId);
    if (!metadata) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const s3Key = this.buildS3Key(metadata.type, metadata.workflowId, artifactId);

    try {
      if (this.mockMode) {
        this.localCache.delete(s3Key);
        this.metadataIndex.delete(artifactId);
        console.log(`Mock mode: Deleted artifact ${s3Key}`);
      } else {
        // In production, delete from S3
        await this.deleteFromS3(s3Key);
        this.metadataIndex.delete(artifactId);
      }

      this.emit('artifact-deleted', { artifactId });
    } catch (error) {
      console.error(`Failed to delete artifact ${artifactId}:`, error);
      throw error;
    }
  }

  /**
   * Configure lifecycle rules for automatic archival and deletion
   */
  async configureLifecycle(rules?: LifecycleRule[]): Promise<void> {
    const defaultRules: LifecycleRule[] = [
      {
        id: 'archive-old-artifacts',
        status: 'Enabled',
        prefix: `${this.config.prefix}/workflow`,
        transitions: [
          { days: 30, storageClass: 'STANDARD_IA' },
          { days: 90, storageClass: 'GLACIER' },
          { days: 365, storageClass: 'DEEP_ARCHIVE' },
        ],
        expiration: { days: 730 }, // Delete after 2 years
      },
      {
        id: 'delete-old-cost-reports',
        status: 'Enabled',
        prefix: `${this.config.prefix}/cost-report`,
        transitions: [
          { days: 7, storageClass: 'STANDARD_IA' },
        ],
        expiration: { days: 90 }, // Delete after 90 days
      },
      {
        id: 'archive-security-audits',
        status: 'Enabled',
        prefix: `${this.config.prefix}/security-audit`,
        transitions: [
          { days: 1, storageClass: 'INTELLIGENT_TIERING' },
          { days: 180, storageClass: 'GLACIER' },
        ],
        // Never delete security audits
      },
    ];

    const rulesToApply = rules || defaultRules;
    this.config.lifecycleRules = rulesToApply;

    if (this.mockMode) {
      console.log('Mock mode: Lifecycle rules configured:', rulesToApply.length);
      return;
    }

    // In production, apply lifecycle rules to S3 bucket
    await this.applyLifecycleRules(rulesToApply);
    this.emit('lifecycle-configured', rulesToApply);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      const artifacts = Array.from(this.metadataIndex.values());
      
      if (artifacts.length === 0) {
        return {
          totalObjects: 0,
          totalSize: 0,
          storageClasses: {},
          oldestObject: new Date(),
          newestObject: new Date(),
        };
      }

      const stats: StorageStats = {
        totalObjects: artifacts.length,
        totalSize: artifacts.reduce((sum, a) => sum + a.size, 0),
        storageClasses: {
          STANDARD: artifacts.length, // Simplified for mock
        },
        oldestObject: artifacts.reduce((oldest, a) => 
          a.timestamp < oldest ? a.timestamp : oldest, artifacts[0].timestamp),
        newestObject: artifacts.reduce((newest, a) => 
          a.timestamp > newest ? a.timestamp : newest, artifacts[0].timestamp),
      };

      return stats;
    } catch (error) {
      console.error('Failed to get storage statistics:', error);
      throw error;
    }
  }

  /**
   * Create presigned URL for direct upload/download
   */
  async createPresignedUrl(
    operation: 'upload' | 'download',
    key: string,
    expiresIn = 3600 // 1 hour
  ): Promise<string> {
    const url = `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
    
    if (this.mockMode) {
      const mockUrl = `${url}?mock=true&expires=${Date.now() + expiresIn * 1000}`;
      console.log(`Mock mode: Created presigned URL for ${operation}: ${mockUrl}`);
      return mockUrl;
    }

    // In production, generate actual presigned URL
    return this.generatePresignedUrl(operation, key, expiresIn);
  }

  /**
   * Batch upload multiple artifacts
   */
  async batchUpload(artifacts: Array<{
    path: string;
    metadata: Omit<ArtifactMetadata, 'id' | 'size' | 'timestamp'>;
  }>): Promise<string[]> {
    const results: string[] = [];
    const errors: Error[] = [];

    for (const artifact of artifacts) {
      try {
        const key = await this.storeArtifact(artifact.path, artifact.metadata);
        results.push(key);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      console.warn(`Batch upload completed with ${errors.length} errors`);
    }

    this.emit('batch-upload-complete', { 
      successful: results.length, 
      failed: errors.length 
    });

    return results;
  }

  /**
   * Enable cross-region replication
   */
  async enableReplication(destinationBucket: string, destinationRegion: string): Promise<void> {
    if (this.mockMode) {
      console.log(`Mock mode: Replication enabled to ${destinationBucket} in ${destinationRegion}`);
      return;
    }

    // In production, configure S3 cross-region replication
    await this.configureReplication(destinationBucket, destinationRegion);
    this.emit('replication-enabled', { destinationBucket, destinationRegion });
  }

  /**
   * Archive old artifacts to Glacier
   */
  async archiveOldArtifacts(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const artifactsToArchive = Array.from(this.metadataIndex.values())
      .filter(a => a.timestamp < cutoffDate);

    if (this.mockMode) {
      console.log(`Mock mode: Would archive ${artifactsToArchive.length} artifacts older than ${olderThanDays} days`);
      return artifactsToArchive.length;
    }

    // In production, move objects to Glacier storage class
    for (const artifact of artifactsToArchive) {
      const s3Key = this.buildS3Key(artifact.type, artifact.workflowId, artifact.id);
      await this.moveToGlacier(s3Key);
    }

    this.emit('artifacts-archived', { count: artifactsToArchive.length });
    return artifactsToArchive.length;
  }

  // Private helper methods

  private generateArtifactId(workflowId: string, stepId?: string): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${workflowId}-${stepId || 'workflow'}-${timestamp}-${random}`;
  }

  private buildS3Key(type: string, workflowId: string, artifactId: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${this.config.prefix}/${type}/${year}/${month}/${day}/${workflowId}/${artifactId}`;
  }

  // AWS SDK integration methods (stubbed)

  private async configureBucket(): Promise<void> {
    console.log(`Would configure S3 bucket: ${this.config.bucketName}`);
  }

  private async uploadToS3(key: string, data: Buffer, metadata: ArtifactMetadata): Promise<void> {
    console.log(`Would upload to S3: ${key} (${data.length} bytes)`);
  }

  private async downloadFromS3(key: string): Promise<Buffer> {
    console.log(`Would download from S3: ${key}`);
    return Buffer.from('mock-data');
  }

  private async deleteFromS3(key: string): Promise<void> {
    console.log(`Would delete from S3: ${key}`);
  }

  private async applyLifecycleRules(rules: LifecycleRule[]): Promise<void> {
    console.log(`Would apply ${rules.length} lifecycle rules to bucket`);
  }

  private async generatePresignedUrl(operation: string, key: string, expiresIn: number): Promise<string> {
    console.log(`Would generate presigned URL for ${operation}: ${key}`);
    return `https://mock-url.com/${key}`;
  }

  private async configureReplication(bucket: string, region: string): Promise<void> {
    console.log(`Would configure replication to ${bucket} in ${region}`);
  }

  private async moveToGlacier(key: string): Promise<void> {
    console.log(`Would move ${key} to Glacier storage class`);
  }
}

// Export factory function
export function createS3Storage(config: S3StorageConfig): S3Storage {
  return new S3Storage(config);
}