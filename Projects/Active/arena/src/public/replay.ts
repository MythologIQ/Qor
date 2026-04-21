/**
 * Replay scrubber — step through match events one at a time.
 * Deterministic: same events always produce identical state sequence.
 */
import type { MatchEvent, MatchState } from "../shared/types.ts";

/**
 * Minimal initial state used as the replay starting point.
 * Subdivisions and fog are reflected in the events; this is the
 * board topology that the engine builds before any events fire.
 */
export interface ReplayState {
  /** Board cells keyed by encoded cube coord string. */
  cells: Map<string, { terrain: string; unit: null }>;
  /** Active units on the board. */
  units: Map<string, { owner: "A" | "B"; strength: number; position: { q: number; r: number; s: number } }>;
  /** Current turn number (1-indexed). */
  turn: number;
  /** Current player to act (A or B). */
  currentPlayer: "A" | "B";
  /** Whether the match has concluded. */
  concluded: boolean;
  /** Winner designation if concluded. */
  winner: "A" | "B" | null;
}

/** Seedable replay machine. */
export class Replay {
  private events: MatchEvent[] = [];
  private index = 0;
  private state: ReplayState;

  constructor(initialState: ReplayState) {
    this.state = deepCopyState(initialState);
  }

  /**
   * Load an ordered sequence of match events.
   * Resets index to 0 before loading.
   */
  load(events: MatchEvent[]): void {
    this.events = events ?? [];
    this.index = 0;
  }

  /**
   * Advance one event and return the resulting state snapshot.
   * Returns null when there are no more events.
   */
  step(): ReplayState | null {
    if (this.index >= this.events.length) return null;
    const event = this.events[this.index++];
    this.apply(event);
    return deepCopyState(this.state);
  }

  /**
   * Reset index to 0 without re-loading events.
   */
  reset(): void {
    this.index = 0;
  }

  /** Current 0-based event cursor position. */
  cursor(): number {
    return this.index;
  }

  /** Total events loaded. */
  length(): number {
    return this.events.length;
  }

  // ─── private ───────────────────────────────────────────────────────────────

  private apply(event: MatchEvent): void {
    switch (event.type) {
      case "spawn":
        this.state.units.set(event.unitId, {
          owner: event.owner,
          strength: event.strength,
          position: { q: event.q, r: event.r, s: -event.q - event.r },
        });
        break;

      case "move": {
        const unit = this.state.units.get(event.unitId);
        if (unit) {
          unit.position = { q: event.toQ, r: event.toR, s: -event.toQ - event.toR };
        }
        break;
      }

      case "attack": {
        const target = this.state.units.get(event.targetId);
        if (target) {
          target.strength -= event.damage;
          if (target.strength <= 0) {
            this.state.units.delete(event.targetId);
          }
        }
        const attacker = this.state.units.get(event.unitId);
        if (attacker) {
          attacker.strength -= event.recoil;
          if (attacker.strength <= 0) {
            this.state.units.delete(event.unitId);
          }
        }
        break;
      }

      case "turn_end":
        this.state.currentPlayer = this.state.currentPlayer === "A" ? "B" : "A";
        if (this.state.currentPlayer === "A") {
          this.state.turn += 1;
        }
        break;

      case "concluded":
        this.state.concluded = true;
        this.state.winner = event.winner ?? null;
        break;

      case "pass":
        // No state mutation — pass is a no-op.
        break;

      default:
        // Unknown event types are silently ignored to keep replay stable.
        break;
    }
  }
}

/** Deep-copy a ReplayState so exposed snapshots are immutable. */
function deepCopyState(src: ReplayState): ReplayState {
  return {
    cells: new Map(src.cells),
    units: new Map(
      [...src.units.entries()].map(([k, v]) => [
        k,
        { ...v, position: { ...v.position } },
      ])
    ),
    turn: src.turn,
    currentPlayer: src.currentPlayer,
    concluded: src.concluded,
    winner: src.winner,
  };
}