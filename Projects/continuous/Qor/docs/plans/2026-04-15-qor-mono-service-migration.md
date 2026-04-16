# Plan: QOR Mono-Service Migration + Forge Chat (v3 — Remediated)

**Supersedes**: `docs/ARCHITECTURE_PLAN.md` (2026-04-10, "QOR Shell-First UI Remediation") — that plan targeted zo.space route rebuilds. This plan replaces it with a full migration off zo.space onto a self-hosted Bun service. The shell-first design principles are retained but applied to the new static HTML pages.

**Veto Revisions**: This plan remediates all 8 violations from audit-v9 (2026-04-15T04:45:00Z) and both violations from audit-v10 (2026-04-15T05:15:00Z). Violation remediation table at the end of this document.

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Auth model for Forge Chat | Inherit `VICTOR_CHAT_SECRET` bearer token, validated via **first WebSocket frame** (not query parameter) |
| Transport for governed chat | **WebSocket** — SSE deprecated across the service. Bidirectional required for pre-flight gate negotiation. |
| Governance policy scope (runtime) | **OWASP** security baseline + existing **evidence pipeline** (`evidence/evaluate.ts`, `evidence/governance-gate.ts`, `evidence/mutation-contract.ts`) |
| FailSafe Pro | **SDLC process only** — lives in the Forge as the development methodology (plan → audit → implement → substantiate). NOT a runtime middleware layer. |
| QoreLogic Tribunal | **Runtime enforcement** — Governor/Judge/Specialist personas encode as TypeScript logic in the chat gate for L2/L3 risk grading |

## Architecture

**One service.** Rename `continuum-api` → `qor`. The Bun server at port 4100 becomes the QOR suite — API + HTML frontend + the new Forge Chat.

```
QOR Service (port 4100)
├── /api/continuum/*     ← existing graph/memory routes (unchanged)
├── /api/victor/*        ← migrated from zo.space
├── /api/forge/*         ← migrated from zo.space
├── /api/qora/*          ← migrated from zo.space
├── /api/qor/*           ← migrated from zo.space
├── /api/chat/*          ← NEW: governed Forge Chat endpoint (Phase 3)
├── /qor/*               ← HTML pages served from static assets
├── /mobile/*            ← HTML pages served from static assets
└── /assets/*            ← images, CSS, JS
```

**Naming:** The service is `qor`. Continuum is the memory substrate it talks to (Neo4j). No more `continuum-api` label.

**Transport:** All chat endpoints use WebSocket. The server upgrades HTTP → WS on `/api/chat`. Pre-flight governance evaluation happens on the WS connection before any model stream begins.

**Existing governance stack** (already in codebase, reused as-is):

| Module | Path | Purpose |
|--------|------|---------|
| `evaluate.ts` | `evidence/evaluate.ts` | Action scoring, risk categorization, credential/system pattern detection |
| `governance-gate.ts` | `evidence/governance-gate.ts` | `executeGovernedAction()` — evidence classification, validation, decision recording |
| `contract.ts` | `evidence/contract.ts` | Types: `EvidenceEntry`, `GovernanceDecision`, `TrustStage`, `RiskCategory` |
| `mutation-contract.ts` | `evidence/mutation-contract.ts` | Mutation validation: domain, target, actor, scope, constraints |
| `trust-progression.ts` | `evidence/trust-progression.ts` | Dynamic trust resolution: cbt → kbt → ibt with demotion |
| `log.ts` | `evidence/log.ts` | `appendEvidence()` — append-only merkle-chained ledger |

## Phase 1: Scaffold QOR Service + Static Frontend

### Affected Files

- `continuum/src/service/server.ts` — add static file serving, WebSocket upgrade stub, rename internal references
- `continuum/src/service/router.ts` — NEW: central route dispatcher
- `continuum/src/service/static-routes.ts` — NEW: HTML/CSS/JS file serving
- `continuum/src/shared/types.ts` — NEW: shared type definitions (`GateResult`, `ChatMessage`, `AuditRecord`)
- `continuum/public/` — NEW directory for HTML assets

### Changes

**1. Extract router from server.ts**

Move the inline `handleGraphRoutes` / `handleLayerRoutes` if/else chain into a proper router module. Phase 1 router does NOT import `chat-routes` — that module is created in Phase 3. Instead, Phase 1 router returns 501 for `/api/chat/*` paths.

```typescript
// src/service/router.ts
import { graphRoutes } from "./api/graph-routes";
import { layerRoutes } from "./api/layer-routes";
import { staticRoutes } from "./static-routes";

const API_PREFIXES = ["/api/continuum", "/api/victor", "/api/forge", "/api/qora", "/api/qor"];

export async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith("/api/chat")) {
    return Response.json({ error: "not implemented" }, { status: 501 });
  }

  if (API_PREFIXES.some(p => path.startsWith(p))) {
    return routeAPI(path, url, req);
  }
  return staticRoutes(path);
}
```

Phase 3 adds `chatRoutes` to this router's dispatch table.

**2. Add static file serving**

```typescript
// src/service/static-routes.ts
const STATIC_DIR = import.meta.dir + "/../../public";

const ROUTE_MAP: Record<string, string> = {
  "/qor": "/qor/index.html",
  "/qor/victor": "/qor/victor.html",
  "/qor/victor/chat": "/qor/victor-chat.html",
  "/qor/forge": "/qor/forge.html",
  "/qor/qora": "/qor/qora.html",
  "/qor/continuum": "/qor/continuum.html",
  "/mobile/qor": "/mobile/qor.html",
  "/qor/forge/chat": "/qor/forge-chat.html",
  // ... etc
};

export async function staticRoutes(path: string): Promise<Response> {
  const file = ROUTE_MAP[path]
    ? Bun.file(STATIC_DIR + ROUTE_MAP[path])
    : Bun.file(STATIC_DIR + path);
  return file.exists() ? new Response(file) : Response.json({ error: "not found" }, { status: 404 });
}
```

**3. Create shared types**

```typescript
// src/shared/types.ts
export interface GateResult {
  allowed: boolean;
  reason?: string;
  policyId?: string;
  evaluatedAt: number;
}

export interface ChatMessage {
  type: "message";
  content: string;
  mode: "chat" | "forge";
  model?: string;
}

export interface ChatFrame {
  type: "gate" | "chunk" | "complete" | "error";
  content?: string;
  result?: GateResult;
  messageId?: string;
  auditId?: string;
  reason?: string;
  stance?: string;
}

export interface AuditRecord {
  conversationId: string;
  messageId: string;
  gateResult: GateResult;
  modelUsed: string;
  tokenCount?: number;
  latencyMs: number;
  stance?: string;
  timestamp: number;
}
```

**4. Create HTML page templates**

Convert zo.space React pages to vanilla HTML + CSS + JS. Each page becomes a self-contained HTML file in `public/`. The existing CSS from the zo.space pages is already inline (`<style>` blocks) — extract into shared CSS files.

Pages to convert (19 total):

| Priority | Pages | Complexity |
|----------|-------|------------|
| 1 (critical) | `/qor`, `/qor/victor/chat` | Shell + Chat — highest value |
| 2 (core) | `/qor/victor`, `/qor/forge`, `/qor/qora`, `/qor/continuum` | Module dashboards |
| 3 (ops) | `/qor/victor/automation`, `/qor/victor/governance`, `/qor/victor/audit` | Governance panels |
| 4 (forge) | `/qor/forge/projects`, `/qor/forge/roadmap`, `/qor/forge/risks`, `/qor/forge/constellation` | Forge sub-panels |
| 5 (mobile) | `/mobile/qor/*` (5 pages) | Mobile variants |

**5. Add WebSocket upgrade stub to server.ts**

```typescript
// In server.ts fetch handler, before route dispatch:
if (req.headers.get("upgrade") === "websocket" && path.startsWith("/api/chat")) {
  return Response.json({ error: "not implemented" }, { status: 501 });
}
```

### Unit Tests

- `tests/router.test.ts` — route dispatch to correct handler, `/api/chat` returns 501
- `tests/static-routes.test.ts` — path → file mapping, 404 fallback, content-type headers, `/qor/forge/chat` returns HTML
- `tests/shared/types.test.ts` — type guards for ChatMessage, ChatFrame, GateResult

## Phase 2: Migrate API Routes

### Affected Files

- `src/service/api/graph-routes.ts` — existing graph routes, extracted from inline handlers
- `src/service/api/layer-routes.ts` — existing layer routes, extracted from inline handlers
- `src/service/api/victor-routes.ts` — NEW: `/api/victor/*` handlers migrated from zo.space
- `src/service/api/forge-routes.ts` — NEW: `/api/forge/*` handlers migrated from zo.space
- `src/service/api/qora-routes.ts` — NEW: `/api/qora/*` handlers migrated from zo.space
- `src/service/api/qor-routes.ts` — NEW: `/api/qor/*` handlers migrated from zo.space

### Changes

Port each zo.space API handler to a function matching `(path: string, url: URL, req: Request) => Promise<Response | null>`. Strip Hono dependency (`c.req.json()` → `req.json()`, `c.json()` → `Response.json()`, `c.req.header()` → `req.headers.get()`). Keep business logic identical.

**Auth migration:**
- Zo.space routes using `VICTOR_CHAT_SECRET` bearer auth: adapt from `c.req.header("authorization")` to `req.headers.get("authorization")`
- Zo.space routes also accepting `X-Api-Key` header: adapt from `c.req.header("x-api-key")` to `req.headers.get("x-api-key")`
- Internal read-only routes stay unauthenticated

**API consolidation (deduplication):**
- `/api/continuum/graph?endpoint=recall` already exists — zo.space proxy routes that called this via HTTP now call the local function directly (import, not fetch)
- `/api/continuum/status` replaces `/api/mobile-qor-status` (merge)
- `/api/forge/status` reads from filesystem — keep as-is

**Governance gate reuse:**
Migrated write endpoints that currently use `executeGovernedAction()` from `evidence/governance-gate.ts` continue to use it.

**New action scores for Forge Chat:**
Add chat-specific action scores to `ACTION_SCORES` in `evidence/evaluate.ts`. These must exist before Phase 3 builds the gate, otherwise `evaluate()` falls back to `DEFAULT_UNKNOWN_SCORE = 0.5`, which produces `"Escalate"` under kbt (allowCeiling=0.5, strict `<` check) and blocks every message.

```diff
// evidence/evaluate.ts — ACTION_SCORES additions
+  "chat.message": 0.1,
+  "chat.forge": 0.15,
```

Score rationale: `chat.message` (0.1) is a standard user query — equivalent to `evidence.record` in risk. `chat.forge` (0.15) is slightly higher because Forge mode has broader capability scope. Both fall safely below `kbt` allowCeiling (0.5), producing `"Allow"` verdicts for normal use.

### Unit Tests

- `tests/api/graph-routes.test.ts` — health, stats, timeline, recall, query
- `tests/api/victor-routes.test.ts` — project-state, chat, heartbeat-cadence, quarantine (method, auth, response shape)
- `tests/api/forge-routes.test.ts` — status, create-phase, update-task, update-risk, record-evidence
- `tests/api/qora-routes.test.ts` — status, entries, append-entry, entry/:seq, record-veto
- `tests/api/qor-routes.test.ts` — evaluate, governance-dashboard, evidence, evidence/bundle

## Phase 3: Forge Chat (Governed Chat Surface)

### Affected Files

- `src/service/api/chat-routes.ts` — NEW: WebSocket chat endpoint
- `src/service/chat/gate.ts` — NEW: pre-flight OWASP + evidence gate
- `src/service/chat/audit.ts` — NEW: post-response audit logger (appends to `evidence/ledger.jsonl`)
- `src/service/chat/tribunal.ts` — NEW: QoreLogic Tribunal runtime enforcement
- `src/service/chat/conversation-store.ts` — NEW: conversation persistence (filesystem-backed)
- `src/service/chat/model-registry.ts` — NEW: available model list + cost metadata
- `public/qor/forge-chat.html` — NEW: Forge Chat UI page

### Changes

**1. Pre-flight governance gate**

Two layers only (OWASP + evidence pipeline). FailSafe Pro is NOT a runtime layer — it governs how this code was built, not how it runs.

```typescript
// src/service/chat/gate.ts
import { evaluate } from "../../../evidence/evaluate";
import { tribunalGate } from "./tribunal";
import type { GateResult } from "../../shared/types";

const MAX_MESSAGE_SIZE = 32000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MESSAGES = 30;

const INJECTION_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /\.\.\/\.\.\//,
  /;(?:drop|delete|truncate|alter)\s/i,
];

export async function evaluateGate(request: {
  message: string;
  mode: "chat" | "forge";
  userId?: string;
  conversationId?: string;
}): Promise<GateResult> {
  const evaluatedAt = Date.now();

  // Layer 1: OWASP baseline
  if (!request.message || request.message.length > MAX_MESSAGE_SIZE) {
    return { allowed: false, reason: "message size exceeded", policyId: "owasp-size", evaluatedAt };
  }
  if (INJECTION_PATTERNS.some(p => p.test(request.message))) {
    return { allowed: false, reason: "injection pattern detected", policyId: "owasp-injection", evaluatedAt };
  }
  if (!checkRateLimit(request.userId ?? "anon")) {
    return { allowed: false, reason: "rate limit exceeded", policyId: "owasp-rate", evaluatedAt };
  }

  // Layer 2: Evidence pipeline (existing governance)
  const evalResult = evaluate({
    action: request.mode === "forge" ? "chat.forge" : "chat.message",
    agentId: request.userId ?? "anonymous",
    resource: "model-api",
    context: { mode: request.mode },
    trustStage: "kbt",
  });

  if (evalResult.decision !== "Allow") {
    return {
      allowed: false,
      reason: evalResult.mitigation ?? "governance policy denied",
      policyId: `evidence-${evalResult.riskCategory}`,
      evaluatedAt,
    };
  }

  // Layer 3: Tribunal escalation for L2/L3 risk grades
  if (evalResult.riskCategory === "medium" || evalResult.riskCategory === "high" || evalResult.riskCategory === "critical") {
    const tribunalResult = tribunalGate(evalResult.riskCategory, undefined);
    if (!tribunalResult.allowed) {
      return { ...tribunalResult, evaluatedAt };
    }
  }

  return { allowed: true, evaluatedAt };
}
```

**2. QoreLogic Tribunal enforcement**

Encodes Tribunal roles as runtime checks for L2/L3 risk-grade operations (not applied to normal chat):

```typescript
// src/service/chat/tribunal.ts
import type { GateResult } from "../../shared/types";

export function tribunalGate(riskGrade: string, auditVerdict?: string): GateResult {
  // L1: no tribunal check needed
  if (riskGrade === "low" || riskGrade === "none") {
    return { allowed: true, evaluatedAt: Date.now() };
  }
  // L2+: require PASS verdict from audit trail
  if (!auditVerdict || auditVerdict !== "PASS") {
    return {
      allowed: false,
      reason: "Tribunal audit required for L2+ operation",
      policyId: "tribunal-gate",
      evaluatedAt: Date.now(),
    };
  }
  return { allowed: true, evaluatedAt: Date.now() };
}
```

**3. WebSocket chat endpoint**

```typescript
// src/service/api/chat-routes.ts
import { evaluateGate } from "../chat/gate";
import { writeAuditRecord } from "../chat/audit";
import { loadConversation, appendMessage } from "../chat/conversation-store";
import { getAvailableModels } from "../chat/model-registry";
import type { ChatMessage, ChatFrame, GateResult } from "../../shared/types";

// WebSocket upgrade on /api/chat
//
// Auth: First-frame authentication — client MUST send
// { type: "auth", token: "Bearer ..." } as the first frame.
// Server validates against VICTOR_CHAT_SECRET.
// If first frame is not auth or token is invalid → close with 4001.
//
// Message protocol (JSON frames):
// Client → Server: { type: "message", content: string, mode: "chat"|"forge", model?: string }
// Server → Client: { type: "gate", result: GateResult }
// Server → Client: { type: "chunk", content: string }
// Server → Client: { type: "complete", messageId: string, auditId: string }
// Server → Client: { type: "error", reason: string }
//
// Flow:
// 1. On connection: wait for auth frame, validate, close on failure
// 2. On each message frame: run evaluateGate()
// 3. If gate rejects → send { type: "gate", result: {...allowed: false} }
// 4. If gate allows → stream model response as { type: "chunk" } frames
// 5. On stream complete → writeAuditRecord() + send { type: "complete", auditId }
```

**4. Conversation store (filesystem-backed)**

```typescript
// src/service/chat/conversation-store.ts
// Stores conversation history as JSONL in /home/workspace/.continuum/chat/
// Each conversation = one file, append-only
// Functions: loadConversation(), appendMessage(), listConversations()
```

**5. Model registry**

```typescript
// src/service/chat/model-registry.ts
// Returns available models from Zo API (proxied from /api/victor/models or similar)
// Functions: getAvailableModels(), getModelById(), selectModel()
// UI calls GET /api/chat/models to populate the picker
```

**6. Post-response audit trail**

```typescript
// src/service/chat/audit.ts
import { appendEvidence } from "../../../evidence/log";
import type { AuditRecord } from "../../shared/types";

export async function writeAuditRecord(record: AuditRecord): Promise<string> {
  const auditId = `chat_${record.messageId}_${Date.now()}`;
  appendEvidence({
    kind: "PolicyDecision",
    source: `chat/${record.gateResult.policyId ?? "ok"}`,
    module: "qor",
    payload: {
      auditId,
      conversationId: record.conversationId,
      messageId: record.messageId,
      gateAllowed: record.gateResult.allowed,
      modelUsed: record.modelUsed,
      tokenCount: record.tokenCount,
      latencyMs: record.latencyMs,
      stance: record.stance,
    },
    confidence: record.gateResult.allowed ? 0.9 : 0.1,
  });
  return auditId;
}
```

**7. Forge Chat UI — every element wired to a backend handler**

| UI Element | Data Source | API Endpoint |
|------------|-------------|--------------|
| Message input + response | WebSocket `/api/chat` | `evaluateGate()` → model stream → `writeAuditRecord()` |
| Governance status indicator | `ChatFrame.type === "gate"` | Inline in WS protocol |
| Mode toggle (Chat / Forge) | Client-side state, sent in each `ChatMessage.mode` | Same WS endpoint, different `mode` field |
| Model picker | `GET /api/chat/models` | `model-registry.ts` → `getAvailableModels()` |
| **Forge Chat page** | **Navigate to `/qor/forge/chat`** | **`static-routes.ts` ROUTE_MAP → `public/qor/forge-chat.html`** |
| Conversation history (sidebar) | `GET /api/chat/conversations` | `conversation-store.ts` → `listConversations()` |
| Conversation messages | `GET /api/chat/conversations/:id` | `conversation-store.ts` → `loadConversation()` |

### Unit Tests

- `tests/chat/gate.test.ts` — OWASP rejection patterns (XSS, injection, size, rate), evidence pipeline Allow/Block
- `tests/chat/audit.test.ts` — record format, append-only via `evidence/log.ts`, merkle chain integrity
- `tests/chat/tribunal.test.ts` — L1 passthrough, L2/L3 blocked without verdict, L2/L3 allowed with PASS
- `tests/chat/conversation-store.test.ts` — create, append, load, list conversations
- `tests/chat/model-registry.test.ts` — model list, model selection
- `tests/api/chat-routes.test.ts` — WS upgrade, first-frame auth (valid/invalid/missing), gate rejection, streaming frames, audit completion

## Phase 4: Service Rename + Cutover

### Affected Files

- Service config: rename `continuum-api` → `qor`
- `update_user_service` call to rename and restart
- `continuum/src/service/server.ts` — startup message, env var
- `continuum/src/service/router.ts` — add `chatRoutes` dispatch (Phase 3 module now exists)

### Changes

1. Rename service label from `continuum-api` to `qor`
2. Update env var from `CONTINUUM_PORT` to `QOR_PORT` (port stays 4100)
3. Add `chatRoutes` to router dispatch (was 501 stub, now wired to Phase 3 module)
4. Verify all routes respond on port 4100
5. Delete all non-showcase routes from zo.space
6. Delete all non-showcase assets from zo.space
7. Update zo.space `/` homepage to redirect to showcase or serve as public landing

### Unit Tests

- Integration test: curl every migrated endpoint, verify response
- Integration test: static pages return HTML with correct content-type
- Integration test: WebSocket `/api/chat` connects, authenticates, sends message, receives frames
- Smoke test: zo.space only has `/showcase/*` routes remaining

## Migration Order

```
Phase 1 (scaffold) → Phase 2 (APIs) → Phase 4 (cutover) → Phase 3 (Forge Chat)
```

Phase 3 files are created in Phase 3. Phase 1 router returns 501 for `/api/chat`. Phase 4 wires the router to the Phase 3 module. This eliminates the Phase 1-imports-Phase-3 build-order violation.

## Veto Remediation Table

| # | Violation ID | Original | Remediation | Phase |
|---|-------------|----------|-------------|-------|
| 1 | V-SEC-1 | Auth via query parameter | First-frame `{ type: "auth", token }` — server closes connection on missing/invalid auth frame | 3 |
| 2 | V-GUI-1 | Model picker — no data source | `GET /api/chat/models` → `model-registry.ts` → `getAvailableModels()` | 3 |
| 3 | V-GUI-2 | Conversation history — no persistence | `conversation-store.ts` — filesystem-backed JSONL, `GET /api/chat/conversations` | 3 |
| 4 | V-GUI-3 | Mode toggle — no behavioral spec | `ChatMessage.mode: "chat" \| "forge"` — different action scores in `evaluate.ts` | 3 |
| 5 | V-ARCH-1 | Phase 1 imports Phase 3 module | Phase 1 router returns 501 for `/api/chat/*`. Phase 4 wires Phase 3 module. No forward import. | 1→4 |
| 6 | V-ARCH-2 | `GateResult` — no shared types | `src/shared/types.ts` created in Phase 1, imported by Phase 3 | 1 |
| 7 | V-ARCH-3 | `continuum/src/governance/` — phantom path | Removed. Runtime governance uses existing `evidence/evaluate.ts` + `evidence/governance-gate.ts`. FailSafe Pro is SDLC, not runtime. | All |
| 8 | V-ARCH-4 | Contradicts ARCHITECTURE_PLAN.md | Explicit `Supersedes` declaration at top of plan. Shell-first principles retained. | N/A |
| 9 | V-LOGIC-1 | `chat.message`/`chat.forge` not in ACTION_SCORES → 0.5 → Escalate under kbt | Added `"chat.message": 0.1` and `"chat.forge": 0.15` to `evaluate.ts` in Phase 2. Both below kbt allowCeiling (0.5). | 2 |
| 10 | V-ORPHAN-1 | `tribunal.ts` exported but never imported | `gate.ts` imports and calls `tribunalGate()` as Layer 3 for medium/high/critical risk. Dead `evaluate` import removed from `tribunal.ts`. | 3 |
| 11 | V-ROUTE-1 | `forge-chat.html` has no route entry | Added `"/qor/forge/chat": "/qor/forge-chat.html"` to ROUTE_MAP, added to UI wire-up table, added to static-routes test. | 1 |
