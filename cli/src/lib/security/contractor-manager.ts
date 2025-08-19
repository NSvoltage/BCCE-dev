/**
 * Contractor Management System for BCCE
 * Provides temporary access provisioning and management for contractors
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface Contractor {
  id: string;
  name: string;
  email: string;
  company: string;
  role: 'developer' | 'reviewer' | 'consultant' | 'auditor';
  accessLevel: 'basic' | 'standard' | 'elevated';
  projects: string[];
  supervisor: string; // Email of supervising employee
  startDate: Date;
  endDate: Date;
  extensions?: ContractorExtension[];
}

export interface ContractorExtension {
  requestedBy: string;
  approvedBy?: string;
  originalEndDate: Date;
  newEndDate: Date;
  reason: string;
  approvedAt?: Date;
  status: 'pending' | 'approved' | 'denied';
}

export interface AccessGrant {
  contractorId: string;
  grantId: string;
  credentials: {
    accessKey?: string;      // Temporary AWS credentials
    secretKey?: string;
    sessionToken?: string;
    region: string;
  };
  policies: AccessPolicy[];
  workflows: string[];        // Allowed workflows
  projects: string[];         // Allowed projects
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

export interface AccessPolicy {
  name: string;
  type: 'workflow-restriction' | 'resource-limit' | 'time-restriction' | 'approval-required';
  config: {
    maxFiles?: number;
    maxEdits?: number;
    allowedPaths?: string[];
    blockedPaths?: string[];
    maxCostPerDay?: number;
    workingHours?: { start: string; end: string };
    requiresApproval?: boolean;
    approvers?: string[];
  };
}

export interface ContractorActivity {
  contractorId: string;
  timestamp: Date;
  activity: 'login' | 'workflow-run' | 'file-access' | 'cost-incurred' | 'policy-violation';
  details: {
    workflowId?: string;
    filePath?: string;
    cost?: number;
    violation?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SecurityAlert {
  id: string;
  contractorId: string;
  type: 'access-violation' | 'unusual-activity' | 'cost-threshold' | 'time-violation' | 'suspicious-behavior';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details: any;
  timestamp: Date;
  status: 'open' | 'investigating' | 'resolved' | 'false-positive';
  assignedTo?: string;
  resolvedAt?: Date;
  resolution?: string;
}

export class ContractorManager extends EventEmitter {
  private contractorsFile = '.bcce_contractors.json';
  private grantsFile = '.bcce_access_grants.json';
  private activityFile = '.bcce_contractor_activity.json';
  private alertsFile = '.bcce_security_alerts.json';

  constructor() {
    super();
    this.ensureDataFiles();
  }

  private ensureDataFiles(): void {
    const files = [this.contractorsFile, this.grantsFile, this.activityFile, this.alertsFile];
    files.forEach(file => {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify([], null, 2));
      }
    });
  }

  /**
   * Register a new contractor
   */
  async registerContractor(contractor: Omit<Contractor, 'id'>): Promise<Contractor> {
    const contractors = this.loadContractors();
    
    const newContractor: Contractor = {
      ...contractor,
      id: this.generateContractorId(contractor.name, contractor.email),
    };

    // Validate contractor data
    this.validateContractor(newContractor);

    // Check for conflicts
    const existingContractor = contractors.find(c => c.email === contractor.email);
    if (existingContractor && !this.isExpired(existingContractor)) {
      throw new Error(`Contractor with email ${contractor.email} already has active access`);
    }

    contractors.push(newContractor);
    this.saveContractors(contractors);

    // Log activity
    await this.logActivity(newContractor.id, 'login', {}, 'low');

    // Emit event
    this.emit('contractor-registered', newContractor);

    return newContractor;
  }

  /**
   * Provision temporary access for a contractor
   */
  async provisionAccess(contractorId: string, requestedBy: string): Promise<AccessGrant> {
    const contractor = await this.getContractor(contractorId);
    if (!contractor) {
      throw new Error(`Contractor ${contractorId} not found`);
    }

    if (this.isExpired(contractor)) {
      throw new Error(`Contractor ${contractorId} access has expired`);
    }

    // Generate temporary credentials (in production, this would integrate with AWS STS)
    const credentials = await this.generateTemporaryCredentials(contractor);
    
    // Create access policies based on contractor level
    const policies = this.createAccessPolicies(contractor);
    
    // Determine allowed workflows and projects
    const allowedWorkflows = this.getAllowedWorkflows(contractor);

    const grant: AccessGrant = {
      contractorId,
      grantId: this.generateGrantId(),
      credentials,
      policies,
      workflows: allowedWorkflows,
      projects: contractor.projects,
      expiresAt: contractor.endDate,
      createdAt: new Date(),
      usageCount: 0,
    };

    // Save grant
    const grants = this.loadGrants();
    grants.push(grant);
    this.saveGrants(grants);

    // Log activity
    await this.logActivity(contractorId, 'login', { grantId: grant.grantId }, 'low');

    this.emit('access-granted', grant);

    return grant;
  }

  /**
   * Revoke access for a contractor
   */
  async revokeAccess(contractorId: string, reason: string, revokedBy: string): Promise<void> {
    const grants = this.loadGrants();
    const contractorGrants = grants.filter(g => g.contractorId === contractorId);

    if (contractorGrants.length === 0) {
      throw new Error(`No active grants found for contractor ${contractorId}`);
    }

    // Mark all grants as expired
    grants.forEach(grant => {
      if (grant.contractorId === contractorId) {
        grant.expiresAt = new Date(); // Expire immediately
      }
    });

    this.saveGrants(grants);

    // Log activity
    await this.logActivity(contractorId, 'login', { 
      action: 'revoked', 
      reason, 
      revokedBy 
    }, 'medium');

    // Create security alert
    await this.createAlert(contractorId, 'access-violation', 'medium', 
      `Access revoked: ${reason}`, { revokedBy, reason });

    this.emit('access-revoked', contractorId, reason);
  }

  /**
   * Extend contractor access
   */
  async extendAccess(
    contractorId: string, 
    newEndDate: Date, 
    reason: string, 
    requestedBy: string,
    approvedBy?: string
  ): Promise<void> {
    const contractors = this.loadContractors();
    const contractor = contractors.find(c => c.id === contractorId);
    
    if (!contractor) {
      throw new Error(`Contractor ${contractorId} not found`);
    }

    const extension: ContractorExtension = {
      requestedBy,
      approvedBy,
      originalEndDate: contractor.endDate,
      newEndDate,
      reason,
      status: approvedBy ? 'approved' : 'pending',
      approvedAt: approvedBy ? new Date() : undefined,
    };

    if (!contractor.extensions) {
      contractor.extensions = [];
    }
    contractor.extensions.push(extension);

    if (approvedBy) {
      contractor.endDate = newEndDate;
    }

    this.saveContractors(contractors);

    // Log activity
    await this.logActivity(contractorId, 'login', { 
      action: 'extension-request', 
      newEndDate: newEndDate.toISOString(),
      reason 
    }, 'low');

    this.emit('access-extended', contractorId, extension);
  }

  /**
   * Check if contractor has valid access for a specific action
   */
  async validateAccess(
    contractorId: string, 
    action: 'workflow-run' | 'file-access', 
    context: {
      workflowId?: string;
      filePath?: string;
      cost?: number;
    }
  ): Promise<{ allowed: boolean; reason?: string; warnings?: string[] }> {
    const contractor = await this.getContractor(contractorId);
    if (!contractor) {
      return { allowed: false, reason: 'Contractor not found' };
    }

    if (this.isExpired(contractor)) {
      return { allowed: false, reason: 'Access expired' };
    }

    const grants = this.loadGrants().filter(g => 
      g.contractorId === contractorId && g.expiresAt > new Date()
    );

    if (grants.length === 0) {
      return { allowed: false, reason: 'No valid access grants' };
    }

    const grant = grants[0]; // Use most recent grant
    const warnings: string[] = [];

    // Check policies
    for (const policy of grant.policies) {
      const validation = this.validatePolicy(policy, action, context);
      if (!validation.allowed) {
        return { allowed: false, reason: validation.reason };
      }
      if (validation.warnings) {
        warnings.push(...validation.warnings);
      }
    }

    // Check workflow access
    if (action === 'workflow-run' && context.workflowId) {
      if (!grant.workflows.includes(context.workflowId) && !grant.workflows.includes('*')) {
        return { allowed: false, reason: `Workflow ${context.workflowId} not allowed` };
      }
    }

    // Update usage
    grant.usageCount++;
    grant.lastUsedAt = new Date();
    this.saveGrants([...this.loadGrants().filter(g => g.grantId !== grant.grantId), grant]);

    return { allowed: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Get contractor activity log
   */
  async getContractorActivity(
    contractorId?: string, 
    period?: { start: Date; end: Date }
  ): Promise<ContractorActivity[]> {
    const activities = this.loadActivity();
    
    return activities.filter(activity => {
      if (contractorId && activity.contractorId !== contractorId) return false;
      if (period) {
        if (activity.timestamp < period.start || activity.timestamp > period.end) return false;
      }
      return true;
    });
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(period?: { start: Date; end: Date }): Promise<{
    summary: {
      totalContractors: number;
      activeContractors: number;
      expiredContractors: number;
      totalActivity: number;
      securityAlerts: number;
    };
    contractors: Contractor[];
    activities: ContractorActivity[];
    alerts: SecurityAlert[];
    recommendations: string[];
  }> {
    const contractors = this.loadContractors();
    const activities = await this.getContractorActivity(undefined, period);
    const alerts = this.loadAlerts();

    const activeContractors = contractors.filter(c => !this.isExpired(c));
    const expiredContractors = contractors.filter(c => this.isExpired(c));

    const recommendations = this.generateSecurityRecommendations(contractors, activities, alerts);

    return {
      summary: {
        totalContractors: contractors.length,
        activeContractors: activeContractors.length,
        expiredContractors: expiredContractors.length,
        totalActivity: activities.length,
        securityAlerts: alerts.filter(a => a.status === 'open').length,
      },
      contractors,
      activities,
      alerts,
      recommendations,
    };
  }

  /**
   * Automated cleanup of expired access
   */
  async cleanupExpiredAccess(): Promise<{ 
    expiredContractors: string[]; 
    revokedGrants: string[]; 
  }> {
    const contractors = this.loadContractors();
    const grants = this.loadGrants();
    const now = new Date();

    const expiredContractors = contractors
      .filter(c => c.endDate < now)
      .map(c => c.id);

    const revokedGrants = grants
      .filter(g => g.expiresAt < now)
      .map(g => g.grantId);

    // Archive expired data (in production, would move to archive storage)
    this.archiveExpiredData(expiredContractors, revokedGrants);

    // Log cleanup activity
    for (const contractorId of expiredContractors) {
      await this.logActivity(contractorId, 'login', { action: 'auto-cleanup' }, 'low');
    }

    this.emit('cleanup-completed', { expiredContractors, revokedGrants });

    return { expiredContractors, revokedGrants };
  }

  // Private helper methods

  private generateContractorId(name: string, email: string): string {
    const hash = crypto.createHash('sha256')
      .update(`${name}-${email}-${Date.now()}`)
      .digest('hex');
    return `CTR-${hash.substring(0, 8).toUpperCase()}`;
  }

  private generateGrantId(): string {
    return `AGR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  }

  private async generateTemporaryCredentials(contractor: Contractor): Promise<AccessGrant['credentials']> {
    // In production, this would use AWS STS to generate temporary credentials
    // For now, return placeholder credentials
    return {
      accessKey: `AKIA${crypto.randomBytes(16).toString('hex').toUpperCase()}`,
      secretKey: crypto.randomBytes(32).toString('hex'),
      sessionToken: crypto.randomBytes(64).toString('hex'),
      region: process.env.AWS_REGION || 'us-east-1',
    };
  }

  private createAccessPolicies(contractor: Contractor): AccessPolicy[] {
    const basePolicies: AccessPolicy[] = [
      {
        name: 'time-restriction',
        type: 'time-restriction',
        config: {
          workingHours: { start: '09:00', end: '17:00' },
        },
      },
      {
        name: 'cost-limit',
        type: 'resource-limit',
        config: {
          maxCostPerDay: contractor.accessLevel === 'basic' ? 10 : 
                          contractor.accessLevel === 'standard' ? 50 : 100,
        },
      },
    ];

    // Add role-specific policies
    switch (contractor.role) {
      case 'developer':
        basePolicies.push({
          name: 'file-access',
          type: 'workflow-restriction',
          config: {
            maxFiles: 50,
            maxEdits: 20,
            allowedPaths: contractor.projects.map(p => `${p}/**`),
          },
        });
        break;
      
      case 'reviewer':
        basePolicies.push({
          name: 'review-only',
          type: 'workflow-restriction',
          config: {
            maxFiles: 100,
            maxEdits: 0, // Read-only
            allowedPaths: contractor.projects.map(p => `${p}/**`),
          },
        });
        break;
      
      case 'auditor':
        basePolicies.push({
          name: 'audit-access',
          type: 'workflow-restriction',
          config: {
            maxFiles: 1000,
            maxEdits: 0, // Read-only
            allowedPaths: ['**'], // Full access for auditing
            requiresApproval: true,
            approvers: [contractor.supervisor],
          },
        });
        break;
    }

    return basePolicies;
  }

  private getAllowedWorkflows(contractor: Contractor): string[] {
    const baseWorkflows = ['cost-tracking-demo'];
    
    switch (contractor.role) {
      case 'developer':
        return [...baseWorkflows, 'pr-review-enhanced', 'test-grader'];
      case 'reviewer':
        return [...baseWorkflows, 'security-review', 'pr-review-enhanced'];
      case 'auditor':
        return [...baseWorkflows, 'security-review', '*']; // Full access
      case 'consultant':
        return contractor.projects.map(p => `${p}-*`); // Project-specific
      default:
        return baseWorkflows;
    }
  }

  private validateContractor(contractor: Contractor): void {
    if (!contractor.name || contractor.name.trim().length === 0) {
      throw new Error('Contractor name is required');
    }
    if (!contractor.email || !contractor.email.includes('@')) {
      throw new Error('Valid contractor email is required');
    }
    if (contractor.endDate <= contractor.startDate) {
      throw new Error('End date must be after start date');
    }
    if (contractor.endDate <= new Date()) {
      throw new Error('End date must be in the future');
    }
    if (!contractor.supervisor || !contractor.supervisor.includes('@')) {
      throw new Error('Valid supervisor email is required');
    }
  }

  private isExpired(contractor: Contractor): boolean {
    return contractor.endDate < new Date();
  }

  private validatePolicy(
    policy: AccessPolicy, 
    action: string, 
    context: any
  ): { allowed: boolean; reason?: string; warnings?: string[] } {
    const warnings: string[] = [];

    switch (policy.type) {
      case 'time-restriction':
        if (policy.config.workingHours) {
          const now = new Date();
          const currentHour = now.getHours();
          const startHour = parseInt(policy.config.workingHours.start.split(':')[0]);
          const endHour = parseInt(policy.config.workingHours.end.split(':')[0]);
          
          if (currentHour < startHour || currentHour >= endHour) {
            return { allowed: false, reason: 'Outside working hours' };
          }
        }
        break;

      case 'resource-limit':
        if (policy.config.maxFiles && context.fileCount > policy.config.maxFiles) {
          return { allowed: false, reason: `File access limit exceeded (${policy.config.maxFiles})` };
        }
        if (policy.config.maxCostPerDay && context.cost > policy.config.maxCostPerDay) {
          return { allowed: false, reason: `Daily cost limit exceeded ($${policy.config.maxCostPerDay})` };
        }
        break;

      case 'workflow-restriction':
        if (policy.config.allowedPaths && context.filePath) {
          const isAllowed = policy.config.allowedPaths.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(context.filePath);
          });
          if (!isAllowed) {
            return { allowed: false, reason: 'File path not allowed' };
          }
        }
        break;
    }

    return { allowed: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  private async logActivity(
    contractorId: string, 
    activity: ContractorActivity['activity'], 
    details: ContractorActivity['details'], 
    riskLevel: ContractorActivity['riskLevel']
  ): Promise<void> {
    const activities = this.loadActivity();
    
    const newActivity: ContractorActivity = {
      contractorId,
      timestamp: new Date(),
      activity,
      details,
      riskLevel,
    };

    activities.push(newActivity);
    this.saveActivity(activities);

    // Check for suspicious patterns
    if (riskLevel === 'high' || this.detectSuspiciousActivity(contractorId, activities)) {
      await this.createAlert(contractorId, 'suspicious-behavior', 'high', 
        'Suspicious activity pattern detected', { activity: newActivity });
    }
  }

  private async createAlert(
    contractorId: string,
    type: SecurityAlert['type'],
    severity: SecurityAlert['severity'],
    description: string,
    details: any
  ): Promise<void> {
    const alerts = this.loadAlerts();
    
    const alert: SecurityAlert = {
      id: crypto.randomBytes(8).toString('hex').toUpperCase(),
      contractorId,
      type,
      severity,
      description,
      details,
      timestamp: new Date(),
      status: 'open',
    };

    alerts.push(alert);
    this.saveAlerts(alerts);

    this.emit('security-alert', alert);
  }

  private detectSuspiciousActivity(contractorId: string, activities: ContractorActivity[]): boolean {
    // Simple heuristics for suspicious activity detection
    const recentActivities = activities
      .filter(a => a.contractorId === contractorId)
      .filter(a => Date.now() - a.timestamp.getTime() < 3600000) // Last hour
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Check for rapid successive activities
    if (recentActivities.length > 10) {
      return true;
    }

    // Check for unusual time patterns (activity outside working hours)
    const nightTimeActivities = recentActivities.filter(a => {
      const hour = a.timestamp.getHours();
      return hour < 6 || hour > 22;
    });

    if (nightTimeActivities.length > 3) {
      return true;
    }

    return false;
  }

  private generateSecurityRecommendations(
    contractors: Contractor[], 
    activities: ContractorActivity[], 
    alerts: SecurityAlert[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for contractors nearing expiration
    const soonToExpire = contractors.filter(c => {
      const daysUntilExpiry = (c.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
    });

    if (soonToExpire.length > 0) {
      recommendations.push(`${soonToExpire.length} contractor(s) expiring within 7 days - review access extensions`);
    }

    // Check for high-risk activities
    const highRiskActivities = activities.filter(a => a.riskLevel === 'high');
    if (highRiskActivities.length > 5) {
      recommendations.push('High number of high-risk activities detected - review contractor monitoring');
    }

    // Check for open alerts
    const openAlerts = alerts.filter(a => a.status === 'open');
    if (openAlerts.length > 0) {
      recommendations.push(`${openAlerts.length} open security alert(s) require attention`);
    }

    // Check for contractors without recent activity
    const inactiveContractors = contractors.filter(c => {
      const hasRecentActivity = activities.some(a => 
        a.contractorId === c.id && 
        Date.now() - a.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
      );
      return !this.isExpired(c) && !hasRecentActivity;
    });

    if (inactiveContractors.length > 0) {
      recommendations.push(`${inactiveContractors.length} contractor(s) have no recent activity - consider access review`);
    }

    return recommendations;
  }

  private archiveExpiredData(expiredContractors: string[], revokedGrants: string[]): void {
    // In production, this would move data to archive storage
    // For now, we'll just log the archival
    console.log(`Archived ${expiredContractors.length} expired contractors and ${revokedGrants.length} revoked grants`);
  }

  private async getContractor(contractorId: string): Promise<Contractor | null> {
    const contractors = this.loadContractors();
    return contractors.find(c => c.id === contractorId) || null;
  }

  // Data persistence methods
  private loadContractors(): Contractor[] {
    try {
      const data = fs.readFileSync(this.contractorsFile, 'utf-8');
      return JSON.parse(data).map((c: any) => ({
        ...c,
        startDate: new Date(c.startDate),
        endDate: new Date(c.endDate),
        extensions: c.extensions?.map((e: any) => ({
          ...e,
          originalEndDate: new Date(e.originalEndDate),
          newEndDate: new Date(e.newEndDate),
          approvedAt: e.approvedAt ? new Date(e.approvedAt) : undefined,
        })),
      }));
    } catch {
      return [];
    }
  }

  private saveContractors(contractors: Contractor[]): void {
    fs.writeFileSync(this.contractorsFile, JSON.stringify(contractors, null, 2));
  }

  private loadGrants(): AccessGrant[] {
    try {
      const data = fs.readFileSync(this.grantsFile, 'utf-8');
      return JSON.parse(data).map((g: any) => ({
        ...g,
        expiresAt: new Date(g.expiresAt),
        createdAt: new Date(g.createdAt),
        lastUsedAt: g.lastUsedAt ? new Date(g.lastUsedAt) : undefined,
      }));
    } catch {
      return [];
    }
  }

  private saveGrants(grants: AccessGrant[]): void {
    fs.writeFileSync(this.grantsFile, JSON.stringify(grants, null, 2));
  }

  private loadActivity(): ContractorActivity[] {
    try {
      const data = fs.readFileSync(this.activityFile, 'utf-8');
      return JSON.parse(data).map((a: any) => ({
        ...a,
        timestamp: new Date(a.timestamp),
      }));
    } catch {
      return [];
    }
  }

  private saveActivity(activities: ContractorActivity[]): void {
    fs.writeFileSync(this.activityFile, JSON.stringify(activities, null, 2));
  }

  private loadAlerts(): SecurityAlert[] {
    try {
      const data = fs.readFileSync(this.alertsFile, 'utf-8');
      return JSON.parse(data).map((a: any) => ({
        ...a,
        timestamp: new Date(a.timestamp),
        resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : undefined,
      }));
    } catch {
      return [];
    }
  }

  private saveAlerts(alerts: SecurityAlert[]): void {
    fs.writeFileSync(this.alertsFile, JSON.stringify(alerts, null, 2));
  }
}

// Export singleton instance
export const contractorManager = new ContractorManager();