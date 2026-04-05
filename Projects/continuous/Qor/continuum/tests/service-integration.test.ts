import { test, expect, describe } from "bun:test";

const API = "http://localhost:4100/api/continuum";

describe("Continuum Service Integration", () => {
  test("health endpoint responds", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.ts).toBe("number");
  });

  test("stats returns non-zero counts", async () => {
    const res = await fetch(`${API}/stats`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
    const total = data.nodes.reduce((s: number, n: any) => s + n.cnt, 0);
    expect(total).toBeGreaterThan(0);
  });

  test("timeline returns records for victor", async () => {
    const res = await fetch(`${API}/timeline?agent=victor`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("timeline returns records for qora", async () => {
    const res = await fetch(`${API}/timeline?agent=qora`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("cross-links returns relationships", async () => {
    const res = await fetch(`${API}/cross-links?a1=victor&a2=qora`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("recall returns similarity-scored results", async () => {
    const res = await fetch(`${API}/recall?q=governance&k=3`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  }, 30000);

  test("entity lookup returns network", async () => {
    const res = await fetch(`${API}/entity?name=Victor`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("sync triggers without error", async () => {
    const res = await fetch(`${API}/sync`, { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.total).toBe("number");
  }, 30000);
});
