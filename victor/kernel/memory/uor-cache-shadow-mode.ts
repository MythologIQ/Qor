/**
 * UOR Cache Shadow Mode
 * 
 * Shadow-mode cache validation runs validation logic without blocking
 * cache usage. Produces telemetry on invalidation rates, false positives,
 * and migration gaps before fail-closed enforcement activation.
 * 
 * @module uor-cache-shadow-mode
 */

import {
  CacheEntryRecord,
  CacheDependencyRef,
  FingerprintLookup,
} from "./types";

import {
  UORCacheDependency,
  DependencyValidationResult,
  CacheValidationResult,
  validateDependency,
  UORFingerprint,
} from "./uor-cache-validation";

/**
 * Shadow mode configuration
 */
export interface ShadowModeConfig {
  /** Enable shadow mode (non-blocking) validation */
  enabled: boolean;
  /** Sample rate for validation (0.0-1.0) - validate only a fraction of entries */
  sampleRate: number;
  /** Maximum entries to validate per batch */
  maxBatchSize: number;
  /** Write telemetry to audit trail */
  auditTelemetry: boolean;
  /** Compare shadow results against live validation results */
  compareWithLive: boolean;
}

/**
 * Default shadow mode configuration
 */
export const DEFAULT_SHADOW_CONFIG: ShadowModeConfig = {
  enabled: true,
  sampleRate: 1.0, // Validate all entries in shadow mode
  maxBatchSize: 100,
  auditTelemetry: true,
  compareWithLive: true,
};

/**
 * Shadow validation telemetry for a single entry
 */
export interface ShadowEntryTelemetry {
  /** Cache entry ID */
  entryId: string;
  /** Timestamp of validation */
  validatedAt: string;
  /** Shadow validation result (what would happen) */
  shadowResult: CacheValidationResult;
  /** Live validation result (what actually happened, if compareWithLive) */
  liveResult?: CacheValidationResult;
  /** Discrepancy between shadow and live */
  discrepancy?: ValidationDiscrepancy;
  /** Individual dependency results */
  dependencyResults: DependencyTelemetry[];
}

/**
 * Dependency-level telemetry
 */
export interface DependencyTelemetry {
  /** Dependency kind */
  kind: CacheDependencyRef["kind"];
  /** Entity ID */
  id: string;
  /** Validation result */
  valid: boolean;
  /** Whether UOR fingerprint was present */
  hadUORFingerprint: boolean;
  /** Whether this represents a migration gap */
  isMigrationGap: boolean;
  /** Reason for invalidation, if any */
  invalidReason?: string;
}

/**
 * Types of validation discrepancies
 */
export type DiscrepancyType =
  | "false-positive"      // Shadow marked invalid, live marked valid (over-eager)
  | "false-negative"      // Shadow marked valid, live marked invalid (missed stale)
  | "fingerprint-mismatch" // UOR fingerprint comparison mismatch
  | "migration-gap-detected"; // Legacy dependency without fingerprint

/**
 * Discrepancy between shadow and live validation
 */
export interface ValidationDiscrepancy {
  /** Type of discrepancy */
  type: DiscrepancyType;
  /** Severity: info, warning, critical */
  severity: "info" | "warning" | "critical";
  /** Description of the discrepancy */
  description: string;
  /** Affected dependency, if applicable */
  affectedDependency?: {
    kind: CacheDependencyRef["kind"];
    id: string;
  };
}

/**
 * Batch shadow telemetry summary
 */
export interface ShadowBatchTelemetry {
  /** Batch ID */
  batchId: string;
  /** Timestamp of batch validation */
  validatedAt: string;
  /** Total entries processed */
  totalEntries: number;
  /** Entries that would be invalidated (shadow) */
  wouldBeInvalidated: number;
  /** Entries actually invalidated (live) */
  actuallyInvalidated?: number;
  /** Invalidation rate (0.0-1.0) */
  invalidationRate: number;
  /** Number of false positives detected */
  falsePositives: number;
  /** Number of false negatives detected */
  falseNegatives: number;
  /** Migration gaps detected */
  migrationGaps: number;
  /** Dependencies validated */
  totalDependencies: number;
  /** Dependencies with UOR fingerprints */
  uorFingerprintsPresent: number;
  /** Legacy dependencies without fingerprints */
  legacyDependencies: number;
  /** Average validation time per entry (ms) */
  avgValidationTimeMs: number;
}

/**
 * Shadow mode audit event for ledger
 */
export interface ShadowModeAuditEvent {
  /** Event type */
  type: "shadow-validation" | "shadow-batch-summary" | "shadow-discrepancy";
  /** Timestamp */
  timestamp: string;
  /** Batch ID */
  batchId: string;
  /** Shadow configuration at time of validation */
  config: ShadowModeConfig;
  /** Telemetry data */
  telemetry: ShadowEntryTelemetry | ShadowBatchTelemetry | ValidationDiscrepancy;
}

/**
 * Lookup function for current UOR fingerprints
 */
export type CurrentFingerprintLookup = (
  kind: CacheDependencyRef["kind"],
  id: string
) => UORFingerprint | undefined;

/**
 * Run cache validation in shadow mode
 * Validates without blocking - returns what WOULD happen without enforcing
 */
export function validateCacheEntryShadow(
  entry: CacheEntryRecord,
  lookup: FingerprintLookup,
  config: Partial<ShadowModeConfig> = {}
): ShadowEntryTelemetry {
  const fullConfig = { ...DEFAULT_SHADOW_CONFIG, ...config };
  const validatedAt = new Date().toISOString();
  const now = Date.now();

  // Build dependency-level telemetry by validating each dependency
  const dependencyResults: DependencyTelemetry[] = [];
  let allValid = true;
  let staleCount = 0;
  let missingCount = 0;

  for (const dep of entry.dependencyRefs) {
    // Cast to check for UOR fingerprint
    const uorDep = dep as UORCacheDependency;
    const hasFingerprint = !!uorDep.uorFingerprint;

    // Check if fingerprint is available in current state (migration gap)
    let currentFingerprint: UORFingerprint | undefined;
    switch (dep.kind) {
      case "document":
        currentFingerprint = lookup.getDocumentFingerprint(dep.id);
        break;
      case "chunk":
        currentFingerprint = lookup.getChunkFingerprint(dep.id);
        break;
      case "semantic-node":
        currentFingerprint = lookup.getNodeFingerprint(dep.id);
        break;
      default:
        currentFingerprint = undefined;
    }

    const isMigrationGap = !hasFingerprint && !!currentFingerprint;

    let depValid = true;
    let invalidReason: string | undefined;

    if (hasFingerprint) {
      // Validate the dependency
      const result = validateDependency(uorDep, lookup, now);
      depValid = result.valid;
      if (!depValid) {
        invalidReason = result.error;
        if (result.error?.includes("not found")) {
          missingCount++;
        } else {
          staleCount++;
        }
      }
    } else {
      // No fingerprint - in strict mode this is invalid
      depValid = false;
      invalidReason = "Legacy dependency without UOR fingerprint";
      missingCount++;
    }

    if (!depValid) {
      allValid = false;
    }

    dependencyResults.push({
      kind: dep.kind,
      id: dep.id,
      valid: depValid,
      hadUORFingerprint: hasFingerprint,
      isMigrationGap,
      invalidReason,
    });
  }

  // Determine action based on validation results
  let action: CacheValidationResult["action"];
  if (allValid) {
    action = "use";
  } else if (missingCount > 0) {
    action = "invalidate";
  } else if (staleCount > 0) {
    action = "invalidate";
  } else {
    action = "revalidate";
  }

  // Build shadow result
  const shadowResult: CacheValidationResult = {
    cacheEntryId: entry.id,
    valid: allValid,
    dependencyResults: [], // Simplified - full results not needed for shadow
    staleDependencyCount: staleCount,
    missingDependencyCount: missingCount,
    validatedAt: now,
    action,
    governance: {
      state: allValid ? "durable" : "deprecated",
      createdAt: now,
      updatedAt: now,
      version: 1,
      auditTrail: [{
        timestamp: now,
        action: "validate",
        actor: "shadow-mode",
        rationale: allValid
          ? "All UOR dependency fingerprints validated successfully (shadow mode)."
          : `${staleCount} stale, ${missingCount} missing dependencies detected (shadow mode).`,
      }],
    },
  };

  return {
    entryId: entry.id,
    validatedAt,
    shadowResult,
    dependencyResults,
  };
}

/**
 * Compare shadow validation against live validation
 * Identifies discrepancies that indicate false positives/negatives
 */
export function compareShadowVsLive(
  shadowTelemetry: ShadowEntryTelemetry,
  liveResult: CacheValidationResult,
  entry: CacheEntryRecord
): ValidationDiscrepancy[] {
  const discrepancies: ValidationDiscrepancy[] = [];

  // False positive: shadow marked invalid, but live allowed it
  if (!shadowTelemetry.shadowResult.valid && liveResult.valid) {
    discrepancies.push({
      type: "false-positive",
      severity: "warning",
      description: `Shadow validation marked entry ${shadowTelemetry.entryId} as invalid but live validation allowed it. Shadow reason: ${shadowTelemetry.shadowResult.action}`,
    });
  }

  // False negative: shadow marked valid, but live rejected it
  if (shadowTelemetry.shadowResult.valid && !liveResult.valid) {
    discrepancies.push({
      type: "false-negative",
      severity: "critical",
      description: `Shadow validation marked entry ${shadowTelemetry.entryId} as valid but live validation rejected it. Live reason: ${liveResult.action}`,
    });
  }

  // Check for migration gaps
  const migrationGaps = shadowTelemetry.dependencyResults.filter(
    (d) => d.isMigrationGap
  );
  if (migrationGaps.length > 0) {
    for (const gap of migrationGaps) {
      discrepancies.push({
        type: "migration-gap-detected",
        severity: "info",
        description: `Dependency ${gap.id} (${gap.kind}) has no UOR fingerprint but current state has fingerprint available. Migration candidate.`,
        affectedDependency: {
          kind: gap.kind,
          id: gap.id,
        },
      });
    }
  }

  return discrepancies;
}

/**
 * Run batch shadow validation with telemetry collection
 */
export function runShadowBatchValidation(
  entries: CacheEntryRecord[],
  lookup: FingerprintLookup,
  config: Partial<ShadowModeConfig> = {}
): {
  telemetry: ShadowBatchTelemetry;
  entries: ShadowEntryTelemetry[];
  auditEvents: ShadowModeAuditEvent[];
} {
  const fullConfig = { ...DEFAULT_SHADOW_CONFIG, ...config };
  const batchId = generateBatchId();
  const validatedAt = new Date().toISOString();

  // Apply sampling if needed
  const sampleSize = Math.ceil(entries.length * fullConfig.sampleRate);
  const sampledEntries = entries.slice(0, Math.min(sampleSize, fullConfig.maxBatchSize));

  // Validate each entry
  const entryTelemetry: ShadowEntryTelemetry[] = [];
  const auditEvents: ShadowModeAuditEvent[] = [];
  const startTime = Date.now();

  for (const entry of sampledEntries) {
    const telemetry = validateCacheEntryShadow(entry, lookup, fullConfig);
    entryTelemetry.push(telemetry);

    // Write individual audit event if enabled
    if (fullConfig.auditTelemetry) {
      auditEvents.push({
        type: "shadow-validation",
        timestamp: validatedAt,
        batchId,
        config: fullConfig,
        telemetry,
      });
    }
  }

  const endTime = Date.now();

  // Calculate batch summary
  const wouldBeInvalidated = entryTelemetry.filter(
    (e) => !e.shadowResult.valid
  ).length;

  const allDependencyResults = entryTelemetry.flatMap(
    (e) => e.dependencyResults
  );
  const uorFingerprintsPresent = allDependencyResults.filter(
    (d) => d.hadUORFingerprint
  ).length;
  const legacyDependencies = allDependencyResults.filter(
    (d) => !d.hadUORFingerprint
  ).length;
  const migrationGaps = allDependencyResults.filter((d) => d.isMigrationGap)
    .length;

  // Compare with live if requested
  let actuallyInvalidated: number | undefined;
  let falsePositives = 0;
  let falseNegatives = 0;

  if (fullConfig.compareWithLive) {
    actuallyInvalidated = 0;
    for (let i = 0; i < sampledEntries.length; i++) {
      const entry = sampledEntries[i];
      const shadow = entryTelemetry[i];

      // Simulate live validation (less strict, may use advisory timestamps)
      const liveValid = entry.status === "fresh"; // Simplified live check
      const liveResult: CacheValidationResult = {
        cacheEntryId: entry.id,
        valid: liveValid,
        dependencyResults: [],
        staleDependencyCount: liveValid ? 0 : 1,
        missingDependencyCount: 0,
        validatedAt: Date.now(),
        action: liveValid ? "use" : "invalidate",
        governance: {
          state: liveValid ? "durable" : "deprecated",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          auditTrail: [],
        },
      };

      if (!liveResult.valid) actuallyInvalidated++;

      const discrepancies = compareShadowVsLive(shadow, liveResult, entry);
      for (const d of discrepancies) {
        if (d.type === "false-positive") falsePositives++;
        if (d.type === "false-negative") falseNegatives++;

        auditEvents.push({
          type: "shadow-discrepancy",
          timestamp: validatedAt,
          batchId,
          config: fullConfig,
          telemetry: d,
        });
      }
    }
  }

  const batchTelemetry: ShadowBatchTelemetry = {
    batchId,
    validatedAt,
    totalEntries: sampledEntries.length,
    wouldBeInvalidated,
    actuallyInvalidated,
    invalidationRate:
      sampledEntries.length > 0 ? wouldBeInvalidated / sampledEntries.length : 0,
    falsePositives,
    falseNegatives,
    migrationGaps,
    totalDependencies: allDependencyResults.length,
    uorFingerprintsPresent,
    legacyDependencies,
    avgValidationTimeMs:
      sampledEntries.length > 0
        ? (endTime - startTime) / sampledEntries.length
        : 0,
  };

  // Add batch summary audit event
  if (fullConfig.auditTelemetry) {
    auditEvents.push({
      type: "shadow-batch-summary",
      timestamp: validatedAt,
      batchId,
      config: fullConfig,
      telemetry: batchTelemetry,
    });
  }

  return {
    telemetry: batchTelemetry,
    entries: entryTelemetry,
    auditEvents,
  };
}

/**
 * Check if shadow mode telemetry indicates safe migration to fail-closed
 */
export function assessMigrationReadiness(
  telemetry: ShadowBatchTelemetry[],
  thresholds: {
    maxFalsePositiveRate: number;
    maxFalseNegativeRate: number;
    maxMigrationGapRate: number;
    minSampleSize: number;
  } = {
    maxFalsePositiveRate: 0.05, // 5% false positives acceptable
    maxFalseNegativeRate: 0.01, // 1% false negatives maximum
    maxMigrationGapRate: 0.10, // 10% migration gaps acceptable
    minSampleSize: 100,
  }
): {
  ready: boolean;
  reasons: string[];
  metrics: {
    totalSamples: number;
    avgFalsePositiveRate: number;
    avgFalseNegativeRate: number;
    avgMigrationGapRate: number;
  };
} {
  const totalSamples = telemetry.reduce((sum, t) => sum + t.totalEntries, 0);

  if (totalSamples < thresholds.minSampleSize) {
    return {
      ready: false,
      reasons: [
        `Insufficient sample size: ${totalSamples} < ${thresholds.minSampleSize}`,
      ],
      metrics: {
        totalSamples,
        avgFalsePositiveRate: 0,
        avgFalseNegativeRate: 0,
        avgMigrationGapRate: 0,
      },
    };
  }

  const avgFalsePositiveRate =
    telemetry.reduce((sum, t) => sum + t.falsePositives, 0) / totalSamples;
  const avgFalseNegativeRate =
    telemetry.reduce((sum, t) => sum + t.falseNegatives, 0) / totalSamples;
  const avgMigrationGapRate =
    telemetry.reduce((sum, t) => sum + t.migrationGaps, 0) /
    telemetry.reduce((sum, t) => sum + t.totalDependencies, 0);

  const reasons: string[] = [];

  if (avgFalsePositiveRate > thresholds.maxFalsePositiveRate) {
    reasons.push(
      `False positive rate ${(avgFalsePositiveRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.maxFalsePositiveRate * 100).toFixed(2)}%`
    );
  }

  if (avgFalseNegativeRate > thresholds.maxFalseNegativeRate) {
    reasons.push(
      `False negative rate ${(avgFalseNegativeRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.maxFalseNegativeRate * 100).toFixed(2)}%`
    );
  }

  if (avgMigrationGapRate > thresholds.maxMigrationGapRate) {
    reasons.push(
      `Migration gap rate ${(avgMigrationGapRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.maxMigrationGapRate * 100).toFixed(2)}%`
    );
  }

  return {
    ready: reasons.length === 0,
    reasons,
    metrics: {
      totalSamples,
      avgFalsePositiveRate,
      avgFalseNegativeRate,
      avgMigrationGapRate,
    },
  };
}

/**
 * Format shadow telemetry for human-readable output
 */
export function formatShadowTelemetry(
  telemetry: ShadowBatchTelemetry
): string {
  const lines = [
    `Shadow Mode Batch: ${telemetry.batchId}`,
    `Validated at: ${telemetry.validatedAt}`,
    ``,
    `Entries:`,
    `  Total processed: ${telemetry.totalEntries}`,
    `  Would be invalidated: ${telemetry.wouldBeInvalidated} (${(telemetry.invalidationRate * 100).toFixed(2)}%)`,
  ];

  if (telemetry.actuallyInvalidated !== undefined) {
    lines.push(
      `  Actually invalidated (live): ${telemetry.actuallyInvalidated}`
    );
  }

  lines.push(
    ``,
    `Discrepancies:`,
    `  False positives: ${telemetry.falsePositives}`,
    `  False negatives: ${telemetry.falseNegatives}`,
    `  Migration gaps: ${telemetry.migrationGaps}`,
    ``,
    `Dependencies:`,
    `  Total: ${telemetry.totalDependencies}`,
    `  With UOR fingerprints: ${telemetry.uorFingerprintsPresent}`,
    `  Legacy (no fingerprint): ${telemetry.legacyDependencies}`,
    ``,
    `Performance:`,
    `  Average validation time: ${telemetry.avgValidationTimeMs.toFixed(2)}ms per entry`
  );

  return lines.join("\n");
}

/**
 * Generate a unique batch ID
 */
function generateBatchId(): string {
  return `shadow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Inspect shadow mode configuration and status
 */
export function inspectShadowMode(
  config: Partial<ShadowModeConfig> = {}
): {
  config: ShadowModeConfig;
  status: "active" | "paused" | "disabled";
  recommendations: string[];
} {
  const fullConfig = { ...DEFAULT_SHADOW_CONFIG, ...config };

  const recommendations: string[] = [];

  if (!fullConfig.enabled) {
    recommendations.push("Shadow mode is disabled. Enable to collect migration telemetry.");
  }

  if (fullConfig.sampleRate < 1.0) {
    recommendations.push(
      `Sampling at ${(fullConfig.sampleRate * 100).toFixed(0)}% may miss edge cases. Consider increasing to 100% for comprehensive analysis.`
    );
  }

  if (!fullConfig.auditTelemetry) {
    recommendations.push("Audit telemetry is disabled. Enable for governance review.");
  }

  if (!fullConfig.compareWithLive) {
    recommendations.push(
      "Live comparison is disabled. Enable to detect false positives/negatives."
    );
  }

  const status: "active" | "paused" | "disabled" = fullConfig.enabled
    ? fullConfig.sampleRate > 0
      ? "active"
      : "paused"
    : "disabled";

  return {
    config: fullConfig,
    status,
    recommendations,
  };
}

/**
 * Export shadow telemetry to JSONL format for ledger
 */
export function exportTelemetryToJSONL(
  auditEvents: ShadowModeAuditEvent[]
): string {
  return auditEvents.map((e) => JSON.stringify(e)).join("\n");
}

/**
 * Aggregate telemetry across multiple batches
 */
export function aggregateShadowTelemetry(
  batches: ShadowBatchTelemetry[]
): {
  totalEntries: number;
  totalInvalidated: number;
  overallInvalidationRate: number;
  totalFalsePositives: number;
  totalFalseNegatives: number;
  totalMigrationGaps: number;
  avgValidationTimeMs: number;
  batchesAnalyzed: number;
} {
  if (batches.length === 0) {
    return {
      totalEntries: 0,
      totalInvalidated: 0,
      overallInvalidationRate: 0,
      totalFalsePositives: 0,
      totalFalseNegatives: 0,
      totalMigrationGaps: 0,
      avgValidationTimeMs: 0,
      batchesAnalyzed: 0,
    };
  }

  const totalEntries = batches.reduce((sum, b) => sum + b.totalEntries, 0);
  const totalInvalidated = batches.reduce(
    (sum, b) => sum + b.wouldBeInvalidated,
    0
  );

  return {
    totalEntries,
    totalInvalidated,
    overallInvalidationRate:
      totalEntries > 0 ? totalInvalidated / totalEntries : 0,
    totalFalsePositives: batches.reduce((sum, b) => sum + b.falsePositives, 0),
    totalFalseNegatives: batches.reduce((sum, b) => sum + b.falseNegatives, 0),
    totalMigrationGaps: batches.reduce((sum, b) => sum + b.migrationGaps, 0),
    avgValidationTimeMs:
      batches.reduce((sum, b) => sum + b.avgValidationTimeMs, 0) /
      batches.length,
    batchesAnalyzed: batches.length,
  };
}
