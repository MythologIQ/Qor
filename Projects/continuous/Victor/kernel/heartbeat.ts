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
const DEFAULT_BASELINE_CADENCE_MS = 30 * 60 * 1000;
const MIN_ELEVATED_CADENCE_MS = 15 * 60 * 1000;
const MAX_ELEVATED_WINDOW_MS = 4 * 60 * 60 * 1000;
const DEFAULT_COOLDOWN_CYCLES = 2;
const DEFAULT_STALE_AFTER_MS = 90 * 60 * 1000;
const HEARTBEAT_REASONING_MODEL = 'Kimi K2.5';

type HeartbeatMode = 'dry-run' | 'execute';
type HeartbeatStatus = 'idle' | 'active' | 'paused' | 'stopped';
type HeartbeatTickStatus = 'completed' | 'blocked' | 'error' | null;
type HeartbeatWorkClass = 'coordination-review' | 'narrow-execution';
type HeartbeatCadenceMode = 'baseline' | 'elevated' | 'cooldown';
type HeartbeatFocusWindowStatus = 'inactive' | 'active' | 'cooldown';
type HeartbeatFocusWindowSource = 'manual' | 'self-started' | null;

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

interface PhaseStateSummary {
  phaseCount: number;
  pendingCount: number;
  inProgressCount: number;
  blockedCount: number;
}

export interface HeartbeatRequest {
  projectId?: string;
  projectsDir?: string;
  actorId?: string;
  dryRun?: boolean;
  cadenceMs?: number;
  requestedCadenceMs?: number;
  staleAfterMs?: number;
  maxActionsPerTick?: number;
  stopOnBlock?: boolean;
  maxConsecutiveBlocked?: number;
  maxConsecutiveFailures?: number;
  stateDir?: string;
  workClass?: HeartbeatWorkClass;
  focusWindowMode?: 'manual' | 'auto' | 'none';
  focusWindowReason?: string;
  reasoningModel?: string;
}

export interface HeartbeatContract {
  projectId: string;
  projectsDir: string;
  actorId: string;
  mode: HeartbeatMode;
  reasoningModel: string;
  baselineCadenceMs: number;
  cadenceMs: number;
  staleAfterMs: number;
  maxActionsPerTick: number;
  stopOnBlock: boolean;
  maxConsecutiveBlocked: number;
  maxConsecutiveFailures: number;
  stateDir: string;
  workClass: HeartbeatWorkClass;
  requestedCadenceMs: number | null;
  focusWindowMode: 'manual' | 'auto' | 'none';
  focusWindowReason: string | null;
}

export interface HeartbeatState {
  projectId: string;
  runId: string;
  actorId: string;
  mode: HeartbeatMode;
  reasoningModel: string;
  baselineCadenceMs: number;
  status: HeartbeatStatus;
  workClass: HeartbeatWorkClass;
  cadenceMode: HeartbeatCadenceMode;
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
  focusWindow: {
    status: HeartbeatFocusWindowStatus;
    source: HeartbeatFocusWindowSource;
    reason: string | null;
    startedAt: string | null;
    elevatedUntil: string | null;
    cooldownCyclesRemaining: number;
  };
}

export interface HeartbeatPreflightCheck {
  name: 'projects-dir' | 'path-state' | 'governance' | 'audit' | 'grounded-query' | 'focus-window' | 'reasoning-model';
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
  let phaseSummary: PhaseStateSummary = { phaseCount: 0, pendingCount: 0, inProgressCount: 0, blockedCount: 0 };

  try {
    phases = await readPhases(contract.projectId, contract.projectsDir);
    phaseSummary = summarizePhaseState(phases);
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

  checks.push({
    name: 'reasoning-model',
    passed: contract.reasoningModel === HEARTBEAT_REASONING_MODEL,
    detail:
      contract.reasoningModel === HEARTBEAT_REASONING_MODEL
        ? `Heartbeat reasoning is locked to ${HEARTBEAT_REASONING_MODEL}.`
        : `Heartbeat reasoning must use ${HEARTBEAT_REASONING_MODEL}, received ${contract.reasoningModel}.`,
  });

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

  const focusWindow = evaluateFocusWindowEligibility(contract, phaseSummary);
  checks.push({
    name: 'focus-window',
    passed: focusWindow.allowed,
    detail: focusWindow.detail,
  });

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
  const focusWindow = initializeFocusWindow(preflight.contract, now, preflight.checks);
  const state: HeartbeatState = {
    projectId: preflight.contract.projectId,
    runId: `heartbeat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    actorId: preflight.contract.actorId,
    mode: preflight.contract.mode,
    reasoningModel: preflight.contract.reasoningModel,
    baselineCadenceMs: preflight.contract.baselineCadenceMs,
    status: 'active',
    workClass: preflight.contract.workClass,
    cadenceMode: focusWindow.status === 'active' ? 'elevated' : 'baseline',
    cadenceMs: focusWindow.status === 'active' ? preflight.contract.cadenceMs : preflight.contract.baselineCadenceMs,
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
    focusWindow,
  };

  await writeHeartbeatStateToFile(stateFile, state);
  await appendHeartbeatLedgerEvent(preflight.contract, 'started', {
    runId: state.runId,
    stateFile,
    mode: state.mode,
    cadenceMs: state.cadenceMs,
    baselineCadenceMs: state.baselineCadenceMs,
    cadenceMode: state.cadenceMode,
    workClass: state.workClass,
    reasoningModel: state.reasoningModel,
    focusWindow: state.focusWindow,
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
    ...advanceHeartbeatTemporalState(state),
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
        dryRun: contract.mode === 'dry-run' || runningState.cadenceMode === 'cooldown',
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
    const reflectedState = applyCooldownCycle(nextState, automation.status);

    const finalState = shouldStopHeartbeat(reflectedState)
      ? stopState(reflectedState, `Heartbeat stopped after reaching safety thresholds. Last result: ${reflectedState.lastTickReason || automation.status}.`)
      : reflectedState;

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
      cadenceMode: finalState.cadenceMode,
      cadenceMs: finalState.cadenceMs,
      focusWindow: finalState.focusWindow,
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
    const reflectedState = applyCooldownCycle(failedState, 'error');
    const finalState = shouldStopHeartbeat(reflectedState)
      ? stopState(reflectedState, reflectedState.lastTickReason || 'Heartbeat stopped after repeated failures.')
      : reflectedState;
    await writeHeartbeatStateToFile(stateFile, finalState);
    await appendHeartbeatLedgerEvent(contract, 'tick', {
      runId: finalState.runId,
      stateFile,
      tickCount: finalState.tickCount,
      status: 'error',
      reason: finalState.lastTickReason,
      heartbeatStopped: finalState.status !== 'active',
      cadenceMode: finalState.cadenceMode,
      cadenceMs: finalState.cadenceMs,
      focusWindow: finalState.focusWindow,
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
  const baselineCadenceMs = normalizePositiveInt(request.cadenceMs, DEFAULT_BASELINE_CADENCE_MS);
  const requestedCadenceMs = request.requestedCadenceMs === undefined
    ? null
    : normalizePositiveInt(request.requestedCadenceMs, MIN_ELEVATED_CADENCE_MS);
  const cadenceMs = resolveRequestedCadence(request.workClass, baselineCadenceMs, requestedCadenceMs);
  const staleAfterMs = normalizePositiveInt(request.staleAfterMs, Math.max(DEFAULT_STALE_AFTER_MS, cadenceMs * 3));
  const reasoningModel = request.reasoningModel?.trim() || HEARTBEAT_REASONING_MODEL;

  if (reasoningModel !== HEARTBEAT_REASONING_MODEL) {
    throw new Error(`Heartbeat reasoning must use ${HEARTBEAT_REASONING_MODEL}.`);
  }

  return {
    projectId: request.projectId?.trim() || 'builder-console',
    projectsDir: resolveProjectsDir(request.projectsDir),
    actorId: request.actorId?.trim() || 'victor-heartbeat',
    mode: request.dryRun === false ? 'execute' : 'dry-run',
    reasoningModel,
    baselineCadenceMs,
    cadenceMs,
    staleAfterMs,
    maxActionsPerTick: normalizePositiveInt(request.maxActionsPerTick, 1),
    stopOnBlock: request.stopOnBlock !== false,
    maxConsecutiveBlocked: normalizePositiveInt(request.maxConsecutiveBlocked, 3),
    maxConsecutiveFailures: normalizePositiveInt(request.maxConsecutiveFailures, 2),
    stateDir: request.stateDir?.trim() || process.env.VICTOR_HEARTBEAT_STATE_DIR?.trim() || DEFAULT_STATE_DIR,
    workClass: request.workClass === 'narrow-execution' ? 'narrow-execution' : 'coordination-review',
    requestedCadenceMs,
    focusWindowMode: request.focusWindowMode === 'manual' || request.focusWindowMode === 'auto' ? request.focusWindowMode : 'none',
    focusWindowReason: request.focusWindowReason?.trim() || null,
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

function resolveRequestedCadence(
  workClass: HeartbeatRequest['workClass'],
  baselineCadenceMs: number,
  requestedCadenceMs: number | null,
): number {
  if (workClass !== 'narrow-execution') {
    return baselineCadenceMs;
  }
  if (requestedCadenceMs === null) {
    return MIN_ELEVATED_CADENCE_MS;
  }
  return Math.max(MIN_ELEVATED_CADENCE_MS, Math.min(requestedCadenceMs, baselineCadenceMs));
}

function summarizePhaseState(phases: BuilderConsolePhase[]): PhaseStateSummary {
  return phases.reduce<PhaseStateSummary>(
    (summary, phase) => {
      const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
      return {
        phaseCount: summary.phaseCount + 1,
        pendingCount: summary.pendingCount + tasks.filter((task) => task.status === 'pending').length,
        inProgressCount: summary.inProgressCount + tasks.filter((task) => task.status === 'in-progress').length,
        blockedCount: summary.blockedCount + tasks.filter((task) => task.status === 'blocked').length,
      };
    },
    { phaseCount: 0, pendingCount: 0, inProgressCount: 0, blockedCount: 0 },
  );
}

function evaluateFocusWindowEligibility(contract: HeartbeatContract, phaseSummary: PhaseStateSummary) {
  if (contract.workClass !== 'narrow-execution') {
    return {
      allowed: true,
      detail: `Work class ${contract.workClass} stays on the ${Math.floor(contract.baselineCadenceMs / 60000)}m baseline.`,
    };
  }
  if (contract.focusWindowMode === 'manual') {
    return {
      allowed: true,
      detail: `Manual focus window accepted for narrow execution at ${Math.floor(contract.cadenceMs / 60000)}m cadence.`,
    };
  }
  if (contract.focusWindowMode === 'auto' && phaseSummary.inProgressCount > 0) {
    return {
      allowed: true,
      detail: `Self-start focus window is eligible because ${phaseSummary.inProgressCount} governed task(s) are already in progress.`,
    };
  }
  if (contract.focusWindowMode === 'auto') {
    return {
      allowed: false,
      detail: 'Self-start focus window requires active governed work already in progress.',
    };
  }
  return {
    allowed: false,
    detail: 'Narrow execution requires a manual or self-started focus window before elevating above the 30m baseline.',
  };
}

function initializeFocusWindow(
  contract: HeartbeatContract,
  now: string,
  checks: HeartbeatPreflightCheck[],
): HeartbeatState['focusWindow'] {
  const focusCheck = checks.find((check) => check.name === 'focus-window');
  if (contract.workClass !== 'narrow-execution' || focusCheck?.passed !== true) {
    return {
      status: 'inactive',
      source: null,
      reason: focusCheck?.detail ?? null,
      startedAt: null,
      elevatedUntil: null,
      cooldownCyclesRemaining: 0,
    };
  }

  return {
    status: 'active',
    source: contract.focusWindowMode === 'manual' ? 'manual' : 'self-started',
    reason: contract.focusWindowReason || focusCheck.detail,
    startedAt: now,
    elevatedUntil: new Date(new Date(now).getTime() + MAX_ELEVATED_WINDOW_MS).toISOString(),
    cooldownCyclesRemaining: 0,
  };
}

function advanceHeartbeatTemporalState(state: HeartbeatState): HeartbeatState {
  if (
    state.focusWindow.status === 'active'
    && state.focusWindow.elevatedUntil
    && Date.now() >= new Date(state.focusWindow.elevatedUntil).getTime()
  ) {
    return {
      ...state,
      cadenceMode: 'cooldown',
      cadenceMs: state.baselineCadenceMs,
      focusWindow: {
        ...state.focusWindow,
        status: 'cooldown',
        cooldownCyclesRemaining: DEFAULT_COOLDOWN_CYCLES,
      },
    };
  }
  return state;
}

function applyCooldownCycle(state: HeartbeatState, tickStatus: HeartbeatTickStatus): HeartbeatState {
  if (state.focusWindow.status !== 'cooldown') {
    return state;
  }

  const nextRemaining = tickStatus === null
    ? state.focusWindow.cooldownCyclesRemaining
    : Math.max(0, state.focusWindow.cooldownCyclesRemaining - 1);
  const shouldExitCooldown = tickStatus !== null && nextRemaining === 0;

  return {
    ...state,
    cadenceMode: shouldExitCooldown ? 'baseline' : 'cooldown',
    cadenceMs: state.baselineCadenceMs,
    focusWindow: {
      ...state.focusWindow,
      status: shouldExitCooldown ? 'inactive' : 'cooldown',
      source: shouldExitCooldown ? null : state.focusWindow.source,
      reason: shouldExitCooldown ? 'Cooldown completed after elevated focus window.' : state.focusWindow.reason,
      startedAt: shouldExitCooldown ? null : state.focusWindow.startedAt,
      elevatedUntil: shouldExitCooldown ? null : state.focusWindow.elevatedUntil,
      cooldownCyclesRemaining: nextRemaining,
    },
  };
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
