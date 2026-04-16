# QOR Backlog

## B1: Forge Planner Service Extraction

- Status: planned
- Priority: high
- Depends on: `docs/plans/2026-04-10-forge-workspace-authority.md`

### Goal

Replace thin zo.space adapters with a dedicated workspace-owned planner service so Forge planner reads and writes no longer depend on zo.space as an execution substrate.

### Scope

- Create a dedicated Forge planner service with its own HTTP contract.
- Move planner artifact materialization and mutation execution behind the service boundary.
- Convert zo.space Forge routes into simple proxies to the planner service.
- Keep `qor/contracts/forge-planner.ts` as the canonical shared contract between workspace modules, service handlers, and route proxies.

### Exit Criteria

- zo.space does not derive or mutate planner state directly.
- `/api/forge/status`, `/api/forge/update-task`, `/api/forge/create-phase`, `/api/forge/update-risk`, and `/api/forge/record-evidence` proxy to the planner service only.
- Forge planner runtime can be tested and operated without zo.space being present.

## B2: Workspace-First zo.space Preview Pipeline

- Status: planned
- Priority: high
- Depends on: `docs/plans/2026-04-10-forge-workspace-authority.md`

### Goal

Keep the workspace under `Qor/` as the only operational source of truth while using zo.space as a disposable preview and review sandbox before approved diffs are persisted back to workspace files.

### Scope

- Define a projection flow from workspace authority into temporary zo.space preview routes.
- Treat zo.space operational edits as non-durable preview state unless explicitly promoted.
- Add an approval step that captures the reviewed diff before writing any accepted changes back to workspace files.
- Preserve zo.space for showcase routes and sandboxed UI verification without allowing it to become a parallel authority.

### Exit Criteria

- Operational code and contracts remain authoritative only in the workspace.
- zo.space can host temporary preview builds for audit and review without becoming a second source of truth.
- Approved preview changes can be expressed as a concrete diff against workspace files before persistence.
- Manual zo.space experimentation is explicitly treated as scratch state unless promoted through the workspace-first flow.
