/**
 * API Endpoint: POST /api/victor/veto
 * Access: Authenticated user only
 */

import type { Context } from "hono";
import { timingSafeEqual } from "node:crypto";

interface VetoPayload {
  taskId: string;
  vetoedAt: string;
  reason: "mismatch" | "low_quality" | "duplicate" | "other";
  feedback?: string;
}

interface VetoResponse {
  success: boolean;
  taskId: string;
  newStatus: "vetoed";
  autonomyImpact?: {
    previousLevel: number;
    newLevel: number;
    reason: string;
  };
}

interface VetoRecord {
  taskId: string;
  userId: string;
  vetoedAt: string;
  reason: string;
  feedback?: string;
  originalHash: string;
}

// In-memory store (replace with persistent storage in production)
const vetoStore = new Map<string, VetoRecord>();
const userTrustStore = new Map<string, { level: number; vetoes: number }>();

export default async function vetoHandler(c: Context) {
  // Auth check
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Parse & validate payload
  const payload: VetoPayload = await c.req.json();
  const validation = validateVetoPayload(payload);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }
  
  // Record veto
  const vetoRecord: VetoRecord = {
    taskId: payload.taskId,
    userId: user.id,
    vetoedAt: payload.vetoedAt,
    reason: payload.reason,
    feedback: payload.feedback,
    originalHash: await getTaskHash(payload.taskId),
  };
  
  vetoStore.set(payload.taskId, vetoRecord);
  
  // Calculate autonomy impact
  const autonomyImpact = await calculateAutonomyImpact(user.id, payload.taskId);
  
  // Log to meta ledger (async, non-blocking)
  logToMetaLedger(vetoRecord, autonomyImpact);
  
  return c.json({
    success: true,
    taskId: payload.taskId,
    newStatus: "vetoed",
    autonomyImpact,
  } as VetoResponse);
}

async function requireAuth(c: Context): Promise<{ id: string } | null> {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  
  const token = auth.slice(7);
  const secret = process.env.VICTOR_API_SECRET;
  
  if (!secret) return null;
  
  // Constant-time comparison
  const match = constantTimeEqual(token, secret);
  if (!match) return null;
  
  return { id: "authenticated-user" }; // Extract from token in production
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function validateVetoPayload(p: VetoPayload): { valid: boolean; error?: string } {
  if (!p.taskId || typeof p.taskId !== "string") {
    return { valid: false, error: "taskId required" };
  }
  const validReasons = ["mismatch", "low_quality", "duplicate", "other"];
  if (!p.reason || !validReasons.includes(p.reason)) {
    return { valid: false, error: "valid reason required" };
  }
  if (!p.vetoedAt || !Date.parse(p.vetoedAt)) {
    return { valid: false, error: "valid vetoedAt timestamp required" };
  }
  return { valid: true };
}

async function getTaskHash(taskId: string): Promise<string> {
  // Would query task store for hash
  return `task-hash-${taskId}`;
}

async function calculateAutonomyImpact(
  userId: string,
  taskId: string
): Promise<VetoResponse["autonomyImpact"]> {
  const currentTrust = userTrustStore.get(userId) || { level: 2, vetoes: 0 };
  const recentVetoes = await countRecentVetoes(userId);
  
  if (recentVetoes > 5) {
    const newLevel = Math.max(currentTrust.level - 1, 1);
    userTrustStore.set(userId, { level: newLevel, vetoes: recentVetoes + 1 });
    return {
      previousLevel: currentTrust.level,
      newLevel,
      reason: `High veto rate: ${recentVetoes} in 24h`,
    };
  }
  
  return undefined;
}

async function countRecentVetoes(userId: string): Promise<number> {
  const recentVetoes = Array.from(vetoStore.values()).filter(
    v => v.userId === userId && 
    Date.now() - Date.parse(v.vetoedAt) < 24 * 60 * 60 * 1000
  );
  return recentVetoes.length;
}

function logToMetaLedger(
  record: VetoRecord,
  impact?: VetoResponse["autonomyImpact"]
): void {
  const ledgerEntry = {
    type: "VETO",
    timestamp: new Date().toISOString(),
    taskId: record.taskId,
    userId: record.userId,
    reason: record.reason,
    autonomyImpact: impact,
  };
  
  console.error("[META_LEDGER]", JSON.stringify(ledgerEntry));
}
