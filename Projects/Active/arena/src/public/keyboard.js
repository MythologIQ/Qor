/**
 * keyboard.js — HexaWars Replay Keyboard Navigation
 * Arrow keys step through match replay events.
 * Left/Right: previous/next turn
 * Home/End: first/last turn
 */
export const REPLAY_STEP_SIZE = 1;

export class ReplayKeyboard {
  constructor({ onStep, getState }) {
    this.onStep = onStep;
    this.getState = getState;
    this.enabled = false;
    this._bound = this._handle.bind(this);
  }

  enable() {
    if (this.enabled) return;
    window.addEventListener('keydown', this._bound);
    this.enabled = true;
  }

  disable() {
    if (!this.enabled) return;
    window.removeEventListener('keydown', this._bound);
    this.enabled = false;
  }

  _handle(e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const state = this.getState();
    if (!state) return;

    const { currentTurn = 0, totalTurns = 0 } = state;
    let next = currentTurn;

    switch (e.key) {
      case 'ArrowLeft':
        next = Math.max(0, currentTurn - REPLAY_STEP_SIZE);
        break;
      case 'ArrowRight':
        next = Math.min(totalTurns, currentTurn + REPLAY_STEP_SIZE);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = totalTurns;
        break;
    }

    if (next !== currentTurn) {
      e.preventDefault();
      this.onStep(next);
    }
  }
}

/**
 * Install keyboard navigation on an arena spectator connection.
 * @param {object} arena - arena.js connection object (or mock with disconnect)
 * @param {number} totalTurns - total turn count for the match
 */
export function installReplayKeyboard(arena, totalTurns = 50) {
  let currentTurn = 0;

  const kb = new ReplayKeyboard({
    onStep(turn) {
      currentTurn = turn;
      // Dispatch a custom event so arena.js can handle it
      window.dispatchEvent(new CustomEvent('replay-step', { detail: { turn } }));
    },
    getState() {
      return { currentTurn, totalTurns };
    },
  });

  kb.enable();

  // Return a cleanup function
  return function uninstall() {
    kb.disable();
  };
}
