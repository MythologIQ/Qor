import { describe, test, expect } from "bun:test";
import { staticRoutes } from "../src/service/static-routes";

function mockReq(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("static-routes", () => {
  test("/qor returns HTML", async () => {
    const res = await staticRoutes("/qor");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("/qor/forge/chat returns HTML", async () => {
    const res = await staticRoutes("/qor/forge/chat");
    expect(res.status).toBe(200);
  });

  test("/qor/victor/chat returns HTML", async () => {
    const res = await staticRoutes("/qor/victor/chat");
    expect(res.status).toBe(200);
  });

  test("/mobile/qor returns HTML", async () => {
    const res = await staticRoutes("/mobile/qor");
    expect(res.status).toBe(200);
  });

  test("unknown path returns 404", async () => {
    const res = await staticRoutes("/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });
});
