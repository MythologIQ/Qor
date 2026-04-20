// HexaWars Arena — Advisory Similarity (Plan A v2, Phase 2)
// 5-gram Jaccard similarity. Advisory-only: produces flags, never writes.

export const NGRAM_SIZE = 5;
export const DEFAULT_THRESHOLD = 0.85;

export interface CorpusEntry {
  operatorId: number;
  fingerprint: string;
  normalizedCode: string;
}

export interface SimilarityFlag {
  operatorId: number;
  fingerprint: string;
  score: number;
}

export function ngrams(text: string, n: number = NGRAM_SIZE): Set<string> {
  const out = new Set<string>();
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length === 0) return out;
  if (s.length < n) {
    out.add(s);
    return out;
  }
  for (let i = 0; i + n <= s.length; i++) {
    out.add(s.slice(i, i + n));
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const A = ngrams(a);
  const B = ngrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function flagAgainst(
  candidateNormalizedCode: string,
  corpus: CorpusEntry[],
  threshold: number = DEFAULT_THRESHOLD,
): SimilarityFlag[] {
  const flags: SimilarityFlag[] = [];
  for (const entry of corpus) {
    const s = similarity(candidateNormalizedCode, entry.normalizedCode);
    if (s >= threshold) {
      flags.push({
        operatorId: entry.operatorId,
        fingerprint: entry.fingerprint,
        score: s,
      });
    }
  }
  return flags.sort((a, b) => b.score - a.score);
}
