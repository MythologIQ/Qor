import { describe, it, expect, afterAll } from "bun:test";
import {
  handleDeriveSemantic,
  handleClusterSemantic,
  handleMineProcedures,
  handleGetLayers,
  handleGetSemantic,
  handleGetProcedural,
} from "../src/derive/layer-routes";
import { closeDriver } from "../src/service/graph-api";

afterAll(async () => {
  await closeDriver();
});

function makeReq(path: string, method = "GET"): Request {
  return new Request(`http://localhost:4100${path}`, { method });
}

describe("handleGetLayers", () => {
  it("returns correct shape with counts", async () => {
    const res = await handleGetLayers();
    const body = await res.json();
    expect(body).toHaveProperty("episodic");
    expect(body).toHaveProperty("semantic");
    expect(body).toHaveProperty("procedural");
    expect(typeof body.episodic.count).toBe("number");
    expect(typeof body.semantic.count).toBe("number");
    expect(typeof body.procedural.count).toBe("number");
  });
});

describe("handleGetSemantic", () => {
  it("returns paginated list", async () => {
    const res = await handleGetSemantic(makeReq("/api/continuum/semantic?limit=5"));
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.length).toBeLessThanOrEqual(5);
  });
});

describe("handleGetProcedural", () => {
  it("returns list filterable by status", async () => {
    const res = await handleGetProcedural(makeReq("/api/continuum/procedural?status=all"));
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
  });
});

describe("handleDeriveSemantic", () => {
  it(
    "returns created/merged counts",
    async () => {
      const res = await handleDeriveSemantic();
      const body = await res.json();
      expect(typeof body.created).toBe("number");
      expect(typeof body.merged).toBe("number");
    },
    { timeout: 30_000 }
  );
});

describe("handleClusterSemantic", () => {
  it("returns created/merged/retired counts", async () => {
    const res = await handleClusterSemantic(makeReq("/api/continuum/cluster-semantic", "POST"));
    const body = await res.json();
    expect(typeof body.created).toBe("number");
    expect(typeof body.merged).toBe("number");
    expect(typeof body.retired).toBe("number");
  });
});

describe("handleMineProcedures", () => {
  it("returns candidates/promoted counts", async () => {
    const res = await handleMineProcedures();
    const body = await res.json();
    expect(typeof body.candidates).toBe("number");
    expect(typeof body.promoted).toBe("number");
  });
});
