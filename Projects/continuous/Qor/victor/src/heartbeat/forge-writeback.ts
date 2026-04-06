/**
 * Forge Write-Back — Victor reports task completion back to Forge.
 * Claims tasks, marks them done, and emits evidence.
 */

import { readFileSync } from "fs";

export interface WriteBackConfig {
  forgeApiBase: string;
  forgeApiKey: string;
  agentId: string;
}

export interface TaskEvidence {
  sessionId: string;
  kind: "CapabilityReceipt";
  payload: {
    taskId: string;
    phaseId: string;
    action: "task-completion" | "task-claim" | "task-blocked";
    actor: string;
    testsPassed?: number;
    filesChanged?: string[];
    acceptanceMet?: string[];
    reason?: string;
  };
}

export interface CompletionReceipt {
  taskId: string;
  phaseId: string;
  status: "done" | "blocked" | "active";
  evidenceId: string;
  timestamp: string;
  provenanceHash: string;
}

export function loadForgeApiKey(secretsPath: string): string | null {
  try {
    return readFileSync(secretsPath, "utf-8").trim();
  } catch {
    return null;
  }
}

export async function claimTask(
  config: WriteBackConfig,
  taskId: string
): Promise<boolean> {
  const resp = await fetch(`${config.forgeApiBase}/api/forge/update-task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.forgeApiKey}`,
    },
    body: JSON.stringify({ taskId, newStatus: "active" }),
  });
  return resp.ok;
}

export async function completeTask(
  config: WriteBackConfig,
  taskId: string,
  phaseId: string,
  evidence: TaskEvidence
): Promise<CompletionReceipt> {
  const updateResp = await fetch(
    `${config.forgeApiBase}/api/forge/update-task`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.forgeApiKey}`,
      },
      body: JSON.stringify({ taskId, newStatus: "done" }),
    }
  );

  if (!updateResp.ok) {
    throw new Error(`update-task failed: ${updateResp.status}`);
  }

  const evidenceResp = await fetch(
    `${config.forgeApiBase}/api/forge/record-evidence`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.forgeApiKey}`,
      },
      body: JSON.stringify(evidence),
    }
  );

  const evidenceId = evidenceResp.ok
    ? ((await evidenceResp.json()) as any).entryId ?? "unknown"
    : "evidence-failed";

  const timestamp = new Date().toISOString();
  return {
    taskId,
    phaseId,
    status: "done",
    evidenceId,
    timestamp,
    provenanceHash: hashReceipt(taskId, phaseId, timestamp),
  };
}

export async function blockTask(
  config: WriteBackConfig,
  taskId: string,
  phaseId: string,
  reason: string
): Promise<CompletionReceipt> {
  await fetch(`${config.forgeApiBase}/api/forge/update-task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.forgeApiKey}`,
    },
    body: JSON.stringify({ taskId, newStatus: "blocked" }),
  });

  const timestamp = new Date().toISOString();
  return {
    taskId,
    phaseId,
    status: "blocked",
    evidenceId: "block-" + taskId,
    timestamp,
    provenanceHash: hashReceipt(taskId, phaseId, timestamp),
  };
}

export function buildTaskEvidence(
  taskId: string,
  phaseId: string,
  agentId: string,
  result: { testsPassed?: number; filesChanged?: string[]; acceptanceMet?: string[] }
): TaskEvidence {
  return {
    sessionId: `session-${Date.now()}`,
    kind: "CapabilityReceipt",
    payload: {
      taskId,
      phaseId,
      action: "task-completion",
      actor: agentId,
      testsPassed: result.testsPassed,
      filesChanged: result.filesChanged,
      acceptanceMet: result.acceptanceMet,
    },
  };
}

function hashReceipt(taskId: string, phaseId: string, ts: string): string {
  const data = `${taskId}:${phaseId}:${ts}`;
  return Array.from(data)
    .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    .toString(36);
}
