/**
 * Global test utilities and type definitions
 */

import type { Workflow, GovernanceConfig } from '../adapters/workflow-adapter.js';

declare global {
  var testConfig: {
    tempDir: string;
    mockAws: boolean;
    verboseLogging: boolean;
  };

  var createTestWorkflow: (overrides?: Partial<Workflow>) => Workflow;
  var createTestGovernance: (overrides?: Partial<GovernanceConfig>) => GovernanceConfig;
  
  // Jest console mocks
  var console: {
    log: jest.MockedFunction<typeof console.log>;
    warn: jest.MockedFunction<typeof console.warn>;
    error: jest.MockedFunction<typeof console.error>;
    info: typeof console.info;
    debug: typeof console.debug;
  };
}

export {};