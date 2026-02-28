import { describe, it, expect, beforeEach } from 'vitest';
import { metricsRegistry } from '../../runtime/monitoring/metrics.js';

describe('Metrics Registry', () => {
  beforeEach(() => {
    metricsRegistry.reset();
  });

  describe('Counter Metrics', () => {
    it('should register and increment counters', () => {
      metricsRegistry.registerCounter('test_counter', 'Test counter');
      metricsRegistry.incCounter('test_counter');
      metricsRegistry.incCounter('test_counter', {}, 5);

      const exported = metricsRegistry.export();
      expect(exported).toContain('test_counter 6');
    });

    it('should support labeled counters', () => {
      metricsRegistry.registerCounter('http_requests', 'HTTP requests', { method: 'GET', path: '/api' });
      metricsRegistry.incCounter('http_requests', { method: 'GET', path: '/api' }, 3);
      metricsRegistry.incCounter('http_requests', { method: 'POST', path: '/api' }, 2);

      const exported = metricsRegistry.export();
      expect(exported).toContain('http_requests{method="GET",path="/api"} 3');
      expect(exported).toContain('http_requests{method="POST",path="/api"} 2');
    });

    it('should export counter metadata', () => {
      metricsRegistry.registerCounter('test_counter', 'A test counter');
      metricsRegistry.incCounter('test_counter');

      const exported = metricsRegistry.export();
      expect(exported).toContain('# HELP test_counter A test counter');
      expect(exported).toContain('# TYPE test_counter counter');
    });
  });

  describe('Gauge Metrics', () => {
    it('should register and set gauges', () => {
      metricsRegistry.registerGauge('test_gauge', 'Test gauge');
      metricsRegistry.setGauge('test_gauge', {}, 42);

      const exported = metricsRegistry.export();
      expect(exported).toContain('test_gauge 42');
    });

    it('should increment and decrement gauges', () => {
      metricsRegistry.registerGauge('test_gauge', 'Test gauge');
      metricsRegistry.setGauge('test_gauge', {}, 10);
      metricsRegistry.incGauge('test_gauge', {}, 5);
      metricsRegistry.decGauge('test_gauge', {}, 3);

      const exported = metricsRegistry.export();
      expect(exported).toContain('test_gauge 12');
    });

    it('should support labeled gauges', () => {
      metricsRegistry.registerGauge('memory_usage', 'Memory usage', { type: 'heap' });
      metricsRegistry.setGauge('memory_usage', { type: 'heap' }, 1024);
      metricsRegistry.setGauge('memory_usage', { type: 'rss' }, 2048);

      const exported = metricsRegistry.export();
      expect(exported).toContain('memory_usage{type="heap"} 1024');
      expect(exported).toContain('memory_usage{type="rss"} 2048');
    });
  });

  describe('Histogram Metrics', () => {
    it('should register and observe histograms', () => {
      const buckets = [0.1, 0.5, 1, 5];
      metricsRegistry.registerHistogram('test_histogram', 'Test histogram', buckets);
      
      metricsRegistry.observeHistogram('test_histogram', {}, 0.05);
      metricsRegistry.observeHistogram('test_histogram', {}, 0.3);
      metricsRegistry.observeHistogram('test_histogram', {}, 0.7);
      metricsRegistry.observeHistogram('test_histogram', {}, 2);

      const exported = metricsRegistry.export();
      expect(exported).toContain('test_histogram_bucket{le="0.1"} 1');
      expect(exported).toContain('test_histogram_bucket{le="0.5"} 2');
      expect(exported).toContain('test_histogram_bucket{le="1"} 3');
      expect(exported).toContain('test_histogram_bucket{le="5"} 4');
      expect(exported).toContain('test_histogram_bucket{le="+Inf"} 4');
      expect(exported).toContain('test_histogram_sum 3.05');
      expect(exported).toContain('test_histogram_count 4');
    });

    it('should support labeled histograms', () => {
      const buckets = [0.1, 1];
      metricsRegistry.registerHistogram('request_duration', 'Request duration', buckets, { method: 'GET' });
      
      metricsRegistry.observeHistogram('request_duration', { method: 'GET' }, 0.05);
      metricsRegistry.observeHistogram('request_duration', { method: 'GET' }, 0.15);

      const exported = metricsRegistry.export();
      expect(exported).toContain('request_duration_bucket{method="GET",le="0.1"} 1');
      expect(exported).toContain('request_duration_bucket{method="GET",le="1"} 2');
    });
  });

  describe('JSON Export', () => {
    it('should export metrics as JSON', () => {
      metricsRegistry.registerCounter('test_counter', 'Test counter');
      metricsRegistry.incCounter('test_counter', {}, 5);

      metricsRegistry.registerGauge('test_gauge', 'Test gauge');
      metricsRegistry.setGauge('test_gauge', {}, 42);

      const metrics = metricsRegistry.exportJSON();
      
      const counter = metrics.find(m => m.name === 'test_counter');
      expect(counter).toBeDefined();
      expect(counter?.type).toBe('counter');
      expect(counter?.value).toBe(5);

      const gauge = metrics.find(m => m.name === 'test_gauge');
      expect(gauge).toBeDefined();
      expect(gauge?.type).toBe('gauge');
      expect(gauge?.value).toBe(42);
    });

    it('should include histogram buckets in JSON export', () => {
      const buckets = [0.1, 1];
      metricsRegistry.registerHistogram('test_histogram', 'Test histogram', buckets);
      metricsRegistry.observeHistogram('test_histogram', {}, 0.05);
      metricsRegistry.observeHistogram('test_histogram', {}, 0.5);

      const metrics = metricsRegistry.exportJSON();
      const histogram = metrics.find(m => m.name === 'test_histogram');
      
      expect(histogram).toBeDefined();
      expect(histogram?.type).toBe('histogram');
      expect((histogram as any).buckets).toEqual([
        { le: 0.1, count: 1 },
        { le: 1, count: 2 }
      ]);
      expect((histogram as any).sum).toBe(0.55);
      expect((histogram as any).count).toBe(2);
    });
  });

  describe('Prometheus Format', () => {
    it('should export valid Prometheus text format', () => {
      metricsRegistry.registerCounter('test_counter', 'Test counter');
      metricsRegistry.incCounter('test_counter', {}, 5);

      const exported = metricsRegistry.export();
      
      expect(exported).toContain('# HELP');
      expect(exported).toContain('# TYPE');
      expect(exported).toMatch(/test_counter \d+/);
      expect(exported.endsWith('\n')).toBe(true);
    });

    it('should properly escape label values', () => {
      metricsRegistry.registerCounter('test_counter', 'Test counter', { path: '/api/test' });
      metricsRegistry.incCounter('test_counter', { path: '/api/test' });

      const exported = metricsRegistry.export();
      expect(exported).toContain('path="/api/test"');
    });
  });

  describe('Reset', () => {
    it('should clear all metrics', () => {
      metricsRegistry.registerCounter('test_counter', 'Test counter');
      metricsRegistry.incCounter('test_counter', {}, 5);
      
      metricsRegistry.registerGauge('test_gauge', 'Test gauge');
      metricsRegistry.setGauge('test_gauge', {}, 42);

      metricsRegistry.reset();

      const exported = metricsRegistry.export();
      expect(exported).toBe('\n');

      const metrics = metricsRegistry.exportJSON();
      expect(metrics).toEqual([]);
    });
  });
});
