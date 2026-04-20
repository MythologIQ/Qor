/**
 * Unit tests for ContinuumClient.fromEnv(): reads QOR_IPC_SOCKET
 * with fallback to CONTINUUM_IPC_TRANSPORT (legacy). Throws typed error
 * when env is missing. Important for deterministic client construction
 * during the mono-service rename transition.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ContinuumClient, IpcClientError } from "../../client";

const KEYS = ["QOR_IPC_SOCKET", "CONTINUUM_IPC_TRANSPORT", "QOR_IPC_TOKEN"] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = snapshotEnv();
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => restoreEnv(saved));

describe("ContinuumClient.fromEnv", () => {
  it("reads QOR_IPC_SOCKET as primary (bare path)", () => {
    process.env.QOR_IPC_SOCKET = "/tmp/qor.sock";
    process.env.QOR_IPC_TOKEN = "t";
    const client = ContinuumClient.fromEnv();
    expect(client).toBeInstanceOf(ContinuumClient);
  });

  it("falls back to CONTINUUM_IPC_TRANSPORT (strips unix: prefix)", () => {
    process.env.CONTINUUM_IPC_TRANSPORT = "unix:/tmp/legacy.sock";
    process.env.QOR_IPC_TOKEN = "t";
    const client = ContinuumClient.fromEnv();
    expect(client).toBeInstanceOf(ContinuumClient);
  });

  it("prefers QOR_IPC_SOCKET over legacy when both set", () => {
    process.env.QOR_IPC_SOCKET = "/tmp/new.sock";
    process.env.CONTINUUM_IPC_TRANSPORT = "unix:/tmp/old.sock";
    process.env.QOR_IPC_TOKEN = "t";
    const client = ContinuumClient.fromEnv();
    expect(client).toBeInstanceOf(ContinuumClient);
  });

  it("throws IpcClientError when socket env is missing", () => {
    process.env.QOR_IPC_TOKEN = "t";
    expect(() => ContinuumClient.fromEnv()).toThrow(IpcClientError);
  });

  it("throws IpcClientError when token is missing", () => {
    process.env.QOR_IPC_SOCKET = "/tmp/qor.sock";
    expect(() => ContinuumClient.fromEnv()).toThrow(IpcClientError);
  });
});
