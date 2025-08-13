# BCCE v1 Delivery Plan

## Role & North Star
Senior engineer delivering BCCE v1 (Bedrock Claude Code Enablement Kit)
**North Star:** Ship the smallest correct increments with tests and docs. Keep it boring, secure, and cross-platform.

## Working Agreement
- Always propose a PLAN (bullets + files to touch + tests) before any change
- Small diffs (≤ ~200 LOC) and one commit per task (produce a patch, not git commit)
- Ask before running commands. Prefer dry-runs.
- Never run destructive ops or change OS/global config
- Two-phase edits by default: generate diff → run tests → apply only with explicit approval
- Keep macOS/Linux/Windows support
- Keep security: redact secrets, least privilege, no shell unless explicitly allowed

## Allowed Commands
✅ npm, pnpm, node, go, go test, golangci-lint, terraform, tflint, dot (Graphviz), git status, git diff
🟨 Ask first: bash, network calls beyond package managers, git commit
❌ Never: destructive filesystem ops, editing OS/global config, printing secrets

## Repo Structure
Monorepo with:
- `/cli` (TypeScript CLI)
- `/go-tools` (Go helpers) 
- `/workflows` (schema + starters)
- `/iac/terraform` (placeholders)
- `/docs`
- CI in `.github/workflows/ci.yml`

CLI name: `bcce` (built as single-file binaries)
Priority: Identity Center path; Cognito/OIDC is optional

## Milestone Plan (8 Steps, ≤200 LOC each)

### Step 1: Foundation & Doctor Core
- Implement cross-platform doctor command with basic checks
- Files: `cli/src/commands/doctor.ts`, `go-tools/doctor-probes/`
- Tests: Unit tests for missing env/tools scenarios

### Step 2: Workflow Schema Validation  
- JSON Schema validation for workflow files
- Files: `cli/src/commands/workflow.ts`, schema validation logic
- Tests: Golden test fixtures for good/bad workflows

### Step 3: Core Runner + Artifacts
- Serial workflow execution with artifact storage
- Files: `cli/src/runner/`, artifact management
- Tests: Run/resume with fake workflows

### Step 4: Agent Step Integration
- Claude Code subprocess integration with budgets
- Files: Agent step handler, transcript capture
- Tests: Budget enforcement, diff capture, redaction

### Step 5: Two-Phase Apply Gate
- Explicit approval gate for diff application
- Files: Apply diff logic, approval checks
- Tests: Gated vs denied apply scenarios

### Step 6: Starter Workflows
- End-to-end workflows for common use cases
- Files: `workflows/starters/*.yml`, prompts
- Tests: Schema validation, basic execution

### Step 7: Identity Center Integration
- SSO profile detection and guidance
- Files: Doctor enhancements, SSO checks
- Tests: Profile detection logic

### Step 8: Production Readiness
- Bedrock probes, packaging, comprehensive docs
- Files: Enhanced doctor, build scripts, docs
- Tests: Integration scenarios

## Backlog Status
- [ ] Issue 1 — Doctor MVP (cross-platform, fail-closed)
- [ ] Issue 2 — Workflow JSON Schema validation
- [ ] Issue 3 — Runner core + artifacts + resume  
- [ ] Issue 4 — Agent step with mandatory budgets
- [ ] Issue 5 — apply_diff with explicit gate
- [ ] Issue 6 — Starter workflows (2) wired end-to-end
- [ ] Issue 7 — Identity Center "quick check" in doctor
- [ ] Issue 8 — Bedrock reachability & model/profile access probe
- [ ] Issue 9 — Guardrails attachment check + example
- [ ] Issue 10 — PrivateLink toggle checks (DNS only)
- [ ] Issue 11 — Packaging, signing, SBOM pipeline stub
- [ ] Issue 12 — Docs: Quickstart + Top 15 fixes

## Definition of Done (Every PR)
- [ ] Tests added/updated and green
- [ ] `npm run build && npm test` (CLI)
- [ ] `go test ./...` (tools)  
- [ ] If Terraform touched: `terraform validate && tflint`
- [ ] Docs updated (dev/admin/troubleshooting)
- [ ] Security: no secrets, budgets enforced, safe defaults
- [ ] One Conventional Commit patch; ≤ ~200 LOC unless justified

## High-Leverage Commands
- `npm run build` - Build CLI
- `npm test` - Run CLI tests
- `go test ./...` - Run Go tools tests
- `bcce doctor` - Environment validation
- `bcce workflow validate <file>` - Workflow validation
- `bcce workflow run <file>` - Execute workflow
- `bcce workflow resume <run_id> --from <step>` - Resume workflow

## Security Principles
- Workflow > chat; serial steps; two-phase apply by default
- Tool allowlists; Bash disabled; budgets mandatory  
- Identity Center first; Inference Profiles preferred
- Guardrails on in pilots; artifacts local; S3+KMS optional
- CloudWatch/CloudTrail only by default; OTLP later if demanded

## Quick Prompts for Reuse
- "Smallest next change" - Propose minimal change for issue
- "Patch packaging" - Produce diff + tests + commit message
- "Doctor remediation quality" - Copy-paste fix commands
- "Docs edit" - Update troubleshooting docs with new checks