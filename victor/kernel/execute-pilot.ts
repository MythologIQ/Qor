/**
 * Bounded Unattended Execute Pilot Runner
 *
 * Runs Victor in unattended execute mode with explicit bounds:
 * - 30-minute baseline cadence
 * - Maximum runtime limit (default 30 minutes)
 * - Maximum tick limit (default 6 ticks at 5-min cadence)
 * - Explicit kill-switch via state file
 * - Verification packet generation for after-action review
 *
 * @module execute-pilot
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  startHeartbeat,
  tickHeartbeat,
  type HeartbeatRequest,
  type HeartbeatTickResult,
  type HeartbeatStartResult,
  type HeartbeatContract,
} from './heartbeat';
import type { GroundedContextBundle } from './memory/types';

const DEFAULT_PILOT_STATE_DIR = '/tmp/victor-execute-pilot';
const DEFAULT_BASELINE_CADENCE_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_RUNTIME_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_TICKS = 6; // At 5-min cadence within 30-min window
const DEFAULT_MAX_ACTIONS_PER_TICK = 1;
const DEFAULT_MAX_CONSECUTIVE_BLOCKED = 2;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 2;
const KILL_SWITCH_FILE = 'KILL';
const PILOT_VERSION = '1.0.0';

/** Grounded query function type */
export type PilotGroundedQuery = (projectId: string, query: string) => Promise<GroundedContextBundle>;

/** Grounded query resolver type */
export type PilotGroundedQueryResolver = (contract: HeartbeatContract) => Promise<PilotGroundedQuery>;

/** Pilot execution mode */
export type PilotMode = 'dry-run' | 'execute';

/** Pilot run status */
export type PilotStatus =
  | 'initialized'
  | 'running'
  | 'completed'
  | 'killed'
  | 'blocked'
  | 'failed'
  | 'timeout';

/** Pilot safety bounds */
export interface PilotBounds {
  /** Maximum runtime in milliseconds (default: 30 minutes) */
  maxRuntimeMs: number;
  /** Maximum number of ticks (default: 6) */
  maxTicks: number;
  /** Maximum actions per tick (default: 1) */
  maxActionsPerTick: number;
  /** Maximum consecutive blocked ticks before stop (default: 2) */
  maxConsecutiveBlocked: number;
  /** Maximum consecutive failures before stop (default: 2) */
  maxConsecutiveFailures: number;
}

/** Pilot configuration */
export interface PilotConfig {
  /** Project ID to run automation against */
  projectId: string;
  /** Projects directory path */
  projectsDir?: string;
  /** Actor ID for audit trail */
  actorId: string;
  /** Execution mode: dry-run or execute */
  mode: PilotMode;
  /** State directory for pilot files */
  stateDir: string;
  /** Baseline cadence in milliseconds (default: 30 minutes) */
  cadenceMs: number;
  /** Safety bounds */
  bounds: PilotBounds;
  /** Reasoning model (must be Kimi K2.5) */
  reasoningModel: string;
}

/** Individual tick record in verification packet */
export interface PilotTickRecord {
  tickNumber: number;
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'blocked' | 'error';
  automationRunId: string | null;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  actionsExecuted: number;
  actionsBlocked: number;
  reason: string | null;
  heartbeatStopped: boolean;
}

/** Verification packet for after-action review */
export interface PilotVerificationPacket {
  version: string;
  config: PilotConfig;
  status: PilotStatus;
  startedAt: string;
  completedAt: string | null;
  terminationReason: string | null;
  totalTicks: number;
  totalActionsExecuted: number;
  totalActionsBlocked: number;
  ticks: PilotTickRecord[];
  finalState: {
    consecutiveBlocked: number;
    consecutiveFailures: number;
    lastTickStatus: string | null;
    lastError: string | null;
  };
}

/** Pilot runtime state */
export interface PilotState {
  runId: string;
  config: PilotConfig;
  status: PilotStatus;
  startedAt: string;
  lastTickAt: string | null;
  tickCount: number;
  ticks: PilotTickRecord[];
  packet: PilotVerificationPacket;
}

/** Pilot execution result */
export interface PilotResult {
  status: PilotStatus;
  packet: PilotVerificationPacket;
  stateFile: string;
}

/**
 * Create default pilot configuration
 */
export function createPilotConfig(
  overrides: Partial<PilotConfig> & { projectId: string; mode: PilotMode },
): PilotConfig {
  const stateDir =
    overrides.stateDir?.trim() ||
    process.env.VICTOR_EXECUTE_PILOT_STATE_DIR?.trim() ||
    DEFAULT_PILOT_STATE_DIR;

  return {
    projectId: overrides.projectId,
    projectsDir: overrides.projectsDir,
    actorId: overrides.actorId?.trim() || 'victor-execute-pilot',
    mode: overrides.mode,
    stateDir,
    cadenceMs: overrides.cadenceMs || DEFAULT_BASELINE_CADENCE_MS,
    reasoningModel: 'Kimi K2.5',
    bounds: {
      maxRuntimeMs: overrides.bounds?.maxRuntimeMs || DEFAULT_MAX_RUNTIME_MS,
      maxTicks: overrides.bounds?.maxTicks || DEFAULT_MAX_TICKS,
      maxActionsPerTick:
        overrides.bounds?.maxActionsPerTick || DEFAULT_MAX_ACTIONS_PER_TICK,
      maxConsecutiveBlocked:
        overrides.bounds?.maxConsecutiveBlocked ||
        DEFAULT_MAX_CONSECUTIVE_BLOCKED,
      maxConsecutiveFailures:
        overrides.bounds?.maxConsecutiveFailures ||
        DEFAULT_MAX_CONSECUTIVE_FAILURES,
    },
  };
}

/**
 * Initialize a new pilot run
 */
export async function initializePilot(
  config: PilotConfig,
): Promise<PilotState> {
  const stateDir = config.stateDir;
  await mkdir(stateDir, { recursive: true });

  // Clear any existing kill switch
  const killSwitchPath = join(stateDir, KILL_SWITCH_FILE);
  if (existsSync(killSwitchPath)) {
    await writeFile(killSwitchPath, '', 'utf8');
  }

  const runId = `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = new Date().toISOString();

  const packet: PilotVerificationPacket = {
    version: PILOT_VERSION,
    config,
    status: 'initialized',
    startedAt,
    completedAt: null,
    terminationReason: null,
    totalTicks: 0,
    totalActionsExecuted: 0,
    totalActionsBlocked: 0,
    ticks: [],
    finalState: {
      consecutiveBlocked: 0,
      consecutiveFailures: 0,
      lastTickStatus: null,
      lastError: null,
    },
  };

  const state: PilotState = {
    runId,
    config,
    status: 'initialized',
    startedAt,
    lastTickAt: null,
    tickCount: 0,
    ticks: [],
    packet,
  };

  await writePilotState(stateDir, runId, state);
  await writePacket(stateDir, runId, packet);

  return state;
}

/**
 * Check if kill switch is active
 */
export function isKillSwitchActive(stateDir: string): boolean {
  const killSwitchPath = join(stateDir, KILL_SWITCH_FILE);
  if (!existsSync(killSwitchPath)) {
    return false;
  }
  try {
    const content = readFile(killSwitchPath, 'utf8');
    return content.then(c => c.trim() === 'KILL').catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Set kill switch to stop pilot
 */
export async function setKillSwitch(stateDir: string): Promise<void> {
  const killSwitchPath = join(stateDir, KILL_SWITCH_FILE);
  await writeFile(killSwitchPath, 'KILL', 'utf8');
}

/**
 * Check if pilot should stop based on bounds
 */
export function checkBounds(
  state: PilotState,
): { shouldStop: boolean; reason: string | null } {
  const config = state.config;
  const now = Date.now();
  const startedAt = new Date(state.startedAt).getTime();

  // Check kill switch
  if (existsSync(join(config.stateDir, KILL_SWITCH_FILE))) {
    return { shouldStop: true, reason: 'Kill switch activated' };
  }

  // Check runtime limit
  if (now - startedAt >= config.bounds.maxRuntimeMs) {
    return { shouldStop: true, reason: 'Maximum runtime exceeded' };
  }

  // Check tick limit
  if (state.tickCount >= config.bounds.maxTicks) {
    return { shouldStop: true, reason: 'Maximum tick count reached' };
  }

  return { shouldStop: false, reason: null };
}

/**
 * Start the pilot heartbeat
 */
export async function startPilotHeartbeat(
  state: PilotState,
  resolveGroundedQuery: PilotGroundedQueryResolver,
): Promise<HeartbeatStartResult> {
  const config = state.config;

  const request: HeartbeatRequest = {
    projectId: config.projectId,
    projectsDir: config.projectsDir,
    actorId: config.actorId,
    dryRun: config.mode === 'dry-run',
    cadenceMs: config.cadenceMs,
    maxActionsPerTick: config.bounds.maxActionsPerTick,
    maxConsecutiveBlocked: config.bounds.maxConsecutiveBlocked,
    maxConsecutiveFailures: config.bounds.maxConsecutiveFailures,
    stopOnBlock: true,
    stateDir: config.stateDir,
    reflectionDir: join(config.stateDir, 'reflections'),
    reasoningModel: config.reasoningModel,
  };

  return startHeartbeat(request, resolveGroundedQuery);
}

/**
 * Run a single pilot tick
 */
export async function runPilotTick(
  state: PilotState,
  resolveGroundedQuery: PilotGroundedQueryResolver,
): Promise<{
  result: HeartbeatTickResult;
  record: PilotTickRecord;
}> {
  const config = state.config;

  const request: HeartbeatRequest = {
    projectId: config.projectId,
    projectsDir: config.projectsDir,
    actorId: config.actorId,
    dryRun: config.mode === 'dry-run',
    cadenceMs: config.cadenceMs,
    maxActionsPerTick: config.bounds.maxActionsPerTick,
    maxConsecutiveBlocked: config.bounds.maxConsecutiveBlocked,
    maxConsecutiveFailures: config.bounds.maxConsecutiveFailures,
    stopOnBlock: true,
    stateDir: config.stateDir,
    reflectionDir: join(config.stateDir, 'reflections'),
    reasoningModel: config.reasoningModel,
  };

  const tickStartedAt = new Date().toISOString();
  const result = await tickHeartbeat(request, resolveGroundedQuery);
  const tickCompletedAt = new Date().toISOString();

  const record: PilotTickRecord = {
    tickNumber: state.tickCount + 1,
    startedAt: tickStartedAt,
    completedAt: tickCompletedAt,
    status: result.status,
    automationRunId: result.automation?.automation.runId || null,
    selectedTaskId: result.automation?.selectedTask?.taskId || null,
    selectedTaskTitle: result.automation?.selectedTask?.title || null,
    actionsExecuted: result.automation?.automation.executedCount || 0,
    actionsBlocked: result.automation?.automation.blockedCount || 0,
    reason: result.reason || null,
    heartbeatStopped: result.heartbeatStopped,
  };

  return { result, record };
}

/**
 * Run the complete pilot
 */
export async function runExecutePilot(
  config: PilotConfig,
  resolveGroundedQuery: PilotGroundedQueryResolver,
): Promise<PilotResult> {
  // Initialize
  let state = await initializePilot(config);
  const stateDir = config.stateDir;

  state.status = 'running';
  await writePilotState(stateDir, state.runId, state);

  try {
    // Start heartbeat
    const startResult = await startPilotHeartbeat(state, resolveGroundedQuery);
    if (startResult.status === 'blocked') {
      state.status = 'blocked';
      state.packet.status = 'blocked';
      state.packet.terminationReason =
        startResult.reason || 'Preflight checks failed';
      state.packet.completedAt = new Date().toISOString();
      await writePilotState(stateDir, state.runId, state);
      await writePacket(stateDir, state.runId, state.packet);
      return {
        status: 'blocked',
        packet: state.packet,
        stateFile: getStateFilePath(stateDir, state.runId),
      };
    }

    // Run ticks until bounds or completion
    while (true) {
      // Check bounds before tick
      const boundsCheck = checkBounds(state);
      if (boundsCheck.shouldStop) {
        state.status = boundsCheck.reason?.includes('Kill')
          ? 'killed'
          : boundsCheck.reason?.includes('runtime')
            ? 'timeout'
            : 'completed';
        state.packet.status = state.status;
        state.packet.terminationReason = boundsCheck.reason;
        break;
      }

      // Run tick
      const { result, record } = await runPilotTick(state, resolveGroundedQuery);

      // Update state
      state.tickCount++;
      state.lastTickAt = record.completedAt;
      state.ticks.push(record);
      state.packet.ticks.push(record);
      state.packet.totalTicks = state.tickCount;
      state.packet.totalActionsExecuted += record.actionsExecuted;
      state.packet.totalActionsBlocked += record.actionsBlocked;
      state.packet.finalState.consecutiveBlocked =
        result.state.consecutiveBlocked;
      state.packet.finalState.consecutiveFailures =
        result.state.consecutiveFailures;
      state.packet.finalState.lastTickStatus = result.state.lastTickStatus;
      state.packet.finalState.lastError = result.state.lastError;

      await writePilotState(stateDir, state.runId, state);
      await writePacket(stateDir, state.runId, state.packet);

      // Check if heartbeat stopped
      if (result.heartbeatStopped) {
        state.status =
          result.status === 'error'
            ? 'failed'
            : result.status === 'blocked'
              ? 'blocked'
              : 'completed';
        state.packet.status = state.status;
        state.packet.terminationReason =
          result.reason || `Heartbeat stopped after tick ${state.tickCount}`;
        break;
      }

      // Wait for cadence if continuing
      if (!boundsCheck.shouldStop && !result.heartbeatStopped) {
        const nextTickAt =
          new Date(record.completedAt).getTime() + config.cadenceMs;
        const now = Date.now();
        if (nextTickAt > now) {
          await sleep(nextTickAt - now);
        }
      }
    }

    // Finalize
    state.packet.completedAt = new Date().toISOString();
    await writePilotState(stateDir, state.runId, state);
    await writePacket(stateDir, state.runId, state.packet);

    return {
      status: state.status,
      packet: state.packet,
      stateFile: getStateFilePath(stateDir, state.runId),
    };
  } catch (error) {
    // Handle unexpected errors
    state.status = 'failed';
    state.packet.status = 'failed';
    state.packet.terminationReason =
      error instanceof Error ? error.message : 'Unexpected error during pilot';
    state.packet.completedAt = new Date().toISOString();
    state.packet.finalState.lastError = state.packet.terminationReason;
    await writePilotState(stateDir, state.runId, state);
    await writePacket(stateDir, state.runId, state.packet);

    return {
      status: 'failed',
      packet: state.packet,
      stateFile: getStateFilePath(stateDir, state.runId),
    };
  }
}

/**
 * Get state file path
 */
function getStateFilePath(stateDir: string, runId: string): string {
  return join(stateDir, `${runId}.json`);
}

/**
 * Get packet file path
 */
function getPacketFilePath(stateDir: string, runId: string): string {
  return join(stateDir, `${runId}-packet.json`);
}

/**
 * Write pilot state to file
 */
async function writePilotState(
  stateDir: string,
  runId: string,
  state: PilotState,
): Promise<void> {
  const stateFile = getStateFilePath(stateDir, runId);
  await mkdir(dirname(stateFile), { recursive: true });
  const tmpFile = `${stateFile}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmpFile, stateFile);
}

/**
 * Write verification packet to file
 */
async function writePacket(
  stateDir: string,
  runId: string,
  packet: PilotVerificationPacket,
): Promise<void> {
  const packetFile = getPacketFilePath(stateDir, runId);
  await mkdir(dirname(packetFile), { recursive: true });
  const tmpFile = `${packetFile}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  await rename(tmpFile, packetFile);
}

/**
 * Load pilot state from file
 */
export async function loadPilotState(
  stateDir: string,
  runId: string,
): Promise<PilotState | null> {
  const stateFile = getStateFilePath(stateDir, runId);
  if (!existsSync(stateFile)) {
    return null;
  }
  const raw = await readFile(stateFile, 'utf8');
  return JSON.parse(raw) as PilotState;
}

/**
 * Load verification packet from file
 */
export async function loadPacket(
  stateDir: string,
  runId: string,
): Promise<PilotVerificationPacket | null> {
  const packetFile = getPacketFilePath(stateDir, runId);
  if (!existsSync(packetFile)) {
    return null;
  }
  const raw = await readFile(packetFile, 'utf8');
  return JSON.parse(raw) as PilotVerificationPacket;
}

/**
 * List all pilot runs in state directory
 */
export async function listPilotRuns(
  stateDir: string,
): Promise<Array<{ runId: string; status: PilotStatus; startedAt: string }>> {
  const runs: Array<{ runId: string; status: PilotStatus; startedAt: string }> =
    [];

  if (!existsSync(stateDir)) {
    return runs;
  }

  // Read directory and find state files
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(stateDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('-packet')) {
      const runId = entry.name.replace('.json', '');
      const state = await loadPilotState(stateDir, runId);
      if (state) {
        runs.push({
          runId,
          status: state.status,
          startedAt: state.startedAt,
        });
      }
    }
  }

  return runs.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format pilot result for display
 */
export function formatPilotResult(result: PilotResult): string {
  const packet = result.packet;
  const lines = [
    `Execute Pilot Result: ${result.status.toUpperCase()}`,
    `Run ID: ${result.stateFile.split('/').pop()?.replace('.json', '')}`,
    `Started: ${packet.startedAt}`,
    `Completed: ${packet.completedAt || 'N/A'}`,
    `Termination: ${packet.terminationReason || 'N/A'}`,
    ``,
    `Ticks: ${packet.totalTicks}`,
    `Actions Executed: ${packet.totalActionsExecuted}`,
    `Actions Blocked: ${packet.totalActionsBlocked}`,
    ``,
    `Final State:`,
    `  Consecutive Blocked: ${packet.finalState.consecutiveBlocked}`,
    `  Consecutive Failures: ${packet.finalState.consecutiveFailures}`,
    `  Last Tick Status: ${packet.finalState.lastTickStatus || 'N/A'}`,
    `  Last Error: ${packet.finalState.lastError || 'None'}`,
    ``,
    `Tick Details:`,
  ];

  for (const tick of packet.ticks) {
    lines.push(
      `  Tick ${tick.tickNumber}: ${tick.status} | Task: ${tick.selectedTaskTitle || 'N/A'} | Actions: ${tick.actionsExecuted}/${tick.actionsExecuted + tick.actionsBlocked}`,
    );
  }

  return lines.join('\n');
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  function parseArg(name: string): string | undefined {
    const idx = args.findIndex(a => a.startsWith(`${name}=`));
    return idx >= 0 ? args[idx].split('=')[1] : undefined;
  }
  
  function hasFlag(name: string): boolean {
    return args.includes(name);
  }
  
  function showHelp(): void {
    console.log(`
Victor Bounded Unattended Execute Pilot

Usage: bun run execute-pilot.ts [options]

Required:
  --project-id=<id>     Project ID to run automation against
  --mode=<mode>         Execution mode: dry-run or execute

Optional:
  --state-dir=<path>    State directory (default: /tmp/victor-execute-pilot)
  --max-ticks=<n>       Maximum ticks (default: 6)
  --max-runtime=<min>   Maximum runtime in minutes (default: 30)
  --help                Show this help message

Examples:
  bun run execute-pilot.ts --project-id=victor-resident --mode=dry-run
  bun run execute-pilot.ts --project-id=builder-console --mode=execute --max-ticks=3 --max-runtime=15
`);
  }
  
  if (hasFlag('--help') || hasFlag('-h')) {
    showHelp();
    process.exit(0);
  }
  
  const projectId = parseArg('--project-id');
  const mode = parseArg('--mode') as PilotMode | undefined;
  const stateDir = parseArg('--state-dir');
  const maxTicks = parseArg('--max-ticks') ? parseInt(parseArg('--max-ticks')!, 10) : undefined;
  const maxRuntimeMin = parseArg('--max-runtime') ? parseInt(parseArg('--max-runtime')!, 10) : undefined;
  
  if (!projectId || !mode) {
    console.error('Error: --project-id and --mode are required');
    showHelp();
    process.exit(1);
  }
  
  if (mode !== 'dry-run' && mode !== 'execute') {
    console.error(`Error: mode must be 'dry-run' or 'execute', got: ${mode}`);
    process.exit(1);
  }
  
  const config = createPilotConfig({
    projectId,
    mode,
    stateDir,
    bounds: {
      maxTicks,
      maxRuntimeMs: maxRuntimeMin ? maxRuntimeMin * 60 * 1000 : undefined,
    },
  });
  
  // Simple grounded query resolver (returns empty context for now)
  const resolveGroundedQuery: PilotGroundedQueryResolver = async () => {
    return async () => ({
      entries: [],
      totalEntries: 0,
      project: {
        projectId: config.projectId,
        name: config.projectId,
        path: `/tmp/${config.projectId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '0.0.1',
        status: 'active',
      },
      sources: [],
      retrievedAt: new Date().toISOString(),
      confidence: 0.5,
    });
  };
  
  console.log(`Starting Victor Execute Pilot`);
  console.log(`Project: ${config.projectId}`);
  console.log(`Mode: ${config.mode}`);
  console.log(`State Directory: ${config.stateDir}`);
  console.log(`Max Ticks: ${config.bounds.maxTicks}`);
  console.log(`Max Runtime: ${config.bounds.maxRuntimeMs / 60000} minutes`);
  console.log('');
  
  runExecutePilot(config, resolveGroundedQuery)
    .then(result => {
      console.log(formatPilotResult(result));
      console.log('');
      console.log(`State file: ${result.stateFile}`);
      console.log(`Packet file: ${result.stateFile.replace('.json', '-packet.json')}`);
      
      // Exit code based on status
      const exitCode = result.status === 'completed' ? 0 : 1;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Pilot failed with error:', error);
      process.exit(1);
    });
}
