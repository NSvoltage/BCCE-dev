import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../../lib/config.js';
import path from 'node:path';

export const packageCmd = new Command('package')
  .description('Build and package credential-process installers (Cognito track only)')
  .option('--platforms <list>', 'Target platforms: darwin,linux,windows', 'darwin,linux,windows')
  .option('--output <dir>', 'Output directory for packages', 'dist')
  .action(async (opts) => {
    try {
      const config = loadConfig();
      
      if (config.auth !== 'cognito-oidc') {
        console.log('ℹ️  Packaging is only required for Cognito OIDC track');
        console.log(`   Current auth track: ${config.auth}`);
        console.log('   For Identity Center track, use AWS SSO instead');
        return;
      }

      console.log('📦 Building BCCE credential-process packages...');
      
      // Check for Go
      try {
        const goVersion = execSync('go version', { stdio: 'pipe' }).toString().trim();
        console.log(`   Go: ${goVersion}`);
      } catch (error) {
        console.error('❌ Go not found in PATH');
        console.error('   Fix: Install Go from https://golang.org');
        process.exit(1);
      }

      const goToolsDir = path.resolve('go-tools');
      const credprocDir = path.join(goToolsDir, 'credproc');
      const doctorProbesDir = path.join(goToolsDir, 'doctor-probes');

      if (!existsSync(credprocDir)) {
        console.error('❌ Credential processor source not found');
        console.error(`   Expected: ${credprocDir}`);
        process.exit(1);
      }

      const outputDir = path.resolve(opts.output);
      mkdirSync(outputDir, { recursive: true });

      const platforms = opts.platforms.split(',').map((p: string) => p.trim());
      const validPlatforms = ['darwin', 'linux', 'windows'];
      const targetPlatforms = platforms.filter((p: string) => validPlatforms.includes(p));

      if (targetPlatforms.length === 0) {
        console.error('❌ No valid platforms specified');
        console.error(`   Valid platforms: ${validPlatforms.join(', ')}`);
        process.exit(1);
      }

      console.log(`   Target platforms: ${targetPlatforms.join(', ')}`);
      console.log(`   Output directory: ${outputDir}`);

      // Build binaries for each platform
      for (const platform of targetPlatforms) {
        console.log(`\n🔨 Building for ${platform}...`);
        
        const goos = platform;
        const goarch = 'amd64';
        const ext = platform === 'windows' ? '.exe' : '';
        
        // Build credential processor
        const credprocBinary = `bcce-credproc-${platform}-${goarch}${ext}`;
        const credprocOutput = path.join(outputDir, credprocBinary);
        
        try {
          console.log(`   Building credential processor: ${credprocBinary}`);
          execSync(`go build -o "${credprocOutput}"`, {
            cwd: credprocDir,
            env: { 
              ...process.env, 
              GOOS: goos, 
              GOARCH: goarch,
              CGO_ENABLED: '0' // Static linking
            },
            stdio: ['ignore', 'pipe', 'pipe']
          });
          console.log(`   ✅ ${credprocBinary}`);
        } catch (error: any) {
          console.error(`   ❌ Failed to build credential processor for ${platform}:`);
          console.error(`   ${error.message}`);
          process.exit(1);
        }

        // Build doctor probes
        const doctorBinary = `bcce-doctor-${platform}-${goarch}${ext}`;
        const doctorOutput = path.join(outputDir, doctorBinary);
        
        try {
          console.log(`   Building doctor probes: ${doctorBinary}`);
          execSync(`go build -o "${doctorOutput}"`, {
            cwd: doctorProbesDir,
            env: { 
              ...process.env, 
              GOOS: goos, 
              GOARCH: goarch,
              CGO_ENABLED: '0'
            },
            stdio: ['ignore', 'pipe', 'pipe']
          });
          console.log(`   ✅ ${doctorBinary}`);
        } catch (error: any) {
          console.error(`   ❌ Failed to build doctor probes for ${platform}:`);
          console.error(`   ${error.message}`);
          process.exit(1);
        }
      }

      // Create installation scripts
      console.log('\n📄 Creating installation scripts...');
      
      const installScript = `#!/bin/bash
set -euo pipefail

# BCCE Credential Process Installer
# Detects platform and installs appropriate binary

PLATFORM=""
case "$(uname -s)" in
  Darwin*)  PLATFORM="darwin" ;;
  Linux*)   PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *) echo "❌ Unsupported platform: $(uname -s)"; exit 1 ;;
esac

ARCH="amd64"
EXT=""
if [ "$PLATFORM" = "windows" ]; then
  EXT=".exe"
fi

CREDPROC_BINARY="bcce-credproc-\${PLATFORM}-\${ARCH}\${EXT}"
DOCTOR_BINARY="bcce-doctor-\${PLATFORM}-\${ARCH}\${EXT}"

# Install to user's bin directory
INSTALL_DIR="$HOME/.bcce/bin"
mkdir -p "$INSTALL_DIR"

echo "🚀 Installing BCCE credential helpers..."
echo "   Platform: $PLATFORM"
echo "   Install directory: $INSTALL_DIR"

# Copy binaries
cp "$CREDPROC_BINARY" "$INSTALL_DIR/bcce-credproc\${EXT}"
cp "$DOCTOR_BINARY" "$INSTALL_DIR/bcce-doctor\${EXT}"

# Make executable (Unix only)
if [ "$PLATFORM" != "windows" ]; then
  chmod +x "$INSTALL_DIR/bcce-credproc"
  chmod +x "$INSTALL_DIR/bcce-doctor"
fi

echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Add to PATH: export PATH=\\$HOME/.bcce/bin:\\$PATH"
echo "2. Configure AWS CLI:"
echo "   aws configure set credential_process \\$HOME/.bcce/bin/bcce-credproc"
echo "3. Set environment variables:"
echo "   export COGNITO_IDENTITY_POOL_ID=<your-pool-id>"
echo "   export OIDC_ID_TOKEN=<your-id-token>"
echo "4. Test: bcce doctor"
`;

      const installPath = path.join(outputDir, 'install.sh');
      require('fs').writeFileSync(installPath, installScript);
      console.log(`   ✅ install.sh`);

      // Create README
      const readmeContent = `# BCCE Credential Process Package

This package contains the BCCE credential helpers for the Cognito OIDC authentication track.

## Contents

- \`bcce-credproc-*\`: Credential process binaries for AWS CLI integration
- \`bcce-doctor-*\`: Diagnostic utilities for connectivity testing
- \`install.sh\`: Installation script

## Installation

1. Run the installer:
   \`\`\`bash
   chmod +x install.sh
   ./install.sh
   \`\`\`

2. Add to your shell profile:
   \`\`\`bash
   echo 'export PATH=$HOME/.bcce/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   \`\`\`

3. Configure AWS CLI:
   \`\`\`bash
   aws configure set credential_process $HOME/.bcce/bin/bcce-credproc
   \`\`\`

## Environment Variables

Required for credential process:
- \`COGNITO_IDENTITY_POOL_ID\`: Your Cognito Identity Pool ID
- \`OIDC_ID_TOKEN\`: Your OIDC identity token
- \`AWS_REGION\`: Target AWS region

Optional:
- \`BCCE_ROLE_ARN\`: Specific IAM role to assume

## Usage

Test your setup:
\`\`\`bash
bcce doctor
aws sts get-caller-identity
\`\`\`

## Troubleshooting

- Ensure OIDC token is valid and not expired
- Verify Cognito Identity Pool configuration
- Check IAM role trust relationships
- Run \`bcce-doctor\` for detailed diagnostics
`;

      const readmePath = path.join(outputDir, 'README.md');
      require('fs').writeFileSync(readmePath, readmeContent);
      console.log(`   ✅ README.md`);

      console.log('\n🎉 Packaging completed successfully!');
      console.log(`   Output: ${outputDir}`);
      console.log('\n📦 Package contents:');
      
      const files = require('fs').readdirSync(outputDir);
      for (const file of files) {
        console.log(`   ${file}`);
      }

      console.log('\n📋 Distribution instructions:');
      console.log('1. Distribute the package directory to end users');
      console.log('2. Users should run: chmod +x install.sh && ./install.sh');
      console.log('3. Users need to configure OIDC environment variables');

    } catch (error: any) {
      if (error.message?.includes('Config not found')) {
        console.error('❌ No BCCE configuration found');
        console.error('   Fix: Run bcce init first');
      } else {
        console.error('❌ Packaging failed:', error.message);
      }
      process.exit(1);
    }
  });