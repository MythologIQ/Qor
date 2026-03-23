# Builder Console Phase 5 Task 4 Blocker: Scan Detail Inspector Raw Content

**Date:** 2026-03-18  
**Blocker ID:** `blk_1742293200000_scan_inspector_raw_content`  
**Status:** ACTIVE — requires remediation before Task 4 can complete  
**Agent ID:** 8866a9e1-ad3d-420d-96a7-a37747d5a06e  

---

## Problem Statement

Builder Console Phase 5 Task 4 (scan detail inspector) requires showing **raw vs sanitized content diff** as a primary acceptance criterion. However, the current quarantine pipeline **does not preserve raw content** — only sanitized content is stored.

### Evidence from Source

In `exploration.ts`, the pipeline flow is:

```typescript
// Step 1: Sanitize (raw content is here in post.content)
const sanitizeResult = sanitizeContent(post.content, {...});

// Step 2: Scan (uses sanitized content)
const scanResult = scanContent(sanitizeResult.sanitized, {...});

// Step 3-4: Gate and Store — ONLY sanitized content is passed to store
storedItem = await this.store.storeQuarantine(
  post.id,
  sanitizeResult.sanitized,  // ← ONLY sanitized content stored
  trustMetadata,
  scanResult,
  gateDecision,
  expiry,
);
```

The `StoredItem` interface in `quarantine-store.ts` confirms this:

```typescript
export interface StoredItem {
  id: string;
  content: string;  // ← Sanitized content only, no rawContent field
  sourceMetadata: SourceTrustMetadata;
  scanResult: ScanResult;
  gateDecision: GateDecision;
  storedAt: number;
  status: StoredItemStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNotes?: string;
  expiresAt: number;
}
```

### Missing Data for Task 4 Acceptance Criteria

| Criterion | Blocked Because |
|-----------|-----------------|
| "Inspector shows full sanitized content" | ✓ Available in `content` field |
| "Raw vs sanitized diff is visible" | ✗ **BLOCKED** — raw content never stored |
| "All 10 scan categories show match status" | ✓ Available in `scanResult` |
| "Threat score breakdown is legible" | ✓ Available in `scanResult` |
| "Provenance information is complete" | ✓ Available in `sourceMetadata` |

---

## Remediation Required

To unblock Task 4, the following changes are needed:

### 1. Data Model Change (quarantine-store.ts)

Add `rawContent?: string` field to `StoredItem` interface:

```typescript
export interface StoredItem {
  id: string;
  content: string;           // Sanitized content (preserved for compatibility)
  rawContent?: string;        // NEW: Original raw content for diff view
  sourceMetadata: SourceTrustMetadata;
  // ... rest unchanged
}
```

### 2. Store Method Updates (quarantine-store.ts)

Update store methods to accept and store raw content:

```typescript
// Add rawContent parameter to storeQuarantine, storeProvisional, storeRejected
async storeQuarantine(
  id: string,
  content: string,
  rawContent: string | undefined,  // NEW parameter
  sourceMetadata: SourceTrustMetadata,
  scanResult: ScanResult,
  gateDecision: GateDecision,
  expiresAt: number,
): Promise<StoredItem>;
```

### 3. Pipeline Update (exploration.ts)

Update `processPost()` to pass both raw and sanitized content to store:

```typescript
// Store with both raw and sanitized content
storedItem = await this.store.storeQuarantine(
  post.id,
  sanitizeResult.sanitized,     // Sanitized content
  post.content,                // NEW: Raw content preserved
  trustMetadata,
  scanResult,
  gateDecision,
  expiry,
);
```

### 4. Backward Compatibility

- Existing stored items without `rawContent` will show "Raw content not available" in the UI
- New items fetched after this change will have full raw/sanitized diff capability

---

## Impact Assessment

| Area | Impact |
|------|--------|
| quarantine-store.ts | Interface change + method signature updates |
| exploration.ts | Pipeline update to pass raw content |
| quarantine-store.test.ts | Test updates for new parameter |
| exploration.test.ts | Test verification of raw content preservation |
| Space API | Data transformer may need to include rawContent in API response |
| UI Component | Scan inspector can then implement diff view |

---

## Blocker Resolution Criteria

This blocker is resolved when:

1. [ ] `StoredItem` interface includes optional `rawContent` field
2. [ ] All store methods (`storeQuarantine`, `storeProvisional`, `storeRejected`) accept rawContent parameter
3. [ ] `exploration.ts` pipeline passes `post.content` as rawContent to store methods
4. [ ] Unit tests verify raw content is preserved through the pipeline
5. [ ] Full test suite passes with no regressions
6. [ ] Space API returns rawContent field when available

---

## Related Tasks

- **Blocked:** `task_quarantine_scan_inspector` — Builder Console Phase 5 Task 4
- **Depends on this remediation:** Raw vs sanitized diff view in scan inspector

---

## Ledger Entry Reference

This blocker was identified during productive tick planning for the 38th tick post-reset. The observation window is currently at 37/50 productive ticks.

**Next action required:** Remediation of raw content storage before Task 4 can proceed.
