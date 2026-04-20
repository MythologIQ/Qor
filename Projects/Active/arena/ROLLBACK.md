# HEXAWARS Rollback Plan

## Overview
This document describes the procedures required to roll back the HEXAWARS system to a previous known-good state in the event of a catastrophic failure.

---

## 1. Service Shutdown

### Continuum API
```bash
# Find and kill the continuum-api service
curl -X DELETE http://localhost:3100/api/v1/services/continuum-api
# Or via Zo Computer:
# Settings > Services > continuum-api > Delete
```

### Neo4j Database
```bash
# Stop the Neo4j service
pkill -f neo4j
# Or via Zo Computer:
# Settings > Services > neo4j > Stop
```

---

## 2. Space Route Cleanup

### Remove All zo.space Routes
```bash
# List all routes first
curl -H "Authorization: Bearer $ZO_API_KEY" https://api.zo.computer/zo/spaces/routes

# Delete each route individually
curl -X DELETE -H "Authorization: Bearer $ZO_API_KEY" https://api.zo.computer/zo/spaces/routes/<route_id>
```

### Reset Space Settings
```bash
# Via Zo Computer UI: Settings > Sites > Reset to defaults
```

---

## 3. Ledger Revert Pointer

### Reset Builder Pointer
```bash
# Determine the last known-good tick number (N)
# Edit builder-pointer.txt to contain N-1
echo $((N-1)) > /home/workspace/.continuum/queues/state/builder-pointer.txt
```

### Revert META_LEDGER.md
```bash
cd /home/workspace/Projects/continuous/Qor
# Identify the last good commit hash from git log
git log --oneline -n 20 docs/META_LEDGER.md
# Checkout the previous version
git checkout <previous-commit> -- docs/META_LEDGER.md
# Commit the revert
git add docs/META_LEDGER.md
git commit -m "revert: restore META_LEDGER to previous known-good state"
```

---

## 4. Shadow Genome Sweep

### Clear Active Failure Entries
```bash
cd /home/workspace/Projects/continuous/Qor
# Remove all Builder Failures entries from SHADOW_GENOME.md
# that are not explicitly marked RESOLVED
# Keep only RESOLVED entries and prepend "Cleared by rollback"
```

### Reset Sentinel State
```bash
# Delete the sentinel health state cache
rm -f /home/workspace/.continuum/memory/victor/*.json
# Reset review tier pointer if applicable
```

---

## 5. Kill Switch

The primary kill switch is activated by touching the HALT file:

```bash
touch /home/workspace/.continuum/queues/state/HALT
```

This file causes the builder agent to exit silently on its next tick without writing any logs or taking any actions.

**To reactivate after a rollback:**
```bash
rm /home/workspace/.continuum/queues/state/HALT
```

---

## 6. Recovery Sequence

After a rollback, bring services back online in this order:

1. **Neo4j** — wait for full startup (~30s)
2. **Continuum API** — wait for health 200
3. **Builder agent** — verify pointer is at correct tick
4. **Review agent** — verify no stale entries in status.jsonl
5. **Victor heartbeat** — verify memory writes succeed

---

## 7. Emergency Contacts

| Role | Procedure |
|------|-----------|
| System Owner | Kevin Knapp (krknapp@gmail.com) |
| Zo Computer Support | https://support.zocomputer.com |
| GitHub Repository | MythologIQ/Qor |

---

## Revision History

| Date | Change |
|------|--------|
| 2026-04-18 | Initial rollback plan documented |
