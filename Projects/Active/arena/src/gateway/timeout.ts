// HexaWars Timeout Enforcer
// task-037-timeout-impl | phase C

import { AgentSessionManager } from './session.js';

export class TimeoutError extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.ms = ms;
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | TimeoutError> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<TimeoutError>((resolve) => {
    timer = setTimeout(() => resolve(new TimeoutError(ms)), ms);
  });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timer!);
  return result;
}

export function enforceActionDeadline(
  manager: AgentSessionManager,
  sessionId: string,
  deadline: number
): boolean {
  const now = Date.now();
  if (now > deadline) {
    manager.forfeit(sessionId, `Deadline exceeded: ${now} > ${deadline}`);
    return false;
  }
  return true;
}
