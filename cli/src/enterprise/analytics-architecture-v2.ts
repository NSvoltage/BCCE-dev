/**
 * Enterprise Analytics Architecture V2
 * Procurement-friendly, open-source first analytics stack
 * QuickSight as optional premium upgrade only
 */

import { EnterpriseAnalyticsConfig } from './analytics-architecture.js';

export interface OpenSourceAnalyticsConfig extends EnterpriseAnalyticsConfig {
  visualization: {
    primary: 'grafana' | 'metabase' | 'superset' | 'self-hosted-web';
    premium?: 'quicksight-enterprise' | 'tableau' | 'powerbi';
    features: {
      selfHosted: boolean;
      openSource: boolean;
      enterpriseSSO: boolean;
      customBranding: boolean;
    };
  };
  deployment: {
    platform: 'docker' | 'kubernetes' | 'ecs' | 'lambda';
    hosting: 'self-hosted' | 'aws-managed' | 'hybrid';
    scalability: 'single-instance' | 'clustered' | 'serverless';
  };
}

export interface ProcurementFriendlyArchitecture {
  // Core infrastructure (no additional licenses)
  coreServices: {
    storage: 'aws-s3';           // Already licensed with AWS
    compute: 'aws-lambda';       // Pay-per-use, no licenses
    database: 'aws-athena';      // Pay-per-query, no licenses
    monitoring: 'aws-cloudwatch'; // Included with AWS
  };
  
  // Open source analytics stack
  analyticsStack: {
    dashboard: 'grafana-oss' | 'metabase-oss' | 'apache-superset';
    database: 'postgresql' | 'mysql' | 'sqlite';
    search: 'opensearch' | 'elasticsearch-oss';
    caching: 'redis-oss' | 'memcached';
  };
  
  // Optional premium upgrades
  premiumUpgrades?: {
    dashboard: 'grafana-enterprise' | 'quicksight' | 'tableau';
    search: 'opensearch-managed' | 'elasticsearch-managed';
    support: 'aws-enterprise-support';
  };
}

export class OpenSourceAnalyticsArchitecture {
  
  /**
   * Create self-hosted open-source analytics configuration
   * Perfect for enterprises wanting full control and no vendor lock-in
   */
  static createSelfHostedModel(): OpenSourceAnalyticsConfig {
    return {
      deploymentModel: 'hybrid-local',
      authentication: {
        identityProvider: 'aws-sso',
        rbac: {
          roles: ['admin', 'team-lead', 'developer', 'auditor', 'executive'],
          permissions: ['view-own', 'view-team', 'view-all', 'export', 'admin'],
          dataAccess: 'team-scoped'
        },
        sessionManagement: {
          timeoutMinutes: 480,
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
            'internal': 1095,
            'confidential': 2555,
            'restricted': 2555
          },
          purgePolicy: 'automatic'
        },
        auditLogging: {
          level: 'comprehensive',
          storage: 's3-immutable',
          retentionYears: 7
        }
      },
      awsServices: {
        logIngestion: {
          service: 'cloudwatch-logs',
          configuration: {
            realTimeStreaming: false,
            automaticBatching: true,
            formatConversion: false,
            compression: 'gzip'
          }
        },
        dataStorage: {
          service: 's3',
          features: {
            intelligentTiering: true,
            lifecyclePolicies: true,
            crossRegionReplication: false,
            versioning: true
          }
        },
        analyticsEngine: {
          primary: 'athena',
          features: {
            serverlessScaling: true,
            federatedQueries: false,
            mlInsights: false
          }
        },
        visualization: {
          service: 'custom-dashboard', // No QuickSight
          features: {
            embeddedDashboards: false,
            mobileAccess: false,
            mlInsights: false,
            enterpriseSecurity: true
          }
        }
      },
      compliance: {
        standards: ['soc2'],
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
          recipients: ['compliance@company.com']
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
          pricingModel: 'usage-based', // Not used in self-hosted
          autoScaling: false,
          volumeDiscount: false
        },
        athena: {
          resultCaching: true,
          partitionProjection: true,
          queryOptimization: true
        },
        opensearch: {
          reservedInstances: false,
          autoScaling: false,
          indexOptimization: true
        }
      },
      visualization: {
        primary: 'grafana',
        features: {
          selfHosted: true,
          openSource: true,
          enterpriseSSO: true,
          customBranding: true
        }
      },
      deployment: {
        platform: 'docker',
        hosting: 'self-hosted',
        scalability: 'single-instance'
      }
    };
  }

  /**
   * Create Kubernetes-based enterprise analytics
   * For organizations with existing K8s infrastructure
   */
  static createKubernetesModel(): OpenSourceAnalyticsConfig {
    const base = this.createSelfHostedModel();
    return {
      ...base,
      deployment: {
        platform: 'kubernetes',
        hosting: 'self-hosted',
        scalability: 'clustered'
      },
      visualization: {
        primary: 'grafana',
        features: {
          selfHosted: true,
          openSource: true,
          enterpriseSSO: true,
          customBranding: true
        }
      }
    };
  }

  /**
   * Create serverless analytics configuration
   * Minimal infrastructure management with AWS Lambda
   */
  static createServerlessModel(): OpenSourceAnalyticsConfig {
    const base = this.createSelfHostedModel();
    return {
      ...base,
      deployment: {
        platform: 'lambda',
        hosting: 'aws-managed',
        scalability: 'serverless'
      },
      visualization: {
        primary: 'self-hosted-web',
        features: {
          selfHosted: true,
          openSource: true,
          enterpriseSSO: true,
          customBranding: true
        }
      }
    };
  }

  /**
   * Calculate costs for open-source analytics deployment
   * Dramatically lower than QuickSight-based solutions
   */
  static estimateOpenSourceCosts(config: OpenSourceAnalyticsConfig, userCount: number): {
    total: number;
    breakdown: Record<string, number>;
    savings: {
      vsQuickSight: number;
      vsCommercial: number;
    };
  } {
    const costs: Record<string, number> = {};

    // AWS Core Services (same regardless of visualization)
    const estimatedGB = userCount * 5; // Reduced from 10GB due to no QuickSight
    costs.s3 = estimatedGB * 0.023;
    costs.athena = userCount * 0.50; // Reduced query volume
    costs.cloudwatch = userCount * 0.25; // Basic logging

    // Open Source Analytics Stack
    if (config.deployment.hosting === 'self-hosted') {
      // EC2 instances for self-hosted Grafana/Metabase
      if (userCount <= 50) {
        costs.compute = 73; // t3.medium
      } else if (userCount <= 200) {
        costs.compute = 146; // t3.large
      } else {
        costs.compute = userCount * 0.50; // Auto-scaling group
      }
      
      // RDS for analytics database
      costs.database = userCount < 100 ? 45 : 90; // RDS PostgreSQL

    } else if (config.deployment.platform === 'lambda') {
      // Serverless costs
      costs.lambda = userCount * 0.10; // Lambda execution
      costs.apiGateway = userCount * 0.05; // API Gateway requests
      
    } else if (config.deployment.platform === 'kubernetes') {
      // EKS costs
      costs.eks = 73; // EKS cluster
      costs.nodeGroup = userCount * 0.30; // Worker nodes
    }

    // Optional OpenSearch (if enabled)
    if (config.awsServices.analyticsEngine.secondary === 'opensearch') {
      costs.opensearch = userCount < 100 ? 200 : userCount * 2;
    }

    const total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);

    // Calculate savings vs commercial solutions
    const quickSightCost = userCount * 18; // $18/user/month
    const commercialCost = userCount * 25; // Tableau/PowerBI estimate

    return {
      total,
      breakdown: costs,
      savings: {
        vsQuickSight: quickSightCost - total,
        vsCommercial: commercialCost - total
      }
    };
  }

  /**
   * Generate procurement-friendly architecture documentation
   */
  static generateProcurementReport(config: OpenSourceAnalyticsConfig, userCount: number): {
    summary: string;
    costComparison: Record<string, number>;
    riskAssessment: Record<string, string>;
    implementationTimeline: Record<string, string>;
    supportModel: Record<string, string>;
  } {
    const costs = this.estimateOpenSourceCosts(config, userCount);

    return {
      summary: `Open-source analytics solution with ${config.visualization.primary} providing enterprise governance for ${userCount} users at $${costs.total.toFixed(2)}/month vs $${(userCount * 18).toFixed(2)}/month for QuickSight.`,
      
      costComparison: {
        'BCCE Open Source': costs.total,
        'AWS QuickSight': userCount * 18,
        'Tableau': userCount * 25,
        'PowerBI': userCount * 20,
        'Monthly Savings': costs.savings.vsQuickSight
      },
      
      riskAssessment: {
        'Vendor Lock-in': 'Low - Open source components, AWS-standard services',
        'Support Risk': 'Medium - Community support for OSS, AWS support for infrastructure',
        'Security Risk': 'Low - Same AWS security model, self-managed components',
        'Scalability Risk': 'Low - Proven open source solutions',
        'Compliance Risk': 'Low - Same audit capabilities, self-controlled data'
      },
      
      implementationTimeline: {
        'Infrastructure Setup': '1-2 weeks',
        'Dashboard Development': '2-3 weeks', 
        'User Training': '1 week',
        'Production Deployment': '1 week',
        'Total Timeline': '5-7 weeks'
      },
      
      supportModel: {
        'Infrastructure': 'AWS Enterprise Support',
        'Analytics Platform': 'Internal team + community',
        'Custom Development': 'Internal or contracted development',
        'Training': 'Standard Grafana/Metabase training',
        'Escalation': 'AWS TAM for infrastructure issues'
      }
    };
  }

  /**
   * Generate upgrade path to premium solutions
   */
  static generateUpgradePath(config: OpenSourceAnalyticsConfig): {
    phase1: string;
    phase2: string;
    phase3: string;
    investmentProtection: string;
  } {
    return {
      phase1: `Start with ${config.visualization.primary} open source for immediate value and cost savings`,
      
      phase2: `Add premium features: Grafana Enterprise ($7/user/month) or Metabase Pro ($10/user/month) for advanced security and support`,
      
      phase3: `Optional migration to QuickSight Enterprise if advanced ML insights become business critical (data pipeline remains unchanged)`,
      
      investmentProtection: `All data infrastructure remains unchanged - only visualization layer changes. Zero lock-in, maximum flexibility.`
    };
  }
}