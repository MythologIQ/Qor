/**
 * HexaWars Spectator WebSocket Client
 * Connects to /api/arena/matches/:id/ws
 * Frame types: MATCH_HELLO, MATCH_STATE, MATCH_EVENT, MATCH_END
 */

// ─── Re-exported frame type names for external consumers ────────────────────
export const FRAME_TYPES = {
  HELLO: 'MATCH_HELLO',
  STATE: 'MATCH_STATE',
  EVENT: 'MATCH_EVENT',
  END: 'MATCH_END',
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
    const url = `/api/arena/matches/${encodeURIComponent(matchId)}/ws`;
    ws = new WebSocket(url);

    ws.addEventListener('message', (evt) => {
      let frame;
      try {
        frame = JSON.parse(evt.data);
      } catch {
        return;
      }

      switch (frame.type) {
        case FRAME_TYPES.HELLO:
          retryDelay = 1000;
          handlers.onHello?.(frame);
          break;
        case FRAME_TYPES.STATE:
          handlers.onState?.(frame);
          break;
        case FRAME_TYPES.EVENT:
          handlers.onEvent?.(frame);
          break;
        case FRAME_TYPES.END:
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
