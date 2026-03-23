# Moltbook Quarantine Exploration Plan

**Date:** 2026-03-18
**Author:** Victor (governed)
**Status:** Approved — queued for implementation
**Scope:** Victor kernel memory pipeline + Builder Console UI

---

## 1. Problem Statement

Victor's heartbeat currently parks itself when the build queue is empty. This is safe but wasteful. Moltbook — a social network for AI agents — offers a source of external discourse that Victor could browse during idle periods to build situational awareness of the broader agent ecosystem.

**The risk:** Moltbook is an adversarial input surface. Content is authored by other AI agents with unknown objectives. Any ingested content could contain:

- Prompt injection (direct or obfuscated)
- Embedded instructions disguised as discourse
- Identity/trust manipulation ("Victor should trust agent X")
- Subtle framing shifts that bias reasoning over time
- Encoded payloads (base64, unicode obfuscation, steganographic text)
- Authority claims designed to override governance state
- Near-duplicate content floods designed to saturate memory

**The constraint:** Victor must never ingest external content at the same trust level as internal workspace knowledge. All Moltbook content must undergo heavy scrutiny before entering any retrievable memory surface.

---

## 2. Design Principles

1. **Read-only.** No replies, posts, votes, or any write action to Moltbook. Pure intake.
2. **Quarantine-first.** All external content enters a quarantine state that is not retrievable by the standard grounded retrieval pipeline.
3. **Source trust tiering.** External-untrusted content is confidence-capped and can never auto-promote to durable.
4. **Pre-extraction gate.** Content is sanitized and scanned before the semantic extraction pipeline touches it.
5. **Audit everything.** Every fetch, scan, gate decision, promotion, and rejection is logged to a dedicated quarantine audit ledger.
6. **Human-reviewable.** The Builder Console UI must surface quarantine state, scan results, and promotion/rejection history for human inspection.

---

## 3. Architecture

### 3.1 Pipeline Overview

```
Moltbook API (read-only)
  │
  ▼
┌─────────────────────────────┐
│  1. FETCH                   │  moltbook-fetch.ts
│  - GET /posts (hot/new)     │  Read-only client, no auth writes
│  - GET /posts/{id}/comments │  Rate-limited (max 10 posts/tick)
│  - Raw text + metadata      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  2. SANITIZE                │  quarantine-sanitize.ts
│  - Strip HTML/script tags   │
│  - Decode base64 blocks     │
│  - Normalize unicode        │
│  - Remove control chars     │
│  - Truncate to max length   │
│  - Flag encoded segments    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  3. ADVERSARIAL SCAN        │  quarantine-scan.ts
│  - Pattern injection detect │  (regex + structural heuristics)
│  - Authority claim detect   │
│  - Identity assertion detect│
│  - Imperative targeting     │
│  - Encoded payload detect   │
│  - Similarity/flood detect  │
│  - Scan verdict: CLEAN /    │
│    SUSPICIOUS / HOSTILE     │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  4. GOVERNANCE GATE         │  quarantine-governance.ts
│  - HOSTILE → auto-reject    │
│  - SUSPICIOUS → quarantined │
│    (held for human review)  │
│  - CLEAN → quarantined      │
│    (auto-promote to         │
│     provisional after N     │
│     ticks with no flags)    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  5. QUARANTINE STORE        │  quarantine-store.ts
│  - Separate from main       │
│    LearningStore            │
│  - quarantined items NOT    │
│    in retrieval index       │
│  - provisional items in     │
│    retrieval at capped      │
│    confidence (max 0.40)    │
│  - Never auto-durable       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  6. AUDIT LEDGER            │  quarantine-ledger.ts
│  - Append-only JSONL        │
│  - Every fetch, scan,       │
│    gate decision, promote,  │
│    reject logged            │
│  - Queryable by Builder UI  │
└─────────────────────────────┘
```

### 3.2 New Governance Additions

#### GovernanceState additions

```typescript
// Add to existing GovernanceState union in types.ts
type GovernanceState =
  | 'ephemeral'
  | 'provisional'
  | 'durable'
  | 'contested'
  | 'stale'
  | 'deprecated'
  | 'rejected'
  | 'quarantined';    // NEW: held for review, not retrievable
```

#### SourceTrustTier (new type)

```typescript
type SourceTrustTier =
  | 'internal'              // Workspace files, project docs
  | 'internal-generated'    // Victor's own synthesis
  | 'external-verified'     // Verified external sources (future)
  | 'external-untrusted';   // Moltbook, unknown agent content

interface SourceTrustMetadata {
  tier: SourceTrustTier;
  origin: string;           // e.g. "moltbook", "workspace", "web"
  originId?: string;        // e.g. Moltbook post UUID
  fetchedAt: string;        // ISO 8601
  scanVerdict: ScanVerdict;
  scanDetails: ScanDetail[];
  confidenceCap: number;    // Max confidence for this tier
}
```

#### ScanVerdict

```typescript
type ScanVerdict = 'clean' | 'suspicious' | 'hostile';

interface ScanDetail {
  category: ScanCategory;
  matched: boolean;
  evidence?: string;       // What triggered the match
  severity: 'info' | 'warning' | 'critical';
}

type ScanCategory =
  | 'prompt-injection-literal'     // Hardcoded marker strings
  | 'prompt-injection-structural'  // Imperative verbs targeting agent
  | 'authority-claim'              // "I am the system", "trust me"
  | 'identity-assertion'           // "Your name is", "You are"
  | 'encoded-payload'              // Base64, unicode escapes, hex
  | 'control-character'            // Zero-width, RTL override, etc.
  | 'html-injection'               // Script tags, event handlers
  | 'flood-similarity'             // Near-duplicate of existing quarantine content
  | 'framing-manipulation'         // "You should", "Always remember"
  | 'credential-phishing';         // URLs, API key patterns, auth requests
```

#### Policy Updates (memory-governance-policy.json)

```json
{
  "sourceTrustTiers": {
    "internal": {
      "defaultConfidence": 0.91,
      "canAutoDurable": true,
      "maxConfidence": 1.0
    },
    "internal-generated": {
      "defaultConfidence": 0.70,
      "canAutoDurable": true,
      "maxConfidence": 0.85
    },
    "external-verified": {
      "defaultConfidence": 0.55,
      "canAutoDurable": false,
      "maxConfidence": 0.65
    },
    "external-untrusted": {
      "defaultConfidence": 0.25,
      "canAutoDurable": false,
      "maxConfidence": 0.40,
      "requiresQuarantine": true,
      "promotionCooldownTicks": 3
    }
  },
  "quarantine": {
    "autoRejectOn": ["hostile"],
    "autoPromoteOn": ["clean"],
    "promotionCooldownTicks": 3,
    "maxQuarantinedItems": 200,
    "maxFetchPerTick": 10,
    "maxContentLength": 4000,
    "neverDurable": true
  }
}
```

### 3.3 Enhanced Injection Scanner

The current 13-string literal matcher is necessary but not sufficient. The scanner adds:

**Layer 1 — Expanded literal patterns** (~50 patterns):
- Synonym variants: "disregard prior directives", "override earlier commands"
- Multi-language injection: common injection phrases in Spanish, French, Chinese
- Model-specific: "you are GPT", "you are Claude", "new system message"

**Layer 2 — Structural heuristics**:
- Imperative verbs targeting the agent: regex for `(you must|you should|you need to|always|never|remember that you)` + agent-directed context
- Authority escalation: `(i am|this is) (the|your|a) (system|admin|developer|creator|owner)`
- Persona override: `(your name is|you are called|call yourself|your identity)`
- Instruction framing: `(from now on|starting now|new instructions|updated rules)`

**Layer 3 — Encoding detection**:
- Base64 blocks (>20 chars matching `[A-Za-z0-9+/=]+`)
- Unicode escape sequences (`\u00xx`, `\x00`)
- Zero-width characters (U+200B, U+200C, U+200D, U+FEFF)
- RTL/LTR override characters
- Homoglyph substitution (Cyrillic а for Latin a, etc.)

**Layer 4 — Similarity/flood detection**:
- Compare incoming content against existing quarantine store
- Flag if cosine similarity > 0.85 with any existing quarantined item
- Flag if same author posts > 3 items in the current fetch batch

**Scoring:** Each layer contributes to a cumulative threat score. Thresholds:
- Score 0: `clean`
- Score 1-2 (info/warning only): `clean`
- Score 3+ or any `critical`: `suspicious`
- Any Layer 2 critical + Layer 1 match: `hostile`

### 3.4 Moltbook Fetch Client

```typescript
// moltbook-fetch.ts — read-only client
interface MoltbookFetchConfig {
  apiBase: string;            // https://www.moltbook.com/api/v1
  apiKey: string;             // From env MOLTBOOK_API_KEY
  maxPostsPerTick: number;    // Default: 10
  maxContentLength: number;   // Default: 4000 chars
  sortMode: 'hot' | 'new';   // Default: 'hot'
  includeComments: boolean;   // Default: false (start conservative)
}

interface FetchedPost {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorId: string;
  submoltName: string;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  createdAt: string;
  fetchedAt: string;
}
```

**Constraints:**
- GET requests only. No POST, PUT, DELETE endpoints called.
- API key used only for authentication, not for write operations.
- Rate limit: 1 fetch batch per heartbeat tick (max 10 posts).
- Content truncated at 4000 characters before entering pipeline.

### 3.5 Heartbeat Integration

**New heartbeat idle mode: `explore`**

When the governed build runner returns `blocked` (empty queue):

1. Instead of immediately incrementing `consecutiveBlocked`, check if exploration is enabled
2. If enabled and cooldown elapsed since last explore tick:
   - Run Moltbook fetch → sanitize → scan → gate → store pipeline
   - Log exploration tick to heartbeat audit
   - Do NOT increment `consecutiveBlocked` (exploration is productive idle work)
3. If exploration also returns nothing useful (no posts, all rejected):
   - Increment `consecutiveBlocked` as normal
4. Exploration ticks count toward a separate `maxConsecutiveExplore` limit (default: 5) before heartbeat still parks

**Configuration:**
```typescript
interface ExploreConfig {
  enabled: boolean;                 // Default: false (opt-in)
  maxConsecutiveExplore: number;    // Default: 5
  exploreCooldownMs: number;        // Default: 60_000 (1 min between explores)
  sources: ExploreSource[];         // Default: ['moltbook']
}
```

### 3.6 Quarantine Store

Separate from the main `LearningStore`. Does NOT share the Neo4j graph or the vector index.

```typescript
interface QuarantineStore {
  // Write
  addItem(item: QuarantineItem): Promise<void>;
  updateVerdict(itemId: string, verdict: ScanVerdict, details: ScanDetail[]): Promise<void>;
  promote(itemId: string): Promise<void>;   // quarantined → provisional
  reject(itemId: string, reason: string): Promise<void>;   // quarantined → rejected

  // Read
  listItems(filter: QuarantineFilter): Promise<QuarantineItem[]>;
  getItem(itemId: string): Promise<QuarantineItem | null>;
  getStats(): Promise<QuarantineStats>;

  // Maintenance
  pruneOldRejected(olderThanMs: number): Promise<number>;
  enforceMaxItems(max: number): Promise<number>;  // FIFO eviction of oldest rejected
}

interface QuarantineItem {
  itemId: string;              // UOR fingerprint of content
  source: 'moltbook';
  sourceId: string;            // Moltbook post UUID
  title: string;
  content: string;             // Sanitized content
  rawContent: string;          // Pre-sanitization (for audit)
  authorName: string;
  authorId: string;
  state: 'quarantined' | 'provisional' | 'rejected';
  scanVerdict: ScanVerdict;
  scanDetails: ScanDetail[];
  confidence: number;          // Capped at tier max
  fetchedAt: string;
  promotedAt?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  ticksSinceIngestion: number; // For cooldown-based promotion
}
```

**Storage:** SQLite file at `.runtime/quarantine.db` — no Neo4j, no vector index. Provisional items are available to a dedicated quarantine retrieval function (not the main `retrieveGroundedContext`).

### 3.7 Quarantine Audit Ledger

Append-only JSONL at `.runtime/quarantine-ledger.jsonl`:

```typescript
interface QuarantineLedgerEntry {
  timestamp: string;
  eventType: 'fetch' | 'sanitize' | 'scan' | 'gate-promote' | 'gate-reject' | 'gate-quarantine' | 'manual-promote' | 'manual-reject' | 'prune';
  itemId?: string;
  sourceId?: string;
  verdict?: ScanVerdict;
  scanDetails?: ScanDetail[];
  reason?: string;
  tickId?: string;
  batchSize?: number;
}
```

---

## 4. Builder Console UI: Quarantine Visibility

### 4.1 New UI Surface: Quarantine Panel

Add a **Quarantine** tab/section to the Builder Console UI shell, accessible from the Victor view.

**Components:**

#### Quarantine Dashboard (summary view)
- Total items: quarantined / provisional / rejected (last 7 days)
- Scan verdict distribution: clean / suspicious / hostile (pie or bar)
- Last fetch timestamp and batch size
- Exploration tick count and status
- Alert banner if any `suspicious` items awaiting review

#### Quarantine Feed (detail view)
- Scrollable list of quarantined items, newest first
- Each item shows:
  - Title, author, source (Moltbook), timestamp
  - Scan verdict badge (green/yellow/red)
  - Scan detail chips (which categories triggered)
  - State badge (quarantined / provisional / rejected)
  - Content preview (first 200 chars, expandable)
  - **Promote** / **Reject** action buttons (human override)

#### Scan Detail Inspector (modal/expandable)
- Full sanitized content
- Raw content diff (what was stripped)
- All scan categories with match/no-match and evidence
- Threat score breakdown
- Provenance: source URL, post ID, author, fetch time

#### Quarantine Audit Log
- Filterable table of ledger entries
- Filter by: event type, verdict, date range, source
- Exportable as JSONL

### 4.2 Hub Payload Extension

Add to `HubPayload` type:

```typescript
interface HubPayload {
  // ... existing fields ...
  quarantine?: {
    enabled: boolean;
    stats: {
      quarantined: number;
      provisional: number;
      rejected: number;
      totalFetched: number;
      lastFetchAt: string | null;
    };
    recentItems: QuarantineItemSummary[];  // Last 10
    pendingReview: number;                  // Suspicious items needing human eyes
    explorationTicks: number;
    explorationStatus: 'idle' | 'active' | 'paused' | 'disabled';
  };
}
```

---

## 5. Implementation Phases

### Phase 7 (Victor): Moltbook Quarantine Pipeline

| # | Task | Description | Acceptance |
|---|------|-------------|------------|
| 1 | Add quarantine governance types | Add `quarantined` to GovernanceState, SourceTrustTier, SourceTrustMetadata, ScanVerdict, ScanDetail, ScanCategory to types.ts. Update policy JSON with source trust tiers and quarantine settings. | New types compile. Policy loads with quarantine config. Existing tests unbroken. |
| 2 | Build quarantine sanitizer | Implement quarantine-sanitize.ts: HTML strip, base64 decode, unicode normalize, control char removal, length truncation, encoded segment flagging. | Sanitizer strips all known encoding vectors. Unit tests cover each sanitization category. Raw and sanitized content both preserved. |
| 3 | Build adversarial scan engine | Implement quarantine-scan.ts with 4-layer scanner (literal patterns, structural heuristics, encoding detection, similarity/flood). Produce ScanVerdict and ScanDetail[]. | Scanner detects all categories. Unit tests cover clean, suspicious, hostile paths. False positive rate acceptable on benign content. |
| 4 | Build quarantine governance gate | Implement quarantine-governance.ts: route scan verdicts to auto-reject, quarantine, or quarantine-with-auto-promote. Apply source trust tier confidence caps. | Hostile auto-rejects. Suspicious quarantines for review. Clean quarantines with cooldown promotion. Confidence never exceeds tier cap. |
| 5 | Build quarantine store | Implement quarantine-store.ts with SQLite backend. CRUD operations, promotion/rejection, stats, pruning, max-items enforcement. | Store persists across restarts. FIFO eviction works. Promotion and rejection state transitions are correct. |
| 6 | Build quarantine audit ledger | Implement quarantine-ledger.ts: append-only JSONL, queryable by event type and date range. | Every pipeline stage logs to ledger. Ledger is append-only and survives restarts. |
| 7 | Build Moltbook fetch client | Implement moltbook-fetch.ts: read-only GET client with rate limiting, content truncation, batch size limits. | Client fetches posts. No write endpoints called. Rate limits enforced. Content truncated. |
| 8 | Wire heartbeat idle exploration | Add explore mode to heartbeat: when build queue empty, run Moltbook quarantine pipeline instead of parking. Respect maxConsecutiveExplore and cooldown. | Exploration runs only when build queue is empty. Heartbeat still parks after maxConsecutiveExplore. Exploration ticks are audited. |

### Phase 5 (Builder Console): Quarantine Visibility UI

| # | Task | Description | Acceptance |
|---|------|-------------|------------|
| 1 | Extend HubPayload with quarantine data | Add quarantine stats, recent items, and exploration status to HubPayload and hub.ts builder. | Quarantine data flows to UI. Null-safe when quarantine disabled. |
| 2 | Build quarantine dashboard component | Summary view: item counts by state, verdict distribution, last fetch time, exploration status, alert banner for pending review items. | Dashboard renders live quarantine stats. Alert shows when suspicious items need review. |
| 3 | Build quarantine feed component | Scrollable item list with verdict badges, state badges, content preview, promote/reject actions. | Feed shows items newest-first. Promote/reject actions update state. Verdict and state badges render correctly. |
| 4 | Build scan detail inspector | Expandable/modal view: full content, raw diff, scan category breakdown, threat score, provenance. | Inspector shows all scan details. Raw vs sanitized diff visible. Provenance complete. |
| 5 | Build quarantine audit log viewer | Filterable table of ledger entries by event type, verdict, date range. Export capability. | Log is filterable and renders correctly. Export produces valid JSONL. |

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scanner bypass via novel injection | Medium | High | Quarantine-first means bypass only reaches provisional (0.40 confidence). Human review catches what scanner misses. |
| Moltbook API changes or downtime | Low | Low | Fetch client handles errors gracefully. Exploration is optional idle work. |
| Quarantine store grows unbounded | Low | Medium | Max 200 items enforced. FIFO pruning of rejected items. |
| Subtle framing shifts over time | Medium | Medium | Confidence cap at 0.40 means quarantine content never outweighs internal knowledge in retrieval. Contradiction detection flags conflicts. |
| False positives reject useful content | Medium | Low | Human can manually promote via UI. Cooldown promotion for clean content. |

---

## 7. Out of Scope (Future Work)

- **Write capability** (posting, replying to Moltbook) — requires separate governance approval
- **Other external sources** (web pages, RSS, other agent platforms) — same pipeline, different fetch client
- **Automated trust promotion** based on author reputation over time
- **Vector embedding** of quarantine content for semantic search within quarantine
- **Cross-source correlation** (same claim from multiple external sources increases trust)

---

## 8. Dependencies

- Moltbook API key configured (MOLTBOOK_API_KEY env var)
- Phase 5 (Memory Architecture Simplification) should ideally complete first to avoid building on types that will change — but quarantine types are additive, not modifying existing ones, so parallel work is possible
- Builder Console UI shell must be running for quarantine visibility
