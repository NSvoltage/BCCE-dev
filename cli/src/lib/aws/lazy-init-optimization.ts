/**
 * Performance Optimization: Lazy Initialization Pattern
 * Prevents slow AWS service initialization on every CLI command
 */

export class LazyInitializer<T> {
  private instance: T | null = null;
  private initializing = false;
  private initPromise: Promise<T> | null = null;

  constructor(private factory: () => Promise<T> | T) {}

  async getInstance(): Promise<T> {
    if (this.instance) {
      return this.instance;
    }

    if (this.initializing && this.initPromise) {
      return this.initPromise;
    }

    this.initializing = true;
    this.initPromise = Promise.resolve(this.factory());
    
    try {
      this.instance = await this.initPromise;
      return this.instance;
    } finally {
      this.initializing = false;
    }
  }

  isInitialized(): boolean {
    return this.instance !== null;
  }

  reset(): void {
    this.instance = null;
    this.initializing = false;
    this.initPromise = null;
  }
}

// Global lazy initializers for AWS services
export const lazyCloudWatch = new LazyInitializer(async () => {
  const { cloudWatchIntegration } = await import('./cloudwatch-integration.js');
  cloudWatchIntegration.enableMockMode();
  return cloudWatchIntegration;
});

export const lazyEventBridge = new LazyInitializer(async () => {
  const { eventBridgeOrchestrator } = await import('./eventbridge-orchestrator.js');
  eventBridgeOrchestrator.enableMockMode();
  return eventBridgeOrchestrator;
});

export const lazyIAM = new LazyInitializer(async () => {
  const { iamIntegration } = await import('./iam-integration.js');
  iamIntegration.enableMockMode();
  return iamIntegration;
});

export const lazyS3 = new LazyInitializer(async () => {
  const { createS3Storage } = await import('./s3-storage.js');
  const storage = createS3Storage({
    bucketName: 'bcce-artifacts',
    enableVersioning: true,
    enableEncryption: true
  });
  storage.enableMockMode();
  return storage;
});