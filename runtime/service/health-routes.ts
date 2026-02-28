/**
 * Health Check API Routes
 * 
 * Exposes health check endpoints for monitoring and load balancers:
 * - GET /health - Aggregated system health
 * - GET /health/:component - Specific component health
 * - GET /health/circuit-breakers - Circuit breaker status
 * - GET /ready - Readiness probe (k8s compatible)
 * - GET /live - Liveness probe (k8s compatible)
 */

import * as http from 'http';
import { healthChecker, HealthStatus, StandardHealthChecks } from '../resilience/health-check.js';
import { circuitBreakers } from '../resilience/circuit-breaker.js';

/**
 * Initialize health checks for Zo-Qore components
 */
export function initializeHealthChecks(projectsPath: string): void {
  // Filesystem check
  healthChecker.register('filesystem', StandardHealthChecks.filesystem(projectsPath));

  // Memory check (warn at 85%)
  healthChecker.register('memory', StandardHealthChecks.memory(85));

  // Event loop lag check (warn at 50ms)
  healthChecker.register('eventLoop', StandardHealthChecks.eventLoop(50));

  // Store availability checks
  healthChecker.register(
    'voidStore',
    StandardHealthChecks.store('VoidStore', async () => {
      const fs = await import('fs/promises');
      await fs.access(projectsPath);
    })
  );

  healthChecker.register(
    'revealStore',
    StandardHealthChecks.store('RevealStore', async () => {
      const fs = await import('fs/promises');
      await fs.access(projectsPath);
    })
  );

  healthChecker.register(
    'constellationStore',
    StandardHealthChecks.store('ConstellationStore', async () => {
      const fs = await import('fs/promises');
      await fs.access(projectsPath);
    })
  );

  healthChecker.register(
    'pathStore',
    StandardHealthChecks.store('PathStore', async () => {
      const fs = await import('fs/promises');
      await fs.access(projectsPath);
    })
  );

  healthChecker.register(
    'riskStore',
    StandardHealthChecks.store('RiskStore', async () => {
      const fs = await import('fs/promises');
      await fs.access(projectsPath);
    })
  );

  healthChecker.register(
    'autonomyStore',
    StandardHealthChecks.store('AutonomyStore', async () => {
      const fs = await import('fs/promises');
      await fs.access(projectsPath);
    })
  );

  console.log('[HealthCheck] Initialized health checks for all components');
}

/**
 * GET /health - Full system health check
 */
export async function getSystemHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const health = await healthChecker.checkAll();

    // Set HTTP status based on health status
    const statusCode =
      health.status === HealthStatus.HEALTHY
        ? 200
        : health.status === HealthStatus.DEGRADED
        ? 200 // Degraded but still operational
        : 503; // Unhealthy = service unavailable

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: HealthStatus.UNHEALTHY,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * GET /health/:component - Specific component health
 */
export async function getComponentHealth(req: http.IncomingMessage, res: http.ServerResponse, component: string): Promise<void> {
  try {
    const result = await healthChecker.checkComponent(component);

    const statusCode =
      result.status === HealthStatus.HEALTHY
        ? 200
        : result.status === HealthStatus.DEGRADED
        ? 200
        : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: HealthStatus.UNHEALTHY,
      componentName: component,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * GET /health/circuit-breakers - Circuit breaker status
 */
export function getCircuitBreakerStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
  const status = circuitBreakers.getAllStatus();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    timestamp: Date.now(),
    circuitBreakers: status,
    count: status.length,
  }));
}

/**
 * GET /ready - Readiness probe (Kubernetes compatible)
 * Returns 200 if system is ready to accept traffic, 503 otherwise
 */
export async function getReadinessProbe(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const health = await healthChecker.checkAll();

    // Ready if healthy or degraded (can still serve requests)
    if (health.status === HealthStatus.UNHEALTHY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: false, reason: 'System unhealthy' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true }));
    }
  } catch (error) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * GET /live - Liveness probe (Kubernetes compatible)
 * Returns 200 if process is alive, 503 if it should be restarted
 */
export function getLivenessProbe(req: http.IncomingMessage, res: http.ServerResponse): void {
  // Simple liveness: if we can respond, we're alive
  // More sophisticated checks could verify event loop not blocked, etc.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ alive: true }));
}

/**
 * GET /health/cache - Fast cached health status (no actual checks)
 */
export function getCachedHealth(req: http.IncomingMessage, res: http.ServerResponse): void {
  const health = healthChecker.getCachedResults();

  const statusCode =
    health.status === HealthStatus.HEALTHY
      ? 200
      : health.status === HealthStatus.DEGRADED
      ? 200
      : 503;

  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health));
}
