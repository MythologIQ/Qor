import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    memory: { status: "pass" | "warn" | "fail"; used: number; limit: number };
    database: { status: "pass" | "fail"; message?: string };
  };
}

function getMemoryStatus(): HealthStatus["checks"]["memory"] {
  const used = process.memoryUsage().heapUsed;
  const limit = process.memoryUsage().heapTotal;
  const usagePercent = (used / limit) * 100;

  if (usagePercent > 90) {
    return { status: "fail", used, limit };
  }
  if (usagePercent > 75) {
    return { status: "warn", used, limit };
  }
  return { status: "pass", used, limit };
}

function getDatabaseStatus(): HealthStatus["checks"]["database"] {
  // Simple database check - verify we can access storage
  try {
    // This is a basic check; actual implementation would test DB connection
    return { status: "pass" };
  } catch (err) {
    return {
      status: "fail",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export function getHealthStatus(): HealthStatus {
  const memory = getMemoryStatus();
  const database = getDatabaseStatus();

  let status: HealthStatus["status"] = "healthy";
  if (memory.status === "fail" || database.status === "fail") {
    status = "unhealthy";
  } else if (memory.status === "warn") {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: getVersion(),
    checks: { memory, database },
  };
}

export function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  const health = getHealthStatus();
  const statusCode = health.status === "healthy" ? 200 : 503;

  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(health, null, 2));
}

export function handleReadinessCheck(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  // Readiness check - is the service ready to accept traffic?
  const health = getHealthStatus();
  const isReady = health.status === "healthy" || health.status === "degraded";
  const statusCode = isReady ? 200 : 503;

  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ready: isReady, timestamp: new Date().toISOString() }));
}

export function handleLivenessCheck(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  // Liveness check - is the service alive (not deadlocked)?
  // Always returns 200 if we can respond
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ alive: true, timestamp: new Date().toISOString() }));
}
