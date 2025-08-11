# Test Grader & Fixer

## Mission
Analyze the project's test suite and identify opportunities for improvement, then suggest specific enhancements to test coverage, quality, and maintainability.

## Analysis Tasks

### 1. Test Discovery & Coverage Analysis
- Find all test files and understand the testing framework(s) in use
- Identify the main source directories and their corresponding test coverage
- Look for untested or under-tested modules, functions, and edge cases
- Check for integration vs unit test balance

### 2. Test Quality Assessment
Evaluate existing tests for:
- **Clarity**: Are test names descriptive? Is the intent clear?
- **Completeness**: Do tests cover happy path, error cases, and edge cases?
- **Maintainability**: Are tests DRY? Do they use appropriate fixtures/mocks?
- **Performance**: Are tests fast? Any long-running tests that could be optimized?
- **Flakiness**: Look for tests that might be unstable or environment-dependent

### 3. Framework & Tooling Review
- Assess testing framework usage and configuration
- Check for appropriate use of mocking, fixtures, and test utilities
- Evaluate test organization and file structure
- Review CI/CD test integration

## Improvement Recommendations

Provide specific, actionable recommendations such as:
- Missing test cases for critical functions
- Opportunities to improve test readability and maintainability
- Suggestions for better test organization
- Recommendations for additional testing tools or practices

## Constraints
- Focus on practical improvements that provide real value
- Prioritize high-impact changes over minor style issues
- Consider the project's context and complexity level
- Ensure all suggestions follow testing best practices for the detected framework