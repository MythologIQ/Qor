import { describe, test, expect } from "bun:test";
import { route } from "../src/service/router";

function nullGraph(_: string, __: URL, ___: Request) { return Promise.resolve(null); }
function nullLayer(_: string, __: Request) { return Promise.resolve(null); }

describe("router wiring", () => {
  test("forge status route dispatched (not 404)", async () => {
    const req = new Request("http://localhost/api/forge/status");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).not.toBe(404);
  });

  test("qora status route dispatched (not 404)", async () => {
    const req = new Request("http://localhost/api/qora/status");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("qor evaluate route dispatched (not 404)", async () => {
    const req = new Request("http://localhost/api/qor/evaluate", { method: "POST" });
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).not.toBe(404);
  });

  test("qor evidence GET route dispatched (not 404)", async () => {
    const req = new Request("http://localhost/api/qor/evidence");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(200);
  });

  test("unknown API path still returns 404", async () => {
    const req = new Request("http://localhost/api/unknown");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(404);
  });

  test("continuum health passes through to graph handler", async () => {
    const req = new Request("http://localhost/api/continuum/health");
    const graphHandler = () => Promise.resolve(Response.json({ status: "ok" }));
    const res = await route(req, graphHandler, nullLayer);
    expect(res.status).toBe(200);
  });

  test("non-API paths fall through to static routes", async () => {
    const req = new Request("http://localhost/qor");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(200);
  });
});
