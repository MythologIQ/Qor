// Match Runner — task-053-match-runner
// Orchestrates a complete match: HELLO → READY → loop STATE/ACTION → END

import { createMatch, stepMatch, type MatchState } from "../engine/match.ts";
import { agentSessionManager } from "../gateway/session.ts";
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

/**
 * Simple random agent for dry-run testing.
 * In production, replace with actual agent sessions.
 */
function randomAgent(state: MatchState, side: "A" | "B"): AgentAction {
  const myUnits = state.units.filter((u) => u.owner === side);
  if (myUnits.length === 0) return { type: "pass" };
  const unit = myUnits[Math.floor(Math.random() * myUnits.length)];
  return {
    type: "move",
    unitId: unit.id,
    from: unit.position,
    to: { q: unit.position.q + 1, r: unit.position.r, s: unit.position.s - 1 },
  };
}

/**
 * Send HELLO to both agent sessions.
 */
async function sendHello(
  sessionA: string,
  sessionB: string,
  matchId: string,
  seed: string
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

  eventBus.publish(sessionA, frame);
  eventBus.publish(sessionB, frameB);

  agentSessionManager.transition(sessionA, "connected");
  agentSessionManager.transition(sessionB, "connected");
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
  sessionB: string
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

  eventBus.publish(sessionA, stateFrame);
  eventBus.publish(sessionB, stateFrameB);

  // Use random agents for now; real impl reads ActionFrames from agent sessions
  const actionA = randomAgent(state, "A");
  const actionB = randomAgent(state, "B");

  agentSessionManager.recordAction(sessionA, 0);
  agentSessionManager.recordAction(sessionB, 0);

  return [actionA, actionB];
}

/**
 * Publish victory END frames to both agents.
 */
function publishEnd(
  sessionA: string,
  sessionB: string,
  winner: "A" | "B" | null,
  metrics: MatchRunnerMetrics
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

  eventBus.publish(sessionA, endA);
  eventBus.publish(sessionB, endB);
}

/**
 * Run a complete match between two agent sessions.
 * - Sends HELLO to both agents
 * - Waits for READY
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
  }
): Promise<MatchRunnerMetrics> {
  const bus = eventBusInstance ?? eventBus;
  const matchId = sessionA.split(":")[0] ?? "match";

  const startMs = Date.now();
  let totalTurns = 0;
  let actionsA = 0;
  let actionsB = 0;
  let invalidActions = 0;
  let winner: "A" | "B" | null = null;

  // Initialize match state
  const state = createMatch(seed, sessionA, sessionB);

  // Phase 1: send HELLO to both
  await sendHello(sessionA, sessionB, matchId, seed);

  // Phase 2: wait for READY
  const ready = await waitReady(sessionA, sessionB);
  if (!ready) {
    // Timeout: forfeit both sides
    agentSessionManager.transition(sessionA, "forfeit");
    agentSessionManager.transition(sessionB, "forfeit");
    return {
      totalTurns: 0,
      winner: null,
      durationMs: Date.now() - startMs,
      actionsA: 0,
      actionsB: 0,
      invalidActions: 0,
    };
  }

  agentSessionManager.transition(sessionA, "playing");
  agentSessionManager.transition(sessionB, "playing");

  // Phase 3: main loop
  const TURN_CAP = 150;
  let loopState = state;
  let loopEnded = false;

  while (!loopEnded && totalTurns < TURN_CAP) {
    totalTurns++;

    // Send STATE and collect ACTIONs
    const [actionA, actionB] = await sendStateAndCollectActions(
      loopState,
      sessionA,
      sessionB
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
        const d = victoryEvent.data as { winner?: "A" | "B" | null };
        winner = d.winner ?? null;
      }
    }

    // Publish turn_advanced event
    bus.publish(sessionA, { type: "turn_advanced", turn: totalTurns, data: null } as EventFrame);
    bus.publish(sessionB, { type: "turn_advanced", turn: totalTurns, data: null } as EventFrame);

    // Record metrics
    if (metricsBus) {
      metricsBus.recordTurn(totalTurns, actionA, actionB);
    }
  }

  // Phase 4: END
  const finalMetrics: MatchRunnerMetrics = {
    totalTurns,
    winner,
    durationMs: Date.now() - startMs,
    actionsA,
    actionsB,
    invalidActions,
  };

  publishEnd(sessionA, sessionB, winner, finalMetrics);

  agentSessionManager.transition(sessionA, winner === "A" ? "ended" : "forfeit");
  agentSessionManager.transition(sessionB, winner === "B" ? "ended" : "forfeit");

  if (metricsBus) {
    metricsBus.recordEnd(finalMetrics);
  }

  return finalMetrics;
}
