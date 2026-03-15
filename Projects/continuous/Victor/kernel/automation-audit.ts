import { existsSync } from 'node:fs';

import { createPlanningLedger, type PlanningLedgerEntry } from '../../Zo-Qore/runtime/planning';
import type { AutomationAction, AutomationActionResult } from './automation-runner';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Zo-Qore';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;

export interface AutomationAuditRunContext {
  runId: string;
  actorId: string;
  mode: 'dry-run' | 'execute';
  actionBudget: number;
  requestedActionCount: number;
  stopOnBlock: boolean;
}

export interface AutomationAuditRunCompletion extends AutomationAuditRunContext {
  status: 'completed' | 'blocked';
  executedCount: number;
  blockedCount: number;
}

export interface AutomationAuditRecord {
  entryId: string;
  timestamp: string;
  projectId: string;
  artifactId: string;
  runId: string | null;
  event: 'run-started' | 'run-completed' | 'action';
  payload: Record<string, unknown>;
}

export interface AutomationReviewSummary {
  projectId: string;
  generatedAt: string;
  windowStart: string | null;
  totalRuns: number;
  completedRuns: number;
  blockedRuns: number;
  executedActions: number;
  blockedActions: number;
  changedTaskIds: string[];
  blockedReasons: string[];
  recentRuns: Array<{
    runId: string;
    timestamp: string;
    mode: 'dry-run' | 'execute' | 'unknown';
    status: 'completed' | 'blocked' | 'unknown';
    executedCount: number;
    blockedCount: number;
  }>;
}

export async function appendAutomationRunStarted(
  projectId: string,
  projectsDir: string | undefined,
  context: AutomationAuditRunContext,
): Promise<PlanningLedgerEntry> {
  const ledger = createPlanningLedger(projectId, resolveProjectsDir(projectsDir));
  return ledger.appendEntry({
    projectId,
    view: 'autonomy',
    action: 'claim',
    artifactId: context.runId,
    actorId: context.actorId,
    checksumBefore: null,
    checksumAfter: null,
    payload: {
      source: 'victor-automation-run',
      event: 'run-started',
      runId: context.runId,
      mode: context.mode,
      actorId: context.actorId,
      actionBudget: context.actionBudget,
      requestedActionCount: context.requestedActionCount,
      stopOnBlock: context.stopOnBlock,
    },
  });
}

export async function appendAutomationRunCompleted(
  projectId: string,
  projectsDir: string | undefined,
  context: AutomationAuditRunCompletion,
): Promise<PlanningLedgerEntry> {
  const ledger = createPlanningLedger(projectId, resolveProjectsDir(projectsDir));
  return ledger.appendEntry({
    projectId,
    view: 'autonomy',
    action: 'claim',
    artifactId: context.runId,
    actorId: context.actorId,
    checksumBefore: null,
    checksumAfter: null,
    payload: {
      source: 'victor-automation-run',
      event: 'run-completed',
      runId: context.runId,
      mode: context.mode,
      actorId: context.actorId,
      actionBudget: context.actionBudget,
      requestedActionCount: context.requestedActionCount,
      stopOnBlock: context.stopOnBlock,
      status: context.status,
      executedCount: context.executedCount,
      blockedCount: context.blockedCount,
    },
  });
}

export async function appendAutomationActionAudit(
  projectId: string,
  projectsDir: string | undefined,
  context: AutomationAuditRunContext,
  action: AutomationAction,
  result: AutomationActionResult,
): Promise<PlanningLedgerEntry> {
  const ledger = createPlanningLedger(projectId, resolveProjectsDir(projectsDir));
  return ledger.appendEntry({
    projectId,
    view: 'autonomy',
    action: 'claim',
    artifactId: `${context.runId}:${result.actionIndex}`,
    actorId: context.actorId,
    checksumBefore: null,
    checksumAfter: null,
    payload: {
      source: 'victor-automation-action',
      event: 'action',
      runId: context.runId,
      mode: context.mode,
      actorId: context.actorId,
      actionIndex: result.actionIndex,
      actionKind: action.kind,
      executed: result.executed,
      resultStatus: result.status,
      reason: result.reason,
      governance: result.governance ?? null,
      request: actionPayload(action),
      groundedContext: {
        query: result.groundedContext.query,
        semanticNodeIds: result.groundedContext.semanticNodes.slice(0, 8).map((node) => node.id),
        semanticNodeLabels: result.groundedContext.semanticNodes.slice(0, 8).map((node) => node.label),
        semanticNodeTypes: result.groundedContext.semanticNodes.slice(0, 8).map((node) => node.nodeType),
        chunkIds: result.groundedContext.chunkHits.slice(0, 8).map((hit) => hit.chunk.id),
        contradictions: result.groundedContext.contradictions,
        missingInformation: result.groundedContext.missingInformation,
        recommendedNextActions: result.groundedContext.recommendedNextActions,
      },
      target: {
        taskId: result.taskId ?? (action.kind === 'update-task-status' ? action.taskId : null),
        duplicateTaskId: result.duplicateTaskId ?? null,
        before: result.audit?.before ?? null,
        after: result.audit?.after ?? null,
      },
    },
  });
}

export async function listAutomationAuditRecords(
  projectId: string,
  projectsDir?: string,
  options?: {
    runId?: string;
    limit?: number;
    since?: string;
  },
): Promise<AutomationAuditRecord[]> {
  const ledger = createPlanningLedger(projectId, resolveProjectsDir(projectsDir));
  const entries = await ledger.getEntries({
    view: 'autonomy',
    action: 'claim',
  });

  return entries
    .filter((entry) => isAutomationAuditPayload(entry.payload))
    .filter((entry) => !options?.runId || entry.payload.runId === options.runId)
    .filter((entry) => !options?.since || entry.timestamp >= options.since)
    .slice(-(options?.limit ?? 50))
    .reverse()
    .map((entry) => ({
      entryId: entry.entryId,
      timestamp: entry.timestamp,
      projectId: entry.projectId,
      artifactId: entry.artifactId,
      runId: typeof entry.payload?.runId === 'string' ? entry.payload.runId : null,
      event: entry.payload?.event as AutomationAuditRecord['event'],
      payload: entry.payload ?? {},
    }));
}

export async function summarizeAutomationReview(
  projectId: string,
  projectsDir?: string,
  options?: {
    limit?: number;
    since?: string;
  },
): Promise<AutomationReviewSummary> {
  const records = await listAutomationAuditRecords(projectId, projectsDir, options);
  const runCompletions = records.filter((record) => record.event === 'run-completed');
  const actionRecords = records.filter((record) => record.event === 'action');
  const changedTaskIds = new Set<string>();
  const blockedReasons = new Set<string>();

  for (const record of actionRecords) {
    const payload = record.payload;
    const target = asRecord(payload.target);
    const after = asRecord(target?.after);
    const taskId = typeof target?.taskId === 'string' ? target.taskId : typeof after?.taskId === 'string' ? after.taskId : null;
    if (taskId && payload.executed === true) {
      changedTaskIds.add(taskId);
    }
    if (payload.resultStatus === 'blocked' && typeof payload.reason === 'string') {
      blockedReasons.add(payload.reason);
    }
  }

  const recentRuns = runCompletions.slice(0, 10).map((record) => ({
    runId: typeof record.payload.runId === 'string' ? record.payload.runId : record.artifactId,
    timestamp: record.timestamp,
    mode: parseRunMode(record.payload.mode),
    status: parseRunStatus(record.payload.status),
    executedCount: numberOrZero(record.payload.executedCount),
    blockedCount: numberOrZero(record.payload.blockedCount),
  }));

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    windowStart: options?.since ?? null,
    totalRuns: runCompletions.length,
    completedRuns: runCompletions.filter((record) => record.payload.status === 'completed').length,
    blockedRuns: runCompletions.filter((record) => record.payload.status === 'blocked').length,
    executedActions: actionRecords.filter((record) => record.payload.executed === true).length,
    blockedActions: actionRecords.filter((record) => record.payload.resultStatus === 'blocked').length,
    changedTaskIds: [...changedTaskIds],
    blockedReasons: [...blockedReasons],
    recentRuns,
  };
}

function actionPayload(action: AutomationAction): Record<string, unknown> {
  if (action.kind === 'create-draft-task') {
    return {
      kind: action.kind,
      phaseId: action.phaseId,
      title: action.title,
      description: action.description,
      acceptance: action.acceptance ?? [],
      query: action.query,
    };
  }

  return {
    kind: action.kind,
    phaseId: action.phaseId,
    taskId: action.taskId,
    taskTitle: action.taskTitle ?? null,
    status: action.status,
    query: action.query,
  };
}

function isAutomationAuditPayload(payload: Record<string, unknown> | undefined): payload is Record<string, unknown> & {
  source: 'victor-automation-run' | 'victor-automation-action';
  event: 'run-started' | 'run-completed' | 'action';
} {
  return payload?.source === 'victor-automation-run' || payload?.source === 'victor-automation-action';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseRunMode(value: unknown): 'dry-run' | 'execute' | 'unknown' {
  return value === 'dry-run' || value === 'execute' ? value : 'unknown';
}

function parseRunStatus(value: unknown): 'completed' | 'blocked' | 'unknown' {
  return value === 'completed' || value === 'blocked' ? value : 'unknown';
}

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}
