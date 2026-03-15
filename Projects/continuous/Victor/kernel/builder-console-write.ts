import { existsSync } from 'node:fs';

import {
  ViewStore,
  createPlanningGovernance,
  createPlanningLedger,
  createProjectStore,
  createStoreIntegrity,
} from '../../Zo-Qore/runtime/planning';
import type { GroundedContextBundle } from './memory/types';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Zo-Qore';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;

type BuilderConsoleTaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

interface BuilderConsoleTaskRecord {
  taskId?: unknown;
  phaseId?: unknown;
  title?: unknown;
  description?: unknown;
  acceptance?: unknown;
  status?: unknown;
}

export interface DraftTaskRequest {
  projectId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance?: string[];
  actorId?: string;
  query: string;
  projectsDir?: string;
}

export interface DraftTaskResult {
  status: 'created' | 'blocked' | 'duplicate';
  classification: 'low-risk' | 'blocked';
  reason: string;
  governance?: {
    allowed: boolean;
    reason?: string;
  };
  task?: {
    taskId: string;
    phaseId: string;
    title: string;
    description: string;
    acceptance: string[];
    status: 'pending';
  };
  duplicateTaskId?: string;
  ledgerEntryId?: string;
}

export interface UpdateTaskStatusRequest {
  projectId: string;
  phaseId: string;
  taskId: string;
  taskTitle?: string;
  status: BuilderConsoleTaskStatus;
  actorId?: string;
  query: string;
  projectsDir?: string;
}

export interface UpdateTaskStatusResult {
  status: 'updated' | 'blocked';
  classification: 'low-risk' | 'blocked';
  reason: string;
  governance?: {
    allowed: boolean;
    reason?: string;
  };
  task?: {
    taskId: string;
    phaseId: string;
    title: string;
    description: string;
    acceptance: string[];
    status: BuilderConsoleTaskStatus;
  };
  previousStatus?: BuilderConsoleTaskStatus;
  ledgerEntryId?: string;
}

export async function createGovernedBuilderConsoleDraftTask(
  request: DraftTaskRequest,
  groundedContext: GroundedContextBundle,
): Promise<DraftTaskResult> {
  const actorId = request.actorId?.trim() || 'victor';
  const validationFailure = validateRequest(request, groundedContext);
  if (validationFailure) {
    return validationFailure;
  }

  const projectsDir = resolveProjectsDir(request.projectsDir);
  const projectStore = createProjectStore(request.projectId, projectsDir, { enableLedger: true });
  const storeIntegrity = createStoreIntegrity(projectsDir);
  const planningGovernance = createPlanningGovernance(projectStore, storeIntegrity);
  const planningLedger = createPlanningLedger(request.projectId, projectsDir);
  const pathStore = new ViewStore(projectsDir, request.projectId, 'path', {
    ledger: planningLedger,
    integrity: storeIntegrity,
  });

  const existing = await pathStore.read<{ phases?: Array<Record<string, unknown>> }>();
  const phases = existing?.phases ?? [];
  const phaseIndex = phases.findIndex((phase) => phase.phaseId === request.phaseId);
  if (phaseIndex === -1) {
    return blocked('Explicit target phase was not found in Builder Console path state.');
  }

  const duplicate = findDuplicateTask(phases, request.title);
  if (duplicate) {
    return {
      status: 'duplicate',
      classification: 'low-risk',
      reason: `A near-identical task already exists in phase ${duplicate.phaseId}.`,
      duplicateTaskId: duplicate.taskId,
      task: {
        taskId: duplicate.taskId,
        phaseId: duplicate.phaseId,
        title: duplicate.title,
        description: duplicate.description,
        acceptance: duplicate.acceptance,
        status: duplicate.status,
      },
    };
  }

  const phase = phases[phaseIndex] as Record<string, unknown> & { tasks?: Array<Record<string, unknown>> };
  const taskId = `task_${Math.random().toString(36).slice(2, 10)}`;
  const newTask = {
    taskId,
    phaseId: request.phaseId,
    title: request.title.trim(),
    description: request.description.trim(),
    acceptance: [...(request.acceptance ?? [])],
    status: 'pending' as const,
  };

  const nextTasks = [...(phase.tasks ?? []), newTask];
  const updatedPhase = {
    ...phase,
    tasks: nextTasks,
    status: derivePhaseStatus(nextTasks),
    updatedAt: new Date().toISOString(),
  };

  const { response } = await planningGovernance.evaluateAndExecute(
    actorId,
    'planning:path:create-task',
    request.projectId,
    async () => {
      const writeStore = new ViewStore(projectsDir, request.projectId, 'path', {
        ledger: planningLedger,
        integrity: storeIntegrity,
        artifactId: taskId,
      });
      phases[phaseIndex] = updatedPhase;
      await writeStore.write({ phases }, actorId);
      await projectStore.updatePipelineState('path', 'active', actorId);
    },
    {
      phaseId: request.phaseId,
      title: request.title.trim(),
      query: request.query,
      groundedNodeIds: groundedContext.semanticNodes.slice(0, 8).map((node) => node.id),
    },
  );

  if (!response.allowed) {
    return {
      status: 'blocked',
      classification: 'blocked',
      reason: response.reason || 'Builder Console governance denied draft task creation.',
      governance: {
        allowed: false,
        reason: response.reason,
      },
    };
  }

  const rationaleEntry = await planningLedger.appendEntry({
    projectId: request.projectId,
    view: 'path',
    action: 'update',
    artifactId: taskId,
    actorId,
    checksumBefore: null,
    checksumAfter: null,
    payload: {
      source: 'victor-draft-task',
      phaseId: request.phaseId,
      query: request.query,
      groundedNodeLabels: groundedContext.semanticNodes.slice(0, 8).map((node) => node.label),
      groundedNodeTypes: groundedContext.semanticNodes.slice(0, 8).map((node) => node.nodeType),
      chunkIds: groundedContext.chunkHits.slice(0, 8).map((hit) => hit.chunk.id),
      recommendedNextActions: groundedContext.recommendedNextActions,
    },
  });

  return {
    status: 'created',
    classification: 'low-risk',
    reason: 'Victor created a governed draft task with grounded evidence and explicit phase targeting.',
    governance: {
      allowed: true,
      reason: response.reason,
    },
    ledgerEntryId: rationaleEntry.entryId,
    task: newTask,
  };
}

export async function updateGovernedBuilderConsoleTaskStatus(
  request: UpdateTaskStatusRequest,
  groundedContext: GroundedContextBundle,
): Promise<UpdateTaskStatusResult> {
  const actorId = request.actorId?.trim() || 'victor';
  const validationFailure = validateTaskStatusRequest(request, groundedContext);
  if (validationFailure) {
    return validationFailure;
  }

  const projectsDir = resolveProjectsDir(request.projectsDir);
  const projectStore = createProjectStore(request.projectId, projectsDir, { enableLedger: true });
  const storeIntegrity = createStoreIntegrity(projectsDir);
  const planningGovernance = createPlanningGovernance(projectStore, storeIntegrity);
  const planningLedger = createPlanningLedger(request.projectId, projectsDir);
  const pathStore = new ViewStore(projectsDir, request.projectId, 'path', {
    ledger: planningLedger,
    integrity: storeIntegrity,
    artifactId: request.taskId,
  });

  const existing = await pathStore.read<{ phases?: Array<Record<string, unknown>> }>();
  const phases = existing?.phases ?? [];
  const phaseIndex = phases.findIndex((phase) => phase.phaseId === request.phaseId);
  if (phaseIndex === -1) {
    return blockedStatusUpdate('Explicit target phase was not found in Builder Console path state.');
  }

  const phase = phases[phaseIndex] as Record<string, unknown> & { tasks?: Array<Record<string, unknown>> };
  const tasks = [...(phase.tasks ?? [])] as BuilderConsoleTaskRecord[];
  const taskIndex = tasks.findIndex((task) => task.taskId === request.taskId);
  if (taskIndex === -1) {
    return blockedStatusUpdate('Explicit target task was not found in Builder Console path state.');
  }

  const currentTask = tasks[taskIndex] as BuilderConsoleTaskRecord;
  const previousStatus = normalizeTaskStatus(currentTask.status);
  if (previousStatus === request.status) {
    return blockedStatusUpdate(`Task ${request.taskId} is already marked ${request.status}.`);
  }

  const updatedTask = {
    ...currentTask,
    status: request.status,
  };

  const nextTasks = tasks.map((task, index) => (index === taskIndex ? updatedTask : task));
  const updatedPhase = {
    ...phase,
    tasks: nextTasks,
    status: derivePhaseStatus(nextTasks),
    updatedAt: new Date().toISOString(),
  };

  const { response } = await planningGovernance.evaluateAndExecute(
    actorId,
    'planning:path:update-task-status',
    request.projectId,
    async () => {
      phases[phaseIndex] = updatedPhase;
      await pathStore.write({ phases }, actorId);
      await projectStore.updatePipelineState('path', 'active', actorId);
    },
    {
      phaseId: request.phaseId,
      taskId: request.taskId,
      status: request.status,
      query: request.query,
      groundedNodeIds: groundedContext.semanticNodes.slice(0, 8).map((node) => node.id),
    },
  );

  if (!response.allowed) {
    return {
      status: 'blocked',
      classification: 'blocked',
      reason: response.reason || 'Builder Console governance denied task status update.',
      governance: {
        allowed: false,
        reason: response.reason,
      },
      previousStatus,
    };
  }

  const rationaleEntry = await planningLedger.appendEntry({
    projectId: request.projectId,
    view: 'path',
    action: 'update',
    artifactId: request.taskId,
    actorId,
    checksumBefore: null,
    checksumAfter: null,
    payload: {
      source: 'victor-task-status-update',
      phaseId: request.phaseId,
      taskId: request.taskId,
      previousStatus,
      nextStatus: request.status,
      query: request.query,
      groundedNodeLabels: groundedContext.semanticNodes.slice(0, 8).map((node) => node.label),
      groundedNodeTypes: groundedContext.semanticNodes.slice(0, 8).map((node) => node.nodeType),
      chunkIds: groundedContext.chunkHits.slice(0, 8).map((hit) => hit.chunk.id),
      recommendedNextActions: groundedContext.recommendedNextActions,
    },
  });

  return {
    status: 'updated',
    classification: 'low-risk',
    reason: 'Victor updated Builder Console task status with grounded evidence and governance approval.',
    governance: {
      allowed: true,
      reason: response.reason,
    },
    previousStatus,
    ledgerEntryId: rationaleEntry.entryId,
    task: {
      taskId: String(updatedTask.taskId),
      phaseId: String(updatedTask.phaseId ?? request.phaseId),
      title: typeof updatedTask.title === 'string' ? updatedTask.title : '',
      description: typeof updatedTask.description === 'string' ? updatedTask.description : '',
      acceptance: Array.isArray(updatedTask.acceptance) ? updatedTask.acceptance.map((item) => String(item)) : [],
      status: request.status,
    },
  };
}

function validateRequest(
  request: DraftTaskRequest,
  groundedContext: GroundedContextBundle,
): DraftTaskResult | null {
  if (!request.projectId || !request.phaseId || !request.title?.trim() || !request.description?.trim() || !request.query?.trim()) {
    return blocked('projectId, phaseId, title, description, and query are required.');
  }

  if (groundedContext.contradictions.length > 0) {
    return blocked('Victor refused draft task creation because the grounded context contains contradictions.');
  }

  if (groundedContext.missingInformation.length > 0) {
    return blocked(`Victor refused draft task creation because evidence is incomplete: ${groundedContext.missingInformation.join(' ')}`);
  }

  const groundedNodeCount = groundedContext.semanticNodes.filter((node) => ['Decision', 'Goal', 'Task'].includes(node.nodeType)).length;
  if (groundedNodeCount === 0) {
    return blocked('Victor refused draft task creation because no decision, goal, or task evidence was retrieved.');
  }

  return null;
}

function blocked(reason: string): DraftTaskResult {
  return {
    status: 'blocked',
    classification: 'blocked',
    reason,
  };
}

function validateTaskStatusRequest(
  request: UpdateTaskStatusRequest,
  groundedContext: GroundedContextBundle,
): UpdateTaskStatusResult | null {
  if (!request.projectId || !request.phaseId || !request.taskId || !request.status || !request.query?.trim()) {
    return blockedStatusUpdate('projectId, phaseId, taskId, status, and query are required.');
  }

  if (groundedContext.contradictions.length > 0) {
    return blockedStatusUpdate('Victor refused task status update because the grounded context contains contradictions.');
  }

  if (groundedContext.missingInformation.length > 0) {
    return blockedStatusUpdate(`Victor refused task status update because evidence is incomplete: ${groundedContext.missingInformation.join(' ')}`);
  }

  const relevantTaskNode = groundedContext.semanticNodes.find(
    (node) =>
      node.nodeType === 'Task'
      && (
        node.id === request.taskId
        || (request.taskTitle ? normalize(node.label) === normalize(request.taskTitle) : false)
        || normalize(node.label) === normalize(request.taskId)
        || normalize(String(node.attributes?.taskId ?? '')) === normalize(request.taskId)
      ),
  );

  if (!relevantTaskNode) {
    return blockedStatusUpdate('Victor refused task status update because no grounded task evidence matched the target task.');
  }

  return null;
}

function blockedStatusUpdate(reason: string): UpdateTaskStatusResult {
  return {
    status: 'blocked',
    classification: 'blocked',
    reason,
  };
}

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}

function derivePhaseStatus(tasks: Array<{ status?: unknown }>): 'planned' | 'active' | 'complete' | 'blocked' {
  if (tasks.some((task) => task.status === 'blocked')) {
    return 'blocked';
  }
  if (tasks.length > 0 && tasks.every((task) => task.status === 'done')) {
    return 'complete';
  }
  if (tasks.some((task) => task.status === 'in-progress')) {
    return 'active';
  }
  return 'planned';
}

function findDuplicateTask(
  phases: Array<Record<string, unknown>>,
  title: string,
): {
  taskId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance: string[];
  status: 'pending';
} | null {
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
        title: taskTitle,
        description: typeof task.description === 'string' ? task.description : '',
        acceptance: Array.isArray(task.acceptance) ? task.acceptance.map((item) => String(item)) : [],
        status: 'pending',
      };
    }
  }
  return null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeTaskStatus(
  value: unknown,
): BuilderConsoleTaskStatus {
  return value === 'in-progress' || value === 'done' || value === 'blocked' ? value : 'pending';
}
