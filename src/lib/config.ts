import fs from 'node:fs';
import path from 'node:path';

export type AuthTrack = 'identity-center' | 'cognito-oidc';

export interface BcceConfig {
  version: string;
  auth: AuthTrack;
  regions: string[];
  guardrails: boolean;
  privatelink: boolean;
  metadata: {
    created: string;
    updated: string;
  };
  // Optional deployment-specific settings
  terraform_backend?: {
    bucket?: string;
    region?: string;
    key?: string;
  };
  guardrails_arns?: string[];
  inference_profiles?: string[];
}

const CONFIG_PATH = path.resolve('.bcce.config.json');

export function loadConfig(): BcceConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found: ${CONFIG_PATH}. Run 'bcce init' first.`);
  }
  
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content) as BcceConfig;
    
    // Validate required fields
    if (!config.version || !config.auth || !Array.isArray(config.regions)) {
      throw new Error('Invalid config format');
    }
    
    return config;
  } catch (error: any) {
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

export function saveConfig(cfg: Partial<BcceConfig>): string {
  const timestamp = new Date().toISOString();
  
  let existingConfig: Partial<BcceConfig> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
      // Ignore existing config if corrupted
    }
  }
  
  const config: BcceConfig = {
    version: '0.1.0',
    auth: 'identity-center',
    regions: ['us-east-1'],
    guardrails: false,
    privatelink: false,
    metadata: {
      created: existingConfig.metadata?.created || timestamp,
      updated: timestamp,
    },
    ...existingConfig,
    ...cfg,
  };
  
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return CONFIG_PATH;
}

export function validateConfig(config: any): config is BcceConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.version === 'string' &&
    ['identity-center', 'cognito-oidc'].includes(config.auth) &&
    Array.isArray(config.regions) &&
    config.regions.every((r: any) => typeof r === 'string') &&
    typeof config.guardrails === 'boolean' &&
    typeof config.privatelink === 'boolean'
  );
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}