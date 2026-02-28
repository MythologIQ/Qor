/**
 * Metrics API Routes
 * 
 * Exposes Prometheus-compatible metrics endpoint and JSON metrics API.
 */

import * as http from 'http';
import { metricsRegistry } from '../monitoring/metrics.js';

/**
 * GET /metrics
 * Prometheus-compatible metrics export (text format)
 */
export function getMetricsPrometheus(req: http.IncomingMessage, res: http.ServerResponse): void {
  const metrics = metricsRegistry.export();
  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
  });
  res.end(metrics);
}

/**
 * GET /metrics/json
 * JSON-formatted metrics export
 */
export function getMetricsJSON(req: http.IncomingMessage, res: http.ServerResponse): void {
  const metrics = metricsRegistry.exportJSON();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: metrics, meta: { timestamp: Date.now() } }));
}

/**
 * POST /metrics/reset
 * Reset all metrics (for testing/development)
 */
export function resetMetrics(req: http.IncomingMessage, res: http.ServerResponse): void {
  metricsRegistry.reset();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: { message: 'Metrics reset successfully' } }));
}
