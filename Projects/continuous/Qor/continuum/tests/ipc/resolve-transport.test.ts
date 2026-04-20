/**
 * Unit tests for resolveTransport: normalizes bare paths to `unix:` prefix.
 * Important because the rename allows QOR_IPC_SOCKET to hold a bare path,
 * while startIpcServer still requires `unix:` internally.
 */
import { describe, it, expect } from "bun:test";
import { resolveTransport, InvalidTransportError } from "../../src/ipc/server";

describe("resolveTransport", () => {
  it("prepends unix: to an absolute bare path", () => {
    expect(resolveTransport("/tmp/qor.sock")).toBe("unix:/tmp/qor.sock");
  });

  it("is idempotent on already-prefixed transport", () => {
    expect(resolveTransport("unix:/tmp/qor.sock")).toBe("unix:/tmp/qor.sock");
  });

  it("rejects non-absolute bare paths", () => {
    expect(() => resolveTransport("tmp/qor.sock")).toThrow(InvalidTransportError);
  });

  it("rejects non-unix schemes", () => {
    expect(() => resolveTransport("tcp://127.0.0.1:7687")).toThrow(InvalidTransportError);
  });
});
