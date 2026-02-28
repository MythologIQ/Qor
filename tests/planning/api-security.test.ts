/**
 * Planning API Security Tests
 *
 * Security audit for planning endpoints covering:
 * - Authentication enforcement
 * - Input validation
 * - Policy enforcement
 * - Error handling
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { LocalApiServer } from "../../runtime/service/LocalApiServer";
import { QoreRuntimeService } from "../../runtime/service/QoreRuntimeService";
import { PolicyEngine } from "../../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../../risk/engine/EvaluationRouter";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../../runtime/support/InMemoryStores";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Planning API Security Audit", () => {
  let api: LocalApiServer;
  let baseUrl: string;
  let projectsDir: string;
  const apiKey = "test-api-key-for-security";

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-security-"));
    tempDirs.push(dir);
    projectsDir = dir;

    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });

    const runtime = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(process.cwd(), "policy", "definitions"));

    api = new LocalApiServer(runtime, { apiKey, maxBodyBytes: 1024, projectsDir });
    await api.start();
    const addr = api.getAddress();
    baseUrl = `http://${addr.host}:${addr.port}`;
  });

  afterEach(async () => {
    await api.stop();
  });

  describe("Authentication Enforcement", () => {
    it("rejects requests without API key", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", createdBy: "actor" }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as { error: { code: string } };
      // UserFacingError format: AUTH_REQUIRED instead of UNAUTHORIZED
      expect(json.error.code).toBe("AUTH_REQUIRED");
    });

    it("rejects requests with invalid API key", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": "wrong-key" },
        body: JSON.stringify({ name: "Test", createdBy: "actor" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Input Validation", () => {
    it("rejects malformed JSON body", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: "{invalid json",
      });
      expect(res.status).toBe(400);
      const json = await res.json() as { error: { code: string; details?: { traceId?: string } } };
      // UserFacingError format: BAD_JSON errors are mapped to VALIDATION_ERROR
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects missing required fields for project creation", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ description: "Missing name and createdBy" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing required fields for thought creation", async () => {
      // First create a project
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ name: "Test Project", createdBy: "actor-1" }),
      });
      const json = await createRes.json() as { data: { projectId: string } };
      const projectId = json.data.projectId;

      // Try to create thought with missing fields
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/void/thoughts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ content: "Test" }), // Missing source and capturedBy
      });
      expect(res.status).toBe(400);
    });

    it("rejects payload exceeding maxBodyBytes", async () => {
      const largePayload = { name: "Test", createdBy: "actor", data: "x".repeat(2000) };
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify(largePayload),
      });
      expect(res.status).toBe(413);
    });
  });

  describe("Planning CRUD Operations", () => {
    it("creates a project successfully", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ name: "Security Test Project", description: "Testing security", createdBy: "test-actor" }),
      });
      expect(res.status).toBe(201);
      const json = await res.json() as { data: { projectId: string; name: string }; meta: { timestamp: string } };
      expect(json.data.projectId).toBeDefined();
      expect(json.data.name).toBe("Security Test Project");
    });

    it("retrieves project metadata", async () => {
      // Create project first
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ name: "Meta Test", createdBy: "actor" }),
      });
      const json = await createRes.json() as { data: { projectId: string } };
      const projectId = json.data.projectId;

      // Get project
      const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(res.status).toBe(200);
      const getJson = await res.json() as { data: { projectId: string }; meta: { timestamp: string } };
      expect(getJson.data.projectId).toBe(projectId);
    });

    it("returns 404 for non-existent project", async () => {
      const res = await fetch(`${baseUrl}/api/projects/non-existent-id`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(res.status).toBe(404);
    });

    it("deletes project successfully", async () => {
      // Create project first
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ name: "Delete Test", createdBy: "actor" }),
      });
      const json = await createRes.json() as { data: { projectId: string } };
      const projectId = json.data.projectId;

      // Delete project
      const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: "DELETE",
        headers: { "x-qore-api-key": apiKey },
      });
      expect(res.status).toBe(204);

      // Verify deleted
      const getRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(getRes.status).toBe(404);
    });
  });

  describe("Void Thoughts API", () => {
    let projectId: string;

    beforeEach(async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ name: "Void Test", createdBy: "actor" }),
      });
      const json = await res.json() as { data: { projectId: string } };
      projectId = json.data.projectId;
    });

    it("adds a thought", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/void/thoughts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({
          content: "My first thought",
          source: "text",
          capturedBy: "actor-1",
        }),
      });
      expect(res.status).toBe(201);
      const json = await res.json() as { data: { thoughtId: string; content: string }; meta: { timestamp: string } };
      expect(json.data.content).toBe("My first thought");
    });

    it("lists thoughts", async () => {
      // Add a thought first
      await fetch(`${baseUrl}/api/projects/${projectId}/void/thoughts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ content: "Thought 1", source: "text", capturedBy: "actor" }),
      });

      // List thoughts
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/void/thoughts`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { data: Array<{ content: string }>; meta: { pagination: { total: number } } };
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.meta.pagination.total).toBeGreaterThan(0);
    });
  });

  describe("Integrity Endpoint", () => {
    let projectId: string;

    beforeEach(async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ name: "Integrity Test", createdBy: "actor" }),
      });
      const json = await res.json() as { data: { projectId: string } };
      projectId = json.data.projectId;
    });

    it("returns integrity check summary", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/integrity`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { data: { totalChecks: number; overallPassed: boolean }; meta: { timestamp: string } };
      expect(json.data.totalChecks).toBeGreaterThan(0);
      expect(typeof json.data.overallPassed).toBe("boolean");
    });

    it("runs specific integrity check", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ checkId: "PL-INT-01" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { data: { passed: boolean }; meta: { timestamp: string } };
      expect(typeof json.data.passed).toBe("boolean");
    });

    it("rejects invalid checkId", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({ checkId: "INVALID_CHECK" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Error Handling", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await fetch(`${baseUrl}/api/unknown/route`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(res.status).toBe(404);
    });

    it("includes traceId in error responses", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      });
      const json = await res.json() as { error: { details?: { traceId?: string } } };
      // UserFacingError format: traceId is in details object
      expect(json.error.details?.traceId).toBeDefined();
    });
  });
});
