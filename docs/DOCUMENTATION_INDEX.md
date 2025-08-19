# BCCE Documentation Index

## For Different Audiences

### For Claude Code Instances (AI Systems)
**Start Here**: [CLAUDE_CONTEXT.md](CLAUDE_CONTEXT.md)
- Understand your role in BCCE workflows
- Learn about policies and constraints
- See expected behaviors and outputs

**Then Read**: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- Understand the complete system architecture
- Learn how BCCE orchestrates your execution
- See the problem BCCE solves

### For Developers Using BCCE
**Start Here**: [README.md](README.md)
- Quick introduction and setup
- Basic usage examples
- Key benefits

**Then Read**: [QUICKSTART.md](QUICKSTART.md)
- Detailed setup instructions
- First workflow execution
- Common workflows

**Deep Dive**: [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md)
- Practical examples
- Advanced features
- Best practices

### For Platform Engineers / DevOps
**Start Here**: [AWS_INTEGRATION.md](AWS_INTEGRATION.md)
- AWS service dependencies
- IAM permissions
- Network architecture
- Cost management

**Then Read**: [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)
- System architecture
- Component design
- Security implementation

**Operations**: [docs/troubleshooting/README.md](docs/troubleshooting/README.md)
- Common issues
- Debugging steps
- Performance tuning

### For Architects / Technical Leaders
**Start Here**: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- Executive summary
- Problem/solution fit
- Architecture layers
- Design principles

**Then Read**: [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)
- Implementation details
- Design patterns
- Security architecture
- Future enhancements

**Strategic**: [docs/EXTENSIBILITY_ARCHITECTURE.md](docs/EXTENSIBILITY_ARCHITECTURE.md)
- Plugin system
- Custom step types
- Integration points

## Documentation Map

```
Core Understanding
├── PROJECT_OVERVIEW.md          # Complete system context
├── README.md                    # Quick introduction
└── CLAUDE_CONTEXT.md           # For AI systems

Getting Started
├── QUICKSTART.md               # Setup and first run
├── docs/USAGE_GUIDE.md         # Practical examples
└── demo-workflow.yml           # Example workflow

Technical Details
├── TECHNICAL_DESIGN.md         # System architecture
├── AWS_INTEGRATION.md          # AWS services guide
└── docs/workflow-schema.md     # YAML schema reference

Architecture Docs
├── docs/ARCHITECTURE_OVERVIEW.md      # High-level architecture
├── docs/EXTENSIBILITY_ARCHITECTURE.md # Extension points
├── docs/STEP_TYPE_SYSTEM.md          # Step type details
└── docs/agent-policies.md            # Policy system

Operations
├── docs/troubleshooting/README.md    # Troubleshooting guide
├── docs/operations/monitoring.md     # Monitoring setup
└── docs/security/threat-model.md     # Security analysis

Development
├── CONTRIBUTING.md             # Contribution guide
├── CLAUDE.md                  # Development notes
└── docs/dev/README.md         # Developer resources
```

## Key Concepts to Understand

### 1. The Three-Layer Model
```
Orchestration Layer (BCCE)
     ↓
Execution Layer (Claude Code CLI)
     ↓
Model Layer (AWS Bedrock)
```

### 2. Workflow Philosophy
- **Workflows > Commands**: Structure over chaos
- **Policies > Trust**: Explicit constraints over implicit trust
- **Artifacts > Ephemeral**: Permanent records over temporary outputs

### 3. Security Model
- **Defense in Depth**: Multiple security layers
- **Least Privilege**: Minimal necessary permissions
- **Audit Everything**: Complete transcript capture

### 4. Integration Points
- **Claude Code CLI**: Via subprocess with environment variables
- **AWS Bedrock**: Via AWS SDK with IAM authentication
- **File System**: Via policy-controlled access

## Quick Reference

### Essential Commands
```bash
# Check setup
bcce doctor

# Run workflow
bcce workflow run <workflow.yml>

# Resume failed workflow
bcce workflow resume <run-id> --from <step-id>

# Validate workflow
bcce workflow validate <workflow.yml>
```

### Essential Environment Variables
```bash
export AWS_REGION=us-east-1
export CLAUDE_CODE_USE_BEDROCK=1
export BEDROCK_MODEL_ID="us.anthropic.claude-3-5-sonnet-20250219-v1:0"
```

### Essential Policies
```yaml
policy:
  timeout_seconds: 300
  max_files: 30
  max_edits: 5
  allowed_paths: ["src/**", "test/**"]
  cmd_allowlist: ["npm", "git"]
```

## Understanding BCCE's Value Proposition

### Without BCCE
- Developers run Claude Code manually
- No standardization across team
- No security controls
- No audit trail
- No reproducibility

### With BCCE
- Structured workflows
- Team standardization
- Policy enforcement
- Complete artifacts
- Resume on failure

## Core Design Decisions

### Why Workflows?
- Reproducibility across team
- Version control for AI usage
- Policy enforcement points
- Audit trail requirements

### Why Subprocess Architecture?
- Leverage existing Claude Code CLI
- No need to reimplement Claude client
- Clear separation of concerns
- Easy to update Claude Code independently

### Why Local Artifacts?
- No external dependencies
- Fast access
- Privacy by default
- Simple disaster recovery

### Why YAML?
- Human readable
- Version control friendly
- Industry standard
- Schema validation

## FAQ for New Users

**Q: Is BCCE a replacement for Claude Code CLI?**
A: No, BCCE orchestrates Claude Code CLI with policies and workflows.

**Q: Can I use BCCE with the Anthropic API directly?**
A: No, BCCE is specifically designed for AWS Bedrock integration.

**Q: Are workflows required or can I run ad-hoc commands?**
A: Workflows are required - this is by design for governance.

**Q: Can multiple steps run in parallel?**
A: Currently no, steps run serially. Parallel execution is planned.

**Q: Where are artifacts stored?**
A: Locally in `.bcce_runs/` directory. S3 storage is planned.

**Q: Can I create custom step types?**
A: Not yet, but the plugin system is in development.

**Q: How do I handle secrets?**
A: Use AWS Secrets Manager or environment variables, never in workflows.

**Q: Can I use models other than Claude?**
A: Currently Claude-only via Bedrock. Multi-model support planned.

## Contributing to Documentation

When adding new documentation:
1. Update this index
2. Follow existing structure
3. Include examples
4. Cross-reference related docs
5. Test all code examples

## Support and Resources

- **GitHub Issues**: Bug reports and features
- **Documentation**: This repository
- **AWS Bedrock Docs**: https://docs.aws.amazon.com/bedrock/
- **Claude Code Docs**: https://docs.anthropic.com/claude-code/

---

*Last Updated: August 2025*
*Version: 1.0.0*