import { existsSync } from 'node:fs';

import { ViewStore, createPlanningLedger, createStoreIntegrity, type PlanningLedgerEntry } from '../../runtime/planning';
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

export interface AutomationActivitySummary {
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

export interface BuildProgressSummary {
  projectId: string;
  generatedAt: string;
  windowStart: string | null;
  phaseCount: number;
  activePhaseCount: number;
  taskCounts: {
    total: number;
    pending: number;
    inProgress: number;
    done: number;
    blocked: number;
  };
  changedTaskIds: string[];
  createdTaskIds: string[];
  blockedTaskIds: string[];
  deliveryBlockers: string[];
  recentTaskActivity: Array<{
    timestamp: string;
    taskId: string;
    title: string;
    kind: 'created' | 'status-changed' | 'blocked-attempt';
    phaseId: string;
    previousStatus: string | null;
    nextStatus: string | null;
    reason: string;
  }>;
}

export interface VerificationEvidence {
  source: 'audit-ledger' | 'path-state';
  reference: string;
  detail: string;
}

export interface VerificationClaim {
  classification: 'observed' | 'inferred' | 'unverified';
  claim: string;
  evidence: VerificationEvidence[];
}

export interface VerificationReportSummary {
  projectId: string;
  generatedAt: string;
  windowStart: string | null;
  stats: {
    runCount: number;
    actionCount: number;
    executedActionCount: number;
    blockedActionCount: number;
  };
  claims: {
    observed: VerificationClaim[];
    inferred: VerificationClaim[];
    unverified: VerificationClaim[];
  };
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

export async function summarizeAutomationActivity(
  projectId: string,
  projectsDir?: string,
  options?: {
    limit?: number;
    since?: string;
  },
): Promise<AutomationActivitySummary> {
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

export async function summarizeBuildProgress(
  projectId: string,
  projectsDir?: string,
  options?: {
    limit?: number;
    since?: string;
  },
): Promise<BuildProgressSummary> {
  const resolvedProjectsDir = resolveProjectsDir(projectsDir);
  const auditRecords = await listAutomationAuditRecords(projectId, resolvedProjectsDir, options);
  const phases = await readPathPhases(projectId, resolvedProjectsDir);
  const taskIndex = indexTasks(phases);
  const changedTaskIds = new Set<string>();
  const createdTaskIds = new Set<string>();
  const blockedTaskIds = new Set<string>();
  const deliveryBlockers = new Set<string>();
  const recentTaskActivity: BuildProgressSummary['recentTaskActivity'] = [];

  for (const record of auditRecords.filter((entry) => entry.event === 'action')) {
    const payload = record.payload;
    const target = asRecord(payload.target);
    const request = asRecord(payload.request);
    const after = asRecord(target?.after);
    const before = asRecord(target?.before);
    const taskId =
      stringOrNull(target?.taskId)
      ?? stringOrNull(after?.taskId)
      ?? stringOrNull(request?.taskId);
    const phaseId =
      stringOrNull(request?.phaseId)
      ?? stringOrNull(after?.phaseId)
      ?? (taskId ? taskIndex.get(taskId)?.phaseId ?? null : null);

    if (!taskId || !phaseId) {
      continue;
    }

    const taskTitle =
      stringOrNull(after?.title)
      ?? stringOrNull(request?.title)
      ?? taskIndex.get(taskId)?.title
      ?? taskId;

    if (payload.executed === true) {
      changedTaskIds.add(taskId);
    }

    if (payload.executed === true && payload.actionKind === 'create-draft-task') {
      createdTaskIds.add(taskId);
      recentTaskActivity.push({
        timestamp: record.timestamp,
        taskId,
        title: taskTitle,
        kind: 'created',
        phaseId,
        previousStatus: null,
        nextStatus: stringOrNull(after?.status) ?? 'pending',
        reason: stringOrDefault(payload.reason, 'Task created under governance.'),
      });
      continue;
    }

    if (payload.executed === true && payload.actionKind === 'update-task-status') {
      recentTaskActivity.push({
        timestamp: record.timestamp,
        taskId,
        title: taskTitle,
        kind: 'status-changed',
        phaseId,
        previousStatus: stringOrNull(before?.status),
        nextStatus: stringOrNull(after?.status),
        reason: stringOrDefault(payload.reason, 'Task status changed under governance.'),
      });
      if (stringOrNull(after?.status) === 'blocked') {
        blockedTaskIds.add(taskId);
        deliveryBlockers.add(stringOrDefault(payload.reason, 'Task moved into blocked status.'));
      }
      continue;
    }

    if (payload.resultStatus === 'blocked') {
      blockedTaskIds.add(taskId);
      const reason = stringOrDefault(payload.reason, 'Governed task action was blocked.');
      deliveryBlockers.add(reason);
      recentTaskActivity.push({
        timestamp: record.timestamp,
        taskId,
        title: taskTitle,
        kind: 'blocked-attempt',
        phaseId,
        previousStatus: stringOrNull(before?.status) ?? taskIndex.get(taskId)?.status ?? null,
        nextStatus: stringOrNull(after?.status),
        reason,
      });
    }
  }

  const taskCounts = {
    total: 0,
    pending: 0,
    inProgress: 0,
    done: 0,
    blocked: 0,
  };

  for (const phase of phases) {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    for (const task of tasks) {
      taskCounts.total += 1;
      const status = normalizeTaskStatus(task.status);
      if (status === 'in-progress') taskCounts.inProgress += 1;
      else if (status === 'done') taskCounts.done += 1;
      else if (status === 'blocked') taskCounts.blocked += 1;
      else taskCounts.pending += 1;
    }
  }

  recentTaskActivity.sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    windowStart: options?.since ?? null,
    phaseCount: phases.length,
    activePhaseCount: phases.filter((phase) => normalizePhaseStatus(phase.status) === 'active').length,
    taskCounts,
    changedTaskIds: [...changedTaskIds],
    createdTaskIds: [...createdTaskIds],
    blockedTaskIds: [...blockedTaskIds],
    deliveryBlockers: [...deliveryBlockers],
    recentTaskActivity: recentTaskActivity.slice(0, options?.limit ?? 20),
  };
}

export async function summarizeVerificationReport(
  projectId: string,
  projectsDir?: string,
  options?: {
    limit?: number;
    since?: string;
    runId?: string;
  },
): Promise<VerificationReportSummary> {
  const resolvedProjectsDir = resolveProjectsDir(projectsDir);
  const records = await listAutomationAuditRecords(projectId, resolvedProjectsDir, options);
  const runStarted = records.filter((record) => record.event === 'run-started');
  const runCompleted = records.filter((record) => record.event === 'run-completed');
  const actions = records.filter((record) => record.event === 'action');
  const phases = await readPathPhases(projectId, resolvedProjectsDir);
  const taskIndex = indexTasks(phases);

  const observed: VerificationClaim[] = [];
  const inferred: VerificationClaim[] = [];
  const unverified: VerificationClaim[] = [];

  observed.push({
    classification: 'observed',
    claim: `${runCompleted.length} automation run(s) and ${actions.length} action record(s) were observed in the selected window.`,
    evidence: [
      {
        source: 'audit-ledger',
        reference: `${projectId}:autonomy`,
        detail: `Filtered ${records.length} automation audit ledger entries for the requested window.`,
      },
    ],
  });

  for (const record of runCompleted.slice(0, 5)) {
    observed.push({
      classification: 'observed',
      claim: `Run ${stringOrDefault(record.payload.runId, record.artifactId)} ${stringOrDefault(record.payload.status, 'completed')} in ${stringOrDefault(record.payload.mode, 'unknown')} mode with ${numberOrZero(record.payload.executedCount)} executed and ${numberOrZero(record.payload.blockedCount)} blocked action(s).`,
      evidence: [
        {
          source: 'audit-ledger',
          reference: record.entryId,
          detail: `Run completion ledger entry at ${record.timestamp}.`,
        },
      ],
    });
  }

  for (const record of actions.slice(0, 8)) {
    const payload = record.payload;
    const request = asRecord(payload.request);
    const target = asRecord(payload.target);
    const before = asRecord(target?.before);
    const after = asRecord(target?.after);
    const taskId =
      stringOrNull(target?.taskId)
      ?? stringOrNull(after?.taskId)
      ?? stringOrNull(request?.taskId);
    const title =
      stringOrNull(after?.title)
      ?? stringOrNull(request?.title)
      ?? (taskId ? taskIndex.get(taskId)?.title ?? taskId : 'unknown task');
    const actionKind = stringOrDefault(payload.actionKind, 'unknown-action');

    if (payload.executed === true && actionKind === 'create-draft-task') {
      observed.push({
        classification: 'observed',
        claim: `Victor created draft task "${title}" under governance.`,
        evidence: [
          {
            source: 'audit-ledger',
            reference: record.entryId,
            detail: `Create-draft audit entry at ${record.timestamp}.`,
          },
          {
            source: 'path-state',
            reference: taskId ?? 'unknown-task',
            detail: `Current Builder path state includes the drafted task as "${title}".`,
          },
        ],
      });
      continue;
    }

    if (payload.executed === true && actionKind === 'update-task-status') {
      observed.push({
        classification: 'observed',
        claim: `Victor changed "${title}" from ${stringOrDefault(before?.status, 'unknown')} to ${stringOrDefault(after?.status, 'unknown')}.`,
        evidence: [
          {
            source: 'audit-ledger',
            reference: record.entryId,
            detail: `Status update audit entry at ${record.timestamp}.`,
          },
          {
            source: 'path-state',
            reference: taskId ?? 'unknown-task',
            detail: `Current Builder path state resolves this task as "${title}".`,
          },
        ],
      });
      continue;
    }

    if (payload.resultStatus === 'blocked') {
      observed.push({
        classification: 'observed',
        claim: `Victor attempted ${actionKind} on "${title}" and it was blocked: ${stringOrDefault(payload.reason, 'No reason recorded.')}`,
        evidence: [
          {
            source: 'audit-ledger',
            reference: record.entryId,
            detail: `Blocked action audit entry at ${record.timestamp}.`,
          },
        ],
      });
    }
  }

  const actionKinds = [...new Set(actions.map((record) => stringOrNull(record.payload.actionKind)).filter(Boolean))];
  if (actionKinds.length > 0) {
    const bounded = actionKinds.every((kind) => kind === 'create-draft-task' || kind === 'update-task-status');
    inferred.push({
      classification: 'inferred',
      claim: bounded
        ? `Recent automation stayed within the low-risk governed action set: ${actionKinds.join(', ')}.`
        : `Recent automation included action kinds outside the expected low-risk governed set: ${actionKinds.join(', ')}.`,
      evidence: actions.slice(0, 8).map((record) => ({
        source: 'audit-ledger',
        reference: record.entryId,
        detail: `Action kind ${stringOrDefault(record.payload.actionKind, 'unknown')} recorded at ${record.timestamp}.`,
      })),
    });
  }

  const activePhases = phases.filter((phase) => normalizePhaseStatus(phase.status) === 'active');
  if (activePhases.length > 0) {
    inferred.push({
      classification: 'inferred',
      claim: `Current Builder state suggests the project is still in active delivery, with ${activePhases.length} active phase(s) and ${countTasksByStatus(phases, 'in-progress')} in-progress task(s).`,
      evidence: activePhases.slice(0, 5).map((phase) => ({
        source: 'path-state',
        reference: stringOrDefault(phase.phaseId, 'unknown-phase'),
        detail: `Active phase "${stringOrDefault(phase.name, 'Untitled phase')}" from current Builder path state.`,
      })),
    });
  }

  const completedRunIds = new Set(runCompleted.map((record) => stringOrDefault(record.payload.runId, record.artifactId)));
  const incompleteRuns = runStarted
    .map((record) => stringOrDefault(record.payload.runId, record.artifactId))
    .filter((runId) => !completedRunIds.has(runId));
  if (incompleteRuns.length > 0) {
    unverified.push({
      classification: 'unverified',
      claim: `${incompleteRuns.length} run(s) started without a matching completion record in the current window.`,
      evidence: incompleteRuns.slice(0, 5).map((runId) => ({
        source: 'audit-ledger',
        reference: runId,
        detail: 'Run-started record exists, but a matching run-completed record was not found in the selected window.',
      })),
    });
  }

  const snapshotGaps = actions.filter((record) => {
    const payload = record.payload;
    if (payload.executed !== true) {
      return false;
    }
    const target = asRecord(payload.target);
    if (payload.actionKind === 'create-draft-task') {
      return !stringOrNull(target?.taskId);
    }
    const after = asRecord(target?.after);
    return !after;
  });
  if (snapshotGaps.length > 0) {
    unverified.push({
      classification: 'unverified',
      claim: `${snapshotGaps.length} executed action(s) are missing full mutation snapshots, so their final state should not be reported as certain.`,
      evidence: snapshotGaps.slice(0, 5).map((record) => ({
        source: 'audit-ledger',
        reference: record.entryId,
        detail: `Executed action ${stringOrDefault(record.payload.actionKind, 'unknown')} lacks a complete before/after snapshot.`,
      })),
    });
  }

  if (actions.length === 0) {
    unverified.push({
      classification: 'unverified',
      claim: 'No automation action evidence was found in the selected window, so any behavior summary would be speculative.',
      evidence: [
        {
          source: 'audit-ledger',
          reference: `${projectId}:autonomy`,
          detail: 'No action records matched the requested filters.',
        },
      ],
    });
  }

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    windowStart: options?.since ?? null,
    stats: {
      runCount: runCompleted.length,
      actionCount: actions.length,
      executedActionCount: actions.filter((record) => record.payload.executed === true).length,
      blockedActionCount: actions.filter((record) => record.payload.resultStatus === 'blocked').length,
    },
    claims: {
      observed,
      inferred,
      unverified,
    },
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

async function readPathPhases(projectId: string, projectsDir: string): Promise<Array<Record<string, unknown>>> {
  const pathStore = new ViewStore(projectsDir, projectId, 'path', {
    ledger: createPlanningLedger(projectId, projectsDir),
    integrity: createStoreIntegrity(projectsDir),
  });
  const existing = await pathStore.read<{ phases?: Array<Record<string, unknown>> }>();
  return existing?.phases ?? [];
}

function indexTasks(phases: Array<Record<string, unknown>>) {
  const tasks = new Map<string, { phaseId: string; title: string; status: string | null }>();
  for (const phase of phases) {
    const phaseId = stringOrNull(phase.phaseId) ?? '';
    const taskList = Array.isArray(phase.tasks) ? phase.tasks : [];
    for (const task of taskList) {
      const taskId = stringOrNull(task.taskId);
      if (!taskId) continue;
      tasks.set(taskId, {
        phaseId,
        title: stringOrNull(task.title) ?? taskId,
        status: normalizeTaskStatus(task.status),
      });
    }
  }
  return tasks;
}

function countTasksByStatus(
  phases: Array<Record<string, unknown>>,
  status: 'pending' | 'in-progress' | 'done' | 'blocked',
): number {
  let count = 0;
  for (const phase of phases) {
    const taskList = Array.isArray(phase.tasks) ? phase.tasks : [];
    for (const task of taskList) {
      if (normalizeTaskStatus(task.status) === status) {
        count += 1;
      }
    }
  }
  return count;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normalizeTaskStatus(value: unknown): 'pending' | 'in-progress' | 'done' | 'blocked' {
  return value === 'in-progress' || value === 'done' || value === 'blocked' ? value : 'pending';
}

function normalizePhaseStatus(value: unknown): 'planned' | 'active' | 'complete' | 'blocked' {
  return value === 'active' || value === 'complete' || value === 'blocked' ? value : 'planned';
}

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}
