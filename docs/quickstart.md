# BCCE Quick Start Guide

Get up and running with BCCE in under 5 minutes! 🚀

## Prerequisites

Before you begin, ensure you have:
- AWS Account with appropriate permissions
- Node.js 18+ installed
- AWS CLI configured with your credentials

## Step 1: Installation

### Option A: NPM (Recommended)
```bash
npm install -g bcce
```

### Option B: Direct Download
```bash
# macOS/Linux
curl -L https://github.com/NSvoltage/BCCE-dev/releases/latest/download/bcce-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m) -o bcce
chmod +x bcce && sudo mv bcce /usr/local/bin/

# Windows (PowerShell)
Invoke-WebRequest -Uri "https://github.com/NSvoltage/BCCE-dev/releases/latest/download/bcce-win.exe" -OutFile "bcce.exe"
```

### Option C: Docker
```bash
docker run --rm -it nsvoltage/bcce:latest bcce --help
```

## Step 2: Verify Installation

```bash
bcce --version
bcce doctor
```

The `doctor` command will check your environment and AWS credentials.

## Step 3: Initialize Your First Project

```bash
# Create a new directory for your project
mkdir my-claude-project && cd my-claude-project

# Initialize BCCE project
bcce init
```

This will create:
```
my-claude-project/
├── bcce.config.yaml       # Main configuration
├── workflows/             # Workflow definitions
│   └── example.yml
├── policies/             # IAM policies
│   └── default.json
└── docs/                 # Project documentation
    └── README.md
```

## Step 4: Configure Your Project

Edit `bcce.config.yaml`:

```yaml
version: "1.0"
name: "my-claude-project"
description: "My first BCCE project"

# AWS Configuration
aws:
  region: "us-east-1"
  profile: "default"  # Optional: use specific AWS profile

# Claude Configuration  
claude:
  model: "claude-3-sonnet-20240229"
  max_tokens: 4096
  temperature: 0.1

# Environment Configuration
environments:
  dev:
    enabled: true
  staging:
    enabled: true
  prod:
    enabled: false  # Enable when ready for production
```

## Step 5: Test Your Configuration

```bash
# Validate your configuration
bcce workflow validate workflows/example.yml

# Run a simple workflow
bcce workflow run workflows/example.yml --dry-run
```

## Step 6: Deploy to AWS Bedrock

```bash
# Deploy to development environment
bcce deploy --environment dev

# Check deployment status
bcce doctor --environment dev
```

## 🎉 You're Ready!

Your BCCE project is now set up and deployed! Here's what you can do next:

### Explore Available Commands

```bash
# List all commands
bcce --help

# Get help for specific command
bcce deploy --help
bcce workflow --help
```

### Create Your First Workflow

Edit `workflows/example.yml`:

```yaml
version: "1.0"
name: "code-reviewer"
description: "Automated code review workflow"

steps:
  - name: "analyze-code"
    type: "agent"
    agent:
      role: "senior-engineer"
      task: "Review the provided code for best practices, security issues, and potential improvements"
      context:
        - "Focus on TypeScript/JavaScript best practices"
        - "Check for security vulnerabilities"
        - "Suggest performance improvements"
    
  - name: "generate-summary"
    type: "agent" 
    agent:
      role: "technical-writer"
      task: "Create a concise summary of the code review findings"
      context:
        - "Use previous step analysis: {{steps.analyze-code.output}}"
        - "Format as markdown with clear action items"
```

### Run Your Workflow

```bash
# Run the workflow
bcce workflow run workflows/example.yml --input "$(cat src/myfile.ts)"

# Run with specific parameters
bcce workflow run workflows/example.yml \
  --param "language=typescript" \
  --param "severity=high"
```

## Next Steps

### 📚 Learn More
- [Architecture Overview](./architecture.md)
- [Workflow Guide](./workflows/README.md) 
- [Enterprise Setup](./enterprise/README.md)
- [Security Best Practices](./security/README.md)

### 🛠️ Common Use Cases
- [Code Review Automation](./examples/code-review.md)
- [Documentation Generation](./examples/docs-generation.md)
- [Bug Triage](./examples/bug-triage.md)
- [Test Generation](./examples/test-generation.md)

### 🚀 Advanced Features
- [Multi-Environment Deployment](./enterprise/multi-env.md)
- [Custom Policies](./security/custom-policies.md)
- [Monitoring Setup](./monitoring/README.md)
- [CI/CD Integration](./development/cicd.md)

## Troubleshooting

### Common Issues

**Issue**: `bcce: command not found`
```bash
# Solution: Ensure bcce is in your PATH
echo 'export PATH="$PATH:/usr/local/bin"' >> ~/.bashrc
source ~/.bashrc
```

**Issue**: AWS credentials not found
```bash
# Solution: Configure AWS CLI
aws configure
# Or use environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1
```

**Issue**: Permission denied errors
```bash
# Solution: Check IAM permissions
bcce policy generate --output my-policy.json
# Apply the policy to your AWS user/role
```

### Getting Help

- 📖 [Full Documentation](./README.md)
- 🐛 [Report Issues](https://github.com/NSvoltage/BCCE-dev/issues)
- 💬 [Community Discussions](https://github.com/NSvoltage/BCCE-dev/discussions)
- 📧 [Enterprise Support](mailto:enterprise@bcce.dev)

---

**Ready for production?** Check out our [Enterprise Setup Guide](./enterprise/README.md) for production-grade deployments with advanced security, monitoring, and scaling features.