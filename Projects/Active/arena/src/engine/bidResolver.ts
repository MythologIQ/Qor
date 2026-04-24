import type { BidResolverInput, ResolvedBidOrder } from "../shared/types";

/**
 * Resolve bid order. Higher bid acts first. Ties broken deterministically by
 * FNV-1a hash of `${matchId}:${round}`, so the same matchId + round always
 * produces the same order but different rounds vary.
 */
export function resolveBids(input: BidResolverInput): ResolvedBidOrder {
  const { agentA, agentB, matchId, round } = input;
  if (agentA.bid > agentB.bid) {
    return { round, first: "A", bidA: agentA.bid, bidB: agentB.bid, tieBroken: false };
  }
  if (agentB.bid > agentA.bid) {
    return { round, first: "B", bidA: agentA.bid, bidB: agentB.bid, tieBroken: false };
  }
  const seed = stableHash(`${matchId}:${round}`);
  const first: "A" | "B" = seed % 2 === 0 ? "A" : "B";
  return { round, first, bidA: agentA.bid, bidB: agentB.bid, tieBroken: true };
}

function stableHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
