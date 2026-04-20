import { test, expect, describe } from "bun:test";
import {
  ngrams,
  similarity,
  flagAgainst,
  DEFAULT_THRESHOLD,
  NGRAM_SIZE,
  type CorpusEntry,
} from "../../src/identity/similarity";

describe("similarity", () => {
  test("ngrams emits (len - n + 1) 5-grams for normalized input", () => {
    const s = "hello world foo";
    const g = ngrams(s);
    expect(g.size).toBe(s.length - NGRAM_SIZE + 1);
  });

  test("ngrams normalizes whitespace before slicing", () => {
    const a = ngrams("a b c d e");
    const b = ngrams("a   b\tc\nd  e");
    expect([...a].sort()).toEqual([...b].sort());
  });

  test("ngrams on empty string returns empty set", () => {
    expect(ngrams("").size).toBe(0);
  });

  test("ngrams on very short string returns single full-string entry", () => {
    const g = ngrams("ab");
    expect(g.size).toBe(1);
    expect(g.has("ab")).toBe(true);
  });

  test("identity: similarity(x, x) === 1", () => {
    const src = "function move(unit, hex) { return unit.hex === hex; }";
    expect(similarity(src, src)).toBe(1);
  });

  test("both-empty case: similarity('', '') === 1", () => {
    expect(similarity("", "")).toBe(1);
  });

  test("one-empty case: similarity('x', '') === 0", () => {
    expect(similarity("abcdef", "")).toBe(0);
  });

  test("disjoint texts: similarity ≈ 0", () => {
    const a = "xxxxxxxxxxxxxxxxxxxxxxxx";
    const b = "yyyyyyyyyyyyyyyyyyyyyyyy";
    expect(similarity(a, b)).toBe(0);
  });

  test("identifier rename on long shared body keeps high similarity", () => {
    // Long shared body: only rename is "unit" → "unit2" (single appended char) across few sites.
    const shared =
      " const board = createBoard(8); const enemies = board.enemies; const allies = board.allies;" +
      " for (const hex of board.hexes) { if (hex.owner === self) { count += hex.value; } }" +
      " const path = shortestPath(start, goal, board); return path.reverse();";
    const a = `function plan(unit) {${shared}}`;
    const b = `function plan(unit2) {${shared}}`;
    const s = similarity(a, b);
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  test("tightly renamed short body drops well below 1 (expected)", () => {
    const a = "function move(unit, hex) { return unit.hex === hex; }";
    const b = "function move(piece, hex) { return piece.hex === hex; }";
    const s = similarity(a, b);
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThan(0);
  });

  test("unrelated agent bodies score < 0.30 on a 20-agent corpus", () => {
    const corpus = Array.from({ length: 20 }, (_, i) =>
      `const strat${i} = { id: ${i}, name: "agent_${i}_${"q".repeat(i + 1)}" };`,
    );
    const candidate =
      'function plan(board, units) { const best = rank(units); return best[0]; } export { plan };';
    for (const entry of corpus) {
      expect(similarity(candidate, entry)).toBeLessThan(0.3);
    }
  });

  test("flagAgainst returns entries at or above threshold, sorted by score desc", () => {
    const candidate = "aaaaaaaaaabbbbbbbbbbccccccccccdddddddddd";
    const corpus: CorpusEntry[] = [
      { operatorId: 1, fingerprint: "fp1", normalizedCode: candidate }, // 1.0
      {
        operatorId: 2,
        fingerprint: "fp2",
        normalizedCode: "aaaaaaaaaabbbbbbbbbbccccccccccdddddddddX",
      }, // very high
      { operatorId: 3, fingerprint: "fp3", normalizedCode: "zzzzzzzzzzzzzzzzz" }, // 0
    ];
    const flags = flagAgainst(candidate, corpus);
    expect(flags.length).toBeGreaterThanOrEqual(1);
    expect(flags[0].score).toBeGreaterThanOrEqual(flags[flags.length - 1].score);
    expect(flags[0].operatorId).toBe(1);
    expect(flags[0].score).toBe(1);
    expect(flags.every((f) => f.score >= DEFAULT_THRESHOLD)).toBe(true);
  });

  test("flagAgainst with empty corpus returns []", () => {
    expect(flagAgainst("some code here that is long enough", [])).toEqual([]);
  });

  test("flagAgainst respects custom threshold", () => {
    const candidate = "the quick brown fox jumps over the lazy dog";
    const corpus: CorpusEntry[] = [
      {
        operatorId: 1,
        fingerprint: "fp1",
        normalizedCode: "the quick brown fox leaps over the lazy dog",
      },
    ];
    const strict = flagAgainst(candidate, corpus, 0.99);
    const lenient = flagAgainst(candidate, corpus, 0.3);
    expect(strict.length).toBe(0);
    expect(lenient.length).toBe(1);
  });
});
