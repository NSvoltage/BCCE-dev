# Contributing to BCCE

Welcome to the BCCE community! 🎉 We're excited to have you contribute to the Bedrock Claude Code Enablement Kit.

## 🌟 Ways to Contribute

- 🐛 **Bug Reports**: Help us identify and fix issues
- ✨ **Feature Requests**: Suggest new features and improvements  
- 📚 **Documentation**: Improve guides, examples, and API docs
- 💻 **Code**: Fix bugs, implement features, and improve performance
- 🧪 **Testing**: Add tests and improve test coverage
- 🎨 **Design**: Improve user experience and developer experience
- 💬 **Community**: Help others in discussions and issues

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm 9+
- Git
- AWS CLI (for integration testing)

### Setup Development Environment

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/BCCE-dev.git
   cd BCCE-dev
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build and Test**
   ```bash
   npm run build
   npm test
   ```

4. **Run BCCE Locally**
   ```bash
   npm run dev -- --help
   ```

## 🏗️ Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration

# Check code quality
npm run lint
npm run typecheck

# Format code
npm run format
```

### 4. Commit Your Changes

We use [Conventional Commits](https://conventionalcommits.org/):

```bash
# Examples:
git commit -m "feat: add support for multi-region deployment"
git commit -m "fix: resolve issue with policy validation"
git commit -m "docs: update installation guide"
git commit -m "test: add integration tests for workflow runner"
```

**Commit Types:**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

### 5. Push and Create Pull Request

```bash
git push origin your-branch-name
```

Create a Pull Request using our [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## 📋 Code Standards

### TypeScript Guidelines

- Use TypeScript strictly - no `any` types
- Provide proper type definitions
- Use interfaces for object shapes
- Prefer `const` over `let` where possible

```typescript
// Good
interface DeploymentOptions {
  environment: 'dev' | 'staging' | 'prod';
  region: string;
  profile?: string;
}

const deployToAWS = (options: DeploymentOptions): Promise<void> => {
  // Implementation
};

// Bad
const deployToAWS = (options: any) => {
  // Implementation
};
```

### Code Organization

```
src/
├── commands/           # CLI command implementations
│   ├── deploy/
│   ├── init/
│   └── ...
├── lib/               # Shared utilities and libraries
├── types/             # TypeScript type definitions
└── index.ts           # Main entry point
```

### Testing Standards

- **Unit Tests**: Test individual functions/classes
- **Integration Tests**: Test command flows end-to-end
- **Fixtures**: Use realistic test data

```typescript
// Example test structure
describe('DeployCommand', () => {
  describe('validateConfig', () => {
    it('should accept valid configuration', () => {
      // Test implementation
    });
    
    it('should reject invalid configuration', () => {
      // Test implementation  
    });
  });
});
```

### Error Handling

- Use specific error types
- Provide actionable error messages
- Include relevant context

```typescript
class ConfigurationError extends Error {
  constructor(
    message: string, 
    public readonly configPath: string
  ) {
    super(`Configuration error in ${configPath}: ${message}`);
    this.name = 'ConfigurationError';
  }
}

// Usage
throw new ConfigurationError(
  'Missing required field "region"', 
  'bcce.config.yaml'
);
```

## 🧪 Testing Guidelines

### Test Structure

```typescript
// tests/unit/deploy.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import { DeployCommand } from '../src/commands/deploy';

describe('DeployCommand', () => {
  let deployCommand: DeployCommand;
  
  beforeEach(() => {
    deployCommand = new DeployCommand();
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  describe('execute', () => {
    it('should deploy successfully with valid config', async () => {
      // Test implementation
      const result = await deployCommand.execute({
        environment: 'dev',
        region: 'us-east-1'
      });
      
      expect(result.success).toBe(true);
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/deploy.integration.test.ts
describe('Deploy Integration', () => {
  it('should deploy to AWS Bedrock', async () => {
    // Use actual AWS calls in controlled test environment
    // Requires proper AWS credentials and test account
  });
});
```

### Test Data

```typescript
// tests/fixtures/configs.ts
export const validConfig = {
  version: '1.0',
  environment: 'dev',
  region: 'us-east-1',
  // ... more config
};

export const invalidConfig = {
  // Missing required fields
};
```

## 📚 Documentation Guidelines

### Code Documentation

```typescript
/**
 * Deploys BCCE configuration to AWS Bedrock
 * 
 * @param options - Deployment configuration options
 * @param options.environment - Target environment (dev/staging/prod)
 * @param options.region - AWS region for deployment
 * @returns Promise resolving to deployment result
 * 
 * @example
 * ```typescript
 * const result = await deploy({
 *   environment: 'prod',
 *   region: 'us-east-1'
 * });
 * ```
 */
async function deploy(options: DeployOptions): Promise<DeployResult> {
  // Implementation
}
```

### README Updates

When adding new features:
1. Update the main README.md
2. Add examples to relevant docs
3. Update command reference
4. Add troubleshooting entries if needed

## 🔒 Security Guidelines

### Security Best Practices

- Never commit secrets, API keys, or credentials
- Use environment variables for sensitive data
- Validate all user inputs
- Follow principle of least privilege
- Use secure defaults

```typescript
// Good - Environment variable
const apiKey = process.env.BCCE_API_KEY;
if (!apiKey) {
  throw new Error('BCCE_API_KEY environment variable required');
}

// Bad - Hardcoded secret
const apiKey = 'sk-abcd1234...'; // Don't do this!
```

### Reporting Security Issues

Email security@bcce.dev for security vulnerabilities. Don't create public issues for security problems.

## 🏢 Enterprise Contributions

### Enterprise Features

When contributing enterprise features:
- Consider scalability and performance
- Add comprehensive documentation
- Include monitoring/observability hooks
- Follow compliance best practices
- Add appropriate error handling and logging

### Breaking Changes

For breaking changes:
1. Discuss in an issue first
2. Provide migration guide
3. Update changelog
4. Consider deprecation period
5. Update version appropriately (semantic versioning)

## 📞 Getting Help

- **Questions**: Use [GitHub Discussions](https://github.com/NSvoltage/BCCE-dev/discussions)
- **Bugs**: Create an issue using our bug report template
- **Features**: Create an issue using our feature request template
- **Real-time Chat**: Join our community Slack (link in README)

## 🎯 Contribution Guidelines

### Pull Request Guidelines

1. **Size**: Keep PRs focused and reasonably sized
2. **Testing**: Include tests for new functionality
3. **Documentation**: Update docs for user-facing changes
4. **Backwards Compatibility**: Avoid breaking changes when possible
5. **Performance**: Consider performance implications

### Code Review Process

1. **Automated Checks**: All CI checks must pass
2. **Peer Review**: At least one approving review required
3. **Maintainer Review**: Core maintainer approval for significant changes
4. **Testing**: Manual testing for complex features

### Release Process

We use semantic versioning (semver):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

## 📊 Recognition

We appreciate all contributions! Contributors will be:
- Listed in our CONTRIBUTORS.md file
- Mentioned in release notes for significant contributions
- Invited to contributor-only events and discussions
- Eligible for BCCE swag and recognition

## 📋 Contributor License Agreement

By contributing to BCCE, you agree that your contributions will be licensed under the same license as the project (MIT License).

## 🙋‍♀️ Questions?

Don't hesitate to ask questions! We're here to help:
- Open a discussion for general questions
- Comment on issues for specific problems
- Reach out to maintainers directly for complex topics

---

Thank you for contributing to BCCE! Your help makes this project better for everyone. 🙏