/**
 * Correlation Engine for BCCE Multi-Tool Intelligence
 * Analyzes relationships between tool usage and productivity outcomes
 */

import { ToolMetrics, UnifiedMetrics } from './multi-tool.js';

export interface ProductivityCorrelation {
  tool: string;
  metric: string;
  correlation: number; // -1 to 1
  confidence: number;  // 0 to 1
  significance: 'low' | 'medium' | 'high';
  insights: string[];
}

export interface TeamProductivityMetrics {
  team: string;
  period: { start: Date; end: Date };
  metrics: {
    velocity: number;           // features delivered per week
    codeQuality: number;        // defect rate (inverse)
    efficiency: number;         // value delivered per cost
    satisfaction: number;       // developer satisfaction score
    aiAdoption: number;         // percentage using AI tools
  };
  toolUsage: Map<string, {
    adoptionRate: number;       // % of team using tool
    averageUsage: number;       // hours per week
    satisfaction: number;       // tool satisfaction score
  }>;
  correlations: ProductivityCorrelation[];
}

export interface ProductivityTrend {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changeRate: number;         // percentage change per week
  projectedValue: number;     // value in 4 weeks
  confidence: number;         // prediction confidence
}

export interface BenchmarkComparison {
  metric: string;
  currentValue: number;
  industryAverage: number;
  topPercentile: number;
  ranking: 'below-average' | 'average' | 'above-average' | 'top-tier';
  improvementPotential: number; // percentage improvement possible
}

export class CorrelationEngine {
  private readonly minSampleSize = 5;
  private readonly significanceThreshold = 0.3;

  /**
   * Analyze correlations between tool usage and productivity metrics
   */
  analyzeProductivityCorrelations(
    toolMetrics: Map<string, ToolMetrics[]>,
    productivityData?: TeamProductivityMetrics[]
  ): ProductivityCorrelation[] {
    const correlations: ProductivityCorrelation[] = [];

    // Analyze within-tool correlations
    for (const [toolName, metrics] of toolMetrics) {
      if (metrics.length < this.minSampleSize) continue;

      // Cost vs Productivity correlation
      const costProductivityCorr = this.calculateCorrelation(
        metrics.map(m => m.cost.estimatedCost),
        metrics.map(m => m.productivity.linesGenerated)
      );

      if (Math.abs(costProductivityCorr.correlation) > this.significanceThreshold) {
        correlations.push({
          tool: toolName,
          metric: 'cost-productivity',
          correlation: costProductivityCorr.correlation,
          confidence: costProductivityCorr.confidence,
          significance: this.getSignificanceLevel(costProductivityCorr.correlation),
          insights: this.generateCostProductivityInsights(toolName, costProductivityCorr.correlation)
        });
      }

      // Usage time vs Quality correlation
      const timeQualityCorr = this.calculateCorrelation(
        metrics.map(m => m.usage.activeTime),
        metrics.map(m => m.usage.acceptanceRate || 0.5)
      );

      if (Math.abs(timeQualityCorr.correlation) > this.significanceThreshold) {
        correlations.push({
          tool: toolName,
          metric: 'time-quality',
          correlation: timeQualityCorr.correlation,
          confidence: timeQualityCorr.confidence,
          significance: this.getSignificanceLevel(timeQualityCorr.correlation),
          insights: this.generateTimeQualityInsights(toolName, timeQualityCorr.correlation)
        });
      }
    }

    // Cross-tool correlations
    const crossToolCorrelations = this.analyzeCrossToolCorrelations(toolMetrics);
    correlations.push(...crossToolCorrelations);

    return correlations;
  }

  /**
   * Calculate team productivity metrics and benchmarks
   */
  calculateTeamMetrics(
    toolMetrics: Map<string, ToolMetrics[]>,
    teamData?: Partial<TeamProductivityMetrics>
  ): TeamProductivityMetrics {
    const period = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    // Aggregate tool usage across team
    const toolUsage = new Map<string, { adoptionRate: number; averageUsage: number; satisfaction: number }>();
    
    for (const [toolName, metrics] of toolMetrics) {
      if (metrics.length === 0) continue;

      const avgUsage = metrics.reduce((sum, m) => sum + m.usage.activeTime, 0) / metrics.length / 3600000; // hours
      const avgSatisfaction = metrics.reduce((sum, m) => sum + (m.usage.acceptanceRate || 0.7), 0) / metrics.length;
      
      toolUsage.set(toolName, {
        adoptionRate: metrics.length > 0 ? 1.0 : 0.0, // Simplified - would track unique users
        averageUsage: avgUsage,
        satisfaction: avgSatisfaction
      });
    }

    // Calculate derived productivity metrics
    const totalLines = Array.from(toolMetrics.values())
      .flat()
      .reduce((sum, m) => sum + m.productivity.linesGenerated + m.productivity.linesModified, 0);

    const totalCost = Array.from(toolMetrics.values())
      .flat()
      .reduce((sum, m) => sum + m.cost.estimatedCost, 0);

    const aiAdoption = toolUsage.size > 0 ? 
      Array.from(toolUsage.values()).reduce((sum, usage) => sum + usage.adoptionRate, 0) / toolUsage.size : 0;

    const velocity = this.estimateVelocity(totalLines);
    const codeQuality = this.estimateCodeQuality(toolMetrics);
    const efficiency = totalCost > 0 ? totalLines / totalCost : 0;
    const satisfaction = toolUsage.size > 0 ?
      Array.from(toolUsage.values()).reduce((sum, usage) => sum + usage.satisfaction, 0) / toolUsage.size : 0.7;

    const correlations = this.analyzeProductivityCorrelations(toolMetrics);

    return {
      team: teamData?.team || process.env.BCCE_TEAM || 'default',
      period,
      metrics: {
        velocity,
        codeQuality,
        efficiency,
        satisfaction,
        aiAdoption
      },
      toolUsage,
      correlations
    };
  }

  /**
   * Analyze productivity trends over time
   */
  analyzeProductivityTrends(
    historicalMetrics: Array<{ date: Date; metrics: TeamProductivityMetrics }>
  ): ProductivityTrend[] {
    if (historicalMetrics.length < 3) {
      return []; // Need at least 3 data points for trend analysis
    }

    const trends: ProductivityTrend[] = [];
    const metrics = ['velocity', 'codeQuality', 'efficiency', 'satisfaction', 'aiAdoption'] as const;

    for (const metric of metrics) {
      const values = historicalMetrics.map(h => h.metrics.metrics[metric]);
      const dates = historicalMetrics.map(h => h.date);
      
      const trend = this.calculateTrend(values, dates);
      if (trend) {
        trends.push(trend);
      }
    }

    return trends;
  }

  /**
   * Generate benchmark comparisons
   */
  generateBenchmarks(teamMetrics: TeamProductivityMetrics): BenchmarkComparison[] {
    // Industry benchmarks (would be loaded from external data in production)
    const benchmarks = {
      velocity: { average: 3.5, topPercentile: 6.0 },
      codeQuality: { average: 0.85, topPercentile: 0.95 },
      efficiency: { average: 1000, topPercentile: 2000 },
      satisfaction: { average: 0.75, topPercentile: 0.90 },
      aiAdoption: { average: 0.60, topPercentile: 0.85 }
    };

    const comparisons: BenchmarkComparison[] = [];

    for (const [metric, benchmark] of Object.entries(benchmarks)) {
      const currentValue = teamMetrics.metrics[metric as keyof typeof teamMetrics.metrics];
      
      let ranking: BenchmarkComparison['ranking'];
      if (currentValue >= benchmark.topPercentile) {
        ranking = 'top-tier';
      } else if (currentValue >= benchmark.average) {
        ranking = 'above-average';
      } else if (currentValue >= benchmark.average * 0.8) {
        ranking = 'average';
      } else {
        ranking = 'below-average';
      }

      const improvementPotential = ((benchmark.topPercentile - currentValue) / currentValue) * 100;

      comparisons.push({
        metric,
        currentValue,
        industryAverage: benchmark.average,
        topPercentile: benchmark.topPercentile,
        ranking,
        improvementPotential: Math.max(0, improvementPotential)
      });
    }

    return comparisons;
  }

  /**
   * Generate optimization recommendations based on correlations
   */
  generateOptimizationRecommendations(
    correlations: ProductivityCorrelation[],
    benchmarks: BenchmarkComparison[]
  ): Array<{
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
    timeline: string;
    implementation: string[];
  }> {
    const recommendations: Array<{
      title: string;
      description: string;
      impact: 'low' | 'medium' | 'high';
      effort: 'low' | 'medium' | 'high';
      timeline: string;
      implementation: string[];
    }> = [];

    // Analyze correlations for recommendations
    for (const correlation of correlations) {
      if (correlation.significance === 'high' && correlation.correlation < -0.5) {
        if (correlation.metric === 'cost-productivity') {
          recommendations.push({
            title: `Optimize ${correlation.tool} Cost Efficiency`,
            description: `Strong negative correlation detected between cost and productivity for ${correlation.tool}`,
            impact: 'high',
            effort: 'medium',
            timeline: '2-4 weeks',
            implementation: [
              'Review current model selection strategy',
              'Implement intelligent model routing',
              'Set up cost monitoring alerts',
              'Train team on cost-effective usage patterns'
            ]
          });
        }
      }

      if (correlation.significance === 'high' && correlation.correlation > 0.6) {
        if (correlation.metric === 'time-quality') {
          recommendations.push({
            title: `Scale ${correlation.tool} Usage`,
            description: `Strong positive correlation between usage time and output quality`,
            impact: 'medium',
            effort: 'low',
            timeline: '1-2 weeks',
            implementation: [
              'Encourage increased adoption of this tool',
              'Provide additional training',
              'Set usage targets for team members'
            ]
          });
        }
      }
    }

    // Analyze benchmarks for recommendations
    for (const benchmark of benchmarks) {
      if (benchmark.ranking === 'below-average' && benchmark.improvementPotential > 25) {
        recommendations.push({
          title: `Improve ${benchmark.metric.charAt(0).toUpperCase() + benchmark.metric.slice(1)}`,
          description: `Currently ${benchmark.ranking} with ${benchmark.improvementPotential.toFixed(0)}% improvement potential`,
          impact: 'high',
          effort: 'medium',
          timeline: '4-6 weeks',
          implementation: this.getImprovementActions(benchmark.metric)
        });
      }
    }

    return recommendations;
  }

  // Helper methods

  private calculateCorrelation(x: number[], y: number[]): { correlation: number; confidence: number } {
    if (x.length !== y.length || x.length < 2) {
      return { correlation: 0, confidence: 0 };
    }

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    if (denominator === 0) {
      return { correlation: 0, confidence: 0 };
    }

    const correlation = numerator / denominator;
    const confidence = Math.min(1, n / 10); // Higher confidence with more data points

    return { correlation, confidence };
  }

  private getSignificanceLevel(correlation: number): 'low' | 'medium' | 'high' {
    const abs = Math.abs(correlation);
    if (abs > 0.7) return 'high';
    if (abs > 0.5) return 'medium';
    return 'low';
  }

  private generateCostProductivityInsights(tool: string, correlation: number): string[] {
    if (correlation < -0.5) {
      return [
        `${tool} shows diminishing returns at higher costs`,
        'Consider optimizing model selection for cost efficiency',
        'Implement usage guidelines to maximize value per dollar'
      ];
    } else if (correlation > 0.5) {
      return [
        `${tool} productivity increases with investment`,
        'Higher-tier models may provide better value',
        'Consider upgrading usage tier for better results'
      ];
    }
    return [`${tool} cost and productivity are weakly correlated`];
  }

  private generateTimeQualityInsights(tool: string, correlation: number): string[] {
    if (correlation > 0.5) {
      return [
        `${tool} quality improves with longer usage sessions`,
        'Encourage developers to spend more time with the tool',
        'Consider longer, focused work sessions rather than quick interactions'
      ];
    } else if (correlation < -0.5) {
      return [
        `${tool} quality degrades with extended use`,
        'Break up long sessions to maintain effectiveness',
        'Implement usage time limits or break reminders'
      ];
    }
    return [`${tool} usage time has minimal impact on quality`];
  }

  private analyzeCrossToolCorrelations(toolMetrics: Map<string, ToolMetrics[]>): ProductivityCorrelation[] {
    const correlations: ProductivityCorrelation[] = [];
    const tools = Array.from(toolMetrics.keys());

    for (let i = 0; i < tools.length; i++) {
      for (let j = i + 1; j < tools.length; j++) {
        const tool1 = tools[i];
        const tool2 = tools[j];
        const metrics1 = toolMetrics.get(tool1) || [];
        const metrics2 = toolMetrics.get(tool2) || [];

        if (metrics1.length < this.minSampleSize || metrics2.length < this.minSampleSize) continue;

        // Find correlation in productivity when both tools are used
        const combined = this.findCombinedUsageCorrelation(metrics1, metrics2);
        if (combined && Math.abs(combined.correlation) > this.significanceThreshold) {
          correlations.push({
            tool: `${tool1}+${tool2}`,
            metric: 'combined-productivity',
            correlation: combined.correlation,
            confidence: combined.confidence,
            significance: this.getSignificanceLevel(combined.correlation),
            insights: this.generateCombinedToolInsights(tool1, tool2, combined.correlation)
          });
        }
      }
    }

    return correlations;
  }

  private findCombinedUsageCorrelation(
    metrics1: ToolMetrics[],
    metrics2: ToolMetrics[]
  ): { correlation: number; confidence: number } | null {
    // Simplified implementation - would use more sophisticated temporal analysis in production
    const productivity1 = metrics1.reduce((sum, m) => sum + m.productivity.linesGenerated, 0);
    const productivity2 = metrics2.reduce((sum, m) => sum + m.productivity.linesGenerated, 0);
    const cost1 = metrics1.reduce((sum, m) => sum + m.cost.estimatedCost, 0);
    const cost2 = metrics2.reduce((sum, m) => sum + m.cost.estimatedCost, 0);

    if (cost1 === 0 || cost2 === 0) return null;

    const efficiency1 = productivity1 / cost1;
    const efficiency2 = productivity2 / cost2;

    // Simple correlation between tool efficiencies
    return this.calculateCorrelation([efficiency1], [efficiency2]);
  }

  private generateCombinedToolInsights(tool1: string, tool2: string, correlation: number): string[] {
    if (correlation > 0.5) {
      return [
        `${tool1} and ${tool2} work well together`,
        'Consider using both tools in combination for better results',
        'Team workflows benefit from multi-tool approach'
      ];
    } else if (correlation < -0.5) {
      return [
        `${tool1} and ${tool2} may be redundant or conflicting`,
        'Consider standardizing on one tool',
        'Evaluate if both tools are necessary for your workflow'
      ];
    }
    return [`${tool1} and ${tool2} usage is independent`];
  }

  private estimateVelocity(totalLines: number): number {
    // Rough estimate: 1000 lines = 1 feature per week
    return totalLines / 1000;
  }

  private estimateCodeQuality(toolMetrics: Map<string, ToolMetrics[]>): number {
    // Estimate based on acceptance rates and review suggestions
    const allMetrics = Array.from(toolMetrics.values()).flat();
    if (allMetrics.length === 0) return 0.8; // Default

    const avgAcceptanceRate = allMetrics
      .filter(m => m.usage.acceptanceRate !== undefined)
      .reduce((sum, m) => sum + (m.usage.acceptanceRate || 0), 0) / allMetrics.length;

    return Math.min(0.95, Math.max(0.5, avgAcceptanceRate || 0.8));
  }

  private calculateTrend(values: number[], dates: Date[]): ProductivityTrend | null {
    if (values.length < 3) return null;

    // Simple linear regression for trend
    const n = values.length;
    const xValues = dates.map((_, i) => i); // Use index as x values
    
    const { correlation: slope } = this.calculateCorrelation(xValues, values);
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < 0.1) {
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    const changeRate = (slope / (values.reduce((a, b) => a + b, 0) / n)) * 100; // Percentage change
    const projectedValue = values[values.length - 1] + slope * 4; // 4 weeks projection
    
    return {
      metric: 'productivity', // Would be dynamic based on input
      trend,
      changeRate,
      projectedValue: Math.max(0, projectedValue),
      confidence: Math.min(0.9, n / 10)
    };
  }

  private getImprovementActions(metric: string): string[] {
    const actions: Record<string, string[]> = {
      velocity: [
        'Implement AI-assisted code generation workflows',
        'Reduce code review bottlenecks',
        'Optimize development environment setup',
        'Provide advanced tool training'
      ],
      codeQuality: [
        'Increase AI suggestion acceptance rate',
        'Implement automated code review processes',
        'Set up quality gates in CI/CD',
        'Conduct regular code quality workshops'
      ],
      efficiency: [
        'Optimize AI tool usage costs',
        'Implement intelligent model routing',
        'Reduce redundant tool usage',
        'Focus on high-value development tasks'
      ],
      satisfaction: [
        'Gather developer feedback on tool pain points',
        'Provide better training and documentation',
        'Implement user experience improvements',
        'Regular tool effectiveness reviews'
      ],
      aiAdoption: [
        'Increase AI tool awareness and training',
        'Implement team adoption incentives',
        'Address technical barriers to adoption',
        'Share success stories and best practices'
      ]
    };

    return actions[metric] || ['Conduct detailed analysis to identify improvement opportunities'];
  }
}

// Export singleton instance
export const correlationEngine = new CorrelationEngine();