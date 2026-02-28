import { describe, it, expect } from "vitest";
import { getHealthStatus } from "../../runtime/service/health-routes";

describe("Health Checks", () => {
  it("should return health status", () => {
    const health = getHealthStatus();

    expect(health).toMatchObject({
      status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      version: expect.any(String),
      checks: {
        memory: {
          status: expect.stringMatching(/^(pass|warn|fail)$/),
          used: expect.any(Number),
          limit: expect.any(Number),
        },
        database: {
          status: expect.stringMatching(/^(pass|fail)$/),
        },
      },
    });
  });

  it("should report memory status", () => {
    const health = getHealthStatus();
    expect(health.checks.memory.used).toBeGreaterThan(0);
    expect(health.checks.memory.limit).toBeGreaterThan(0);
    expect(health.checks.memory.used).toBeLessThanOrEqual(health.checks.memory.limit);
  });

  it("should report uptime", () => {
    const health = getHealthStatus();
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should include valid timestamp", () => {
    const health = getHealthStatus();
    const timestamp = new Date(health.timestamp);
    expect(timestamp.getTime()).toBeGreaterThan(0);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("should be unhealthy if database check fails", () => {
    const health = getHealthStatus();
    if (health.checks.database.status === "fail") {
      expect(health.status).toBe("unhealthy");
    }
  });
});
