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
  .description('Track and optimize Claude Code/Bedrock costs')
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