/**
 * HTTP Request Logging Middleware
 * 
 * Structured logging for all HTTP requests with timing and metrics.
 */

import * as http from 'http';
import { metricsRegistry } from './metrics.js';

export interface RequestLogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  userAgent?: string;
  ip?: string;
  error?: string;
}

/**
 * Request logging wrapper for HTTP handler
 * 
 * Wraps an HTTP request handler with logging and metrics collection.
 */
export function withRequestLogger(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const startTime = Date.now();
    const method = req.method || 'UNKNOWN';
    const path = req.url || '/';

    // Capture original end function
    const originalEnd = res.end.bind(res);
    let endCalled = false;

    // Override res.end to capture response
    (res.end as any) = function(...args: any[]): any {
      if (endCalled) return;
      endCalled = true;

      const duration = (Date.now() - startTime) / 1000; // seconds
      const status = res.statusCode;

      // Log request
      const logEntry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        method,
        path,
        status,
        duration,
        userAgent: req.headers['user-agent'],
        ip: (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || req.socket.remoteAddress
      };

      console.log(`[HTTP] ${method} ${path} ${status} ${duration.toFixed(3)}s`, JSON.stringify(logEntry));

      // Update metrics
      metricsRegistry.incCounter('http_requests_total', { method, path, status: status.toString() });
      metricsRegistry.observeHistogram('http_request_duration_seconds', { method, path }, duration);

      if (status >= 400) {
        metricsRegistry.incCounter('http_errors_total', { method, path, status: status.toString() });
      }

      return (originalEnd as Function)(...args);
    };

    try {
      await handler(req, res);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const status = 500;

      const logEntry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        method,
        path,
        status,
        duration,
        error: error instanceof Error ? error.message : String(error)
      };

      console.error(`[HTTP ERROR] ${method} ${path} ${status} ${duration.toFixed(3)}s`, JSON.stringify(logEntry));

      metricsRegistry.incCounter('http_requests_total', { method, path, status: status.toString() });
      metricsRegistry.incCounter('http_errors_total', { method, path, status: status.toString() });
      metricsRegistry.observeHistogram('http_request_duration_seconds', { method, path }, duration);

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  };
}
