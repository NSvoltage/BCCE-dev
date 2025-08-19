/**
 * Demo command for BCCE
 * Generates professional demos showcasing enterprise governance features
 */

import { Command } from 'commander';
import { BCCEDemoGenerator, DEMO_PRESETS } from '../../demos/demo-generator.js';
import { SnifflyAnalytics } from '../../analytics/sniffly-integration.js';

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

export const demoCmd = new Command('demo')
  .description('Generate professional demos showcasing BCCE enterprise features')
  .addCommand(
    new Command('generate')
      .description('Generate a demo video for specific audience')
      .option('--preset <type>', 'Demo preset (executive-overview|technical-deep-dive|cost-intelligence)', 'executive-overview')
      .option('--duration <seconds>', 'Demo duration in seconds', '120')
      .option('--format <format>', 'Output format (mp4|webm)', 'mp4')
      .option('--resolution <res>', 'Video resolution (1080p|4k)', '1080p')
      .option('--style <style>', 'Demo style (executive|technical|interactive)', 'executive')
      .option('--theme <theme>', 'Visual theme (dark|light|enterprise)', 'enterprise')
      .option('--company <name>', 'Company name for branding')
      .option('--output <path>', 'Output directory')
      .action(async (options) => {
        console.log(`\n${colors.bright}🎬 Generating BCCE Demo${colors.reset}`);
        console.log(`${colors.gray}Preset: ${options.preset}, Duration: ${options.duration}s${colors.reset}\n`);

        try {
          // Validate preset
          const validPresets = Object.values(DEMO_PRESETS);
          if (!validPresets.includes(options.preset)) {
            throw new Error(`Invalid preset. Choose from: ${validPresets.join(', ')}`);
          }

          // Create demo generator with custom configuration
          const generator = BCCEDemoGenerator.createPresetDemo(options.preset, {
            duration: parseInt(options.duration),
            format: options.format as 'mp4' | 'webm',
            resolution: options.resolution as '1080p' | '4k',
            style: options.style as 'executive' | 'technical' | 'interactive',
            branding: {
              primaryColor: getThemeColors(options.theme).primary,
              secondaryColor: getThemeColors(options.theme).secondary,
              theme: options.theme as 'dark' | 'light' | 'enterprise',
              companyName: options.company
            }
          });

          // Generate the demo
          const outputPath = await generator.generateDemo();
          
          console.log(`${colors.green}✅ Demo generated successfully!${colors.reset}`);
          console.log(`   Output: ${colors.cyan}${outputPath}${colors.reset}`);
          console.log(`   Duration: ${options.duration}s`);
          console.log(`   Format: ${options.format} (${options.resolution})`);
          
        } catch (error) {
          console.error(`${colors.red}❌ Demo generation failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List available demo presets and templates')
      .action(() => {
        console.log(`\n${colors.bright}📋 Available Demo Presets${colors.reset}\n`);

        const presets = [
          {
            name: 'executive-overview',
            description: 'High-level overview for C-suite executives',
            duration: '2 minutes',
            audience: 'Executives, Decision Makers',
            features: ['Enterprise value proposition', 'ROI metrics', 'Compliance benefits']
          },
          {
            name: 'technical-deep-dive',
            description: 'Detailed technical demonstration',
            duration: '5 minutes',
            audience: 'Engineers, Architects, IT Teams',
            features: ['Policy enforcement', 'CLI commands', 'Integration details']
          },
          {
            name: 'cost-intelligence-showcase',
            description: 'Focus on cost optimization features',
            duration: '3 minutes',
            audience: 'Finance Teams, Engineering Managers',
            features: ['Cost analysis', 'Budget management', 'Optimization recommendations']
          }
        ];

        presets.forEach(preset => {
          console.log(`${colors.cyan}${preset.name}${colors.reset}`);
          console.log(`  ${preset.description}`);
          console.log(`  ${colors.gray}Duration: ${preset.duration}${colors.reset}`);
          console.log(`  ${colors.gray}Audience: ${preset.audience}${colors.reset}`);
          console.log(`  ${colors.gray}Features: ${preset.features.join(', ')}${colors.reset}\n`);
        });

        console.log(`${colors.bright}Usage Examples:${colors.reset}`);
        console.log(`  ${colors.gray}# Generate executive overview${colors.reset}`);
        console.log(`  bcce demo generate --preset=executive-overview --company="Acme Corp"`);
        console.log(`  ${colors.gray}# Generate technical deep dive${colors.reset}`);
        console.log(`  bcce demo generate --preset=technical-deep-dive --resolution=4k`);
        console.log(`  ${colors.gray}# Generate cost intelligence demo${colors.reset}`);
        console.log(`  bcce demo generate --preset=cost-intelligence-showcase --duration=180`);
      })
  )
  .addCommand(
    new Command('analytics')
      .description('Launch Sniffly analytics dashboard or generate enterprise reports')
      .option('--dashboard', 'Launch Sniffly web dashboard (default: http://localhost:8081)')
      .option('--port <port>', 'Custom port for dashboard', '8081')
      .option('--timeframe <period>', 'Analytics timeframe for reports (7d|30d|90d)', '30d')
      .option('--format <format>', 'Export format (json|csv|dashboard)', 'dashboard')
      .option('--include-insights', 'Include governance insights and recommendations')
      .action(async (options) => {
        if (options.dashboard || options.format === 'dashboard') {
          console.log(`\n${colors.bright}🚀 Launching Sniffly Analytics Dashboard${colors.reset}`);
          console.log(`${colors.gray}Dashboard will open at: http://localhost:${options.port}${colors.reset}\n`);

          try {
            // Install and initialize Sniffly if needed
            console.log(`${colors.cyan}📦 Checking Sniffly installation...${colors.reset}`);
            
            // Try to run sniffly init
            await new Promise((resolve, reject) => {
              const { spawn } = require('child_process');
              const sniffly = spawn('sniffly', ['init'], { stdio: 'inherit' });
              
              sniffly.on('close', (code) => {
                if (code === 0) {
                  resolve(code);
                } else {
                  reject(new Error(`Sniffly init failed with code ${code}`));
                }
              });
              
              sniffly.on('error', (err) => {
                reject(err);
              });
            });

            console.log(`${colors.green}✅ Sniffly dashboard starting...${colors.reset}`);
            console.log(`${colors.cyan}🌐 Opening browser at http://localhost:${options.port}${colors.reset}`);
            console.log(`${colors.gray}Press Ctrl+C to stop the dashboard${colors.reset}\n`);
            
            // Dashboard features available:
            console.log(`${colors.bright}📊 Dashboard Features Available:${colors.reset}`);
            console.log(`  • Usage patterns and statistics`);
            console.log(`  • Error analysis and categorization`);
            console.log(`  • Message history walkthrough`);
            console.log(`  • Date range filtering`);
            console.log(`  • Export and sharing options`);
            
          } catch (error) {
            console.error(`${colors.red}❌ Dashboard launch failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
            console.log(`${colors.yellow}💡 Install Sniffly first: uv tool install sniffly@latest${colors.reset}`);
          }
        } else {
          console.log(`\n${colors.bright}📊 Generating Enterprise Analytics Report${colors.reset}`);
          console.log(`${colors.gray}Timeframe: ${options.timeframe}${colors.reset}\n`);

          try {
            // Initialize Sniffly analytics
            const analytics = new SnifflyAnalytics({
              logDirectory: '~/.claude',
              outputDirectory: './analytics-output',
              analyticsLevel: 'comprehensive'
            });

            console.log(`${colors.cyan}🔍 Collecting analytics data...${colors.reset}`);
            const metrics = await analytics.generateEnterpriseReport(options.timeframe);
            
            if (options.includeInsights) {
              console.log(`${colors.cyan}💡 Generating governance insights...${colors.reset}`);
              const insights = await analytics.generateGovernanceInsights();
              displayGovernanceInsights(insights);
            }

            if (options.format === 'json' || options.format === 'csv') {
              const exportPath = await analytics.exportAnalytics(options.format);
              console.log(`${colors.green}✅ Analytics exported: ${exportPath}${colors.reset}`);
            }

            displayAnalyticsSummary(metrics);
            console.log(`\n${colors.cyan}💡 For visual dashboard, run: bcce demo analytics --dashboard${colors.reset}`);
            
          } catch (error) {
            console.error(`${colors.red}❌ Analytics report failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
          }
        }
      })
  )
  .addCommand(
    new Command('preview')
      .description('Preview demo scenes without full rendering')
      .argument('<preset>', 'Demo preset to preview')
      .action(async (preset) => {
        console.log(`\n${colors.bright}👁️ Previewing Demo: ${preset}${colors.reset}\n`);

        try {
          const generator = BCCEDemoGenerator.createPresetDemo(preset);
          
          // Mock preview functionality
          console.log(`${colors.cyan}Scene 1: Introduction${colors.reset}`);
          console.log(`  Duration: 15s`);
          console.log(`  Content: BCCE Enterprise Governance overview`);
          console.log(`  Animation: Fade in with highlight emphasis\n`);

          console.log(`${colors.cyan}Scene 2: Problem Statement${colors.reset}`);
          console.log(`  Duration: 20s`);
          console.log(`  Content: Enterprise AI workflow challenges`);
          console.log(`  Animation: Slide transition with Manim transforms\n`);

          console.log(`${colors.cyan}Scene 3: Solution Architecture${colors.reset}`);
          console.log(`  Duration: 25s`);
          console.log(`  Content: BCCE governance layer explanation`);
          console.log(`  Animation: Manim write with glow effects\n`);

          console.log(`${colors.gray}Run 'bcce demo generate --preset=${preset}' to create full video${colors.reset}`);
          
        } catch (error) {
          console.error(`${colors.red}❌ Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
        }
      })
  );

function getThemeColors(theme: string): { primary: string; secondary: string } {
  const themes = {
    dark: { primary: '#1a202c', secondary: '#4299e1' },
    light: { primary: '#2d3748', secondary: '#3182ce' },
    enterprise: { primary: '#1a365d', secondary: '#2b77e6' }
  };
  
  return themes[theme as keyof typeof themes] || themes.enterprise;
}

function displayGovernanceInsights(insights: any): void {
  console.log(`${colors.bright}🏛️ Governance Insights${colors.reset}`);
  
  if (insights.policyRecommendations.length > 0) {
    console.log(`\n${colors.cyan}Policy Recommendations:${colors.reset}`);
    insights.policyRecommendations.forEach((rec: string, i: number) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  if (insights.riskAreas.length > 0) {
    console.log(`\n${colors.yellow}Risk Areas:${colors.reset}`);
    insights.riskAreas.forEach((risk: string, i: number) => {
      console.log(`  ${i + 1}. ${risk}`);
    });
  }

  if (insights.optimizationOpportunities.length > 0) {
    console.log(`\n${colors.green}Optimization Opportunities:${colors.reset}`);
    insights.optimizationOpportunities.forEach((opp: string, i: number) => {
      console.log(`  ${i + 1}. ${opp}`);
    });
  }

  console.log(`\n${colors.bright}Compliance Status:${colors.reset}`);
  console.log(`  Score: ${insights.complianceStatus.score > 90 ? colors.green : colors.yellow}${insights.complianceStatus.score}%${colors.reset}`);
  
  if (insights.complianceStatus.issues.length > 0) {
    console.log(`  Issues: ${insights.complianceStatus.issues.join(', ')}`);
  }
}

function displayAnalyticsSummary(metrics: any): void {
  console.log(`\n${colors.bright}📊 Analytics Summary${colors.reset}`);
  console.log(`  Total Interactions: ${colors.cyan}${metrics.totalInteractions.toLocaleString()}${colors.reset}`);
  console.log(`  Error Rate: ${metrics.errorRate > 20 ? colors.red : colors.green}${metrics.errorRate.toFixed(1)}%${colors.reset}`);
  console.log(`  Total Cost: ${colors.cyan}$${metrics.costBreakdown.totalCost.toFixed(2)}${colors.reset}`);
  console.log(`  Performance: ${colors.cyan}${metrics.performanceMetrics.averageResponseTime.toFixed(1)}s avg response${colors.reset}`);
}