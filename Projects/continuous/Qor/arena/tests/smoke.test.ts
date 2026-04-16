import { describe, expect, it } from "bun:test";

describe("smoke", () => {
  it("server imports without error", async () => {
    const mod = await import("../src/server.js");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.fetch).toBe("function");
    expect(typeof mod.default.port).toBe("number");
  });

  it("router exports mount function", async () => {
    const { mount } = await import("../src/router.js");
    expect(typeof mount).toBe("function");
  });
});
