// HexaWars Arena — Deterministic Agent Fingerprint (Plan A v2, Phase 2)
// fingerprint = sha256( normCode ‖ NUL ‖ normConfig ‖ NUL ‖ modelId ‖ NUL ‖ normPrompt )
// Pure function. No I/O, no time, no randomness.

import { createHash } from "node:crypto";

export interface FingerprintInput {
  code: string;
  config: string;
  modelId: string;
  promptTemplate: string;
}

/**
 * Strip line/block comments, collapse whitespace runs, preserve string literals verbatim.
 * Identifier renames are NOT normalized — that's similarity's job.
 */
export function normalizeCode(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += quote;
      i++;
      while (i < n) {
        const c = src[i];
        if (c === "\\" && i + 1 < n) {
          out += c + src[i + 1];
          i += 2;
          continue;
        }
        out += c;
        i++;
        if (c === quote) break;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(i + 2, n);
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function normalizeConfig(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw.replace(/\s+/g, " ").trim();
  }
}

export function normalizeTemplate(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function fingerprint(input: FingerprintInput): string {
  const h = createHash("sha256");
  h.update(normalizeCode(input.code)).update("\x00");
  h.update(normalizeConfig(input.config)).update("\x00");
  h.update(input.modelId).update("\x00");
  h.update(normalizeTemplate(input.promptTemplate));
  return h.digest("hex");
}
