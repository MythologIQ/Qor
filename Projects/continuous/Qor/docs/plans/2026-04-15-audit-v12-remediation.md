# Plan: Audit v12 Remediation — Auth Consolidation + Route Wiring

**VETO Reference**: audit-v12-codebase-reality-veto (2026-04-15T21:40:00Z)
**Violations**: V-SEC-2, V-SEC-3, V-ORPHAN-2, V-ARCH-5
**Risk Grade**: L3
**Supersedes**: N/A (remediation of existing Phase 2 dead code)

## Open Questions

None. All violations have concrete fixes with known implementation paths.

## Phase 1: Auth Consolidation (V-SEC-2, V-SEC-3)

### Affected Files

- `continuum/src/service/api/shared/forge-auth.ts` — Rewrite: timing-safe comparison, per-module secret resolution
- `continuum/src/service/api/qor-routes.ts` — Add auth guard before evaluate call
- `continuum/src/service/api/qora-routes.ts` — Remove inline `auth()`, import from shared
- `continuum/src/service/api/forge-routes.ts` — No change (already imports from shared)
- `continuum/src/service/api/qor-evidence-routes.ts` — Remove inline `requireAuth()`, import from shared

### Changes

**`shared/forge-auth.ts` → rename to `shared/auth.ts`**

Replace `===` comparison with `timingSafeEqual`. Support per-module secrets via a `moduleAuth(module)` factory that reads from `<module>/.secrets/api_key` OR falls back to env var `QOR_<MODULE>_SECRET`. Keep `uid()` export.

```typescript
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const SECRET_PATHS: Record<string, string> = {
  forge: "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key",
  qora: "/home/workspace/Projects/continuous/Qor/qora/.secrets/api_key",
};

function getSecret(module: string): string | null {
  // Env var takes precedence
  const envKey = `QOR_${module.toUpperCase()}_SECRET`;
  if (process.env[envKey]) return process.env[envKey]!;
  // Fall back to file
  const path = SECRET_PATHS[module];
  if (!path) return process.env.QOR_EVIDENCE_SECRET ?? null;
  try { return readFileSync(path, "utf-8").trim(); } catch { return null; }
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function auth(req: Request, module = "forge"): boolean {
  const header = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = header.replace("Bearer ", "").trim();
  if (!token) return false;
  const secret = getSecret(module);
  if (!secret) return false;
  return constantTimeEqual(token, secret);
}

export function uid(): string {
  return "gov_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
```

**`qor-routes.ts`** — Add auth guard:

```typescript
import { auth } from "./shared/auth";

// After method check, before body parse:
if (!auth(req, "qor")) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

**`qora-routes.ts`** — Remove lines 6, 16-21 (SECRET_PATH constant, inline `auth()` function). Add import:

```typescript
import { auth, uid } from "./shared/auth";
```

Change line 100 auth call to: `auth(req, "qora")`

**`qor-evidence-routes.ts`** — Remove lines 1, 5-15 (crypto import, inline `requireAuth()`). Add import:

```typescript
import { auth } from "./shared/auth";
```

Replace `requireAuth(req)` with `auth(req, "qor")`.

### Unit Tests

- `continuum/tests/auth.test.ts` — Tests: timing-safe comparison works, rejects wrong token, rejects empty token, supports x-api-key header, per-module secret resolution, falls back to env var when file missing

## Phase 2: De-duplicate Governance + Wire Routes (V-ORPHAN-2, V-ARCH-5)

### Affected Files

- `continuum/src/service/api/forge-routes.ts` — Remove ~50 lines of duplicated governance logic, import from `evidence/`
- `continuum/src/service/api/qora-routes.ts` — Remove ~50 lines of duplicated governance logic, import from `evidence/`
- `continuum/src/service/router.ts` — Import and dispatch to all 4 route modules

### Changes

**`forge-routes.ts`** — Delete: `ACTION_SCORES`, `TRUST_CEIL`, `classifyEvidence`, `validateEvidence`, `recordDecision`, `governanceGate` (lines 9-83). Replace with:

```typescript
import { executeGovernedAction } from "../../../../evidence/governance-gate";
import type { GovernedActionInput } from "../../../../evidence/contract";
```

In each handler, replace `governanceGate(mod, action, agentId, evidence, trustStage)` with:

```typescript
const { decision, allowed } = await executeGovernedAction({
  module: "forge",
  action: "phase.create",
  agentId,
  payload: body as Record<string, unknown>,
  evidence: body.evidence,
  trustStage: resolveTrustStage(agentId),
});
if (!allowed) {
  return Response.json({
    error: "Governance violation",
    decision: decision.result,
    decisionId: decision.decisionId,
    mitigation: decision.mitigation,
  }, { status: 403 });
}
```

Same pattern for all 4 gated handlers (create-phase, update-task, update-risk, record-evidence skips gate per ingestion-contract exemption).

**`qora-routes.ts`** — Same deletion of duplicated functions (lines 10-74). Same replacement pattern with `executeGovernedAction` for `append-entry` and `record-veto`.

Remove `appendFileSync`, `mkdirSync` imports that only served `recordDecision`.

**`router.ts`** — Add route handler imports and dispatch:

```typescript
import { forgeRoutes } from "./api/forge-routes";
import { qoraRoutes } from "./api/qora-routes";
import { qorEvaluateRoutes } from "./api/qor-routes";
import { qorEvidenceRoutes } from "./api/qor-evidence-routes";
```

In the `route()` function, after the `/api/chat` early return and before the existing graph/layer dispatch:

```typescript
// Module-specific API routes
const moduleRoutes = [forgeRoutes, qoraRoutes, qorEvaluateRoutes, qorEvidenceRoutes];
for (const handler of moduleRoutes) {
  const res = await handler(path, url, req);
  if (res) return res;
}
```

This goes BEFORE the `handleGraphRoutes`/`handleLayerRoutes` calls, so module routes take precedence over the generic continuum graph routes when paths overlap.

### Unit Tests

- `continuum/tests/router-wiring.test.ts` — Tests: forge-routes dispatched on `/api/forge/status`, qora-routes dispatched on `/api/qora/status`, qor-routes dispatched on `/api/qor/evaluate`, qor-evidence-routes dispatched on `/api/qor/evidence`, unknown `/api/foo` returns 404, non-API paths fall through to static routes
- `continuum/tests/governance-dedup.test.ts` — Tests: forge-routes calls `executeGovernedAction` (not inline), qora-routes calls `executeGovernedAction` (not inline), no `ACTION_SCORES` export from forge-routes or qora-routes

## Verification Checklist

After implementation:

1. `bun test` — all existing + new tests pass
2. `curl POST /api/qor/evaluate` without auth → 401
3. `curl POST /api/forge/create-phase` with auth → governance gate (not 404)
4. `curl GET /api/qora/status` → 200 (not 404)
5. `curl POST /api/qor/evidence` with auth → 200 (not 404)
6. `grep -r "=== readFileSync" continuum/src/` → 0 matches (no timing-vulnerable comparisons)
7. `grep -r "ACTION_SCORES" continuum/src/service/api/` → 0 matches (no duplicated scores)
