// Agent Runner — HexaWars (Plan D v2)
// Connects a BaseAgent subclass to a HexaWars WebSocket gateway. Per-round
// flow: receive STATE frame, call agent.getRoundPlan(state, budget), send PLAN.

import type { BaseAgent } from './base';
import type {
  EndFrame,
  EventFrame,
  HelloFrame,
  PlanFrame,
  StateFrame,
} from '../gateway/contract';
import type { MatchState } from '../shared/types';
import { parseFrame, sendFrame } from '../gateway/protocol';

export interface RunnerOptions {
  /** Milliseconds to wait for the HELLO frame. @default 5000 */
  handshakeTimeoutMs?: number;
}

export async function runAgent(
  agent: BaseAgent,
  wsUrl: string,
  opts: RunnerOptions = {},
): Promise<void> {
  const { handshakeTimeoutMs = 5000 } = opts;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let handshakeDone = false;

    const cleanup = () => {
      try { ws.close(); } catch { /* ignore */ }
    };

    const handshakeTimer = setTimeout(() => {
      if (!handshakeDone) {
        cleanup();
        reject(new Error(`runAgent(${agent.id}): HELLO handshake timeout after ${handshakeTimeoutMs}ms`));
      }
    }, handshakeTimeoutMs);

    ws.addEventListener('message', async (event) => {
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
          const matchState: MatchState = {
            turn: state.turn,
            visible: state.visible,
            units: state.units,
            score: state.score,
            deadline: state.deadline,
            roundCap: state.roundCap,
          };
          const plan = await agent.getRoundPlan(matchState, state.budget);
          const planFrame: PlanFrame = {
            type: 'PLAN',
            plan,
            confidence: 1.0,
          };
          sendFrame(ws, planFrame);
          break;
        }

        case 'ACK': {
          const ack = frame as { type: 'ACK'; accepted: boolean; reason?: string };
          agent.onAck?.(ack.accepted, ack.reason);
          break;
        }

        case 'EVENT': {
          const evt = frame as EventFrame;
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
