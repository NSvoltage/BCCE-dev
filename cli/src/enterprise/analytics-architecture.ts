/**
 * Enterprise Analytics Architecture for BCCE
 * Defines the AWS-native analytics deployment models and security frameworks
 */

export interface EnterpriseAnalyticsConfig {
  deploymentModel: 'centralized' | 'federated-pods' | 'hybrid-local';
  authentication: EnterpriseAuth;
  dataProtection: DataProtection;
  awsServices: AWSServiceStack;
  compliance: ComplianceFramework;
  costOptimization: CostOptimizationConfig;
}

export interface EnterpriseAuth {
  identityProvider: 'aws-sso' | 'okta' | 'azure-ad' | 'custom-saml';
  rbac: {
    roles: ('admin' | 'team-lead' | 'developer' | 'auditor' | 'executive')[];
    permissions: ('view-own' | 'view-team' | 'view-all' | 'export' | 'admin')[];
    dataAccess: 'project-scoped' | 'team-scoped' | 'org-wide';
  };
  sessionManagement: {
    timeoutMinutes: number;
    requireMFA: boolean;
    deviceTrust: boolean;
  };
}

export interface DataProtection {
  encryption: {
    atRest: 'aws-kms' | 'customer-managed';
    inTransit: 'tls-1.3';
    keyRotation: 'automatic' | 'manual';
  };
  dataClassification: {
    levels: ('public' | 'internal' | 'confidential' | 'restricted')[];
    retentionDays: Record<string, number>;
    purgePolicy: 'automatic' | 'manual-approval';
  };
  auditLogging: {
    level: 'basic' | 'detailed' | 'comprehensive';
    storage: 's3-immutable' | 'cloudtrail' | 'both';
    retentionYears: number;
  };
}

export interface AWSServiceStack {
  logIngestion: {
    service: 'kinesis-data-firehose' | 'cloudwatch-logs' | 'direct-s3';
    configuration: {
      realTimeStreaming: boolean;
      automaticBatching: boolean;
      formatConversion: boolean;
      compression: 'gzip' | 'snappy' | 'none';
    };
  };
  dataStorage: {
    service: 's3' | 's3-with-glacier';
    features: {
      intelligentTiering: boolean;
      lifecyclePolicies: boolean;
      crossRegionReplication: boolean;
      versioning: boolean;
    };
  };
  analyticsEngine: {
    primary: 'athena' | 'redshift' | 'opensearch';
    secondary?: 'opensearch' | 'elasticsearch';
    features: {
      serverlessScaling: boolean;
      federatedQueries: boolean;
      mlInsights: boolean;
    };
  };
  visualization: {
    service: 'quicksight-enterprise' | 'quicksight-standard' | 'custom-dashboard';
    features: {
      embeddedDashboards: boolean;
      mobileAccess: boolean;
      mlInsights: boolean;
      enterpriseSecurity: boolean;
    };
  };
}

export interface ComplianceFramework {
  standards: ('soc2' | 'hipaa' | 'pci-dss' | 'gdpr' | 'iso27001')[];
  controls: {
    logicalAccess: boolean;
    dataRetention: boolean;
    systemMonitoring: boolean;
    incidentResponse: boolean;
    dataEncryption: boolean;
  };
  reporting: {
    automated: boolean;
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    recipients: string[];
  };
}

export interface CostOptimizationConfig {
  s3Storage: {
    intelligentTiering: 'auto' | 'manual';
    lifecyclePolicies: {
      toIA: number; // days
      toGlacier: number; // days
      toDeepArchive: number; // days
    };
  };
  quicksight: {
    pricingModel: 'capacity' | 'usage-based';
    autoScaling: boolean;
    volumeDiscount: boolean;
  };
  athena: {
    resultCaching: boolean;
    partitionProjection: boolean;
    queryOptimization: boolean;
  };
  opensearch: {
    reservedInstances: boolean;
    autoScaling: boolean;
    indexOptimization: boolean;
  };
}

/**
 * Enterprise Analytics Architecture Factory
 */
export class EnterpriseAnalyticsArchitecture {
  
  /**
   * Create centralized enterprise analytics configuration
   * Best for: Large enterprises (1000+ developers)
   */
  static createCentralizedModel(): EnterpriseAnalyticsConfig {
    return {
      deploymentModel: 'centralized',
      authentication: {
        identityProvider: 'aws-sso',
        rbac: {
          roles: ['admin', 'team-lead', 'developer', 'auditor', 'executive'],
          permissions: ['view-own', 'view-team', 'view-all', 'export', 'admin'],
          dataAccess: 'org-wide'
        },
        sessionManagement: {
          timeoutMinutes: 480, // 8 hours
          requireMFA: true,
          deviceTrust: true
        }
      },
      dataProtection: {
        encryption: {
          atRest: 'aws-kms',
          inTransit: 'tls-1.3',
          keyRotation: 'automatic'
        },
        dataClassification: {
          levels: ['public', 'internal', 'confidential', 'restricted'],
          retentionDays: {
            'public': 365,
            'internal': 1095, // 3 years
            'confidential': 2555, // 7 years
            'restricted': 2555
          },
          purgePolicy: 'automatic'
        },
        auditLogging: {
          level: 'comprehensive',
          storage: 'both',
          retentionYears: 7
        }
      },
      awsServices: {
        logIngestion: {
          service: 'kinesis-data-firehose',
          configuration: {
            realTimeStreaming: true,
            automaticBatching: true,
            formatConversion: true,
            compression: 'gzip'
          }
        },
        dataStorage: {
          service: 's3-with-glacier',
          features: {
            intelligentTiering: true,
            lifecyclePolicies: true,
            crossRegionReplication: true,
            versioning: true
          }
        },
        analyticsEngine: {
          primary: 'athena',
          secondary: 'opensearch',
          features: {
            serverlessScaling: true,
            federatedQueries: true,
            mlInsights: true
          }
        },
        visualization: {
          service: 'quicksight-enterprise',
          features: {
            embeddedDashboards: true,
            mobileAccess: true,
            mlInsights: true,
            enterpriseSecurity: true
          }
        }
      },
      compliance: {
        standards: ['soc2', 'hipaa', 'pci-dss'],
        controls: {
          logicalAccess: true,
          dataRetention: true,
          systemMonitoring: true,
          incidentResponse: true,
          dataEncryption: true
        },
        reporting: {
          automated: true,
          frequency: 'monthly',
          recipients: ['compliance@company.com', 'ciso@company.com']
        }
      },
      costOptimization: {
        s3Storage: {
          intelligentTiering: 'auto',
          lifecyclePolicies: {
            toIA: 30,
            toGlacier: 90,
            toDeepArchive: 365
          }
        },
        quicksight: {
          pricingModel: 'capacity',
          autoScaling: true,
          volumeDiscount: true
        },
        athena: {
          resultCaching: true,
          partitionProjection: true,
          queryOptimization: true
        },
        opensearch: {
          reservedInstances: true,
          autoScaling: true,
          indexOptimization: true
        }
      }
    };
  }

  /**
   * Create federated team-based analytics configuration
   * Best for: Medium enterprises (100-1000 developers)
   */
  static createFederatedModel(): EnterpriseAnalyticsConfig {
    const base = this.createCentralizedModel();
    return {
      ...base,
      deploymentModel: 'federated-pods',
      authentication: {
        ...base.authentication,
        rbac: {
          ...base.authentication.rbac,
          dataAccess: 'team-scoped'
        }
      },
      awsServices: {
        ...base.awsServices,
        visualization: {
          service: 'quicksight-standard',
          features: {
            embeddedDashboards: true,
            mobileAccess: false,
            mlInsights: false,
            enterpriseSecurity: true
          }
        }
      },
      costOptimization: {
        ...base.costOptimization,
        quicksight: {
          pricingModel: 'usage-based',
          autoScaling: true,
          volumeDiscount: false
        }
      }
    };
  }

  /**
   * Create hybrid local-enterprise analytics configuration
   * Best for: Small-medium enterprises (10-100 developers)
   */
  static createHybridModel(): EnterpriseAnalyticsConfig {
    const base = this.createFederatedModel();
    return {
      ...base,
      deploymentModel: 'hybrid-local',
      authentication: {
        ...base.authentication,
        rbac: {
          ...base.authentication.rbac,
          dataAccess: 'project-scoped'
        },
        sessionManagement: {
          timeoutMinutes: 240, // 4 hours
          requireMFA: false,
          deviceTrust: false
        }
      },
      dataProtection: {
        ...base.dataProtection,
        auditLogging: {
          level: 'detailed',
          storage: 's3-immutable',
          retentionYears: 3
        }
      },
      awsServices: {
        ...base.awsServices,
        logIngestion: {
          service: 'cloudwatch-logs',
          configuration: {
            realTimeStreaming: false,
            automaticBatching: true,
            formatConversion: false,
            compression: 'gzip'
          }
        }
      },
      compliance: {
        standards: ['soc2'],
        controls: {
          logicalAccess: true,
          dataRetention: true,
          systemMonitoring: false,
          incidentResponse: false,
          dataEncryption: true
        },
        reporting: {
          automated: false,
          frequency: 'quarterly',
          recipients: ['it@company.com']
        }
      }
    };
  }

  /**
   * Calculate estimated monthly costs for analytics deployment
   */
  static estimateMonthlyCosts(config: EnterpriseAnalyticsConfig, userCount: number): {
    total: number;
    breakdown: Record<string, number>;
  } {
    const costs: Record<string, number> = {};

    // QuickSight costs
    if (config.awsServices.visualization.service === 'quicksight-enterprise') {
      costs.quicksight = userCount * 18; // $18/user/month for enterprise
    } else {
      costs.quicksight = userCount * 12; // $12/user/month for standard
    }

    // S3 storage (estimated based on user count)
    const estimatedGB = userCount * 10; // 10GB per user average
    costs.s3 = estimatedGB * 0.023; // $0.023/GB/month

    // Athena (estimated query costs)
    const estimatedQueries = userCount * 100; // 100 queries per user
    costs.athena = estimatedQueries * 0.005; // $5 per TB scanned

    // OpenSearch (if enabled)
    if (config.awsServices.analyticsEngine.secondary === 'opensearch') {
      costs.opensearch = userCount * 2; // Estimated based on instance size
    }

    // CloudWatch Logs
    costs.cloudwatch = userCount * 0.50; // $0.50 per GB ingested

    const total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);

    return { total, breakdown: costs };
  }

  /**
   * Validate enterprise analytics configuration
   */
  static validateConfiguration(config: EnterpriseAnalyticsConfig): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Validate compliance requirements
    if (config.compliance.standards.includes('hipaa') && !config.dataProtection.encryption.atRest) {
      errors.push('HIPAA compliance requires encryption at rest');
    }

    if (config.deploymentModel === 'centralized' && config.authentication.rbac.dataAccess !== 'org-wide') {
      warnings.push('Centralized model typically uses org-wide data access');
    }

    // Validate cost optimization
    if (!config.costOptimization.s3Storage.intelligentTiering && config.deploymentModel === 'centralized') {
      warnings.push('Consider enabling S3 Intelligent Tiering for cost optimization');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }
}