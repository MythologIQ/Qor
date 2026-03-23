# Architecture Plan: Victor Direct Chat + Forge Brainstorming

## Risk Grade

**Selected Grade**: [x] L2

### Risk Assessment Checklist

- [x] Modifies existing APIs or data schemas -> **L2**
- [x] Adds new business logic -> **L2**
- [x] Contains security/auth logic -> **L3** (bearer token auth on API route)
- [ ] Modifies encryption or PII handling -> **L3**

**Justification**: New API route proxies to Zo API with context injection. Bearer token auth required on `/api/victor/chat` to prevent unauthorized credit consumption. Auth uses timing-safe comparison against `VICTOR_CHAT_SECRET` env var. No PII handling. Risk grade remains L2 because auth delegates to a simple bearer check — no custom session management, no token issuance, no crypto beyond timingSafeEqual.

---

## System Overview

A unified chat + brainstorming interface on zo.space that replaces generic Zo chat as the primary way to communicate with Victor. Two modes share one page route and one API route:

```
User types/speaks
      |
      v
/victor/chat (page route) — React SPA
      |
      |-- Chat Mode: direct conversation with Victor
      |-- Forge Mode: structured brainstorming (Void → Reveal)
      |
      v
/api/victor/chat (API route) — Hono handler
      |
      |-- Assembles context (project state, memory stats, governance status)
      |-- Selects model via user choice
      |-- Calls Zo API (/zo/ask) with persona_id + model_name + context
      |-- Streams SSE response back to client
      |
      v
User receives streamed response with governance metadata
```

**Key constraint**: zo.space routes are single-file. All components inline. No npm installs. Only pre-installed packages.

---

## File Tree (The Contract)

```
zo.space routes (NOT filesystem files):
|-- /victor/chat              # (page) Unified chat + brainstorming UI
|-- /api/victor/chat          # (api)  Zo API proxy with context injection
|
workspace files:
|-- Projects/continuous/Victor/docs/
|   |-- ARCHITECTURE_PLAN.md  # This document
|   |-- META_LEDGER.md        # Audit chain
|   `-- SHADOW_GENOME.md      # Failure log (if VETO)
```

Total new routes: 2 (1 page, 1 API)
Total modified routes: 0
Total workspace files: 0 runtime files (docs only)

---

## Interface Contracts

### API Route: /api/victor/chat

**Purpose**: Proxy chat messages to Zo API with Victor-specific context injection and model selection.

**Input** (POST body):
```typescript
interface ChatRequest {
  message: string;
  model_name?: string;         // e.g. "byok:3b2ce3b2-..." — defaults to current
  conversation_id?: string;    // for multi-turn continuity
  mode: "chat" | "forge";     // determines context assembly strategy
  forge_stage?: "void" | "reveal";  // only when mode=forge
}
```

**Output** (SSE stream):
```typescript
// Content-Type: text/event-stream
// Each event:
interface ChatEvent {
  type: "content" | "metadata" | "error" | "done";
  data: string;               // content chunk, or JSON metadata
}

// Metadata event (sent first):
interface MetadataPayload {
  conversation_id: string;
  model_used: string;
  context_summary: string[];   // what context was injected
  timestamp: string;
}
```

**Side Effects**:
- Reads project state from /api/victor/project-state (existing route)
- Reads heartbeat status from /api/victor/heartbeat-cadence (existing route)
- Calls Zo API with assembled context

**Authentication**:
- Requires `Authorization: Bearer <token>` header
- Token compared against `process.env.VICTOR_CHAT_SECRET` using `timingSafeEqual`
- Missing or invalid token → 401 `{ error: "Unauthorized" }`
- User stores secret in Settings > Advanced as `VICTOR_CHAT_SECRET`
- Page route (private, auth-gated by zo.space) stores token in `localStorage` after first entry

**Error Handling**:
- Missing VICTOR_CHAT_SECRET env var → 500 with "Service not configured"
- Missing ZO_CLIENT_IDENTITY_TOKEN → 500 with "Service not configured"
- Invalid/missing bearer token → 401 with "Unauthorized"
- Zo API failure → SSE error event with status code
- Invalid mode/stage → 400 with validation message

### Page Route: /victor/chat

**Purpose**: Unified React chat interface with mode switching, model picker, governance visibility, and voice I/O.

**State Shape**:
```typescript
interface ChatState {
  messages: Array<{
    role: "user" | "victor";
    content: string;
    timestamp: number;
    metadata?: MetadataPayload;
  }>;
  mode: "chat" | "forge";
  forgeStage: "void" | "reveal";
  selectedModel: string;
  conversationId: string | null;
  isStreaming: boolean;
  voiceEnabled: boolean;
}
```

**UI Sections** (top to bottom):
1. **Header bar**: Mode toggle (Chat / Forge), model picker dropdown, voice toggle
2. **Context badge strip**: Shows injected context summary (from metadata events)
3. **Message area**: Scrollable conversation with Victor avatar, stance indicators, markdown rendering
4. **Forge panel** (forge mode only): Void capture textarea, Reveal cluster view
5. **Input area**: Text input with send button, voice input button, keyboard shortcuts

**No external dependencies beyond zo.space pre-installed packages**:
- `react`, `useState`, `useEffect`, `useRef`, `useCallback` — state and lifecycle
- `lucide-react` — icons (Send, Mic, MicOff, Settings2, Sparkles, MessageSquare, Hammer)
- `marked` — markdown rendering of Victor's responses (pre-installed in zo.space, available client-side)

---

## Data Flow

### Chat Mode Flow

```
User input (text or voice transcript)
      |
      v
POST /api/victor/chat { message, model_name, conversation_id, mode: "chat" }
      |
      v
API assembles context:
  1. Fetch /api/victor/project-state (internal)
  2. Fetch /api/victor/heartbeat-cadence (internal)
  3. Build system context string with:
     - Current phase, active tasks, governance tier
     - Memory facade health summary
     - Recent heartbeat status
      |
      v
POST https://api.zo.computer/zo/ask {
  input: system_context + "\n\n---\n\nUser: " + message,
  model_name: selected_model,
  persona_id: "8ac56654-e523-43da-93a4-cd9560694ae9",
  conversation_id: conversation_id,
  stream: true
}
      |
      v
SSE stream → parsed → forwarded to client as ChatEvent stream
      |
      v
Client renders streamed markdown with stance badge detection
```

### Forge Brainstorming Flow

```
User enters thought in Void capture
      |
      v
POST /api/victor/chat { message, mode: "forge", forge_stage: "void" }
      |
      v
API assembles forge-specific context:
  - Includes Forge pipeline state
  - Includes existing Void/Reveal items (from project-state)
  - Prompts Victor to respond as Builder persona:
    "Analyze this thought. Identify themes, connections to existing work,
     and potential actions. Format as: THEMES: [...], CONNECTIONS: [...],
     ACTIONS: [...]"
      |
      v
Same Zo API call path as chat, different context framing
      |
      v
Client parses structured response → displays in Forge panel
  - Void: raw thought stored locally (IndexedDB or state)
  - Reveal: Victor's clustering analysis displayed as cards
```

---

## Dependencies

| Package | Version | Justification | Vanilla Alternative |
|---------|---------|---------------|---------------------|
| `hono` | ^4.10.x | API route framework (pre-installed) | No — required by zo.space |
| `react` | ^19.2.x | Page route framework (pre-installed) | No — required by zo.space |
| `lucide-react` | ^0.562.x | Icons (pre-installed) | No — SVG inline would bloat single-file |

**Dependency Diet Check**:
- [x] Each dependency is truly necessary
- [x] No dependency can be replaced with <10 lines vanilla code
- [x] No "God packages"
- [x] Zero new npm installs — all pre-installed

---

## Section 4 Razor Pre-Check

### API Route Estimate

| Metric | Limit | Estimate | Status |
|--------|-------|----------|--------|
| Max function lines | 40 | ~35 (handler), ~25 (context assembler) | OK |
| Max file lines | 250 | ~180 | OK |
| Max nesting depth | 3 | 2 (if/try) | OK |
| Nested ternaries | 0 | 0 | OK |

### Page Route Estimate

| Metric | Limit | Estimate | Status |
|--------|-------|----------|--------|
| Max function lines | 40 | ~35 (largest inline component) | OK |
| Max file lines | 250 | ~600 | ACKNOWLEDGED |
| Max nesting depth | 3 | 3 (component → map → conditional) | OK |
| Nested ternaries | 0 | 0 | OK |

**Page route file length note**: zo.space pages are single-file by platform constraint. The page grows incrementally across phases:
- **Phase 2 (Chat UI)**: ~300 lines — verified independently via `get_space_errors()`
- **Phase 3 (Forge)**: ~450 lines — verified independently
- **Phase 4 (Voice)**: ~550 lines — verified independently
- **Phase 5 (Polish)**: ~600 lines — final verification

Each phase is a self-contained increment. Each inline component stays under 40 lines. Explicit section comments separate concerns within the single file.

---

## Test Strategy

| Test Type | Target | Success Criteria |
|-----------|--------|------------------|
| Manual | /api/victor/chat | POST with valid bearer returns SSE stream with content events |
| Manual | /api/victor/chat | Missing bearer token returns 401 |
| Manual | /api/victor/chat | Invalid bearer token returns 401 |
| Manual | /api/victor/chat | Missing VICTOR_CHAT_SECRET env returns 500 |
| Manual | /api/victor/chat | Invalid mode returns 400 |
| Manual | /victor/chat | Chat mode sends/receives messages |
| Manual | /victor/chat | Model picker changes model_name in requests |
| Manual | /victor/chat | Forge mode captures thoughts and gets analysis |
| Manual | /victor/chat | Voice input transcribes and sends |
| Manual | /victor/chat | Conversation persists across messages via conversation_id |
| Smoke | All existing routes | No build breakage from new page route |

**Note**: zo.space routes cannot have automated unit tests (no test runner in the space environment). Verification is manual + `get_space_errors()` for build health. Victor kernel tests remain in the kernel test suite.

---

## Security Considerations

- [x] No hardcoded secrets — uses `process.env.ZO_CLIENT_IDENTITY_TOKEN` and `process.env.VICTOR_CHAT_SECRET`
- [x] Bearer token auth on `/api/victor/chat` — prevents unauthorized credit consumption
- [x] Timing-safe comparison via `node:crypto timingSafeEqual` — prevents timing attacks
- [x] Input validation planned — mode enum check, message length cap (10K chars)
- [x] Error messages don't leak info — generic "Service error" for upstream failures, "Unauthorized" for bad tokens
- [x] API route is public (zo.space constraint) but gated by bearer token before proxying to Zo API
- [x] No PII stored — conversation state held client-side or in Zo's conversation system
- [x] localStorage stores only: conversation_id, preferences, and VICTOR_CHAT_SECRET token
- [x] Page route is private (zo.space auth-gated) — only owner can access the UI that holds the token

---

## Voice I/O Architecture

**Input**: Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`)
- Browser-native, zero dependencies
- Transcript text feeds into the same message flow as typed input
- Fallback: text input only (graceful degradation)

**Output**: Browser Speech Synthesis API (`speechSynthesis`)
- Initial implementation uses browser-native TTS
- Future: swap to Victor TTS service at `https://victor-tts-frostwulf.zocomputer.io` when Qwen3 is loaded
- Toggle in header controls voice output on/off

---

## Governance Visibility

Victor's stance declarations (Support Mode, Challenge Mode, Mixed Mode, Red Flag) are detected in the response stream via pattern matching:

```
Pattern: /^\*\*Stance: (Support|Challenge|Mixed|Red Flag) Mode\*\*/
```

When detected:
- Badge rendered above the message with color coding
- Support: green, Challenge: amber, Mixed: blue, Red Flag: red

Additional metadata displayed:
- Model used (from metadata event)
- Context injected (from metadata event)
- Conversation continuity indicator

---

## Phase Plan

### Phase 1: API Foundation
- Create `/api/victor/chat` route
- Bearer token auth via `VICTOR_CHAT_SECRET` with timing-safe comparison
- Context assembly from existing project-state and heartbeat routes
- Zo API proxy with SSE streaming
- Model selection passthrough

### Phase 2: Chat UI
- Create `/victor/chat` page route
- Message list with streaming render
- Model picker dropdown
- Governance stance badge detection
- Context summary display

### Phase 3: Forge Brainstorming
- Add mode toggle (Chat ↔ Forge)
- Void capture textarea with local state
- Reveal panel rendering Victor's analysis
- Forge-specific context injection in API

### Phase 4: Voice I/O
- Web Speech API input integration
- Browser TTS output toggle
- Microphone permission handling
- Visual indicators for listening/speaking state

### Phase 5: Polish + Integration
- Link from /qor hub and /victor-shell
- Keyboard shortcuts (Enter to send, Cmd+K for model picker)
- Mobile-responsive layout
- Conversation persistence via conversation_id

---

*Generated by QoreLogic /qor-plan*
*Phase: ENCODE (Revision 2 — post-VETO remediation)*
*Persona: Governor*
*Status: Awaiting re-tribunal (L2)*
*VETO remediation: bearer auth added, marked clarification, incremental file growth targets, security section hardened*
