# BCCE Monitoring and Operations Setup

## Overview

This guide covers setting up comprehensive monitoring, alerting, and operational procedures for BCCE in enterprise environments.

## Monitoring Architecture

### Components to Monitor
- BCCE CLI execution and performance
- Workflow execution metrics
- AWS Bedrock API usage and costs
- Agent policy compliance
- Security events and violations
- Infrastructure resource utilization

### Monitoring Stack
```
Metrics Collection
├── CloudWatch Metrics (AWS native)
├── Custom Metrics (BCCE application)
├── Infrastructure Metrics (EC2, VPC, etc.)
└── Application Logs (structured JSON)

Alerting
├── CloudWatch Alarms
├── SNS Notifications  
├── PagerDuty Integration
└── Slack/Teams Integration

Dashboards
├── Executive Summary
├── Operational Metrics
├── Security Dashboard
└── Cost Optimization
```

## CloudWatch Setup

### Log Groups Configuration
```bash
# Create log groups for different components
aws logs create-log-group --log-group-name /aws/bcce/cli
aws logs create-log-group --log-group-name /aws/bcce/workflows
aws logs create-log-group --log-group-name /aws/bcce/security
aws logs create-log-group --log-group-name /aws/bcce/audit

# Set retention policies
aws logs put-retention-policy --log-group-name /aws/bcce/cli --retention-in-days 90
aws logs put-retention-policy --log-group-name /aws/bcce/workflows --retention-in-days 365
aws logs put-retention-policy --log-group-name /aws/bcce/security --retention-in-days 2555  # 7 years
aws logs put-retention-policy --log-group-name /aws/bcce/audit --retention-in-days 2555
```

### Custom Metrics Configuration
```typescript
// BCCE CLI metrics implementation
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

class BCCEMetrics {
  private cloudwatch: CloudWatchClient;
  
  constructor() {
    this.cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION });
  }
  
  async recordWorkflowExecution(workflowId: string, duration: number, success: boolean) {
    const metrics = [
      {
        MetricName: 'WorkflowExecutionDuration',
        Value: duration,
        Unit: 'Seconds',
        Dimensions: [
          { Name: 'WorkflowId', Value: workflowId },
          { Name: 'Status', Value: success ? 'Success' : 'Failed' }
        ]
      },
      {
        MetricName: 'WorkflowExecutionCount',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          { Name: 'Status', Value: success ? 'Success' : 'Failed' }
        ]
      }
    ];
    
    await this.cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'BCCE/Workflows',
      MetricData: metrics
    }));
  }
  
  async recordPolicyViolation(policyType: string, severity: string) {
    await this.cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'BCCE/Security',
      MetricData: [{
        MetricName: 'PolicyViolations',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          { Name: 'PolicyType', Value: policyType },
          { Name: 'Severity', Value: severity }
        ]
      }]
    }));
  }
}
```

### Dashboard Templates

#### Executive Dashboard
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["BCCE/Workflows", "WorkflowExecutionCount", "Status", "Success"],
          ["...", "Failed"]
        ],
        "period": 3600,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Daily Workflow Executions",
        "yAxis": { "left": { "min": 0 } }
      }
    },
    {
      "type": "metric", 
      "properties": {
        "metrics": [
          ["AWS/Bedrock", "InvocationCount", "ModelId", "anthropic.claude-3-5-sonnet-20241022-v2:0"],
          ["...", "InputTokenCount"],
          ["...", "OutputTokenCount"]
        ],
        "period": 3600,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Bedrock Usage"
      }
    },
    {
      "type": "log",
      "properties": {
        "query": "SOURCE '/aws/bcce/security'\n| filter level=\"ERROR\"\n| stats count() by bin(5m)",
        "region": "us-east-1",
        "title": "Security Events (Last 24h)"
      }
    }
  ]
}
```

#### Operational Dashboard  
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["BCCE/Workflows", "WorkflowExecutionDuration", { "stat": "Average" }],
          ["...", { "stat": "p95" }],
          ["...", { "stat": "p99" }]
        ],
        "period": 300,
        "stat": "Average",
        "title": "Workflow Execution Times"
      }
    },
    {
      "type": "log",
      "properties": {
        "query": "SOURCE '/aws/bcce/workflows'\n| filter @message like /ERROR/\n| fields @timestamp, workflow_id, error_message\n| sort @timestamp desc\n| limit 20",
        "region": "us-east-1", 
        "title": "Recent Workflow Errors"
      }
    }
  ]
}
```

## Alerting Configuration

### Critical Alerts (P0)
```bash
# Security incidents
aws cloudwatch put-metric-alarm \
  --alarm-name "BCCE-Security-PolicyViolation-Critical" \
  --alarm-description "Critical policy violations detected" \
  --metric-name PolicyViolations \
  --namespace BCCE/Security \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:bcce-security-alerts

# Service availability
aws cloudwatch put-metric-alarm \
  --alarm-name "BCCE-Workflows-HighFailureRate" \
  --alarm-description "High workflow failure rate" \
  --metric-name WorkflowExecutionCount \
  --namespace BCCE/Workflows \
  --statistic Sum \
  --period 900 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:bcce-operations-alerts
```

### High Priority Alerts (P1)
```bash
# Performance degradation
aws cloudwatch put-metric-alarm \
  --alarm-name "BCCE-Workflows-SlowExecution" \
  --alarm-description "Workflow execution time exceeding SLA" \
  --metric-name WorkflowExecutionDuration \
  --namespace BCCE/Workflows \
  --statistic Average \
  --period 600 \
  --threshold 1800 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:bcce-performance-alerts

# Cost optimization
aws cloudwatch put-metric-alarm \
  --alarm-name "BCCE-Bedrock-HighCost" \
  --alarm-description "Bedrock usage costs exceeding budget" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:bcce-cost-alerts
```

### Medium Priority Alerts (P2)
```bash
# Resource utilization
aws cloudwatch put-metric-alarm \
  --alarm-name "BCCE-Artifacts-HighStorage" \
  --alarm-description "Artifact storage usage high" \
  --metric-name ArtifactStorageUsage \
  --namespace BCCE/Resources \
  --statistic Average \
  --period 3600 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:bcce-resource-alerts
```

## Log Management

### Structured Logging Implementation
```typescript
// BCCE structured logging
import { createLogger, format, transports } from 'winston';
import { CloudWatchLogs } from 'winston-cloudwatch';

const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.printf(info => {
      return JSON.stringify({
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        workflow_id: info.workflow_id,
        user_id: info.user_id,
        execution_context: info.execution_context,
        security_context: info.security_context
      });
    })
  ),
  transports: [
    new transports.Console(),
    new CloudWatchLogs({
      logGroupName: '/aws/bcce/workflows',
      logStreamName: 'workflow-execution',
      awsRegion: process.env.AWS_REGION
    })
  ]
});

// Usage in workflow execution
logger.info('Workflow started', {
  workflow_id: 'wf-12345',
  user_id: 'user@company.com',
  execution_context: {
    environment: 'production',
    region: 'us-east-1'
  },
  security_context: {
    identity_provider: 'identity-center',
    risk_level: 'medium'
  }
});
```

### Log Analysis Queries
```sql
-- Top workflow failures
SOURCE '/aws/bcce/workflows'
| filter level = "ERROR"  
| stats count() by workflow_id
| sort count desc
| limit 10

-- Security events by severity
SOURCE '/aws/bcce/security'
| filter @message like /SECURITY/
| stats count() by security_context.severity
| sort count desc

-- Performance analysis
SOURCE '/aws/bcce/workflows'
| filter @message like /COMPLETED/
| fields @timestamp, workflow_id, execution_duration
| filter execution_duration > 600
| sort @timestamp desc

-- Cost analysis by user
SOURCE '/aws/bcce/audit'
| filter @message like /BEDROCK_INVOCATION/
| stats sum(estimated_cost) by user_id
| sort sum desc
```

## Performance Monitoring

### Key Performance Indicators (KPIs)
```yaml
performance_kpis:
  availability:
    workflow_success_rate: ">95%"
    system_uptime: ">99.9%"
    
  performance:
    workflow_execution_p95: "<10 minutes"
    api_response_time_p95: "<2 seconds"
    
  user_experience:
    mean_time_to_first_workflow: "<30 minutes"
    error_rate: "<1%"
    
  resource_efficiency:
    cost_per_workflow_execution: "track_trend"
    bedrock_token_efficiency: "optimize_continuously"
```

### Performance Testing
```bash
# Load testing script
#!/bin/bash
# load-test-bcce.sh

CONCURRENT_USERS=10
TEST_DURATION=300  # 5 minutes
WORKFLOW_FILE="workflows/starters/test-grader.yml"

for i in $(seq 1 $CONCURRENT_USERS); do
  (
    while [ $SECONDS -lt $TEST_DURATION ]; do
      bcce workflow run --dry-run $WORKFLOW_FILE
      sleep 5
    done
  ) &
done

wait
echo "Load test completed"
```

### Capacity Planning
```yaml
capacity_metrics:
  current_usage:
    daily_workflow_executions: monitor
    peak_concurrent_users: track
    average_execution_time: measure
    
  growth_projections:
    user_growth_rate: 20%_monthly
    workflow_complexity_increase: 15%_quarterly
    data_processing_volume: 2x_yearly
    
  scaling_thresholds:
    cpu_utilization: 70%
    memory_utilization: 80%
    storage_utilization: 85%
    network_bandwidth: 60%
```

## Security Monitoring

### Security Event Detection
```yaml
security_monitoring:
  authentication_events:
    failed_login_attempts: alert_after_5
    unusual_login_locations: immediate_alert
    privilege_escalation_attempts: immediate_block
    
  workflow_security:
    policy_violations: immediate_alert
    unauthorized_file_access: block_and_alert
    suspicious_command_execution: investigate
    
  data_protection:
    large_data_exports: flag_for_review
    sensitive_pattern_detection: automatic_redaction
    encryption_bypass_attempts: immediate_alert
```

### Compliance Monitoring
```sql
-- SOC2 Compliance - Access Control Monitoring
SOURCE '/aws/bcce/audit'
| filter event_type = "ACCESS_GRANTED" OR event_type = "ACCESS_DENIED"
| stats count() by user_id, event_type, resource_accessed
| sort count desc

-- GDPR Compliance - Data Processing Audit
SOURCE '/aws/bcce/workflows' 
| filter @message like /DATA_PROCESSED/
| fields @timestamp, user_id, data_categories, processing_purpose, legal_basis
| sort @timestamp desc

-- Security Incident Timeline
SOURCE '/aws/bcce/security'
| filter severity = "HIGH" OR severity = "CRITICAL"
| fields @timestamp, incident_type, affected_resources, response_actions
| sort @timestamp desc
```

## Operational Procedures

### Daily Operations Checklist
```yaml
daily_operations:
  morning_checks:
    - review_overnight_alerts
    - check_system_health_dashboard
    - verify_backup_completion
    - review_security_events
    
  ongoing_monitoring:
    - monitor_workflow_execution_rates
    - track_cost_against_budget
    - review_performance_metrics
    - check_capacity_utilization
    
  end_of_day:
    - summarize_key_metrics
    - document_incidents_and_resolutions
    - prepare_next_day_priorities
    - update_stakeholders_if_needed
```

### Incident Response Procedures
```yaml
incident_response:
  severity_1_critical:
    response_time: immediate
    escalation: security_team + management
    actions:
      - isolate_affected_systems
      - preserve_forensic_evidence  
      - implement_containment_measures
      - communicate_to_stakeholders
      
  severity_2_high:
    response_time: 15_minutes
    escalation: operations_team
    actions:
      - assess_impact_scope
      - implement_workarounds
      - begin_root_cause_analysis
      - update_monitoring_dashboards
      
  severity_3_medium:
    response_time: 1_hour
    escalation: on_call_engineer
    actions:
      - log_incident_details
      - implement_standard_fixes
      - monitor_for_recurrence
      - update_documentation
```

### Maintenance Procedures
```yaml
maintenance_schedule:
  weekly:
    - artifact_cleanup_older_than_30_days
    - log_rotation_and_archival
    - security_patch_review
    - performance_trend_analysis
    
  monthly:
    - capacity_planning_review
    - cost_optimization_analysis
    - security_assessment_updates
    - disaster_recovery_testing
    
  quarterly:
    - comprehensive_security_audit
    - compliance_certification_renewal
    - architecture_review_and_updates
    - staff_training_and_certification
```

## Cost Optimization

### Cost Monitoring
```typescript
// Bedrock cost tracking
class CostMonitor {
  async trackBedrockUsage(modelId: string, inputTokens: number, outputTokens: number) {
    const pricing = await this.getModelPricing(modelId);
    const cost = (inputTokens * pricing.inputCost) + (outputTokens * pricing.outputCost);
    
    await this.recordCostMetric({
      model: modelId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: cost,
      timestamp: new Date().toISOString()
    });
  }
  
  async generateCostReport(period: 'daily' | 'monthly' | 'quarterly') {
    // Implementation for cost reporting
  }
}
```

### Cost Optimization Strategies
```yaml
cost_optimization:
  model_selection:
    - use_claude_haiku_for_simple_tasks
    - reserve_claude_opus_for_complex_analysis
    - implement_model_routing_logic
    
  request_optimization:
    - implement_prompt_caching
    - optimize_context_window_usage
    - batch_similar_requests
    
  resource_management:
    - automatic_artifact_cleanup
    - compress_large_transcripts
    - optimize_storage_classes
```

## Integration with Enterprise Tools

### SIEM Integration
```json
{
  "siem_forwarding": {
    "splunk": {
      "endpoint": "https://splunk.company.com:8088/services/collector",
      "token": "${SPLUNK_HEC_TOKEN}",
      "source_types": ["bcce:security", "bcce:audit"]
    },
    "elasticsearch": {
      "endpoint": "https://elk.company.com:9200",
      "index_pattern": "bcce-logs-*",
      "retention_days": 90
    }
  }
}
```

### Ticketing System Integration
```yaml
incident_management:
  jira_integration:
    project_key: "BCCE"
    issue_types:
      security_incident: "Security Issue"
      performance_issue: "Bug"
      enhancement_request: "Story"
    
  servicenow_integration:
    table: "incident"
    priority_mapping:
      p0: "1 - Critical" 
      p1: "2 - High"
      p2: "3 - Medium"
```

This monitoring setup provides comprehensive visibility into BCCE operations while supporting enterprise requirements for security, compliance, and operational excellence.