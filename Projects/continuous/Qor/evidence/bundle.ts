import { randomUUID } from "node:crypto";
import type { EvidenceBundle, EvidenceEntry, EvidencePolicy, BundleCompleteness } from "./contract";

export function materialize(
  entries: EvidenceEntry[],
  sessionId: string,
  intentId: string,
  workCellIds: string[],
): EvidenceBundle {
  const filtered = entries.filter(
    e => !e.workCellId || workCellIds.includes(e.workCellId),
  );
  const confidence = filtered.length > 0
    ? filtered.reduce((sum, e) => sum + e.confidence, 0) / filtered.length
    : 0;
  const completeness = scanCompleteness(filtered);
  return {
    id: randomUUID(),
    sessionId,
    intentId,
    workCellIds,
    entries: filtered,
    confidence,
    completeness,
    generatedAt: new Date().toISOString(),
  };
}

export function checkCompleteness(
  bundle: EvidenceBundle,
  policy: EvidencePolicy,
): BundleCompleteness {
  const base = scanCompleteness(bundle.entries);
  const missing: string[] = [];
  if (policy.requireTests && !base.hasTests) missing.push("tests");
  if (policy.requireReview && !base.hasReview) missing.push("review");
  return { ...base, missing };
}

function scanCompleteness(entries: EvidenceEntry[]): BundleCompleteness {
  return {
    hasTests: entries.some(e => e.kind === "TestResult"),
    hasReview: entries.some(e => e.kind === "ReviewRecord"),
    hasPolicyDecisions: entries.some(e => e.kind === "PolicyDecision"),
    hasCodeDeltas: entries.some(e => e.kind === "CodeDelta"),
    missing: [],
  };
}
