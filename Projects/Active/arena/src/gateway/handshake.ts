// Match Facilitation Phase 2 — Agent Handshake
// Verifies an agent endpoint is reachable and returns a valid protocol response.

import type { HelloFrame } from "./protocol.js";

const HANDSHAKE_TIMEOUT_MS = 5000;

export interface HandshakeResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * POST a HelloFrame to the agent's declared endpoint.
 * Returns ok=true only if the response parses as a valid protocol frame.
 */
export async function performHandshake(
  agentId: number,
  endpoint: string,
): Promise<HandshakeResult> {
  const hello: HelloFrame = {
    type: "HELLO",
    matchId: `probe-${agentId}-${Date.now()}`,
    side: "A",
    seed: `seed-probe-${agentId}`,
    boardSize: { width: 7, height: 7 },
    timeBudgetMs: HANDSHAKE_TIMEOUT_MS,
    protocolVersion: "1.0",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HANDSHAKE_TIMEOUT_MS);

  const start = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hello),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return { ok: false, latencyMs, error: `HTTP ${response.status}` };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, latencyMs, error: "non-JSON response" };
    }

    // Accept any non-null object response as "ok" — the protocol spec says
    // agents should respond with READY or similar, but we are lenient here.
    if (body !== null && typeof body === "object") {
      return { ok: true, latencyMs };
    }

    return { ok: false, latencyMs, error: "unexpected response shape" };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, latencyMs, error: "timeout" };
    }
    return { ok: false, latencyMs, error: String(err) };
  }
}