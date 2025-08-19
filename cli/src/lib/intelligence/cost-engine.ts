/**
 * Cost Intelligence Engine for BCCE
 * Tracks, analyzes, and optimizes Claude Code/Bedrock usage costs
 */

import { EventEmitter } from 'node:events';

// Token pricing per model (example rates - should be configurable)
const MODEL_PRICING = {
  'anthropic.claude-3-5-sonnet': {
    inputPer1K: 0.003,
    outputPer1K: 0.015
  },
  'anthropic.claude-3-opus': {
    inputPer1K: 0.015,
    outputPer1K: 0.075
  },
  'anthropic.claude-3-haiku': {
    inputPer1K: 0.00025,
    outputPer1K: 0.00125
  }
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  timestamp: Date;
}

export interface CostMetrics {
  totalCost: number;
  inputCost: number;
  outputCost: number;
  tokenUsage: TokenUsage;
  workflowId?: string;
  stepId?: string;
  team?: string;
  project?: string;
}

export interface CostReport {
  period: {
    start: Date;
    end: Date;
  };
  totalCost: number;
  totalTokens: {
    input: number;
    output: number;
  };
  byModel: Map<string, CostMetrics>;
  byTeam: Map<string, CostMetrics>;
  byWorkflow: Map<string, CostMetrics>;
  savings: {
    amount: number;
    percentage: number;
    optimizations: OptimizationSuggestion[];
  };
  projections: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

export interface OptimizationSuggestion {
  type: 'model-downgrade' | 'caching' | 'batching' | 'prompt-reduction';
  description: string;
  estimatedSavings: number;
  implementation: string;
}

export class TokenUsageTracker {
  private history: TokenUsage[] = [];

  /**
   * Extract token count from Claude Code response
   */
  extractTokens(response: any): TokenUsage {
    // Parse Claude Code/Bedrock response for token usage
    // This would integrate with actual Claude Code response format
    const usage: TokenUsage = {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      model: response.model || 'unknown',
      timestamp: new Date()
    };

    this.history.push(usage);
    return usage;
  }

  /**
   * Count tokens in a text string (approximation)
   */
  estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getHistory(since?: Date): TokenUsage[] {
    if (!since) return this.history;
    return this.history.filter(u => u.timestamp >= since);
  }
}

export class CostCalculator {
  /**
   * Calculate cost for token usage
   */
  calculate(usage: TokenUsage): number {
    const modelKey = Object.keys(MODEL_PRICING).find(key => 
      usage.model.includes(key.replace('anthropic.', ''))
    );

    if (!modelKey) {
      console.warn(`Unknown model for pricing: ${usage.model}`);
      return 0;
    }

    const pricing = MODEL_PRICING[modelKey as keyof typeof MODEL_PRICING];
    const inputCost = (usage.inputTokens / 1000) * pricing.inputPer1K;
    const outputCost = (usage.outputTokens / 1000) * pricing.outputPer1K;

    return inputCost + outputCost;
  }

  /**
   * Calculate cost breakdown with metadata
   */
  calculateDetailed(usage: TokenUsage, metadata?: any): CostMetrics {
    const totalCost = this.calculate(usage);
    const pricing = this.getPricing(usage.model);

    return {
      totalCost,
      inputCost: (usage.inputTokens / 1000) * pricing.inputPer1K,
      outputCost: (usage.outputTokens / 1000) * pricing.outputPer1K,
      tokenUsage: usage,
      ...metadata
    };
  }

  private getPricing(model: string) {
    const modelKey = Object.keys(MODEL_PRICING).find(key => 
      model.includes(key.replace('anthropic.', ''))
    );
    return MODEL_PRICING[modelKey as keyof typeof MODEL_PRICING] || MODEL_PRICING['anthropic.claude-3-haiku'];
  }
}

export class CostOptimizer {
  /**
   * Analyze usage and suggest optimizations
   */
  suggest(metrics: CostMetrics[], threshold: number = 0.10): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Model downgrade opportunities
    const highCostSimpleTasks = this.identifySimpleHighCostTasks(metrics);
    if (highCostSimpleTasks.length > 0) {
      suggestions.push({
        type: 'model-downgrade',
        description: `${highCostSimpleTasks.length} simple tasks using expensive models`,
        estimatedSavings: this.calculateDowngradeSavings(highCostSimpleTasks),
        implementation: 'Use Claude Haiku for simple tasks like formatting or basic analysis'
      });
    }

    // Caching opportunities
    const repeatPatterns = this.identifyRepeatPatterns(metrics);
    if (repeatPatterns.count > 5) {
      suggestions.push({
        type: 'caching',
        description: `${repeatPatterns.count} repeated similar requests detected`,
        estimatedSavings: repeatPatterns.potentialSavings,
        implementation: 'Enable prompt caching for frequently repeated requests'
      });
    }

    // Batching opportunities
    const batchable = this.identifyBatchableRequests(metrics);
    if (batchable.length > 3) {
      suggestions.push({
        type: 'batching',
        description: `${batchable.length} requests could be batched`,
        estimatedSavings: this.calculateBatchingSavings(batchable),
        implementation: 'Combine multiple small requests into single batch requests'
      });
    }

    return suggestions;
  }

  private identifySimpleHighCostTasks(metrics: CostMetrics[]): CostMetrics[] {
    // Identify tasks with low token count but high-cost models
    return metrics.filter(m => 
      m.tokenUsage.inputTokens < 500 && 
      m.tokenUsage.outputTokens < 500 &&
      m.tokenUsage.model.includes('opus')
    );
  }

  private identifyRepeatPatterns(metrics: CostMetrics[]): { count: number; potentialSavings: number } {
    // Simplified pattern detection - in production would use more sophisticated analysis
    const patterns = new Map<string, number>();
    let repeatCount = 0;
    let potentialSavings = 0;

    metrics.forEach(m => {
      const key = `${m.tokenUsage.inputTokens}-${m.tokenUsage.model}`;
      const count = (patterns.get(key) || 0) + 1;
      patterns.set(key, count);
      
      if (count > 1) {
        repeatCount++;
        potentialSavings += m.totalCost * 0.8; // 80% savings with caching
      }
    });

    return { count: repeatCount, potentialSavings };
  }

  private identifyBatchableRequests(metrics: CostMetrics[]): CostMetrics[] {
    // Identify small requests that could be batched
    return metrics.filter(m => 
      m.tokenUsage.inputTokens < 200 &&
      m.tokenUsage.outputTokens < 200
    );
  }

  private calculateDowngradeSavings(metrics: CostMetrics[]): number {
    return metrics.reduce((total, m) => {
      const currentCost = m.totalCost;
      const haikuCost = this.estimateHaikuCost(m.tokenUsage);
      return total + (currentCost - haikuCost);
    }, 0);
  }

  private calculateBatchingSavings(metrics: CostMetrics[]): number {
    // Estimate 30% overhead reduction through batching
    return metrics.reduce((total, m) => total + m.totalCost * 0.3, 0);
  }

  private estimateHaikuCost(usage: TokenUsage): number {
    const pricing = MODEL_PRICING['anthropic.claude-3-haiku'];
    return (usage.inputTokens / 1000) * pricing.inputPer1K +
           (usage.outputTokens / 1000) * pricing.outputPer1K;
  }
}

export class CostIntelligenceEngine extends EventEmitter {
  private tracker: TokenUsageTracker;
  private calculator: CostCalculator;
  private optimizer: CostOptimizer;
  private metricsStore: CostMetrics[] = [];

  constructor() {
    super();
    this.tracker = new TokenUsageTracker();
    this.calculator = new CostCalculator();
    this.optimizer = new CostOptimizer();
  }

  /**
   * Track Claude Code request/response costs
   */
  async trackUsage(request: any, response: any, metadata?: any): Promise<CostMetrics> {
    const usage = this.tracker.extractTokens(response);
    const metrics = this.calculator.calculateDetailed(usage, metadata);
    
    this.metricsStore.push(metrics);
    
    // Emit real-time cost event
    this.emit('cost-tracked', metrics);

    // Check for optimization opportunities
    const suggestions = this.optimizer.suggest([metrics]);
    if (suggestions.length > 0) {
      this.emit('optimization-available', suggestions);
    }

    return metrics;
  }

  /**
   * Generate comprehensive cost report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<CostReport> {
    const periodMetrics = this.metricsStore.filter(m => 
      m.tokenUsage.timestamp >= startDate && 
      m.tokenUsage.timestamp <= endDate
    );

    const totalCost = periodMetrics.reduce((sum, m) => sum + m.totalCost, 0);
    const totalInputTokens = periodMetrics.reduce((sum, m) => sum + m.tokenUsage.inputTokens, 0);
    const totalOutputTokens = periodMetrics.reduce((sum, m) => sum + m.tokenUsage.outputTokens, 0);

    // Group by model
    const byModel = new Map<string, CostMetrics>();
    periodMetrics.forEach(m => {
      const existing = byModel.get(m.tokenUsage.model);
      if (existing) {
        existing.totalCost += m.totalCost;
        existing.tokenUsage.inputTokens += m.tokenUsage.inputTokens;
        existing.tokenUsage.outputTokens += m.tokenUsage.outputTokens;
      } else {
        byModel.set(m.tokenUsage.model, { ...m });
      }
    });

    // Group by team
    const byTeam = new Map<string, CostMetrics>();
    periodMetrics.forEach(m => {
      if (m.team) {
        const existing = byTeam.get(m.team);
        if (existing) {
          existing.totalCost += m.totalCost;
        } else {
          byTeam.set(m.team, { ...m });
        }
      }
    });

    // Group by workflow
    const byWorkflow = new Map<string, CostMetrics>();
    periodMetrics.forEach(m => {
      if (m.workflowId) {
        const existing = byWorkflow.get(m.workflowId);
        if (existing) {
          existing.totalCost += m.totalCost;
        } else {
          byWorkflow.set(m.workflowId, { ...m });
        }
      }
    });

    // Calculate savings and optimizations
    const suggestions = this.optimizer.suggest(periodMetrics);
    const potentialSavings = suggestions.reduce((sum, s) => sum + s.estimatedSavings, 0);

    // Calculate projections
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
    const dailyAverage = totalCost / daysDiff;

    return {
      period: { start: startDate, end: endDate },
      totalCost,
      totalTokens: {
        input: totalInputTokens,
        output: totalOutputTokens
      },
      byModel,
      byTeam,
      byWorkflow,
      savings: {
        amount: potentialSavings,
        percentage: (potentialSavings / totalCost) * 100,
        optimizations: suggestions
      },
      projections: {
        daily: dailyAverage,
        weekly: dailyAverage * 7,
        monthly: dailyAverage * 30
      }
    };
  }

  /**
   * Get real-time cost for current session
   */
  getCurrentSessionCost(): number {
    const sessionStart = new Date(Date.now() - 3600000); // Last hour
    const sessionMetrics = this.metricsStore.filter(m => 
      m.tokenUsage.timestamp >= sessionStart
    );
    return sessionMetrics.reduce((sum, m) => sum + m.totalCost, 0);
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.metricsStore, null, 2);
    }
    
    // CSV export
    const headers = ['timestamp', 'model', 'inputTokens', 'outputTokens', 'totalCost', 'team', 'workflow'];
    const rows = this.metricsStore.map(m => [
      m.tokenUsage.timestamp.toISOString(),
      m.tokenUsage.model,
      m.tokenUsage.inputTokens,
      m.tokenUsage.outputTokens,
      m.totalCost.toFixed(4),
      m.team || '',
      m.workflowId || ''
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

// Export singleton instance
export const costEngine = new CostIntelligenceEngine();