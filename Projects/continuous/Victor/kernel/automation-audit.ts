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

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}
