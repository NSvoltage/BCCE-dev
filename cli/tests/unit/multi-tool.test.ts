/**
 * Unit Tests for Multi-Tool Intelligence
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { MultiToolIntelligence, ClaudeCodeCollector, CursorCollector } from '../../src/lib/intelligence/multi-tool';

describe('MultiToolIntelligence', () => {
  let multiTool: MultiToolIntelligence;

  beforeEach(() => {
    multiTool = new MultiToolIntelligence();
  });

  describe('Tool Registration', () => {
    test('should register default collectors', () => {
      const availableTools = multiTool.getAvailableTools();
      expect(availableTools).resolves.toContain('claude-code');
      expect(availableTools).resolves.toContain('cursor');
      expect(availableTools).resolves.toContain('github-copilot');
      expect(availableTools).resolves.toContain('continue');
    });

    test('should register custom collectors', () => {
      const customCollector = new ClaudeCodeCollector();
      multiTool.registerCollector(customCollector);
      
      expect(multiTool.getAvailableTools()).resolves.toContain('claude-code');
    });

    test('should emit collector-registered event', (done) => {
      multiTool.on('collector-registered', (name) => {
        expect(name).toBe('test-collector');
        done();
      });
      
      const testCollector = new ClaudeCodeCollector();
      (testCollector as any).name = 'test-collector';
      multiTool.registerCollector(testCollector);
    });
  });

  describe('Metrics Collection', () => {
    test('should collect metrics from all available tools', async () => {
      const period = {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      };
      
      const metrics = await multiTool.collectMetrics(period);
      
      expect(metrics).toHaveProperty('period');
      expect(metrics).toHaveProperty('tools');
      expect(metrics).toHaveProperty('aggregated');
      expect(metrics).toHaveProperty('insights');
    });

    test('should handle unavailable tools gracefully', async () => {
      // Mock a collector that's not available
      const mockCollector = {
        name: 'unavailable-tool',
        version: '1.0.0',
        isAvailable: jest.fn().mockResolvedValue(false),
        collect: jest.fn(),
        getRealtimeMetrics: jest.fn()
      };
      
      multiTool.registerCollector(mockCollector as any);
      
      const metrics = await multiTool.collectMetrics();
      
      expect(metrics.tools.has('unavailable-tool')).toBe(false);
    });

    test('should cache metrics for performance', async () => {
      const spy = jest.spyOn(ClaudeCodeCollector.prototype, 'collect');
      
      // First call
      await multiTool.collectMetrics();
      // Second call with same period
      await multiTool.collectMetrics();
      
      // Should not call collect again due to caching
      expect(spy).toHaveBeenCalledTimes(1);
      
      spy.mockRestore();
    });
  });

  describe('Productivity Scoring', () => {
    test('should calculate productivity score correctly', async () => {
      const metrics = await multiTool.collectMetrics();
      
      expect(metrics.aggregated.productivityScore).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.aggregated.productivityScore).toBe('number');
    });

    test('should calculate efficiency rating correctly', async () => {
      const metrics = await multiTool.collectMetrics();
      
      expect(metrics.aggregated.efficiencyRating).toBeGreaterThanOrEqual(0);
      expect(metrics.aggregated.efficiencyRating).toBeLessThanOrEqual(100);
    });
  });

  describe('Insights Generation', () => {
    test('should identify most efficient tool', async () => {
      const metrics = await multiTool.collectMetrics();
      
      expect(metrics.insights.mostEfficient).toBeDefined();
      expect(typeof metrics.insights.mostEfficient).toBe('string');
    });

    test('should identify most productive tool', async () => {
      const metrics = await multiTool.collectMetrics();
      
      expect(metrics.insights.mostProductive).toBeDefined();
      expect(typeof metrics.insights.mostProductive).toBe('string');
    });

    test('should generate recommendations', async () => {
      const metrics = await multiTool.collectMetrics();
      
      expect(Array.isArray(metrics.insights.recommendations)).toBe(true);
    });
  });

  describe('Tool Selection Optimization', () => {
    test('should recommend appropriate tool for simple tasks', async () => {
      const task = {
        type: 'documentation' as const,
        complexity: 'simple' as const,
        language: 'markdown',
        estimatedLines: 20,
        timeEstimate: 30,
        context: 'Simple documentation update'
      };
      
      const recommendation = await multiTool.optimizeToolSelection(task);
      
      expect(recommendation).toHaveProperty('type', 'tool-switch');
      expect(recommendation).toHaveProperty('title');
      expect(recommendation).toHaveProperty('description');
      expect(recommendation).toHaveProperty('implementation');
    });

    test('should recommend Claude Code for complex tasks', async () => {
      const task = {
        type: 'refactor' as const,
        complexity: 'complex' as const,
        language: 'typescript',
        estimatedLines: 500,
        timeEstimate: 180,
        context: 'Complex refactoring task'
      };
      
      const recommendation = await multiTool.optimizeToolSelection(task);
      
      expect(recommendation.description).toContain('claude-code');
    });
  });

  describe('Export Functionality', () => {
    test('should export metrics in JSON format', async () => {
      const jsonData = await multiTool.exportMetrics('json');
      const parsed = JSON.parse(jsonData);
      
      expect(parsed).toHaveProperty('period');
      expect(parsed).toHaveProperty('tools');
      expect(parsed).toHaveProperty('aggregated');
    });

    test('should export metrics in CSV format', async () => {
      const csvData = await multiTool.exportMetrics('csv');
      
      expect(csvData).toContain('tool,timestamp,cost');
      expect(csvData.split('\n').length).toBeGreaterThan(1);
    });
  });

  describe('Real-time Monitoring', () => {
    test('should start real-time monitoring', async () => {
      await multiTool.startRealtimeMonitoring();
      
      expect((multiTool as any)._monitoringInterval).toBeDefined();
      
      multiTool.stopRealtimeMonitoring();
    });

    test('should stop real-time monitoring', () => {
      multiTool.startRealtimeMonitoring();
      multiTool.stopRealtimeMonitoring();
      
      expect((multiTool as any)._monitoringInterval).toBeUndefined();
    });

    test('should emit realtime-metrics events', (done) => {
      multiTool.on('realtime-metrics', (toolName, metrics) => {
        expect(typeof toolName).toBe('string');
        expect(metrics).toHaveProperty('tool');
        multiTool.stopRealtimeMonitoring();
        done();
      });
      
      multiTool.startRealtimeMonitoring();
      
      // Simulate metric emission
      setTimeout(() => {
        multiTool.emit('realtime-metrics', 'test-tool', {
          tool: 'test-tool',
          timestamp: new Date(),
          usage: { activeTime: 1000, tokensProcessed: 100, requestCount: 1 },
          productivity: { linesGenerated: 10, linesModified: 5, filesAffected: 1 },
          cost: { estimatedCost: 0.01 },
          context: { user: 'test' }
        });
      }, 100);
    });
  });
});

describe('ClaudeCodeCollector', () => {
  let collector: ClaudeCodeCollector;

  beforeEach(() => {
    collector = new ClaudeCodeCollector();
  });

  test('should have correct name and version', () => {
    expect(collector.name).toBe('claude-code');
    expect(collector.version).toBe('1.0.0');
  });

  test('should check availability correctly', async () => {
    const available = await collector.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  test('should collect metrics from BCCE runs', async () => {
    const period = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date()
    };
    
    const metrics = await collector.collect(period);
    
    expect(Array.isArray(metrics)).toBe(true);
  });

  test('should handle missing run directories gracefully', async () => {
    const metrics = await collector.collect();
    
    // Should not throw error, just return empty array
    expect(Array.isArray(metrics)).toBe(true);
  });
});

describe('CursorCollector', () => {
  let collector: CursorCollector;

  beforeEach(() => {
    collector = new CursorCollector();
  });

  test('should have correct name and version', () => {
    expect(collector.name).toBe('cursor');
    expect(collector.version).toBe('1.0.0');
  });

  test('should check for Cursor installation', async () => {
    const available = await collector.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  test('should return placeholder metrics', async () => {
    const metrics = await collector.collect();
    
    expect(Array.isArray(metrics)).toBe(true);
    if (metrics.length > 0) {
      expect(metrics[0]).toHaveProperty('tool', 'cursor');
      expect(metrics[0]).toHaveProperty('usage');
      expect(metrics[0]).toHaveProperty('productivity');
    }
  });
});