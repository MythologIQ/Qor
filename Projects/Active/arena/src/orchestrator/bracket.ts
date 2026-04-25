// Match Facilitation Phase 2 — Bracket Classification
// Three-tier capability model: Sentinel / Vanguard / Apex

export type BracketName = "sentinel" | "vanguard" | "apex";

export interface BracketDef {
  name: BracketName;
  descriptor: string; // ≤5 words
  /** Maximum model parameter count (B) considered "light enough" for this bracket */
  maxParamsB: number;
}

/** All bracket definitions ordered by capability tier */
export const BRACKETS: BracketDef[] = [
  {
    name: "sentinel",
    descriptor: "Light models 7B params or fewer",
    maxParamsB: 7,
  },
  {
    name: "vanguard",
    descriptor: "Mid-range 8B to 70B parameters",
    maxParamsB: 70,
  },
  {
    name: "apex",
    descriptor: "Unrestricted large and frontier models",
    maxParamsB: Infinity,
  },
];

function parseModelSize(modelId: string): number {
  // Heuristic: extract the raw number of billions from model id strings like
  // "qwen2.5-14b", "llama-70b-instruct", "claude-3-5-sonnet", "gpt-4o", etc.
  const lower = modelId.toLowerCase();

  // Handle explicit "XXb" patterns first
  const bMatch = lower.match(/(\d+(?:\.\d+)?)\s*b/i);
  if (bMatch) return parseFloat(bMatch[1]);

  // Handle "XXm" (million params) — convert to billions
  const mMatch = lower.match(/(\d+(?:\.\d+)?)\s*m\b/);
  if (mMatch) return parseFloat(mMatch[1]) / 1000;

  // Frontier/provider models with no explicit size get unlimited bracket
  return Infinity;
}

/**
 * Classify an agent's modelId into the appropriate bracket.
 * Uses a simple capability heuristic (param count).
 */
export function classifyBracket(agent: { modelId: string }): BracketName {
  const size = parseModelSize(agent.modelId);

  if (size <= 7) return "sentinel";
  if (size <= 70) return "vanguard";
  return "apex";
}

export function getBracketConfig(name: string): BracketDef {
  const def = BRACKETS.find((b) => b.name === name);
  if (!def) throw new Error(`Unknown bracket: ${name}`);
  return def;
}