import { describe, it, expect } from "bun:test";
import {
  AccessDeniedError,
  assertAccess,
  assertCanRead,
  assertCanWrite,
  type AgentContext,
} from "../../src/memory/access-policy";

const victor: AgentContext = { agentId: "victor", partitions: [] };
const qora: AgentContext = { agentId: "qora", partitions: [] };

describe("memory/access-policy", () => {
  describe("agent-private", () => {
    it("allows owner read/write", () => {
      expect(() => assertCanRead(victor, "agent-private:victor", "x")).not.toThrow();
      expect(() => assertCanWrite(victor, "agent-private:victor", "x")).not.toThrow();
    });

    it("denies cross-agent reads and writes", () => {
      expect(() => assertCanRead(qora, "agent-private:victor", "x")).toThrow(AccessDeniedError);
      expect(() => assertCanWrite(qora, "agent-private:victor", "x")).toThrow(AccessDeniedError);
    });
  });

  describe("canonical", () => {
    it("allows reads from any agent", () => {
      expect(() => assertCanRead(victor, "canonical", "x")).not.toThrow();
      expect(() => assertCanRead(qora, "canonical", "x")).not.toThrow();
    });

    it("denies writes", () => {
      expect(() => assertCanWrite(victor, "canonical", "x")).toThrow(/read-only/);
    });
  });

  describe("audit", () => {
    it("allows append (write)", () => {
      expect(() => assertCanWrite(victor, "audit", "x")).not.toThrow();
    });

    it("denies update and delete", () => {
      expect(() => assertAccess(victor, "audit", "update", "x")).toThrow(/append-only/);
      expect(() => assertAccess(victor, "audit", "delete", "x")).toThrow(/append-only/);
    });
  });

  describe("shared-operational", () => {
    it("allows read and write", () => {
      expect(() => assertCanRead(victor, "shared-operational", "x")).not.toThrow();
      expect(() => assertCanWrite(victor, "shared-operational", "x")).not.toThrow();
    });

    it("denies update and delete by default", () => {
      expect(() => assertAccess(victor, "shared-operational", "update", "x")).toThrow();
      expect(() => assertAccess(victor, "shared-operational", "delete", "x")).toThrow();
    });
  });

  describe("structural errors", () => {
    it("rejects missing ctx", () => {
      expect(() => assertCanRead(null, "shared-operational", "x")).toThrow(/agentCtx missing/);
    });

    it("rejects empty agentId", () => {
      expect(() => assertCanRead({ agentId: "", partitions: [] }, "shared-operational", "x"))
        .toThrow(/agentId missing/);
    });

    it("rejects unknown partition", () => {
      expect(() => assertCanRead(victor, "nonsense", "x")).toThrow(/invalid partition/);
    });
  });
});
