SHELL := /bin/bash
.PHONY: setup build test lint package sbom clean doctor

# Setup development environment
setup:
	@echo "🔧 Setting up BCCE development environment..."
	npm --prefix cli install
	@echo "📦 Installing Go dependencies..."
	cd go-tools/credproc && go mod tidy
	cd go-tools/doctor-probes && go mod tidy
	@echo "✅ Setup complete"

# Build all components
build: build-cli build-go

build-cli:
	@echo "🏗️  Building CLI..."
	npm --prefix cli run build

build-go:
	@echo "🏗️  Building Go tools..."
	cd go-tools/credproc && GOOS=darwin GOARCH=amd64 go build -o bin/credproc-darwin-amd64 .
	cd go-tools/credproc && GOOS=linux GOARCH=amd64 go build -o bin/credproc-linux-amd64 .  
	cd go-tools/credproc && GOOS=windows GOARCH=amd64 go build -o bin/credproc-windows-amd64.exe .
	cd go-tools/doctor-probes && GOOS=darwin GOARCH=amd64 go build -o bin/doctor-darwin-amd64 .
	cd go-tools/doctor-probes && GOOS=linux GOARCH=amd64 go build -o bin/doctor-linux-amd64 .
	cd go-tools/doctor-probes && GOOS=windows GOARCH=amd64 go build -o bin/doctor-windows-amd64.exe .

# Run tests
test: test-cli test-go

test-cli:
	@echo "🧪 Running CLI tests..."
	npm --prefix cli test --silent

test-go:
	@echo "🧪 Running Go tests..."
	cd go-tools/credproc && go test ./...
	cd go-tools/doctor-probes && go test ./...

# Lint code
lint: lint-cli lint-go lint-terraform

lint-cli:
	@echo "🔍 Linting CLI..."
	npm --prefix cli run lint
	npm --prefix cli run typecheck

lint-go:
	@echo "🔍 Linting Go code..."
	cd go-tools/credproc && go fmt ./... && go vet ./...
	cd go-tools/doctor-probes && go fmt ./... && go vet ./...

lint-terraform:
	@echo "🔍 Linting Terraform..."
	@for dir in iac/terraform/*/; do \
		if [ -f "$$dir/main.tf" ]; then \
			echo "Validating $$dir"; \
			terraform -chdir="$$dir" fmt -check=true -diff=true || true; \
			terraform -chdir="$$dir" validate || true; \
		fi \
	done

# Package binaries
package:
	@echo "📦 Packaging BCCE..."
	npm --prefix cli run package

# Generate SBOM (Software Bill of Materials)
sbom:
	@echo "📋 Generating SBOM..."
	@echo "SBOM generation placeholder - integrate with syft/trivy/etc."
	@echo "CLI dependencies:" 
	@npm --prefix cli list --production --json | jq -r '.dependencies | keys[]' || echo "npm list failed"
	@echo "Go modules:"
	@cd go-tools/credproc && go list -m all
	@cd go-tools/doctor-probes && go list -m all

# Clean build artifacts  
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf cli/dist/
	rm -rf go-tools/*/bin/
	rm -rf .bcce_runs/
	@echo "✅ Clean complete"

# Run BCCE doctor
doctor: build-cli
	@echo "🩺 Running BCCE health check..."
	node cli/dist/bcce.js doctor

# Development helpers
dev:
	@echo "🚀 Starting development mode..."
	npm --prefix cli run dev

validate-workflows:
	@echo "✅ Validating workflow schemas..."
	@if [ -z "$$BEDROCK_MODEL_ID" ]; then \
		echo "❌ BEDROCK_MODEL_ID environment variable required"; \
		echo "   Discover available models: ./cli/dist/bcce models list"; \
		echo "   Get recommendation: ./cli/dist/bcce models recommend --use-case coding"; \
		echo "   Then set: export BEDROCK_MODEL_ID='<model-id-from-above>'"; \
		exit 1; \
	fi
	@for workflow in workflows/starters/*.yml; do \
		echo "Validating $$workflow"; \
		./cli/dist/bcce workflow validate "$$workflow" || exit 1; \
	done

# Install locally (for testing)
install-local: build
	@echo "📦 Installing BCCE locally..."
	npm --prefix cli link
	@echo "✅ BCCE installed. Try: bcce --help"

# Show help
help:
	@echo "BCCE Development Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  setup              - Set up development environment" 
	@echo "  build              - Build all components"
	@echo "  test               - Run all tests"
	@echo "  lint               - Lint all code"
	@echo "  package            - Package binaries"
	@echo "  sbom               - Generate SBOM"
	@echo "  clean              - Clean build artifacts"
	@echo "  doctor             - Run BCCE health check"
	@echo "  validate-workflows - Validate all workflow files"
	@echo "  install-local      - Install for local testing"
	@echo "  help               - Show this help"