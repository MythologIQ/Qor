import type { SpectatorSnapshot, AgentSnapshot } from "../orchestrator/match-runner.ts";
import type {
  PublicProjectionInput,
  PublicAgentSnapshot,
  PublicBoardCell,
  PublicBoardUnit,
  PublicFeedEntry,
} from "../shared/public-match.ts";
import type { EngineEvent, HexCell } from "../shared/types.ts";

function toPublicCell(cell: HexCell): PublicBoardCell {
  return {
    q: cell.position.q,
    r: cell.position.r,
    s: cell.position.s || 0,
    terrain: cell.terrain,
    controlledBy: cell.controlledBy ?? null,
  };
}

function toPublicUnit(unit: { id: string; owner: "A" | "B"; position: { q: number; r: number; s: number }; hp: number; strength: number; type: string; facing?: string }): PublicBoardUnit {
  return {
    id: unit.id,
    side: unit.owner,
    q: unit.position.q,
    r: unit.position.r,
    s: unit.position.s || 0,
    hp: unit.hp,
    strength: unit.strength,
    type: unit.type,
    facing: unit.facing,
  };
}

function toFeedKind(eventType: string): PublicFeedEntry["kind"] {
  if (eventType === "unit_attacked" || eventType === "unit_destroyed") return "attack";
  if (eventType === "territory_claimed") return "claim";
  if (eventType === "unit_moved") return "move";
  return "system";
}

function toAgentSide(side: "A" | "B", snapshot: AgentSnapshot, territory: number, controlShare: number): PublicAgentSnapshot {
  return {
    id: `agent-${side}`,
    side,
    operator: snapshot.operator,
    modelId: snapshot.modelId,
    status: "active",
    totalMs: snapshot.totalMs,
    totalActions: snapshot.totalActions,
    invalidCount: snapshot.invalidCount,
  };
}

export function adaptSpectatorSnapshot(snapshot: SpectatorSnapshot): PublicProjectionInput {
  const cells = snapshot.state.visible.map(toPublicCell);
  const units = snapshot.state.units.map(toPublicUnit);

  const territories = { A: 0, B: 0 };
  for (const cell of cells) {
    if (cell.controlledBy === "A") territories.A++;
    else if (cell.controlledBy === "B") territories.B++;
  }

  const total = territories.A + territories.B;
  const pressure = total > 0 ? Math.round(Math.abs(territories.A - territories.B) / cells.length * 10000) / 100 : 0;

  const agents = [
    toAgentSide("A", snapshot.agents.A, territories.A, 0),
    toAgentSide("B", snapshot.agents.B, territories.B, 0),
  ];

  const feed: PublicFeedEntry[] = snapshot.events.map((event, idx) => ({
    round: snapshot.round,
    side: (event.payload?.agent as "A" | "B") ?? "neutral",
    kind: toFeedKind(event.type),
    headline: event.type.replaceAll("_", " "),
    detail: JSON.stringify(event.payload),
    timestamp: event.timestamp || idx,
  }));

  const latest = snapshot.events.at(-1);
  const headline = latest ? `Round ${snapshot.round}: ${latest.type.replaceAll("_", " ")}` : "Awaiting first action.";
  const featuredEvent = latest ? JSON.stringify(latest.payload) : "No events yet.";

  return {
    matchId: snapshot.matchId,
    mode: "live",
    round: snapshot.round,
    roundCap: snapshot.state.roundCap,
    phase: snapshot.state.turn === 0 ? "Awaiting Actions" : "Live Feed",
    pressure,
    headline,
    featuredEvent,
    board: cells,
    units,
    territories,
    agents,
    feed,
  };
}
