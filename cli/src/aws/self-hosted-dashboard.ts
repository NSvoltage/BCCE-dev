/**
 * Self-Hosted Analytics Dashboard
 * Open-source, procurement-friendly alternative to QuickSight
 * Supports Grafana, Metabase, and Apache Superset
 */

import { CloudFormationClient, CreateStackCommand, UpdateStackCommand } from '@aws-sdk/client-cloudformation';
import { ECSClient, CreateServiceCommand, CreateClusterCommand } from '@aws-sdk/client-ecs';
import { EC2Client, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2';
import { RDSClient, CreateDBInstanceCommand } from '@aws-sdk/client-rds';

export interface SelfHostedDashboardConfig {
  platform: 'grafana' | 'metabase' | 'superset';
  deployment: 'docker' | 'kubernetes' | 'ecs' | 'ec2';
  database: 'postgresql' | 'mysql' | 'sqlite';
  region: string;
  organizationId: string;
  authentication: {
    enableSSO: boolean;
    oidcProvider?: string;
    adminUsers: string[];
  };
  networking: {
    vpcId?: string;
    subnetIds?: string[];
    enableHTTPS: boolean;
    customDomain?: string;
  };
  scaling: {
    minInstances: number;
    maxInstances: number;
    targetCPU: number;
  };
}

export interface DashboardDeploymentResult {
  success: boolean;
  dashboardUrl?: string;
  adminCredentials?: {
    username: string;
    password: string;
  };
  databaseEndpoint?: string;
  errors?: string[];
}

export class SelfHostedDashboardManager {
  private cloudFormation: CloudFormationClient;
  private ecs: ECSClient;
  private ec2: EC2Client;
  private rds: RDSClient;
  private config: SelfHostedDashboardConfig;

  constructor(config: SelfHostedDashboardConfig) {
    this.config = config;
    const awsConfig = { region: config.region };
    
    this.cloudFormation = new CloudFormationClient(awsConfig);
    this.ecs = new ECSClient(awsConfig);
    this.ec2 = new EC2Client(awsConfig);
    this.rds = new RDSClient(awsConfig);
  }

  /**
   * Deploy self-hosted analytics dashboard
   */
  async deployDashboard(): Promise<DashboardDeploymentResult> {
    console.log(`🚀 Deploying ${this.config.platform} dashboard (${this.config.deployment})...`);

    try {
      // 1. Deploy database if needed
      let databaseEndpoint: string | undefined;
      if (this.config.database !== 'sqlite') {
        databaseEndpoint = await this.deployDatabase();
      }

      // 2. Deploy dashboard application
      const dashboardUrl = await this.deployApplication(databaseEndpoint);

      // 3. Configure initial admin user
      const adminCredentials = await this.setupInitialAdmin();

      // 4. Configure data sources
      await this.configureDataSources();

      // 5. Import default dashboards
      await this.importDefaultDashboards();

      return {
        success: true,
        dashboardUrl,
        adminCredentials,
        databaseEndpoint
      };

    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Deployment failed']
      };
    }
  }

  /**
   * Deploy database for dashboard metadata
   */
  private async deployDatabase(): Promise<string> {
    console.log(`📄 Deploying ${this.config.database} database...`);

    const dbInstanceId = `bcce-analytics-db-${this.config.organizationId}`;
    
    try {
      const result = await this.rds.send(new CreateDBInstanceCommand({
        DBInstanceIdentifier: dbInstanceId,
        DBInstanceClass: 'db.t3.micro',
        Engine: this.config.database === 'postgresql' ? 'postgres' : 'mysql',
        MasterUsername: 'bcce_admin',
        MasterUserPassword: this.generatePassword(),
        AllocatedStorage: 20,
        VpcSecurityGroupIds: this.config.networking.subnetIds ? 
          [await this.createDatabaseSecurityGroup()] : undefined,
        DBSubnetGroupName: this.config.networking.subnetIds ? 
          await this.createDBSubnetGroup() : undefined,
        BackupRetentionPeriod: 7,
        StorageEncrypted: true,
        DeletionProtection: true,
        Tags: [
          { Key: 'BCCE:Component', Value: 'Analytics' },
          { Key: 'BCCE:Environment', Value: 'production' }
        ]
      }));

      // Wait for database to be available
      await this.waitForDatabase(dbInstanceId);

      return result.DBInstance?.Endpoint?.Address || '';
    } catch (error) {
      throw new Error(`Database deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deploy dashboard application based on platform
   */
  private async deployApplication(databaseEndpoint?: string): Promise<string> {
    console.log(`🎨 Deploying ${this.config.platform} application...`);

    switch (this.config.deployment) {
      case 'ecs':
        return await this.deployECSService(databaseEndpoint);
      case 'ec2':
        return await this.deployEC2Instance(databaseEndpoint);
      case 'kubernetes':
        return await this.deployKubernetes(databaseEndpoint);
      case 'docker':
        return await this.deployDockerCompose(databaseEndpoint);
      default:
        throw new Error(`Unsupported deployment type: ${this.config.deployment}`);
    }
  }

  /**
   * Deploy using ECS Fargate
   */
  private async deployECSService(databaseEndpoint?: string): Promise<string> {
    const clusterName = `bcce-analytics-${this.config.organizationId}`;
    const serviceName = `${this.config.platform}-service`;

    // Create ECS cluster
    await this.ecs.send(new CreateClusterCommand({
      clusterName,
      capacityProviders: ['FARGATE'],
      tags: [
        { key: 'BCCE:Component', value: 'Analytics' }
      ]
    }));

    // Create task definition
    const taskDefinition = this.generateTaskDefinition(databaseEndpoint);
    
    // Create service
    await this.ecs.send(new CreateServiceCommand({
      cluster: clusterName,
      serviceName,
      taskDefinition: taskDefinition.family,
      desiredCount: this.config.scaling.minInstances,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: this.config.networking.subnetIds,
          securityGroups: [await this.createApplicationSecurityGroup()],
          assignPublicIp: 'ENABLED'
        }
      }
    }));

    // Return service endpoint
    return `http://${clusterName}.${this.config.region}.elb.amazonaws.com`;
  }

  /**
   * Generate CloudFormation template for complete infrastructure
   */
  generateCloudFormationTemplate(): string {
    const template = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: `BCCE Self-Hosted Analytics Dashboard - ${this.config.platform}`,
      
      Parameters: {
        Platform: {
          Type: 'String',
          Default: this.config.platform,
          AllowedValues: ['grafana', 'metabase', 'superset']
        },
        InstanceType: {
          Type: 'String',
          Default: 't3.medium',
          Description: 'EC2 instance type for dashboard'
        }
      },

      Resources: {
        // VPC and Networking (if not provided)
        ...(this.config.networking.vpcId ? {} : this.generateNetworkingResources()),

        // Database
        ...(this.config.database === 'sqlite' ? {} : this.generateDatabaseResources()),

        // Application Infrastructure
        ...this.generateApplicationResources(),

        // Load Balancer
        ApplicationLoadBalancer: {
          Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
          Properties: {
            Name: `bcce-${this.config.platform}-alb`,
            Scheme: 'internet-facing',
            Type: 'application',
            Subnets: this.config.networking.subnetIds || [
              { Ref: 'PublicSubnet1' },
              { Ref: 'PublicSubnet2' }
            ],
            SecurityGroups: [{ Ref: 'LoadBalancerSecurityGroup' }]
          }
        },

        // Target Group
        ApplicationTargetGroup: {
          Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
          Properties: {
            Name: `bcce-${this.config.platform}-tg`,
            Port: this.getPlatformPort(),
            Protocol: 'HTTP',
            VpcId: this.config.networking.vpcId || { Ref: 'VPC' },
            HealthCheckPath: this.getPlatformHealthCheck(),
            HealthCheckProtocol: 'HTTP'
          }
        },

        // Listener
        ApplicationListener: {
          Type: 'AWS::ElasticLoadBalancingV2::Listener',
          Properties: {
            DefaultActions: [{
              Type: 'forward',
              TargetGroupArn: { Ref: 'ApplicationTargetGroup' }
            }],
            LoadBalancerArn: { Ref: 'ApplicationLoadBalancer' },
            Port: this.config.networking.enableHTTPS ? 443 : 80,
            Protocol: this.config.networking.enableHTTPS ? 'HTTPS' : 'HTTP',
            ...(this.config.networking.enableHTTPS ? {
              Certificates: [{ CertificateArn: 'arn:aws:acm:region:account:certificate/certificate-id' }]
            } : {})
          }
        }
      },

      Outputs: {
        DashboardURL: {
          Description: 'URL for the analytics dashboard',
          Value: this.config.networking.customDomain 
            ? `https://${this.config.networking.customDomain}`
            : { 'Fn::Sub': `http://\${ApplicationLoadBalancer.DNSName}` },
          Export: { Name: `${this.config.organizationId}-DashboardURL` }
        },
        DatabaseEndpoint: this.config.database !== 'sqlite' ? {
          Description: 'RDS database endpoint',
          Value: { 'Fn::GetAtt': ['Database', 'Endpoint.Address'] },
          Export: { Name: `${this.config.organizationId}-DatabaseEndpoint` }
        } : undefined
      }
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * Generate platform-specific Docker configuration
   */
  generateDockerCompose(databaseEndpoint?: string): string {
    const configs = {
      grafana: `
version: '3.8'
services:
  grafana:
    image: grafana/grafana:latest
    container_name: bcce-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD}
      - GF_AUTH_GENERIC_OAUTH_ENABLED=true
      - GF_AUTH_GENERIC_OAUTH_CLIENT_ID=\${OAUTH_CLIENT_ID}
      - GF_DATABASE_TYPE=postgres
      - GF_DATABASE_HOST=${databaseEndpoint}:5432
      - GF_DATABASE_NAME=grafana
      - GF_DATABASE_USER=grafana
      - GF_DATABASE_PASSWORD=\${DB_PASSWORD}
    volumes:
      - grafana-storage:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    restart: unless-stopped
    
volumes:
  grafana-storage:
`,
      metabase: `
version: '3.8'
services:
  metabase:
    image: metabase/metabase:latest
    container_name: bcce-metabase
    ports:
      - "3000:3000"
    environment:
      - MB_DB_TYPE=postgres
      - MB_DB_HOST=${databaseEndpoint}
      - MB_DB_PORT=5432
      - MB_DB_DBNAME=metabase
      - MB_DB_USER=metabase
      - MB_DB_PASS=\${DB_PASSWORD}
      - MB_ENCRYPTION_SECRET_KEY=\${ENCRYPTION_KEY}
    volumes:
      - metabase-data:/metabase-data
    restart: unless-stopped
    
volumes:
  metabase-data:
`,
      superset: `
version: '3.8'
services:
  superset:
    image: apache/superset:latest
    container_name: bcce-superset
    ports:
      - "8088:8088"
    environment:
      - SUPERSET_CONFIG_PATH=/app/superset_config.py
      - DATABASE_URL=postgresql://superset:\${DB_PASSWORD}@${databaseEndpoint}:5432/superset
    volumes:
      - ./superset/superset_config.py:/app/superset_config.py
      - superset-data:/app/superset_home
    restart: unless-stopped
    
volumes:
  superset-data:
`
    };

    return configs[this.config.platform];
  }

  /**
   * Generate Kubernetes manifests
   */
  generateKubernetesManifests(): Record<string, string> {
    const namespace = `bcce-analytics`;
    
    return {
      namespace: `
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`,
      deployment: `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${this.config.platform}
  namespace: ${namespace}
spec:
  replicas: ${this.config.scaling.minInstances}
  selector:
    matchLabels:
      app: ${this.config.platform}
  template:
    metadata:
      labels:
        app: ${this.config.platform}
    spec:
      containers:
      - name: ${this.config.platform}
        image: ${this.getPlatformImage()}
        ports:
        - containerPort: ${this.getPlatformPort()}
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-credentials
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
`,
      service: `
apiVersion: v1
kind: Service
metadata:
  name: ${this.config.platform}-service
  namespace: ${namespace}
spec:
  selector:
    app: ${this.config.platform}
  ports:
  - port: 80
    targetPort: ${this.getPlatformPort()}
  type: LoadBalancer
`,
      ingress: `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${this.config.platform}-ingress
  namespace: ${namespace}
  annotations:
    kubernetes.io/ingress.class: aws-load-balancer-controller
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
  - host: ${this.config.networking.customDomain || `${this.config.platform}.${this.config.organizationId}.com`}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${this.config.platform}-service
            port:
              number: 80
`
    };
  }

  // Helper methods
  private generateNetworkingResources(): Record<string, any> {
    return {
      VPC: {
        Type: 'AWS::EC2::VPC',
        Properties: {
          CidrBlock: '10.0.0.0/16',
          EnableDnsHostnames: true,
          EnableDnsSupport: true
        }
      },
      PublicSubnet1: {
        Type: 'AWS::EC2::Subnet',
        Properties: {
          VpcId: { Ref: 'VPC' },
          CidrBlock: '10.0.1.0/24',
          AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] }
        }
      },
      PublicSubnet2: {
        Type: 'AWS::EC2::Subnet',
        Properties: {
          VpcId: { Ref: 'VPC' },
          CidrBlock: '10.0.2.0/24',
          AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] }
        }
      }
    };
  }

  private generateDatabaseResources(): Record<string, any> {
    return {
      Database: {
        Type: 'AWS::RDS::DBInstance',
        Properties: {
          DBInstanceIdentifier: `bcce-analytics-${this.config.organizationId}`,
          DBInstanceClass: 'db.t3.micro',
          Engine: this.config.database === 'postgresql' ? 'postgres' : 'mysql',
          MasterUsername: 'bcce_admin',
          MasterUserPassword: '{{resolve:secretsmanager:bcce/database/password}}',
          AllocatedStorage: 20,
          StorageEncrypted: true,
          BackupRetentionPeriod: 7,
          DeletionProtection: true
        }
      }
    };
  }

  private generateApplicationResources(): Record<string, any> {
    return {
      LaunchTemplate: {
        Type: 'AWS::EC2::LaunchTemplate',
        Properties: {
          LaunchTemplateName: `bcce-${this.config.platform}-lt`,
          LaunchTemplateData: {
            ImageId: '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}}',
            InstanceType: { Ref: 'InstanceType' },
            SecurityGroupIds: [{ Ref: 'ApplicationSecurityGroup' }],
            UserData: {
              'Fn::Base64': {
                'Fn::Sub': this.generateUserDataScript()
              }
            }
          }
        }
      },
      AutoScalingGroup: {
        Type: 'AWS::AutoScaling::AutoScalingGroup',
        Properties: {
          LaunchTemplate: {
            LaunchTemplateId: { Ref: 'LaunchTemplate' },
            Version: { 'Fn::GetAtt': ['LaunchTemplate', 'LatestVersionNumber'] }
          },
          MinSize: String(this.config.scaling.minInstances),
          MaxSize: String(this.config.scaling.maxInstances),
          DesiredCapacity: String(this.config.scaling.minInstances),
          TargetGroupARNs: [{ Ref: 'ApplicationTargetGroup' }],
          VPCZoneIdentifier: this.config.networking.subnetIds || [
            { Ref: 'PublicSubnet1' },
            { Ref: 'PublicSubnet2' }
          ]
        }
      }
    };
  }

  private generateUserDataScript(): string {
    const dockerInstall = `
#!/bin/bash
yum update -y
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user
`;

    const platformSetup = {
      grafana: `
docker run -d \\
  --name grafana \\
  -p 3000:3000 \\
  -e GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_PASSWORD} \\
  grafana/grafana:latest
`,
      metabase: `
docker run -d \\
  --name metabase \\
  -p 3000:3000 \\
  -e MB_DB_TYPE=h2 \\
  metabase/metabase:latest
`,
      superset: `
docker run -d \\
  --name superset \\
  -p 8088:8088 \\
  apache/superset:latest
`
    };

    return dockerInstall + platformSetup[this.config.platform];
  }

  private getPlatformPort(): number {
    const ports = { grafana: 3000, metabase: 3000, superset: 8088 };
    return ports[this.config.platform];
  }

  private getPlatformImage(): string {
    const images = {
      grafana: 'grafana/grafana:latest',
      metabase: 'metabase/metabase:latest',
      superset: 'apache/superset:latest'
    };
    return images[this.config.platform];
  }

  private getPlatformHealthCheck(): string {
    const healthChecks = { grafana: '/api/health', metabase: '/api/health', superset: '/health' };
    return healthChecks[this.config.platform];
  }

  private generatePassword(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Placeholder implementations for AWS API calls
  private async deployEC2Instance(databaseEndpoint?: string): Promise<string> { return 'ec2-endpoint'; }
  private async deployKubernetes(databaseEndpoint?: string): Promise<string> { return 'k8s-endpoint'; }
  private async deployDockerCompose(databaseEndpoint?: string): Promise<string> { return 'docker-endpoint'; }
  private async createDatabaseSecurityGroup(): Promise<string> { return 'sg-database'; }
  private async createApplicationSecurityGroup(): Promise<string> { return 'sg-app'; }
  private async createDBSubnetGroup(): Promise<string> { return 'db-subnet-group'; }
  private async waitForDatabase(dbInstanceId: string): Promise<void> { }
  private async setupInitialAdmin(): Promise<{ username: string; password: string; }> { 
    return { username: 'admin', password: 'generated-password' }; 
  }
  private async configureDataSources(): Promise<void> { }
  private async importDefaultDashboards(): Promise<void> { }
  private generateTaskDefinition(databaseEndpoint?: string): any { return { family: 'bcce-task' }; }
}