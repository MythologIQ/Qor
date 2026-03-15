import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  ViewStore,
  createPlanningGovernance,
  createPlanningLedger,
  createProjectStore,
  createStoreIntegrity,
} from '../../Zo-Qore/runtime/planning';
import {
  previewGovernedAutomationSelection,
  runGovernedAutomationBuild,
  type GovernedBuildResult,
} from './governed-build-runner';
import type { GroundedContextBundle } from './memory/types';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Zo-Qore';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;
const DEFAULT_STATE_DIR = '/tmp/victor-heartbeat';
const DEFAULT_CADENCE_MS = 5 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

type HeartbeatMode = 'dry-run' | 'execute';
type HeartbeatStatus = 'idle' | 'active' | 'paused' | 'stopped';
type HeartbeatTickStatus = 'completed' | 'blocked' | 'error' | null;

interface BuilderConsoleTask {
  taskId: string;
  phaseId: string;
  title: string;
  description?: string;
  status?: string;
}

interface BuilderConsolePhase {
  phaseId: string;
  name: string;
  objective?: string;
  tasks?: BuilderConsoleTask[];
}

export interface HeartbeatRequest {
  projectId?: string;
  projectsDir?: string;
  actorId?: string;
  dryRun?: boolean;
  cadenceMs?: number;
  staleAfterMs?: number;
  maxActionsPerTick?: number;
  stopOnBlock?: boolean;
  maxConsecutiveBlocked?: number;
  maxConsecutiveFailures?: number;
  stateDir?: string;
}

export interface HeartbeatContract {
  projectId: string;
  projectsDir: string;
  actorId: string;
  mode: HeartbeatMode;
  cadenceMs: number;
  staleAfterMs: number;
  maxActionsPerTick: number;
  stopOnBlock: boolean;
  maxConsecutiveBlocked: number;
  maxConsecutiveFailures: number;
  stateDir: string;
}

export interface HeartbeatState {
  projectId: string;
  runId: string;
  actorId: string;
  mode: HeartbeatMode;
  status: HeartbeatStatus;
  cadenceMs: number;
  staleAfterMs: number;
  maxActionsPerTick: number;
  stopOnBlock: boolean;
  maxConsecutiveBlocked: number;
  maxConsecutiveFailures: number;
  stateFile: string;
  startedAt: string;
  updatedAt: string;
  lastTickStartedAt: string | null;
  lastTickCompletedAt: string | null;
  tickCount: number;
  consecutiveBlocked: number;
  consecutiveFailures: number;
  lastTickStatus: HeartbeatTickStatus;
  lastTickReason: string | null;
  lastError: string | null;
  lastAutomationRunId: string | null;
  lastSelectedTaskId: string | null;
}

export interface HeartbeatPreflightCheck {
  name: 'projects-dir' | 'path-state' | 'governance' | 'audit' | 'grounded-query';
  passed: boolean;
  detail: string;
}

export interface HeartbeatPreflightResult {
  ok: boolean;
  contract: HeartbeatContract;
  stateFile: string;
  checks: HeartbeatPreflightCheck[];
}

export interface HeartbeatStartResult {
  status: 'started' | 'blocked';
  preflight: HeartbeatPreflightResult;
  stateFile: string;
  state?: HeartbeatState;
  reason?: string;
}

export interface HeartbeatTickResult {
  status: 'completed' | 'blocked' | 'error';
  state: HeartbeatState;
  heartbeatStopped: boolean;
  automation?: GovernedBuildResult;
  reason: string;
}

export interface HeartbeatStopResult {
  status: 'stopped' | 'noop';
  state: HeartbeatState | null;
  reason: string;
}

export type HeartbeatGroundedQuery = (projectId: string, query: string) => Promise<GroundedContextBundle>;
export type HeartbeatGroundedQueryResolver = (contract: HeartbeatContract) => Promise<HeartbeatGroundedQuery>;

export async function runHeartbeatPreflight(
  request: HeartbeatRequest,
  resolveGroundedQuery: HeartbeatGroundedQueryResolver,
): Promise<HeartbeatPreflightResult> {
  const contract = resolveHeartbeatContract(request);
  const stateFile = resolveHeartbeatStateFile(contract);
  const checks: HeartbeatPreflightCheck[] = [];

  await ensureStateDir(contract.stateDir);

  checks.push({
    name: 'projects-dir',
    passed: existsSync(contract.projectsDir),
    detail: existsSync(contract.projectsDir)
      ? `Builder Console projects directory is available at ${contract.projectsDir}.`
      : `Builder Console projects directory does not exist: ${contract.projectsDir}`,
  });

  let phases: BuilderConsolePhase[] = [];
  let selectedTask: BuilderConsoleTask | null = null;

  try {
    phases = await readPhases(contract.projectId, contract.projectsDir);
    const preview = await previewGovernedAutomationSelection({
      projectId: contract.projectId,
      projectsDir: contract.projectsDir,
    });
    selectedTask = preview.selectedTask
      ? {
          taskId: preview.selectedTask.taskId,
          phaseId: preview.selectedTask.phaseId,
          title: preview.selectedTask.title,
          status: preview.selectedTask.status,
        }
      : null;
    checks.push({
      name: 'path-state',
      passed: phases.length > 0 && selectedTask !== null,
      detail: selectedTask
        ? `Path state is readable with ${phases.length} phases; selected governed task ${selectedTask.taskId} for heartbeat grounding.`
        : 'Path state is readable but no governed automation task is available for heartbeat work.',
    });
  } catch (error) {
    checks.push({
      name: 'path-state',
      passed: false,
      detail: error instanceof Error ? error.message : 'Failed to read Builder Console path state.',
    });
  }

  try {
    if (!selectedTask) {
      throw new Error('No target task is available for governance preflight.');
    }
    const governance = await loadPlanningGovernance(contract.projectId, contract.projectsDir);
    const evaluation = await governance.evaluateAction(
      contract.actorId,
      'planning:path:update-task-status',
      contract.projectId,
      {
        phaseId: selectedTask.phaseId,
        taskId: selectedTask.taskId,
        taskTitle: selectedTask.title,
        status: selectedTask.status === 'in-progress' ? 'done' : 'in-progress',
        query: buildHeartbeatQuery(selectedTask, phases),
        groundedNodeIds: [],
      },
    );
    checks.push({
      name: 'governance',
      passed: evaluation.allowed,
      detail: evaluation.allowed
        ? 'Governance approved a representative heartbeat task action.'
        : evaluation.reason || 'Governance denied the representative heartbeat task action.',
    });
  } catch (error) {
    checks.push({
      name: 'governance',
      passed: false,
      detail: error instanceof Error ? error.message : 'Governance preflight failed.',
    });
  }

  try {
    await appendHeartbeatLedgerEvent(contract, 'preflight', {
      stateFile,
      mode: contract.mode,
      at: new Date().toISOString(),
    });
    checks.push({
      name: 'audit',
      passed: true,
      detail: 'Heartbeat audit ledger write succeeded.',
    });
  } catch (error) {
    checks.push({
      name: 'audit',
      passed: false,
      detail: error instanceof Error ? error.message : 'Heartbeat audit write failed.',
    });
  }

  try {
    if (!selectedTask) {
      throw new Error('No target task is available for grounded query preflight.');
    }
    const groundedQuery = await resolveGroundedQuery(contract);
    const result = await groundedQuery(contract.projectId, buildHeartbeatQuery(selectedTask, phases));
    checks.push({
      name: 'grounded-query',
      passed: Array.isArray(result.semanticNodes) && Array.isArray(result.chunkHits),
      detail: `Grounded query returned ${result.semanticNodes.length} semantic nodes and ${result.chunkHits.length} chunk hits.`,
    });
  } catch (error) {
    checks.push({
      name: 'grounded-query',
      passed: false,
      detail: error instanceof Error ? error.message : 'Grounded query preflight failed.',
    });
  }

  return {
    ok: checks.every((check) => check.passed),
    contract,
    stateFile,
    checks,
  };
}

export async function startHeartbeat(
  request: HeartbeatRequest,
  resolveGroundedQuery: HeartbeatGroundedQueryResolver,
): Promise<HeartbeatStartResult> {
  const preflight = await runHeartbeatPreflight(request, resolveGroundedQuery);
  const stateFile = resolveHeartbeatStateFile(preflight.contract);

  if (!preflight.ok) {
    return {
      status: 'blocked',
      preflight,
      stateFile,
      reason: 'Heartbeat preflight failed.',
    };
  }

  const existing = await readHeartbeatStateFromFile(stateFile);
  if (existing && existing.status === 'active' && !isLeaseStale(existing)) {
    await appendHeartbeatLedgerEvent(preflight.contract, 'lease-blocked', {
      stateFile,
      activeRunId: existing.runId,
      activeSince: existing.startedAt,
    });
    return {
      status: 'blocked',
      preflight,
      stateFile,
      reason: `Heartbeat is already active under run ${existing.runId}.`,
      state: existing,
    };
  }

  const now = new Date().toISOString();
  const state: HeartbeatState = {
    projectId: preflight.contract.projectId,
    runId: `heartbeat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    actorId: preflight.contract.actorId,
    mode: preflight.contract.mode,
    status: 'active',
    cadenceMs: preflight.contract.cadenceMs,
    staleAfterMs: preflight.contract.staleAfterMs,
    maxActionsPerTick: preflight.contract.maxActionsPerTick,
    stopOnBlock: preflight.contract.stopOnBlock,
    maxConsecutiveBlocked: preflight.contract.maxConsecutiveBlocked,
    maxConsecutiveFailures: preflight.contract.maxConsecutiveFailures,
    stateFile,
    startedAt: now,
    updatedAt: now,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    tickCount: 0,
    consecutiveBlocked: 0,
    consecutiveFailures: 0,
    lastTickStatus: null,
    lastTickReason: null,
    lastError: null,
    lastAutomationRunId: null,
    lastSelectedTaskId: null,
  };

  await writeHeartbeatStateToFile(stateFile, state);
  await appendHeartbeatLedgerEvent(preflight.contract, 'started', {
    runId: state.runId,
    stateFile,
    mode: state.mode,
    cadenceMs: state.cadenceMs,
  });

  return {
    status: 'started',
    preflight,
    stateFile,
    state,
  };
}

export async function tickHeartbeat(
  request: HeartbeatRequest,
  resolveGroundedQuery: HeartbeatGroundedQueryResolver,
): Promise<HeartbeatTickResult> {
  const contract = resolveHeartbeatContract(request);
  const stateFile = resolveHeartbeatStateFile(contract);
  const state = await readHeartbeatStateFromFile(stateFile);

  if (!state || state.status !== 'active') {
    throw new Error('Heartbeat is not active. Start it before running a tick.');
  }
  if (isLeaseStale(state)) {
    const stopped = stopState(state, 'Heartbeat lease became stale before the next tick.');
    await writeHeartbeatStateToFile(stateFile, stopped);
    await appendHeartbeatLedgerEvent(contract, 'stopped', {
      runId: stopped.runId,
      reason: stopped.lastTickReason,
      stateFile,
    });
    return {
      status: 'error',
      state: stopped,
      heartbeatStopped: true,
      reason: stopped.lastTickReason || 'Heartbeat lease became stale.',
    };
  }

  const startedAt = new Date().toISOString();
  const runningState: HeartbeatState = {
    ...state,
    updatedAt: startedAt,
    lastTickStartedAt: startedAt,
    lastError: null,
  };
  await writeHeartbeatStateToFile(stateFile, runningState);

  try {
    const groundedQuery = await resolveGroundedQuery(contract);
    const automation = await runGovernedAutomationBuild(
      {
        projectId: contract.projectId,
        projectsDir: contract.projectsDir,
        dryRun: contract.mode === 'dry-run',
        actorId: contract.actorId,
        maxActions: contract.maxActionsPerTick,
      },
      groundedQuery,
    );

    const completedAt = new Date().toISOString();
    const nextState = {
      ...runningState,
      updatedAt: completedAt,
      lastTickCompletedAt: completedAt,
      tickCount: runningState.tickCount + 1,
      lastTickStatus: automation.status,
      lastTickReason: automation.selectionReason || automation.automation.results[0]?.reason || null,
      lastAutomationRunId: automation.automation.runId,
      lastSelectedTaskId: automation.selectedTask?.taskId ?? null,
      consecutiveBlocked: automation.status === 'blocked' ? runningState.consecutiveBlocked + 1 : 0,
      consecutiveFailures: 0,
    } satisfies HeartbeatState;

    const finalState = shouldStopHeartbeat(nextState)
      ? stopState(nextState, `Heartbeat stopped after reaching safety thresholds. Last result: ${nextState.lastTickReason || automation.status}.`)
      : nextState;

    await writeHeartbeatStateToFile(stateFile, finalState);
    await appendHeartbeatLedgerEvent(contract, 'tick', {
      runId: finalState.runId,
      stateFile,
      tickCount: finalState.tickCount,
      status: automation.status,
      automationRunId: automation.automation.runId,
      selectedTaskId: automation.selectedTask?.taskId ?? null,
      reason: finalState.lastTickReason,
      heartbeatStopped: finalState.status !== 'active',
    });
    if (finalState.status !== 'active') {
      await appendHeartbeatLedgerEvent(contract, 'stopped', {
        runId: finalState.runId,
        reason: finalState.lastTickReason,
        stateFile,
      });
    }

    return {
      status: automation.status,
      state: finalState,
      heartbeatStopped: finalState.status !== 'active',
      automation,
      reason: finalState.lastTickReason || automation.status,
    };
  } catch (error) {
    const failedState = {
      ...runningState,
      updatedAt: new Date().toISOString(),
      lastTickCompletedAt: new Date().toISOString(),
      tickCount: runningState.tickCount + 1,
      lastTickStatus: 'error',
      lastTickReason: error instanceof Error ? error.message : 'Heartbeat tick failed.',
      lastError: error instanceof Error ? error.message : 'Heartbeat tick failed.',
      consecutiveFailures: runningState.consecutiveFailures + 1,
    } satisfies HeartbeatState;
    const finalState = shouldStopHeartbeat(failedState)
      ? stopState(failedState, failedState.lastTickReason || 'Heartbeat stopped after repeated failures.')
      : failedState;
    await writeHeartbeatStateToFile(stateFile, finalState);
    await appendHeartbeatLedgerEvent(contract, 'tick', {
      runId: finalState.runId,
      stateFile,
      tickCount: finalState.tickCount,
      status: 'error',
      reason: finalState.lastTickReason,
      heartbeatStopped: finalState.status !== 'active',
    });
    if (finalState.status !== 'active') {
      await appendHeartbeatLedgerEvent(contract, 'stopped', {
        runId: finalState.runId,
        reason: finalState.lastTickReason,
        stateFile,
      });
    }
    return {
      status: 'error',
      state: finalState,
      heartbeatStopped: finalState.status !== 'active',
      reason: finalState.lastTickReason || 'Heartbeat tick failed.',
    };
  }
}

export async function getHeartbeatStatus(request: HeartbeatRequest): Promise<HeartbeatState | null> {
  const contract = resolveHeartbeatContract(request);
  return readHeartbeatStateFromFile(resolveHeartbeatStateFile(contract));
}

export async function stopHeartbeat(request: HeartbeatRequest, reason?: string): Promise<HeartbeatStopResult> {
  const contract = resolveHeartbeatContract(request);
  const stateFile = resolveHeartbeatStateFile(contract);
  const state = await readHeartbeatStateFromFile(stateFile);

  if (!state) {
    return {
      status: 'noop',
      state: null,
      reason: 'Heartbeat state does not exist.',
    };
  }

  const stopped = stopState(state, reason || 'Heartbeat stopped by operator.');
  await writeHeartbeatStateToFile(stateFile, stopped);
  await appendHeartbeatLedgerEvent(contract, 'stopped', {
    runId: stopped.runId,
    reason: stopped.lastTickReason,
    stateFile,
  });

  return {
    status: 'stopped',
    state: stopped,
    reason: stopped.lastTickReason || 'Heartbeat stopped by operator.',
  };
}

function resolveHeartbeatContract(request: HeartbeatRequest): HeartbeatContract {
  const cadenceMs = normalizePositiveInt(request.cadenceMs, DEFAULT_CADENCE_MS);
  const staleAfterMs = normalizePositiveInt(request.staleAfterMs, Math.max(DEFAULT_STALE_AFTER_MS, cadenceMs * 3));

  return {
    projectId: request.projectId?.trim() || 'builder-console',
    projectsDir: resolveProjectsDir(request.projectsDir),
    actorId: request.actorId?.trim() || 'victor-heartbeat',
    mode: request.dryRun === false ? 'execute' : 'dry-run',
    cadenceMs,
    staleAfterMs,
    maxActionsPerTick: normalizePositiveInt(request.maxActionsPerTick, 1),
    stopOnBlock: request.stopOnBlock !== false,
    maxConsecutiveBlocked: normalizePositiveInt(request.maxConsecutiveBlocked, 3),
    maxConsecutiveFailures: normalizePositiveInt(request.maxConsecutiveFailures, 2),
    stateDir: request.stateDir?.trim() || process.env.VICTOR_HEARTBEAT_STATE_DIR?.trim() || DEFAULT_STATE_DIR,
  };
}

function resolveProjectsDir(projectsDir?: string): string {
  return projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
}

function resolveHeartbeatStateFile(contract: HeartbeatContract): string {
  return join(contract.stateDir, `${contract.projectId}.json`);
}

async function ensureStateDir(stateDir: string) {
  await mkdir(stateDir, { recursive: true });
}

async function readHeartbeatStateFromFile(stateFile: string): Promise<HeartbeatState | null> {
  if (!existsSync(stateFile)) {
    return null;
  }
  const raw = await readFile(stateFile, 'utf8');
  return JSON.parse(raw) as HeartbeatState;
}

async function writeHeartbeatStateToFile(stateFile: string, state: HeartbeatState) {
  await ensureStateDir(dirname(stateFile));
  const tmpFile = `${stateFile}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmpFile, stateFile);
}

async function readPhases(projectId: string, projectsDir: string): Promise<BuilderConsolePhase[]> {
  const pathStore = new ViewStore(projectsDir, projectId, 'path', {
    ledger: createPlanningLedger(projectId, projectsDir),
    integrity: createStoreIntegrity(projectsDir),
  });
  const payload = await pathStore.read<{ phases?: BuilderConsolePhase[] }>();
  return payload?.phases ?? [];
}

async function loadPlanningGovernance(projectId: string, projectsDir: string) {
  const projectStore = createProjectStore(projectId, projectsDir, { enableLedger: true });
  const storeIntegrity = createStoreIntegrity(projectsDir);
  return createPlanningGovernance(projectStore, storeIntegrity);
}

function buildHeartbeatQuery(task: BuilderConsoleTask, phases: BuilderConsolePhase[]) {
  const phaseName = phases.find((phase) => phase.phaseId === task.phaseId)?.name || task.phaseId;
  return `What should happen next with the governed automation task "${task.title}" in phase "${phaseName}"?`;
}

function shouldStopHeartbeat(state: HeartbeatState): boolean {
  return state.consecutiveBlocked >= state.maxConsecutiveBlocked
    || state.consecutiveFailures >= state.maxConsecutiveFailures;
}

function stopState(state: HeartbeatState, reason: string): HeartbeatState {
  return {
    ...state,
    status: 'stopped',
    updatedAt: new Date().toISOString(),
    lastTickReason: reason,
  };
}

function isLeaseStale(state: HeartbeatState): boolean {
  const lastSignal = state.lastTickCompletedAt || state.lastTickStartedAt || state.updatedAt || state.startedAt;
  return Date.now() - new Date(lastSignal).getTime() > state.staleAfterMs;
}

async function appendHeartbeatLedgerEvent(
  contract: HeartbeatContract,
  event: 'preflight' | 'started' | 'tick' | 'stopped' | 'lease-blocked',
  payload: Record<string, unknown>,
) {
  const ledger = createPlanningLedger(contract.projectId, contract.projectsDir);
  await ledger.appendEntry({
    projectId: contract.projectId,
    view: 'autonomy',
    action: 'claim',
    artifactId: `heartbeat:${event}:${Date.now()}`,
    actorId: contract.actorId,
    checksumBefore: null,
    checksumAfter: null,
    payload: {
      source: 'victor-heartbeat',
      event,
      mode: contract.mode,
      ...payload,
    },
  });
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}
