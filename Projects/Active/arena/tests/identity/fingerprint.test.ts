import { test, expect, describe } from "bun:test";
import {
  fingerprint,
  normalizeCode,
  normalizeConfig,
  normalizeTemplate,
  type FingerprintInput,
} from "../../src/identity/fingerprint";

const base: FingerprintInput = {
  code: "function move(unit, hex) { return unit.hex === hex; }",
  config: '{"aggression":0.5,"depth":2}',
  modelId: "claude-sonnet-4-6",
  promptTemplate: "You are an arena agent.",
};

describe("fingerprint", () => {
  test("determinism: 10 iterations of same input produce same hex", () => {
    const first = fingerprint(base);
    for (let i = 0; i < 9; i++) expect(fingerprint(base)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  test("whitespace-only diff in code → identical fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      code: "function  move(unit,   hex)   {\n   return unit.hex === hex;\n}\n",
    });
    expect(a).toBe(b);
  });

  test("line-comment-only diff in code → identical fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      code:
        "// strategy: match by hex\nfunction move(unit, hex) { return unit.hex === hex; } // done",
    });
    expect(a).toBe(b);
  });

  test("block-comment-only diff in code → identical fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      code:
        "/* header */ function move(unit, hex) { /* check */ return unit.hex === hex; }",
    });
    expect(a).toBe(b);
  });

  test("one-character identifier rename → different fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      code: "function move(units, hex) { return units.hex === hex; }",
    });
    expect(a).not.toBe(b);
  });

  test("modelId change → different fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base, modelId: "claude-opus-4-6" });
    expect(a).not.toBe(b);
  });

  test("config change → different fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base, config: '{"aggression":0.9,"depth":2}' });
    expect(a).not.toBe(b);
  });

  test("promptTemplate change → different fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base, promptTemplate: "You are a greedy agent." });
    expect(a).not.toBe(b);
  });

  test("config whitespace-only diff → identical fingerprint (JSON canonical)", () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      config: '  { "aggression": 0.5, "depth": 2 }  ',
    });
    expect(a).toBe(b);
  });

  test("promptTemplate whitespace-only diff → identical fingerprint", () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      promptTemplate: "   You   are\n  an\tarena   agent.   ",
    });
    expect(a).toBe(b);
  });

  test("string literal content change → different fingerprint", () => {
    // Two functions differ only in string literal content — must produce different fingerprints.
    const a = fingerprint({ ...base, code: 'log("hello world");' });
    const b = fingerprint({ ...base, code: 'log("goodbye world");' });
    expect(a).not.toBe(b);
  });

  test("normalizeCode strips // and /* */ comments", () => {
    const src = '// x\nconst s = "keep spaces"; /* block */ return s;';
    const out = normalizeCode(src);
    expect(out).toContain('"keep spaces"');
    expect(out).not.toContain("//");
    expect(out).not.toContain("/*");
    expect(out).not.toContain("*/");
  });

  test("normalizeConfig produces canonical JSON when valid", () => {
    expect(normalizeConfig('{"b":2,"a":1}')).toBe('{"b":2,"a":1}');
    expect(normalizeConfig('  {"b":  2, "a": 1 }  ')).toBe('{"b":2,"a":1}');
  });

  test("normalizeConfig falls back to whitespace collapse when invalid JSON", () => {
    expect(normalizeConfig("aggression=0.5  depth=2")).toBe(
      "aggression=0.5 depth=2",
    );
  });

  test("normalizeTemplate collapses whitespace", () => {
    expect(normalizeTemplate("  a\n\nb\tc  ")).toBe("a b c");
  });

  test("empty code + empty config + modelId produces stable sha256 hex", () => {
    const fp = fingerprint({
      code: "",
      config: "",
      modelId: "m",
      promptTemplate: "",
    });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});
