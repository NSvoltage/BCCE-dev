/**
 * Multi-Tool Intelligence System for BCCE
 * Unified analytics across Claude Code, Cursor, Copilot, Continue, and other AI coding tools
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Base interfaces for tool metrics
export interface ToolMetrics {
  tool: string;
  timestamp: Date;
  usage: {
    activeTime: number;        // milliseconds of active use
    tokensProcessed: number;   // total tokens (input + output)
    requestCount: number;      // number of requests/completions
    acceptanceRate?: number;   // % of suggestions accepted (0-1)
  };
  productivity: {
    linesGenerated: number;    // lines of code generated
    linesModified: number;     // lines of code modified
    filesAffected: number;     // number of files touched
    featuresCompleted?: number; // completed features/tasks
  };
  cost: {
    estimatedCost: number;     // estimated cost in USD
    model?: string;            // model used (if known)
  };
  context: {
    language?: string;         // programming language
    project?: string;          // project name
    user: string;              // user identifier
    session?: string;          // session identifier
  };
}

export interface UnifiedMetrics {
  period: {
    start: Date;
    end: Date;
  };
  tools: Map<string, ToolMetrics[]>;
  aggregated: {
    totalCost: number;
    totalTokens: number;
    totalActiveTime: number;
    productivityScore: number;
    efficiencyRating: number;
  };
  insights: {
    mostEfficient: string;     // most cost-efficient tool
    mostProductive: string;    // most productive tool
    recommendations: ToolRecommendation[];
  };
}

export interface ToolRecommendation {
  type: 'cost-optimization' | 'productivity-boost' | 'tool-switch' | 'workflow-improvement';
  title: string;
  description: string;
  estimatedSavings?: number;
  estimatedProductivityGain?: number;
  implementation: string;
  priority: 'low' | 'medium' | 'high';
}

export interface DevelopmentTask {
  type: 'bug-fix' | 'feature' | 'refactor' | 'documentation' | 'testing';
  complexity: 'simple' | 'moderate' | 'complex';
  language: string;
  estimatedLines: number;
  timeEstimate: number; // minutes
  context: string;
}

// Abstract base class for tool collectors
export abstract class ToolCollector {
  abstract readonly name: string;
  abstract readonly version: string;
  
  abstract isAvailable(): Promise<boolean>;
  abstract collect(period?: { start: Date; end: Date }): Promise<ToolMetrics[]>;
  abstract getRealtimeMetrics(): Promise<ToolMetrics | null>;
}

// Tool-specific collector implementations
export class ClaudeCodeCollector extends ToolCollector {
  readonly name = 'claude-code';
  readonly version = '1.0.0';

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync('claude --version', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async collect(period?: { start: Date; end: Date }): Promise<ToolMetrics[]> {
    const metrics: ToolMetrics[] = [];
    
    try {
      // Read BCCE run artifacts for Claude Code usage
      const bcceRunsDir = '.bcce_runs';
      if (!fs.existsSync(bcceRunsDir)) {
        return metrics;
      }

      const runDirs = fs.readdirSync(bcceRunsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      for (const runDir of runDirs) {
        const runPath = path.join(bcceRunsDir, runDir);
        const runTimestamp = this.parseRunTimestamp(runDir);
        
        if (period && (runTimestamp < period.start || runTimestamp > period.end)) {
          continue;
        }

        const runMetrics = await this.extractRunMetrics(runPath, runTimestamp);
        if (runMetrics) {
          metrics.push(runMetrics);
        }
      }
    } catch (error) {
      console.warn(`Failed to collect Claude Code metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return metrics;
  }

  async getRealtimeMetrics(): Promise<ToolMetrics | null> {
    // For real-time metrics, we'd integrate with BCCE's event system
    return null;
  }

  private parseRunTimestamp(runDir: string): Date {
    // Parse timestamp from run directory name: 2025-08-18T22-58-31-kus6sy
    const timestampMatch = runDir.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    if (timestampMatch) {
      return new Date(timestampMatch[1].replace(/-/g, ':').replace('T', 'T').slice(0, 19));
    }
    return new Date();
  }

  private async extractRunMetrics(runPath: string, timestamp: Date): Promise<ToolMetrics | null> {
    try {
      const stepDirs = fs.readdirSync(runPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      let totalCost = 0;
      let totalTokens = 0;
      let activeTime = 0;
      let requestCount = stepDirs.length;

      for (const stepDir of stepDirs) {
        const costMetricsPath = path.join(runPath, stepDir, 'cost-metrics.json');
        const metricsPath = path.join(runPath, stepDir, 'metrics.json');

        if (fs.existsSync(costMetricsPath)) {
          const costData = JSON.parse(fs.readFileSync(costMetricsPath, 'utf-8'));
          totalCost += costData.totalCost || 0;
          totalTokens += (costData.tokenUsage?.inputTokens || 0) + (costData.tokenUsage?.outputTokens || 0);
        }

        if (fs.existsSync(metricsPath)) {
          const metricsData = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
          activeTime += metricsData.duration || 0;
        }
      }

      if (totalCost === 0 && totalTokens === 0) {
        return null;
      }

      return {
        tool: this.name,
        timestamp,
        usage: {
          activeTime,
          tokensProcessed: totalTokens,
          requestCount,
        },
        productivity: {
          linesGenerated: Math.floor(totalTokens * 0.2), // Rough estimate
          linesModified: Math.floor(totalTokens * 0.1),
          filesAffected: requestCount,
        },
        cost: {
          estimatedCost: totalCost,
        },
        context: {
          user: os.userInfo().username,
          project: process.env.BCCE_PROJECT || 'unknown',
        },
      };
    } catch {
      return null;
    }
  }
}

export class CursorCollector extends ToolCollector {
  readonly name = 'cursor';
  readonly version = '1.0.0';

  async isAvailable(): Promise<boolean> {
    // Check if Cursor is installed
    const cursorPaths = [
      '/Applications/Cursor.app',
      path.join(os.homedir(), '.cursor'),
      path.join(os.homedir(), 'AppData/Local/Programs/cursor'),
    ];

    return cursorPaths.some(p => fs.existsSync(p));
  }

  async collect(period?: { start: Date; end: Date }): Promise<ToolMetrics[]> {
    const metrics: ToolMetrics[] = [];
    
    try {
      // Look for Cursor usage logs in common locations
      const logPaths = this.getCursorLogPaths();
      
      for (const logPath of logPaths) {
        if (fs.existsSync(logPath)) {
          const logMetrics = await this.parseLogFile(logPath, period);
          metrics.push(...logMetrics);
        }
      }
    } catch (error) {
      console.warn(`Failed to collect Cursor metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return metrics;
  }

  async getRealtimeMetrics(): Promise<ToolMetrics | null> {
    // Real-time metrics would require Cursor extension integration
    return null;
  }

  private getCursorLogPaths(): string[] {
    const homeDir = os.homedir();
    return [
      path.join(homeDir, '.cursor/logs'),
      path.join(homeDir, 'Library/Application Support/Cursor/logs'),
      path.join(homeDir, 'AppData/Roaming/Cursor/logs'),
    ];
  }

  private async parseLogFile(logPath: string, period?: { start: Date; end: Date }): Promise<ToolMetrics[]> {
    // This is a placeholder - actual implementation would parse Cursor's log format
    // For now, return simulated metrics
    return [{
      tool: this.name,
      timestamp: new Date(),
      usage: {
        activeTime: 3600000, // 1 hour
        tokensProcessed: 1000,
        requestCount: 10,
        acceptanceRate: 0.75,
      },
      productivity: {
        linesGenerated: 200,
        linesModified: 50,
        filesAffected: 5,
      },
      cost: {
        estimatedCost: 0.05, // Estimated based on usage
      },
      context: {
        user: os.userInfo().username,
        language: 'typescript',
      },
    }];
  }
}

export class CopilotCollector extends ToolCollector {
  readonly name = 'github-copilot';
  readonly version = '1.0.0';

  async isAvailable(): Promise<boolean> {
    // Check if GitHub Copilot is installed (VS Code extension)
    const vscodeExtensionsPath = path.join(os.homedir(), '.vscode/extensions');
    if (!fs.existsSync(vscodeExtensionsPath)) {
      return false;
    }

    try {
      const extensions = fs.readdirSync(vscodeExtensionsPath);
      return extensions.some(ext => ext.includes('github.copilot'));
    } catch {
      return false;
    }
  }

  async collect(period?: { start: Date; end: Date }): Promise<ToolMetrics[]> {
    // This would integrate with GitHub Copilot's telemetry APIs
    // For now, return placeholder metrics
    return [{
      tool: this.name,
      timestamp: new Date(),
      usage: {
        activeTime: 7200000, // 2 hours
        tokensProcessed: 2000,
        requestCount: 25,
        acceptanceRate: 0.65,
      },
      productivity: {
        linesGenerated: 400,
        linesModified: 100,
        filesAffected: 8,
      },
      cost: {
        estimatedCost: 0.10, // GitHub Copilot subscription cost estimate
      },
      context: {
        user: os.userInfo().username,
        language: 'javascript',
      },
    }];
  }

  async getRealtimeMetrics(): Promise<ToolMetrics | null> {
    return null;
  }
}

export class ContinueCollector extends ToolCollector {
  readonly name = 'continue';
  readonly version = '1.0.0';

  async isAvailable(): Promise<boolean> {
    // Check if Continue extension is installed
    const vscodeExtensionsPath = path.join(os.homedir(), '.vscode/extensions');
    if (!fs.existsSync(vscodeExtensionsPath)) {
      return false;
    }

    try {
      const extensions = fs.readdirSync(vscodeExtensionsPath);
      return extensions.some(ext => ext.includes('continue'));
    } catch {
      return false;
    }
  }

  async collect(period?: { start: Date; end: Date }): Promise<ToolMetrics[]> {
    // This would integrate with Continue's usage data
    // For now, return placeholder metrics
    return [{
      tool: this.name,
      timestamp: new Date(),
      usage: {
        activeTime: 1800000, // 30 minutes
        tokensProcessed: 500,
        requestCount: 5,
        acceptanceRate: 0.80,
      },
      productivity: {
        linesGenerated: 100,
        linesModified: 25,
        filesAffected: 3,
      },
      cost: {
        estimatedCost: 0.02,
      },
      context: {
        user: os.userInfo().username,
        language: 'python',
      },
    }];
  }

  async getRealtimeMetrics(): Promise<ToolMetrics | null> {
    return null;
  }
}

// Main Multi-Tool Intelligence System
export class MultiToolIntelligence extends EventEmitter {
  private collectors: Map<string, ToolCollector> = new Map();
  private cache: Map<string, { data: ToolMetrics[]; timestamp: Date }> = new Map();
  private readonly cacheTTL = 300000; // 5 minutes

  constructor() {
    super();
    this.registerDefaultCollectors();
  }

  private registerDefaultCollectors(): void {
    this.registerCollector(new ClaudeCodeCollector());
    this.registerCollector(new CursorCollector());
    this.registerCollector(new CopilotCollector());
    this.registerCollector(new ContinueCollector());
  }

  registerCollector(collector: ToolCollector): void {
    this.collectors.set(collector.name, collector);
    this.emit('collector-registered', collector.name);
  }

  async getAvailableTools(): Promise<string[]> {
    const available: string[] = [];
    
    for (const [name, collector] of this.collectors) {
      try {
        if (await collector.isAvailable()) {
          available.push(name);
        }
      } catch (error) {
        console.warn(`Error checking availability of ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return available;
  }

  async collectMetrics(period?: { start: Date; end: Date }): Promise<UnifiedMetrics> {
    const defaultPeriod = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      end: new Date(),
    };
    const actualPeriod = period || defaultPeriod;

    const toolsData = new Map<string, ToolMetrics[]>();
    let totalCost = 0;
    let totalTokens = 0;
    let totalActiveTime = 0;

    // Collect metrics from all available tools
    for (const [name, collector] of this.collectors) {
      try {
        if (await collector.isAvailable()) {
          const cacheKey = `${name}-${actualPeriod.start.getTime()}-${actualPeriod.end.getTime()}`;
          let metrics: ToolMetrics[];

          // Check cache first
          const cached = this.cache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTTL) {
            metrics = cached.data;
          } else {
            metrics = await collector.collect(actualPeriod);
            this.cache.set(cacheKey, { data: metrics, timestamp: new Date() });
          }

          toolsData.set(name, metrics);

          // Aggregate totals
          for (const metric of metrics) {
            totalCost += metric.cost.estimatedCost;
            totalTokens += metric.usage.tokensProcessed;
            totalActiveTime += metric.usage.activeTime;
          }
        }
      } catch (error) {
        console.warn(`Failed to collect metrics from ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        toolsData.set(name, []);
      }
    }

    // Calculate productivity and efficiency scores
    const productivityScore = this.calculateProductivityScore(toolsData);
    const efficiencyRating = this.calculateEfficiencyRating(toolsData, totalCost);

    // Generate insights and recommendations
    const insights = await this.generateInsights(toolsData);

    return {
      period: actualPeriod,
      tools: toolsData,
      aggregated: {
        totalCost,
        totalTokens,
        totalActiveTime,
        productivityScore,
        efficiencyRating,
      },
      insights,
    };
  }

  private calculateProductivityScore(toolsData: Map<string, ToolMetrics[]>): number {
    let totalLines = 0;
    let totalTime = 0;

    for (const metrics of toolsData.values()) {
      for (const metric of metrics) {
        totalLines += metric.productivity.linesGenerated + metric.productivity.linesModified;
        totalTime += metric.usage.activeTime;
      }
    }

    if (totalTime === 0) return 0;
    
    // Lines per hour as productivity score
    return (totalLines / (totalTime / 3600000)) * 10; // Scaled score
  }

  private calculateEfficiencyRating(toolsData: Map<string, ToolMetrics[]>): number {
    let totalValue = 0;
    let totalCost = 0;

    for (const metrics of toolsData.values()) {
      for (const metric of metrics) {
        const value = metric.productivity.linesGenerated * 0.1 + metric.productivity.linesModified * 0.05;
        totalValue += value;
        totalCost += metric.cost.estimatedCost;
      }
    }

    if (totalCost === 0) return 100;
    return Math.min(100, (totalValue / totalCost) * 10); // Value per dollar, scaled
  }

  private async generateInsights(toolsData: Map<string, ToolMetrics[]>): Promise<UnifiedMetrics['insights']> {
    let mostEfficient = '';
    let mostProductive = '';
    let bestEfficiency = 0;
    let bestProductivity = 0;

    // Find most efficient and productive tools
    for (const [toolName, metrics] of toolsData) {
      if (metrics.length === 0) continue;

      const avgCost = metrics.reduce((sum, m) => sum + m.cost.estimatedCost, 0) / metrics.length;
      const avgLines = metrics.reduce((sum, m) => sum + m.productivity.linesGenerated, 0) / metrics.length;
      
      const efficiency = avgLines / (avgCost || 0.001);
      const productivity = avgLines;

      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        mostEfficient = toolName;
      }

      if (productivity > bestProductivity) {
        bestProductivity = productivity;
        mostProductive = toolName;
      }
    }

    // Generate recommendations
    const recommendations = await this.generateRecommendations(toolsData);

    return {
      mostEfficient: mostEfficient || 'none',
      mostProductive: mostProductive || 'none',
      recommendations,
    };
  }

  private async generateRecommendations(toolsData: Map<string, ToolMetrics[]>): Promise<ToolRecommendation[]> {
    const recommendations: ToolRecommendation[] = [];

    // Analyze tool usage patterns
    const claudeCodeData = toolsData.get('claude-code') || [];
    const cursorData = toolsData.get('cursor') || [];
    const copilotData = toolsData.get('github-copilot') || [];

    // Cost optimization recommendations
    if (claudeCodeData.length > 0) {
      const avgCost = claudeCodeData.reduce((sum, m) => sum + m.cost.estimatedCost, 0) / claudeCodeData.length;
      if (avgCost > 0.10) {
        recommendations.push({
          type: 'cost-optimization',
          title: 'Optimize Claude Code Usage',
          description: 'Consider using cheaper models for simple tasks',
          estimatedSavings: avgCost * 0.3,
          implementation: 'Use Haiku for simple code reviews and formatting tasks',
          priority: 'medium',
        });
      }
    }

    // Productivity recommendations
    if (cursorData.length > 0 && copilotData.length > 0) {
      const cursorProductivity = cursorData.reduce((sum, m) => sum + m.productivity.linesGenerated, 0);
      const copilotProductivity = copilotData.reduce((sum, m) => sum + m.productivity.linesGenerated, 0);
      
      if (cursorProductivity > copilotProductivity * 1.5) {
        recommendations.push({
          type: 'productivity-boost',
          title: 'Consider Switching to Cursor',
          description: 'Cursor shows higher productivity in your workflow',
          estimatedProductivityGain: 25,
          implementation: 'Migrate primary development to Cursor for better AI assistance',
          priority: 'high',
        });
      }
    }

    // Tool usage recommendations
    const totalMetrics = Array.from(toolsData.values()).flat();
    if (totalMetrics.length > 10) {
      recommendations.push({
        type: 'workflow-improvement',
        title: 'Standardize AI Tool Usage',
        description: 'Multiple tools detected - consider consolidating for better efficiency',
        implementation: 'Create team guidelines for when to use each AI tool',
        priority: 'low',
      });
    }

    return recommendations;
  }

  async optimizeToolSelection(task: DevelopmentTask): Promise<ToolRecommendation> {
    const availableTools = await this.getAvailableTools();
    
    // Simple optimization logic based on task characteristics
    let recommendedTool = 'claude-code'; // Default
    let reasoning = '';

    if (task.complexity === 'simple' && task.type === 'documentation') {
      recommendedTool = availableTools.includes('cursor') ? 'cursor' : 'github-copilot';
      reasoning = 'Simple documentation tasks work well with inline completion tools';
    } else if (task.complexity === 'complex' || task.type === 'refactor') {
      recommendedTool = 'claude-code';
      reasoning = 'Complex tasks benefit from Claude Code\'s sophisticated reasoning';
    } else if (task.estimatedLines < 50) {
      recommendedTool = availableTools.includes('github-copilot') ? 'github-copilot' : 'cursor';
      reasoning = 'Small changes are efficiently handled by completion tools';
    }

    return {
      type: 'tool-switch',
      title: `Use ${recommendedTool} for this task`,
      description: reasoning,
      implementation: `Switch to ${recommendedTool} for optimal results`,
      priority: 'medium',
    };
  }

  async exportMetrics(format: 'json' | 'csv' = 'json', period?: { start: Date; end: Date }): Promise<string> {
    const metrics = await this.collectMetrics(period);
    
    if (format === 'json') {
      return JSON.stringify(metrics, (key, value) => {
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        return value;
      }, 2);
    }

    // CSV export
    const headers = ['tool', 'timestamp', 'cost', 'tokens', 'activeTime', 'linesGenerated', 'acceptanceRate'];
    const rows: string[] = [headers.join(',')];

    for (const [toolName, toolMetrics] of metrics.tools) {
      for (const metric of toolMetrics) {
        const row = [
          toolName,
          metric.timestamp.toISOString(),
          metric.cost.estimatedCost.toString(),
          metric.usage.tokensProcessed.toString(),
          metric.usage.activeTime.toString(),
          metric.productivity.linesGenerated.toString(),
          (metric.usage.acceptanceRate || 0).toString(),
        ];
        rows.push(row.join(','));
      }
    }

    return rows.join('\n');
  }

  // Real-time monitoring
  async startRealtimeMonitoring(): Promise<void> {
    const interval = setInterval(async () => {
      try {
        for (const [name, collector] of this.collectors) {
          if (await collector.isAvailable()) {
            const realtimeMetrics = await collector.getRealtimeMetrics();
            if (realtimeMetrics) {
              this.emit('realtime-metrics', name, realtimeMetrics);
            }
          }
        }
      } catch (error) {
        console.warn(`Real-time monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, 30000); // Every 30 seconds

    // Store interval ID for cleanup
    (this as any)._monitoringInterval = interval;
  }

  stopRealtimeMonitoring(): void {
    if ((this as any)._monitoringInterval) {
      clearInterval((this as any)._monitoringInterval);
      delete (this as any)._monitoringInterval;
    }
  }
}

// Export singleton instance
export const multiToolIntelligence = new MultiToolIntelligence();