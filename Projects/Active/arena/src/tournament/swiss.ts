// Swiss round pairing algorithm
// Phase E — tournament bracket generation

export interface Standing {
  operatorId: number;
  score: number;
}

export interface Pairing {
  player1: number;
  player2: number;
}

export function pairRound(
  standings: Standing[],
  priorPairings: Set<string>
): Pairing[] {
  // Sort descending by score, then ascending by operatorId for stability
  const sorted = [...standings].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.operatorId - b.operatorId;
  });

  const paired = new Set<number>();
  const pairings: Pairing[] = [];

  for (const entry of sorted) {
    if (paired.has(entry.operatorId)) continue;

    for (const opponent of sorted) {
      if (opponent.operatorId === entry.operatorId) continue;
      if (paired.has(opponent.operatorId)) continue;

      const key = pairingKey(entry.operatorId, opponent.operatorId);
      if (priorPairings.has(key)) continue;

      pairings.push({ player1: entry.operatorId, player2: opponent.operatorId });
      paired.add(entry.operatorId);
      paired.add(opponent.operatorId);
      break;
    }
  }

  return pairings;
}

function pairingKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}