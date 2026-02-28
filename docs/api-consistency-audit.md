# API Contract Consistency Audit

**Date**: 2026-02-28  
**Scope**: Phase 12, Task 5A - API Contract Audit + Consistency Pass  
**Status**: Initial Assessment

## Audit Criteria

According to Phase 12 specifications (Zo-Qore2.md), all endpoints must follow these standards:

| Dimension | Standard to enforce |
|---|---|
| URL patterns | Always plural nouns: `/thoughts`, `/clusters`, `/phases`, `/entries` |
| HTTP methods | GET=read, POST=create, PUT=full replace, PATCH=partial update, DELETE=remove |
| Response envelope | `{ data: T, meta?: { pagination, integrity } }` for success; `{ error: UserFacingError }` for failure |
| Status codes | 200=success, 201=created, 204=deleted, 400=bad request, 401=unauth, 403=policy denied, 404=not found, 409=conflict, 422=validation, 500=server |
| Timestamps | ISO 8601 everywhere, UTC |
| IDs | UUIDv4 everywhere |
| Pagination | `{ page, limit, total, hasMore }` in meta |

## Current State Analysis

### ✅ Compliant Areas

1. **URL Patterns**: All resource URLs use plural nouns (`/thoughts`, `/clusters`, `/phases`, `/register`)
2. **HTTP Methods**: Correct mapping (GET=read, POST=create, DELETE=remove)
3. **Status Codes**: Generally correct (200, 201, 400, 401, 403, 404, 500)
4. **Timestamps**: ISO 8601 format used (e.g., `new Date().toISOString()`)
5. **Error Responses**: Standardized `UserFacingError` format via `sendError()` method
6. **Authentication**: Consistent API key checking via `X-Qore-API-Key` header

### ❌ Non-Compliant Areas

#### 1. Response Envelope Inconsistency

**ISSUE**: Most endpoints return raw data instead of wrapped `{ data: T, meta?: {...} }` envelope.

**Examples**:
- Line 104: `GET /api/projects` → `{ projects: [] }` (should be `{ data: { projects: [] } }`)
- Line 124: `POST /api/projects` → `project` (should be `{ data: project, meta: { timestamp } }`)
- Line 154: `GET /api/projects/:id` → `project` (should be `{ data: project, meta: { integrity } }`)
- Line 313: `GET /reveal/clusters` → `{ clusters: [] }` (should be `{ data: { clusters: [] } }`)
- Line 363: `GET /constellation/map` → `{ nodes: [], edges: [] }` (should be `{ data: { nodes, edges } }`)
- Line 407: `GET /path/phases` → `{ phases: [] }` (should be `{ data: { phases: [] } }`)
- Line 468: `GET /risk/register` → `{ risks: [] }` (should be `{ data: { risks: [] } }`)
- Line 524: `GET /autonomy/config` → raw config (should be `{ data: config }`)

**ONLY COMPLIANT**:
- Line 267: `POST /void/thoughts/batch` → Uses `{ data: result, meta: { timestamp } }` ✅
- Line 231-235: `GET /void/thoughts` → Uses `responder.sendPaginated()` ✅

#### 2. Success Response Inconsistency

**ISSUE**: POST endpoints return `{ success: true }` instead of returning the created resource.

**Examples**:
- Line 356: `POST /reveal/clusters` → `{ success: true }` (should return created cluster)
- Line 400: `POST /constellation/map` → `{ success: true }` (should return saved constellation)
- Line 461: `POST /path/phases` → `{ success: true }` (should return created phase)
- Line 517: `POST /risk/register` → `{ success: true }` (should return created risk)
- Line 567: `POST /autonomy/config` → `{ success: true }` (should return saved config)

**EXCEPTION**: Line 263: `POST /void/thoughts` correctly returns the created thought ✅

#### 3. Pagination Response Structure

**ISSUE**: Only one endpoint uses the `responder.sendPaginated()` helper; others don't support pagination.

**COMPLIANT**:
- Line 231-235: `GET /void/thoughts` uses `sendPaginated()` with `{ page, limit, total }` ✅

**NON-COMPLIANT** (missing `hasMore` field):
- Current pagination meta: `{ page, limit, total }`
- Required: `{ page, limit, total, hasMore }`

**MISSING PAGINATION**:
- `GET /reveal/clusters` - should support pagination
- `GET /path/phases` - should support pagination
- `GET /risk/register` - should support pagination
- `GET /ledger` - should support pagination

#### 4. ID Generation Inconsistency

**ISSUE**: Mix of UUID formats and timestamp-based IDs.

**UUIDv4 (Compliant)**:
- Line 121: `proj_${randomUUID().slice(0, 8)}` → shortened UUID ✅
- Line 252: `thought_${randomUUID().slice(0, 8)}` → shortened UUID ✅

**Timestamp-based (Non-Compliant)**:
- Line 339: `cluster_${Date.now().toString(36)}` ❌
- Line 435: `phase_${Date.now().toString(36)}` ❌
- Line 497: `risk_${Date.now().toString(36)}` ❌

**RECOMMENDATION**: All IDs should use consistent format: `{type}_${randomUUID().slice(0, 8)}`

#### 5. Missing HTTP Methods

**ISSUE**: No PUT/PATCH/DELETE support for individual resources.

**MISSING ENDPOINTS**:
- `PUT /void/thoughts/:thoughtId` - Full replacement
- `PATCH /void/thoughts/:thoughtId` - Partial update (e.g., add tags, update status)
- `DELETE /void/thoughts/:thoughtId` - Remove thought
- `PUT /reveal/clusters/:clusterId` - Update cluster
- `DELETE /reveal/clusters/:clusterId` - Remove cluster
- `PATCH /path/phases/:phaseId` - Update phase (e.g., reorder, change status)
- `DELETE /path/phases/:phaseId` - Remove phase
- `PATCH /risk/register/:riskId` - Update risk (e.g., mitigation, status)
- `DELETE /risk/register/:riskId` - Remove risk

#### 6. Status Code Gaps

**ISSUE**: Missing specialized status codes for certain scenarios.

**MISSING**:
- `204 No Content` - for successful DELETE operations
- `207 Multi-Status` - ONLY used in batch import (line 299) ✅
- `409 Conflict` - for duplicate resources or integrity violations
- `422 Unprocessable Entity` - for validation errors (distinct from 400 bad request)

**CURRENT USAGE**:
- 200: Generic success
- 201: Resource created ✅
- 207: Multi-status (batch import only) ✅
- 400: Bad request (validation + malformed JSON)
- 401: Unauthorized ✅
- 403: Policy denied ✅
- 404: Not found ✅
- 500: Internal error ✅

#### 7. Meta Field Inconsistency

**ISSUE**: `meta` field only populated in pagination and batch responses.

**MISSING META**:
- Integrity status should be in `meta.integrity` for project GET
- Timestamp should be in `meta.timestamp` for all mutations
- Pagination info missing `hasMore` boolean

**COMPLIANT**:
- Line 302-306: Batch endpoint includes `meta.timestamp` ✅

#### 8. Error Response Envelope

**ISSUE**: Error responses are wrapped as `{ error: UserFacingError }` but success responses are not wrapped in `{ data: T }`.

**CURRENT STATE**:
- Success: raw payload (e.g., `{ project }`, `{ success: true }`)
- Error: `{ error: UserFacingError }` ✅

**TARGET STATE**:
- Success: `{ data: T, meta?: {...} }`
- Error: `{ error: UserFacingError }` ✅

This asymmetry makes client-side handling inconsistent.

## Priority Remediation Plan

### P0 - Critical (Breaking Changes)

1. **Standardize Response Envelope** (affects all clients)
   - Wrap all success responses in `{ data: T, meta?: {...} }`
   - Add `meta.timestamp` to all mutation responses
   - Add `meta.integrity` to project GET responses
   - Add `meta.hasMore` to pagination responses

2. **Standardize ID Generation** (affects data layer)
   - Replace all `Date.now().toString(36)` with `randomUUID().slice(0, 8)`
   - Update cluster, phase, risk ID generation

### P1 - High (Feature Gaps)

1. **Add Missing CRUD Methods**
   - Implement PUT/PATCH/DELETE for thoughts
   - Implement PUT/PATCH/DELETE for clusters
   - Implement PATCH/DELETE for phases
   - Implement PATCH/DELETE for risks

2. **Add Pagination to List Endpoints**
   - `GET /reveal/clusters?page=&limit=`
   - `GET /path/phases?page=&limit=`
   - `GET /risk/register?page=&limit=`
   - `GET /ledger?page=&limit=`

### P2 - Medium (Quality Improvements)

1. **Return Created Resources**
   - Change all `{ success: true }` responses to return the actual created/updated resource
   - Use 201 status for creation, 200 for updates

2. **Refine Status Codes**
   - Use 204 for DELETE success (no content)
   - Use 409 for duplicate/conflict errors
   - Use 422 for validation errors (separate from 400)

### P3 - Low (Nice to Have)

1. **Add Sparse Field Selection**
   - Support `?fields=` query param to reduce payload size

2. **Add ETag Support**
   - Already implemented via `OptimizedResponder` for GET `/void/thoughts` ✅
   - Extend to all GET endpoints

## Implementation Strategy

### Phase 1: Non-Breaking Additions
1. Add PATCH/DELETE endpoints (new routes, no existing clients)
2. Add pagination to list endpoints (backward compatible with defaults)
3. Use `responder.sendPaginated()` helper for consistency

### Phase 2: Response Envelope Migration (Breaking)
1. Create `sendData()` helper method: `sendData(res, statusCode, data, meta?)`
2. Update all endpoints to use new helper
3. Document breaking change in API changelog
4. Update UI clients to expect `{ data, meta }` format

### Phase 3: ID Generation Migration (Breaking)
1. Update ID generation to use UUIDs consistently
2. Migrate existing data (if necessary)
3. Document breaking change

## Recommended Helper Methods

Add to `PlanningRoutes` class:

```typescript
/**
 * Send a successful data response with standardized envelope
 */
private sendData<T>(
  res: http.ServerResponse,
  statusCode: number,
  data: T,
  meta?: {
    timestamp?: string;
    integrity?: unknown;
    pagination?: { page: number; limit: number; total: number; hasMore: boolean };
    [key: string]: unknown;
  }
): boolean {
  const payload = { data, ...(meta && { meta }) };
  return this.sendJson(res, statusCode, payload);
}

/**
 * Send a paginated response with full metadata
 */
private sendPaginated<T>(
  res: http.ServerResponse,
  data: T[],
  pagination: { page: number; limit: number; total: number }
): boolean {
  const hasMore = pagination.page * pagination.limit < pagination.total;
  return this.sendData(res, 200, data, {
    pagination: { ...pagination, hasMore },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send a created resource response (201)
 */
private sendCreated<T>(
  res: http.ServerResponse,
  resource: T
): boolean {
  return this.sendData(res, 201, resource, {
    timestamp: new Date().toISOString(),
  });
}

/**
 * Generate consistent resource ID
 */
private generateId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
```

## API Documentation Needs

Create `docs/API.md` with:
- All endpoints with request/response schemas
- Error code reference
- Authentication requirements
- Pagination format
- Common patterns (envelopes, timestamps, IDs)

## Next Steps

1. ✅ Complete this audit document
2. 🔄 Implement Phase 1 (non-breaking additions)
3. 🔄 Implement Phase 2 (response envelope migration)
4. 🔄 Update `npm run typecheck` and tests
5. 🔄 Document breaking changes in CHANGELOG
6. 🔄 Update UI clients to handle new format

## Acceptance Criteria

- [ ] All endpoints return `{ data: T, meta?: {...} }` envelope
- [ ] All mutations include `meta.timestamp`
- [ ] All list endpoints support pagination with `hasMore`
- [ ] All IDs use consistent UUID format
- [ ] All resource creation returns the created resource (not `{ success: true }`)
- [ ] PATCH/DELETE endpoints exist for all mutable resources
- [ ] Status codes match specification (200, 201, 204, 400, 403, 404, 409, 422, 500)
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes with updated response format
- [ ] API documentation created
