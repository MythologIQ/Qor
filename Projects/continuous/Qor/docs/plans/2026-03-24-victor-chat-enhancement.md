# Architecture Plan: Victor Chat Remediation & Enhancement

**Date**: 2026-03-24
**Risk Grade**: L2 (multi-route changes, new persistence layer)
**Status**: DRAFT

## Problem Statement

Victor Direct Chat has basic send/receive working but lacks durability, conversation management, and rendering quality expected of a primary communication interface.

## Scope

### Phase 1: Conversations API (Server Persistence)
New API route: `/api/victor/conversations`

**Storage**: JSON files at `/home/workspace/.victor/chats/{conv_id}.json`

**Schema per conversation file**:
```json
{
  "id": "con_xxx",
  "title": "Auto-generated or user-set",
  "created_at": 1711300000000,
  "updated_at": 1711300000000,
  "model": "byok:...",
  "mode": "chat|forge",
  "messages": [
    { "role": "user|victor", "content": "...", "timestamp": 1711300000000, "stance": null, "modelUsed": null }
  ],
  "forge_thoughts": []
}
```

**Endpoints** (method-routed within single API route):
- `GET ?action=list` → returns `[{id, title, updated_at, message_count, mode}]` sorted by recency
- `GET ?action=get&id=con_xxx` → returns full conversation
- `POST ?action=save` → upsert conversation (body = full conversation JSON)
- `POST ?action=rename&id=con_xxx` → body `{title}`
- `DELETE ?action=delete&id=con_xxx` → removes file
- Auth: same `X-Victor-Token` mechanism

### Phase 2: Hybrid Sync in Chat UI

**Write path** (fast):
1. Message sent → update React state → write localStorage immediately
2. After streaming completes → background POST to `/api/victor/conversations?action=save`
3. Debounce: save at most once per 2 seconds during rapid exchanges

**Read path** (durable):
1. On page load → read localStorage for instant render
2. Fetch server conversation list → merge (server wins on conflicts by `updated_at`)
3. If active `convId` exists, fetch server copy and reconcile

**Conflict resolution**: Server `updated_at` wins. localStorage is a cache, not source of truth.

### Phase 3: Conversation Sidebar

**Layout change**: Chat page becomes two-panel:
- Left sidebar (280px, collapsible on mobile): conversation list
- Right panel: existing chat view

**Sidebar features**:
- Conversation list sorted by recency
- Each item shows: title (auto-generated from first message), timestamp, message count, mode badge (Chat/Forge)
- "New Conversation" button at top
- Click to load conversation
- Right-click or kebab menu: Rename, Delete
- Search filter at top of list

### Phase 4: Markdown Rendering

Victor's responses contain `**bold**`, `###` headers, code blocks, lists.
Currently rendered as raw text via `whitespace-pre-wrap`.

**Fix**: Add a lightweight markdown renderer.
- Use a simple inline parser (no external deps — zo.space can't add packages)
- Handle: bold, italic, headers, code blocks, inline code, lists, links
- Style with existing color system (`C.text`, `C.primary`, etc.)

### Phase 5: Forge Validation & Polish

- Verify Void → Reveal flow end-to-end with server persistence
- Forge thoughts should persist per conversation
- Visual indicator when thoughts are being analyzed

## File Tree

```
Routes changed:
  /api/victor/conversations  (NEW — API)
  /api/victor/chat           (UNCHANGED)
  /victor/chat               (MODIFIED — sidebar, sync, markdown)

Server filesystem:
  /home/workspace/.victor/chats/   (NEW — conversation storage)
```

## Implementation Order

1. `/api/victor/conversations` API route
2. Hybrid sync hooks in chat page
3. Conversation sidebar UI
4. Markdown renderer
5. Forge persistence validation

## Risk Assessment

- **L2**: Multiple routes modified, new filesystem persistence
- **No breaking changes**: Existing chat functionality preserved; localStorage remains as cache
- **Storage growth**: JSON files ~2-10KB each; 1000 conversations ≈ 10MB — negligible
- **Auth**: Same token mechanism, no new attack surface

## Test Strategy

- API: curl tests for each endpoint (list, get, save, rename, delete)
- Auth: verify 401 without token
- Sync: verify localStorage → server round-trip
- Sidebar: visual verification of load, switch, rename, delete
- Markdown: verify bold, headers, code blocks, lists render correctly
- Forge: Void → Reveal with persistence across refresh
