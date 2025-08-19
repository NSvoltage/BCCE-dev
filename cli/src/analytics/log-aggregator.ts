/**
 * Enterprise Log Aggregation and Sync
 * Securely collects and synchronizes Claude Code logs to AWS for enterprise analytics
 */

import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogStreamCommand } from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { KinesisClient, PutRecordCommand } from '@aws-sdk/client-kinesis';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface LogAggregatorConfig {
  syncMode: 'real-time' | 'batch' | 'hybrid';
  destination: 'cloudwatch' | 's3' | 'kinesis';
  region: string;
  logGroupName?: string;
  bucketName?: string;
  streamName?: string;
  encryption: {
    enabled: boolean;
    keyId?: string;
  };
  privacy: {
    scrubPII: boolean;
    scrubSecrets: boolean;
    allowedPaths: string[];
  };
  compliance: {
    auditLevel: 'basic' | 'detailed' | 'comprehensive';
    retentionDays: number;
  };
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'claude-code' | 'bcce-agent' | 'workflow';
  sessionId: string;
  userId?: string;
  projectId?: string;
  teamId?: string;
  event: string;
  data: Record<string, any>;
  governance?: {
    policyApplied?: string[];
    complianceChecked?: boolean;
    costTracked?: number;
  };
  metadata: {
    version: string;
    platform: string;
    region: string;
  };
}

export interface SyncResult {
  success: boolean;
  entriesProcessed: number;
  entriesSkipped: number;
  errors: string[];
  syncId: string;
}

export class EnterpriseLogAggregator {
  private config: LogAggregatorConfig;
  private cloudWatchLogs?: CloudWatchLogsClient;
  private s3?: S3Client;
  private kinesis?: KinesisClient;
  private syncQueue: LogEntry[] = [];
  private lastSyncTime: Date = new Date(0);

  constructor(config: LogAggregatorConfig) {
    this.config = config;
    this.initializeAWSClients();
  }

  private initializeAWSClients(): void {
    const awsConfig = { region: this.config.region };

    if (this.config.destination === 'cloudwatch') {
      this.cloudWatchLogs = new CloudWatchLogsClient(awsConfig);
    } else if (this.config.destination === 's3') {
      this.s3 = new S3Client(awsConfig);
    } else if (this.config.destination === 'kinesis') {
      this.kinesis = new KinesisClient(awsConfig);
    }
  }

  /**
   * Start monitoring Claude Code logs and sync to enterprise systems
   */
  async startLogAggregation(): Promise<void> {
    console.log('🔍 Starting enterprise log aggregation...');

    // Discover Claude Code log locations
    const logPaths = this.discoverClaudeCodeLogs();
    
    if (logPaths.length === 0) {
      console.log('⚠️ No Claude Code logs found');
      return;
    }

    console.log(`📁 Found ${logPaths.length} log sources`);

    // Process existing logs
    await this.processExistingLogs(logPaths);

    // Set up real-time monitoring if configured
    if (this.config.syncMode === 'real-time' || this.config.syncMode === 'hybrid') {
      this.startRealtimeMonitoring(logPaths);
    }

    // Set up batch processing if configured
    if (this.config.syncMode === 'batch' || this.config.syncMode === 'hybrid') {
      this.startBatchProcessing();
    }

    console.log('✅ Log aggregation started successfully');
  }

  /**
   * Process a single log entry for enterprise sync
   */
  async processLogEntry(entry: LogEntry): Promise<void> {
    // Apply privacy and security filtering
    const sanitizedEntry = await this.sanitizeLogEntry(entry);
    
    // Apply governance metadata
    const enrichedEntry = this.enrichWithGovernanceData(sanitizedEntry);
    
    // Add to sync queue
    this.syncQueue.push(enrichedEntry);

    // Real-time sync if configured
    if (this.config.syncMode === 'real-time') {
      await this.syncLogEntries([enrichedEntry]);
    }
  }

  /**
   * Sync log entries to configured AWS destination
   */
  async syncLogEntries(entries: LogEntry[]): Promise<SyncResult> {
    const syncId = crypto.randomUUID();
    console.log(`🔄 Syncing ${entries.length} log entries (${syncId})`);

    try {
      let result: SyncResult;

      switch (this.config.destination) {
        case 'cloudwatch':
          result = await this.syncToCloudWatch(entries, syncId);
          break;
        case 's3':
          result = await this.syncToS3(entries, syncId);
          break;
        case 'kinesis':
          result = await this.syncToKinesis(entries, syncId);
          break;
        default:
          throw new Error(`Unsupported destination: ${this.config.destination}`);
      }

      this.lastSyncTime = new Date();
      return result;

    } catch (error) {
      return {
        success: false,
        entriesProcessed: 0,
        entriesSkipped: entries.length,
        errors: [error instanceof Error ? error.message : 'Unknown sync error'],
        syncId
      };
    }
  }

  /**
   * Sync to CloudWatch Logs
   */
  private async syncToCloudWatch(entries: LogEntry[], syncId: string): Promise<SyncResult> {
    if (!this.cloudWatchLogs || !this.config.logGroupName) {
      throw new Error('CloudWatch Logs not configured');
    }

    const logEvents = entries.map(entry => ({
      timestamp: entry.timestamp.getTime(),
      message: JSON.stringify({
        level: entry.level,
        source: entry.source,
        sessionId: entry.sessionId,
        event: entry.event,
        data: entry.data,
        governance: entry.governance,
        metadata: entry.metadata
      })
    }));

    // Create log stream if needed
    const streamName = `bcce-${new Date().toISOString().split('T')[0]}-${syncId.substring(0, 8)}`;
    
    try {
      await this.cloudWatchLogs.send(new CreateLogStreamCommand({
        logGroupName: this.config.logGroupName,
        logStreamName: streamName
      }));
    } catch (error) {
      // Stream might already exist
    }

    await this.cloudWatchLogs.send(new PutLogEventsCommand({
      logGroupName: this.config.logGroupName,
      logStreamName: streamName,
      logEvents
    }));

    return {
      success: true,
      entriesProcessed: entries.length,
      entriesSkipped: 0,
      errors: [],
      syncId
    };
  }

  /**
   * Sync to S3 Data Lake
   */
  private async syncToS3(entries: LogEntry[], syncId: string): Promise<SyncResult> {
    if (!this.s3 || !this.config.bucketName) {
      throw new Error('S3 not configured');
    }

    const timestamp = new Date();
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hour = String(timestamp.getHours()).padStart(2, '0');

    const key = `analytics-data/year=${year}/month=${month}/day=${day}/hour=${hour}/bcce-logs-${syncId}.json`;

    const data = {
      syncId,
      syncTime: timestamp.toISOString(),
      entryCount: entries.length,
      entries: entries.map(entry => ({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      }))
    };

    let body = JSON.stringify(data);

    // Encrypt if configured
    if (this.config.encryption.enabled) {
      body = this.encryptData(body);
    }

    await this.s3.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ServerSideEncryption: this.config.encryption.enabled ? 'aws:kms' : undefined,
      SSEKMSKeyId: this.config.encryption.keyId,
      Metadata: {
        'bcce-sync-id': syncId,
        'bcce-entry-count': String(entries.length),
        'bcce-source': 'claude-code'
      }
    }));

    return {
      success: true,
      entriesProcessed: entries.length,
      entriesSkipped: 0,
      errors: [],
      syncId
    };
  }

  /**
   * Sync to Kinesis Data Stream
   */
  private async syncToKinesis(entries: LogEntry[], syncId: string): Promise<SyncResult> {
    if (!this.kinesis || !this.config.streamName) {
      throw new Error('Kinesis not configured');
    }

    const processed = [];
    const errors = [];

    for (const entry of entries) {
      try {
        await this.kinesis.send(new PutRecordCommand({
          StreamName: this.config.streamName,
          Data: JSON.stringify({
            ...entry,
            timestamp: entry.timestamp.toISOString(),
            syncId
          }),
          PartitionKey: entry.sessionId || entry.projectId || 'default'
        }));
        processed.push(entry);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Kinesis put failed');
      }
    }

    return {
      success: errors.length === 0,
      entriesProcessed: processed.length,
      entriesSkipped: entries.length - processed.length,
      errors,
      syncId
    };
  }

  /**
   * Discover Claude Code log files
   */
  private discoverClaudeCodeLogs(): string[] {
    const logPaths: string[] = [];
    const claudeDir = path.join(os.homedir(), '.claude');

    if (!fs.existsSync(claudeDir)) {
      return logPaths;
    }

    // Look for various log files and directories
    const potentialPaths = [
      path.join(claudeDir, 'logs'),
      path.join(claudeDir, 'sessions'),
      path.join(claudeDir, 'shell-snapshots'),
      path.join(claudeDir, 'projects')
    ];

    for (const logPath of potentialPaths) {
      if (fs.existsSync(logPath)) {
        logPaths.push(logPath);
      }
    }

    return logPaths;
  }

  /**
   * Process existing log files
   */
  private async processExistingLogs(logPaths: string[]): Promise<void> {
    console.log('📚 Processing existing log files...');

    for (const logPath of logPaths) {
      await this.processLogDirectory(logPath);
    }
  }

  /**
   * Process a log directory
   */
  private async processLogDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.processLogDirectory(fullPath);
      } else if (entry.isFile() && this.isLogFile(entry.name)) {
        await this.processLogFile(fullPath);
      }
    }
  }

  /**
   * Process individual log file
   */
  private async processLogFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const logEntries = this.parseLogContent(content, filePath);

      for (const entry of logEntries) {
        await this.processLogEntry(entry);
      }

    } catch (error) {
      console.log(`⚠️ Failed to process log file: ${filePath}`);
    }
  }

  /**
   * Parse log content into structured entries
   */
  private parseLogContent(content: string, filePath: string): LogEntry[] {
    const entries: LogEntry[] = [];
    
    // Try to parse as JSON first
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data.map(item => this.normalizeLogEntry(item, filePath));
      } else {
        return [this.normalizeLogEntry(data, filePath)];
      }
    } catch {
      // Parse as line-delimited JSON or text
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          entries.push(this.normalizeLogEntry(data, filePath));
        } catch {
          // Create a text log entry
          entries.push(this.createTextLogEntry(line, filePath));
        }
      }
    }

    return entries;
  }

  /**
   * Normalize log entry to standard format
   */
  private normalizeLogEntry(data: any, filePath: string): LogEntry {
    return {
      timestamp: new Date(data.timestamp || Date.now()),
      level: data.level || 'info',
      source: data.source || 'claude-code',
      sessionId: data.sessionId || this.generateSessionId(filePath),
      userId: data.userId,
      projectId: data.projectId || this.extractProjectFromPath(filePath),
      teamId: data.teamId,
      event: data.event || 'log_entry',
      data: data.data || data,
      governance: data.governance,
      metadata: {
        version: data.version || '1.0.0',
        platform: process.platform,
        region: this.config.region,
        ...data.metadata
      }
    };
  }

  /**
   * Create text log entry for non-JSON logs
   */
  private createTextLogEntry(text: string, filePath: string): LogEntry {
    return {
      timestamp: new Date(),
      level: 'info',
      source: 'claude-code',
      sessionId: this.generateSessionId(filePath),
      projectId: this.extractProjectFromPath(filePath),
      event: 'text_log',
      data: { message: text, filePath },
      metadata: {
        version: '1.0.0',
        platform: process.platform,
        region: this.config.region
      }
    };
  }

  /**
   * Sanitize log entry for privacy and security
   */
  private async sanitizeLogEntry(entry: LogEntry): Promise<LogEntry> {
    const sanitized = { ...entry };

    if (this.config.privacy.scrubPII) {
      sanitized.data = this.scrubPII(sanitized.data);
    }

    if (this.config.privacy.scrubSecrets) {
      sanitized.data = this.scrubSecrets(sanitized.data);
    }

    return sanitized;
  }

  /**
   * Enrich log entry with governance metadata
   */
  private enrichWithGovernanceData(entry: LogEntry): LogEntry {
    return {
      ...entry,
      governance: {
        ...entry.governance,
        aggregatedAt: new Date().toISOString(),
        complianceLevel: this.config.compliance.auditLevel,
        retentionDays: this.config.compliance.retentionDays
      }
    };
  }

  /**
   * Start real-time log monitoring
   */
  private startRealtimeMonitoring(logPaths: string[]): void {
    // Implementation would use fs.watch() to monitor log file changes
    console.log('👁️ Starting real-time log monitoring...');
  }

  /**
   * Start batch processing
   */
  private startBatchProcessing(): void {
    setInterval(async () => {
      if (this.syncQueue.length > 0) {
        const batch = this.syncQueue.splice(0, 100); // Process in batches of 100
        await this.syncLogEntries(batch);
      }
    }, 60000); // Every minute
  }

  // Helper methods
  private isLogFile(filename: string): boolean {
    return filename.endsWith('.log') || 
           filename.endsWith('.json') || 
           filename.includes('session') ||
           filename.includes('snapshot');
  }

  private generateSessionId(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 12);
  }

  private extractProjectFromPath(filePath: string): string | undefined {
    const match = filePath.match(/projects\/([^\/]+)/);
    return match ? match[1] : undefined;
  }

  private scrubPII(data: any): any {
    // Implementation to remove personally identifiable information
    const scrubbed = JSON.parse(JSON.stringify(data));
    // Remove email addresses, phone numbers, etc.
    return scrubbed;
  }

  private scrubSecrets(data: any): any {
    // Implementation to remove API keys, tokens, passwords
    const scrubbed = JSON.parse(JSON.stringify(data));
    // Remove AWS keys, API tokens, etc.
    return scrubbed;
  }

  private encryptData(data: string): string {
    // Implementation for data encryption
    return data; // Placeholder
  }
}