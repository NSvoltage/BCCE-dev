import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

export const workflowCmd = new Command('workflow')
  .description('Validate, run, resume, diagram, and scaffold ROAST-style workflows');

// Validate command
workflowCmd
  .command('validate')
  .argument('<file>', 'Workflow YAML path')
  .action((file) => {
    try {
      if (!fs.existsSync(file)) {
        console.error('❌ File not found:', file);
        process.exit(1);
      }

      // Load and parse YAML
      const content = fs.readFileSync(file, 'utf-8');
      let workflow;
      try {
        workflow = yaml.parse(content);
      } catch (error: any) {
        console.error('❌ YAML parsing error:', error.message);
        console.error(`   File: ${file}`);
        if (error.linePos) {
          console.error(`   Line: ${error.linePos[0].line}, Column: ${error.linePos[0].col}`);
        }
        process.exit(1);
      }

      // Load schema
      const schemaPath = path.resolve('workflows/schemas/workflow.v1.schema.json');
      if (!fs.existsSync(schemaPath)) {
        console.error('❌ Schema not found:', schemaPath);
        process.exit(1);
      }

      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      const validate = ajv.compile(schema);

      // Validate against schema
      const valid = validate(workflow);
      if (!valid) {
        console.error('❌ Schema validation failed:');
        for (const error of validate.errors || []) {
          console.error(`   ${error.instancePath || 'root'}: ${error.message}`);
          if (error.data !== undefined) {
            console.error(`   Value: ${JSON.stringify(error.data)}`);
          }
        }
        console.error(`   File: ${path.resolve(file)}`);
        process.exit(1);
      }

      // Additional semantic validation
      const stepIds = new Set<string>();
      for (const step of workflow.steps || []) {
        if (stepIds.has(step.id)) {
          console.error(`❌ Duplicate step ID: ${step.id}`);
          process.exit(1);
        }
        stepIds.add(step.id);

        // Validate step-specific requirements
        if (step.type === 'prompt' && !step.prompt_file) {
          console.error(`❌ Step '${step.id}': prompt steps require prompt_file`);
          process.exit(1);
        }
        if (step.type === 'cmd' && !step.command) {
          console.error(`❌ Step '${step.id}': cmd steps require command`);
          process.exit(1);
        }
        if (step.type === 'agent' && !step.policy) {
          console.error(`❌ Step '${step.id}': agent steps require policy constraints`);
          process.exit(1);
        }
      }

      console.log('✅ Workflow validation passed');
      console.log(`   File: ${path.resolve(file)}`);
      console.log(`   Steps: ${workflow.steps?.length || 0}`);
      console.log(`   Model: ${workflow.model || 'default'}`);
      if (workflow.guardrails?.length) {
        console.log(`   Guardrails: ${workflow.guardrails.join(', ')}`);
      }

    } catch (error: any) {
      console.error('❌ Validation error:', error.message);
      process.exit(1);
    }
  });

// Run command
workflowCmd
  .command('run')
  .argument('<file>', 'Workflow YAML path')
  .option('--dry-run', 'Validate and plan without executing')
  .option('--approve-all', 'Auto-approve all apply_diff steps (dangerous)')
  .action((file, opts) => {
    console.log('▶️  Running workflow:', file);
    if (opts.dryRun) {
      console.log('🔍 Dry run mode - would execute:');
      // TODO: Load workflow and show execution plan
    } else {
      console.log('🚧 Workflow execution not yet implemented');
    }
  });

// Resume command
workflowCmd
  .command('resume')
  .argument('<runId>', 'Workflow run ID')
  .option('--from <stepId>', 'Step ID to resume from')
  .action((runId, opts) => {
    console.log(`⏩  Resume workflow run ${runId}`);
    if (opts.from) {
      console.log(`   Starting from step: ${opts.from}`);
    }
    console.log('🚧 Resume functionality not yet implemented');
  });

// Diagram command
workflowCmd
  .command('diagram')
  .argument('<file>', 'Workflow YAML path')
  .option('--format <fmt>', 'Output format: dot, png, svg', 'dot')
  .option('--output <path>', 'Output file path')
  .action((file, opts) => {
    try {
      if (!fs.existsSync(file)) {
        console.error('❌ File not found:', file);
        process.exit(1);
      }

      const workflow = yaml.parse(fs.readFileSync(file, 'utf-8'));
      const steps = workflow.steps || [];
      
      let output = 'digraph workflow {\n';
      output += '  rankdir=TB;\n';
      output += '  node [shape=box, style=rounded];\n\n';
      
      // Add nodes
      for (const step of steps) {
        const shape = step.type === 'agent' ? 'diamond' : 'box';
        const color = step.type === 'cmd' ? 'lightblue' : 
                     step.type === 'agent' ? 'orange' :
                     step.type === 'apply_diff' ? 'lightcoral' : 'lightgreen';
        output += `  "${step.id}" [label="${step.id}\\n(${step.type})", shape=${shape}, fillcolor=${color}, style=filled];\n`;
      }
      
      output += '\n';
      
      // Add edges (sequential for now)
      for (let i = 0; i < steps.length - 1; i++) {
        output += `  "${steps[i].id}" -> "${steps[i + 1].id}";\n`;
      }
      
      output += '}\n';

      if (opts.output) {
        fs.writeFileSync(opts.output, output);
        console.log('📊 Diagram saved to:', opts.output);
      } else {
        console.log('📊 Workflow diagram (DOT format):\n');
        console.log(output);
      }

    } catch (error: any) {
      console.error('❌ Diagram generation error:', error.message);
      process.exit(1);
    }
  });

// Scaffold command
workflowCmd
  .command('scaffold')
  .argument('<name>', 'New workflow name')
  .option('--template <type>', 'Template type: basic, agent, test-grader', 'basic')
  .action((name, opts) => {
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const dir = `workflows/examples/${safeName}`;
    
    try {
      fs.mkdirSync(dir, { recursive: true });

      // Create prompt file
      const promptContent = opts.template === 'test-grader' 
        ? '# Test Grader Workflow\n\nAnalyze the test suite and suggest improvements.\n\n## Tasks\n1. Find all test files\n2. Identify missing test coverage\n3. Suggest additional test cases\n'
        : opts.template === 'agent'
        ? '# Agent Workflow\n\nPerform automated code analysis and fixes.\n\n## Instructions\nAnalyze the codebase and make improvements while following best practices.\n'
        : '# Basic Workflow\n\nYour workflow description here.\n\n## Steps\nDescribe what this workflow should accomplish.\n';

      fs.writeFileSync(`${dir}/prompt.md`, promptContent);

      // Create workflow file
      let workflowContent = '';
      if (opts.template === 'test-grader') {
        workflowContent = `version: 1
workflow: "Test grader - ${name}"
model: \${BEDROCK_MODEL_ID}
guardrails: ["pii-basic", "secrets-default"]

env:
  max_runtime_seconds: 900
  artifacts_dir: .bcce_runs/\${RUN_ID}

steps:
  - id: discover_tests
    type: prompt
    prompt_file: prompt.md
    available_tools: [ReadFile, Search]
    inputs:
      paths: ["**/*test*", "**/test*/**"]
      file_size_limit_kb: 256

  - id: analyze_coverage  
    type: agent
    policy:
      timeout_seconds: 300
      max_files: 20
      max_edits: 1
      allowed_paths: ["**/*test*", "src/**", "lib/**"]
      cmd_allowlist: ["npm", "yarn", "pytest", "go", "mvn"]
    available_tools: [ReadFile, Search, Cmd]

  - id: run_tests
    type: cmd
    command: "npm test || pytest || go test ./... || echo 'No test runner detected'"
    on_error: continue

  - id: generate_report
    type: prompt
    prompt_file: prompt.md
    available_tools: [ReadFile]
`;
      } else if (opts.template === 'agent') {
        workflowContent = `version: 1
workflow: "Agent workflow - ${name}"
model: \${BEDROCK_MODEL_ID}
guardrails: ["pii-basic"]

env:
  max_runtime_seconds: 600

steps:
  - id: analyze
    type: agent
    policy:
      timeout_seconds: 300
      max_files: 50
      max_edits: 10
      allowed_paths: ["src/**", "lib/**", "*.ts", "*.js", "*.py"]
      cmd_allowlist: ["npm", "yarn", "pip", "go"]
    available_tools: [ReadFile, Search, Diff, Apply, Cmd]

  - id: apply_changes
    type: apply_diff
    approve: false
`;
      } else {
        workflowContent = `version: 1
workflow: "${name}"
model: \${BEDROCK_MODEL_ID}

steps:
  - id: main_task
    type: prompt
    prompt_file: prompt.md
    available_tools: [ReadFile, Search]
    inputs:
      paths: ["src/**"]
`;
      }

      fs.writeFileSync(`${dir}/workflow.yml`, workflowContent);

      console.log('✨ Workflow scaffolded successfully!');
      console.log(`   Directory: ${dir}`);
      console.log(`   Template: ${opts.template}`);
      console.log('\nNext steps:');
      console.log(`1. Edit ${dir}/prompt.md with your specific requirements`);
      console.log(`2. Customize ${dir}/workflow.yml as needed`);
      console.log(`3. Validate: bcce workflow validate ${dir}/workflow.yml`);
      console.log(`4. Run: bcce workflow run ${dir}/workflow.yml`);

    } catch (error: any) {
      console.error('❌ Scaffolding error:', error.message);
      process.exit(1);
    }
  });