// HexaWars Agent Session Manager
// task-032-session-impl | phase C | reads: contract.ts

import type { GameState } from '../shared/types';

export type AgentSessionStatus = 'connected' | 'ready' | 'playing' | 'ended' | 'forfeit';

export interface AgentMetrics {
  totalActions: number;
  invalidActions: number;
  avgDecisionMs: number;
  totalMs: number;
}

export interface AgentSession {
  id: string;
  matchId: string;
  side: 'A' | 'B';
  connectedAt: number;
  lastActionAt: number;
  invalidCount: number;
  totalMs: number;
  status: AgentSessionStatus;
}

export class AgentSessionManager {
  private sessions: Map<string, AgentSession> = new Map();

  createSession(id: string, matchId: string, side: 'A' | 'B'): AgentSession {
    const session: AgentSession = {
      id,
      matchId,
      side,
      connectedAt: Date.now(),
      lastActionAt: Date.now(),
      invalidCount: 0,
      totalMs: 0,
      status: 'connected',
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  recordAction(sessionId: string, ms: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.lastActionAt = Date.now();
    session.totalMs += ms;
  }

  markInvalid(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.invalidCount++;
  }

  forfeit(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.status = 'forfeit';
    session.lastActionAt = Date.now();
  }

  transition(sessionId: string, status: AgentSessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const valid: AgentSessionStatus[] = ['connected', 'ready', 'playing', 'ended', 'forfeit'];
    if (!valid.includes(status)) return false;

    // Enforce valid transitions: connected→ready→playing→ended
    const order = ['connected', 'ready', 'playing', 'ended'];
    const currentIdx = order.indexOf(session.status);
    const nextIdx = order.indexOf(status);

    if (session.status === 'forfeit') return false;
    // Allow playing→ended (match conclusion); forfeit must use forfeit() method directly
    if (session.status === 'playing' && status === 'ended') {
      session.status = status;
      session.lastActionAt = Date.now();
      return true;
    }
    if (nextIdx <= currentIdx && !(session.status === 'ready' && status === 'forfeit')) {
      return false;
    }

    session.status = status;
    session.lastActionAt = Date.now();
    return true;
  }

  toMetrics(sessionId: string): AgentMetrics | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const count = session.invalidCount > 0 ? session.invalidCount : 1;
    return {
      totalActions: session.invalidCount + 1,
      invalidActions: session.invalidCount,
      avgDecisionMs: Math.round(session.totalMs / count),
      totalMs: session.totalMs,
    };
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const agentSessionManager = new AgentSessionManager();