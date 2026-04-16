import { describe, it, expect } from "bun:test";
import {
  agentPrivate,
  isAgentPrivate,
  parseAgentId,
  stampPartition,
  isValidPartition,
} from "../../src/memory/partitions";

describe("memory/partitions", () => {
  describe("agentPrivate", () => {
    it("produces a namespaced agent-private partition", () => {
      expect(agentPrivate("victor")).toBe("agent-private:victor");
    });

    it("throws when agentId is empty", () => {
      expect(() => agentPrivate("")).toThrow(/agentId required/);
    });
  });

  describe("isAgentPrivate", () => {
    it("accepts correctly-prefixed strings", () => {
      expect(isAgentPrivate("agent-private:victor")).toBe(true);
    });

    it("rejects bare prefix without id", () => {
      expect(isAgentPrivate("agent-private:")).toBe(false);
    });

    it("rejects shared-operational", () => {
      expect(isAgentPrivate("shared-operational")).toBe(false);
    });
  });

  describe("parseAgentId", () => {
    it("extracts the agent id", () => {
      expect(parseAgentId("agent-private:qora")).toBe("qora");
    });

    it("throws for non-private partitions", () => {
      expect(() => parseAgentId("canonical")).toThrow();
    });
  });

  describe("stampPartition", () => {
    it("attaches partition without mutating input", () => {
      const src = { id: "x" } as const;
      const out = stampPartition(src, "shared-operational");
      expect(out).toEqual({ id: "x", partition: "shared-operational" });
      expect((src as { partition?: string }).partition).toBeUndefined();
    });
  });

  describe("isValidPartition", () => {
    it.each([
      ["shared-operational", true],
      ["canonical", true],
      ["audit", true],
      ["agent-private:victor", true],
      ["agent-private:", false],
      ["nonsense", false],
      ["", false],
    ])("classifies %s as %s", (input, expected) => {
      expect(isValidPartition(input)).toBe(expected);
    });
  });
});
