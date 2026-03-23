/**
 * Health Check System
 * 
 * Provides standardized health checks for monitoring system components.
 * Supports:
 * - Individual component health checks
 * - Aggregated system health
 * - Dependencies tracking
 * - Status levels (healthy, degraded, unhealthy)
 */

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

export interface HealthCheckResult {
  status: HealthStatus;
  componentName: string;
  timestamp: number;
  responseTimeMs?: number;
  message?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: number;
  components: HealthCheckResult[];
  uptime: number;
  version: string;
}

export type HealthCheckFn = () => Promise<Omit<HealthCheckResult, 'componentName' | 'timestamp'>>;

export class HealthChecker {
  private checks = new Map<string, HealthCheckFn>();
  private lastResults = new Map<string, HealthCheckResult>();
  private startTime = Date.now();
  private version: string;

  constructor(version: string = '2.0.0') {
    this.version = version;
  }

  /**
   * Register a health check for a component
   */
  register(componentName: string, checkFn: HealthCheckFn): void {
    this.checks.set(componentName, checkFn);
  }

  /**
   * Run all health checks
   */
  async checkAll(): Promise<SystemHealth> {
    const results = await Promise.all(
      Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
        const startTime = Date.now();
        try {
          const result = await Promise.race([
            checkFn(),
            this.timeout(5000, name), // 5s timeout per check
          ]);
          const responseTimeMs = Date.now() - startTime;

          const fullResult: HealthCheckResult = {
            ...result,
            componentName: name,
            timestamp: Date.now(),
            responseTimeMs,
          };

          this.lastResults.set(name, fullResult);
          return fullResult;
        } catch (error) {
          const failureResult: HealthCheckResult = {
            status: HealthStatus.UNHEALTHY,
            componentName: name,
            timestamp: Date.now(),
            responseTimeMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          };

          this.lastResults.set(name, failureResult);
          return failureResult;
        }
      })
    );

    // Aggregate status: unhealthy if any unhealthy, degraded if any degraded, else healthy
    let aggregateStatus = HealthStatus.HEALTHY;
    for (const result of results) {
      if (result.status === HealthStatus.UNHEALTHY) {
        aggregateStatus = HealthStatus.UNHEALTHY;
        break;
      }
      if (result.status === HealthStatus.DEGRADED) {
        aggregateStatus = HealthStatus.DEGRADED;
      }
    }

    return {
      status: aggregateStatus,
      timestamp: Date.now(),
      components: results,
      uptime: Date.now() - this.startTime,
      version: this.version,
    };
  }

  /**
   * Check a specific component
   */
  async checkComponent(componentName: string): Promise<HealthCheckResult> {
    const checkFn = this.checks.get(componentName);
    if (!checkFn) {
      throw new Error(`Health check not registered: ${componentName}`);
    }

    const startTime = Date.now();
    try {
      const result = await Promise.race([
        checkFn(),
        this.timeout(5000, componentName),
      ]);

      const fullResult: HealthCheckResult = {
        ...result,
        componentName,
        timestamp: Date.now(),
        responseTimeMs: Date.now() - startTime,
      };

      this.lastResults.set(componentName, fullResult);
      return fullResult;
    } catch (error) {
      const failureResult: HealthCheckResult = {
        status: HealthStatus.UNHEALTHY,
        componentName,
        timestamp: Date.now(),
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };

      this.lastResults.set(componentName, failureResult);
      return failureResult;
    }
  }

  /**
   * Get last cached results (fast, no actual checks)
   */
  getCachedResults(): SystemHealth {
    const results = Array.from(this.lastResults.values());

    let aggregateStatus = HealthStatus.HEALTHY;
    for (const result of results) {
      if (result.status === HealthStatus.UNHEALTHY) {
        aggregateStatus = HealthStatus.UNHEALTHY;
        break;
      }
      if (result.status === HealthStatus.DEGRADED) {
        aggregateStatus = HealthStatus.DEGRADED;
      }
    }

    return {
      status: results.length === 0 ? HealthStatus.HEALTHY : aggregateStatus,
      timestamp: Date.now(),
      components: results,
      uptime: Date.now() - this.startTime,
      version: this.version,
    };
  }

  private async timeout(ms: number, componentName: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Health check timeout: ${componentName} (${ms}ms)`)),
        ms
      )
    );
  }

  /**
   * Remove a health check
   */
  unregister(componentName: string): boolean {
    this.lastResults.delete(componentName);
    return this.checks.delete(componentName);
  }

  /**
   * Clear all checks and results
   */
  clear(): void {
    this.checks.clear();
    this.lastResults.clear();
  }
}

// Global health checker instance
export const healthChecker = new HealthChecker();

/**
 * Standard health check implementations
 */
export const StandardHealthChecks = {
  /** Check filesystem access */
  filesystem: (testPath: string): HealthCheckFn => async () => {
    try {
      const fs = await import('fs/promises');
      await fs.access(testPath);
      return {
        status: HealthStatus.HEALTHY,
        message: `Filesystem accessible: ${testPath}`,
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Filesystem check failed: ${testPath}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Check memory usage */
  memory: (thresholdPercent: number = 90): HealthCheckFn => async () => {
    const usage = process.memoryUsage();
    const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;

    return {
      status: heapPercent > thresholdPercent ? HealthStatus.DEGRADED : HealthStatus.HEALTHY,
      message: `Memory usage: ${heapPercent.toFixed(1)}%`,
      details: {
        heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: (usage.rss / 1024 / 1024).toFixed(2),
      },
    };
  },

  /** Check event loop lag */
  eventLoop: (maxLagMs: number = 100): HealthCheckFn => async () => {
    const start = Date.now();
    await new Promise((resolve) => setImmediate(resolve));
    const lag = Date.now() - start;

    return {
      status: lag > maxLagMs ? HealthStatus.DEGRADED : HealthStatus.HEALTHY,
      message: `Event loop lag: ${lag}ms`,
      details: { lagMs: lag },
    };
  },

  /** Check if a store is accessible */
  store: (storeName: string, checkFn: () => Promise<void>): HealthCheckFn => async () => {
    try {
      await checkFn();
      return {
        status: HealthStatus.HEALTHY,
        message: `Store operational: ${storeName}`,
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Store check failed: ${storeName}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Always healthy (for testing) */
  alwaysHealthy: (componentName: string): HealthCheckFn => async () => ({
    status: HealthStatus.HEALTHY,
    message: `${componentName} is operational`,
  }),
};
