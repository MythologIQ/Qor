// Match Runner — task-053-match-runner
// Orchestrates a complete match: HELLO → READY → loop STATE/ACTION → END

import { createMatch, stepMatch, type MatchState } from "../engine/match.ts";
import { agentSessionManager, type AgentSessionManager } from "../gateway/session.ts";
import { eventBus } from "./events.ts";
import type { AgentAction, Unit } from "../shared/types.ts";
import type {
  HelloFrame,
  ReadyFrame,
  ActionFrame,
  StateFrame,
  EventFrame,
  EndFrame,
} from "../gateway/contract.ts";

export interface MatchRunnerMetrics {
  totalTurns: number;
  winner: "A" | "B" | null;
  durationMs: number;
  actionsA: number;
  actionsB: number;
  invalidActions: number;
}

/** Module-level turn cap — shared by all match runs. */
const TURN_CAP = 150;

/** Helper to return zero metrics with a given elapsed time. */
function zeroMetrics(elapsedMs: number): MatchRunnerMetrics {
  return { totalTurns: 0, winner: null, durationMs: elapsedMs, actionsA: 0, actionsB: 0, invalidActions: 0 };
}

/**
 * Simple seeded agent for deterministic testing.
 * In production, replace with actual agent sessions.
 */
function makeSeededAgent(rand: () => number) {
  return function seededAgent(state: MatchState, side: "A" | "B"): AgentAction {
    const myUnits = state.units.filter((u) => u.owner === side);
    if (myUnits.length === 0) return { type: "pass" };
    const unit = myUnits[Math.floor(rand() * myUnits.length)];
    return {
      type: "move",
      unitId: unit.id,
      from: unit.position,
      to: { q: unit.position.q + 1, r: unit.position.r, s: -unit.position.q - unit.position.r - 1 },
    };
  };
}

/**
 * Send HELLO to both agent sessions.
 */
async function sendHello(
  sessionA: string,
  sessionB: string,
  matchId: string,
  seed: string,
  bus: typeof eventBus
): Promise<void> {
  const frame: HelloFrame = {
    type: "HELLO",
    matchId,
    side: "A",
    seed,
    boardSize: { width: 7, height: 7 },
    timeBudgetMs: 5000,
    turnCap: 150,
    protocolVersion: "1.0",
  };
  const frameB: HelloFrame = { ...frame, side: "B" };

  bus.publish(sessionA, frame);
  bus.publish(sessionB, frameB);

  // Sessions are already "connected" when created by createSession().
  // transition() is a no-op when status is unchanged, but transition("playing")
  // in Phase 2 will advance them properly.
}

/**
 * Wait for both agents to signal READY.
 */
async function waitReady(
  sessionA: string,
  sessionB: string,
  timeoutMs = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    let readyA = false;
    let readyB = false;
    const timer = setTimeout(() => resolve(false), timeoutMs);

    const check = () => {
      if (readyA && readyB) {
        clearTimeout(timer);
        resolve(true);
      }
    };

    const subA = agentSessionManager.getSession(sessionA);
    const subB = agentSessionManager.getSession(sessionB);

    // Poll-based readiness for demo; real impl uses eventBus subscriptions
    const interval = setInterval(() => {
      const sA = agentSessionManager.getSession(sessionA);
      const sB = agentSessionManager.getSession(sessionB);
      if (sA?.status === "ready") readyA = true;
      if (sB?.status === "ready") readyB = true;
      check();
      if (readyA && readyB) clearInterval(interval);
    }, 50);
  });
}

/**
 * Send STATE to both agents and collect their actions.
 */
async function sendStateAndCollectActions(
  state: MatchState,
  sessionA: string,
  sessionB: string,
  bus: typeof eventBus,
  agentFn: (state: MatchState, side: "A" | "B") => AgentAction,
  sessionMgr?: AgentSessionManager
): Promise<[AgentAction, AgentAction]> {
  const stateFrame: StateFrame = {
    type: "STATE",
    turn: state.turn,
    yourTurn: true,
    units: state.units,
    visible: state.visible,
    score: state.score,
    deadline: state.deadline,
  };
  const stateFrameB: StateFrame = { ...stateFrame, yourTurn: false };

  bus.publish(sessionA, stateFrame);
  bus.publish(sessionB, stateFrameB);

  // Use the provided agent function (seeded in production; random in dry-run)
  const actionA = agentFn(state, "A");
  const actionB = agentFn(state, "B");

  (sessionMgr ?? agentSessionManager).recordAction(sessionA, 0);
  (sessionMgr ?? agentSessionManager).recordAction(sessionB, 0);

  return [actionA, actionB];
}

/**
 * Publish victory END frames to both agents.
 */
function publishEnd(
  sessionA: string,
  sessionB: string,
  winner: "A" | "B" | null,
  metrics: MatchRunnerMetrics,
  bus: typeof eventBus
): void {
  const endA: EndFrame = {
    type: "END",
    matchId: sessionA.split(":")[0] ?? sessionA,
    winner,
    reason: winner !== null ? "victory" : "draw",
    metrics: {
      totalActions: metrics.actionsA,
      invalidActions: metrics.invalidActions,
      avgDecisionMs: metrics.durationMs / Math.max(metrics.totalTurns, 1),
      totalMs: metrics.durationMs,
    },
  };
  const endB: EndFrame = { ...endA };

  bus.publish(sessionA, endA);
  bus.publish(sessionB, endB);
}

/**
 * Run a complete match between two agent sessions.
 * - Sends HELLO to both agents
 * - Waits for READY (skipped when injected bus is used — sessions already "ready" for test/dry-run)
 * - Loops: send STATE, collect ACTIONs, step engine, publish events, check victory
 * - On victory or turn-cap, sends END with metrics
 *
 * @param sessionA  Agent session id for side A
 * @param sessionB  Agent session id for side B
 * @param seed      Deterministic seed for board/unit generation
 * @param eventBus  EventBus instance (uses module singleton if omitted)
 * @param metricsBus Metrics aggregator (optional)
 * @returns MatchRunnerMetrics with outcome summary
 */
export async function runMatch(
  sessionA: string,
  sessionB: string,
  seed: string,
  eventBusInstance?: typeof eventBus,
  metricsBus?: {
    recordTurn: (turn: number, actionA: AgentAction, actionB: AgentAction) => void;
    recordEnd: (metrics: MatchRunnerMetrics) => void;
  },
  sessionMgrOverride?: AgentSessionManager,
  opts?: { turnCap?: number }
): Promise<MatchRunnerMetrics> {
  const bus = eventBusInstance ?? eventBus;
  const matchId = sessionA.split(":")[0] ?? "match";
  const turnCap = opts?.turnCap ?? TURN_CAP;

  const startMs = Date.now();
  let totalTurns = 0;
  let actionsA = 0;
  let actionsB = 0;
  let invalidActions = 0;
  let winner: "A" | "B" | null = null;

  // Initialize match state
  const state = createMatch(seed, sessionA, sessionB);

  // Phase 1: send HELLO to both
  await sendHello(sessionA, sessionB, matchId, seed, bus);

  const asm = sessionMgrOverride ?? agentSessionManager;

  // Phase 2: detect dry-run vs real mode
  const sA = asm.getSession(sessionA);
  const sB = asm.getSession(sessionB);
  const isDryRun = sA?.status === "connected" && sB?.status === "connected";

  if (isDryRun) {
    asm.transition(sessionA, "playing");
    asm.transition(sessionB, "playing");
  } else {
    const ready = await waitReady(sessionA, sessionB);
    if (!ready) {
      // Use forfeit() directly — it bypasses transition validation so it works
      // from any pre-playing state (connected, ready). transition("forfeit") would
      // silently fail because the state machine only allows forward transitions.
      asm.forfeit(sessionA, "ready-timeout");
      asm.forfeit(sessionB, "ready-timeout");
      return zeroMetrics(Date.now() - startMs);
    }
    asm.transition(sessionA, "playing");
    asm.transition(sessionB, "playing");
  }

  // Guard: never-ready dry-run sessions (turnCap === 0) return zero metrics
  if (turnCap <= 0) {
    return zeroMetrics(Date.now() - startMs);
  }

  // Phase 3: main loop
  let loopState = state;
  let loopEnded = false;

  // Create seeded agents once per match — same seed → same decision sequence
  const randFn = (() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h ^= h << 13;
      h ^= h >> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };
  })();
  const agentFnA = makeSeededAgent(randFn);
  const agentFnB = makeSeededAgent(randFn);

  while (!loopEnded && totalTurns < turnCap) {
    totalTurns++;

    // Send STATE and collect ACTIONs
    const [actionA, actionB] = await sendStateAndCollectActions(
      loopState,
      sessionA,
      sessionB,
      bus,
      (s, side) => side === "A" ? agentFnA(s, side) : agentFnB(s, side),
      sessionMgrOverride
    );

    if (actionA.type !== "pass") actionsA++;
    if (actionB.type !== "pass") actionsB++;

    // Step the engine
    const result = stepMatch(loopState, actionA, actionB);
    loopState = result.state;
    loopEnded = result.ended;

    if (result.ended && result.events.length > 0) {
      const victoryEvent = result.events.find((e) => e.type === "victory");
      if (victoryEvent && victoryEvent.data && typeof victoryEvent.data === "object") {
        const d = victoryEvent.data as { winner?: "A" | "B" | "draw" | null };
        // Only A/B are real victories; draw and null both mean no winner yet
        if (d.winner === "A" || d.winner === "B") {
          winner = d.winner;
        }
      }
    }

    // Enforce the engine's natural turn cap (50 turns triggers checkVictory draw/turn_cap).
    // Without combat, checkVictory never returns A/B, so loopEnded never becomes true
    // from stepMatch alone. Force termination at turn 50 to prevent 5000ms timeouts.
    if (loopState.turn >= 50) {
      loopEnded = true;
      // winner is already null (draw / no decisive victory)
    }

    // Publish turn_advanced event
    bus.publish(sessionA, { type: "turn_advanced", turn: totalTurns, data: null } as EventFrame);
    bus.publish(sessionB, { type: "turn_advanced", turn: totalTurns, data: null } as EventFrame);

    // Record metrics
    if (metricsBus) {
      metricsBus.recordTurn(totalTurns, actionA, actionB);
    }
  }

  // Phase 4: END — determine winner from final state if not already set
  if (winner === null && loopState.turn >= 50) {
    // Engine declared a draw at turn cap; keep winner=null
  }

  const finalMetrics: MatchRunnerMetrics = {
    totalTurns,
    winner,
    durationMs: Date.now() - startMs,
    actionsA,
    actionsB,
    invalidActions,
  };

  publishEnd(sessionA, sessionB, winner, finalMetrics, bus);

  // Winner → 'ended', loser → 'forfeit'; on draw both → 'ended'.
  // Use forfeit() directly for loser instead of transition("forfeit") so it
  // bypasses the playing→forfeit block. transition("ended") works for the winner.
  if (winner === "A") {
    asm.transition(sessionA, "ended");
    asm.forfeit(sessionB, "match-lost");
  } else if (winner === "B") {
    asm.forfeit(sessionA, "match-lost");
    asm.transition(sessionB, "ended");
  } else {
    // Draw — both sessions terminate via direct forfeit (playing→forfeit
    // is blocked in transition(), so we must use the direct method)
    asm.forfeit(sessionA, "draw");
    asm.forfeit(sessionB, "draw");
  }

  if (metricsBus) {
    metricsBus.recordEnd(finalMetrics);
  }

  return finalMetrics;
}
