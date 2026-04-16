import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

const TEST_SECRET_DIR = "/tmp/qor-auth-test-secrets";
const TEST_SECRET_FILE = `${TEST_SECRET_DIR}/api_key`;

beforeEach(() => {
  mkdirSync(TEST_SECRET_DIR, { recursive: true });
  writeFileSync(TEST_SECRET_FILE, "test-secret-token-abc123");
  process.env.__QOR_AUTH_TEST_SECRET_PATH = TEST_SECRET_FILE;
});

afterEach(() => {
  if (existsSync(TEST_SECRET_DIR)) rmSync(TEST_SECRET_DIR, { recursive: true });
  delete process.env.__QOR_AUTH_TEST_SECRET_PATH;
  delete process.env.QOR_FORGE_SECRET;
  delete process.env.QOR_QORA_SECRET;
  delete process.env.QOR_QOR_SECRET;
});

describe("auth", () => {
  test("rejects empty token", async () => {
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: {},
    });
    expect(auth(req, "forge")).toBe(false);
  });

  test("rejects wrong token via Authorization header", async () => {
    process.env.QOR_FORGE_SECRET = "correct-secret";
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(auth(req, "forge")).toBe(false);
  });

  test("accepts correct token via Authorization header", async () => {
    process.env.QOR_FORGE_SECRET = "correct-secret";
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer correct-secret" },
    });
    expect(auth(req, "forge")).toBe(true);
  });

  test("accepts correct token via x-api-key header", async () => {
    process.env.QOR_FORGE_SECRET = "correct-secret";
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "Bearer correct-secret" },
    });
    expect(auth(req, "forge")).toBe(true);
  });

  test("per-module secret resolution uses env var", async () => {
    process.env.QOR_QORA_SECRET = "qora-secret-value";
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer qora-secret-value" },
    });
    expect(auth(req, "qora")).toBe(true);
  });

  test("qor module falls back to QOR_EVIDENCE_SECRET", async () => {
    process.env.QOR_EVIDENCE_SECRET = "evidence-fallback";
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer evidence-fallback" },
    });
    expect(auth(req, "qor")).toBe(true);
  });

  test("returns false when no secret configured", async () => {
    const { auth } = await import("../src/service/api/shared/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer some-token" },
    });
    expect(auth(req, "nonexistent")).toBe(false);
  });

  test("uid generates prefixed identifiers", async () => {
    const { uid } = await import("../src/service/api/shared/auth");
    const id = uid();
    expect(id.startsWith("gov_")).toBe(true);
    expect(id.length).toBeGreaterThan(8);
  });
});
