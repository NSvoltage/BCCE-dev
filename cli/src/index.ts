import { Command } from 'commander';
import { setupCmd } from './commands/setup/setup.js';
import { doctorCmd } from './commands/doctor/doctor.js';
import { policyCmd } from './commands/policy/policy.js';
import { costCmd } from './commands/cost/cost.js';
import { workflowCmd } from './commands/workflow/workflow.js';
import { auditCmd } from './commands/audit/audit.js';
import { demoCmd } from './commands/demo/demo.js';
import { dashboardCmd } from './commands/dashboard/dashboard.js';
import { deployCmd } from './commands/deploy/deploy.js';

const program = new Command();

program
  .name('bcce')
  .description('Enterprise Governance for AI Workflows')
  .version('2.0.0')
  .configureHelp({
    sortSubcommands: true,
    showGlobalOptions: true
  });

// Add core governance commands (8 total)
program.addCommand(setupCmd);
program.addCommand(doctorCmd);
program.addCommand(deployCmd);
program.addCommand(policyCmd);
program.addCommand(costCmd);
program.addCommand(workflowCmd);
program.addCommand(auditCmd);
program.addCommand(dashboardCmd);
program.addCommand(demoCmd);

// Global error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help' || err.code === 'commander.version') {
    process.exit(0);
  }
  console.error(`\n❌ ${err.message}`);
  process.exit(err.exitCode || 1);
});

// Parse command line arguments
program.parseAsync().catch((err) => {
  console.error('❌ Fatal error:', err?.message || err);
  process.exit(1);
});