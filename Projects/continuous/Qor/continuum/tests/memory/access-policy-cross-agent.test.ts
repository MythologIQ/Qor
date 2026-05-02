import { describe, test, expect } from "bun:test";
import { assertCanRead, AccessDeniedError, type AgentContext } from "../../src/memory/access-policy";

describe("cross-agent ACL", () => {
  const victorCtx: AgentContext = { agentId: "victor", partitions: [] };
  const qoraCtx: AgentContext = { agentId: "qora", partitions: [] };
  const forgeCtx: AgentContext = { agentId: "forge", partitions: [] };

  test("qora cannot read victor partition", () => {
    expect(() => assertCanRead(qoraCtx, "agent-private:victor", "events.ledger.query")).toThrow(AccessDeniedError);
  });

  test("forge cannot read qora partition", () => {
    expect(() => assertCanRead(forgeCtx, "agent-private:qora", "events.ledger.query")).toThrow(AccessDeniedError);
  });

  test("victor cannot read forge partition", () => {
    expect(() => assertCanRead(victorCtx, "agent-private:forge", "events.ledger.query")).toThrow(AccessDeniedError);
  });

  test("qora can read own partition", () => {
    expect(() => assertCanRead(qoraCtx, "agent-private:qora", "events.ledger.query")).not.toThrow();
  });

  test("victor can read own partition", () => {
    expect(() => assertCanRead(victorCtx, "agent-private:victor", "events.ledger.query")).not.toThrow();
  });

  test("forge can read own partition", () => {
    expect(() => assertCanRead(forgeCtx, "agent-private:forge", "events.ledger.query")).not.toThrow();
  });
});
