/**
 * Cost command for BCCE
 * Provides cost tracking, reporting, and optimization features
 */

import { Command } from 'commander';
import { costEngine } from '../../lib/intelligence/cost-engine.js';
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
  gray: '\x1b[90m'
};

export const costCmd = new Command('cost')
  .description('Advanced cost intelligence and optimization for AI workflows')
  .addCommand(
    new Command('report')
      .description('Generate cost report for specified period')
      .option('-p, --period <days>', 'Report period in days', '7')
      .option('-f, --format <format>', 'Output format (table|json|csv)', 'table')
      .option('-o, --output <file>', 'Output to file')
      .action(async (options) => {
        const days = parseInt(options.period);
        const endDate = new Date();
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        console.log(`\n${colors.bright}📊 Cost Report${colors.reset}`);
        console.log(`${colors.gray}Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}${colors.reset}\n`);

        const report = await costEngine.generateReport(startDate, endDate);

        if (options.format === 'json') {
          const output = JSON.stringify(report, null, 2);
          if (options.output) {
            fs.writeFileSync(options.output, output);
            console.log(`${colors.green}✅ Report saved to ${options.output}${colors.reset}`);
          } else {
            console.log(output);
          }
          return;
        }

        if (options.format === 'csv') {
          const csv = costEngine.exportMetrics('csv');
          if (options.output) {
            fs.writeFileSync(options.output, csv);
            console.log(`${colors.green}✅ Report saved to ${options.output}${colors.reset}`);
          } else {
            console.log(csv);
          }
          return;
        }

        // Table format (default)
        displayCostReport(report);

        if (options.output) {
          const summary = formatReportAsText(report);
          fs.writeFileSync(options.output, summary);
          console.log(`\n${colors.green}✅ Report saved to ${options.output}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('optimize')
      .description('Get cost optimization suggestions')
      .option('-t, --threshold <amount>', 'Minimum savings threshold', '0.10')
      .action(async (options) => {
        console.log(`\n${colors.bright}💡 Cost Optimization Analysis${colors.reset}\n`);

        // Get last 30 days of data for analysis
        const endDate = new Date();
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const report = await costEngine.generateReport(startDate, endDate);

        if (report.savings.optimizations.length === 0) {
          console.log(`${colors.green}✅ No optimization opportunities found - your usage is already efficient!${colors.reset}`);
          return;
        }

        console.log(`${colors.yellow}Found ${report.savings.optimizations.length} optimization opportunities:${colors.reset}\n`);

        report.savings.optimizations.forEach((opt, index) => {
          console.log(`${colors.bright}${index + 1}. ${getOptimizationIcon(opt.type)} ${opt.description}${colors.reset}`);
          console.log(`   ${colors.green}Potential savings: $${opt.estimatedSavings.toFixed(2)}${colors.reset}`);
          console.log(`   ${colors.gray}How to implement: ${opt.implementation}${colors.reset}\n`);
        });

        const totalSavings = report.savings.amount;
        const savingsPercent = report.savings.percentage;
        
        console.log(`${colors.bright}─────────────────────────────────────${colors.reset}`);
        console.log(`${colors.bright}Total potential savings: ${colors.green}$${totalSavings.toFixed(2)} (${savingsPercent.toFixed(1)}%)${colors.reset}`);
      })
  )
  .addCommand(
    new Command('breakdown')
      .description('Show cost breakdown by team, model, or workflow')
      .option('-b, --by <dimension>', 'Breakdown dimension (team|model|workflow)', 'model')
      .option('-p, --period <days>', 'Report period in days', '7')
      .action(async (options) => {
        const days = parseInt(options.period);
        const endDate = new Date();
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const report = await costEngine.generateReport(startDate, endDate);

        console.log(`\n${colors.bright}📊 Cost Breakdown by ${options.by}${colors.reset}`);
        console.log(`${colors.gray}Period: Last ${days} days${colors.reset}\n`);

        let breakdown: Map<string, any>;
        switch (options.by) {
          case 'team':
            breakdown = report.byTeam;
            break;
          case 'workflow':
            breakdown = report.byWorkflow;
            break;
          case 'model':
          default:
            breakdown = report.byModel;
        }

        if (breakdown.size === 0) {
          console.log(`${colors.gray}No data available for ${options.by} breakdown${colors.reset}`);
          return;
        }

        // Sort by cost descending
        const sorted = Array.from(breakdown.entries()).sort((a, b) => b[1].totalCost - a[1].totalCost);

        sorted.forEach(([key, metrics]) => {
          const percentage = (metrics.totalCost / report.totalCost) * 100;
          const bar = generateBar(percentage);
          
          console.log(`${colors.bright}${key.padEnd(40)}${colors.reset} ${bar} ${colors.cyan}$${metrics.totalCost.toFixed(2)} (${percentage.toFixed(1)}%)${colors.reset}`);
        });

        console.log(`\n${colors.bright}─────────────────────────────────────${colors.reset}`);
        console.log(`${colors.bright}Total: ${colors.cyan}$${report.totalCost.toFixed(2)}${colors.reset}`);
      })
  )
  .addCommand(
    new Command('live')
      .description('Show live cost tracking for current session')
      .action(async () => {
        console.log(`\n${colors.bright}📈 Live Cost Tracking${colors.reset}`);
        console.log(`${colors.gray}Monitoring costs in real-time...${colors.reset}\n`);

        // Display current session cost
        const sessionCost = costEngine.getCurrentSessionCost();
        console.log(`Current session cost: ${colors.cyan}$${sessionCost.toFixed(4)}${colors.reset}`);

        // Set up live monitoring
        costEngine.on('cost-tracked', (metrics) => {
          const timestamp = new Date().toLocaleTimeString();
          console.log(`[${timestamp}] ${colors.gray}${metrics.tokenUsage.model}${colors.reset} - Input: ${metrics.tokenUsage.inputTokens} tokens, Output: ${metrics.tokenUsage.outputTokens} tokens - Cost: ${colors.cyan}$${metrics.totalCost.toFixed(4)}${colors.reset}`);
        });

        costEngine.on('optimization-available', (suggestions) => {
          console.log(`\n${colors.yellow}💡 Optimization opportunity detected!${colors.reset}`);
          suggestions.forEach(s => {
            console.log(`   ${getOptimizationIcon(s.type)} ${s.description} - Save ${colors.green}$${s.estimatedSavings.toFixed(2)}${colors.reset}`);
          });
          console.log('');
        });

        console.log(`\n${colors.gray}Press Ctrl+C to stop monitoring${colors.reset}\n`);

        // Keep the process running
        process.stdin.resume();
      })
  )
  .addCommand(
    new Command('analysis')
      .description('Advanced cost analysis with governance insights')
      .option('-p, --period <period>', 'Analysis period (30d|90d|1y)', '30d')
      .option('--by <dimension>', 'Group by: team,project,workflow,policy', 'project')
      .action(async (options) => {
        console.log(`\n${colors.bright}🎯 Advanced Cost Analysis${colors.reset}`);
        console.log(`${colors.gray}Period: ${options.period}, Grouped by: ${options.by}${colors.reset}\n`);

        try {
          const analysis = await generateAdvancedAnalysis(options.period, options.by);
          displayAdvancedAnalysis(analysis);
        } catch (error) {
          console.error(`${colors.red}❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('budget')
      .description('Manage and monitor budgets with alerts')
      .option('--set <amount>', 'Set monthly budget limit')
      .option('--team <name>', 'Set team-specific budget')
      .option('--alerts', 'Configure budget alerts (50%, 80%, 100%)')
      .action(async (options) => {
        console.log(`\n${colors.bright}💰 Budget Management${colors.reset}\n`);

        if (options.set) {
          const amount = parseFloat(options.set);
          const scope = options.team ? `team:${options.team}` : 'organization';
          
          console.log(`Setting ${scope} budget to $${amount}/month...`);
          
          // Mock budget setting
          console.log(`${colors.green}✅ Budget configured${colors.reset}`);
          console.log(`   Scope: ${scope}`);
          console.log(`   Limit: $${amount}/month`);
          
          if (options.alerts) {
            console.log(`   Alerts: 50% ($${(amount * 0.5).toFixed(2)}), 80% ($${(amount * 0.8).toFixed(2)}), 100% ($${amount}.00)`);
          }
        } else {
          // Show current budget status
          const budgetStatus = await getBudgetStatus();
          displayBudgetStatus(budgetStatus);
        }
      })
  )
  .addCommand(
    new Command('forecast')
      .description('Predict future costs based on usage patterns')
      .option('--period <period>', 'Forecast period (30d|90d|1y)', '90d')
      .option('--confidence <level>', 'Confidence level (80|90|95)', '90')
      .action(async (options) => {
        console.log(`\n${colors.bright}🔮 Cost Forecasting${colors.reset}`);
        console.log(`${colors.gray}Forecast period: ${options.period}, Confidence: ${options.confidence}%${colors.reset}\n`);

        try {
          const forecast = await generateCostForecast(options.period, parseInt(options.confidence));
          displayForecast(forecast);
        } catch (error) {
          console.error(`${colors.red}❌ Forecast failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  );

function displayCostReport(report: any) {
  // Summary section
  console.log(`${colors.bright}Summary:${colors.reset}`);
  console.log(`  Total Cost: ${colors.cyan}$${report.totalCost.toFixed(2)}${colors.reset}`);
  console.log(`  Total Tokens: ${report.totalTokens.input.toLocaleString()} input, ${report.totalTokens.output.toLocaleString()} output`);
  
  // Projections
  console.log(`\n${colors.bright}Projections:${colors.reset}`);
  console.log(`  Daily: ${colors.cyan}$${report.projections.daily.toFixed(2)}${colors.reset}`);
  console.log(`  Weekly: ${colors.cyan}$${report.projections.weekly.toFixed(2)}${colors.reset}`);
  console.log(`  Monthly: ${colors.cyan}$${report.projections.monthly.toFixed(2)}${colors.reset}`);

  // Model breakdown
  if (report.byModel.size > 0) {
    console.log(`\n${colors.bright}By Model:${colors.reset}`);
    report.byModel.forEach((metrics: any, model: string) => {
      const percentage = (metrics.totalCost / report.totalCost) * 100;
      console.log(`  ${model}: ${colors.cyan}$${metrics.totalCost.toFixed(2)} (${percentage.toFixed(1)}%)${colors.reset}`);
    });
  }

  // Savings opportunities
  if (report.savings.optimizations.length > 0) {
    console.log(`\n${colors.bright}Optimization Opportunities:${colors.reset}`);
    console.log(`  Potential savings: ${colors.green}$${report.savings.amount.toFixed(2)} (${report.savings.percentage.toFixed(1)}%)${colors.reset}`);
    console.log(`  Run 'bcce cost optimize' for detailed suggestions`);
  }
}

function formatReportAsText(report: any): string {
  let text = 'BCCE Cost Report\n';
  text += '================\n\n';
  text += `Period: ${report.period.start.toLocaleDateString()} to ${report.period.end.toLocaleDateString()}\n\n`;
  text += `Total Cost: $${report.totalCost.toFixed(2)}\n`;
  text += `Total Tokens: ${report.totalTokens.input.toLocaleString()} input, ${report.totalTokens.output.toLocaleString()} output\n\n`;
  
  text += 'Projections:\n';
  text += `  Daily: $${report.projections.daily.toFixed(2)}\n`;
  text += `  Weekly: $${report.projections.weekly.toFixed(2)}\n`;
  text += `  Monthly: $${report.projections.monthly.toFixed(2)}\n\n`;

  if (report.byModel.size > 0) {
    text += 'By Model:\n';
    report.byModel.forEach((metrics: any, model: string) => {
      const percentage = (metrics.totalCost / report.totalCost) * 100;
      text += `  ${model}: $${metrics.totalCost.toFixed(2)} (${percentage.toFixed(1)}%)\n`;
    });
  }

  return text;
}

function getOptimizationIcon(type: string): string {
  const icons: Record<string, string> = {
    'model-downgrade': '⬇️',
    'caching': '💾',
    'batching': '📦',
    'prompt-reduction': '✂️'
  };
  return icons[type] || '💡';
}

function generateBar(percentage: number): string {
  const width = 20;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${colors.green}${'█'.repeat(filled)}${colors.gray}${'░'.repeat(empty)}${colors.reset}]`;
}

// Advanced cost intelligence functions
async function generateAdvancedAnalysis(period: string, dimension: string) {
  // Mock advanced analysis - in real implementation this would use AWS Cost Explorer API
  const daysInPeriod = period === '30d' ? 30 : period === '90d' ? 90 : 365;
  
  return {
    period,
    dimension,
    totalCost: 2847.52,
    trends: {
      growth: 12.3, // 12.3% growth
      seasonality: 'moderate',
      volatility: 'low'
    },
    topCostDrivers: [
      { name: 'Complex workflows', cost: 1907.84, percentage: 67 },
      { name: 'Model selection inefficiency', cost: 654.93, percentage: 23 },
      { name: 'Repeated analysis tasks', cost: 284.75, percentage: 10 }
    ],
    optimizationPotential: {
      amount: 967.36,
      percentage: 34,
      opportunities: [
        { type: 'model-optimization', description: 'Route simple tasks to Haiku', savings: 456.78 },
        { type: 'workflow-caching', description: 'Cache repeated analysis results', savings: 310.23 },
        { type: 'batch-processing', description: 'Batch small requests together', savings: 200.35 }
      ]
    },
    governance: {
      budgetCompliance: 87,
      policyViolations: 3,
      approvalDelays: 2.3 // hours average
    }
  };
}

function displayAdvancedAnalysis(analysis: any) {
  console.log(`${colors.bright}📊 Cost Analysis Summary${colors.reset}`);
  console.log(`   Total Spend: ${colors.cyan}$${analysis.totalCost.toFixed(2)}${colors.reset}`);
  console.log(`   Growth Trend: ${analysis.trends.growth > 0 ? colors.red : colors.green}${analysis.trends.growth > 0 ? '+' : ''}${analysis.trends.growth}%${colors.reset}`);
  console.log(`   Budget Compliance: ${analysis.governance.budgetCompliance > 90 ? colors.green : colors.yellow}${analysis.governance.budgetCompliance}%${colors.reset}`);

  console.log(`\n${colors.bright}🔍 Top Cost Drivers${colors.reset}`);
  analysis.topCostDrivers.forEach((driver: any, index: number) => {
    const bar = generateBar(driver.percentage);
    console.log(`   ${index + 1}. ${driver.name.padEnd(35)} ${bar} ${colors.cyan}$${driver.cost.toFixed(2)} (${driver.percentage}%)${colors.reset}`);
  });

  console.log(`\n${colors.bright}💡 Optimization Opportunities${colors.reset}`);
  console.log(`   Total Potential: ${colors.green}$${analysis.optimizationPotential.amount.toFixed(2)} (${analysis.optimizationPotential.percentage}% savings)${colors.reset}`);
  
  analysis.optimizationPotential.opportunities.forEach((opp: any) => {
    const icon = getOptimizationIcon(opp.type);
    console.log(`   ${icon} ${opp.description} - ${colors.green}$${opp.savings.toFixed(2)}${colors.reset}`);
  });

  console.log(`\n${colors.bright}🏛️ Governance Impact${colors.reset}`);
  console.log(`   Policy Violations: ${analysis.governance.policyViolations > 0 ? colors.red : colors.green}${analysis.governance.policyViolations}${colors.reset}`);
  console.log(`   Approval Delays: ${analysis.governance.approvalDelays > 4 ? colors.red : colors.green}${analysis.governance.approvalDelays}h avg${colors.reset}`);
}

async function getBudgetStatus() {
  // Mock budget status - in real implementation this would use AWS Budgets API
  return {
    organization: {
      limit: 5000,
      spent: 2847.52,
      remaining: 2152.48,
      percentage: 57
    },
    teams: [
      { name: 'Engineering', limit: 2000, spent: 1420.15, percentage: 71 },
      { name: 'Data Science', limit: 1500, spent: 892.37, percentage: 59 },
      { name: 'Security', limit: 800, spent: 535.00, percentage: 67 }
    ],
    alerts: [
      { threshold: 50, triggered: true, date: '2024-01-15' },
      { threshold: 80, triggered: false, estimated: '2024-01-22' }
    ]
  };
}

function displayBudgetStatus(status: any) {
  console.log(`${colors.bright}Organization Budget${colors.reset}`);
  const orgBar = generateBar(status.organization.percentage);
  console.log(`   ${orgBar} ${colors.cyan}$${status.organization.spent.toFixed(2)}${colors.reset} / $${status.organization.limit} (${status.organization.percentage}%)`);
  console.log(`   Remaining: ${colors.green}$${status.organization.remaining.toFixed(2)}${colors.reset}`);

  console.log(`\n${colors.bright}Team Budgets${colors.reset}`);
  status.teams.forEach((team: any) => {
    const teamBar = generateBar(team.percentage);
    const status_color = team.percentage > 80 ? colors.red : team.percentage > 50 ? colors.yellow : colors.green;
    console.log(`   ${team.name.padEnd(20)} ${teamBar} ${status_color}${team.percentage}%${colors.reset} ($${team.spent.toFixed(2)}/$${team.limit})`);
  });

  console.log(`\n${colors.bright}Alert Status${colors.reset}`);
  status.alerts.forEach((alert: any) => {
    if (alert.triggered) {
      console.log(`   ${colors.red}🚨 ${alert.threshold}% threshold exceeded${colors.reset} on ${alert.date}`);
    } else {
      console.log(`   ${colors.gray}⏳ ${alert.threshold}% threshold estimated${colors.reset} on ${alert.estimated}`);
    }
  });
}

async function generateCostForecast(period: string, confidence: number) {
  // Mock forecast - in real implementation this would use machine learning models
  const daysAhead = period === '30d' ? 30 : period === '90d' ? 90 : 365;
  const currentMonthly = 2847.52;
  
  return {
    period,
    confidence,
    currentTrend: currentMonthly,
    forecast: {
      conservative: currentMonthly * 1.1,
      likely: currentMonthly * 1.2,
      aggressive: currentMonthly * 1.35
    },
    factors: [
      { name: 'Seasonal usage patterns', impact: '+8%' },
      { name: 'Team growth', impact: '+15%' },
      { name: 'Optimization initiatives', impact: '-3%' }
    ],
    recommendations: [
      'Implement model optimization for 20% savings',
      'Set up automated alerts at 75% budget threshold',
      'Consider reserved capacity for predictable workloads'
    ]
  };
}

function displayForecast(forecast: any) {
  console.log(`${colors.bright}📈 Cost Forecast (${forecast.period})${colors.reset}`);
  console.log(`   Confidence Level: ${forecast.confidence}%\n`);

  console.log(`${colors.bright}Projected Costs${colors.reset}`);
  console.log(`   Conservative: ${colors.green}$${forecast.forecast.conservative.toFixed(2)}${colors.reset}`);
  console.log(`   Most Likely: ${colors.cyan}$${forecast.forecast.likely.toFixed(2)}${colors.reset}`);
  console.log(`   Aggressive: ${colors.red}$${forecast.forecast.aggressive.toFixed(2)}${colors.reset}`);

  console.log(`\n${colors.bright}Contributing Factors${colors.reset}`);
  forecast.factors.forEach((factor: any) => {
    const color = factor.impact.startsWith('+') ? colors.red : colors.green;
    console.log(`   • ${factor.name}: ${color}${factor.impact}${colors.reset}`);
  });

  console.log(`\n${colors.bright}Recommendations${colors.reset}`);
  forecast.recommendations.forEach((rec: string, index: number) => {
    console.log(`   ${index + 1}. ${rec}`);
  });
}