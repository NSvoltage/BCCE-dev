/**
 * EventBridge Orchestration for BCCE
 * Provides event-driven workflow orchestration and scheduling
 */

import { EventEmitter } from 'node:events';

export interface EventBridgeConfig {
  eventBusName?: string;
  region?: string;
  enableScheduling?: boolean;
  enableDLQ?: boolean; // Dead Letter Queue
  retryPolicy?: {
    maximumRetryAttempts: number;
    maximumEventAge: number; // seconds
  };
}

export interface WorkflowEvent {
  id: string;
  source: string;
  detailType: string;
  detail: any;
  time: Date;
  resources?: string[];
  account?: string;
  region?: string;
}

export interface EventRule {
  name: string;
  description?: string;
  eventPattern?: EventPattern;
  scheduleExpression?: string; // cron or rate expression
  state: 'ENABLED' | 'DISABLED';
  targets: EventTarget[];
}

export interface EventPattern {
  source?: string[];
  detailType?: string[];
  detail?: Record<string, any>;
  account?: string[];
  region?: string[];
  resources?: string[];
}

export interface EventTarget {
  id: string;
  arn?: string;
  roleArn?: string;
  input?: string;
  inputPath?: string;
  inputTransformer?: {
    inputPathsMap?: Record<string, string>;
    inputTemplate: string;
  };
  retryPolicy?: {
    maximumRetryAttempts?: number;
    maximumEventAge?: number;
  };
  deadLetterConfig?: {
    arn: string;
  };
}

export interface ScheduledWorkflow {
  id: string;
  workflowId: string;
  schedule: string; // cron expression
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  parameters?: Record<string, any>;
  tags?: Record<string, string>;
}

export interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'manual' | 'webhook';
  source: string;
  conditions?: TriggerCondition[];
  actions: TriggerAction[];
}

export interface TriggerCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: any;
}

export interface TriggerAction {
  type: 'start-workflow' | 'send-notification' | 'invoke-lambda' | 'publish-sns';
  target: string;
  parameters?: Record<string, any>;
}

export class EventBridgeOrchestrator extends EventEmitter {
  private config: EventBridgeConfig;
  private rules: Map<string, EventRule> = new Map();
  private schedules: Map<string, ScheduledWorkflow> = new Map();
  private triggers: Map<string, WorkflowTrigger[]> = new Map();
  private mockMode = false;
  private eventHistory: WorkflowEvent[] = [];

  constructor(config: EventBridgeConfig = {}) {
    super();
    this.config = {
      eventBusName: 'default',
      region: process.env.AWS_REGION || 'us-east-1',
      enableScheduling: true,
      enableDLQ: true,
      retryPolicy: {
        maximumRetryAttempts: 2,
        maximumEventAge: 3600, // 1 hour
      },
      ...config,
    };
    this.initializeOrchestrator();
  }

  /**
   * Enable mock mode for testing
   */
  enableMockMode(): void {
    this.mockMode = true;
    console.log('EventBridge Orchestrator running in mock mode');
  }

  private async initializeOrchestrator(): Promise<void> {
    if (this.mockMode) {
      console.log('Mock mode: EventBridge orchestrator initialized');
      return;
    }

    try {
      // In production, this would:
      // 1. Create custom event bus if needed
      // 2. Set up default rules
      // 3. Configure DLQ if enabled
      await this.setupEventBus();
      await this.createDefaultRules();
    } catch (error) {
      console.error('Failed to initialize EventBridge orchestrator:', error);
      throw error;
    }
  }

  /**
   * Publish a workflow event
   */
  async publishEvent(event: Omit<WorkflowEvent, 'id' | 'time'>): Promise<string> {
    const fullEvent: WorkflowEvent = {
      ...event,
      id: this.generateEventId(),
      time: new Date(),
      account: this.config.eventBusName,
      region: this.config.region,
    };

    try {
      if (this.mockMode) {
        this.eventHistory.push(fullEvent);
        console.log(`Mock mode: Event published - ${fullEvent.detailType}`);
        await this.processEventLocally(fullEvent);
      } else {
        // In production, publish to EventBridge
        await this.publishToEventBridge(fullEvent);
      }

      this.emit('event-published', fullEvent);
      
      // Check and execute triggers
      await this.evaluateTriggers(fullEvent);
      
      return fullEvent.id;
    } catch (error) {
      console.error('Failed to publish event:', error);
      this.emit('event-publish-error', { event: fullEvent, error });
      throw error;
    }
  }

  /**
   * Create an event rule for workflow automation
   */
  async createRule(rule: EventRule): Promise<void> {
    try {
      this.validateRule(rule);
      
      if (this.mockMode) {
        this.rules.set(rule.name, rule);
        console.log(`Mock mode: Rule created - ${rule.name}`);
      } else {
        // In production, create rule in EventBridge
        await this.createEventBridgeRule(rule);
        this.rules.set(rule.name, rule);
      }

      this.emit('rule-created', rule);
    } catch (error) {
      console.error(`Failed to create rule ${rule.name}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a workflow to run periodically
   */
  async scheduleWorkflow(
    workflowId: string,
    schedule: string,
    parameters?: Record<string, any>
  ): Promise<ScheduledWorkflow> {
    const scheduledWorkflow: ScheduledWorkflow = {
      id: this.generateScheduleId(),
      workflowId,
      schedule,
      enabled: true,
      parameters,
      nextRun: this.calculateNextRun(schedule),
    };

    try {
      // Create EventBridge rule for the schedule
      const rule: EventRule = {
        name: `bcce-schedule-${scheduledWorkflow.id}`,
        description: `Scheduled workflow: ${workflowId}`,
        scheduleExpression: schedule,
        state: 'ENABLED',
        targets: [{
          id: '1',
          input: JSON.stringify({
            workflowId,
            parameters,
            scheduledRun: true,
          }),
        }],
      };

      await this.createRule(rule);
      this.schedules.set(scheduledWorkflow.id, scheduledWorkflow);
      
      this.emit('workflow-scheduled', scheduledWorkflow);
      return scheduledWorkflow;
    } catch (error) {
      console.error(`Failed to schedule workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Create workflow triggers based on events
   */
  async createTrigger(workflowId: string, trigger: WorkflowTrigger): Promise<void> {
    try {
      const triggers = this.triggers.get(workflowId) || [];
      triggers.push(trigger);
      this.triggers.set(workflowId, triggers);

      // Create corresponding EventBridge rule
      if (trigger.type === 'event') {
        const rule: EventRule = {
          name: `bcce-trigger-${workflowId}-${Date.now()}`,
          description: `Trigger for workflow ${workflowId}`,
          eventPattern: {
            source: [trigger.source],
          },
          state: 'ENABLED',
          targets: [{
            id: '1',
            input: JSON.stringify({
              workflowId,
              triggeredBy: trigger.type,
            }),
          }],
        };

        await this.createRule(rule);
      }

      this.emit('trigger-created', { workflowId, trigger });
    } catch (error) {
      console.error(`Failed to create trigger for ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Create workflow orchestration patterns
   */
  async createOrchestrationPattern(pattern: {
    name: string;
    type: 'sequential' | 'parallel' | 'conditional' | 'fan-out' | 'saga';
    workflows: Array<{
      id: string;
      condition?: string;
      onSuccess?: string; // next workflow
      onFailure?: string; // error handler workflow
      timeout?: number;
    }>;
  }): Promise<void> {
    try {
      const rules: EventRule[] = [];

      switch (pattern.type) {
        case 'sequential':
          // Create rules for sequential execution
          for (let i = 0; i < pattern.workflows.length - 1; i++) {
            const current = pattern.workflows[i];
            const next = pattern.workflows[i + 1];
            
            rules.push({
              name: `${pattern.name}-seq-${i}`,
              description: `Sequential orchestration: ${current.id} -> ${next.id}`,
              eventPattern: {
                source: ['bcce.workflow'],
                detailType: ['Workflow Completed'],
                detail: {
                  workflowId: [current.id],
                  status: ['success'],
                },
              },
              state: 'ENABLED',
              targets: [{
                id: '1',
                input: JSON.stringify({
                  action: 'start-workflow',
                  workflowId: next.id,
                }),
              }],
            });
          }
          break;

        case 'parallel':
          // Create rule to trigger all workflows simultaneously
          rules.push({
            name: `${pattern.name}-parallel`,
            description: `Parallel orchestration for ${pattern.workflows.length} workflows`,
            eventPattern: {
              source: ['bcce.orchestration'],
              detailType: ['Start Parallel Execution'],
              detail: {
                patternName: [pattern.name],
              },
            },
            state: 'ENABLED',
            targets: pattern.workflows.map((w, i) => ({
              id: String(i + 1),
              input: JSON.stringify({
                action: 'start-workflow',
                workflowId: w.id,
              }),
            })),
          });
          break;

        case 'conditional':
          // Create rules with conditions
          for (const workflow of pattern.workflows) {
            if (workflow.condition) {
              rules.push({
                name: `${pattern.name}-cond-${workflow.id}`,
                description: `Conditional execution: ${workflow.id}`,
                eventPattern: {
                  source: ['bcce.workflow'],
                  detailType: ['Workflow Decision Point'],
                  detail: {
                    condition: [workflow.condition],
                  },
                },
                state: 'ENABLED',
                targets: [{
                  id: '1',
                  input: JSON.stringify({
                    action: 'start-workflow',
                    workflowId: workflow.id,
                  }),
                }],
              });
            }
          }
          break;

        case 'fan-out':
          // Create rule for fan-out pattern
          rules.push({
            name: `${pattern.name}-fanout`,
            description: `Fan-out orchestration`,
            eventPattern: {
              source: ['bcce.orchestration'],
              detailType: ['Start Fan-Out'],
              detail: {
                patternName: [pattern.name],
              },
            },
            state: 'ENABLED',
            targets: [{
              id: '1',
              inputTransformer: {
                inputPathsMap: {
                  items: '$.detail.items',
                },
                inputTemplate: JSON.stringify({
                  action: 'process-items',
                  items: '<items>',
                }),
              },
            }],
          });
          break;

        case 'saga':
          // Create compensating transaction rules
          for (const workflow of pattern.workflows) {
            if (workflow.onFailure) {
              rules.push({
                name: `${pattern.name}-saga-compensate-${workflow.id}`,
                description: `Saga compensation: ${workflow.id}`,
                eventPattern: {
                  source: ['bcce.workflow'],
                  detailType: ['Workflow Failed'],
                  detail: {
                    workflowId: [workflow.id],
                  },
                },
                state: 'ENABLED',
                targets: [{
                  id: '1',
                  input: JSON.stringify({
                    action: 'start-workflow',
                    workflowId: workflow.onFailure,
                    compensating: true,
                  }),
                }],
              });
            }
          }
          break;
      }

      // Create all rules
      for (const rule of rules) {
        await this.createRule(rule);
      }

      this.emit('orchestration-pattern-created', pattern);
    } catch (error) {
      console.error(`Failed to create orchestration pattern ${pattern.name}:`, error);
      throw error;
    }
  }

  /**
   * Create circuit breaker for workflow resilience
   */
  async createCircuitBreaker(config: {
    workflowId: string;
    failureThreshold: number;
    resetTimeout: number; // seconds
    halfOpenRequests: number;
  }): Promise<void> {
    const rule: EventRule = {
      name: `bcce-circuit-breaker-${config.workflowId}`,
      description: `Circuit breaker for ${config.workflowId}`,
      eventPattern: {
        source: ['bcce.workflow'],
        detailType: ['Workflow Failed'],
        detail: {
          workflowId: [config.workflowId],
        },
      },
      state: 'ENABLED',
      targets: [{
        id: '1',
        input: JSON.stringify({
          action: 'evaluate-circuit-breaker',
          config,
        }),
      }],
    };

    await this.createRule(rule);
    this.emit('circuit-breaker-created', config);
  }

  /**
   * Get workflow execution history
   */
  async getExecutionHistory(
    workflowId?: string,
    startTime?: Date,
    endTime?: Date,
    maxResults = 100
  ): Promise<WorkflowEvent[]> {
    let events = [...this.eventHistory];

    if (workflowId) {
      events = events.filter(e => 
        e.detail?.workflowId === workflowId || 
        e.resources?.includes(workflowId)
      );
    }

    if (startTime) {
      events = events.filter(e => e.time >= startTime);
    }

    if (endTime) {
      events = events.filter(e => e.time <= endTime);
    }

    return events
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, maxResults);
  }

  /**
   * Pause/resume scheduled workflows
   */
  async toggleSchedule(scheduleId: string, enabled: boolean): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    schedule.enabled = enabled;
    
    // Update EventBridge rule
    const ruleName = `bcce-schedule-${scheduleId}`;
    const rule = this.rules.get(ruleName);
    if (rule) {
      rule.state = enabled ? 'ENABLED' : 'DISABLED';
      
      if (!this.mockMode) {
        await this.updateEventBridgeRule(ruleName, rule.state);
      }
    }

    this.emit('schedule-toggled', { scheduleId, enabled });
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleName: string): Promise<void> {
    if (!this.rules.has(ruleName)) {
      throw new Error(`Rule ${ruleName} not found`);
    }

    if (this.mockMode) {
      this.rules.delete(ruleName);
      console.log(`Mock mode: Rule deleted - ${ruleName}`);
    } else {
      await this.deleteEventBridgeRule(ruleName);
      this.rules.delete(ruleName);
    }

    this.emit('rule-deleted', ruleName);
  }

  /**
   * Get orchestration metrics
   */
  getMetrics(): {
    totalRules: number;
    activeSchedules: number;
    totalTriggers: number;
    recentEvents: number;
  } {
    return {
      totalRules: this.rules.size,
      activeSchedules: Array.from(this.schedules.values())
        .filter(s => s.enabled).length,
      totalTriggers: Array.from(this.triggers.values())
        .reduce((sum, triggers) => sum + triggers.length, 0),
      recentEvents: this.eventHistory.filter(e => 
        e.time > new Date(Date.now() - 3600000) // last hour
      ).length,
    };
  }

  // Private helper methods

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateScheduleId(): string {
    return `sch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateRule(rule: EventRule): void {
    if (!rule.name) {
      throw new Error('Rule name is required');
    }
    if (!rule.eventPattern && !rule.scheduleExpression) {
      throw new Error('Either eventPattern or scheduleExpression is required');
    }
    if (rule.targets.length === 0) {
      throw new Error('At least one target is required');
    }
  }

  private calculateNextRun(schedule: string): Date {
    // Simplified - in production would use proper cron parser
    const now = new Date();
    if (schedule.includes('rate(')) {
      const match = schedule.match(/rate\((\d+)\s+(minute|hour|day)/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        const next = new Date(now);
        
        switch (unit) {
          case 'minute':
            next.setMinutes(next.getMinutes() + value);
            break;
          case 'hour':
            next.setHours(next.getHours() + value);
            break;
          case 'day':
            next.setDate(next.getDate() + value);
            break;
        }
        return next;
      }
    }
    return new Date(now.getTime() + 3600000); // Default to 1 hour
  }

  private async processEventLocally(event: WorkflowEvent): Promise<void> {
    // Process event against local rules in mock mode
    for (const [_, rule] of this.rules) {
      if (this.matchesEventPattern(event, rule.eventPattern)) {
        console.log(`Mock mode: Rule ${rule.name} matched event ${event.id}`);
        // Execute targets
        for (const target of rule.targets) {
          this.emit('target-invoked', { rule: rule.name, target });
        }
      }
    }
  }

  private matchesEventPattern(event: WorkflowEvent, pattern?: EventPattern): boolean {
    if (!pattern) return false;
    
    if (pattern.source && !pattern.source.includes(event.source)) {
      return false;
    }
    if (pattern.detailType && !pattern.detailType.includes(event.detailType)) {
      return false;
    }
    // Simplified pattern matching
    return true;
  }

  private async evaluateTriggers(event: WorkflowEvent): Promise<void> {
    for (const [workflowId, triggers] of this.triggers) {
      for (const trigger of triggers) {
        if (trigger.type === 'event' && trigger.source === event.source) {
          // Evaluate conditions
          let conditionsMet = true;
          if (trigger.conditions) {
            conditionsMet = trigger.conditions.every(cond => 
              this.evaluateCondition(event.detail, cond)
            );
          }

          if (conditionsMet) {
            // Execute actions
            for (const action of trigger.actions) {
              await this.executeTriggerAction(action, event);
            }
          }
        }
      }
    }
  }

  private evaluateCondition(detail: any, condition: TriggerCondition): boolean {
    const value = detail[condition.field];
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return String(value).includes(condition.value);
      case 'startsWith':
        return String(value).startsWith(condition.value);
      case 'endsWith':
        return String(value).endsWith(condition.value);
      case 'greaterThan':
        return value > condition.value;
      case 'lessThan':
        return value < condition.value;
      default:
        return false;
    }
  }

  private async executeTriggerAction(action: TriggerAction, event: WorkflowEvent): Promise<void> {
    console.log(`Executing trigger action: ${action.type} -> ${action.target}`);
    this.emit('trigger-action-executed', { action, event });
  }

  private async createDefaultRules(): Promise<void> {
    // Create default rules for workflow lifecycle events
    const defaultRules: EventRule[] = [
      {
        name: 'bcce-workflow-failures',
        description: 'Capture all workflow failures',
        eventPattern: {
          source: ['bcce.workflow'],
          detailType: ['Workflow Failed'],
        },
        state: 'ENABLED',
        targets: [{
          id: '1',
          input: JSON.stringify({ action: 'notify-failure' }),
        }],
      },
      {
        name: 'bcce-high-cost-alert',
        description: 'Alert on high-cost workflows',
        eventPattern: {
          source: ['bcce.cost'],
          detailType: ['High Cost Detected'],
        },
        state: 'ENABLED',
        targets: [{
          id: '1',
          input: JSON.stringify({ action: 'cost-alert' }),
        }],
      },
    ];

    for (const rule of defaultRules) {
      await this.createRule(rule);
    }
  }

  // AWS SDK integration methods (stubbed)

  private async setupEventBus(): Promise<void> {
    console.log(`Would set up EventBridge event bus: ${this.config.eventBusName}`);
  }

  private async publishToEventBridge(event: WorkflowEvent): Promise<void> {
    console.log(`Would publish event to EventBridge: ${event.id}`);
  }

  private async createEventBridgeRule(rule: EventRule): Promise<void> {
    console.log(`Would create EventBridge rule: ${rule.name}`);
  }

  private async updateEventBridgeRule(name: string, state: string): Promise<void> {
    console.log(`Would update EventBridge rule ${name} to ${state}`);
  }

  private async deleteEventBridgeRule(name: string): Promise<void> {
    console.log(`Would delete EventBridge rule: ${name}`);
  }
}

// Export singleton instance
export const eventBridgeOrchestrator = new EventBridgeOrchestrator();