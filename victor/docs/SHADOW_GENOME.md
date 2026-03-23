# Shadow Genome — Victor Direct Chat + Forge Brainstorming

## Purpose

Documents **failure modes** — approaches that were rejected, patterns that failed, and lessons learned. Creates institutional memory to prevent repeated mistakes.

---

## Failure Categories

| Code | Category | Description |
|------|----------|-------------|
| `COMPLEXITY_VIOLATION` | Section 4 Razor breach | Function/file too long, nesting too deep |
| `SECURITY_STUB` | Incomplete security | TODO/placeholder in auth/security code |
| `GHOST_PATH` | Disconnected UI | UI element without backend handler |
| `HALLUCINATION` | Invalid dependency | Library that doesn't exist or wasn't verified |
| `ORPHAN` | Dead code | File not connected to build path |
| `SPEC_DRIFT` | Blueprint mismatch | Implementation doesn't match specification |
| `CHAIN_BREAK` | Merkle violation | Hash chain integrity compromised |

---

## Failure Log

### Failure #1 — SECURITY_STUB

| Field | Value |
|-------|-------|
| **Date** | 2026-03-23 |
| **Iteration** | 1 |
| **Category** | `SECURITY_STUB` |
| **Severity** | L2 (cost exposure, not data breach) |
| **What was attempted** | API route /api/victor/chat designed as open proxy to Zo API, relying on "Zo platform auth" for security |
| **Why it failed** | zo.space API routes are always publicly accessible. The ZO_CLIENT_IDENTITY_TOKEN lives server-side. Any internet user can POST to the endpoint and consume the account owner's AI credits. The blueprint confused server-side auth (Zo API token) with client-facing auth (none). |
| **Pattern to avoid** | Never assume that a server-side API token provides client-facing access control. zo.space API routes require explicit bearer auth when proxying to cost-bearing services. |
| **Remediation** | Add bearer token auth using timing-safe comparison. User stores secret in Settings > Advanced as VICTOR_CHAT_SECRET. |

---
