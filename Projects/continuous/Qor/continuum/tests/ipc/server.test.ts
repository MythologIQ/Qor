/**
 * Integration tests for IPC server: transport discipline, auth, dispatch.
 * Stubs the OP_TABLE via a test-only registry bypass using a socket end-to-end flow.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startIpcServer,
  InvalidTransportError,
  type IpcServerHandle,
} from "../../src/ipc/server";
import { IpcClient, IpcClientError } from "../../src/ipc/client";

const VICTOR_TOKEN = "token-v";
const UNKNOWN_TOKEN = "token-unknown";

let baseDir: string;
let sockDir: string;
let tokenMapPath: string;
let socketPath: string;
let handle: IpcServerHandle;

beforeAll(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "ipc-server-"));
  sockDir = join(baseDir, "secrets");
  await writeFile(join(baseDir, "placeholder"), "");
  // parent dir for socket must be 0700
  await Bun.$`mkdir -p ${sockDir}`.quiet();
  await chmod(sockDir, 0o700);
  tokenMapPath = join(sockDir, "ipc-agents.json");
  await writeFile(tokenMapPath, JSON.stringify({ victor: VICTOR_TOKEN }));
  await chmod(tokenMapPath, 0o600);
  socketPath = join(sockDir, "continuum.sock");
  handle = await startIpcServer({
    transport: `unix:${socketPath}`,
    tokenMapPath,
  });
});

afterAll(async () => {
  await handle.stop();
  await rm(baseDir, { recursive: true, force: true });
});

describe("startIpcServer", () => {
  it("rejects non-unix transport", async () => {
    await expect(
      startIpcServer({ transport: "tcp://127.0.0.1:9999", tokenMapPath }),
    ).rejects.toThrow(InvalidTransportError);
  });

  it("socket file is created with mode 0600", async () => {
    const st = await stat(socketPath);
    expect(st.mode & 0o777).toBe(0o600);
  });
});

describe("IPC dispatch round-trip", () => {
  it("unknown op yields structured error via client", async () => {
    const client = new IpcClient({ socketPath, token: VICTOR_TOKEN });
    await client.connect();
    try {
      await expect(client.call("no.such.op", {})).rejects.toThrow(IpcClientError);
    } finally {
      await client.close();
    }
  });

  it("invalid token terminates connection with auth_failed", async () => {
    const client = new IpcClient({ socketPath, token: UNKNOWN_TOKEN, reconnectBaseMs: 50 });
    await client.connect();
    try {
      // The call triggers auth → server sends error frame + closes.
      await expect(client.call("events.initialize", {})).rejects.toThrow(IpcClientError);
    } finally {
      await client.close();
    }
  });

  it("known op dispatched with agentCtx", async () => {
    const client = new IpcClient({ socketPath, token: VICTOR_TOKEN });
    await client.connect();
    try {
      // events.initialize is a no-op that returns undefined; success path exercises dispatch.
      const res = await client.call("events.initialize", {});
      expect(res).toBeUndefined();
    } finally {
      await client.close();
    }
  });

  it("cross-partition write is denied end-to-end (AC4)", async () => {
    // Victor authenticates then crafts an ExecutionEvent targeting qora's private partition.
    // Server must reject via access-policy before any DB write — error code 'access_denied'.
    const client = new IpcClient({ socketPath, token: VICTOR_TOKEN });
    await client.connect();
    try {
      const hostileEvent = {
        id: "exec-xp-test-1",
        agentId: "victor",
        partition: "agent-private:qora",
        taskId: "t-xp",
        source: "cross-partition-test",
        status: "completed",
        timestamp: Date.now(),
      };
      let caught: unknown = null;
      try {
        await client.call("events.execution.record", { event: hostileEvent });
      } catch (err) { caught = err; }
      expect(caught).toBeInstanceOf(IpcClientError);
      expect((caught as IpcClientError).code).toBe("access_denied");
    } finally {
      await client.close();
    }
  });
});
