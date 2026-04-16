# Plan: Qora Transaction Detail View

**Version**: 1.0  
**Date**: 2026-04-04  
**Status**: DRAFT  
**Chain**: Qora Operational Realization  
**Risk Grade**: L1 (read-only API additions + UI modal)

---

## Problem Statement

The Qora UI shows aggregate ledger counts but no way to inspect individual Moltbook transactions. Users cannot click into a specific entry to see its full payload, hash chain, provenance, or type details.

## Design Decisions

1. **Detail view**: Modal overlay (centered, dismiss to return)
2. **Data fetch**: Separate `/api/qora/entry/:seq` endpoint (scales better than embedding in status)
3. **Entry listing**: Paginated `/api/qora/entries?page=1&limit=20` endpoint (clean separation from status)

---

## Phase 1: API Endpoints

### Affected Files

- `/api/qora/entries` — NEW: Paginated entry list
- `/api/qora/entry/:seq` — NEW: Single entry detail by sequence number

### Changes

**`/api/qora/entries`** (route_type: api, path: `/api/qora/entries`)

Reads `ledger.jsonl`, returns paginated results:

```typescript
// Query params: ?page=1&limit=20
// Response:
{
  entries: Array<{
    seq: number;
    timestamp: string;
    type: string;
    hash: string;
    prevHash: string;
    summary: string; // first 120 chars of JSON.stringify(payload)
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

Entries returned in reverse chronological order (newest first). The `summary` field is a truncated payload preview for the list view.

**`/api/qora/entry/:seq`** (route_type: api, path: `/api/qora/entry/:seq`)

Reads `ledger.jsonl`, finds entry by `seq` field, returns full detail:

```typescript
// Response:
{
  entry: {
    seq: number;
    timestamp: string;
    type: string;
    hash: string;
    prevHash: string;
    payload: object;      // full payload
    provenance: object;   // full provenance
  };
  chain: {
    prev: { seq: number; type: string; timestamp: string } | null;
    next: { seq: number; type: string; timestamp: string } | null;
  };
}
```

The `chain` field provides prev/next navigation links within the modal.

### Unit Tests

- `curl /api/qora/entries` returns HTTP 200 with `entries` array and `pagination` object
- `curl /api/qora/entries?page=1&limit=5` returns at most 5 entries
- `curl /api/qora/entry/1` returns HTTP 200 with full entry including `payload` and `provenance`
- `curl /api/qora/entry/99999` returns HTTP 404
- Entries are reverse-chronological (newest first)

---

## Phase 2: Qora Page — Entry List + Modal

### Affected Files

- `/qor/qora` — Add Moltbook Ledger section with entry list table and modal overlay

### Changes

**Entry list section** (below existing content, above the 2-column grid):

- New "Moltbook Ledger" section with a table/list of entries
- Columns: Seq, Type (color-coded pill), Timestamp (relative), Summary (truncated payload)
- Each row is clickable
- Pagination controls at bottom: Prev / Page X of Y / Next
- Fetches from `/api/qora/entries?page=N&limit=20`

**Modal overlay** (on entry click):

- Centered modal with dark backdrop (click backdrop to dismiss, ESC to dismiss)
- Header: `#{seq} — {type}` with timestamp
- Body sections:
  - **Payload** — formatted JSON (pre block with syntax highlighting via monospace)
  - **Provenance** — source, tier, autonomyLevel
  - **Chain** — hash, prevHash, with visual chain indicator
- Footer: Prev / Next navigation buttons (using `chain.prev` / `chain.next` from detail endpoint)
- Clicking Prev/Next fetches `/api/qora/entry/:seq` for the adjacent entry without closing the modal

**Type color mapping**:

```typescript
const TYPE_COLORS: Record<string, string> = {
  HEARTBEAT: "#34d399",
  OBSERVATION: "#60a5fa",
  DECISION: "#f59e0b",
  VETO: "#fb7185",
  MEMORY: "#c084fc",
};
```

### Unit Tests

- Entry list renders with correct column headers
- Clicking an entry row opens the modal
- Modal displays full payload JSON
- Prev/Next buttons navigate between entries
- ESC key dismisses the modal
- Empty state shows "No ledger entries yet" message

---

## Phase 3: Filesystem Tests

### Affected Files

- `qora/tests/ledger-api.test.ts` — NEW: API endpoint tests

### Changes

Bun test file that:
1. Reads `ledger.jsonl` directly
2. Validates entry shape (seq, timestamp, type, hash, prevHash, payload, provenance)
3. Validates chain integrity (each entry's prevHash matches previous entry's hash)
4. Validates pagination math (total entries / limit = expected pages)

### Unit Tests

- All entries have required fields (seq, timestamp, type, hash, prevHash, payload)
- Chain integrity: entry[i].prevHash === entry[i-1].hash for all i > 0
- Entry seq values are monotonically increasing
- Pagination: ceil(total / limit) === totalPages
