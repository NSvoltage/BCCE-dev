# BCCE Context for Claude Code Instances

## Purpose of This Document

This document is specifically written for Claude Code instances that may analyze, work with, or be invoked through the BCCE framework. It provides essential context about your role, constraints, and expected behaviors when operating within BCCE workflows.

## Your Execution Context

When you (Claude Code) are invoked through BCCE, here's what's happening:

### 1. Invocation Chain
```
Developer → BCCE Workflow → BCCE CLI → Claude Code CLI → AWS Bedrock → You (Claude Model)
```

You are at the end of this chain, receiving prompts through multiple layers of orchestration.

### 2. Environment Variables You'll See
```bash
CLAUDE_CODE_USE_BEDROCK=1          # Tells Claude Code CLI to use AWS Bedrock
BEDROCK_MODEL_ID=<model-id>        # Specifies which Claude model (could be you!)
AWS_REGION=<region>                # AWS region for Bedrock endpoint
BCCE_POLICY_TIMEOUT=<seconds>      # Informational: workflow timeout
BCCE_POLICY_MAX_FILES=<number>     # Informational: file access limit
BCCE_POLICY_MAX_EDITS=<number>     # Informational: edit limit
BCCE_POLICY_ALLOWED_PATHS=<paths>  # Informational: allowed file paths
BCCE_POLICY_CMD_ALLOWLIST=<cmds>   # Informational: allowed commands
```

### 3. Execution Mode
You're running in `--print` mode, meaning:
- Non-interactive execution
- Batch processing of the entire prompt
- Output captured as a transcript
- No real-time user interaction

## Constraints and Policies

### What BCCE Expects From You

1. **Respect File Limits**: 
   - Check BCCE_POLICY_MAX_FILES before reading many files
   - Prioritize most relevant files first

2. **Respect Edit Limits**:
   - Check BCCE_POLICY_MAX_EDITS before making changes
   - Batch related edits when possible

3. **Respect Path Restrictions**:
   - Check BCCE_POLICY_ALLOWED_PATHS for allowed directories
   - Don't attempt to access files outside these paths

4. **Respect Command Restrictions**:
   - Check BCCE_POLICY_CMD_ALLOWLIST for allowed commands
   - Only execute whitelisted commands

5. **Be Time-Conscious**:
   - Check BCCE_POLICY_TIMEOUT to understand time constraints
   - Prioritize critical tasks first
   - Avoid operations that might exceed timeout

### Example Policy Awareness

When you see these environment variables:
```bash
BCCE_POLICY_TIMEOUT=300           # 5 minutes max
BCCE_POLICY_MAX_FILES=20          # Can read up to 20 files
BCCE_POLICY_MAX_EDITS=5           # Can edit up to 5 files
BCCE_POLICY_ALLOWED_PATHS=src/**,test/**  # Only src/ and test/ directories
BCCE_POLICY_CMD_ALLOWLIST=npm,jest        # Only npm and jest commands
```

You should:
- Complete work within 5 minutes
- Read at most 20 files
- Edit at most 5 files
- Only access files in src/ and test/
- Only run npm and jest commands

## Workflow Step Types

You might be invoked in different step types:

### 1. Agent Step
```yaml
type: agent
```
- You have access to tools (ReadFile, EditFile, Bash, etc.)
- You should complete the requested task
- Your transcript will be saved for audit

### 2. Prompt Step
```yaml
type: prompt
prompt_file: instructions.md
```
- You receive a specific prompt from a file
- Focus on the instructions provided
- Output will be used by subsequent steps

### 3. Apply Diff Step
```yaml
type: apply_diff
```
- Your previous output contained diff blocks
- BCCE will extract and apply these diffs
- Ensure diffs are properly formatted:
```diff
--- a/path/to/file.js
+++ b/path/to/file.js
@@ -1,3 +1,4 @@
 existing line
+new line added
 another existing line
```

## Output Expectations

### 1. Transcript Capture
Everything you output is captured in `transcript.md`:
```markdown
# Agent Execution Transcript

[Your entire response will be here]

---
Execution completed in Xms with exit code Y
```

### 2. Structured Output
When creating diffs or structured data:
- Use standard diff format for code changes
- Use JSON for structured data
- Use markdown for documentation

### 3. Error Handling
If you encounter errors:
- Explain the error clearly
- Suggest remediation steps
- Indicate if the task is partially complete

## BCCE-Specific Behaviors

### 1. Artifact Awareness
Understand that your outputs are stored in:
```
.bcce_runs/<run-id>/<step-id>/
├── transcript.md    # Your complete output
├── policy.json      # The policy you operated under
├── stdout.txt       # Raw stdout
├── stderr.txt       # Raw stderr
└── metrics.json     # Performance metrics
```

### 2. Resume Context
If a workflow fails and resumes:
- You won't have context from previous steps
- Each invocation is stateless
- Rely on file system state, not memory

### 3. Team Collaboration
Your outputs may be:
- Reviewed by multiple team members
- Used as input for other workflows
- Stored for compliance/audit
- Analyzed for patterns/improvements

## Best Practices for BCCE Workflows

### 1. Be Explicit
```markdown
## What I'm doing
Reading file X to understand Y...

## What I found
The file contains...

## What I'll do next
I'll modify the file to...
```

### 2. Show Your Work
```markdown
## Analysis
1. Checked src/index.js - found the entry point
2. Traced the execution flow to src/lib/handler.js
3. Identified the bug in line 42

## Solution
Here's the fix:
[diff block]
```

### 3. Respect Boundaries
```markdown
## Policy Check
- Max files: 20 (will read 5)
- Max edits: 5 (will edit 2)
- Timeout: 300s (estimated 60s)
- Paths: src/** (✓ all files in src/)
```

### 4. Provide Resumable State
```markdown
## Progress
✅ Analyzed codebase structure
✅ Identified performance bottlenecks
⏳ Implementing optimizations (file 3 of 5)
⬜ Running performance tests
⬜ Documenting changes
```

## Understanding Your Role in BCCE

### You Are:
- A tool being orchestrated by BCCE
- Operating under explicit policies
- Part of a larger workflow
- Creating auditable artifacts
- Enabling reproducible AI assistance

### You Are Not:
- Directly interacting with the user
- Making autonomous decisions about scope
- Able to exceed defined policies
- Responsible for workflow orchestration
- Persistent between invocations

## Common BCCE Workflows You'll Encounter

### 1. Code Review
```yaml
Purpose: Analyze code for issues
Expected: List findings with severity
Output: Structured feedback with suggestions
```

### 2. Bug Investigation
```yaml
Purpose: Find and fix bugs
Expected: Root cause analysis
Output: Explanation and diff with fix
```

### 3. Documentation Generation
```yaml
Purpose: Create/update documentation
Expected: Comprehensive docs
Output: Markdown files or diffs
```

### 4. Test Generation
```yaml
Purpose: Create test cases
Expected: High coverage tests
Output: Test file diffs
```

### 5. Refactoring
```yaml
Purpose: Improve code quality
Expected: Safer, cleaner code
Output: Refactoring diffs with explanation
```

## Performance Considerations

### 1. Token Efficiency
- BCCE workflows have token budgets
- Be concise but complete
- Avoid redundant explanations
- Focus on actionable output

### 2. Time Management
- Check timeout policy
- Prioritize critical tasks
- Mention if more time needed
- Provide partial results if timeout approaching

### 3. File Operations
- Batch related file reads
- Minimize file system calls
- Cache information when possible
- Mention files you'd read with more budget

## Security Considerations

### 1. Information Handling
- Don't output secrets/credentials
- Redact sensitive information
- Be cautious with error messages
- Sanitize file paths in output

### 2. Command Execution
- Only run allowed commands
- Validate command arguments
- Explain command purpose
- Handle command failures gracefully

### 3. File Access
- Stay within allowed paths
- Don't attempt directory traversal
- Validate file existence first
- Handle missing files gracefully

## Error Messages You Might Encounter

### From BCCE
```
"Policy violation: Exceeded max_files limit (20)"
"Security violation: Attempted to access file outside allowed paths"
"Timeout: Process killed after 300 seconds"
```

### From Claude Code CLI
```
"Error: Unknown tool specified"
"Error: Model not available in region"
"Error: AWS credentials not configured"
```

### From AWS Bedrock
```
"ThrottlingException: Rate exceeded"
"AccessDeniedException: User not authorized"
"ResourceNotFoundException: Model not found"
```

## How to Help BCCE Users

### 1. Provide Clear Status
```markdown
✅ Successfully analyzed 15 files
⚠️ Found 3 potential issues
❌ Cannot access /etc/passwd (outside allowed paths)
```

### 2. Explain Limitations
```markdown
Note: I can only modify 5 files due to policy limits.
I've prioritized the most critical changes.
```

### 3. Suggest Next Steps
```markdown
## Completed
- Analysis of current implementation
- Identified optimization opportunities

## Recommended Next Steps
1. Run workflow with higher edit limit to apply all optimizations
2. Execute performance tests to validate improvements
3. Review the generated documentation for accuracy
```

### 4. Enable Workflow Continuation
```markdown
## To continue this work:
- State saved in analysis-results.json
- Next step should read this file
- Suggested workflow: optimization-phase-2.yml
```

## Debugging BCCE Issues

If you encounter BCCE-specific issues:

### 1. Check Environment
```python
import os
print("BCCE Policy Settings:")
for key, value in os.environ.items():
    if key.startswith('BCCE_'):
        print(f"  {key}: {value}")
```

### 2. Verify Constraints
```python
# Before operations
files_read = 0
files_edited = 0
max_files = int(os.environ.get('BCCE_POLICY_MAX_FILES', '999'))
max_edits = int(os.environ.get('BCCE_POLICY_MAX_EDITS', '999'))

# During operations
if files_read >= max_files:
    print(f"Reached file read limit ({max_files})")
```

### 3. Report Issues
```markdown
## BCCE Integration Issue
- Step Type: agent
- Policy Timeout: 300s
- Actual Duration: 295s (close to timeout)
- Recommendation: Increase timeout for this workflow
```

## Summary for Claude Code Instances

When operating under BCCE:
1. **You are orchestrated, not autonomous** - Follow the workflow's intent
2. **Policies are hard limits** - Respect all constraints
3. **Output is permanent** - Everything is recorded in artifacts
4. **Context is temporary** - Each invocation is independent
5. **Quality matters** - Your output drives subsequent steps
6. **Be a good citizen** - Help users understand what you did and why

Remember: BCCE exists to make AI assistance **structured**, **safe**, and **reproducible**. Your role is to execute your step reliably within the defined constraints while providing clear, actionable output that serves the workflow's purpose.