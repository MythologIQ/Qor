/**
 * HexaWars Spectator WebSocket Client
 * Connects to /api/arena/ws?spectate=<matchId>
 * Frame types: HELLO, STATE, EVENT, END (server→client)
 */

// ─── Re-exported frame type names for external consumers ────────────────────
export const FRAME_TYPES = {
  HELLO: 'HELLO',
  STATE: 'STATE',
  EVENT: 'EVENT',
  END: 'END',
};

/**
 * @param {string} matchId
 * @param {{ onHello?: (frame: object) => void, onState?: (frame: object) => void, onEvent?: (frame: object) => void, onEnd?: (frame: object) => void, onError?: (err: Event) => void }} handlers
 * @returns {{ disconnect: () => void }}
 */
export function connectSpectator(matchId, handlers = {}) {
  let ws = null;
  let retryDelay = 1000;
  let retryTimer = null;
  let intentionalClose = false;

  function connect() {
    const url = `/api/arena/ws?spectate=${encodeURIComponent(matchId)}`;
    ws = new WebSocket(url);

    ws.addEventListener('message', (evt) => {
      let frame;
      try {
        frame = JSON.parse(evt.data);
      } catch {
        return;
      }

      switch (frame.type) {
        case 'HELLO':
          retryDelay = 1000;
          handlers.onHello?.(frame);
          break;
        case 'STATE':
          handlers.onState?.(frame);
          break;
        case 'EVENT':
          handlers.onEvent?.(frame);
          break;
        case 'END':
          handlers.onEnd?.(frame);
          intentionalClose = true;
          ws?.close();
          break;
      }
    });

    ws.addEventListener('error', (err) => {
      handlers.onError?.(err);
    });

    ws.addEventListener('close', () => {
      ws = null;
      if (!intentionalClose) {
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000);
          connect();
        }, retryDelay);
      }
    });
  }

  connect();

  return {
    disconnect() {
      intentionalClose = true;
      clearTimeout(retryTimer);
      ws?.close();
      ws = null;
    },
  };
}