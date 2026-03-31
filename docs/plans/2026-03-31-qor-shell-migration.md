# Plan: QOR Shell Migration — victor-shell → /qor route tree

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | ForgeConstellation migrate or defer? | ✅ **Migrate** to `/qor/forge/constellation` |
| 2 | Qora operational sub-routes? | ✅ **Yes** — build live operational tabs |
| 3 | EvolveAI operational sub-routes? | ✅ **Yes** — build live operational tabs |

## Phase 1: Fix Broken + Shared Shell Foundation

### Affected Files

- `/qor/qora` — Fix `MIST_BLOBS` runtime error, restore rendering
- `/qor` — Upgrade to shared shell with cross-module nav, theme tokens, settings drawer

### Changes

**`/qor/qora` fix:**
- Read current code, locate `MIST_BLOBS` reference
- Either define the missing constant or remove the broken mist effect and replace with a working backlight animation
- Verify zero runtime errors

**`/qor` shared shell upgrade:**
- Extract color tokens into a shared `THEMES` constant (same 6 themes from victor-shell)
- Add localStorage persistence for theme selection
- Add a settings drawer toggle in the header (gear icon)
- Settings drawer exposes: theme picker, text scale
- Each child card (Victor/Qora/Forge/EvolveAI) links to its operational route
- Add a persistent sidebar or top-level tab bar with all 4 entities + overview
- Wrap content in a layout that child routes inherit via shared nav component

### Unit Tests

- Verify `/qor/qora` renders with 0 runtime errors (manual screenshot check)
- Verify `/qor` loads theme from localStorage and applies correct CSS variables

## Phase 2: Complete the victor-shell Feature Extraction

### Affected Files

- `/qor/victor` — Add CadenceSelector component inline
- `/qor/victor/governance` — Add FilterMenu for governance events
- `/qor/forge/mindmap` — Upgrade from bar charts to canvas constellation OR create `/qor/forge/constellation`

### Changes

**CadenceSelector on `/qor/victor`:**
- Extract cadence dropdown logic from victor-shell's `CadenceSelector` component
- Inline it into the Victor status sidebar as a dropdown next to the "Cadence" metric
- Calls `PUT /api/victor/heartbeat-cadence` on change
- Shows confirmation toast inline

**Feed filter on `/qor/victor/governance`:**
- Add a filter row below the header: `All | Governance | Completed | Blocked`
- Filters the activity feed by `concern` field

**ForgeConstellation decision:**
- If migrating: Create `/qor/forge/constellation` with the full canvas mindmap (physics, particles, 3D tilt, node hover, search/filter)
- If deferring: Add a "Constellation (Coming Soon)" placeholder link on `/qor/forge`
- Update `/qor/forge/mindmap` nav to include constellation link

### Unit Tests

- CadenceSelector: Verify dropdown renders, fires PUT on select, updates displayed cadence
- Feed filter: Verify each filter type reduces visible events correctly
- Constellation (if built): Verify canvas renders with nodes from `/api/victor/project-state`

## Phase 3: Delete victor-shell + Final Wire

### Affected Files

- `/victor-shell` — DELETE
- All `/qor/*` routes — Remove "Legacy Shell" nav links
- `/qor/victor` — Remove link to `/victor/chat` (now redundant)

### Changes

- Audit every route for remaining references to `/victor-shell` or `/victor/chat`
- Replace any "Legacy Shell" links with the canonical `/qor/` equivalents
- Delete `/victor-shell` route
- Verify all 4 entity dashboards + all sub-routes render clean with zero errors

### Unit Tests

- Grep all routes for `victor-shell` — should return 0 results
- Screenshot each route at desktop and mobile viewport — verify no broken links
- Full `get_space_errors()` check — 0 runtime errors

## What This Plan Does NOT Include

- Mobile-specific route creation (separate plan)
- Qora operational sub-routes (depends on API capabilities — see Open Questions)
- EvolveAI operational sub-routes (same dependency)
- Governance ledger cleanup (separate concern)
- New features beyond what victor-shell already provides

## Substantiation — 2026-03-31

**Verdict**: ✅ ALL PASS (12/12 routes)

| Route | Status | Notes |
|-------|--------|-------|
| `/qor` | ✅ 200 | Theme system + settings drawer + mobile nav |
| `/qor/victor` | ✅ 200 | Status + chat + cadence selector |
| `/qor/victor/governance` | ✅ 200 | Tier 3 tracking + criteria |
| `/qor/victor/audit` | ✅ 200 | Run feed + payload copy |
| `/qor/forge` | ✅ 200 | Forge shell with sub-tabs |
| `/qor/forge/constellation` | ✅ 200 | Canvas mindmap + physics + 3D |
| `/qor/forge/mindmap` | ✅ 200 | Data-driven mindmap |
| `/qor/forge/projects` | ✅ 200 | Project list |
| `/qor/forge/roadmap` | ✅ 200 | Roadmap + milestones |
| `/qor/forge/risks` | ✅ 200 | Risk register |
| `/qor/qora` | ✅ 200 | Qora operational surface |
| `API /api/victor/project-state` | ✅ 200 | Live data |

**Remaining**: Delete `/victor-shell` after user confirmation.
