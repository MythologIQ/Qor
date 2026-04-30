/**
 * TDD-Light: Victor IPC canary test.
 * Proves: ContinuumClient can auth + dispatch events.execution.query via UDS.
 * Success condition: call returns OK (200/structured response, may be empty array).
 * Empty-result success proves auth + routing + ACL roundtrip without write side-effects.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ContinuumClient } from "../../continuum/client";

const SOCKET_PATH = process.env.QOR_IPC_SOCKET ?? "/tmp/qor.sock";
const VICTOR_TOKEN = process.env.VICTOR_KERNEL_TOKEN;

describe("Victor IPC canary", () => {
  let client: ContinuumClient;

  beforeAll(() => {
    if (!VICTOR_TOKEN) throw new Error("VICTOR_KERNEL_TOKEN env required");
    client = ContinuumClient.create({ socketPath: SOCKET_PATH, token: VICTOR_TOKEN });
  });

  afterAll(async () => {
    if (client) await client.close().catch(() => {});
  });

  test("events.execution.query roundtrip via IPC", async () => {
    const result = await client.call<unknown[]>("events.execution.query", {
      filter: { limit: 1 },
    });
    expect(Array.isArray(result)).toBe(true);
  });
});
