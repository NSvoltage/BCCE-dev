# BCCE Technical Design Document

## System Architecture

### High-Level Design

BCCE implements a **command pattern** with **policy-based execution control** for AI workflows.

```
┌──────────────────────────────────────────────────────────┐
│                     User Interface                        │
│                    (CLI Commands)                         │
├──────────────────────────────────────────────────────────┤
│                   Command Layer                           │
│        (doctor, workflow, init, models, etc.)            │
├──────────────────────────────────────────────────────────┤
│                  Workflow Engine                          │
│         (WorkflowRunner, StepExecutor)                   │
├──────────────────────────────────────────────────────────┤
│                 Security Layer                            │
│        (Policy Enforcement, Validation)                   │
├──────────────────────────────────────────────────────────┤
│                Process Management                         │
│         (Subprocess Spawning, Timeout)                   │
├──────────────────────────────────────────────────────────┤
│              External Integrations                        │
│      (Claude Code CLI, AWS SDK, File System)            │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Framework (TypeScript)

**Technology Stack:**
- TypeScript for type safety
- Commander.js for CLI parsing
- Chalk for terminal colors
- YAML for workflow definitions
- JSON Schema for validation

**Command Structure:**
```typescript
interface Command {
  name: string;
  description: string;
  options: CommandOption[];
  action: (options: any) => Promise<void>;
}
```

### 2. Workflow Engine

**Key Classes:**

#### WorkflowRunner
```typescript
class WorkflowRunner {
  private artifacts: ArtifactManager;
  private executor: StepExecutor;
  
  async run(workflowPath: string, options: RunOptions): Promise<RunState> {
    // 1. Load and validate workflow YAML
    // 2. Initialize run state
    // 3. Execute steps serially
    // 4. Handle failures and resume logic
    // 5. Store artifacts
  }
}
```

#### StepExecutor
```typescript
class StepExecutor {
  async executeStep(step: WorkflowStep, workflow: WorkflowDefinition) {
    switch(step.type) {
      case 'agent': return this.executeAgentStep(step, workflow);
      case 'cmd': return this.executeCmdStep(step, workflow);
      case 'apply_diff': return this.executeApplyDiffStep(step, workflow);
      case 'prompt': return this.executePromptStep(step, workflow);
    }
  }
}
```

### 3. Security Implementation

#### Policy Enforcement Chain
```
Request → Validate Policy → Check Constraints → Execute → Monitor → Enforce Limits → Capture Output
```

#### Policy Validation Rules
1. **Timeout**: Hard kill after specified seconds
2. **File Limits**: Count file operations, fail if exceeded
3. **Path Restrictions**: Validate against glob patterns
4. **Command Allowlist**: Only execute whitelisted commands
5. **Output Redaction**: Remove sensitive data from logs

### 4. Artifact Management

**Directory Structure:**
```
.bcce_runs/
└── 2025-08-13T10-30-45-abc123/       # Run ID (timestamp + random)
    ├── run-state.json                 # Workflow state for resume
    ├── analyze_code/                  # Step ID directory
    │   ├── transcript.md             # Complete AI conversation
    │   ├── policy.json               # Applied security policy
    │   ├── metrics.json              # Performance metrics
    │   ├── stdout.txt                # Raw stdout
    │   ├── stderr.txt                # Raw stderr
    │   └── output.txt                # Processed output
    └── run_tests/
        ├── command.txt               # Executed command
        └── output.txt                # Command output
```

## Implementation Details

### 1. Claude Code Integration

**Subprocess Spawning:**
```typescript
private async executeAgentStep(step: WorkflowStep): Promise<StepResult> {
  // Find Claude executable
  const claudeExecutable = await this.findClaudeExecutable();
  
  // Build arguments
  const args = [
    '--print',                    // Non-interactive mode
    '--model', modelAlias,        // Model selection
    '--allowedTools', tools,      // Tool restrictions
    prompt                        // User prompt
  ];
  
  // Set environment
  const env = {
    ...process.env,
    CLAUDE_CODE_USE_BEDROCK: '1',
    BEDROCK_MODEL_ID: step.model || process.env.BEDROCK_MODEL_ID,
    AWS_REGION: process.env.AWS_REGION,
    // Policy hints for Claude (informational)
    BCCE_POLICY_TIMEOUT: step.policy.timeout_seconds,
    BCCE_POLICY_MAX_FILES: step.policy.max_files
  };
  
  // Spawn process
  const claudeProcess = spawn(claudeExecutable, args, { env });
  
  // Set timeout
  const timeout = setTimeout(() => {
    claudeProcess.kill('SIGTERM');
    setTimeout(() => claudeProcess.kill('SIGKILL'), 5000);
  }, step.policy.timeout_seconds * 1000);
  
  // Capture output
  let transcript = '';
  claudeProcess.stdout.on('data', data => {
    transcript += data.toString();
    this.artifacts.writeStepOutput(step.id, 'transcript.md', transcript);
  });
  
  // Wait for completion
  return new Promise((resolve, reject) => {
    claudeProcess.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, output: transcript });
    });
  });
}
```

### 2. Apply Diff Implementation

**Diff Extraction and Application:**
```typescript
private async executeApplyDiffStep(step: WorkflowStep): Promise<StepResult> {
  // 1. Extract diffs from previous agent transcripts
  const diffs = await this.extractDiffFromPreviousSteps(step);
  
  // 2. Validate safety
  const validation = await this.validateDiffSafety(diffs, step.policy);
  if (!validation.safe) {
    throw new Error(`Unsafe diff: ${validation.reason}`);
  }
  
  // 3. Create backup
  const backup = await this.createBackup(validation.affectedFiles);
  
  // 4. Apply diffs
  try {
    for (const diff of diffs) {
      await this.applyDiffToFile(diff);
    }
  } catch (error) {
    // 5. Rollback on failure
    await this.rollbackChanges(backup);
    throw error;
  }
  
  // 6. Verify changes
  const verification = await this.verifyChanges(validation.affectedFiles);
  return { exitCode: verification.passed ? 0 : 1 };
}
```

**Diff Pattern Matching:**
```typescript
private parseDiffsFromTranscript(transcript: string): Diff[] {
  const diffPattern = /```diff\n([\s\S]*?)\n```/g;
  const filePathPattern = /(?:---\s+a\/|diff --git a\/)([^\s\n]+)/;
  
  const diffs = [];
  let match;
  while ((match = diffPattern.exec(transcript)) !== null) {
    const content = match[1];
    const pathMatch = filePathPattern.exec(content);
    if (pathMatch) {
      diffs.push({
        filePath: pathMatch[1],
        content: content
      });
    }
  }
  return diffs;
}
```

### 3. Doctor Command Implementation

**Health Check Architecture:**
```typescript
class DoctorCommand {
  private checks: HealthCheck[] = [
    new AWSCredentialsCheck(),
    new AWSRegionCheck(),
    new BedrockAccessCheck(),
    new ClaudeCliCheck(),
    new DiskSpaceCheck(),
    new NetworkCheck()
  ];
  
  async execute(): Promise<HealthReport> {
    const results = await Promise.all(
      this.checks.map(check => check.run())
    );
    
    return {
      status: results.every(r => r.status === 'pass') ? 'healthy' : 'unhealthy',
      checks: results,
      remediation: this.generateRemediation(results)
    };
  }
}
```

### 4. State Management

**Run State Schema:**
```typescript
interface RunState {
  runId: string;                    // Unique identifier
  workflow: WorkflowDefinition;     // Complete workflow
  currentStepIndex: number;         // Progress tracker
  startTime: Date;                  // Execution start
  endTime?: Date;                   // Execution end
  status: 'running' | 'completed' | 'failed' | 'paused';
  stepResults: StepResult[];        // Individual step outcomes
}

interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  exitCode?: number;
  output?: string;
  error?: string;
}
```

**Resume Logic:**
```typescript
async resume(runId: string, fromStep?: string): Promise<RunState> {
  // 1. Load saved state
  const state = this.artifacts.loadRunState();
  
  // 2. Find resume point
  let startIndex = state.currentStepIndex;
  if (fromStep) {
    startIndex = state.workflow.steps.findIndex(s => s.id === fromStep);
  }
  
  // 3. Continue execution from resume point
  for (let i = startIndex; i < state.workflow.steps.length; i++) {
    const step = state.workflow.steps[i];
    const result = await this.executor.executeStep(step, state.workflow);
    state.stepResults[i] = result;
    
    if (result.exitCode !== 0) {
      state.status = 'failed';
      break;
    }
  }
  
  return state;
}
```

## Design Patterns Used

### 1. Command Pattern
Each CLI command is encapsulated as an object with its own execution logic.

### 2. Strategy Pattern
Different step types (agent, cmd, apply_diff) implement different execution strategies.

### 3. Chain of Responsibility
Policy validation passes through a chain of validators.

### 4. Observer Pattern
Process output streams are observed and captured in real-time.

### 5. Memento Pattern
Run state is saved for workflow resumption.

## Error Handling Strategy

### Error Categories

1. **Configuration Errors**: Missing AWS credentials, invalid model IDs
   - **Handling**: Clear error messages with setup instructions
   - **Example**: "AWS_REGION not set. Run: export AWS_REGION=us-east-1"

2. **Validation Errors**: Invalid workflow syntax, policy violations
   - **Handling**: Precise error location (file:line:column)
   - **Example**: "workflow.yml:15:3 - Invalid step type 'unknown'"

3. **Execution Errors**: Process failures, timeouts
   - **Handling**: Capture error, save state, provide resume command
   - **Example**: "Step 'analyze' timed out after 300s. Resume: bcce workflow resume abc123 --from analyze"

4. **Security Violations**: Exceeded limits, unauthorized access
   - **Handling**: Immediate termination, log violation, no retry
   - **Example**: "Security violation: Attempted to access file outside allowed paths"

## Performance Considerations

### 1. Process Management
- **Challenge**: Claude Code CLI startup time
- **Solution**: Reuse processes where possible (future optimization)

### 2. Artifact Storage
- **Challenge**: Large transcript files
- **Solution**: Streaming writes, rotation after size limit

### 3. Memory Management
- **Challenge**: Large file operations
- **Solution**: Stream processing, avoid loading full files

### 4. Timeout Handling
- **Challenge**: Graceful shutdown of long-running processes
- **Solution**: SIGTERM first, SIGKILL after grace period

## Security Architecture

### Defense in Depth

1. **Input Validation Layer**
   - YAML schema validation
   - Path traversal prevention
   - Command injection prevention

2. **Policy Enforcement Layer**
   - Mandatory security policies
   - Runtime constraint checking
   - Resource limit enforcement

3. **Process Isolation Layer**
   - Subprocess sandboxing
   - Environment variable filtering
   - Signal handling

4. **Output Sanitization Layer**
   - Sensitive data redaction
   - Secret pattern matching
   - Log scrubbing

### Threat Model

1. **Malicious Workflows**
   - **Threat**: Workflow attempts to access sensitive files
   - **Mitigation**: Path restrictions, glob pattern validation

2. **Command Injection**
   - **Threat**: Workflow injects shell commands
   - **Mitigation**: Command allowlists, no shell execution

3. **Resource Exhaustion**
   - **Threat**: Infinite loops, excessive file operations
   - **Mitigation**: Timeouts, operation limits

4. **Data Exfiltration**
   - **Threat**: AI reads and exposes sensitive data
   - **Mitigation**: File access limits, output redaction

## Testing Strategy

### Unit Tests
- Individual function testing
- Mock external dependencies
- 100% critical path coverage

### Integration Tests
- End-to-end workflow execution
- Real Claude Code CLI integration
- AWS Bedrock connectivity

### Security Tests
- Policy violation scenarios
- Timeout enforcement
- Path restriction validation

### Performance Tests
- Large workflow handling
- Concurrent execution (future)
- Memory leak detection

## Future Architecture Enhancements

### 1. Plugin System
```typescript
interface StepPlugin {
  type: string;
  validate(step: WorkflowStep): ValidationResult;
  execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult>;
}
```

### 2. Distributed Execution
- Job queue for step execution
- Worker nodes for parallel processing
- Result aggregation

### 3. Event-Driven Architecture
- Webhook notifications
- Real-time status updates
- CloudWatch event integration

### 4. Caching Layer
- Model response caching
- Artifact deduplication
- Incremental diff application

## Conclusion

BCCE's technical design prioritizes:
1. **Security**: Multiple layers of defense against misuse
2. **Reliability**: State management enables resume on failure
3. **Observability**: Complete artifact capture for debugging
4. **Extensibility**: Plugin architecture for custom step types
5. **Performance**: Efficient process and memory management

The architecture is intentionally simple and modular, following Unix philosophy of doing one thing well while composing with other tools (Claude Code CLI, AWS CLI, etc.).