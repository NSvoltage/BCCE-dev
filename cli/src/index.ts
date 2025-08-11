import { Command } from 'commander';
import { initCmd } from './commands/init/init.js';
import { deployCmd } from './commands/deploy/deploy.js';
import { packageCmd } from './commands/package/package.js';
import { doctorCmd } from './commands/doctor/doctor.js';
import { policyCmd } from './commands/policy/policy.js';
import { workflowCmd } from './commands/workflow/workflow.js';
import { modelsCmd } from './commands/models/models.js';

const program = new Command();

program
  .name('bcce')
  .description('Bedrock Claude Code Enablement Kit CLI')
  .version('0.1.0')
  .configureHelp({
    sortSubcommands: true,
    showGlobalOptions: true
  });

// Add commands
program.addCommand(initCmd);
program.addCommand(deployCmd);
program.addCommand(packageCmd); 
program.addCommand(doctorCmd);
program.addCommand(policyCmd);
program.addCommand(modelsCmd);
program.addCommand(workflowCmd);

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