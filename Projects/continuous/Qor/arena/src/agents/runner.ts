// Agent Runner — HexaWars
// task-046-agent-runner | phase D
// Connects a BaseAgent subclass to a HexaWars WebSocket gateway.

import type { BaseAgent } from './base';
import type { ActionFrame, AgentAction, EndFrame, EventFrame, HelloFrame, ServerFrame, StateFrame } from '../gateway/contract';
import { parseFrame, sendFrame } from '../gateway/protocol';

export interface RunnerOptions {
  /**
   * Milliseconds to wait for the HELLO frame after opening the WebSocket.
   * @default 5000
   */
  handshakeTimeoutMs?: number;
}

/**
 * Runs an agent against a HexaWars game server via WebSocket.
 *
 * Protocol flow:
 * 1. Open WS to wsUrl
 * 2. Receive HELLO frame from server
 * 3. Call agent.onHello(matchId, side, seed)
 * 4. Send READY frame { type: 'READY', agentId, agentVersion }
 * 5. Receive STATE frames; for each, call agent.decide(state) and send ACTION
 * 6. Receive EVENT frames; call agent.onAck for ACK-type events
 * 7. Receive END frame; call agent.onEnd, then close
 */
export async function runAgent(
  agent: BaseAgent,
  wsUrl: string,
  opts: RunnerOptions = {}
): Promise<void> {
  const { handshakeTimeoutMs = 5000 } = opts;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let handshakeDone = false;

    const cleanup = () => {
      try { ws.close(); } catch { /* ignore */ }
    };

    // Timeout if HELLO doesn't arrive
    const handshakeTimer = setTimeout(() => {
      if (!handshakeDone) {
        cleanup();
        reject(new Error(`runAgent(${agent.id}): HELLO handshake timeout after ${handshakeTimeoutMs}ms`));
      }
    }, handshakeTimeoutMs);

    ws.addEventListener('open', () => {
      // Wait for HELLO before sending READY
    });

    ws.addEventListener('message', (event) => {
      const frame = parseFrame(event.data as string | ArrayBuffer);
      if (!frame) return;

      switch (frame.type) {
        case 'HELLO': {
          const hello = frame as HelloFrame;
          handshakeDone = true;
          clearTimeout(handshakeTimer);
          agent.onHello?.(hello.matchId, hello.side, hello.seed);
          sendFrame(ws, {
            type: 'READY',
            agentId: agent.id,
            agentVersion: agent.version,
          });
          break;
        }

        case 'STATE': {
          const state = frame as StateFrame;
          // Convert StateFrame shape to MatchState for agent.decide
          const matchState = {
            turn: state.turn,
            yourTurn: state.yourTurn,
            visible: state.visible,
            units: state.units,
            score: state.score,
            deadline: state.deadline,
          };
          const action = agent.decide(matchState);
          sendAction(ws, action);
          break;
        }

        case 'ACK': {
          // Server accepted or rejected our last action
          const ack = frame as { type: 'ACK'; accepted: boolean; reason?: string };
          agent.onAck?.(ack.accepted, ack.reason);
          break;
        }

        case 'EVENT': {
          const evt = frame as EventFrame;
          // Map EVENT to onAck for informational consistency
          agent.onAck?.(true, evt.event);
          break;
        }

        case 'END': {
          const end = frame as EndFrame;
          agent.onEnd?.(end.winner, end.reason);
          cleanup();
          resolve();
          break;
        }
      }
    });

    ws.addEventListener('error', (err) => {
      clearTimeout(handshakeTimer);
      reject(new Error(`runAgent(${agent.id}): WebSocket error — ${err}`));
    });

    ws.addEventListener('close', () => {
      clearTimeout(handshakeTimer);
      if (!handshakeDone) {
        reject(new Error(`runAgent(${agent.id}): WebSocket closed before HELLO`));
      }
    });
  });
}

function sendAction(ws: WebSocket, action: AgentAction): void {
  const frame: ActionFrame = {
    type: 'ACTION',
    action: action.type,
    from: action.from,
    to: action.to,
    confidence: action.confidence,
    metadata: action.metadata,
  };
  sendFrame(ws, frame);
}