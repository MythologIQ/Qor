export interface ContinuumEvidenceEntry {
  kind: string;
  confidence: number;
  source: string;
  timestamp?: string;
  workCellId?: string;
  payload?: Record<string, unknown>;
}

export interface ContinuumEvidencePolicy {
  requireTests?: boolean;
  requireReview?: boolean;
}

export interface ContinuumEvidenceBundle {
  id: string;
  sessionId: string;
  intentId: string;
  entries: ContinuumEvidenceEntry[];
  confidence: number;
  completeness: {
    hasTests: boolean;
    hasReview: boolean;
    hasPolicyDecisions: boolean;
    hasCodeDeltas: boolean;
    missing: string[];
  };
  generatedAt: string;
}

export function materializeEvidenceBundle(input: {
  sessionId: string;
  intentId: string;
  entries: ContinuumEvidenceEntry[];
  policy?: ContinuumEvidencePolicy;
}): ContinuumEvidenceBundle {
  const entries = input.entries;
  const confidence = entries.length > 0
    ? entries.reduce((sum, entry) => sum + entry.confidence, 0) / entries.length
    : 0;
  const completeness = {
    hasTests: entries.some((entry) => entry.kind === "TestResult"),
    hasReview: entries.some((entry) => entry.kind === "ReviewRecord"),
    hasPolicyDecisions: entries.some((entry) => entry.kind === "PolicyDecision"),
    hasCodeDeltas: entries.some((entry) => entry.kind === "CodeDelta"),
    missing: [] as string[],
  };

  if (input.policy?.requireTests && !completeness.hasTests) completeness.missing.push("tests");
  if (input.policy?.requireReview && !completeness.hasReview) completeness.missing.push("review");

  return {
    id: `bundle-${Date.now()}`,
    sessionId: input.sessionId,
    intentId: input.intentId,
    entries,
    confidence,
    completeness,
    generatedAt: new Date().toISOString(),
  };
}
