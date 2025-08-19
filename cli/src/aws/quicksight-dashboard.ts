/**
 * QuickSight Dashboard Automation
 * Creates and manages enterprise analytics dashboards in AWS QuickSight
 */

import {
  QuickSightClient,
  CreateDataSourceCommand,
  CreateDataSetCommand,
  CreateDashboardCommand,
  CreateAnalysisCommand,
  DescribeDashboardCommand,
  UpdateDashboardCommand,
  DeleteDashboardCommand,
  CreateTemplateCommand,
  DataSourceType,
  InputColumn,
  ColumnDataType
} from '@aws-sdk/client-quicksight';

export interface DashboardConfig {
  awsAccountId: string;
  region: string;
  organizationId: string;
  dataSourceConfig: {
    s3BucketName: string;
    athenaWorkgroup?: string;
    roleArn: string;
  };
  dashboardType: 'executive' | 'operational' | 'compliance' | 'cost-optimization';
  permissions: {
    principals: string[];
    actions: string[];
  };
}

export interface DashboardDefinition {
  dashboardId: string;
  name: string;
  description: string;
  visualizations: VisualizationConfig[];
  filters: FilterConfig[];
  parameters: ParameterConfig[];
}

export interface VisualizationConfig {
  visualId: string;
  title: string;
  type: 'bar-chart' | 'line-chart' | 'pie-chart' | 'table' | 'kpi' | 'heat-map';
  dataSet: string;
  fieldWells: {
    category?: string[];
    values?: string[];
    colors?: string[];
  };
  formatting?: {
    numberFormat?: string;
    dateFormat?: string;
    colorPalette?: string[];
  };
}

export interface FilterConfig {
  filterId: string;
  column: string;
  type: 'category' | 'date-range' | 'numeric-range';
  defaultValue?: any;
}

export interface ParameterConfig {
  parameterId: string;
  name: string;
  type: 'string' | 'integer' | 'decimal' | 'datetime';
  defaultValue?: any;
}

export class QuickSightDashboardManager {
  private quickSight: QuickSightClient;
  private config: DashboardConfig;

  constructor(config: DashboardConfig) {
    this.config = config;
    this.quickSight = new QuickSightClient({ region: config.region });
  }

  /**
   * Deploy complete dashboard suite for enterprise analytics
   */
  async deployDashboardSuite(): Promise<{
    success: boolean;
    dashboards: string[];
    errors: string[];
  }> {
    console.log(`🎨 Deploying ${this.config.dashboardType} dashboard suite...`);

    const results = {
      success: true,
      dashboards: [] as string[],
      errors: [] as string[]
    };

    try {
      // 1. Create data sources
      const dataSourceResult = await this.createDataSources();
      if (!dataSourceResult.success) {
        results.errors.push(...dataSourceResult.errors);
      }

      // 2. Create data sets
      const dataSetResult = await this.createDataSets();
      if (!dataSetResult.success) {
        results.errors.push(...dataSetResult.errors);
      }

      // 3. Create dashboards based on type
      const dashboardConfigs = this.getDashboardConfigurations();
      
      for (const dashboardConfig of dashboardConfigs) {
        try {
          const dashboardId = await this.createDashboard(dashboardConfig);
          results.dashboards.push(dashboardId);
          console.log(`✅ Dashboard created: ${dashboardConfig.name}`);
        } catch (error) {
          const errorMsg = `Failed to create dashboard ${dashboardConfig.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          results.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      results.success = results.errors.length === 0;
      return results;

    } catch (error) {
      results.success = false;
      results.errors.push(error instanceof Error ? error.message : 'Dashboard suite deployment failed');
      return results;
    }
  }

  /**
   * Create QuickSight data sources
   */
  private async createDataSources(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // S3 Data Source
      await this.quickSight.send(new CreateDataSourceCommand({
        AwsAccountId: this.config.awsAccountId,
        DataSourceId: `bcce-s3-${this.config.organizationId}`,
        Name: `BCCE Analytics S3 - ${this.config.organizationId}`,
        Type: DataSourceType.S3,
        DataSourceParameters: {
          S3Parameters: {
            ManifestFileLocation: {
              Bucket: this.config.dataSourceConfig.s3BucketName,
              Key: 'manifest.json'
            }
          }
        },
        Permissions: [{
          Principal: this.config.dataSourceConfig.roleArn,
          Actions: [
            'quicksight:DescribeDataSource',
            'quicksight:DescribeDataSourcePermissions',
            'quicksight:PassDataSource'
          ]
        }]
      }));

      // Athena Data Source
      if (this.config.dataSourceConfig.athenaWorkgroup) {
        await this.quickSight.send(new CreateDataSourceCommand({
          AwsAccountId: this.config.awsAccountId,
          DataSourceId: `bcce-athena-${this.config.organizationId}`,
          Name: `BCCE Analytics Athena - ${this.config.organizationId}`,
          Type: DataSourceType.ATHENA,
          DataSourceParameters: {
            AthenaParameters: {
              WorkGroup: this.config.dataSourceConfig.athenaWorkgroup
            }
          },
          Permissions: [{
            Principal: this.config.dataSourceConfig.roleArn,
            Actions: [
              'quicksight:DescribeDataSource',
              'quicksight:DescribeDataSourcePermissions',
              'quicksight:PassDataSource'
            ]
          }]
        }));
      }

      return { success: true, errors: [] };

    } catch (error) {
      errors.push(`Data source creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, errors };
    }
  }

  /**
   * Create QuickSight data sets
   */
  private async createDataSets(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const dataSets = this.getDataSetConfigurations();

      for (const dataSet of dataSets) {
        await this.quickSight.send(new CreateDataSetCommand({
          AwsAccountId: this.config.awsAccountId,
          DataSetId: dataSet.id,
          Name: dataSet.name,
          PhysicalTableMap: dataSet.physicalTableMap,
          LogicalTableMap: dataSet.logicalTableMap,
          ImportMode: 'SPICE',
          Permissions: [{
            Principal: this.config.dataSourceConfig.roleArn,
            Actions: [
              'quicksight:DescribeDataSet',
              'quicksight:DescribeDataSetPermissions',
              'quicksight:PassDataSet',
              'quicksight:DescribeIngestion',
              'quicksight:ListIngestions'
            ]
          }]
        }));
      }

      return { success: true, errors: [] };

    } catch (error) {
      errors.push(`Data set creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, errors };
    }
  }

  /**
   * Create individual dashboard
   */
  private async createDashboard(definition: DashboardDefinition): Promise<string> {
    const dashboardDefinition = this.buildDashboardDefinition(definition);

    const result = await this.quickSight.send(new CreateDashboardCommand({
      AwsAccountId: this.config.awsAccountId,
      DashboardId: definition.dashboardId,
      Name: definition.name,
      Definition: dashboardDefinition,
      Permissions: [{
        Principal: this.config.permissions.principals[0],
        Actions: this.config.permissions.actions
      }]
    }));

    return result.DashboardId!;
  }

  /**
   * Get dashboard configurations based on type
   */
  private getDashboardConfigurations(): DashboardDefinition[] {
    switch (this.config.dashboardType) {
      case 'executive':
        return this.getExecutiveDashboards();
      case 'operational':
        return this.getOperationalDashboards();
      case 'compliance':
        return this.getComplianceDashboards();
      case 'cost-optimization':
        return this.getCostOptimizationDashboards();
      default:
        return [];
    }
  }

  /**
   * Executive dashboard configurations
   */
  private getExecutiveDashboards(): DashboardDefinition[] {
    return [{
      dashboardId: `bcce-executive-overview-${this.config.organizationId}`,
      name: 'BCCE Executive Overview',
      description: 'High-level AI governance metrics for executive leadership',
      visualizations: [
        {
          visualId: 'total-cost-kpi',
          title: 'Total AI Spend',
          type: 'kpi',
          dataSet: 'bcce-cost-data',
          fieldWells: {
            values: ['total_cost']
          },
          formatting: {
            numberFormat: 'CURRENCY'
          }
        },
        {
          visualId: 'cost-trend-chart',
          title: 'Monthly AI Spend Trend',
          type: 'line-chart',
          dataSet: 'bcce-cost-data',
          fieldWells: {
            category: ['month'],
            values: ['total_cost']
          }
        },
        {
          visualId: 'compliance-score-kpi',
          title: 'Compliance Score',
          type: 'kpi',
          dataSet: 'bcce-governance-data',
          fieldWells: {
            values: ['compliance_score']
          },
          formatting: {
            numberFormat: 'PERCENT'
          }
        },
        {
          visualId: 'team-usage-chart',
          title: 'Usage by Team',
          type: 'bar-chart',
          dataSet: 'bcce-usage-data',
          fieldWells: {
            category: ['team_name'],
            values: ['interaction_count']
          }
        },
        {
          visualId: 'policy-violations-table',
          title: 'Recent Policy Violations',
          type: 'table',
          dataSet: 'bcce-governance-data',
          fieldWells: {
            category: ['violation_type', 'team_name', 'timestamp']
          }
        }
      ],
      filters: [
        {
          filterId: 'date-range-filter',
          column: 'timestamp',
          type: 'date-range',
          defaultValue: { start: '30-days-ago', end: 'today' }
        },
        {
          filterId: 'team-filter',
          column: 'team_name',
          type: 'category'
        }
      ],
      parameters: [
        {
          parameterId: 'cost-threshold',
          name: 'Cost Alert Threshold',
          type: 'decimal',
          defaultValue: 10000
        }
      ]
    }];
  }

  /**
   * Operational dashboard configurations
   */
  private getOperationalDashboards(): DashboardDefinition[] {
    return [{
      dashboardId: `bcce-operational-metrics-${this.config.organizationId}`,
      name: 'BCCE Operational Metrics',
      description: 'Detailed operational analytics for DevOps and platform teams',
      visualizations: [
        {
          visualId: 'error-rate-chart',
          title: 'Error Rate Trend',
          type: 'line-chart',
          dataSet: 'bcce-operational-data',
          fieldWells: {
            category: ['timestamp'],
            values: ['error_rate']
          }
        },
        {
          visualId: 'response-time-chart',
          title: 'Average Response Time',
          type: 'line-chart',
          dataSet: 'bcce-performance-data',
          fieldWells: {
            category: ['timestamp'],
            values: ['avg_response_time']
          }
        },
        {
          visualId: 'usage-heatmap',
          title: 'Usage Patterns by Hour',
          type: 'heat-map',
          dataSet: 'bcce-usage-data',
          fieldWells: {
            category: ['hour_of_day', 'day_of_week'],
            values: ['interaction_count']
          }
        }
      ],
      filters: [
        {
          filterId: 'project-filter',
          column: 'project_name',
          type: 'category'
        }
      ],
      parameters: []
    }];
  }

  /**
   * Compliance dashboard configurations
   */
  private getComplianceDashboards(): DashboardDefinition[] {
    return [{
      dashboardId: `bcce-compliance-audit-${this.config.organizationId}`,
      name: 'BCCE Compliance & Audit',
      description: 'Comprehensive compliance monitoring and audit trails',
      visualizations: [
        {
          visualId: 'audit-events-table',
          title: 'Recent Audit Events',
          type: 'table',
          dataSet: 'bcce-audit-data',
          fieldWells: {
            category: ['timestamp', 'event_type', 'user_id', 'resource']
          }
        },
        {
          visualId: 'compliance-by-framework',
          title: 'Compliance by Framework',
          type: 'bar-chart',
          dataSet: 'bcce-compliance-data',
          fieldWells: {
            category: ['framework'],
            values: ['compliance_percentage']
          }
        }
      ],
      filters: [
        {
          filterId: 'compliance-framework-filter',
          column: 'framework',
          type: 'category'
        }
      ],
      parameters: []
    }];
  }

  /**
   * Cost optimization dashboard configurations
   */
  private getCostOptimizationDashboards(): DashboardDefinition[] {
    return [{
      dashboardId: `bcce-cost-optimization-${this.config.organizationId}`,
      name: 'BCCE Cost Optimization',
      description: 'AI cost analysis and optimization recommendations',
      visualizations: [
        {
          visualId: 'cost-by-model-chart',
          title: 'Cost by Model',
          type: 'pie-chart',
          dataSet: 'bcce-cost-data',
          fieldWells: {
            category: ['model_name'],
            values: ['total_cost']
          }
        },
        {
          visualId: 'optimization-opportunities-table',
          title: 'Cost Optimization Opportunities',
          type: 'table',
          dataSet: 'bcce-optimization-data',
          fieldWells: {
            category: ['opportunity_type', 'potential_savings', 'effort_level']
          }
        }
      ],
      filters: [],
      parameters: []
    }];
  }

  /**
   * Get data set configurations
   */
  private getDataSetConfigurations(): any[] {
    return [
      {
        id: 'bcce-cost-data',
        name: 'BCCE Cost Data',
        physicalTableMap: {
          'cost-table': {
            S3Source: {
              DataSourceArn: `arn:aws:quicksight:${this.config.region}:${this.config.awsAccountId}:datasource/bcce-s3-${this.config.organizationId}`,
              InputColumns: [
                { Name: 'timestamp', Type: ColumnDataType.DATETIME },
                { Name: 'project_id', Type: ColumnDataType.STRING },
                { Name: 'team_name', Type: ColumnDataType.STRING },
                { Name: 'model_name', Type: ColumnDataType.STRING },
                { Name: 'total_cost', Type: ColumnDataType.DECIMAL },
                { Name: 'token_count', Type: ColumnDataType.INTEGER }
              ]
            }
          }
        },
        logicalTableMap: {
          'cost-analysis': {
            Alias: 'Cost Analysis',
            Source: {
              PhysicalTableId: 'cost-table'
            }
          }
        }
      },
      {
        id: 'bcce-governance-data',
        name: 'BCCE Governance Data',
        physicalTableMap: {
          'governance-table': {
            S3Source: {
              DataSourceArn: `arn:aws:quicksight:${this.config.region}:${this.config.awsAccountId}:datasource/bcce-s3-${this.config.organizationId}`,
              InputColumns: [
                { Name: 'timestamp', Type: ColumnDataType.DATETIME },
                { Name: 'policy_name', Type: ColumnDataType.STRING },
                { Name: 'compliance_score', Type: ColumnDataType.DECIMAL },
                { Name: 'violation_type', Type: ColumnDataType.STRING },
                { Name: 'team_name', Type: ColumnDataType.STRING }
              ]
            }
          }
        },
        logicalTableMap: {
          'governance-analysis': {
            Alias: 'Governance Analysis',
            Source: {
              PhysicalTableId: 'governance-table'
            }
          }
        }
      }
    ];
  }

  /**
   * Build QuickSight dashboard definition
   */
  private buildDashboardDefinition(definition: DashboardDefinition): any {
    return {
      DataSetIdentifierDeclarations: definition.visualizations.map(viz => ({
        DataSetArn: `arn:aws:quicksight:${this.config.region}:${this.config.awsAccountId}:dataset/${viz.dataSet}`,
        Identifier: viz.dataSet
      })),
      Sheets: [{
        SheetId: 'sheet-1',
        Name: definition.name,
        Visuals: definition.visualizations.map(viz => this.buildVisualization(viz))
      }],
      CalculatedFields: [],
      ParameterDeclarations: definition.parameters.map(param => ({
        Name: param.name,
        DefaultValues: param.defaultValue ? {
          StringStaticValues: [param.defaultValue]
        } : undefined,
        ParameterValueType: param.type.toUpperCase()
      })),
      FilterGroups: definition.filters.map(filter => ({
        FilterGroupId: filter.filterId,
        Filters: [{
          CategoryFilter: {
            FilterId: filter.filterId,
            Column: {
              DataSetIdentifier: definition.visualizations[0].dataSet,
              ColumnName: filter.column
            },
            Configuration: {
              FilterListConfiguration: {
                MatchOperator: 'CONTAINS'
              }
            }
          }
        }]
      }))
    };
  }

  /**
   * Build individual visualization
   */
  private buildVisualization(viz: VisualizationConfig): any {
    const baseVisual = {
      VisualId: viz.visualId,
      Title: {
        Visibility: 'VISIBLE',
        FormatText: {
          PlainText: viz.title
        }
      }
    };

    switch (viz.type) {
      case 'kpi':
        return {
          ...baseVisual,
          KPIVisual: {
            VisualId: viz.visualId,
            Title: baseVisual.Title,
            Subtitle: {
              Visibility: 'VISIBLE'
            },
            ChartConfiguration: {
              FieldWells: {
                Values: viz.fieldWells.values?.map(field => ({
                  NumericalMeasureField: {
                    FieldId: field,
                    Column: {
                      DataSetIdentifier: viz.dataSet,
                      ColumnName: field
                    }
                  }
                }))
              },
              KPIOptions: {
                ProgressBar: {
                  Visibility: 'VISIBLE'
                },
                TrendArrows: {
                  Visibility: 'VISIBLE'
                }
              }
            }
          }
        };

      case 'bar-chart':
        return {
          ...baseVisual,
          BarChartVisual: {
            VisualId: viz.visualId,
            Title: baseVisual.Title,
            ChartConfiguration: {
              FieldWells: {
                BarChartAggregatedFieldWells: {
                  Category: viz.fieldWells.category?.map(field => ({
                    CategoricalDimensionField: {
                      FieldId: field,
                      Column: {
                        DataSetIdentifier: viz.dataSet,
                        ColumnName: field
                      }
                    }
                  })),
                  Values: viz.fieldWells.values?.map(field => ({
                    NumericalMeasureField: {
                      FieldId: field,
                      Column: {
                        DataSetIdentifier: viz.dataSet,
                        ColumnName: field
                      }
                    }
                  }))
                }
              }
            }
          }
        };

      default:
        return baseVisual;
    }
  }

  /**
   * Update existing dashboard
   */
  async updateDashboard(dashboardId: string, definition: DashboardDefinition): Promise<void> {
    const dashboardDefinition = this.buildDashboardDefinition(definition);

    await this.quickSight.send(new UpdateDashboardCommand({
      AwsAccountId: this.config.awsAccountId,
      DashboardId: dashboardId,
      Name: definition.name,
      Definition: dashboardDefinition
    }));
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    await this.quickSight.send(new DeleteDashboardCommand({
      AwsAccountId: this.config.awsAccountId,
      DashboardId: dashboardId
    }));
  }

  /**
   * Get dashboard status
   */
  async getDashboardStatus(dashboardId: string): Promise<{
    exists: boolean;
    status?: string;
    lastUpdated?: Date;
  }> {
    try {
      const result = await this.quickSight.send(new DescribeDashboardCommand({
        AwsAccountId: this.config.awsAccountId,
        DashboardId: dashboardId
      }));

      return {
        exists: true,
        status: result.Dashboard?.Version?.Status,
        lastUpdated: result.Dashboard?.LastUpdatedTime
      };
    } catch (error) {
      return { exists: false };
    }
  }
}