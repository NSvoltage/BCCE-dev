/**
 * Unit Tests for Cost Intelligence Engine
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CostIntelligenceEngine } from '../../src/lib/intelligence/cost-engine';

describe('CostIntelligenceEngine', () => {
  let costEngine: CostIntelligenceEngine;

  beforeEach(() => {
    costEngine = new CostIntelligenceEngine();
  });

  describe('Token Calculation', () => {
    test('should calculate input tokens correctly', () => {
      const usage = {
        prompt: 'This is a test prompt with some content',
        model: 'claude-3-haiku',
        response: { usage: { input_tokens: 10 } }
      };
      
      const metrics = costEngine.trackUsage(
        { prompt: usage.prompt },
        usage.response
      );
      
      expect(metrics).toBeDefined();
      expect(metrics.tokenUsage.inputTokens).toBeGreaterThan(0);
    });

    test('should handle empty prompts', () => {
      const metrics = costEngine.trackUsage(
        { prompt: '' },
        { usage: { input_tokens: 0, output_tokens: 0 } }
      );
      
      expect(metrics.tokenUsage.inputTokens).toBe(0);
      expect(metrics.tokenUsage.outputTokens).toBe(0);
    });

    test('should estimate tokens from text when not provided', () => {
      const longText = 'a'.repeat(4000); // ~1000 tokens
      const metrics = costEngine.trackUsage(
        { prompt: longText },
        {} // No usage data
      );
      
      expect(metrics.tokenUsage.inputTokens).toBeGreaterThan(900);
      expect(metrics.tokenUsage.inputTokens).toBeLessThan(1100);
    });
  });

  describe('Cost Calculation', () => {
    test('should calculate Haiku costs correctly', () => {
      const metrics = costEngine.trackUsage(
        { model: 'claude-3-haiku' },
        { usage: { input_tokens: 1000, output_tokens: 2000 } }
      );
      
      // Haiku: $0.25 per 1M input, $1.25 per 1M output
      const expectedCost = (1000 * 0.25 / 1000000) + (2000 * 1.25 / 1000000);
      expect(metrics.totalCost).toBeCloseTo(expectedCost, 6);
    });

    test('should calculate Sonnet costs correctly', () => {
      const metrics = costEngine.trackUsage(
        { model: 'claude-3-5-sonnet' },
        { usage: { input_tokens: 1000, output_tokens: 2000 } }
      );
      
      // Sonnet: $3 per 1M input, $15 per 1M output
      const expectedCost = (1000 * 3 / 1000000) + (2000 * 15 / 1000000);
      expect(metrics.totalCost).toBeCloseTo(expectedCost, 6);
    });

    test('should calculate Opus costs correctly', () => {
      const metrics = costEngine.trackUsage(
        { model: 'claude-3-opus' },
        { usage: { input_tokens: 1000, output_tokens: 2000 } }
      );
      
      // Opus: $15 per 1M input, $75 per 1M output
      const expectedCost = (1000 * 15 / 1000000) + (2000 * 75 / 1000000);
      expect(metrics.totalCost).toBeCloseTo(expectedCost, 6);
    });

    test('should use default pricing for unknown models', () => {
      const metrics = costEngine.trackUsage(
        { model: 'unknown-model' },
        { usage: { input_tokens: 1000, output_tokens: 1000 } }
      );
      
      expect(metrics.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Optimization Recommendations', () => {
    test('should recommend model downgrade for simple tasks', async () => {
      // Simulate expensive model for simple task
      costEngine.trackUsage(
        { model: 'claude-3-opus', prompt: 'What is 2+2?' },
        { usage: { input_tokens: 10, output_tokens: 5 } }
      );
      
      const recommendations = await costEngine.generateOptimizationRecommendations();
      
      expect(recommendations).toContainEqual(
        expect.objectContaining({
          type: 'model-downgrade'
        })
      );
    });

    test('should identify caching opportunities', async () => {
      // Simulate repeated similar requests
      const similarPrompt = 'Explain concept X';
      for (let i = 0; i < 5; i++) {
        costEngine.trackUsage(
          { prompt: similarPrompt },
          { usage: { input_tokens: 100, output_tokens: 200 } }
        );
      }
      
      const recommendations = await costEngine.generateOptimizationRecommendations();
      
      expect(recommendations).toContainEqual(
        expect.objectContaining({
          type: 'caching'
        })
      );
    });

    test('should suggest batching for small requests', async () => {
      // Simulate many small requests
      for (let i = 0; i < 10; i++) {
        costEngine.trackUsage(
          { prompt: `Small request ${i}` },
          { usage: { input_tokens: 5, output_tokens: 5 } }
        );
      }
      
      const recommendations = await costEngine.generateOptimizationRecommendations();
      
      expect(recommendations).toContainEqual(
        expect.objectContaining({
          type: 'batching'
        })
      );
    });
  });

  describe('Report Generation', () => {
    test('should generate cost report with correct period', async () => {
      // Add some test data
      costEngine.trackUsage(
        { model: 'claude-3-haiku' },
        { usage: { input_tokens: 1000, output_tokens: 1000 } }
      );
      
      const report = await costEngine.generateCostReport(7);
      
      expect(report).toHaveProperty('period');
      expect(report.period.days).toBe(7);
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('breakdown');
    });

    test('should calculate daily averages correctly', async () => {
      // Add metrics over multiple days
      for (let i = 0; i < 7; i++) {
        costEngine.trackUsage(
          { model: 'claude-3-haiku' },
          { usage: { input_tokens: 1000, output_tokens: 1000 } }
        );
      }
      
      const report = await costEngine.generateCostReport(7);
      
      expect(report.summary.averageDailyCost).toBeGreaterThan(0);
      expect(report.summary.averageDailyCost).toBeLessThan(report.summary.totalCost);
    });

    test('should break down costs by model', async () => {
      costEngine.trackUsage(
        { model: 'claude-3-haiku' },
        { usage: { input_tokens: 1000, output_tokens: 1000 } }
      );
      
      costEngine.trackUsage(
        { model: 'claude-3-5-sonnet' },
        { usage: { input_tokens: 1000, output_tokens: 1000 } }
      );
      
      const report = await costEngine.generateCostReport(7);
      
      expect(report.breakdown.byModel).toHaveProperty('claude-3-haiku');
      expect(report.breakdown.byModel).toHaveProperty('claude-3-5-sonnet');
    });
  });

  describe('Event Emission', () => {
    test('should emit cost-tracked event', (done) => {
      costEngine.on('cost-tracked', (metrics) => {
        expect(metrics).toHaveProperty('totalCost');
        expect(metrics).toHaveProperty('tokenUsage');
        done();
      });
      
      costEngine.trackUsage(
        { model: 'claude-3-haiku' },
        { usage: { input_tokens: 100, output_tokens: 100 } }
      );
    });

    test('should emit optimization-available event', (done) => {
      costEngine.on('optimization-available', (recommendations) => {
        expect(Array.isArray(recommendations)).toBe(true);
        done();
      });
      
      // Trigger optimization by using expensive model
      costEngine.trackUsage(
        { model: 'claude-3-opus', prompt: 'simple' },
        { usage: { input_tokens: 10, output_tokens: 10 } }
      );
      
      costEngine.generateOptimizationRecommendations();
    });
  });

  describe('Export Functionality', () => {
    test('should export to JSON format', async () => {
      costEngine.trackUsage(
        { model: 'claude-3-haiku' },
        { usage: { input_tokens: 1000, output_tokens: 1000 } }
      );
      
      const json = await costEngine.exportMetrics('json');
      const data = JSON.parse(json);
      
      expect(data).toHaveProperty('metrics');
      expect(Array.isArray(data.metrics)).toBe(true);
    });

    test('should export to CSV format', async () => {
      costEngine.trackUsage(
        { model: 'claude-3-haiku' },
        { usage: { input_tokens: 1000, output_tokens: 1000 } }
      );
      
      const csv = await costEngine.exportMetrics('csv');
      
      expect(csv).toContain('timestamp');
      expect(csv).toContain('model');
      expect(csv).toContain('totalCost');
    });
  });
});