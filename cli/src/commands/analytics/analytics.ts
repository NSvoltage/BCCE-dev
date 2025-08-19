/**
 * Analytics command for BCCE
 * Provides multi-tool analytics, productivity metrics, and team insights
 */

import { Command } from 'commander';
import { multiToolIntelligence } from '../../lib/intelligence/multi-tool.js';
import { correlationEngine } from '../../lib/intelligence/correlation.js';
import fs from 'node:fs';
import path from 'node:path';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

export const analyticsCmd = new Command('analytics')
  .description('Multi-tool analytics and productivity insights')
  .addCommand(
    new Command('dashboard')
      .description('Show interactive analytics dashboard')
      .option('-p, --period <days>', 'Analysis period in days', '7')
      .option('-f, --format <format>', 'Output format (table|json)', 'table')
      .action(async (options) => {
        const days = parseInt(options.period);
        const period = {
          start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          end: new Date()
        };

        console.log(`\n${colors.bright}🚀 BCCE Analytics Dashboard${colors.reset}`);
        console.log(`${colors.gray}Period: ${period.start.toLocaleDateString()} to ${period.end.toLocaleDateString()}${colors.reset}\n`);

        try {
          // Get unified metrics
          const metrics = await multiToolIntelligence.collectMetrics(period);
          
          if (options.format === 'json') {
            console.log(JSON.stringify(metrics, null, 2));
            return;
          }

          // Display dashboard
          await displayAnalyticsDashboard(metrics);
          
        } catch (error) {
          console.error(`${colors.red}❌ Analytics collection failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('tools')
      .description('Compare AI tool usage and effectiveness')
      .option('-p, --period <days>', 'Analysis period in days', '7')
      .option('--sort <field>', 'Sort by field (cost|productivity|efficiency)', 'productivity')
      .action(async (options) => {
        console.log(`\n${colors.bright}🔧 AI Tools Comparison${colors.reset}\n`);

        try {
          const period = {
            start: new Date(Date.now() - parseInt(options.period) * 24 * 60 * 60 * 1000),
            end: new Date()
          };

          const metrics = await multiToolIntelligence.collectMetrics(period);
          displayToolComparison(metrics, options.sort);
          
        } catch (error) {
          console.error(`${colors.red}❌ Tool comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('productivity')
      .description('Analyze team productivity metrics and trends')
      .option('-p, --period <days>', 'Analysis period in days', '30')
      .option('--team <name>', 'Team name', process.env.BCCE_TEAM)
      .action(async (options) => {
        console.log(`\n${colors.bright}📊 Productivity Analysis${colors.reset}`);
        if (options.team) {
          console.log(`${colors.gray}Team: ${options.team}${colors.reset}`);
        }
        console.log('');

        try {
          const period = {
            start: new Date(Date.now() - parseInt(options.period) * 24 * 60 * 60 * 1000),
            end: new Date()
          };

          const unifiedMetrics = await multiToolIntelligence.collectMetrics(period);
          const teamMetrics = correlationEngine.calculateTeamMetrics(unifiedMetrics.tools, { team: options.team });
          const benchmarks = correlationEngine.generateBenchmarks(teamMetrics);
          
          displayProductivityAnalysis(teamMetrics, benchmarks);
          
        } catch (error) {
          console.error(`${colors.red}❌ Productivity analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('insights')
      .description('Get AI-powered insights and recommendations')
      .option('-p, --period <days>', 'Analysis period in days', '30')
      .option('--priority <level>', 'Show recommendations above priority (low|medium|high)', 'medium')
      .action(async (options) => {
        console.log(`\n${colors.bright}💡 AI-Powered Insights${colors.reset}\n`);

        try {
          const period = {
            start: new Date(Date.now() - parseInt(options.period) * 24 * 60 * 60 * 1000),
            end: new Date()
          };

          const unifiedMetrics = await multiToolIntelligence.collectMetrics(period);
          const teamMetrics = correlationEngine.calculateTeamMetrics(unifiedMetrics.tools);
          const benchmarks = correlationEngine.generateBenchmarks(teamMetrics);
          const recommendations = correlationEngine.generateOptimizationRecommendations(
            teamMetrics.correlations,
            benchmarks
          );

          displayInsightsAndRecommendations(unifiedMetrics, teamMetrics, recommendations, options.priority);
          
        } catch (error) {
          console.error(`${colors.red}❌ Insights generation failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('optimize')
      .description('Get tool selection recommendations for specific tasks')
      .option('--task-type <type>', 'Task type (bug-fix|feature|refactor|documentation|testing)', 'feature')
      .option('--complexity <level>', 'Task complexity (simple|moderate|complex)', 'moderate')
      .option('--language <lang>', 'Programming language', 'typescript')
      .option('--estimated-lines <number>', 'Estimated lines of code', '100')
      .action(async (options) => {
        console.log(`\n${colors.bright}🎯 Tool Optimization Recommendation${colors.reset}\n`);

        try {
          const task = {
            type: options.taskType as any,
            complexity: options.complexity as any,
            language: options.language,
            estimatedLines: parseInt(options.estimatedLines),
            timeEstimate: parseInt(options.estimatedLines) * 2, // Rough estimate
            context: `${options.taskType} task in ${options.language}`
          };

          const recommendation = await multiToolIntelligence.optimizeToolSelection(task);
          displayTaskOptimization(task, recommendation);
          
        } catch (error) {
          console.error(`${colors.red}❌ Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('export')
      .description('Export analytics data for external analysis')
      .option('-f, --format <format>', 'Export format (json|csv)', 'json')
      .option('-p, --period <days>', 'Analysis period in days', '30')
      .option('-o, --output <file>', 'Output file path')
      .action(async (options) => {
        console.log(`\n${colors.bright}📤 Exporting Analytics Data${colors.reset}\n`);

        try {
          const period = {
            start: new Date(Date.now() - parseInt(options.period) * 24 * 60 * 60 * 1000),
            end: new Date()
          };

          const exportData = await multiToolIntelligence.exportMetrics(options.format, period);
          
          if (options.output) {
            fs.writeFileSync(options.output, exportData);
            console.log(`${colors.green}✅ Data exported to ${options.output}${colors.reset}`);
            console.log(`${colors.gray}Format: ${options.format}${colors.reset}`);
            console.log(`${colors.gray}Period: ${options.period} days${colors.reset}`);
          } else {
            console.log(exportData);
          }
          
        } catch (error) {
          console.error(`${colors.red}❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('monitor')
      .description('Start real-time analytics monitoring')
      .option('--interval <seconds>', 'Update interval in seconds', '30')
      .action(async (options) => {
        console.log(`\n${colors.bright}👁️  Real-time Analytics Monitor${colors.reset}`);
        console.log(`${colors.gray}Updating every ${options.interval} seconds...${colors.reset}\n`);

        try {
          // Set up real-time monitoring
          multiToolIntelligence.on('realtime-metrics', (toolName, metrics) => {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] ${colors.cyan}${toolName}${colors.reset}: ${metrics.usage.tokensProcessed} tokens, $${metrics.cost.estimatedCost.toFixed(4)} cost`);
          });

          await multiToolIntelligence.startRealtimeMonitoring();
          
          console.log(`${colors.gray}Press Ctrl+C to stop monitoring${colors.reset}\n`);
          
          // Keep process running
          process.stdin.resume();
          
          // Handle cleanup on exit
          process.on('SIGINT', () => {
            console.log(`\n${colors.yellow}Stopping real-time monitoring...${colors.reset}`);
            multiToolIntelligence.stopRealtimeMonitoring();
            process.exit(0);
          });
          
        } catch (error) {
          console.error(`${colors.red}❌ Real-time monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  );

async function displayAnalyticsDashboard(metrics: any) {
  console.log(`${colors.bright}📈 Summary Metrics${colors.reset}`);
  console.log(`  Total Cost: ${colors.cyan}$${metrics.aggregated.totalCost.toFixed(2)}${colors.reset}`);
  console.log(`  Total Tokens: ${colors.cyan}${metrics.aggregated.totalTokens.toLocaleString()}${colors.reset}`);
  console.log(`  Active Time: ${colors.cyan}${Math.round(metrics.aggregated.totalActiveTime / 3600000)}h${colors.reset}`);
  console.log(`  Productivity Score: ${colors.cyan}${metrics.aggregated.productivityScore.toFixed(1)}${colors.reset}`);
  console.log(`  Efficiency Rating: ${colors.cyan}${metrics.aggregated.efficiencyRating.toFixed(1)}%${colors.reset}`);

  console.log(`\n${colors.bright}🔧 Available Tools${colors.reset}`);
  const availableTools = await multiToolIntelligence.getAvailableTools();
  availableTools.forEach(tool => {
    const toolData = metrics.tools.get(tool) || [];
    const status = toolData.length > 0 ? `${colors.green}Active${colors.reset}` : `${colors.gray}Available${colors.reset}`;
    console.log(`  ${tool}: ${status} (${toolData.length} sessions)`);
  });

  console.log(`\n${colors.bright}💡 Key Insights${colors.reset}`);
  console.log(`  Most Efficient: ${colors.green}${metrics.insights.mostEfficient}${colors.reset}`);
  console.log(`  Most Productive: ${colors.green}${metrics.insights.mostProductive}${colors.reset}`);
  
  if (metrics.insights.recommendations.length > 0) {
    console.log(`  Recommendations: ${colors.yellow}${metrics.insights.recommendations.length} available${colors.reset}`);
    console.log(`  ${colors.gray}Run 'bcce analytics insights' for detailed recommendations${colors.reset}`);
  }
}

function displayToolComparison(metrics: any, sortBy: string) {
  const tools = Array.from(metrics.tools.entries())
    .filter(([_, toolMetrics]) => toolMetrics.length > 0)
    .map(([toolName, toolMetrics]) => {
      const totalCost = toolMetrics.reduce((sum: number, m: any) => sum + m.cost.estimatedCost, 0);
      const totalTokens = toolMetrics.reduce((sum: number, m: any) => sum + m.usage.tokensProcessed, 0);
      const totalLines = toolMetrics.reduce((sum: number, m: any) => sum + m.productivity.linesGenerated, 0);
      const avgAcceptance = toolMetrics.reduce((sum: number, m: any) => sum + (m.usage.acceptanceRate || 0), 0) / toolMetrics.length;
      const efficiency = totalCost > 0 ? totalLines / totalCost : 0;

      return {
        name: toolName,
        sessions: toolMetrics.length,
        cost: totalCost,
        tokens: totalTokens,
        lines: totalLines,
        acceptance: avgAcceptance,
        efficiency
      };
    });

  // Sort tools
  tools.sort((a, b) => {
    switch (sortBy) {
      case 'cost': return b.cost - a.cost;
      case 'efficiency': return b.efficiency - a.efficiency;
      default: return b.lines - a.lines; // productivity
    }
  });

  console.log(`${colors.bright}Tool${colors.reset}`.padEnd(20) + 
             `${colors.bright}Sessions${colors.reset}`.padEnd(10) + 
             `${colors.bright}Cost${colors.reset}`.padEnd(10) + 
             `${colors.bright}Lines${colors.reset}`.padEnd(10) + 
             `${colors.bright}Acceptance${colors.reset}`.padEnd(12) + 
             `${colors.bright}Efficiency${colors.reset}`);
  console.log('─'.repeat(70));

  tools.forEach(tool => {
    console.log(
      `${tool.name.padEnd(20)}` +
      `${tool.sessions.toString().padEnd(10)}` +
      `${colors.cyan}$${tool.cost.toFixed(2)}${colors.reset}`.padEnd(18) +
      `${tool.lines.toString().padEnd(10)}` +
      `${(tool.acceptance * 100).toFixed(0)}%`.padEnd(12) +
      `${tool.efficiency.toFixed(0)} lines/$`
    );
  });

  if (tools.length === 0) {
    console.log(`${colors.gray}No tool usage data available for the specified period${colors.reset}`);
  }
}

function displayProductivityAnalysis(teamMetrics: any, benchmarks: any[]) {
  console.log(`${colors.bright}Team Performance${colors.reset}`);
  console.log(`  Velocity: ${colors.cyan}${teamMetrics.metrics.velocity.toFixed(1)} features/week${colors.reset}`);
  console.log(`  Code Quality: ${colors.cyan}${(teamMetrics.metrics.codeQuality * 100).toFixed(0)}%${colors.reset}`);
  console.log(`  Efficiency: ${colors.cyan}${teamMetrics.metrics.efficiency.toFixed(0)} lines/$${colors.reset}`);
  console.log(`  Satisfaction: ${colors.cyan}${(teamMetrics.metrics.satisfaction * 100).toFixed(0)}%${colors.reset}`);
  console.log(`  AI Adoption: ${colors.cyan}${(teamMetrics.metrics.aiAdoption * 100).toFixed(0)}%${colors.reset}`);

  console.log(`\n${colors.bright}Benchmark Comparison${colors.reset}`);
  benchmarks.forEach(benchmark => {
    const icon = getBenchmarkIcon(benchmark.ranking);
    const improvement = benchmark.improvementPotential > 0 ? 
      ` (${colors.yellow}+${benchmark.improvementPotential.toFixed(0)}% potential${colors.reset})` : '';
    
    console.log(`  ${icon} ${benchmark.metric}: ${colors.cyan}${benchmark.currentValue.toFixed(2)}${colors.reset} vs industry avg ${benchmark.industryAverage.toFixed(2)}${improvement}`);
  });

  if (teamMetrics.correlations.length > 0) {
    console.log(`\n${colors.bright}Key Correlations${colors.reset}`);
    teamMetrics.correlations
      .filter((c: any) => c.significance === 'high')
      .slice(0, 3)
      .forEach((correlation: any) => {
        const direction = correlation.correlation > 0 ? 'positive' : 'negative';
        console.log(`  ${correlation.tool} - ${correlation.metric}: ${colors.magenta}${direction} correlation${colors.reset} (${correlation.correlation.toFixed(2)})`);
      });
  }
}

function displayInsightsAndRecommendations(unifiedMetrics: any, teamMetrics: any, recommendations: any[], priorityFilter: string) {
  // Filter recommendations by priority
  const priorityOrder = { low: 1, medium: 2, high: 3 };
  const minPriority = priorityOrder[priorityFilter as keyof typeof priorityOrder] || 2;
  const filteredRecommendations = recommendations.filter(r => 
    priorityOrder[r.impact as keyof typeof priorityOrder] >= minPriority
  );

  console.log(`${colors.bright}🎯 Strategic Insights${colors.reset}`);
  if (unifiedMetrics.aggregated.totalCost > 0) {
    const costPerLine = unifiedMetrics.aggregated.totalCost / (teamMetrics.metrics.velocity * 1000 || 1);
    console.log(`  Cost per line generated: ${colors.cyan}$${costPerLine.toFixed(4)}${colors.reset}`);
  }

  const topTool = unifiedMetrics.insights.mostProductive;
  if (topTool && topTool !== 'none') {
    console.log(`  ${colors.green}${topTool}${colors.reset} is your most productive tool`);
  }

  if (teamMetrics.metrics.aiAdoption < 0.8) {
    console.log(`  AI adoption opportunity: ${colors.yellow}${((1 - teamMetrics.metrics.aiAdoption) * 100).toFixed(0)}% team not using AI tools${colors.reset}`);
  }

  if (filteredRecommendations.length > 0) {
    console.log(`\n${colors.bright}📋 Recommendations (${priorityFilter}+ priority)${colors.reset}`);
    filteredRecommendations.forEach((rec, index) => {
      const priorityIcon = getPriorityIcon(rec.impact);
      console.log(`\n${priorityIcon} ${colors.bright}${rec.title}${colors.reset}`);
      console.log(`   ${rec.description}`);
      console.log(`   ${colors.gray}Timeline: ${rec.timeline} | Effort: ${rec.effort}${colors.reset}`);
      
      if (rec.implementation && rec.implementation.length > 0) {
        console.log(`   ${colors.gray}Implementation:${colors.reset}`);
        rec.implementation.slice(0, 2).forEach((step: string) => {
          console.log(`   ${colors.gray}• ${step}${colors.reset}`);
        });
        if (rec.implementation.length > 2) {
          console.log(`   ${colors.gray}• ... and ${rec.implementation.length - 2} more steps${colors.reset}`);
        }
      }
    });
  } else {
    console.log(`\n${colors.green}✅ No ${priorityFilter}+ priority recommendations - your setup is well optimized!${colors.reset}`);
  }
}

function displayTaskOptimization(task: any, recommendation: any) {
  console.log(`${colors.bright}Task Details${colors.reset}`);
  console.log(`  Type: ${colors.cyan}${task.type}${colors.reset}`);
  console.log(`  Complexity: ${colors.cyan}${task.complexity}${colors.reset}`);
  console.log(`  Language: ${colors.cyan}${task.language}${colors.reset}`);
  console.log(`  Estimated Lines: ${colors.cyan}${task.estimatedLines}${colors.reset}`);

  console.log(`\n${colors.bright}🎯 Recommendation${colors.reset}`);
  console.log(`  ${recommendation.title}`);
  console.log(`  ${colors.gray}${recommendation.description}${colors.reset}`);
  console.log(`  ${colors.green}Implementation: ${recommendation.implementation}${colors.reset}`);
}

function getBenchmarkIcon(ranking: string): string {
  const icons: Record<string, string> = {
    'top-tier': '🏆',
    'above-average': '✅',
    'average': '➖',
    'below-average': '⚠️'
  };
  return icons[ranking] || '❓';
}

function getPriorityIcon(priority: string): string {
  const icons: Record<string, string> = {
    'high': '🔴',
    'medium': '🟡',
    'low': '🟢'
  };
  return icons[priority] || '🔵';
}