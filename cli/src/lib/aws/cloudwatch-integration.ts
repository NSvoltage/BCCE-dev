/**
 * CloudWatch Integration for BCCE
 * Provides metrics publishing, alerting, and dashboard management
 */

import { EventEmitter } from 'node:events';
import { CostMetrics } from '../intelligence/cost-engine.js';
import { ToolMetrics } from '../intelligence/multi-tool.js';

// CloudWatch metric interfaces
export interface CloudWatchMetric {
  namespace: string;
  metricName: string;
  value: number;
  unit: 'Count' | 'Seconds' | 'Milliseconds' | 'Bytes' | 'None' | 'Percent';
  timestamp: Date;
  dimensions?: Record<string, string>;
}

export interface CloudWatchAlarm {
  alarmName: string;
  metricName: string;
  namespace: string;
  threshold: number;
  comparisonOperator: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanOrEqualToThreshold';
  evaluationPeriods: number;
  period: number; // seconds
  statistic: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount';
  description?: string;
  actionsEnabled?: boolean;
  alarmActions?: string[]; // SNS topic ARNs
}

export interface MetricFilter {
  filterName: string;
  filterPattern: string;
  metricTransformation: {
    metricName: string;
    metricNamespace: string;
    metricValue: string;
    defaultValue?: number;
  };
}

export interface Dashboard {
  name: string;
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  type: 'metric' | 'log' | 'text' | 'alarm';
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: any;
}

export class CloudWatchIntegration extends EventEmitter {
  private readonly namespace = 'BCCE';
  private readonly region: string;
  private metricsBuffer: CloudWatchMetric[] = [];
  private readonly bufferSize = 20; // CloudWatch PutMetricData limit
  private readonly flushInterval = 60000; // 1 minute
  private flushTimer?: NodeJS.Timeout;
  private mockMode = false; // For testing without AWS

  constructor(region = process.env.AWS_REGION || 'us-east-1') {
    super();
    this.region = region;
    this.startMetricsFlush();
  }

  /**
   * Enable mock mode for testing
   */
  enableMockMode(): void {
    this.mockMode = true;
    console.log('CloudWatch integration running in mock mode');
  }

  /**
   * Publish cost metrics to CloudWatch
   */
  async publishCostMetrics(metrics: CostMetrics): Promise<void> {
    const cloudWatchMetrics: CloudWatchMetric[] = [
      {
        namespace: this.namespace,
        metricName: 'TokenUsage',
        value: metrics.tokenUsage.inputTokens + metrics.tokenUsage.outputTokens,
        unit: 'Count',
        timestamp: new Date(),
        dimensions: {
          Model: metrics.model || 'unknown',
          Team: metrics.metadata?.team || 'default',
          WorkflowId: metrics.metadata?.workflowId || 'unknown',
        },
      },
      {
        namespace: this.namespace,
        metricName: 'Cost',
        value: metrics.totalCost,
        unit: 'None', // USD
        timestamp: new Date(),
        dimensions: {
          Model: metrics.model || 'unknown',
          Team: metrics.metadata?.team || 'default',
          Project: metrics.metadata?.project || 'unknown',
        },
      },
      {
        namespace: this.namespace,
        metricName: 'InputTokens',
        value: metrics.tokenUsage.inputTokens,
        unit: 'Count',
        timestamp: new Date(),
        dimensions: {
          Model: metrics.model || 'unknown',
        },
      },
      {
        namespace: this.namespace,
        metricName: 'OutputTokens',
        value: metrics.tokenUsage.outputTokens,
        unit: 'Count',
        timestamp: new Date(),
        dimensions: {
          Model: metrics.model || 'unknown',
        },
      },
    ];

    await this.publishMetrics(cloudWatchMetrics);
  }

  /**
   * Publish tool usage metrics to CloudWatch
   */
  async publishToolMetrics(metrics: ToolMetrics): Promise<void> {
    const cloudWatchMetrics: CloudWatchMetric[] = [
      {
        namespace: this.namespace,
        metricName: 'ToolActiveTime',
        value: metrics.usage.activeTime,
        unit: 'Milliseconds',
        timestamp: metrics.timestamp,
        dimensions: {
          Tool: metrics.tool,
          Language: metrics.context.language || 'unknown',
          User: metrics.context.user,
        },
      },
      {
        namespace: this.namespace,
        metricName: 'ToolTokensProcessed',
        value: metrics.usage.tokensProcessed,
        unit: 'Count',
        timestamp: metrics.timestamp,
        dimensions: {
          Tool: metrics.tool,
          Project: metrics.context.project || 'unknown',
        },
      },
      {
        namespace: this.namespace,
        metricName: 'LinesGenerated',
        value: metrics.productivity.linesGenerated,
        unit: 'Count',
        timestamp: metrics.timestamp,
        dimensions: {
          Tool: metrics.tool,
          Language: metrics.context.language || 'unknown',
        },
      },
      {
        namespace: this.namespace,
        metricName: 'AcceptanceRate',
        value: (metrics.usage.acceptanceRate || 0) * 100,
        unit: 'Percent',
        timestamp: metrics.timestamp,
        dimensions: {
          Tool: metrics.tool,
        },
      },
    ];

    await this.publishMetrics(cloudWatchMetrics);
  }

  /**
   * Publish workflow metrics
   */
  async publishWorkflowMetrics(
    workflowId: string,
    status: 'started' | 'completed' | 'failed',
    duration?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const metrics: CloudWatchMetric[] = [
      {
        namespace: this.namespace,
        metricName: 'WorkflowExecution',
        value: 1,
        unit: 'Count',
        timestamp: new Date(),
        dimensions: {
          WorkflowId: workflowId,
          Status: status,
          Team: metadata?.team || 'default',
        },
      },
    ];

    if (duration) {
      metrics.push({
        namespace: this.namespace,
        metricName: 'WorkflowDuration',
        value: duration,
        unit: 'Milliseconds',
        timestamp: new Date(),
        dimensions: {
          WorkflowId: workflowId,
          Status: status,
        },
      });
    }

    if (status === 'failed') {
      metrics.push({
        namespace: this.namespace,
        metricName: 'WorkflowFailures',
        value: 1,
        unit: 'Count',
        timestamp: new Date(),
        dimensions: {
          WorkflowId: workflowId,
          ErrorType: metadata?.errorType || 'unknown',
        },
      });
    }

    await this.publishMetrics(metrics);
  }

  /**
   * Create CloudWatch alarms for cost and usage thresholds
   */
  async createAlarms(config: {
    costThreshold?: number;
    tokenThreshold?: number;
    failureRateThreshold?: number;
    snsTopicArn?: string;
  }): Promise<CloudWatchAlarm[]> {
    const alarms: CloudWatchAlarm[] = [];

    if (config.costThreshold) {
      alarms.push({
        alarmName: 'BCCE-High-Cost-Alert',
        metricName: 'Cost',
        namespace: this.namespace,
        threshold: config.costThreshold,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 1,
        period: 3600, // 1 hour
        statistic: 'Sum',
        description: `Alert when hourly cost exceeds $${config.costThreshold}`,
        actionsEnabled: true,
        alarmActions: config.snsTopicArn ? [config.snsTopicArn] : [],
      });
    }

    if (config.tokenThreshold) {
      alarms.push({
        alarmName: 'BCCE-High-Token-Usage-Alert',
        metricName: 'TokenUsage',
        namespace: this.namespace,
        threshold: config.tokenThreshold,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 2,
        period: 300, // 5 minutes
        statistic: 'Sum',
        description: `Alert when token usage exceeds ${config.tokenThreshold} in 5 minutes`,
        actionsEnabled: true,
        alarmActions: config.snsTopicArn ? [config.snsTopicArn] : [],
      });
    }

    if (config.failureRateThreshold) {
      alarms.push({
        alarmName: 'BCCE-High-Failure-Rate-Alert',
        metricName: 'WorkflowFailures',
        namespace: this.namespace,
        threshold: config.failureRateThreshold,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 300, // 5 minutes
        statistic: 'Average',
        description: `Alert when failure rate exceeds ${config.failureRateThreshold}%`,
        actionsEnabled: true,
        alarmActions: config.snsTopicArn ? [config.snsTopicArn] : [],
      });
    }

    if (this.mockMode) {
      console.log('Mock mode: Alarms created:', alarms);
      return alarms;
    }

    // In production, this would use AWS SDK to create alarms
    await this.createAlarmsInCloudWatch(alarms);
    return alarms;
  }

  /**
   * Create a CloudWatch dashboard for BCCE metrics
   */
  async createDashboard(name = 'BCCE-Metrics-Dashboard'): Promise<Dashboard> {
    const dashboard: Dashboard = {
      name,
      widgets: [
        // Cost metrics widget
        {
          type: 'metric',
          title: 'Cost Trends',
          x: 0,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [this.namespace, 'Cost', { stat: 'Sum', label: 'Total Cost' }],
            ],
            period: 300,
            stat: 'Sum',
            region: this.region,
            title: 'Cost Trends (Hourly)',
            yAxis: {
              left: {
                label: 'Cost (USD)',
                min: 0,
              },
            },
          },
        },
        // Token usage widget
        {
          type: 'metric',
          title: 'Token Usage',
          x: 12,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [this.namespace, 'InputTokens', { stat: 'Sum', label: 'Input Tokens' }],
              ['.', 'OutputTokens', { stat: 'Sum', label: 'Output Tokens' }],
            ],
            period: 300,
            stat: 'Sum',
            region: this.region,
            title: 'Token Usage',
            yAxis: {
              left: {
                label: 'Tokens',
                min: 0,
              },
            },
          },
        },
        // Workflow success rate widget
        {
          type: 'metric',
          title: 'Workflow Success Rate',
          x: 0,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [this.namespace, 'WorkflowExecution', { stat: 'Sum', label: 'Total Executions' }],
              ['.', 'WorkflowFailures', { stat: 'Sum', label: 'Failed Executions' }],
            ],
            period: 3600,
            stat: 'Sum',
            region: this.region,
            title: 'Workflow Success Rate',
          },
        },
        // Tool usage comparison widget
        {
          type: 'metric',
          title: 'AI Tool Usage Comparison',
          x: 12,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [this.namespace, 'ToolActiveTime', { stat: 'Sum', dimensions: { Tool: 'claude-code' } }],
              ['.', '.', { stat: 'Sum', dimensions: { Tool: 'cursor' } }],
              ['.', '.', { stat: 'Sum', dimensions: { Tool: 'github-copilot' } }],
              ['.', '.', { stat: 'Sum', dimensions: { Tool: 'continue' } }],
            ],
            period: 3600,
            stat: 'Sum',
            region: this.region,
            title: 'AI Tool Usage (Hours)',
            yAxis: {
              left: {
                label: 'Active Time (ms)',
                min: 0,
              },
            },
          },
        },
        // Productivity metrics widget
        {
          type: 'metric',
          title: 'Productivity Metrics',
          x: 0,
          y: 12,
          width: 24,
          height: 6,
          properties: {
            metrics: [
              [this.namespace, 'LinesGenerated', { stat: 'Sum', label: 'Lines Generated' }],
              ['.', 'AcceptanceRate', { stat: 'Average', label: 'Acceptance Rate (%)' }],
            ],
            period: 3600,
            stat: 'Sum',
            region: this.region,
            title: 'Team Productivity',
            yAxis: {
              left: {
                label: 'Lines',
                min: 0,
              },
              right: {
                label: 'Acceptance Rate (%)',
                min: 0,
                max: 100,
              },
            },
          },
        },
      ],
    };

    if (this.mockMode) {
      console.log('Mock mode: Dashboard created:', dashboard.name);
      return dashboard;
    }

    // In production, this would use AWS SDK to create dashboard
    await this.createDashboardInCloudWatch(dashboard);
    return dashboard;
  }

  /**
   * Create metric filters for CloudWatch Logs
   */
  async createMetricFilters(logGroupName: string): Promise<MetricFilter[]> {
    const filters: MetricFilter[] = [
      {
        filterName: 'BCCE-Error-Count',
        filterPattern: '[time, request_id, level = ERROR, ...]',
        metricTransformation: {
          metricName: 'ErrorCount',
          metricNamespace: this.namespace,
          metricValue: '1',
          defaultValue: 0,
        },
      },
      {
        filterName: 'BCCE-Cost-Tracking',
        filterPattern: '[time, request_id, ..., cost_value = *cost:*, ...]',
        metricTransformation: {
          metricName: 'TrackedCosts',
          metricNamespace: this.namespace,
          metricValue: '$cost_value',
        },
      },
      {
        filterName: 'BCCE-Workflow-Duration',
        filterPattern: '[time, ..., duration = *duration:*, ...]',
        metricTransformation: {
          metricName: 'WorkflowDuration',
          metricNamespace: this.namespace,
          metricValue: '$duration',
        },
      },
      {
        filterName: 'BCCE-Security-Violations',
        filterPattern: '[time, ..., security = *SECURITY_VIOLATION*, ...]',
        metricTransformation: {
          metricName: 'SecurityViolations',
          metricNamespace: this.namespace,
          metricValue: '1',
          defaultValue: 0,
        },
      },
    ];

    if (this.mockMode) {
      console.log('Mock mode: Metric filters created for log group:', logGroupName);
      return filters;
    }

    // In production, this would use AWS SDK to create metric filters
    await this.createMetricFiltersInCloudWatch(logGroupName, filters);
    return filters;
  }

  /**
   * Get metrics statistics from CloudWatch
   */
  async getMetricStatistics(
    metricName: string,
    startTime: Date,
    endTime: Date,
    period = 3600, // 1 hour
    statistic: 'Average' | 'Sum' | 'Minimum' | 'Maximum' = 'Average',
    dimensions?: Record<string, string>
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    if (this.mockMode) {
      // Return mock data for testing
      const mockData = [];
      const current = new Date(startTime);
      while (current < endTime) {
        mockData.push({
          timestamp: new Date(current),
          value: Math.random() * 100,
        });
        current.setSeconds(current.getSeconds() + period);
      }
      return mockData;
    }

    // In production, this would use AWS SDK to query CloudWatch
    return this.queryCloudWatchMetrics(metricName, startTime, endTime, period, statistic, dimensions);
  }

  /**
   * Enable anomaly detection for critical metrics
   */
  async enableAnomalyDetection(metrics: string[]): Promise<void> {
    const anomalyDetectors = metrics.map(metricName => ({
      namespace: this.namespace,
      metricName,
      stat: 'Average',
    }));

    if (this.mockMode) {
      console.log('Mock mode: Anomaly detection enabled for:', metrics);
      return;
    }

    // In production, this would use AWS SDK to create anomaly detectors
    await this.createAnomalyDetectors(anomalyDetectors);
  }

  /**
   * Export metrics to S3 for long-term storage
   */
  async exportMetricsToS3(
    bucketName: string,
    prefix: string,
    startTime: Date,
    endTime: Date
  ): Promise<string> {
    const exportPath = `${prefix}/${startTime.toISOString()}_${endTime.toISOString()}.json`;

    if (this.mockMode) {
      console.log(`Mock mode: Metrics exported to s3://${bucketName}/${exportPath}`);
      return exportPath;
    }

    // In production, this would use AWS SDK to export metrics
    await this.exportToS3(bucketName, exportPath, startTime, endTime);
    return exportPath;
  }

  // Private methods

  private async publishMetrics(metrics: CloudWatchMetric[]): Promise<void> {
    this.metricsBuffer.push(...metrics);

    if (this.metricsBuffer.length >= this.bufferSize) {
      await this.flushMetrics();
    }

    this.emit('metrics-published', metrics);
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = this.metricsBuffer.splice(0, this.bufferSize);

    if (this.mockMode) {
      console.log(`Mock mode: Flushing ${metricsToFlush.length} metrics to CloudWatch`);
      return;
    }

    try {
      // In production, this would use AWS SDK
      await this.sendToCloudWatch(metricsToFlush);
      this.emit('metrics-flushed', metricsToFlush.length);
    } catch (error) {
      console.error('Failed to flush metrics to CloudWatch:', error);
      this.emit('metrics-flush-error', error);
    }
  }

  private startMetricsFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushMetrics().catch(console.error);
    }, this.flushInterval);
  }

  stopMetricsFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    // Flush any remaining metrics
    this.flushMetrics().catch(console.error);
  }

  // AWS SDK integration methods (stubbed for now)

  private async sendToCloudWatch(metrics: CloudWatchMetric[]): Promise<void> {
    // Implementation would use AWS SDK CloudWatch client
    console.log(`Would send ${metrics.length} metrics to CloudWatch`);
  }

  private async createAlarmsInCloudWatch(alarms: CloudWatchAlarm[]): Promise<void> {
    // Implementation would use AWS SDK CloudWatch client
    console.log(`Would create ${alarms.length} alarms in CloudWatch`);
  }

  private async createDashboardInCloudWatch(dashboard: Dashboard): Promise<void> {
    // Implementation would use AWS SDK CloudWatch client
    console.log(`Would create dashboard ${dashboard.name} in CloudWatch`);
  }

  private async createMetricFiltersInCloudWatch(logGroupName: string, filters: MetricFilter[]): Promise<void> {
    // Implementation would use AWS SDK CloudWatch Logs client
    console.log(`Would create ${filters.length} metric filters for ${logGroupName}`);
  }

  private async queryCloudWatchMetrics(
    metricName: string,
    startTime: Date,
    endTime: Date,
    period: number,
    statistic: string,
    dimensions?: Record<string, string>
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    // Implementation would use AWS SDK CloudWatch client
    console.log(`Would query ${metricName} from ${startTime} to ${endTime}`);
    return [];
  }

  private async createAnomalyDetectors(detectors: any[]): Promise<void> {
    // Implementation would use AWS SDK CloudWatch client
    console.log(`Would create ${detectors.length} anomaly detectors`);
  }

  private async exportToS3(bucket: string, path: string, startTime: Date, endTime: Date): Promise<void> {
    // Implementation would use AWS SDK S3 client
    console.log(`Would export metrics to s3://${bucket}/${path}`);
  }
}

// Export singleton instance
export const cloudWatchIntegration = new CloudWatchIntegration();