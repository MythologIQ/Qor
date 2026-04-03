import { describe, it, expect } from "bun:test";
import { embedText } from "../src/service/graph-api";

const TIMEOUT = 60_000;

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

describe("Embeddings", () => {
  it("embedText returns 384-dimensional vector", async () => {
    const vec = await embedText("hello world");
    expect(vec).toBeInstanceOf(Array);
    expect(vec.length).toBe(384);
    expect(typeof vec[0]).toBe("number");
  }, TIMEOUT);

  it("similar texts have high cosine similarity", async () => {
    const a = await embedText("Victor heartbeat observation cycle");
    const b = await embedText("Victor heartbeat monitoring tick");
    const c = await embedText("chocolate cake recipe ingredients");
    const simAB = cosine(a, b);
    const simAC = cosine(a, c);
    expect(simAB).toBeGreaterThan(0.7);
    expect(simAB).toBeGreaterThan(simAC);
  }, TIMEOUT);
});
