import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthConfigError,
  AuthFailedError,
  loadAgentTokenMap,
  resolveAgent,
} from "../../src/ipc/auth";

let dir: string;
let mapPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ipc-auth-"));
  mapPath = join(dir, "ipc-agents.json");
  await writeFile(mapPath, JSON.stringify({ "victor-kernel": "token-v", "qora-kernel": "token-q" }));
  await chmod(mapPath, 0o600);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ipc/auth loadAgentTokenMap", () => {
  it("loads a well-formed 0600 map", async () => {
    const map = await loadAgentTokenMap(mapPath);
    expect(map["victor-kernel"]).toBe("token-v");
  });

  it("rejects missing file", async () => {
    await expect(loadAgentTokenMap(join(dir, "no-such"))).rejects.toThrow(AuthConfigError);
  });

  it("rejects wrong file mode", async () => {
    const looseDir = await mkdtemp(join(tmpdir(), "ipc-auth-loose-"));
    const loose = join(looseDir, "loose.json");
    await writeFile(loose, JSON.stringify({ a: "b" }));
    await chmod(loose, 0o644);
    await expect(loadAgentTokenMap(loose)).rejects.toThrow(/0600/);
    await rm(looseDir, { recursive: true, force: true });
  });

  it("rejects invalid JSON", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "ipc-auth-bad-"));
    const bad = join(badDir, "bad.json");
    await writeFile(bad, "{not json");
    await chmod(bad, 0o600);
    await expect(loadAgentTokenMap(bad)).rejects.toThrow(/not JSON/);
    await rm(badDir, { recursive: true, force: true });
  });
});

describe("ipc/auth resolveAgent", () => {
  const map = { "victor-kernel": "token-v", "qora-kernel": "token-q" };

  it("resolves a valid token to an agent context", () => {
    const ctx = resolveAgent("token-v", map);
    expect(ctx.agentId).toBe("victor-kernel");
    expect(ctx.partitions).toContain("agent-private:victor-kernel");
    expect(ctx.partitions).toContain("shared-operational");
  });

  it("rejects an unknown token", () => {
    expect(() => resolveAgent("token-unknown", map)).toThrow(AuthFailedError);
  });

  it("rejects an empty token", () => {
    expect(() => resolveAgent("", map)).toThrow(AuthFailedError);
  });

  it("rejects a same-prefix mismatched token (timing-safe)", () => {
    expect(() => resolveAgent("token-x", map)).toThrow(AuthFailedError);
  });
});
