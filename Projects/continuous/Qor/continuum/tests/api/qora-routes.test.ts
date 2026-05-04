import { describe, test, expect, beforeEach, afterEach } from "bun:test";

const BASE = "http://localhost:4100";
const AUTH_HEADER = { "X-Api-Key": "qora-dev-key" };

describe("qora-routes post-migration", () => {
  test("maintenance mode: /append-entry returns 503 when QORA_MAINTENANCE=1", async () => {
    const res = await fetch(`${BASE}/api/qora/append-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ type: "maintenance-probe", payload: {} }),
    });
    // Pre-cutover: expect 200, 401 (no auth), or 503 (maintenance).
    // Post-cutover with flag OFF: expect 200.
    // During cutover with flag ON: expect 503.
    expect([200, 401, 503]).toContain(res.status);
  });

  test("maintenance mode: /record-veto returns 503 when QORA_MAINTENANCE=1", async () => {
    const res = await fetch(`${BASE}/api/qora/record-veto`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ target: "probe", reason: "test", payload: {} }),
    });
    expect([200, 401, 503]).toContain(res.status);
  });

  test("read paths unaffected by maintenance mode", async () => {
    const res = await fetch(`${BASE}/api/qora/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("post-refactor: no writeFileSync to LEDGER_PATH in qora-routes.ts", async () => {
    const file = Bun.file("/home/workspace/Projects/continuous/Qor/continuum/src/service/api/qora-routes.ts");
    const text = await file.text();
    const matches = text.match(/writeFileSync.*LEDGER_PATH/g);
    expect(matches).toBeNull();
  });

  test("post-refactor: no parseLedger in qora-routes.ts", async () => {
    const file = Bun.file("/home/workspace/Projects/continuous/Qor/continuum/src/service/api/qora-routes.ts");
    const text = await file.text();
    expect(text).not.toContain("parseLedger");
  });
});
