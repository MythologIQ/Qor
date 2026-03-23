export interface ConflictEvent {
  kind: ConflictKind;
  timestamp: number;
  weight?: number;
}

export enum ConflictKind {
  CONTRADICTION = 'contradiction',
  DISPUTED_CLAIM = 'disputed_claim',
  INVALIDATED_SOURCE = 'invalidated_source',
}

export interface EntropyParams {
  contradictionWeight: number;
  disputedClaimWeight: number;
  invalidatedSourceWeight: number;
  floor: number;
  diminishingFactor: number;
}

export const DEFAULT_ENTROPY_PARAMS: EntropyParams = {
  contradictionWeight: 0.20,
  disputedClaimWeight: 0.10,
  invalidatedSourceWeight: 0.15,
  floor: 0.0,
  diminishingFactor: 0.85,
};

export function getConflictWeight(
  event: ConflictEvent,
  params: EntropyParams = DEFAULT_ENTROPY_PARAMS
): number {
  if (event.weight !== undefined) {
    return event.weight;
  }

  switch (event.kind) {
    case ConflictKind.CONTRADICTION:
      return params.contradictionWeight;
    case ConflictKind.DISPUTED_CLAIM:
      return params.disputedClaimWeight;
    case ConflictKind.INVALIDATED_SOURCE:
      return params.invalidatedSourceWeight;
    default:
      return 0;
  }
}

export function applySingleConflict(
  saturation: number,
  event: ConflictEvent,
  params: EntropyParams = DEFAULT_ENTROPY_PARAMS
): number {
  const weight = getConflictWeight(event, params);
  const delta = weight * saturation;
  const newSaturation = saturation - delta;
  return Math.max(newSaturation, params.floor);
}

export function applyConflictSequence(
  initialSaturation: number,
  events: ConflictEvent[],
  params: EntropyParams = DEFAULT_ENTROPY_PARAMS
): number {
  let saturation = initialSaturation;
  const eventsByKind = new Map<ConflictKind, number>();

  for (const event of events) {
    const kind = event.kind;
    const occurrences = eventsByKind.get(kind) || 0;
    const effectiveWeight = getConflictWeight(event, params) * Math.pow(params.diminishingFactor, occurrences);
    
    const delta = effectiveWeight * saturation;
    saturation = Math.max(saturation - delta, params.floor);
    
    eventsByKind.set(kind, occurrences + 1);
  }

  return saturation;
}

export function calculateEntropyImpact(
  initialSaturation: number,
  events: ConflictEvent[],
  params: EntropyParams = DEFAULT_ENTROPY_PARAMS
): number {
  const finalSaturation = applyConflictSequence(initialSaturation, events, params);
  return initialSaturation - finalSaturation;
}

export function canStabilizeAfterConflicts(
  saturation: number,
  events: ConflictEvent[],
  stabilityThreshold: number,
  params: EntropyParams = DEFAULT_ENTROPY_PARAMS
): boolean {
  const finalSaturation = applyConflictSequence(saturation, events, params);
  return finalSaturation >= stabilityThreshold;
}

export function compareConflictSeverity(saturation: number): {
  contradictionImpact: number;
  disputedClaimImpact: number;
  invalidatedSourceImpact: number;
} {
  const params = DEFAULT_ENTROPY_PARAMS;
  return {
    contradictionImpact: applySingleConflict(saturation, { kind: ConflictKind.CONTRADICTION, timestamp: Date.now() }, params),
    disputedClaimImpact: applySingleConflict(saturation, { kind: ConflictKind.DISPUTED_CLAIM, timestamp: Date.now() }, params),
    invalidatedSourceImpact: applySingleConflict(saturation, { kind: ConflictKind.INVALIDATED_SOURCE, timestamp: Date.now() }, params),
  };
}

export function inspectEntropyWeights(params: EntropyParams = DEFAULT_ENTROPY_PARAMS): EntropyParams {
  return { ...params };
}
