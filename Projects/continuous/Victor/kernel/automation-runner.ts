import { existsSync } from 'node:fs';

import {
  ViewStore,
  createPlanningGovernance,
  createPlanningLedger,
  createProjectStore,
  createStoreIntegrity,
} from '../../Zo-Qore/runtime/planning';
import {
  appendAutomationActionAudit,
  appendAutomationRunCompleted,
  appendAutomationRunStarted,
  type AutomationAuditRunContext,
} from './automation-audit';
import {
  createGovernedBuilderConsoleDraftTask,
  updateGovernedBuilderConsoleTaskStatus,
} from './builder-console-write';
import type { GroundedContextBundle } from './memory/types';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Zo-Qore';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;

type BuilderConsoleTaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

export interface AutomationDraftTaskAction {
  kind: 'create-draft-task';
  projectId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance?: string[];
  query: string;
}

export interface AutomationTaskStatusAction {
  kind: 'update-task-status';
  projectId: string;
  phaseId: string;
  taskId: string;
  taskTitle?: string;
  status: BuilderConsoleTaskStatus;
  query: string;
}

export type AutomationAction = AutomationDraftTaskAction | AutomationTaskStatusAction;

export interface AutomationRunRequest {
  actions: AutomationAction[];
  actorId?: string;
  runId?: string;
  projectsDir?: string;
  dryRun?: boolean;
  maxActions?: number;
  stopOnBlock?: boolean;
}

export interface AutomationActionResult {
  actionIndex: number;
  kind: AutomationAction['kind'];
  projectId: string;
  phaseId: string;
  executed: boolean;
  status: 'eligible' | 'created' | 'updated' | 'duplicate' | 'blocked';
  reason: string;
  groundedContext: GroundedContextBundle;
  governance?: {
    allowed: boolean;
    reason?: string;
  };
  taskId?: string;
  duplicateTaskId?: string;
  audit?: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
}

export interface AutomationRunResult {
  runId: string;
  status: 'completed' | 'blocked';
  mode: 'dry-run' | 'execute';
  actionBudget: number;
  executedCount: number;
  blockedCount: number;
  results: AutomationActionResult[];
}

export async function runVictorSafeAutomation(
  request: AutomationRunRequest,
  groundedQuery: (projectId: string, query: string) => Promise<GroundedContextBundle>,
): Promise<AutomationRunResult> {
  const actorId = request.actorId?.trim() || 'victor';
  const runId = request.runId?.trim() || `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const actionBudget = request.maxActions ?? 1;
  const dryRun = request.dryRun !== false;
  const stopOnBlock = request.stopOnBlock !== false;
  const auditContext: AutomationAuditRunContext = {
    runId,
    actorId,
    mode: dryRun ? 'dry-run' : 'execute',
    actionBudget,
    requestedActionCount: request.actions?.length ?? 0,
    stopOnBlock,
  };
  const projectIds = [...new Set((request.actions ?? []).map((action) => action.projectId).filter(Boolean))];

  if (!Array.isArray(request.actions) || request.actions.length === 0) {
    throw new Error('At least one automation action is required.');
  }

  for (const projectId of projectIds) {
    await appendAutomationRunStarted(projectId, request.projectsDir, auditContext);
  }

  if (request.actions.length > actionBudget) {
    const blockedResult: AutomationRunResult = {
      status: 'blocked',
      mode: dryRun ? 'dry-run' : 'execute',
      runId,
      actionBudget,
      executedCount: 0,
      blockedCount: 1,
      results: [
        {
          actionIndex: 0,
          kind: request.actions[0]?.kind ?? 'create-draft-task',
          projectId: request.actions[0]?.projectId ?? '',
          phaseId: request.actions[0]?.phaseId ?? '',
          executed: false,
          status: 'blocked',
          reason: `Requested ${request.actions.length} actions, which exceeds the safe automation budget of ${actionBudget}.`,
          groundedContext: emptyGroundedContext(request.actions[0]?.query ?? ''),
          audit: {
            before: null,
            after: null,
          },
        },
      ],
    };
    for (const projectId of projectIds) {
      await appendAutomationActionAudit(projectId, request.projectsDir, auditContext, request.actions[0]!, blockedResult.results[0]!);
      await appendAutomationRunCompleted(projectId, request.projectsDir, {
        ...auditContext,
        status: blockedResult.status,
        executedCount: blockedResult.executedCount,
        blockedCount: blockedResult.blockedCount,
      });
    }
    return blockedResult;
  }

  const results: AutomationActionResult[] = [];

  for (const [actionIndex, action] of request.actions.entries()) {
    const groundedContext = await groundedQuery(action.projectId, action.query);
    const result = dryRun
      ? await previewAutomationAction(action, groundedContext, actorId, request.projectsDir, actionIndex)
      : await executeAutomationAction(action, groundedContext, actorId, request.projectsDir, actionIndex);
    results.push(result);
    await appendAutomationActionAudit(action.projectId, request.projectsDir, auditContext, action, result);

    if (result.status === 'blocked' && stopOnBlock) {
      break;
    }
  }

  const blockedCount = results.filter((result) => result.status === 'blocked').length;
  const executedCount = results.filter((result) => result.executed).length;
  const finalResult: AutomationRunResult = {
    runId,
    status: blockedCount > 0 ? 'blocked' : 'completed',
    mode: dryRun ? 'dry-run' : 'execute',
    actionBudget,
    executedCount,
    blockedCount,
    results,
  };

  for (const projectId of projectIds) {
    await appendAutomationRunCompleted(projectId, request.projectsDir, {
      ...auditContext,
      status: finalResult.status,
      executedCount: finalResult.executedCount,
      blockedCount: finalResult.blockedCount,
    });
  }

  return finalResult;
}

async function previewAutomationAction(
  action: AutomationAction,
  groundedContext: GroundedContextBundle,
  actorId: string,
  projectsDir: string | undefined,
  actionIndex: number,
): Promise<AutomationActionResult> {
  const context = await loadActionContext(action.projectId, projectsDir);
  const phases = await readPhases(context);
  const phaseIndex = phases.findIndex((phase) => phase.phaseId === action.phaseId);

  if (phaseIndex === -1) {
    return blockedActionResult(action, groundedContext, actionIndex, 'Explicit target phase was not found in Builder Console path state.');
  }

  if (action.kind === 'create-draft-task') {
    const evidenceFailure = validateDraftTaskEvidence(action, groundedContext);
    if (evidenceFailure) {
      return blockedActionResult(action, groundedContext, actionIndex, evidenceFailure);
    }

    const duplicateTask = findDuplicateTask(phases, action.title);
    if (duplicateTask) {
      return {
        actionIndex,
        kind: action.kind,
        projectId: action.projectId,
        phaseId: action.phaseId,
        executed: false,
        status: 'duplicate',
        reason: `A near-identical task already exists in phase ${duplicateTask.phaseId}.`,
        groundedContext,
        duplicateTaskId: duplicateTask.taskId,
        taskId: duplicateTask.taskId,
      };
    }

    const governance = await context.planningGovernance.evaluateAction(
      actorId,
      'planning:path:create-task',
      action.projectId,
      {
        phaseId: action.phaseId,
        title: action.title.trim(),
        query: action.query,
        groundedNodeIds: groundedContext.semanticNodes.slice(0, 8).map((node) => node.id),
      },
    );

    if (!governance.allowed) {
      return blockedActionResult(
        action,
        groundedContext,
        actionIndex,
        governance.reason || 'Builder Console governance denied draft task creation.',
        governance,
      );
    }

    return eligibleActionResult(action, groundedContext, actionIndex, 'Draft task is eligible for governed execution.', governance);
  }

  const phase = phases[phaseIndex];
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
  const taskIndex = tasks.findIndex((task) => task.taskId === action.taskId);
  if (taskIndex === -1) {
    return blockedActionResult(action, groundedContext, actionIndex, 'Explicit target task was not found in Builder Console path state.');
  }

  const evidenceFailure = validateTaskStatusEvidence(action, groundedContext);
  if (evidenceFailure) {
    return blockedActionResult(action, groundedContext, actionIndex, evidenceFailure);
  }

  const currentStatus = normalizeTaskStatus(tasks[taskIndex].status);
  if (currentStatus === action.status) {
    if (action.status === 'in-progress') {
      return eligibleActionResult(
        action,
        groundedContext,
        actionIndex,
        `Task ${action.taskId} is already in-progress; reflective review is eligible without mutating execution state.`,
        { allowed: true, reason: 'No-op reflective review.' },
        action.taskId,
      );
    }
    return blockedActionResult(action, groundedContext, actionIndex, `Task ${action.taskId} is already marked ${action.status}.`);
  }

  const governance = await context.planningGovernance.evaluateAction(
    actorId,
    'planning:path:update-task-status',
    action.projectId,
    {
      phaseId: action.phaseId,
      taskId: action.taskId,
      taskTitle: action.taskTitle,
      status: action.status,
      query: action.query,
      groundedNodeIds: groundedContext.semanticNodes.slice(0, 8).map((node) => node.id),
    },
  );

  if (!governance.allowed) {
    return blockedActionResult(
      action,
      groundedContext,
      actionIndex,
      governance.reason || 'Builder Console governance denied task status update.',
      governance,
    );
  }

  return eligibleActionResult(action, groundedContext, actionIndex, 'Task status update is eligible for governed execution.', governance, action.taskId);
}

async function executeAutomationAction(
  action: AutomationAction,
  groundedContext: GroundedContextBundle,
  actorId: string,
  projectsDir: string | undefined,
  actionIndex: number,
): Promise<AutomationActionResult> {
  if (action.kind === 'create-draft-task') {
    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectId: action.projectId,
        phaseId: action.phaseId,
        title: action.title,
        description: action.description,
        acceptance: action.acceptance,
        actorId,
        query: action.query,
        projectsDir,
      },
      groundedContext,
    );

    return {
      actionIndex,
      kind: action.kind,
      projectId: action.projectId,
      phaseId: action.phaseId,
      executed: result.status === 'created',
      status: result.status,
      reason: result.reason,
      groundedContext,
      governance: result.governance,
      taskId: result.task?.taskId,
      duplicateTaskId: result.duplicateTaskId,
      audit: {
        before: null,
        after: result.task
          ? {
              taskId: result.task.taskId,
              phaseId: result.task.phaseId,
              title: result.task.title,
              description: result.task.description,
              acceptance: result.task.acceptance,
              status: result.task.status,
            }
          : null,
      },
    };
  }

  const result = await updateGovernedBuilderConsoleTaskStatus(
    {
      projectId: action.projectId,
      phaseId: action.phaseId,
      taskId: action.taskId,
      taskTitle: action.taskTitle,
      status: action.status,
      actorId,
      query: action.query,
      projectsDir,
    },
    groundedContext,
  );

  return {
    actionIndex,
    kind: action.kind,
    projectId: action.projectId,
    phaseId: action.phaseId,
    executed: result.status === 'updated',
    status: result.status,
    reason: result.reason,
    groundedContext,
    governance: result.governance,
    taskId: result.task?.taskId ?? action.taskId,
    audit: {
      before: result.task
        ? {
            taskId: result.task.taskId,
            phaseId: result.task.phaseId,
            title: result.task.title,
            description: result.task.description,
            acceptance: result.task.acceptance,
            status: result.previousStatus ?? null,
          }
        : null,
      after: result.task
        ? {
            taskId: result.task.taskId,
            phaseId: result.task.phaseId,
            title: result.task.title,
            description: result.task.description,
            acceptance: result.task.acceptance,
            status: result.task.status,
          }
        : null,
    },
  };
}

async function loadActionContext(projectId: string, projectsDir: string | undefined) {
  const resolvedProjectsDir = resolveProjectsDir(projectsDir);
  const projectStore = createProjectStore(projectId, resolvedProjectsDir, { enableLedger: true });
  const storeIntegrity = createStoreIntegrity(resolvedProjectsDir);
  const planningLedger = createPlanningLedger(projectId, resolvedProjectsDir);
  const planningGovernance = createPlanningGovernance(projectStore, storeIntegrity);
  return {
    resolvedProjectsDir,
    planningLedger,
    planningGovernance,
    pathStore: new ViewStore(resolvedProjectsDir, projectId, 'path', {
      ledger: planningLedger,
      integrity: storeIntegrity,
    }),
  };
}

async function readPhases(context: Awaited<ReturnType<typeof loadActionContext>>) {
  const existing = await context.pathStore.read<{ phases?: Array<Record<string, unknown>> }>();
  return (existing?.phases ?? []) as Array<Record<string, unknown> & { tasks?: Array<Record<string, unknown>> }>;
}

function validateDraftTaskEvidence(
  action: AutomationDraftTaskAction,
  groundedContext: GroundedContextBundle,
): string | null {
  if (!action.projectId || !action.phaseId || !action.title?.trim() || !action.description?.trim() || !action.query?.trim()) {
    return 'projectId, phaseId, title, description, and query are required.';
  }
  if (groundedContext.contradictions.length > 0) {
    return 'Victor refused draft task creation because the grounded context contains contradictions.';
  }
  if (groundedContext.missingInformation.length > 0) {
    return `Victor refused draft task creation because evidence is incomplete: ${groundedContext.missingInformation.join(' ')}`;
  }
  const groundedNodeCount = groundedContext.semanticNodes.filter((node) => ['Decision', 'Goal', 'Task'].includes(node.nodeType)).length;
  if (groundedNodeCount === 0) {
    return 'Victor refused draft task creation because no decision, goal, or task evidence was retrieved.';
  }
  return null;
}

function validateTaskStatusEvidence(
  action: AutomationTaskStatusAction,
  groundedContext: GroundedContextBundle,
): string | null {
  if (!action.projectId || !action.phaseId || !action.taskId || !action.status || !action.query?.trim()) {
    return 'projectId, phaseId, taskId, status, and query are required.';
  }
  if (groundedContext.contradictions.length > 0) {
    return 'Victor refused task status update because the grounded context contains contradictions.';
  }
  if (groundedContext.missingInformation.length > 0) {
    return `Victor refused task status update because evidence is incomplete: ${groundedContext.missingInformation.join(' ')}`;
  }
  const relevantTaskNode = groundedContext.semanticNodes.find(
    (node) =>
      node.nodeType === 'Task'
      && (
        node.id === action.taskId
        || (action.taskTitle ? normalize(node.label) === normalize(action.taskTitle) : false)
        || normalize(node.label) === normalize(action.taskId)
        || normalize(String(node.attributes?.taskId ?? '')) === normalize(action.taskId)
      ),
  );
  if (!relevantTaskNode) {
    return 'Victor refused task status update because no grounded task evidence matched the target task.';
  }
  return null;
}

function eligibleActionResult(
  action: AutomationAction,
  groundedContext: GroundedContextBundle,
  actionIndex: number,
  reason: string,
  governance?: { allowed: boolean; reason?: string },
  taskId?: string,
): AutomationActionResult {
  return {
    actionIndex,
    kind: action.kind,
    projectId: action.projectId,
    phaseId: action.phaseId,
    executed: false,
    status: 'eligible',
    reason,
    groundedContext,
    governance,
    taskId,
    audit: {
      before: null,
      after: null,
    },
  };
}

function blockedActionResult(
  action: AutomationAction,
  groundedContext: GroundedContextBundle,
  actionIndex: number,
  reason: string,
  governance?: { allowed: boolean; reason?: string },
): AutomationActionResult {
  return {
    actionIndex,
    kind: action.kind,
    projectId: action.projectId,
    phaseId: action.phaseId,
    executed: false,
    status: 'blocked',
    reason,
    groundedContext,
    governance,
    taskId: action.kind === 'update-task-status' ? action.taskId : undefined,
    audit: {
      before: null,
      after: null,
    },
  };
}

function findDuplicateTask(
  phases: Array<Record<string, unknown>>,
  title: string,
): { taskId: string; phaseId: string } | null {
  const normalized = normalize(title);
  for (const phase of phases) {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    for (const task of tasks) {
      const taskTitle = typeof task.title === 'string' ? task.title : '';
      if (normalize(taskTitle) !== normalized) {
        continue;
      }
      return {
        taskId: String(task.taskId),
        phaseId: String(task.phaseId),
      };
    }
  }
  return null;
}

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeTaskStatus(value: unknown): BuilderConsoleTaskStatus {
  return value === 'in-progress' || value === 'done' || value === 'blocked' ? value : 'pending';
}

function emptyGroundedContext(query: string): GroundedContextBundle {
  return {
    query,
    chunkHits: [],
    semanticNodes: [],
    semanticEdges: [],
    cacheEntries: [],
    contradictions: [],
    recommendedNextActions: [],
    missingInformation: [],
  };
}
