/**
 * Jest Test Setup
 * Global test configuration and utilities
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Setup test environment
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCOUNT_ID = '123456789012';
  
  // Ensure test directories exist
  const testDirs = [
    path.join(__dirname, 'fixtures'),
    path.join(__dirname, '../.bcce_runs'),
    path.join(__dirname, '../.bcce_test_data')
  ];
  
  testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

// Clean up after tests
afterAll(() => {
  // Clean up test directories
  const testDirs = [
    path.join(__dirname, '../.bcce_test_data')
  ];
  
  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};