import { describe, test, expect } from "bun:test";
import { route } from "../src/service/router";

function nullGraph(_: string, __: URL, ___: Request) { return Promise.resolve(null); }
function nullLayer(_: string, __: Request) { return Promise.resolve(null); }

describe("router", () => {
  test("/api/chat returns 501", async () => {
    const req = new Request("http://localhost/api/chat");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("not implemented");
  });

  test("/api/continuum/health passes through to graph handler", async () => {
    const req = new Request("http://localhost/api/continuum/health");
    const graphHandler = () => Promise.resolve(Response.json({ status: "ok" }));
    const res = await route(req, graphHandler, nullLayer);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("/qor falls through to static routes", async () => {
    const req = new Request("http://localhost/qor");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(200);
  });

  test("unknown API path returns 404", async () => {
    const req = new Request("http://localhost/api/unknown");
    const res = await route(req, nullGraph, nullLayer);
    expect(res.status).toBe(404);
  });
});
