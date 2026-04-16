import { appendEntry, auth } from "./append-entry";

export interface VetoPayload {
  target: string;
  reason: string;
  severity: "advisory" | "blocking" | "critical";
}

export function recordVeto(
  token: string,
  payload: VetoPayload,
  source: string,
): { ok: boolean; seq?: number; error?: string } {
  if (!auth(token)) return { ok: false, error: "Unauthorized" };
  if (!payload.target || !payload.reason) {
    return { ok: false, error: "Missing target or reason" };
  }
  const severity = payload.severity || "advisory";
  const result = appendEntry(
    "VETO",
    { target: payload.target, reason: payload.reason, severity },
    { source, tier: 1, autonomyLevel: 0 },
  );
  return { ok: true, seq: result.seq };
}
