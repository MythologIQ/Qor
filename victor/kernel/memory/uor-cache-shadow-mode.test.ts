/**
 * UOR Cache Shadow Mode Tests
 *
 * Comprehensive test suite for shadow-mode cache validation.
 * Validates telemetry collection, false positive/negative detection,
 * migration gap identification, and audit trail generation.
 */

import { describe, it, expect } from "bun:test";
import {
  ShadowModeConfig,
  DEFAULT_SHADOW_CONFIG,
  ShadowEntryTelemetry,
  ShadowBatchTelemetry,
  ValidationDiscrepancy,
  ShadowModeAuditEvent,
  validateCacheEntryShadow,
  compareShadowVsLive,
  runShadowBatchValidation,
  assessMigrationReadiness,
  formatShadowTelemetry,
  inspectShadowMode,
  exportTelemetryToJSONL,
  aggregateShadowTelemetry,
} from "./uor-cache-shadow-mode";
import {
  CacheEntryRecord,
  CacheDependencyRef,
  FingerprintLookup,
} from "./types";
import { UORFingerprint } from "./uor-cache-validation";

// Test fixtures - Create mock fingerprint lookup
const createMockFingerprintLookup = (
  fingerprints: Map<string, UORFingerprint>
): FingerprintLookup => {
  return {
    getDocumentFingerprint: (id: string) => fingerprints.get(`document:${id}`),
    getChunkFingerprint: (id: string) => fingerprints.get(`chunk:${id}`),
    getNodeFingerprint: (id: string) => fingerprints.get(`semantic-node:${id}`),
  };
};

const createTestCacheEntry = (
  id: string,
  deps: Array<{ kind: CacheDependencyRef["kind"]; id: string; fingerprint?: string }>,
  status: "fresh" | "stale" = "fresh"
): CacheEntryRecord => ({
  id,
  cacheType: "retrieval-bundle",
  summary: "test summary",
  status,
  dependencyRefs: deps.map((d) => ({
    kind: d.kind,
    id: d.id,
    ...(d.fingerprint ? { uorFingerprint: d.fingerprint } : {}),
  })),
  updatedAt: Date.now(),
});

const TEST_FINGERPRINTS = new Map([
  ["document:doc-valid", "sha256:abc123valid"],
  ["document:doc-stale", "sha256:abc123stale"],
  ["chunk:chunk-valid", "sha256:chunkvalid123"],
  ["semantic-node:node-valid", "sha256:nodevalid456"],
]);

describe("UOR Cache Shadow Mode", () => {
  describe("Configuration", () => {
    it("should export correct default configuration", () => {
      expect(DEFAULT_SHADOW_CONFIG.enabled).toBe(true);
      expect(DEFAULT_SHADOW_CONFIG.sampleRate).toBe(1.0);
      expect(DEFAULT_SHADOW_CONFIG.maxBatchSize).toBe(100);
      expect(DEFAULT_SHADOW_CONFIG.auditTelemetry).toBe(true);
      expect(DEFAULT_SHADOW_CONFIG.compareWithLive).toBe(true);
    });

    it("should allow partial configuration override", () => {
      const config: Partial<ShadowModeConfig> = { sampleRate: 0.5 };
      expect({ ...DEFAULT_SHADOW_CONFIG, ...config }).toEqual({
        enabled: true,
        sampleRate: 0.5,
        maxBatchSize: 100,
        auditTelemetry: true,
        compareWithLive: true,
      });
    });
  });

  describe("validateCacheEntryShadow", () => {
    it("should validate valid entry in shadow mode", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-1", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
      ]);

      const telemetry = validateCacheEntryShadow(entry, lookup);

      expect(telemetry.entryId).toBe("entry-1");
      expect(telemetry.shadowResult.valid).toBe(true);
      expect(telemetry.validatedAt).toBeDefined();
      expect(telemetry.dependencyResults).toHaveLength(1);
      expect(telemetry.dependencyResults[0].valid).toBe(true);
      expect(telemetry.dependencyResults[0].hadUORFingerprint).toBe(true);
      expect(telemetry.dependencyResults[0].isMigrationGap).toBe(false);
    });

    it("should detect invalid entry in shadow mode", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-2", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:different" },
      ]);

      const telemetry = validateCacheEntryShadow(entry, lookup);

      expect(telemetry.shadowResult.valid).toBe(false);
      expect(telemetry.dependencyResults[0].valid).toBe(false);
      expect(telemetry.dependencyResults[0].hadUORFingerprint).toBe(true);
    });

    it("should detect missing fingerprint in shadow mode", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-3", [
        { kind: "document", id: "doc-nonexistent", fingerprint: "sha256:anything" },
      ]);

      const telemetry = validateCacheEntryShadow(entry, lookup);

      expect(telemetry.shadowResult.valid).toBe(false);
      expect(telemetry.dependencyResults[0].valid).toBe(false);
    });

    it("should identify migration gaps (legacy deps with available fingerprints)", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-4", [
        { kind: "document", id: "doc-valid" }, // No fingerprint, but one is available
      ]);

      const telemetry = validateCacheEntryShadow(entry, lookup);

      expect(telemetry.dependencyResults[0].hadUORFingerprint).toBe(false);
      expect(telemetry.dependencyResults[0].isMigrationGap).toBe(true);
    });

    it("should handle multiple dependencies with mixed validity", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-5", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        { kind: "document", id: "doc-stale", fingerprint: "sha256:old" },
        { kind: "chunk", id: "chunk-valid", fingerprint: "sha256:chunkvalid123" },
      ]);

      const telemetry = validateCacheEntryShadow(entry, lookup);

      expect(telemetry.dependencyResults).toHaveLength(3);
      expect(telemetry.dependencyResults[0].valid).toBe(true);
      expect(telemetry.dependencyResults[1].valid).toBe(false); // Stale
      expect(telemetry.dependencyResults[2].valid).toBe(true);
      expect(telemetry.shadowResult.valid).toBe(false); // Any invalid = entry invalid
    });

    it("should respect custom configuration", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-6", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
      ]);

      const config: Partial<ShadowModeConfig> = { auditTelemetry: false };
      const telemetry = validateCacheEntryShadow(entry, lookup, config);

      expect(telemetry.shadowResult.valid).toBe(true);
    });
  });

  describe("compareShadowVsLive", () => {
    it("should detect false positive (shadow invalid, live valid)", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-fp", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
      ]);

      const shadowTelemetry = validateCacheEntryShadow(entry, lookup);
      // Force shadow to be invalid
      shadowTelemetry.shadowResult.valid = false;
      shadowTelemetry.shadowResult.action = "invalidate";

      const liveResult = {
        cacheEntryId: entry.id,
        valid: true,
        dependencyResults: [],
        staleDependencyCount: 0,
        missingDependencyCount: 0,
        validatedAt: Date.now(),
        action: "use" as const,
        governance: {
          state: "durable" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          auditTrail: [],
        },
      };

      const discrepancies = compareShadowVsLive(shadowTelemetry, liveResult, entry);

      const fpDiscrepancy = discrepancies.find(d => d.type === "false-positive");
      expect(fpDiscrepancy).toBeDefined();
      expect(fpDiscrepancy?.severity).toBe("warning");
    });

    it("should detect false negative (shadow valid, live invalid)", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-fn", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
      ]);

      const shadowTelemetry = validateCacheEntryShadow(entry, lookup);
      shadowTelemetry.shadowResult.valid = true;
      shadowTelemetry.shadowResult.action = "use";

      const liveResult = {
        cacheEntryId: entry.id,
        valid: false,
        dependencyResults: [],
        staleDependencyCount: 1,
        missingDependencyCount: 0,
        validatedAt: Date.now(),
        action: "invalidate" as const,
        governance: {
          state: "deprecated" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          auditTrail: [],
        },
      };

      const discrepancies = compareShadowVsLive(shadowTelemetry, liveResult, entry);

      const fnDiscrepancy = discrepancies.find(d => d.type === "false-negative");
      expect(fnDiscrepancy).toBeDefined();
      expect(fnDiscrepancy?.severity).toBe("critical");
    });

    it("should detect migration gaps", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-mg", [
        { kind: "document", id: "doc-valid" }, // No fingerprint
      ]);

      const shadowTelemetry = validateCacheEntryShadow(entry, lookup);
      const liveResult = {
        cacheEntryId: entry.id,
        valid: false,
        dependencyResults: [],
        staleDependencyCount: 0,
        missingDependencyCount: 1,
        validatedAt: Date.now(),
        action: "invalidate" as const,
        governance: {
          state: "deprecated" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          auditTrail: [],
        },
      };

      const discrepancies = compareShadowVsLive(shadowTelemetry, liveResult, entry);

      const mgDiscrepancy = discrepancies.find(d => d.type === "migration-gap-detected");
      expect(mgDiscrepancy).toBeDefined();
      expect(mgDiscrepancy?.severity).toBe("info");
    });

    it("should return only migration gaps when shadow and live agree", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entry = createTestCacheEntry("entry-ok", [
        { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
      ]);

      const shadowTelemetry = validateCacheEntryShadow(entry, lookup);
      const liveResult = {
        cacheEntryId: entry.id,
        valid: true,
        dependencyResults: [],
        staleDependencyCount: 0,
        missingDependencyCount: 0,
        validatedAt: Date.now(),
        action: "use" as const,
        governance: {
          state: "durable" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          auditTrail: [],
        },
      };

      const discrepancies = compareShadowVsLive(shadowTelemetry, liveResult, entry);

      // No false positives/negatives when both agree
      expect(discrepancies.filter(d => d.type === "false-positive" || d.type === "false-negative")).toHaveLength(0);
    });
  });

  describe("runShadowBatchValidation", () => {
    it("should process batch of entries", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entries = [
        createTestCacheEntry("batch-1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
        createTestCacheEntry("batch-2", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
      ];

      const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

      expect(result.entries).toHaveLength(2);
      expect(result.telemetry.totalEntries).toBe(2);
      expect(result.telemetry.wouldBeInvalidated).toBe(0);
      expect(result.telemetry.invalidationRate).toBe(0);
      expect(result.telemetry.batchId).toBeDefined();
      expect(result.auditEvents.length).toBeGreaterThan(0);
    });

    it("should calculate invalidation rate correctly", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entries = [
        createTestCacheEntry("valid-1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
        createTestCacheEntry("invalid-1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:wrong" },
        ]),
        createTestCacheEntry("invalid-2", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:wrong2" },
        ]),
      ];

      const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

      expect(result.telemetry.totalEntries).toBe(3);
      expect(result.telemetry.wouldBeInvalidated).toBe(2);
      expect(result.telemetry.invalidationRate).toBeCloseTo(0.667, 1);
    });

    it("should apply sampling rate", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entries = Array.from({ length: 10 }, (_, i) =>
        createTestCacheEntry(`sample-${i}`, [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ])
      );

      const result = runShadowBatchValidation(entries, lookup, {
        sampleRate: 0.5,
        compareWithLive: false,
      });

      expect(result.telemetry.totalEntries).toBe(5); // 50% of 10
    });

    it("should compare with live when enabled", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entries = [
        createTestCacheEntry("compare-1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
      ];

      const result = runShadowBatchValidation(entries, lookup, { compareWithLive: true });

      expect(result.telemetry.actuallyInvalidated).toBeDefined();
      expect(result.telemetry.falsePositives).toBe(0);
      expect(result.telemetry.falseNegatives).toBe(0);
    });

    it("should track migration gaps across batch", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entries = [
        createTestCacheEntry("gap-1", [
          { kind: "document", id: "doc-valid" }, // Migration gap
        ]),
        createTestCacheEntry("gap-2", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
      ];

      const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

      expect(result.telemetry.totalDependencies).toBe(2);
      expect(result.telemetry.legacyDependencies).toBe(1);
      expect(result.telemetry.migrationGaps).toBe(1);
    });

    it("should measure validation performance", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const entries = Array.from({ length: 5 }, (_, i) =>
        createTestCacheEntry(`perf-${i}`, [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ])
      );

      const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

      expect(result.telemetry.avgValidationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.telemetry.avgValidationTimeMs).toBeLessThan(1000); // Should be fast
    });
  });

  describe("assessMigrationReadiness", () => {
    it("should indicate ready when metrics are within thresholds", () => {
      const telemetry: ShadowBatchTelemetry[] = [
        {
          batchId: "test-1",
          validatedAt: new Date().toISOString(),
          totalEntries: 100,
          wouldBeInvalidated: 5,
          invalidationRate: 0.05,
          falsePositives: 2,
          falseNegatives: 0,
          migrationGaps: 5,
          totalDependencies: 100,
          uorFingerprintsPresent: 95,
          legacyDependencies: 5,
          avgValidationTimeMs: 10,
        },
      ];

      const assessment = assessMigrationReadiness(telemetry);

      expect(assessment.ready).toBe(true);
      expect(assessment.reasons).toHaveLength(0);
      expect(assessment.metrics.totalSamples).toBe(100);
    });

    it("should reject when false positive rate too high", () => {
      const telemetry: ShadowBatchTelemetry[] = [
        {
          batchId: "test-2",
          validatedAt: new Date().toISOString(),
          totalEntries: 100,
          wouldBeInvalidated: 10,
          invalidationRate: 0.10,
          falsePositives: 10,
          falseNegatives: 0,
          migrationGaps: 5,
          totalDependencies: 100,
          uorFingerprintsPresent: 95,
          legacyDependencies: 5,
          avgValidationTimeMs: 10,
        },
      ];

      const assessment = assessMigrationReadiness(telemetry);

      expect(assessment.ready).toBe(false);
      expect(assessment.reasons.some(r => r.includes("False positive"))).toBe(true);
      expect(assessment.metrics.avgFalsePositiveRate).toBe(0.10);
    });

    it("should reject when false negative rate too high", () => {
      const telemetry: ShadowBatchTelemetry[] = [
        {
          batchId: "test-3",
          validatedAt: new Date().toISOString(),
          totalEntries: 100,
          wouldBeInvalidated: 5,
          invalidationRate: 0.05,
          falsePositives: 0,
          falseNegatives: 5,
          migrationGaps: 5,
          totalDependencies: 100,
          uorFingerprintsPresent: 95,
          legacyDependencies: 5,
          avgValidationTimeMs: 10,
        },
      ];

      const assessment = assessMigrationReadiness(telemetry);

      expect(assessment.ready).toBe(false);
      expect(assessment.reasons.some(r => r.includes("False negative"))).toBe(true);
    });

    it("should reject when migration gap rate too high", () => {
      const telemetry: ShadowBatchTelemetry[] = [
        {
          batchId: "test-4",
          validatedAt: new Date().toISOString(),
          totalEntries: 100,
          wouldBeInvalidated: 5,
          invalidationRate: 0.05,
          falsePositives: 0,
          falseNegatives: 0,
          migrationGaps: 15,
          totalDependencies: 100,
          uorFingerprintsPresent: 85,
          legacyDependencies: 15,
          avgValidationTimeMs: 10,
        },
      ];

      const assessment = assessMigrationReadiness(telemetry);

      expect(assessment.ready).toBe(false);
      expect(assessment.reasons.some(r => r.includes("Migration gap"))).toBe(true);
    });

    it("should reject when sample size insufficient", () => {
      const telemetry: ShadowBatchTelemetry[] = [
        {
          batchId: "test-5",
          validatedAt: new Date().toISOString(),
          totalEntries: 50,
          wouldBeInvalidated: 0,
          invalidationRate: 0,
          falsePositives: 0,
          falseNegatives: 0,
          migrationGaps: 0,
          totalDependencies: 50,
          uorFingerprintsPresent: 50,
          legacyDependencies: 0,
          avgValidationTimeMs: 10,
        },
      ];

      const assessment = assessMigrationReadiness(telemetry);

      expect(assessment.ready).toBe(false);
      expect(assessment.reasons.some(r => r.includes("Insufficient"))).toBe(true);
    });

    it("should aggregate across multiple batches", () => {
      const telemetry: ShadowBatchTelemetry[] = [
        {
          batchId: "batch-1",
          validatedAt: new Date().toISOString(),
          totalEntries: 50,
          wouldBeInvalidated: 2,
          invalidationRate: 0.04,
          falsePositives: 1,
          falseNegatives: 0,
          migrationGaps: 2,
          totalDependencies: 50,
          uorFingerprintsPresent: 48,
          legacyDependencies: 2,
          avgValidationTimeMs: 10,
        },
        {
          batchId: "batch-2",
          validatedAt: new Date().toISOString(),
          totalEntries: 50,
          wouldBeInvalidated: 3,
          invalidationRate: 0.06,
          falsePositives: 1,
          falseNegatives: 0,
          migrationGaps: 3,
          totalDependencies: 50,
          uorFingerprintsPresent: 47,
          legacyDependencies: 3,
          avgValidationTimeMs: 12,
        },
      ];

      const assessment = assessMigrationReadiness(telemetry);

      expect(assessment.ready).toBe(true);
      expect(assessment.metrics.totalSamples).toBe(100);
      expect(assessment.metrics.avgFalsePositiveRate).toBe(0.02); // 2/100
      expect(assessment.metrics.avgMigrationGapRate).toBe(0.05); // 5/100
    });
  });

  describe("formatShadowTelemetry", () => {
    it("should format telemetry as human-readable string", () => {
      const telemetry: ShadowBatchTelemetry = {
        batchId: "fmt-test",
        validatedAt: "2026-03-23T00:00:00.000Z",
        totalEntries: 100,
        wouldBeInvalidated: 10,
        actuallyInvalidated: 8,
        invalidationRate: 0.10,
        falsePositives: 2,
        falseNegatives: 0,
        migrationGaps: 5,
        totalDependencies: 200,
        uorFingerprintsPresent: 180,
        legacyDependencies: 20,
        avgValidationTimeMs: 15.5,
      };

      const formatted = formatShadowTelemetry(telemetry);

      expect(formatted).toContain("Shadow Mode Batch: fmt-test");
      expect(formatted).toContain("Total processed: 100");
      expect(formatted).toContain("Would be invalidated: 10");
      expect(formatted).toContain("Actually invalidated (live): 8");
      expect(formatted).toContain("False positives: 2");
      expect(formatted).toContain("Migration gaps: 5");
      expect(formatted).toContain("Average validation time: 15.50ms per entry");
    });
  });

  describe("inspectShadowMode", () => {
    it("should report active status when enabled", () => {
      const inspection = inspectShadowMode({ enabled: true, sampleRate: 1.0 });

      expect(inspection.status).toBe("active");
      expect(inspection.config.enabled).toBe(true);
    });

    it("should report paused status when sampling 0%", () => {
      const inspection = inspectShadowMode({ enabled: true, sampleRate: 0 });

      expect(inspection.status).toBe("paused");
    });

    it("should report disabled status when disabled", () => {
      const inspection = inspectShadowMode({ enabled: false });

      expect(inspection.status).toBe("disabled");
      expect(inspection.recommendations.some(r => r.includes("disabled"))).toBe(true);
    });

    it("should recommend increasing sample rate", () => {
      const inspection = inspectShadowMode({ sampleRate: 0.5 });

      expect(inspection.recommendations.some(r => r.includes("edge cases"))).toBe(true);
    });

    it("should recommend enabling audit telemetry", () => {
      const inspection = inspectShadowMode({ auditTelemetry: false });

      expect(inspection.recommendations.some(r => r.includes("Audit telemetry"))).toBe(true);
    });

    it("should recommend enabling live comparison", () => {
      const inspection = inspectShadowMode({ compareWithLive: false });

      expect(inspection.recommendations.some(r => r.includes("Live comparison"))).toBe(true);
    });
  });

  describe("exportTelemetryToJSONL", () => {
    it("should export events as JSONL", () => {
      const events: ShadowModeAuditEvent[] = [
        {
          type: "shadow-validation",
          timestamp: "2026-03-23T00:00:00.000Z",
          batchId: "batch-1",
          config: DEFAULT_SHADOW_CONFIG,
          telemetry: { entryId: "e1" } as ShadowEntryTelemetry,
        },
        {
          type: "shadow-batch-summary",
          timestamp: "2026-03-23T00:00:01.000Z",
          batchId: "batch-1",
          config: DEFAULT_SHADOW_CONFIG,
          telemetry: { totalEntries: 100 } as ShadowBatchTelemetry,
        },
      ];

      const jsonl = exportTelemetryToJSONL(events);
      const lines = jsonl.split("\n");

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).type).toBe("shadow-validation");
      expect(JSON.parse(lines[1]).type).toBe("shadow-batch-summary");
    });
  });

  describe("aggregateShadowTelemetry", () => {
    it("should aggregate multiple batches", () => {
      const batches: ShadowBatchTelemetry[] = [
        {
          batchId: "a",
          validatedAt: "2026-03-23T00:00:00.000Z",
          totalEntries: 100,
          wouldBeInvalidated: 10,
          invalidationRate: 0.10,
          falsePositives: 2,
          falseNegatives: 1,
          migrationGaps: 5,
          totalDependencies: 200,
          uorFingerprintsPresent: 180,
          legacyDependencies: 20,
          avgValidationTimeMs: 10,
        },
        {
          batchId: "b",
          validatedAt: "2026-03-23T00:00:01.000Z",
          totalEntries: 200,
          wouldBeInvalidated: 20,
          invalidationRate: 0.10,
          falsePositives: 4,
          falseNegatives: 2,
          migrationGaps: 10,
          totalDependencies: 400,
          uorFingerprintsPresent: 360,
          legacyDependencies: 40,
          avgValidationTimeMs: 12,
        },
      ];

      const aggregated = aggregateShadowTelemetry(batches);

      expect(aggregated.totalEntries).toBe(300);
      expect(aggregated.totalInvalidated).toBe(30);
      expect(aggregated.overallInvalidationRate).toBe(0.10);
      expect(aggregated.totalFalsePositives).toBe(6);
      expect(aggregated.totalFalseNegatives).toBe(3);
      expect(aggregated.totalMigrationGaps).toBe(15);
      expect(aggregated.batchesAnalyzed).toBe(2);
    });

    it("should handle empty batch array", () => {
      const aggregated = aggregateShadowTelemetry([]);

      expect(aggregated.totalEntries).toBe(0);
      expect(aggregated.batchesAnalyzed).toBe(0);
    });
  });

  describe("Acceptance Criteria", () => {
    describe("AC1: Shadow-mode validation produces measurable invalidation telemetry", () => {
      it("should produce entry-level telemetry", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entry = createTestCacheEntry("ac1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]);

        const telemetry = validateCacheEntryShadow(entry, lookup);

        expect(telemetry.entryId).toBe("ac1");
        expect(telemetry.shadowResult).toBeDefined();
        expect(telemetry.dependencyResults).toBeDefined();
        expect(telemetry.validatedAt).toBeDefined();
      });

      it("should produce batch-level telemetry with invalidation rate", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac1-1", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
          ]),
          createTestCacheEntry("ac1-2", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:wrong" },
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

        expect(result.telemetry.totalEntries).toBe(2);
        expect(result.telemetry.wouldBeInvalidated).toBe(1);
        expect(result.telemetry.invalidationRate).toBe(0.5);
        expect(result.telemetry.invalidationRate).toBeDefined();
      });

      it("should track dependencies with and without fingerprints", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac1-3", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
            { kind: "document", id: "doc-valid" }, // No fingerprint
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

        expect(result.telemetry.totalDependencies).toBe(2);
        expect(result.telemetry.uorFingerprintsPresent).toBe(1);
        expect(result.telemetry.legacyDependencies).toBe(1);
      });
    });

    describe("AC2: False positives and migration gaps surfaced before fail-closed", () => {
      it("should detect false positives in comparison mode", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entry = createTestCacheEntry("ac2-1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]);

        const shadow = validateCacheEntryShadow(entry, lookup);
        shadow.shadowResult.valid = false;
        shadow.shadowResult.action = "invalidate";

        const live = {
          cacheEntryId: entry.id,
          valid: true,
          dependencyResults: [],
          staleDependencyCount: 0,
          missingDependencyCount: 0,
          validatedAt: Date.now(),
          action: "use" as const,
          governance: {
            state: "durable" as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            auditTrail: [],
          },
        };

        const discrepancies = compareShadowVsLive(shadow, live, entry);
        const fp = discrepancies.find(d => d.type === "false-positive");

        expect(fp).toBeDefined();
        expect(fp?.severity).toBe("warning");
      });

      it("should detect migration gaps", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac2-2", [
            { kind: "document", id: "doc-valid" }, // Available but not used
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

        expect(result.telemetry.migrationGaps).toBeGreaterThan(0);
      });

      it("should surface migration gaps in discrepancies", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entry = createTestCacheEntry("ac2-3", [
          { kind: "document", id: "doc-valid" },
        ]);

        const shadow = validateCacheEntryShadow(entry, lookup);
        const live = {
          cacheEntryId: entry.id,
          valid: false,
          dependencyResults: [],
          staleDependencyCount: 0,
          missingDependencyCount: 1,
          validatedAt: Date.now(),
          action: "invalidate" as const,
          governance: {
            state: "deprecated" as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            auditTrail: [],
          },
        };

        const discrepancies = compareShadowVsLive(shadow, live, entry);
        const gap = discrepancies.find(d => d.type === "migration-gap-detected");

        expect(gap).toBeDefined();
        expect(gap?.affectedDependency).toBeDefined();
      });
    });

    describe("AC3: Shadow-mode results written to reviewable audit trail", () => {
      it("should generate audit events when telemetry enabled", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac3-1", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, {
          auditTelemetry: true,
          compareWithLive: false,
        });

        expect(result.auditEvents.length).toBeGreaterThan(0);
        expect(result.auditEvents.some(e => e.type === "shadow-validation")).toBe(true);
        expect(result.auditEvents.some(e => e.type === "shadow-batch-summary")).toBe(true);
      });

      it("should include batch summary in audit trail", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac3-2", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });
        const summary = result.auditEvents.find(e => e.type === "shadow-batch-summary");

        expect(summary).toBeDefined();
        expect(summary?.batchId).toBe(result.telemetry.batchId);
        expect(summary?.timestamp).toBeDefined();
      });

      it("should export audit events as JSONL", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac3-3", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });
        const jsonl = exportTelemetryToJSONL(result.auditEvents);

        expect(jsonl).toBeTruthy();
        const parsed = jsonl.split("\n").filter(l => l).map(l => JSON.parse(l));
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed[0]).toHaveProperty("type");
        expect(parsed[0]).toHaveProperty("timestamp");
        expect(parsed[0]).toHaveProperty("batchId");
      });

      it("should include configuration in audit events", () => {
        const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
        const entries = [
          createTestCacheEntry("ac3-4", [
            { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
          ]),
        ];

        const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });
        const event = result.auditEvents[0];

        expect(event.config).toBeDefined();
        expect(event.config.enabled).toBe(true);
      });
    });
  });

  describe("Integration Tests", () => {
    it("should run end-to-end shadow validation workflow", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);

      // Create a mixed set of cache entries
      const entries = [
        // Valid entries
        createTestCacheEntry("int-1", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
        createTestCacheEntry("int-2", [
          { kind: "chunk", id: "chunk-valid", fingerprint: "sha256:chunkvalid123" },
        ]),
        // Invalid entries (stale)
        createTestCacheEntry("int-3", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:outdated" },
        ]),
        // Migration gaps
        createTestCacheEntry("int-4", [
          { kind: "document", id: "doc-valid" }, // No fingerprint available
        ]),
      ];

      // Run shadow validation
      const result = runShadowBatchValidation(entries, lookup, {
        sampleRate: 1.0,
        auditTelemetry: true,
        compareWithLive: false,
      });

      // Verify telemetry
      expect(result.telemetry.totalEntries).toBe(4);
      expect(result.telemetry.wouldBeInvalidated).toBe(2); // int-3 (stale), int-4 (no fingerprint)
      expect(result.telemetry.invalidationRate).toBe(0.5);
      expect(result.telemetry.migrationGaps).toBe(1);

      // Verify audit trail
      expect(result.auditEvents.length).toBeGreaterThan(0);

      // Verify assessment
      const assessment = assessMigrationReadiness([result.telemetry]);
      expect(assessment.metrics.totalSamples).toBe(4);
    });

    it("should support progressive migration assessment", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);

      // Simulate multiple batches over time showing improvement
      const batches: ShadowBatchTelemetry[] = [];

      // Batch 1: High migration gap rate
      const result1 = runShadowBatchValidation([
        createTestCacheEntry("prog-1", [{ kind: "document", id: "doc-valid" }]),
        createTestCacheEntry("prog-2", [{ kind: "document", id: "doc-valid" }]),
      ], lookup, { compareWithLive: false });
      batches.push(result1.telemetry);

      // Batch 2: After migration, lower gap rate
      const result2 = runShadowBatchValidation([
        createTestCacheEntry("prog-3", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
        createTestCacheEntry("prog-4", [
          { kind: "document", id: "doc-valid", fingerprint: "sha256:abc123valid" },
        ]),
      ], lookup, { compareWithLive: false });
      batches.push(result2.telemetry);

      const aggregated = aggregateShadowTelemetry(batches);
      expect(aggregated.batchesAnalyzed).toBe(2);
      expect(aggregated.totalMigrationGaps).toBe(2); // From first batch
    });

    it("should handle empty cache gracefully", () => {
      const lookup = createMockFingerprintLookup(TEST_FINGERPRINTS);
      const result = runShadowBatchValidation([], lookup, { compareWithLive: false });

      expect(result.telemetry.totalEntries).toBe(0);
      expect(result.telemetry.invalidationRate).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it("should handle all-legacy cache entries", () => {
      const lookup = createMockFingerprintLookup(new Map()); // No fingerprints available
      const entries = [
        createTestCacheEntry("all-legacy-1", [{ kind: "document", id: "doc-1" }]),
        createTestCacheEntry("all-legacy-2", [{ kind: "document", id: "doc-2" }]),
      ];

      const result = runShadowBatchValidation(entries, lookup, { compareWithLive: false });

      expect(result.telemetry.legacyDependencies).toBe(2);
      expect(result.telemetry.migrationGaps).toBe(0); // No gaps because no fingerprints available
      expect(result.telemetry.uorFingerprintsPresent).toBe(0);
    });
  });
});
