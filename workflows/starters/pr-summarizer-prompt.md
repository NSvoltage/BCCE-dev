# Pull Request Analysis & Summary

## Mission
Analyze the changes in a pull request and generate a comprehensive, clear summary that helps reviewers understand the impact, scope, and context of the modifications.

## Analysis Objectives

### 1. Change Overview
- Identify all modified, added, and deleted files
- Categorize changes by type (features, bug fixes, refactoring, documentation, tests)
- Determine the overall scope and complexity of the changes
- Highlight any breaking changes or API modifications

### 2. Technical Impact Assessment
- **Functionality**: What new features or capabilities are added?
- **Performance**: Any potential impact on performance or resource usage?
- **Security**: Security improvements or potential security implications?
- **Dependencies**: New dependencies added or existing ones modified?
- **Database/Schema**: Any database migrations or schema changes?

### 3. Code Quality Review
- Test coverage: Are new features covered by tests?
- Documentation: Is documentation updated to reflect changes?
- Code consistency: Do changes follow existing patterns and conventions?
- Error handling: Are edge cases and error conditions properly handled?

### 4. Risk Assessment
- **Low Risk**: Documentation updates, minor bug fixes, test additions
- **Medium Risk**: New features, refactoring, dependency updates  
- **High Risk**: Breaking changes, security modifications, architectural changes

## Summary Generation

### 5. PR Title & Description
Generate a clear, descriptive PR title that follows conventional commit format when applicable:
- `feat: add user authentication system`
- `fix: resolve memory leak in data processor`
- `refactor: improve error handling in API client`
- `docs: update deployment guide`

### 6. Detailed Summary Structure
Create a well-structured summary including:

**## Summary**
Brief overview of what this PR accomplishes

**## Changes**
- List of key changes organized by category
- File-level changes when relevant

**## Testing**
- New tests added
- Existing tests modified
- Testing strategy for the changes

**## Breaking Changes** (if any)
- Clear description of any breaking changes
- Migration instructions if needed

**## Dependencies** (if applicable)
- New dependencies added
- Updated dependencies
- Reasons for dependency changes

## Review Guidelines

### 7. Reviewer Focus Areas
Suggest what reviewers should pay special attention to:
- Critical logic changes
- Security implications
- Performance considerations
- API contract changes

### 8. Testing Instructions
Provide clear instructions for reviewers to test the changes:
- Setup requirements
- Test scenarios to verify
- Expected outcomes

## Quality Standards
- Use clear, concise language
- Provide context for why changes were made
- Include relevant issue or ticket references
- Highlight any special deployment considerations
- Mention any follow-up work needed