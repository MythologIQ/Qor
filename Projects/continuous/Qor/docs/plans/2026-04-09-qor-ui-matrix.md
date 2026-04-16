# Plan: QOR UI Matrix and Decision Ruleset

**Version**: 1.0  
**Date**: 2026-04-09  
**Status**: Draft  
**Chain**: QOR internal + mobile UI rebuild  
**Scope**: Internal routes and mobile routes only. Showcase excluded.

---

## Purpose

This document defines the decision rules and UI matrix for the QOR rebuild. It exists to stop page construction from drifting into component-first design. Every route must justify its structure by the question it answers, the decision it supports, and the actionability of the data it shows.

The rebuild standard is:

- page job first
- user question second
- data entitlement third
- component selection last

If a component does not improve understanding or sharpen a decision, it does not belong.

---

## Decision Ruleset

## Rule 1: Every page must answer one primary question

Before any layout or component work, define:

1. What is the page for?
2. What should the operator know after using it?
3. What decision should become easier on this page?

If the page has multiple equal jobs, split the page or subordinate one job.

## Rule 2: Global shell responsibilities are fixed

The shell must not renegotiate its structure route by route.

- Global header:
  - owns system identity
  - includes QOR branding
  - includes current page identity
  - includes only global controls
- Left rail:
  - owns internal navigation
  - may surface a small number of immediate cross-system signals
  - must not become a dashboard
- Main pane:
  - owns page-specific understanding and task support
- Module-local subnav:
  - appears only when needed inside the module content region
  - must not duplicate global navigation

## Rule 3: Data must earn space

Data belongs on a page only if it does at least one of these:

- answers the page’s primary question
- explains why the current state exists
- exposes what intervention is needed
- clarifies what happens next

Data is noise when it is:

- merely interesting
- duplicated elsewhere on the page
- not connected to a judgment
- not connected to a next step

## Rule 4: Visualizations require cognitive justification

Use visualizations only when they outperform text or tables for the page’s job.

- Use lists for current work, recent events, blockers, and trace items
- Use tables for comparison, inspection, and portfolio review
- Use timelines for sequence, causality, and execution history
- Use graphs only for relationship structure and dependency understanding
- Use stat blocks only when the number changes operator judgment

Charts without operational consequence are decorative and should be removed.

## Rule 5: Actionability is interpretive, not button-heavy

Actionable data does not mean every panel needs a button. It means the operator can clearly infer:

- whether the state is healthy or not
- what is causing the current state
- what route or system needs attention next
- what evidence supports that conclusion

## Rule 6: Density follows task criticality

- Fast triage pages should be sparse and high-signal
- Forensic pages may be dense, but only if the density improves traceability
- Planning pages may be layered, but only if hierarchy is explicit

Compression is not clarity.

## Rule 7: Mobile is triage-first

Mobile routes are not desktop routes squeezed smaller.

- mobile answers urgency
- desktop answers depth

Mobile should foreground:

- current state
- primary alert
- next action
- one-level drill-in

Anything requiring comparison across many objects should be deferred or collapsed.

## Rule 8: Component entitlement is explicit

For each route, every component must be labeled:

- Required
- Optional
- Forbidden

Optional means the page still works without it.
Forbidden means it actively weakens the page’s job.

---

## Global Shell Matrix

| Shell Area | Job | Required | Optional | Forbidden |
|---|---|---|---|---|
| Global header | System identity and route identity | QOR mark, route title, concise route subtitle, global controls only | environment/state pill, current module marker | local module actions, duplicated nav trees, dashboards, long stats |
| Left rail | Stable internal navigation | QOR route tree, active route state, small cross-system attention signal cluster | collapse control, saved views | page-specific metrics boards, large cards, duplicate content sections |
| Main content | Route-specific understanding | route question, decision-support components, evidence-backed data | secondary context panels | duplicated shell identity, decorative charts, unrelated module summaries |
| Module subnav | Local navigation inside a module | current sub-route links when module has multiple internal views | section anchor links | global nav duplication, unrelated module links |

---

## Internal Route Matrix

| Route | Primary question | Required | Optional | Forbidden |
|---|---|---|---|---|
| `/qor` | What needs attention across the whole system right now? | cross-module attention stack, next-action handoff, highest-value system summary, direct route pivots | compact trust snapshot, recent critical flow | full dashboards for each module, large duplicate stats grids, decorative “overview” panels |
| `/qor/victor` | What is Victor doing, what should he do next, and what blocks execution? | execution state, current/next task, blocker panel, cadence/runtime state, execution lineage | compact control surface, recent completions | generic governance summaries, Forge portfolio panels, large memory digests |
| `/qor/victor/governance` | Are Victor’s actions compliant with policy and thresholds? | decision outcomes, policy state, approval/escalation pressure, reasons for denials, threshold visibility | filtered views, trust-stage explainer | chat, broad system overview, decorative trend cards without policy consequence |
| `/qor/victor/audit` | What happened, in what order, and with what evidence? | chronological audit stream, event payload access, evidence linkage, filters for forensic slicing | export/copy affordances, correlation views | KPI-first layout, decorative graphs, module marketing copy |
| `/qor/victor/chat` | What is the current operator-to-executor exchange, and what execution context matters for that exchange? | large conversation pane, concise execution context bar, message history, current task context | collapsible metadata rail, recent related tasks | side dashboards, large governance panels, broad module cards |
| `/qor/qora` | What is Qora perceiving, validating, and contributing right now? | connection health, ingest/ledger state, recent meaningful signals, provenance confidence | source breakdown, issue drill-in | generic module stats, unrelated Victor execution data, showcase-style presentation |
| `/qor/forge` | What is Forge trying to build now, and is planning turning into execution? | active phase, queued/claimed work, planning health, execution handoff status, next build move | compact roadmap preview, risk preview | full portfolio table, unrelated governance dashboards, decorative constellation embed |
| `/qor/forge/projects` | Which projects exist, what phase are they in, and where is drift forming? | project list/table, phase state, subproject hierarchy, drift markers, sortable status columns | filters, grouping, quick summaries | giant hero panels, unrelated execution feeds, decorative charts |
| `/qor/forge/roadmap` | What sequence makes the strategy coherent? | phase sequence, dependency logic, current phase anchor, gating conditions, near-future transitions | milestone compression, phase notes | project cards, unrelated system stats, ornamental charts |
| `/qor/forge/risks` | What can derail delivery, and what needs intervention now? | active risks, severity, owner/source, affected phase/project, mitigation state | trend grouping, risk aging | broad portfolio summaries, unrelated task lists, decorative visuals |
| `/qor/forge/constellation` | How do concepts, systems, and dependencies relate structurally? | concept graph, focused node inspection, relationship visibility, attached roadmap/task metadata | search, layer filters, concept grouping controls | status dashboard behavior, unrelated KPI grids, non-structural charts |
| `/qor/continuum` | Is the intelligence substrate grounded, live, and trustworthy enough to use? | substrate health, memory/graph status, ingest flow, retrieval integrity, current failure points | compact layer summaries, recent write/read events | unrelated module planning cards, decorative memory counts with no implication |

---

## Mobile Route Matrix

| Route | Primary question | Required | Optional | Forbidden |
|---|---|---|---|---|
| `/mobile/qor` | If I am away from the desk, what one thing needs my attention now? | top alert, next action, system health summary, direct drill-in links | compact module chips, last meaningful change | dense dashboards, multi-panel comparisons, decorative graphs |
| `/mobile/qor/victor` | Is Victor moving, stalled, or blocked right now? | current status, active task, blocker state, one next action | recent completion, cadence badge | long audit feed, governance deep dive, multi-column layouts |
| `/mobile/qor/qora` | Is Qora connected and producing usable signal? | connection state, latest meaningful signal, confidence/provenance state | source badge, one drill-in action | long ledgers, dense filters, desktop-style dashboards |
| `/mobile/qor/forge` | Is Forge feeding execution with clear work right now? | active phase, next queued task, build health, one route to deeper review | risk badge, roadmap pointer | portfolio tables, full constellation, dense summary boards |
| `/mobile/qor/continuum` | Is Continuum alive and safe to trust at a glance? | service health, latest memory/retrieval signal, current failure indicator | small layer summary, one deep-link | full graph views, diagnostic overload, large multi-section panels |

---

## Component Entitlement Rules

## Header entitlement

Required on every internal route:

- QOR in the global header
- current route title
- one-sentence route purpose or state subtitle

Forbidden in the global header:

- long metric clusters
- module-local tabs unless the entire header pattern is shell-owned
- duplicated breadcrumbs plus duplicated nav plus duplicated title

## Navigation entitlement

Required:

- one stable global navigation system
- one active-state indicator

Forbidden:

- hamburger plus top pills plus side nav all trying to do the same job
- repeating Victor/Qora/Forge links in multiple regions without different purpose

## KPI entitlement

A KPI is allowed only if its change alters operator judgment.

Allowed examples:

- blocked tasks
- approval pressure
- queue depth
- failing dependency count

Disallowed examples:

- large counts with no threshold meaning
- repeated totals already visible in lists below

## Feed entitlement

Feeds are allowed only when recency matters.

Required for:

- audit
- recent execution flow
- recent intake/provenance events

Forbidden for:

- portfolio inspection
- concept maps
- route headers

## Graph entitlement

Graph/canvas views are allowed only when structure is the page job.

Allowed for:

- constellation
- dependency understanding
- concept grouping

Forbidden for:

- generic status display
- “make the page feel alive”

---

## Rebuild Sequence

1. Rebuild the shell contract first.
   - global header
   - left rail
   - content frame
2. Rebuild highest-value operational routes next.
   - `/qor`
   - `/qor/victor`
   - `/qor/forge`
   - `/mobile/qor`
3. Rebuild specialist routes after the shell and primary operational routes are stable.
   - governance
   - audit
   - roadmap
   - risks
   - continuum
4. Rebuild structural visualization last.
   - constellation only after the component contract and data contract are stable

---

## Build Gate Checklist

No route proceeds to implementation until all answers are explicit:

1. What is the route’s primary question?
2. What should the operator know after using it?
3. What decision does it support?
4. Which data is required to answer that question?
5. Which components are required, optional, and forbidden?
6. Why is each visualization justified?
7. What is the mobile version’s reduced job?

If any answer is vague, the route is not ready to build.
