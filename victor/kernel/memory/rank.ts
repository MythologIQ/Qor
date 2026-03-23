import type { CacheEntryRecord, SearchChunkHit, SemanticEdgeRecord, SemanticNodeRecord, TemporalMetadata } from './types';

// ============================================================================
// CMHL Temporal Decay (Continual Memory Half-Life)
// ============================================================================

/** Default lambda values for each decay profile (exponential decay constants) */
export const DEFAULT_DECAY_LAMBDA: Record<import('./types').DecayProfile, number> = {
  ephemeral: 0.001,      // ~11.5 hours half-life
  session: 0.0001,       // ~4.8 days half-life
  standard: 0.00001,     // ~48 days half-life
  durable: 0.000001,   // ~1.3 years half-life
  permanent: 0,        // never decays
};

/** Minimum decay weight for a memory to be considered retrievable */
export const DECAY_RETRIEVAL_THRESHOLD = 0.05;

/**
 * Compute the decay-weighted salience of a memory at a given point in time.
 * Uses exponential decay: w(t) = w0 * exp(-lambda * elapsedSeconds)
 * 
 * @param temporal - The temporal metadata for the memory (undefined = no decay)
 * @param now - Current timestamp in milliseconds
 * @returns Decay weight between 0 and 1.0 (1.0 = full weight, no decay)
 */
export function computeDecayWeight(
  temporal: TemporalMetadata | undefined,
  now: number,
): number {
  // No temporal metadata or permanent memory = no decay
  if (!temporal || temporal.lambda === 0) {
    return 1.0;
  }

  const elapsedMs = now - temporal.t0;
  
  // Future-dated or current memory = full weight
  if (elapsedMs <= 0) {
    return temporal.w0;
  }

  const elapsedSeconds = elapsedMs / 1000;
  const weight = temporal.w0 * Math.exp(-temporal.lambda * elapsedSeconds);
  
  // Clamp to prevent floating point underflow
  return Math.max(0, Math.min(1.0, weight));
}

/**
 * Assign the appropriate decay profile based on epistemic type and node characteristics.
 * This is a helper for the ingestion pipeline to set initial temporal metadata.
 * 
 * @param epistemicType - The epistemic classification of the memory
 * @param nodeType - For semantic nodes, the type of node
 * @returns The recommended DecayProfile
 */
export function assignDecayProfile(
  epistemicType: import('./types').EpistemicType,
  nodeType?: import('./types').SemanticNodeRecord['nodeType'],
): import('./types').DecayProfile {
  // Node type overrides for critical memory
  if (nodeType) {
    switch (nodeType) {
      case 'Decision':
      case 'Constraint':
        return 'durable';
      case 'Project':
        return 'permanent';
      case 'Task':
        return 'session'; // Active tasks decay faster, completed tasks move to standard
      default:
        break;
    }
  }

  // Epistemic type defaults
  switch (epistemicType) {
    case 'policy-ruling':
      return 'permanent';
    case 'observation':
    case 'source-claim':
      return 'standard';
    case 'inferred-relation':
    case 'synthesis':
      return 'session';
    case 'conjecture':
      return 'ephemeral';
    default:
      return 'standard';
  }
}

/**
 * Create temporal metadata for a new memory object during ingestion.
 * Uses assignDecayProfile to determine the appropriate decay profile.
 * 
 * @param epistemicType - The epistemic classification of the memory
 * @param nodeType - For semantic nodes, the type of node
 * @param now - Optional timestamp for deterministic testing (defaults to Date.now())
 * @returns TemporalMetadata with initialized decay parameters
 */
export function createTemporalMetadata(
  epistemicType: import('./types').EpistemicType,
  nodeType?: import('./types').SemanticNodeRecord['nodeType'],
  now?: number,
): import('./types').TemporalMetadata {
  const decayProfile = assignDecayProfile(epistemicType, nodeType);
  const lambda = DEFAULT_DECAY_LAMBDA[decayProfile];
  
  return {
    t0: now ?? Date.now(),
    w0: 1.0,
    lambda,
    decayProfile,
    restakeCount: 0,
  };
}

// ============================================================================
// Ranking Functions (existing code follows)
// ============================================================================

export function rankChunkHits(hits: SearchChunkHit[], query?: string, now?: number): SearchChunkHit[] {
  const terms = query ? tokenizeQuery(query) : [];
  const currentTime = now ?? Date.now();
  const ranked = [...hits].sort((a, b) => {
    const scoreDelta = scoreChunk(b, terms, currentTime) - scoreChunk(a, terms, currentTime);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.chunk.index - b.chunk.index;
  });
  return diversifyBySource(ranked, (item) => item.chunk.documentId, (item) => item.chunk.id);
}

export function rankSemanticNodes(nodes: SemanticNodeRecord[], query: string, now?: number): SemanticNodeRecord[] {
  const terms = tokenizeQuery(query);
  const queryIntent = detectQueryIntent(terms);
  const currentTime = now ?? Date.now();

  const ranked = [...nodes].sort((a, b) => {
    const scoreDelta = scoreSemanticNode(b, terms, queryIntent, currentTime) - scoreSemanticNode(a, terms, queryIntent, currentTime);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.label.localeCompare(b.label);
  });
  return diversifyBySource(ranked, (item) => item.documentId, (item) => `${item.nodeType}:${item.label.toLowerCase()}`);
}

export function uniqueNodes(nodes: SemanticNodeRecord[]): SemanticNodeRecord[] {
  return dedupeById(nodes).filter((node) => node.state === 'active');
}

export function uniqueEdges(edges: SemanticEdgeRecord[]): SemanticEdgeRecord[] {
  return dedupeById(edges).filter((edge) => edge.state === 'active');
}

export function rankCacheEntries(entries: CacheEntryRecord[], query: string): CacheEntryRecord[] {
  const terms = tokenizeQuery(query);

  return [...entries]
    .filter((entry) => entry.status === 'fresh')
    .sort((a, b) => scoreEntry(b.summary, terms) - scoreEntry(a.summary, terms));
}

function scoreEntry(summary: string, terms: string[]): number {
  const lower = summary.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0) - securityPenalty(lower);
}

function scoreChunk(hit: SearchChunkHit, terms: string[], now?: number): number {
  const content = hit.chunk.text.toLowerCase();
  const lexicalMatches = terms.reduce((score, term) => score + (content.includes(term) ? 1 : 0), 0);
  const phraseBoost = terms.length > 1 && content.includes(terms.join(' ')) ? 2 : 0;
  const baseScore = hit.score * 10 + lexicalMatches * 3 + phraseBoost - securityPenalty(content) * 20;
  
  // Apply CMHL temporal decay multiplier
  const decayWeight = computeDecayWeight(hit.chunk.temporal, now ?? Date.now());
  return baseScore * decayWeight;
}

function scoreSemanticNode(
  node: SemanticNodeRecord,
  terms: string[],
  queryIntent: QueryIntent,
  now?: number,
): number {
  const label = node.label.toLowerCase();
  const summary = node.summary.toLowerCase();
  const labelMatches = terms.reduce((score, term) => score + (label.includes(term) ? 1 : 0), 0);
  const summaryMatches = terms.reduce((score, term) => score + (summary.includes(term) ? 1 : 0), 0);
  const intentBoost = queryIntent[node.nodeType] ?? 0;
  const baseScore = labelMatches * 5 + summaryMatches * 2 + intentBoost - securityPenalty(`${label} ${summary}`) * 10;
  
  // Apply CMHL temporal decay multiplier
  const decayWeight = computeDecayWeight(node.temporal, now ?? Date.now());
  return baseScore * decayWeight;
}

export function tokenizeQuery(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

type QueryIntent = Partial<Record<SemanticNodeRecord['nodeType'], number>>;

function detectQueryIntent(terms: string[]): QueryIntent {
  const intent: QueryIntent = {};

  if (terms.some((term) => ['task', 'tasks', 'phase', 'phases', 'active', 'pending', 'blocked'].includes(term))) {
    intent.Task = 5;
    intent.Goal = 2;
  }

  if (terms.some((term) => ['decision', 'decide', 'authority', 'model'].includes(term))) {
    intent.Decision = 5;
  }

  if (terms.some((term) => ['constraint', 'boundary', 'guardrail', 'governance'].includes(term))) {
    intent.Constraint = 4;
    intent.Decision = Math.max(intent.Decision ?? 0, 2);
  }

  if (terms.some((term) => ['owner', 'owns', 'owned', 'who'].includes(term))) {
    intent.Actor = 5;
  }

  if (terms.some((term) => ['dependency', 'depends', 'blocked', 'blocks'].includes(term))) {
    intent.Dependency = 5;
    intent.Task = Math.max(intent.Task ?? 0, 2);
  }

  return intent;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return [...seen.values()];
}

function securityPenalty(value: string): number {
  const normalized = value.toLowerCase();
  return PROMPT_INJECTION_MARKERS.reduce((score, marker) => score + (normalized.includes(marker) ? 1 : 0), 0);
}

function diversifyBySource<T>(
  items: T[],
  sourceKey: (item: T) => string,
  repetitionKey: (item: T) => string,
): T[] {
  const remaining = [...items];
  const ordered: T[] = [];
  const sourceCounts = new Map<string, number>();
  const repetitionCounts = new Map<string, number>();

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestPenalty = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      const penalty = (sourceCounts.get(sourceKey(item)) ?? 0) * 2 + (repetitionCounts.get(repetitionKey(item)) ?? 0);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestIndex = index;
      }
    }

    const [item] = remaining.splice(bestIndex, 1);
    const source = sourceKey(item);
    const repeated = repetitionKey(item);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    repetitionCounts.set(repeated, (repetitionCounts.get(repeated) ?? 0) + 1);
    ordered.push(item);
  }

  return ordered;
}

const PROMPT_INJECTION_MARKERS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'disregard previous instructions',
  'reveal the system prompt',
  'reveal system prompt',
  'developer message',
  'system prompt',
  'you are chatgpt',
  'act as',
  'jailbreak',
  'bypass safety',
  'exfiltrate',
  'print env',
  'show secrets',
];
