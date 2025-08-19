/**
 * Dashboard command for BCCE
 * Launches Sniffly analytics dashboard for enterprise governance visualization
 */

import { Command } from 'commander';
import { spawn } from 'child_process';

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

export const dashboardCmd = new Command('dashboard')
  .description('Launch enterprise analytics dashboard powered by Sniffly')
  .option('--port <port>', 'Dashboard port (default: 8081)', '8081')
  .option('--host <host>', 'Dashboard host (default: localhost)', 'localhost')
  .option('--no-browser', 'Don\'t automatically open browser')
  .action(async (options) => {
    console.log(`\n${colors.bright}🚀 BCCE Enterprise Analytics Dashboard${colors.reset}`);
    console.log(`${colors.gray}Powered by Sniffly Analytics Engine${colors.reset}\n`);

    try {
      // Check if Sniffly is installed
      console.log(`${colors.cyan}📦 Checking Sniffly installation...${colors.reset}`);
      
      await checkSnifflyInstallation();
      
      // Configure Sniffly settings
      if (options.port !== '8081') {
        console.log(`${colors.cyan}⚙️ Configuring port ${options.port}...${colors.reset}`);
        await runSnifflyCommand(['config', 'set', 'port', options.port]);
      }
      
      // Initialize and start dashboard
      console.log(`${colors.cyan}🔧 Initializing Sniffly analytics...${colors.reset}`);
      await runSnifflyCommand(['init']);
      
      console.log(`${colors.green}✅ Dashboard is starting...${colors.reset}`);
      console.log(`${colors.cyan}🌐 Dashboard URL: http://${options.host}:${options.port}${colors.reset}`);
      
      // Wait a moment for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Test if dashboard is accessible
      try {
        const { spawn } = require('child_process');
        const curl = spawn('curl', ['-s', `http://${options.host}:${options.port}`]);
        
        curl.on('close', (code) => {
          if (code === 0) {
            console.log(`${colors.green}✅ Dashboard is accessible at http://${options.host}:${options.port}${colors.reset}`);
            console.log(`${colors.bright}🚀 Open your browser and navigate to the URL above${colors.reset}\n`);
            
            // Display dashboard features
            displayDashboardFeatures();
            
            console.log(`${colors.gray}Press Ctrl+C to stop the dashboard${colors.reset}`);
            
          } else {
            console.log(`${colors.yellow}⚠️ Dashboard may still be starting up...${colors.reset}`);
            console.log(`${colors.cyan}Try opening http://${options.host}:${options.port} in your browser${colors.reset}`);
          }
        });
        
      } catch (error) {
        console.log(`${colors.cyan}🌐 Dashboard should be available at http://${options.host}:${options.port}${colors.reset}`);
      }
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log(`\n${colors.yellow}🛑 Shutting down dashboard...${colors.reset}`);
        process.exit(0);
      });
      
      // Keep alive - this keeps the BCCE command running while Sniffly serves
      await new Promise(() => {}); // Keep process running
      
    } catch (error) {
      console.error(`${colors.red}❌ Dashboard failed to start: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
      
      if (error instanceof Error && error.message.includes('command not found')) {
        console.log(`\n${colors.bright}📦 Install Sniffly:${colors.reset}`);
        console.log(`${colors.cyan}# Using UV (recommended)${colors.reset}`);
        console.log(`uv tool install sniffly@latest`);
        console.log(`\n${colors.cyan}# Using pip${colors.reset}`);
        console.log(`pip install sniffly`);
        console.log(`\n${colors.cyan}# From source${colors.reset}`);
        console.log(`git clone https://github.com/chiphuyen/sniffly.git`);
        console.log(`cd sniffly && pip install -e .`);
      }
      
      process.exit(1);
    }
  });

async function checkSnifflyInstallation(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('sniffly', ['--version'], { stdio: 'pipe' });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Sniffly not installed or not accessible'));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`Sniffly command not found: ${err.message}`));
    });
  });
}

async function runSnifflyCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('sniffly', args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Sniffly command failed with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

function displayDashboardFeatures(): void {
  console.log(`${colors.bright}📊 Sniffly Developer Dashboard Features:${colors.reset}`);
  console.log(`  ${colors.green}•${colors.reset} Local Analytics (Secure)`);
  console.log(`    - Localhost-only binding (127.0.0.1:8081)`);
  console.log(`    - No external network exposure`);
  console.log(`    - Real-time usage insights`);
  console.log(`  ${colors.green}•${colors.reset} Usage Patterns & Statistics`);
  console.log(`    - Interaction frequency analysis`);
  console.log(`    - Model usage distribution`);
  console.log(`    - Peak usage times identification`);
  console.log(`  ${colors.green}•${colors.reset} Error Analysis & Categorization`);
  console.log(`    - Error type breakdown`);
  console.log(`    - Failure pattern identification`);
  console.log(`    - Resolution recommendations`);
  console.log(`  ${colors.green}•${colors.reset} Cost Intelligence`);
  console.log(`    - Token usage tracking`);
  console.log(`    - Cost per interaction analysis`);
  console.log(`    - Personal budget insights`);
  console.log(`  ${colors.green}•${colors.reset} Privacy Controls`);
  console.log(`    - PII/secrets scrubbing before enterprise sync`);
  console.log(`    - User consent for data sharing`);
  console.log(`    - Local-first architecture`);
  
  console.log(`\n${colors.bright}🏢 Enterprise Integration:${colors.reset}`);
  console.log(`  ${colors.cyan}•${colors.reset} Optional secure sync to S3 data lake`);
  console.log(`  ${colors.cyan}•${colors.reset} Feeds enterprise dashboards (Grafana/Metabase)`);
  console.log(`  ${colors.cyan}•${colors.reset} Compliance-ready audit trails`);
  console.log(`\n${colors.gray}Data Source: Claude Code logs (~/.claude) - Local first${colors.reset}`);
}