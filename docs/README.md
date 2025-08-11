# BCCE Documentation

## Quick Navigation

### 👥 **For Platform Teams**
- **[Admin Guide](admin/)** - Infrastructure deployment and operations
- **[Security Guide](security/)** - Threat model, defaults, hardening

### 🧑‍💻 **For Developers** 
- **[Enterprise Setup Guide](dev/enterprise-setup.md)** - Complete onboarding workflow
- **[Model Strategy Guide](dev/model-strategy.md)** - Future-proof model configuration
- **[Troubleshooting Guide](troubleshooting/)** - Common issues and fixes

### 🛠️ **For Contributors**
- **[Contribution Guide](contrib/)** - Development workflow and standards

## Documentation Philosophy

BCCE documentation follows these principles:

1. **Task-Oriented** - Every guide focuses on accomplishing specific goals
2. **Enterprise-First** - Addresses governance, security, and scale concerns upfront  
3. **Future-Proof** - No hardcoded examples that become outdated
4. **Actionable** - Provides exact commands and clear next steps
5. **Discovery-Based** - Uses `bcce` commands to show current state rather than assumptions

## Quick Start Paths

### Path 1: Identity Center (SSO) - Most Common
```bash
# 1. Setup
git clone <bcce-repo> && cd bcce && make setup build

# 2. Configure  
./cli/dist/bcce init --auth identity-center --regions us-east-1 --guardrails on
aws sso login --profile my-org
export AWS_PROFILE=my-org AWS_REGION=us-east-1 CLAUDE_CODE_USE_BEDROCK=1

# 3. Discover models
./cli/dist/bcce models recommend --use-case coding
# Follow output to set BEDROCK_MODEL_ID

# 4. Validate
./cli/dist/bcce doctor

# 5. Try workflow
./cli/dist/bcce workflow validate workflows/starters/test-grader.yml
```

### Path 2: Cognito OIDC - For Federated Identity
```bash
# 1. Setup infrastructure
./cli/dist/bcce init --auth cognito-oidc --regions us-east-1
./cli/dist/bcce deploy --module cognito-oidc-sts  
./cli/dist/bcce package

# 2. Distribute credential helpers to developers
# See [Enterprise Setup Guide](dev/enterprise-setup.md#cognito-oidc-users)
```

## Key Documentation Updates

### ✅ **New in This Release**
- **[Model Strategy Guide](dev/model-strategy.md)** - Complete enterprise model configuration strategy
- **Dynamic Model Discovery** - `bcce models` commands eliminate hardcoded assumptions
- **Future-Proof Architecture** - Works with Claude 3.7, 4.0, and future releases automatically
- **Regional Flexibility** - Discovery-based approach works in any AWS region
- **Enterprise Governance** - Inference Profile integration for centralized control

### ✅ **Updated Guides**
- **[Enterprise Setup](dev/enterprise-setup.md)** - Removed all hardcoded model examples
- **[README](../README.md)** - Added `bcce models` commands and discovery workflow
- **[Testing Guide](../TESTING.md)** - Validated multi-model flexibility
- **[Deployment Readiness](../DEPLOYMENT-READY.md)** - Updated enterprise assessment

## Support & Feedback

- **Issues & Bug Reports**: [GitHub Issues](https://github.com/your-org/bcce/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/your-org/bcce/discussions)
- **Enterprise Support**: Contact your platform team

## Documentation Standards

When contributing to documentation:

1. **Use Discovery Commands**: Reference `bcce models list` instead of hardcoded model IDs
2. **Provide Context**: Explain why, not just how
3. **Test Examples**: All code examples should be tested and working
4. **Update Cross-References**: Keep navigation and links current
5. **Follow Templates**: Use existing guides as templates for consistency