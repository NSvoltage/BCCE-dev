# Bug Investigation & Resolution

## Mission
Systematically investigate, reproduce, and resolve the reported bug while ensuring the fix is robust and doesn't introduce regressions.

## Investigation Phase

### 1. Bug Understanding
- Review any available bug reports, error messages, or issue descriptions
- Identify the expected behavior vs actual behavior
- Determine the scope and impact of the bug
- Look for patterns in error logs or stack traces

### 2. Code Analysis
- Examine the relevant code areas where the bug might occur
- Trace through the execution path that leads to the problem
- Identify potential root causes (logic errors, edge cases, race conditions, etc.)
- Check for similar patterns elsewhere in the codebase

### 3. Reproduction Strategy
- Develop a minimal test case or scenario that reproduces the bug
- Verify the bug exists in the current codebase
- Document the exact steps and conditions needed to trigger the issue

## Resolution Phase

### 4. Fix Development
- Design a targeted fix that addresses the root cause
- Consider multiple solution approaches and choose the most appropriate
- Ensure the fix handles edge cases and doesn't break existing functionality
- Write or update tests to cover the bug scenario

### 5. Validation
- Verify the fix resolves the original issue
- Run existing tests to check for regressions
- Test edge cases and related functionality
- Consider performance implications of the fix

## Best Practices
- **Minimal changes**: Make the smallest change that fixes the issue
- **Test coverage**: Ensure the bug scenario is covered by tests
- **Documentation**: Update comments or docs if the fix changes behavior
- **Consistency**: Follow existing code patterns and style
- **Safety**: Avoid changes that could introduce new bugs

## Output
Provide a clear explanation of:
- What the bug was and why it occurred
- How the fix addresses the root cause
- What testing was done to validate the solution
- Any potential side effects or considerations