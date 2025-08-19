# Contributing to BCCE

Thank you for your interest in contributing to BCCE! This guide will help you get started with contributing to the project.

## 🚀 Quick Start for Contributors

### Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/bcce-dev.git
cd bcce-dev

# 2. Install dependencies and build
cd cli
npm install
npm run build

# 3. Verify your setup
./dist/bcce doctor

# 4. Run tests to ensure everything works
npm test
```

## 🏗️ **Architecture Overview**

BCCE follows a **hybrid approach**:
- **Upstream AWS Repo**: Infrastructure, IAM policies, Terraform modules
- **BCCE (This Repo)**: Developer experience tools, CLI, workflows, diagnostics

## 📋 **Development Setup**

### Prerequisites
```bash
# Required
node.js 20+      # For CLI development
go 1.22+         # For utilities  
terraform 1.6+   # For infrastructure testing

# Optional
aws cli v2+      # For testing
claude cli       # For integration testing
```

### Quick Start
```bash
# Clone and setup
git clone https://github.com/your-org/bcce.git
cd bcce
make setup

# Build and test
make build test lint

# Install locally for testing
make install-local
bcce --help
```

## 🛠️ **Development Workflow**

### 1. **Branch Strategy**
- `main` - Stable, production-ready code
- `develop` - Integration branch for features
- `feature/xyz` - Individual features
- `fix/xyz` - Bug fixes

### 2. **Commit Standards**
Use [Conventional Commits](https://conventionalcommits.org/):
```bash
feat(cli): add model discovery command
fix(doctor): handle missing AWS credentials gracefully  
docs(setup): update enterprise onboarding guide
test(workflow): add validation for all starter templates
```

### 3. **Code Standards**

#### TypeScript (CLI)
- Strict mode enabled
- No `any` types
- ESLint + Prettier
- Minimal dependencies
- Clear error messages with actionable fixes

#### Go (Utilities)
- Standard library first
- No CGO dependencies  
- Static linking
- Table-driven tests
- Structured logging

#### Terraform (Modules)
- Typed variables with descriptions
- No hardcoded ARNs in examples
- tflint clean
- Complete examples

## 📝 **Documentation Standards**

### Writing Guidelines
- **Task-oriented**: Focus on accomplishing specific goals
- **Enterprise-first**: Address governance and security upfront
- **Future-proof**: Use discovery commands, avoid hardcoded examples
- **Actionable**: Provide exact commands and clear next steps

### Model Configuration
- ✅ **Use**: `bcce models list` and `bcce models recommend`
- ✅ **Use**: `${BEDROCK_MODEL_ID}` environment variables
- ❌ **Avoid**: Hardcoded model IDs like `anthropic.claude-3-5-sonnet-20241022-v2:0`
- ❌ **Avoid**: Assumptions about model availability

### Testing Documentation
All code examples must be tested and working:
```bash
# Test documentation examples
export BEDROCK_MODEL_ID=$(./cli/dist/bcce models list --format ids | head -1)
./cli/dist/bcce workflow validate workflows/starters/test-grader.yml
```

## 🧪 **Testing Requirements**

### Before Submitting PRs
```bash
# All tests must pass
make test

# All linting must be clean  
make lint

# All workflows must validate
export BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20241022-v2:0"  # or latest available
make validate-workflows

# Doctor must provide actionable feedback
./cli/dist/bcce doctor
```

### Test Categories
- **Unit Tests**: Individual function testing
- **Integration Tests**: CLI command testing  
- **Contract Tests**: Workflow schema validation
- **Documentation Tests**: Code examples verification

## 📦 **Pull Request Process**

### 1. **PR Checklist**
- [ ] Follows conventional commit format
- [ ] Includes tests for new functionality
- [ ] Updates documentation as needed
- [ ] All CI checks pass
- [ ] No hardcoded model IDs or assumptions
- [ ] Error messages are actionable

### 2. **PR Template**
```markdown
## Summary
Brief description of changes

## Changes
- List of key changes
- Organized by category

## Testing  
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Documentation examples tested
- [ ] `make validate-workflows` passes

## Breaking Changes
List any breaking changes and migration steps

## Related Issues
Closes #123
```

### 3. **Review Process**
1. Automated CI checks
2. Code review from maintainers
3. Documentation review
4. Integration testing
5. Merge to develop
6. Release planning

## 🎯 **Contribution Areas**

### High Impact Areas
1. **Claude Code Integration**: Complete subprocess execution with budget enforcement
2. **Terraform Modules**: Full infrastructure automation
3. **Additional Workflows**: More starter templates for common use cases
4. **Enterprise Features**: Advanced governance, monitoring, reporting

### Good First Issues
- Documentation improvements
- Error message enhancements
- Test coverage improvements
- New workflow templates
- Regional model testing

## 🔒 **Security Guidelines**

### Security Requirements
- Never commit secrets or credentials
- All credentials must be short-lived
- Command allowlists mandatory for workflow execution
- Path restrictions enforced for file operations
- Guardrails enabled by default in enterprise setups

### Security Review Process
Security-sensitive changes require additional review:
- Authentication mechanisms
- Credential handling
- Command execution
- File system access
- Network requests

## 🌐 **Community**

### Getting Help
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Documentation**: Comprehensive guides and examples

### Communication
- Be respectful and inclusive
- Focus on technical merit
- Provide constructive feedback
- Help other contributors learn

## 📊 **Success Metrics**

We measure success by:
- **Developer Activation**: % of invited devs active within 7 days
- **Time to First Use**: Minutes from setup to first Claude Code call  
- **Security Posture**: 100% short-lived credentials, zero static keys
- **Workflow Usage**: Average runs per developer per week

## 📚 **Additional Resources**

- [Enterprise Setup Guide](docs/dev/enterprise-setup.md)
- [Model Strategy Guide](docs/dev/model-strategy.md)
- [Testing Documentation](TESTING.md)
- [Deployment Readiness](DEPLOYMENT-READY.md)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)

## 🎉 **Recognition**

Contributors are recognized through:
- GitHub contributor listings
- Release notes mentions  
- Community showcases
- Conference presentations (with permission)

Thank you for helping make Claude Code accessible to enterprise teams everywhere! 🚀