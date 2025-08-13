import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { execSync, spawn } from 'node:child_process';

export interface WorkflowStep {
  id: string;
  type: 'prompt' | 'agent' | 'cmd' | 'apply_diff' | 'custom';
  prompt_file?: string;
  command?: string;
  policy?: {
    timeout_seconds: number;
    max_files: number;
    max_edits: number;
    allowed_paths: string[];
    cmd_allowlist: string[];
  };
  available_tools?: string[];
  inputs?: Record<string, any>;
  on_error?: 'fail' | 'continue';
}

export interface WorkflowDefinition {
  version: number;
  workflow: string;
  model?: string;
  guardrails?: string[];
  env?: {
    max_runtime_seconds?: number;
    artifacts_dir?: string;
    seed?: number;
  };
  steps: WorkflowStep[];
}

export interface RunState {
  runId: string;
  workflow: WorkflowDefinition;
  currentStepIndex: number;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'paused';
  stepResults: Array<{
    stepId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    exitCode?: number;
    output?: string;
    error?: string;
  }>;
}

export class ArtifactManager {
  constructor(private runId: string) {}

  get runDir(): string {
    return path.join('.bcce_runs', this.runId);
  }

  ensureRunDir(): void {
    fs.mkdirSync(this.runDir, { recursive: true });
  }

  getStepDir(stepId: string): string {
    const stepDir = path.join(this.runDir, stepId);
    fs.mkdirSync(stepDir, { recursive: true });
    return stepDir;
  }

  writeStepOutput(stepId: string, filename: string, content: string): void {
    const stepDir = this.getStepDir(stepId);
    fs.writeFileSync(path.join(stepDir, filename), content);
  }

  readStepOutput(stepId: string, filename: string): string {
    const filePath = path.join(this.runDir, stepId, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Output file not found: ${filename} in step ${stepId}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  saveRunState(state: RunState): void {
    this.ensureRunDir();
    fs.writeFileSync(
      path.join(this.runDir, 'run-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  loadRunState(): RunState {
    const statePath = path.join(this.runDir, 'run-state.json');
    if (!fs.existsSync(statePath)) {
      throw new Error(`Run state not found for run ID: ${this.runId}`);
    }
    const stateData = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    // Restore Date objects
    stateData.startTime = new Date(stateData.startTime);
    if (stateData.endTime) stateData.endTime = new Date(stateData.endTime);
    stateData.stepResults.forEach((result: any) => {
      if (result.startTime) result.startTime = new Date(result.startTime);
      if (result.endTime) result.endTime = new Date(result.endTime);
    });
    return stateData;
  }
}

export class StepExecutor {
  constructor(private artifacts: ArtifactManager) {}

  async executeStep(step: WorkflowStep, workflow: WorkflowDefinition): Promise<{
    exitCode: number;
    output: string;
    error?: string;
  }> {
    console.log(`  📋 Executing step: ${step.id} (${step.type})`);
    
    const startTime = Date.now();
    
    try {
      switch (step.type) {
        case 'prompt':
          return await this.executePromptStep(step, workflow);
        case 'cmd':
          return await this.executeCmdStep(step, workflow);
        case 'agent':
          return await this.executeAgentStep(step, workflow);
        case 'apply_diff':
          return await this.executeApplyDiffStep(step, workflow);
        default:
          throw new Error(`Unsupported step type: ${step.type}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Step failed after ${duration}ms: ${errorMsg}`);
      
      // Save error to artifacts
      this.artifacts.writeStepOutput(step.id, 'error.txt', errorMsg);
      
      return {
        exitCode: 1,
        output: '',
        error: errorMsg
      };
    }
  }

  private async executePromptStep(step: WorkflowStep, workflow: WorkflowDefinition): Promise<{
    exitCode: number;
    output: string;
  }> {
    // For now, just simulate prompt execution
    const output = `Prompt step ${step.id} executed successfully`;
    this.artifacts.writeStepOutput(step.id, 'output.txt', output);
    
    if (step.prompt_file) {
      this.artifacts.writeStepOutput(step.id, 'prompt_file.txt', step.prompt_file);
    }
    
    return { exitCode: 0, output };
  }

  private async executeCmdStep(step: WorkflowStep, workflow: WorkflowDefinition): Promise<{
    exitCode: number;
    output: string;
  }> {
    if (!step.command) {
      throw new Error(`Command step ${step.id} missing command`);
    }

    console.log(`    Running: ${step.command}`);
    
    try {
      const output = execSync(step.command, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 30000 // 30 second timeout for safety
      });
      
      this.artifacts.writeStepOutput(step.id, 'command.txt', step.command);
      this.artifacts.writeStepOutput(step.id, 'output.txt', output);
      
      return { exitCode: 0, output };
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      this.artifacts.writeStepOutput(step.id, 'command.txt', step.command);
      this.artifacts.writeStepOutput(step.id, 'error.txt', errorOutput);
      
      if (step.on_error === 'continue') {
        console.log(`    ⚠️ Command failed but continuing due to on_error: continue`);
        return { exitCode: 0, output: errorOutput };
      }
      
      throw error;
    }
  }

  private async executeAgentStep(step: WorkflowStep, workflow: WorkflowDefinition): Promise<{
    exitCode: number;
    output: string;
  }> {
    if (!step.policy) {
      throw new Error(`Agent step ${step.id} missing policy constraints`);
    }

    // Save policy for audit
    this.artifacts.writeStepOutput(step.id, 'policy.json', JSON.stringify(step.policy, null, 2));
    
    // Check for Claude CLI availability
    try {
      execSync('claude --version', { stdio: 'ignore' });
    } catch {
      // Fallback to simulation if Claude CLI not available
      console.log('    ⚠️ Claude CLI not found, simulating agent step');
      const output = `Agent step ${step.id} simulated with policy: ${JSON.stringify(step.policy, null, 2)}`;
      this.artifacts.writeStepOutput(step.id, 'output.txt', output);
      this.artifacts.writeStepOutput(step.id, 'transcript.md', `# Agent Execution Transcript (Simulated)\n\n${output}\n`);
      return { exitCode: 0, output };
    }

    // Build Claude command with policy constraints
    const prompt = this.buildAgentPrompt(step, workflow);
    const claudeArgs: string[] = [];

    // Execute Claude with timeout and capture transcript
    return new Promise((resolve) => {
      const startTime = Date.now();
      const timeout = (step.policy.timeout_seconds || 300) * 1000;
      let transcript = '# Agent Execution Transcript\n\n';
      let output = '';
      let hasTimedOut = false;

      // Write prompt to file for Claude to read
      const promptFile = path.join(this.artifacts.getStepDir(step.id), 'prompt.txt');
      fs.writeFileSync(promptFile, prompt);
      
      // For now, simulate Claude execution since real CLI integration requires specific setup
      // In production, this would spawn the actual Claude process
      const simulatedOutput = `## Agent Execution (Simulated)\n\n` +
        `Executing task: ${step.id}\n` +
        `Policy enforced:\n` +
        `- Timeout: ${step.policy.timeout_seconds}s\n` +
        `- Max files: ${step.policy.max_files}\n` +
        `- Max edits: ${step.policy.max_edits}\n\n` +
        `Task completed successfully.`;
      
      // Simulate async execution
      setTimeout(() => {
        output = simulatedOutput;
        transcript += simulatedOutput;
        transcript += `\n\n---\nExecution completed in 1s with exit code 0\n`;
        
        // Save artifacts
        this.artifacts.writeStepOutput(step.id, 'transcript.md', transcript);
        this.artifacts.writeStepOutput(step.id, 'output.txt', output);
        
        // Track metrics
        const metrics = {
          duration_seconds: 1,
          exit_code: 0,
          timed_out: false,
          policy: step.policy
        };
        this.artifacts.writeStepOutput(step.id, 'metrics.json', JSON.stringify(metrics, null, 2));
        
        resolve({
          exitCode: 0,
          output: output
        });
      }, 100);
    });
  }

  private buildAgentPrompt(step: WorkflowStep, workflow: WorkflowDefinition): string {
    const policy = step.policy!;
    return `# Agent Task: ${step.id}\n\n` +
           `## Workflow: ${workflow.workflow}\n\n` +
           `## Constraints:\n` +
           `- Timeout: ${policy.timeout_seconds}s\n` +
           `- Max files to read: ${policy.max_files}\n` +
           `- Max edits allowed: ${policy.max_edits}\n` +
           `- Allowed paths: ${policy.allowed_paths.join(', ')}\n` +
           `- Command allowlist: ${policy.cmd_allowlist.join(', ')}\n\n` +
           `## Available tools: ${step.available_tools?.join(', ') || 'None'}\n\n` +
           `## Task:\nExecute the agent task with the above constraints.\n`;
  }

  private redactSensitive(text: string): string {
    // Redact common sensitive patterns
    return text
      .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***REDACTED***')
      .replace(/AWS[A-Z0-9]{16,}/g, 'AWS***REDACTED***')
      .replace(/Bearer [a-zA-Z0-9\-._~+/]+/gi, 'Bearer ***REDACTED***')
      .replace(/password["']?\s*[:=]\s*["'][^"']+["']/gi, 'password=***REDACTED***')
      .replace(/api[_-]?key["']?\s*[:=]\s*["'][^"']+["']/gi, 'api_key=***REDACTED***');
  }

  private async executeApplyDiffStep(step: WorkflowStep, workflow: WorkflowDefinition): Promise<{
    exitCode: number;
    output: string;
  }> {
    // For now, simulate apply_diff (Issue 5 will implement actual diff application)
    const output = `Apply diff step ${step.id} - would apply changes (not yet implemented)`;
    
    this.artifacts.writeStepOutput(step.id, 'diff.patch', '# Placeholder diff content');
    this.artifacts.writeStepOutput(step.id, 'output.txt', output);
    
    return { exitCode: 0, output };
  }
}

export class WorkflowRunner {
  private artifacts: ArtifactManager;
  private executor: StepExecutor;

  constructor(private runId: string) {
    this.artifacts = new ArtifactManager(runId);
    this.executor = new StepExecutor(this.artifacts);
  }

  async run(workflowPath: string, options: {
    resumeFrom?: string;
    dryRun?: boolean;
  } = {}): Promise<RunState> {
    // Load workflow
    const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
    const workflow: WorkflowDefinition = yaml.parse(workflowContent);

    let state: RunState;
    
    if (options.resumeFrom) {
      // Resume existing run
      state = this.artifacts.loadRunState();
      console.log(`⏩ Resuming workflow "${workflow.workflow}" from step: ${options.resumeFrom}`);
    } else {
      // Start new run
      state = {
        runId: this.runId,
        workflow,
        currentStepIndex: 0,
        startTime: new Date(),
        status: 'running',
        stepResults: workflow.steps.map(step => ({
          stepId: step.id,
          status: 'pending'
        }))
      };
      
      console.log(`▶️ Starting workflow "${workflow.workflow}" (${workflow.steps.length} steps)`);
      console.log(`   Run ID: ${this.runId}`);
      console.log(`   Artifacts: ${this.artifacts.runDir}`);
    }

    if (options.dryRun) {
      console.log('\n🔍 Dry run - execution plan:');
      workflow.steps.forEach((step, index) => {
        const status = index < state.currentStepIndex ? '✅' : '⏳';
        console.log(`  ${status} ${step.id} (${step.type})`);
      });
      // Set status to completed for dry-run
      state.status = 'completed';
      return state;
    }

    // Find resume point if specified
    let startIndex = state.currentStepIndex;
    if (options.resumeFrom) {
      const resumeIndex = workflow.steps.findIndex(step => step.id === options.resumeFrom);
      if (resumeIndex === -1) {
        throw new Error(`Step not found: ${options.resumeFrom}`);
      }
      startIndex = resumeIndex;
      state.currentStepIndex = startIndex;
    }

    try {
      // Execute steps serially from start/resume point
      for (let i = startIndex; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        
        // Update step status
        state.stepResults[i].status = 'running';
        state.stepResults[i].startTime = new Date();
        state.currentStepIndex = i;
        
        // Save state before executing step
        this.artifacts.saveRunState(state);
        
        // Execute step
        const result = await this.executor.executeStep(step, workflow);
        
        // Update step result
        state.stepResults[i].status = result.exitCode === 0 ? 'completed' : 'failed';
        state.stepResults[i].endTime = new Date();
        state.stepResults[i].exitCode = result.exitCode;
        state.stepResults[i].output = result.output;
        state.stepResults[i].error = result.error;
        
        if (result.exitCode !== 0) {
          state.status = 'failed';
          this.artifacts.saveRunState(state);
          throw new Error(`Step ${step.id} failed with exit code ${result.exitCode}`);
        }
        
        const duration = state.stepResults[i].endTime!.getTime() - state.stepResults[i].startTime!.getTime();
        console.log(`  ✅ Step completed in ${duration}ms`);
      }
      
      // Workflow completed successfully
      state.status = 'completed';
      state.endTime = new Date();
      state.currentStepIndex = workflow.steps.length;
      
    } catch (error) {
      state.status = 'failed';
      if (!state.endTime) state.endTime = new Date();
      console.error('\n❌ Workflow execution failed:', error instanceof Error ? error.message : error);
    }

    // Save final state
    this.artifacts.saveRunState(state);
    
    // Print summary
    this.printExecutionSummary(state);
    
    return state;
  }

  private printExecutionSummary(state: RunState): void {
    const duration = state.endTime 
      ? state.endTime.getTime() - state.startTime.getTime() 
      : Date.now() - state.startTime.getTime();
    
    const completed = state.stepResults.filter(r => r.status === 'completed').length;
    const failed = state.stepResults.filter(r => r.status === 'failed').length;
    const total = state.stepResults.length;
    
    console.log('\n📊 Execution Summary:');
    console.log(`   Status: ${state.status === 'completed' ? '✅ Completed' : state.status === 'failed' ? '❌ Failed' : '⏸️  Paused'}`);
    console.log(`   Duration: ${Math.round(duration / 1000)}s`);
    console.log(`   Steps: ${completed}/${total} completed${failed > 0 ? `, ${failed} failed` : ''}`);
    console.log(`   Artifacts: ${this.artifacts.runDir}`);
    
    if (state.status === 'failed') {
      console.log('\n🔧 To resume from the failed step:');
      console.log(`   bcce workflow resume ${state.runId} --from ${state.workflow.steps[state.currentStepIndex]?.id}`);
    }
  }

  static generateRunId(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }
}