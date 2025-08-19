/**
 * Test setup and configuration for BCCE tests
 * Configures enterprise testing environment with proper validation
 */

import { jest } from '@jest/globals';

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.BEDROCK_MODEL_ID = 'claude-3-5-sonnet-test';

// Mock AWS SDK calls for unit tests
jest.mock('@aws-sdk/client-bedrock', () => ({
  BedrockClient: jest.fn(),
  ListFoundationModelsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn(),
  PutMetricDataCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test configuration
global.testConfig = {
  tempDir: '/tmp/bcce-test',
  mockAws: true,
  verboseLogging: false
};

// Clean up function for tests
global.afterEach = () => {
  // Reset environment
  delete process.env.BCCE_TEST_MODE;
  
  // Clear any test files
  const fs = require('node:fs');
  const testDirs = ['/tmp/bcce-test', '/tmp/bcce-workflows'];
  
  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
};

// Utility functions for tests
global.createTestWorkflow = (overrides = {}) => ({
  version: 1,
  workflow: 'Test Workflow',
  model: 'claude-3-5-sonnet-test',
  guardrails: ['pii-basic'],
  steps: [
    {
      id: 'test_step',
      type: 'prompt',
      prompt_file: 'test.md'
    }
  ],
  ...overrides
});

global.createTestGovernance = (overrides = {}) => ({
  policies: ['security', 'compliance'],
  approvalRequired: false,
  complianceLogging: true,
  costControls: {
    budgetLimit: 100,
    timeoutMinutes: 30
  },
  auditLevel: 'comprehensive',
  ...overrides
});

// Console override for cleaner test output
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  // Keep info and debug for important test output
  info: originalConsole.info,
  debug: originalConsole.debug
};

export {};