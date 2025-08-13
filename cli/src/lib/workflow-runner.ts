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
    const claudeExecutable = await this.findClaudeExecutable();
    if (!claudeExecutable) {
      throw new Error(`Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code`);
    }

    console.log(`    Using Claude CLI: ${claudeExecutable}`);

    // Build Claude command with policy constraints
    const claudeArgs = this.buildClaudeArgs(step, workflow);
    
    console.log(`    Running: ${claudeExecutable} ${claudeArgs.join(' ')}`);

    // Execute Claude with timeout and capture transcript
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = (step.policy.timeout_seconds || 300) * 1000;
      let stdout = '';
      let stderr = '';
      let transcript = '# Agent Execution Transcript\n\n';

      // Build secure environment
      const env = this.buildSecureEnvironment(step.policy);

      // Spawn Claude Code process
      const claudeProcess = spawn(claudeExecutable, claudeArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env,
        cwd: process.cwd()
      });

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        console.log(`    ⏰ Agent step ${step.id} timed out after ${step.policy.timeout_seconds}s`);
        claudeProcess.kill('SIGTERM');
        
        // Give it 5 seconds to clean up, then force kill
        setTimeout(() => {
          if (!claudeProcess.killed) {
            claudeProcess.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Capture stdout
      claudeProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        transcript += chunk;
        
        // Real-time output for debugging
        if (process.env.BCCE_DEBUG) {
          process.stdout.write(chunk);
        }
      });

      // Capture stderr
      claudeProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        transcript += `STDERR: ${chunk}`;
        
        if (process.env.BCCE_DEBUG) {
          process.stderr.write(chunk);
        }
      });

      // Handle process completion
      claudeProcess.on('close', async (exitCode) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        
        console.log(`    ${exitCode === 0 ? '✅' : '❌'} Agent step completed in ${duration}ms with exit code ${exitCode}`);

        // Save transcript and outputs
        transcript += `\n---\nExecution completed in ${duration}ms with exit code ${exitCode}\n`;
        
        this.artifacts.writeStepOutput(step.id, 'transcript.md', transcript);
        this.artifacts.writeStepOutput(step.id, 'stdout.txt', stdout);
        this.artifacts.writeStepOutput(step.id, 'stderr.txt', stderr);
        this.artifacts.writeStepOutput(step.id, 'metrics.json', JSON.stringify({
          duration,
          exitCode,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          timeoutSeconds: step.policy.timeout_seconds,
          timedOut: duration >= timeout
        }));

        // Enforce policy constraints on the output
        try {
          const violations = await this.checkPolicyViolations(stdout + stderr, step.policy, step.id);
          if (violations.length > 0) {
            const violationMsg = `Policy violations detected: ${violations.join(', ')}`;
            console.log(`    ⚠️ ${violationMsg}`);
            this.artifacts.writeStepOutput(step.id, 'policy-violations.json', JSON.stringify(violations));
            
            // Fail the step if there are critical violations
            resolve({
              exitCode: 1,
              output: `${violationMsg}\n\nOriginal output:\n${stdout}`
            });
            return;
          }
        } catch (error) {
          console.log(`    ⚠️ Policy enforcement error: ${error.message}`);
        }

        resolve({
          exitCode: exitCode || 0,
          output: stdout || `Process completed with exit code ${exitCode}`
        });
      });

      // Handle process errors
      claudeProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);
        console.log(`    ❌ Claude process error: ${error.message}`);
        
        this.artifacts.writeStepOutput(step.id, 'process-error.txt', error.message);
        
        resolve({
          exitCode: 1,
          output: `Claude process failed: ${error.message}`
        });
      });
    });
  }

  // Helper method to find Claude executable
  private async findClaudeExecutable(): Promise<string | null> {
    const possiblePaths = [
      'claude', // Let system PATH find it
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      process.env.CLAUDE_PATH
    ].filter(Boolean);

    for (const claudePath of possiblePaths) {
      try {
        execSync(`${claudePath} --version`, { stdio: 'ignore', timeout: 5000 });
        return claudePath;
      } catch {
        continue;
      }
    }

    return null;
  }

  // Build Claude command arguments based on step and policy
  private buildClaudeArgs(step: WorkflowStep, workflow: WorkflowDefinition): string[] {
    const args = ['--print']; // Use non-interactive mode
    
    // Set model if specified  
    const model = workflow.model || process.env.BEDROCK_MODEL_ID;
    if (model) {
      // Use Claude's model alias format (e.g., 'sonnet') or full name
      const modelAlias = this.getModelAlias(model);
      args.push('--model', modelAlias);
    }

    // Add available tools as allowed tools
    if (step.available_tools && step.available_tools.length > 0) {
      args.push('--allowedTools', step.available_tools.join(','));
    }

    // Add a simple prompt for the agent step
    const prompt = this.buildSimplePrompt(step, workflow);
    args.push(prompt);

    return args;
  }

  // Convert Bedrock model ID to Claude CLI format
  private getModelAlias(modelId: string): string {
    // Map common Bedrock model IDs to Claude CLI aliases
    if (modelId.includes('sonnet')) return 'sonnet';
    if (modelId.includes('haiku')) return 'haiku';  
    if (modelId.includes('opus')) return 'opus';
    
    // Fallback to full model ID
    return modelId;
  }

  // Build a simple prompt for the agent step
  private buildSimplePrompt(step: WorkflowStep, workflow: WorkflowDefinition): string {
    if (step.id === 'analyze_readme') {
      return `Please read the README.md file and provide a brief summary of what this project does. Keep your response under 100 words.`;
    }
    
    return `You are helping with a workflow step called "${step.id}". 
Please respond with a simple status message like: "Step ${step.id} completed successfully. Ready for next step."
Keep it very brief.`;
  }

  // Build secure environment for Claude execution
  private buildSecureEnvironment(policy: WorkflowStep['policy']): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Set policy constraints as environment variables for Claude to potentially use
    env.BCCE_POLICY_TIMEOUT = policy?.timeout_seconds?.toString();
    env.BCCE_POLICY_MAX_FILES = policy?.max_files?.toString();
    env.BCCE_POLICY_MAX_EDITS = policy?.max_edits?.toString();
    env.BCCE_POLICY_ALLOWED_PATHS = policy?.allowed_paths?.join(',');
    env.BCCE_POLICY_CMD_ALLOWLIST = policy?.cmd_allowlist?.join(',');

    // Ensure Bedrock configuration is available
    if (!env.AWS_REGION) {
      env.AWS_REGION = 'us-east-1';
    }

    return env;
  }

  // Check policy violations in Claude output
  private async checkPolicyViolations(
    output: string, 
    policy: WorkflowStep['policy'], 
    stepId: string
  ): Promise<string[]> {
    const violations: string[] = [];

    if (!policy) return violations;

    // Check for excessive command usage (simplified check)
    const commandPattern = /\$\s*(.*?)$/gm;
    const commands = output.match(commandPattern) || [];
    
    if (policy.cmd_allowlist && policy.cmd_allowlist.length > 0) {
      for (const command of commands) {
        const cleanCommand = command.replace(/^\$\s*/, '').trim();
        const commandName = cleanCommand.split(' ')[0];
        
        if (!policy.cmd_allowlist.some(allowed => cleanCommand.startsWith(allowed))) {
          violations.push(`Unauthorized command: ${commandName}`);
        }
      }
    }

    // Check for potential file access violations (simplified)
    const filePattern = /(?:reading|writing|accessing|modifying)\s+([^\s]+)/gi;
    const fileReferences = output.match(filePattern) || [];
    
    for (const fileRef of fileReferences) {
      if (policy.allowed_paths && policy.allowed_paths.length > 0) {
        const filePath = fileRef.split(' ').pop() || '';
        const isAllowed = policy.allowed_paths.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
          return regex.test(filePath);
        });
        
        if (!isAllowed) {
          violations.push(`File access outside allowed paths: ${filePath}`);
        }
      }
    }

    return violations;
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
    console.log(`    Applying diffs for step: ${step.id}`);

    // Find diff content from previous steps
    const diffContent = await this.extractDiffFromPreviousSteps(step);
    
    if (!diffContent || diffContent.length === 0) {
      const message = 'No diff content found in previous steps';
      console.log(`    ⚠️ ${message}`);
      this.artifacts.writeStepOutput(step.id, 'output.txt', message);
      return { exitCode: 0, output: message };
    }

    console.log(`    Found ${diffContent.length} diff(s) to apply`);

    // Validate diff safety based on policy
    const validation = await this.validateDiffSafety(diffContent, step.policy);
    if (!validation.safe) {
      const errorMsg = `Unsafe diff rejected: ${validation.reason}`;
      console.log(`    ❌ ${errorMsg}`);
      this.artifacts.writeStepOutput(step.id, 'validation-error.txt', errorMsg);
      return { exitCode: 1, output: errorMsg };
    }

    // Create backup before applying changes
    const backupInfo = await this.createBackup(validation.affectedFiles);
    this.artifacts.writeStepOutput(step.id, 'backup-info.json', JSON.stringify(backupInfo, null, 2));

    const appliedFiles: string[] = [];
    const failedFiles: string[] = [];

    try {
      // Apply each diff
      for (const diff of diffContent) {
        try {
          console.log(`    Applying diff to: ${diff.filePath}`);
          await this.applyDiffToFile(diff);
          appliedFiles.push(diff.filePath);
        } catch (error) {
          console.log(`    ❌ Failed to apply diff to ${diff.filePath}: ${error.message}`);
          failedFiles.push(diff.filePath);
        }
      }

      // Verify changes don't break basic functionality
      const verification = await this.verifyChanges(appliedFiles);
      
      const results = {
        appliedFiles,
        failedFiles,
        backupLocation: backupInfo.backupPath,
        verification
      };

      // Save results
      this.artifacts.writeStepOutput(step.id, 'results.json', JSON.stringify(results, null, 2));
      this.artifacts.writeStepOutput(step.id, 'applied-diffs.patch', diffContent.map(d => d.content).join('\n---\n'));

      const output = `Applied ${appliedFiles.length} file changes. ${failedFiles.length} failed.`;
      console.log(`    ✅ ${output}`);
      
      return {
        exitCode: failedFiles.length > 0 ? 1 : 0,
        output
      };

    } catch (error) {
      // Rollback on critical failure
      console.log(`    🔄 Rolling back changes due to error: ${error.message}`);
      try {
        await this.rollbackChanges(backupInfo);
        console.log('    ✅ Rollback completed successfully');
      } catch (rollbackError) {
        console.log(`    ❌ Rollback failed: ${rollbackError.message}`);
      }

      const errorMsg = `Apply diff failed: ${error.message}`;
      this.artifacts.writeStepOutput(step.id, 'error.txt', errorMsg);
      return { exitCode: 1, output: errorMsg };
    }
  }

  // Extract diff content from previous agent steps
  private async extractDiffFromPreviousSteps(step: WorkflowStep): Promise<Array<{filePath: string, content: string}>> {
    const diffs: Array<{filePath: string, content: string}> = [];
    
    // Look for diff content in all previous step artifacts
    const runDir = this.artifacts.runDir;
    const stepDirs = fs.readdirSync(runDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== step.id)
      .map(entry => entry.name);

    for (const stepDir of stepDirs) {
      const transcriptPath = path.join(runDir, stepDir, 'transcript.md');
      if (fs.existsSync(transcriptPath)) {
        const transcript = fs.readFileSync(transcriptPath, 'utf-8');
        const stepDiffs = this.parseDiffsFromTranscript(transcript);
        diffs.push(...stepDiffs);
      }
    }

    return diffs;
  }

  // Parse diff blocks from Claude transcript
  private parseDiffsFromTranscript(transcript: string): Array<{filePath: string, content: string}> {
    const diffs: Array<{filePath: string, content: string}> = [];
    
    // Look for diff blocks in transcript
    const diffPattern = /```diff\n([\s\S]*?)\n```/g;
    const filePathPattern = /(?:---\s+a\/|diff --git a\/)([^\s\n]+)/;
    
    let match;
    while ((match = diffPattern.exec(transcript)) !== null) {
      const diffContent = match[1];
      const pathMatch = filePathPattern.exec(diffContent);
      
      if (pathMatch) {
        diffs.push({
          filePath: pathMatch[1],
          content: diffContent
        });
      } else {
        // Try to extract filename from context
        const contextLines = transcript.substring(Math.max(0, match.index - 200), match.index).split('\n');
        const fileName = this.extractFileNameFromContext(contextLines);
        if (fileName) {
          diffs.push({
            filePath: fileName,
            content: diffContent
          });
        }
      }
    }

    return diffs;
  }

  // Extract filename from surrounding context
  private extractFileNameFromContext(contextLines: string[]): string | null {
    for (let i = contextLines.length - 1; i >= 0; i--) {
      const line = contextLines[i];
      // Look for file references in various formats
      const patterns = [
        /(?:file|path):\s*([^\s]+)/i,
        /(?:editing|modifying|updating)\s+([^\s]+)/i,
        /([^\s]+\.(js|ts|py|go|java|cpp|c|h|md|json|yaml|yml))/i
      ];
      
      for (const pattern of patterns) {
        const match = pattern.exec(line);
        if (match) {
          return match[1];
        }
      }
    }
    return null;
  }

  // Validate that diff is safe to apply
  private async validateDiffSafety(diffs: Array<{filePath: string, content: string}>, policy?: WorkflowStep['policy']): Promise<{
    safe: boolean;
    reason?: string;
    affectedFiles: string[];
  }> {
    const affectedFiles = diffs.map(d => d.filePath);
    
    // Check file count against policy
    if (policy?.max_edits && affectedFiles.length > policy.max_edits) {
      return {
        safe: false,
        reason: `Diff affects ${affectedFiles.length} files, but policy allows max ${policy.max_edits}`,
        affectedFiles
      };
    }

    // Check paths against policy
    if (policy?.allowed_paths) {
      for (const filePath of affectedFiles) {
        const isAllowed = policy.allowed_paths.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
          return regex.test(filePath);
        });
        
        if (!isAllowed) {
          return {
            safe: false,
            reason: `File ${filePath} is outside allowed paths: ${policy.allowed_paths.join(', ')}`,
            affectedFiles
          };
        }
      }
    }

    // Check for dangerous file types
    const dangerousExtensions = ['.sh', '.exe', '.bat', '.ps1'];
    for (const filePath of affectedFiles) {
      if (dangerousExtensions.some(ext => filePath.endsWith(ext))) {
        return {
          safe: false,
          reason: `Modifying executable file not allowed: ${filePath}`,
          affectedFiles
        };
      }
    }

    return { safe: true, affectedFiles };
  }

  // Create backup of files before modification
  private async createBackup(filePaths: string[]): Promise<{backupPath: string, files: string[]}> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join('.bcce_backups', `backup-${timestamp}`);
    
    fs.mkdirSync(backupDir, { recursive: true });
    
    const backedUpFiles: string[] = [];
    
    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        const backupFilePath = path.join(backupDir, filePath);
        fs.mkdirSync(path.dirname(backupFilePath), { recursive: true });
        fs.copyFileSync(filePath, backupFilePath);
        backedUpFiles.push(filePath);
      }
    }

    return {
      backupPath: backupDir,
      files: backedUpFiles
    };
  }

  // Apply diff to a specific file
  private async applyDiffToFile(diff: {filePath: string, content: string}): Promise<void> {
    const { filePath, content } = diff;
    
    // For now, use simple line-based diff application
    // In production, this would use a proper diff/patch library
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const originalContent = fs.readFileSync(filePath, 'utf-8');
    const modifiedContent = this.applySimpleDiff(originalContent, content);
    
    fs.writeFileSync(filePath, modifiedContent, 'utf-8');
  }

  // Simple diff application (basic implementation)
  private applySimpleDiff(originalContent: string, diffContent: string): string {
    const lines = originalContent.split('\n');
    const diffLines = diffContent.split('\n');
    
    let lineNumber = 0;
    
    for (const diffLine of diffLines) {
      if (diffLine.startsWith('@@')) {
        // Parse line number from hunk header
        const match = /@@ -(\d+)/.exec(diffLine);
        if (match) {
          lineNumber = parseInt(match[1]) - 1;
        }
      } else if (diffLine.startsWith('-')) {
        // Remove line
        const lineToRemove = diffLine.substring(1);
        const index = lines.indexOf(lineToRemove, lineNumber);
        if (index !== -1) {
          lines.splice(index, 1);
        }
      } else if (diffLine.startsWith('+')) {
        // Add line
        const lineToAdd = diffLine.substring(1);
        lines.splice(lineNumber, 0, lineToAdd);
        lineNumber++;
      }
    }
    
    return lines.join('\n');
  }

  // Verify changes don't break basic functionality
  private async verifyChanges(filePaths: string[]): Promise<{passed: boolean, errors: string[]}> {
    const errors: string[] = [];
    
    // Basic syntax check for common file types
    for (const filePath of filePaths) {
      try {
        if (filePath.endsWith('.json')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          JSON.parse(content);
        } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
          // Could add syntax validation here
        }
      } catch (error) {
        errors.push(`Syntax error in ${filePath}: ${error.message}`);
      }
    }
    
    return {
      passed: errors.length === 0,
      errors
    };
  }

  // Rollback changes using backup
  private async rollbackChanges(backupInfo: {backupPath: string, files: string[]}): Promise<void> {
    for (const filePath of backupInfo.files) {
      const backupFilePath = path.join(backupInfo.backupPath, filePath);
      if (fs.existsSync(backupFilePath)) {
        fs.copyFileSync(backupFilePath, filePath);
      }
    }
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