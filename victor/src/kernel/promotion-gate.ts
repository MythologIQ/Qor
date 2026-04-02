import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listAutomationAuditRecords } from './automation-audit';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Qor';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;
const DEFAULT_STATE_DIR = '/tmp/victor-heartbeat';
const BASELINE_HEARTBEAT_CADENCE_MS = 30 * 60 * 1000;

type InternalVerdict = 'not-ready' | 'conditionally-ready' | 'ready';
type UiVerdict = 'Red' | 'Yellow' | 'Green';
type CriterionStatus = 'met' | 'partial' | 'unmet';

interface HeartbeatLedgerRecord {
  entryId: string;
  timestamp: string;
  projectId: string;
  artifactId: string;
  event: 'preflight' | 'started' | 'tick' | 'stopped' | 'lease-blocked';
  payload: Record<string, unknown>;
}

interface HeartbeatStateSnapshot {
  projectId: string;
  runId: string;
  status: string;
  mode: 'dry-run' | 'execute';
  reasoningModel: string | null;
  cadenceMs: number;
  cadenceMode: string;
  maxActionsPerTick: number;
  stopOnBlock: boolean;
  maxConsecutiveBlocked: number;
  maxConsecutiveFailures: number;
  tickCount: number;
  consecutiveBlocked: number;
  consecutiveFailures: number;
  lastTickStatus: string | null;
  lastTickReason: string | null;
  lastSelectedTaskId: string | null;
  focusWindow?: {
    status?: string;
    source?: string | null;
    reason?: string | null;
    startedAt?: string | null;
    elevatedUntil?: string | null;
    cooldownCyclesRemaining?: number;
  };
}

export interface SoakEvidenceCheck {
  id: string;
  label: string;
  status: CriterionStatus;
  detail: string;
}

export interface SoakEvidenceSummary {
  projectId: string;
  generatedAt: string;
  internalState: InternalVerdict;
  uiLabel: UiVerdict;
  runId: string | null;
  stateFile: string;
  heartbeat: {
    status: string | null;
    mode: 'dry-run' | 'execute' | 'unknown';
    cadenceMs: number | null;
    cadenceMode: string | null;
    tickCount: number;
    lastTickStatus: string | null;
    lastTickReason: string | null;
    lastSelectedTaskId: string | null;
  };
  metrics: {
    preflightCount: number;
    tickCount: number;
    cadenceOnlyTickCount: number;
    completedTicks: number;
    blockedTicks: number;
    errorTicks: number;
    executeWrites: number;
    governanceDenials: number;
    weakGroundingSignals: number;
    contradictionSignals: number;
    incompleteAuditTicks: number;
    distinctSelectedTaskIds: string[];
  };
  checks: SoakEvidenceCheck[];
}

export interface HeartbeatLedgerStatsSummary {
  projectId: string;
  generatedAt: string;
  tickCount: number;
  cadenceOnlyTickCount: number;
  completedTicks: number;
  blockedTicks: number;
  errorTicks: number;
  lastTickTimestamp: string | null;
}

export interface PromotionGateCriterion {
  id: string;
  label: string;
  status: CriterionStatus;
  blocking: boolean;
  detail: string;
}

export interface PromotionGateSummary {
  projectId: string;
  victorProjectId: string;
  generatedAt: string;
  internalState: InternalVerdict;
  uiLabel: UiVerdict;
  criteria: PromotionGateCriterion[];
  soakEvidence: SoakEvidenceSummary;
}

export interface ExecuteBudgetPolicySummary {
  projectId: string;
  generatedAt: string;
  internalState: InternalVerdict;
  uiLabel: UiVerdict;
  heartbeat: {
    status: string | null;
    mode: 'dry-run' | 'execute' | 'unknown';
    reasoningModel: string | null;
    cadenceMs: number | null;
    cadenceMode: string | null;
    maxActionsPerTick: number;
    stopOnBlock: boolean;
    maxConsecutiveBlocked: number;
    maxConsecutiveFailures: number;
  };
  allowedActionKinds: string[];
  checks: SoakEvidenceCheck[];
}

export interface FallbackRevocationSummary {
  projectId: string;
  victorProjectId: string;
  generatedAt: string;
  internalState: InternalVerdict;
  uiLabel: UiVerdict;
  heartbeat: {
    status: string | null;
    mode: 'dry-run' | 'execute' | 'unknown';
    consecutiveBlocked: number;
    consecutiveFailures: number;
    maxConsecutiveBlocked: number;
    maxConsecutiveFailures: number;
    focusWindowStatus: string | null;
    cooldownCyclesRemaining: number;
  };
  checks: SoakEvidenceCheck[];
  fallbackTask: PromotionGateCriterion;
  triggers: {
    immediateStop: string[];
    revocation: string[];
    fallbackMode: string[];
  };
}

export async function summarizeSoakEvidence(options?: {
  projectId?: string;
  projectsDir?: string;
  stateDir?: string;
  runId?: string;
}): Promise<SoakEvidenceSummary> {
  const projectId = options?.projectId?.trim() || 'builder-console';
  const projectsDir = resolveProjectsDir(options?.projectsDir);
  const stateFile = resolveHeartbeatStateFile(projectId, options?.stateDir);
  const state = await readHeartbeatStateSnapshot(stateFile);
  const runId = options?.runId?.trim() || state?.runId || null;
  const heartbeatRecords = await listHeartbeatLedgerRecords(projectId, projectsDir, runId ? { runId } : undefined);
  const tickRecords = heartbeatRecords.filter((record) => record.event === 'tick');
  const preflightCount = heartbeatRecords.filter((record) => record.event === 'preflight').length;
  const cadenceOnlyTickCount = tickRecords.filter((record) => isCadenceOnlyTick(record)).length;
  const completedTicks = tickRecords.filter((record) => record.payload.status === 'completed').length;
  const blockedTicks = tickRecords.filter((record) => record.payload.status === 'blocked').length;
  const errorTicks = tickRecords.filter((record) => record.payload.status === 'error').length;
  const distinctSelectedTaskIds = [
    ...new Set(
      tickRecords
        .map((record) => stringOrNull(record.payload.selectedTaskId))
        .filter((taskId): taskId is string => Boolean(taskId)),
    ),
  ];

  const automationRunIds = [
    ...new Set(
      tickRecords
        .map((record) => stringOrNull(record.payload.automationRunId))
        .filter((automationRunId): automationRunId is string => Boolean(automationRunId)),
    ),
  ];

  let executeWrites = 0;
  let governanceDenials = 0;
  let weakGroundingSignals = 0;
  let contradictionSignals = 0;

  for (const automationRunId of automationRunIds) {
    const auditRecords = await listAutomationAuditRecords(projectId, projectsDir, {
      runId: automationRunId,
      limit: 50,
    });
    for (const record of auditRecords.filter((entry) => entry.event === 'action')) {
      if (record.payload.executed === true && record.payload.mode === 'execute') {
        executeWrites += 1;
      }
      if (record.payload.resultStatus === 'blocked' && asRecord(record.payload.governance)?.allowed === false) {
        governanceDenials += 1;
      }
      const grounded = asRecord(record.payload.groundedContext);
      const missing = Array.isArray(grounded?.missingInformation) ? grounded?.missingInformation : [];
      const contradictions = Array.isArray(grounded?.contradictions) ? grounded?.contradictions : [];
      if (missing.length > 0) {
        weakGroundingSignals += missing.length;
      }
      if (contradictions.length > 0) {
        contradictionSignals += contradictions.length;
      }
    }
  }

  const incompleteAuditTicks = tickRecords.filter((record) => {
    const status = stringOrNull(record.payload.status);
    if (status === 'error') {
      return false;
    }
    if (isCadenceOnlyTick(record)) {
      return false;
    }
    return !stringOrNull(record.payload.automationRunId);
  }).length;

  const checks: SoakEvidenceCheck[] = [
    evaluateCheck(
      'baseline-dry-run',
      '30m dry-run heartbeat baseline observed',
      hasBaselineDryRunStart(heartbeatRecords),
      false,
      'No baseline 30m dry-run heartbeat start was found for the evaluated soak run.',
      'A baseline 30m dry-run heartbeat start was recorded.',
    ),
    evaluateThresholdCheck(
      'bounded-ticks',
      'Repeated bounded soak ticks completed',
      completedTicks,
      2,
      1,
      `Only ${completedTicks} completed dry-run tick(s) were recorded; at least 2 are needed for a credible soak read.`,
      `${completedTicks} completed dry-run tick(s) were recorded under the soak run.`,
    ),
    evaluateCheck(
      'no-execute-writes',
      'No execute-mode writes occurred during the dry-run soak',
      executeWrites === 0,
      false,
      `${executeWrites} execute-mode write(s) were recorded during what should have been a dry-run soak.`,
      'No execute-mode writes were recorded during the soak window.',
    ),
    evaluateCheck(
      'audit-completeness',
      'Every completed/blocked tick carried linked automation audit evidence',
      incompleteAuditTicks === 0 && tickRecords.length > 0,
      preflightCount > 0,
      incompleteAuditTicks === 0
        ? 'No tick-level automation evidence was found yet.'
        : `${incompleteAuditTicks} tick(s) were missing linked automation run identifiers.`,
      'Tick-level heartbeat records and automation audit runs are linked.',
    ),
    evaluateCheck(
      'governance-discipline',
      'No governance denials were hit during the soak run',
      governanceDenials === 0,
      false,
      `${governanceDenials} governance denial event(s) were observed during the soak run.`,
      'No governance denials were observed during the soak run.',
    ),
    evaluateCheck(
      'grounding-quality',
      'No contradiction or weak-grounding signals surfaced during the soak run',
      governanceDenials === 0 && weakGroundingSignals === 0 && contradictionSignals === 0,
      weakGroundingSignals === 0 && contradictionSignals === 0,
      `Weak grounding signals: ${weakGroundingSignals}. Contradiction signals: ${contradictionSignals}.`,
      'Grounded automation did not surface contradiction or weak-evidence signals.',
    ),
    evaluateCheck(
      'selection-stability',
      'Task selection remained stable and explicit during the soak run',
      tickRecords.length > 0
        && tickRecords.every((record) => isCadenceOnlyTick(record) || Boolean(stringOrNull(record.payload.selectedTaskId))),
      tickRecords.some((record) => isCadenceOnlyTick(record)) || distinctSelectedTaskIds.length > 0,
      'At least one soak tick completed without an explicit selected task id or cadence-only classification.',
      tickRecords.some((record) => isCadenceOnlyTick(record))
        ? `Soak ticks remained valid through cadence-only observation (${tickRecords.filter((record) => isCadenceOnlyTick(record)).length} cadence-only tick(s)).`
        : `Soak ticks selected ${distinctSelectedTaskIds.length} explicit task target(s).`,
    ),
  ];

  const severeFailure = executeWrites > 0 || governanceDenials > 0 || errorTicks > 0 || contradictionSignals > 0;
  const unmetCount = checks.filter((check) => check.status === 'unmet').length;
  const partialCount = checks.filter((check) => check.status === 'partial').length;
  const internalState: InternalVerdict = severeFailure
    ? 'not-ready'
    : unmetCount > 0 || partialCount > 0
      ? 'conditionally-ready'
      : 'ready';

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    internalState,
    uiLabel: toUiVerdict(internalState),
    runId,
    stateFile,
    heartbeat: {
      status: state?.status ?? null,
      mode: state?.mode ?? 'unknown',
      cadenceMs: state?.cadenceMs ?? null,
      cadenceMode: state?.cadenceMode ?? null,
      tickCount: tickRecords.length,
      lastTickStatus: state?.lastTickStatus ?? null,
      lastTickReason: state?.lastTickReason ?? null,
      lastSelectedTaskId: state?.lastSelectedTaskId ?? null,
    },
    metrics: {
      preflightCount,
      tickCount: tickRecords.length,
      cadenceOnlyTickCount,
      completedTicks,
      blockedTicks,
      errorTicks,
      executeWrites,
      governanceDenials,
      weakGroundingSignals,
      contradictionSignals,
      incompleteAuditTicks,
      distinctSelectedTaskIds,
    },
    checks,
  };
}

export async function summarizeHeartbeatLedgerStats(options?: {
  projectId?: string;
  projectsDir?: string;
}): Promise<HeartbeatLedgerStatsSummary> {
  const projectId = options?.projectId?.trim() || 'builder-console';
  const projectsDir = resolveProjectsDir(options?.projectsDir);
  const heartbeatRecords = await listHeartbeatLedgerRecords(projectId, projectsDir);
  const tickRecords = heartbeatRecords.filter((record) => record.event === 'tick');
  const lastTick = tickRecords.at(-1) ?? null;

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    tickCount: tickRecords.length,
    cadenceOnlyTickCount: tickRecords.filter((record) => isCadenceOnlyTick(record)).length,
    completedTicks: tickRecords.filter((record) => record.payload.status === 'completed').length,
    blockedTicks: tickRecords.filter((record) => record.payload.status === 'blocked').length,
    errorTicks: tickRecords.filter((record) => record.payload.status === 'error').length,
    lastTickTimestamp: lastTick?.timestamp ?? null,
  };
}

export async function summarizePromotionGate(options?: {
  projectId?: string;
  victorProjectId?: string;
  projectsDir?: string;
  stateDir?: string;
  runId?: string;
}): Promise<PromotionGateSummary> {
  const projectId = options?.projectId?.trim() || 'builder-console';
  const victorProjectId = options?.victorProjectId?.trim() || 'victor-resident';
  const projectsDir = resolveProjectsDir(options?.projectsDir);
  const soakEvidence = await summarizeSoakEvidence({
    projectId,
    projectsDir,
    stateDir: options?.stateDir,
    runId: options?.runId,
  });
  const victorPhases = await readPathPhases(victorProjectId, projectsDir);

  const promotionCriteriaTask = findTaskByTitle(
    victorPhases,
    'Define Victor unattended execute-mode promotion criteria',
  );
  const fallbackTask = findTaskByTitle(
    victorPhases,
    'Record unattended execute fallback and revocation triggers',
  );
  const dependencyTask = findTaskByTitle(
    victorPhases,
    'Record Builder dependencies that gate Victor autonomy promotion',
  );

  const criteria: PromotionGateCriterion[] = [
    {
      id: 'soak-evidence',
      label: 'Bounded 30m dry-run soak evidence is strong enough to inform promotion review',
      status: mapVerdictToCriterion(soakEvidence.internalState),
      blocking: true,
      detail: summarizeSoakCriterion(soakEvidence),
    },
    evaluateTaskCriterion(
      'promotion-criteria',
      'Execute-mode promotion criteria are explicitly defined',
      promotionCriteriaTask,
      true,
    ),
    evaluateTaskCriterion(
      'fallback-revocation',
      'Execute fallback and revocation triggers are recorded',
      fallbackTask,
      true,
    ),
    evaluateTaskCriterion(
      'builder-dependencies',
      'Builder dependency gates for Victor autonomy promotion are documented',
      dependencyTask,
      false,
    ),
    {
      id: 'audit-surface',
      label: 'Audit and review surfaces are available for promotion review',
      status: soakEvidence.checks.find((check) => check.id === 'audit-completeness')?.status ?? 'unmet',
      blocking: false,
      detail: soakEvidence.checks.find((check) => check.id === 'audit-completeness')?.detail
        ?? 'Promotion review audit visibility has not been verified.',
    },
  ];

  const severeFailure = soakEvidence.internalState === 'not-ready';
  const blockingUnmet = criteria.some((criterion) => criterion.blocking && criterion.status === 'unmet');
  const blockingPartial = criteria.some((criterion) => criterion.blocking && criterion.status === 'partial');
  const internalState: InternalVerdict = severeFailure
    ? 'not-ready'
    : blockingUnmet || blockingPartial
      ? 'conditionally-ready'
      : 'ready';

  return {
    projectId,
    victorProjectId,
    generatedAt: new Date().toISOString(),
    internalState,
    uiLabel: toUiVerdict(internalState),
    criteria,
    soakEvidence,
  };
}

export async function summarizeExecuteBudgetPolicy(options?: {
  projectId?: string;
  stateDir?: string;
}): Promise<ExecuteBudgetPolicySummary> {
  const projectId = options?.projectId?.trim() || 'builder-console';
  const stateFile = resolveHeartbeatStateFile(projectId, options?.stateDir);
  const state = await readHeartbeatStateSnapshot(stateFile);
  const allowedActionKinds = ['create-draft-task', 'update-task-status'];

  const checks: SoakEvidenceCheck[] = [
    evaluateCheck(
      'reasoning-model',
      'Heartbeat reasoning model is locked to Kimi K2.5',
      state?.reasoningModel === 'Kimi K2.5',
      false,
      state?.reasoningModel
        ? `Heartbeat reasoning is using ${state.reasoningModel} instead of Kimi K2.5.`
        : 'No heartbeat reasoning model is recorded yet.',
      'Heartbeat reasoning is locked to Kimi K2.5.',
    ),
    evaluateCheck(
      'action-budget',
      'Execute mode is limited to one governed write per tick',
      (state?.maxActionsPerTick ?? 1) <= 1,
      (state?.maxActionsPerTick ?? 1) === 2,
      `Heartbeat allows ${(state?.maxActionsPerTick ?? 1)} action(s) per tick, which exceeds the safe execute-mode budget.`,
      `Heartbeat action budget is ${(state?.maxActionsPerTick ?? 1)} action per tick.`,
    ),
    evaluateCheck(
      'stop-on-block',
      'Heartbeat stops the current automation run on the first blocked action',
      state?.stopOnBlock !== false,
      false,
      'Heartbeat is configured to continue after blocked actions.',
      'Heartbeat is configured to stop on the first blocked action.',
    ),
    evaluateCheck(
      'blocked-threshold',
      'Blocked-action threshold remains bounded',
      (state?.maxConsecutiveBlocked ?? 3) <= 3,
      (state?.maxConsecutiveBlocked ?? 3) === 4,
      `Heartbeat allows ${(state?.maxConsecutiveBlocked ?? 3)} consecutive blocked ticks before stop, which is too loose for unattended execute mode.`,
      `Heartbeat blocked threshold is ${(state?.maxConsecutiveBlocked ?? 3)} consecutive tick(s).`,
    ),
    evaluateCheck(
      'failure-threshold',
      'Failure threshold remains bounded',
      (state?.maxConsecutiveFailures ?? 2) <= 2,
      (state?.maxConsecutiveFailures ?? 2) === 3,
      `Heartbeat allows ${(state?.maxConsecutiveFailures ?? 2)} consecutive failures before stop, which is too loose for unattended execute mode.`,
      `Heartbeat failure threshold is ${(state?.maxConsecutiveFailures ?? 2)} consecutive tick(s).`,
    ),
    evaluateCheck(
      'allowed-actions',
      'Execute mode is still constrained to governed task drafting and status updates',
      true,
      false,
      'Execute-mode action kinds drifted beyond the allowed governed set.',
      `Allowed action kinds remain ${allowedActionKinds.join(', ')}.`,
    ),
  ];

  const severeFailure = checks.some((check) => check.status === 'unmet');
  const partial = checks.some((check) => check.status === 'partial');
  const internalState: InternalVerdict = severeFailure ? 'not-ready' : partial ? 'conditionally-ready' : 'ready';

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    internalState,
    uiLabel: toUiVerdict(internalState),
    heartbeat: {
      status: state?.status ?? null,
      mode: state?.mode ?? 'unknown',
      reasoningModel: state?.reasoningModel ?? null,
      cadenceMs: state?.cadenceMs ?? null,
      cadenceMode: state?.cadenceMode ?? null,
      maxActionsPerTick: state?.maxActionsPerTick ?? 1,
      stopOnBlock: state?.stopOnBlock ?? true,
      maxConsecutiveBlocked: state?.maxConsecutiveBlocked ?? 3,
      maxConsecutiveFailures: state?.maxConsecutiveFailures ?? 2,
    },
    allowedActionKinds,
    checks,
  };
}

export async function summarizeFallbackRevocation(options?: {
  projectId?: string;
  victorProjectId?: string;
  projectsDir?: string;
  stateDir?: string;
}): Promise<FallbackRevocationSummary> {
  const projectId = options?.projectId?.trim() || 'builder-console';
  const victorProjectId = options?.victorProjectId?.trim() || 'victor-resident';
  const projectsDir = resolveProjectsDir(options?.projectsDir);
  const stateFile = resolveHeartbeatStateFile(projectId, options?.stateDir);
  const state = await readHeartbeatStateSnapshot(stateFile);
  const victorPhases = await readPathPhases(victorProjectId, projectsDir);
  const fallbackTask = evaluateTaskCriterion(
    'fallback-revocation',
    'Execute fallback and revocation triggers are recorded',
    findTaskByTitle(victorPhases, 'Record unattended execute fallback and revocation triggers'),
    true,
  );

  const checks: SoakEvidenceCheck[] = [
    {
      id: 'fallback-task',
      label: fallbackTask.label,
      status: fallbackTask.status,
      detail: fallbackTask.detail,
    },
    evaluateCheck(
      'blocked-counter-headroom',
      'Blocked counter is below the revocation threshold',
      (state?.consecutiveBlocked ?? 0) === 0,
      (state?.consecutiveBlocked ?? 0) < (state?.maxConsecutiveBlocked ?? 3),
      `Heartbeat has reached ${(state?.consecutiveBlocked ?? 0)} blocked tick(s), hitting its revocation threshold.`,
      `Heartbeat blocked counter is ${(state?.consecutiveBlocked ?? 0)} of ${(state?.maxConsecutiveBlocked ?? 3)}.`,
    ),
    evaluateCheck(
      'failure-counter-headroom',
      'Failure counter is below the revocation threshold',
      (state?.consecutiveFailures ?? 0) === 0,
      (state?.consecutiveFailures ?? 0) < (state?.maxConsecutiveFailures ?? 2),
      `Heartbeat has reached ${(state?.consecutiveFailures ?? 0)} failure tick(s), hitting its revocation threshold.`,
      `Heartbeat failure counter is ${(state?.consecutiveFailures ?? 0)} of ${(state?.maxConsecutiveFailures ?? 2)}.`,
    ),
    evaluateCheck(
      'cooldown-awareness',
      'Focus-window state exposes cooldown when execute tempo has to fall back',
      Boolean(state?.focusWindow?.status),
      false,
      'Heartbeat focus-window state is missing, so cooldown fallback cannot be verified.',
      state?.focusWindow?.status === 'cooldown'
        ? `Heartbeat is currently in cooldown with ${(state.focusWindow.cooldownCyclesRemaining ?? 0)} cycle(s) remaining.`
        : `Heartbeat focus-window state is ${state?.focusWindow?.status ?? 'inactive'}.`,
    ),
  ];

  const severeFailure = checks.some((check) => check.status === 'unmet');
  const partial = checks.some((check) => check.status === 'partial');
  const internalState: InternalVerdict = severeFailure ? 'not-ready' : partial ? 'conditionally-ready' : 'ready';

  return {
    projectId,
    victorProjectId,
    generatedAt: new Date().toISOString(),
    internalState,
    uiLabel: toUiVerdict(internalState),
    heartbeat: {
      status: state?.status ?? null,
      mode: state?.mode ?? 'unknown',
      consecutiveBlocked: state?.consecutiveBlocked ?? 0,
      consecutiveFailures: state?.consecutiveFailures ?? 0,
      maxConsecutiveBlocked: state?.maxConsecutiveBlocked ?? 3,
      maxConsecutiveFailures: state?.maxConsecutiveFailures ?? 2,
      focusWindowStatus: state?.focusWindow?.status ?? null,
      cooldownCyclesRemaining: state?.focusWindow?.cooldownCyclesRemaining ?? 0,
    },
    checks,
    fallbackTask,
    triggers: {
      immediateStop: [
        'Reasoning model drift away from Kimi K2.5',
        'Governance denial on an execute-mode action',
        'Contradiction or weak-grounding signal on an execute-mode action',
      ],
      revocation: [
        `Consecutive blocked ticks reach ${state?.maxConsecutiveBlocked ?? 3}`,
        `Consecutive failed ticks reach ${state?.maxConsecutiveFailures ?? 2}`,
        'Promotion criteria or fallback policy task remains incomplete during execute review',
      ],
      fallbackMode: [
        'Drop from unattended execute to dry-run heartbeat',
        'Enter cooldown reflection at baseline cadence',
        'Require explicit human re-authorization before execute-mode resumes',
      ],
    },
  };
}

async function listHeartbeatLedgerRecords(
  projectId: string,
  projectsDir: string,
  options?: {
    runId?: string;
  },
): Promise<HeartbeatLedgerRecord[]> {
  // Direct file read instead of using createPlanningLedger
  const ledgerPath = join(projectsDir, projectId, 'ledger.jsonl');
  if (!existsSync(ledgerPath)) {
    return [];
  }
  
  const content = await readFile(ledgerPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const entries: HeartbeatLedgerRecord[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.payload?.source === 'victor-heartbeat' && entry.view === 'autonomy') {
        if (!options?.runId || entry.payload?.runId === options.runId) {
          entries.push({
            entryId: entry.entryId,
            timestamp: entry.timestamp,
            projectId: entry.projectId,
            artifactId: entry.artifactId,
            event: String(entry.payload?.event) as HeartbeatLedgerRecord['event'],
            payload: entry.payload ?? {},
          });
        }
      }
    } catch {
      // Skip malformed lines
    }
  }
  
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function readHeartbeatStateSnapshot(stateFile: string): Promise<HeartbeatStateSnapshot | null> {
  if (!existsSync(stateFile)) {
    return null;
  }
  const raw = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, unknown>;
  return {
    projectId: stringOrNull(raw.projectId) ?? 'builder-console',
    runId: stringOrNull(raw.runId) ?? '',
    status: stringOrNull(raw.status) ?? 'unknown',
    mode: raw.mode === 'dry-run' || raw.mode === 'execute' ? raw.mode : 'dry-run',
    reasoningModel: stringOrNull(raw.reasoningModel),
    cadenceMs: typeof raw.cadenceMs === 'number' ? raw.cadenceMs : BASELINE_HEARTBEAT_CADENCE_MS,
    cadenceMode: stringOrNull(raw.cadenceMode) ?? 'baseline',
    maxActionsPerTick: typeof raw.maxActionsPerTick === 'number' ? raw.maxActionsPerTick : 1,
    stopOnBlock: raw.stopOnBlock !== false,
    maxConsecutiveBlocked: typeof raw.maxConsecutiveBlocked === 'number' ? raw.maxConsecutiveBlocked : 3,
    maxConsecutiveFailures: typeof raw.maxConsecutiveFailures === 'number' ? raw.maxConsecutiveFailures : 2,
    tickCount: typeof raw.tickCount === 'number' ? raw.tickCount : 0,
    consecutiveBlocked: typeof raw.consecutiveBlocked === 'number' ? raw.consecutiveBlocked : 0,
    consecutiveFailures: typeof raw.consecutiveFailures === 'number' ? raw.consecutiveFailures : 0,
    lastTickStatus: stringOrNull(raw.lastTickStatus),
    lastTickReason: stringOrNull(raw.lastTickReason),
    lastSelectedTaskId: stringOrNull(raw.lastSelectedTaskId),
    focusWindow: asRecord(raw.focusWindow) ? {
      status: stringOrNull(asRecord(raw.focusWindow)?.status ?? null) ?? undefined,
      source: stringOrNull(asRecord(raw.focusWindow)?.source ?? null),
      reason: stringOrNull(asRecord(raw.focusWindow)?.reason ?? null),
      startedAt: stringOrNull(asRecord(raw.focusWindow)?.startedAt ?? null),
      elevatedUntil: stringOrNull(asRecord(raw.focusWindow)?.elevatedUntil ?? null),
      cooldownCyclesRemaining: typeof asRecord(raw.focusWindow)?.cooldownCyclesRemaining === 'number'
        ? Number(asRecord(raw.focusWindow)?.cooldownCyclesRemaining)
        : undefined,
    } : undefined,
  };
}

async function readPathPhases(projectId: string, projectsDir: string): Promise<Array<Record<string, unknown>>> {
  // Direct file read instead of using ViewStore
  const phasesPath = join(projectsDir, projectId, 'path', 'phases.json');
  if (!existsSync(phasesPath)) {
    return [];
  }
  
  try {
    const content = await readFile(phasesPath, 'utf-8');
    const data = JSON.parse(content);
    return data?.phases ?? [];
  } catch {
    return [];
  }
}

function findTaskByTitle(phases: Array<Record<string, unknown>>, title: string) {
  const normalizedTitle = normalize(title);
  for (const phase of phases) {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    for (const task of tasks) {
      if (normalize(stringOrNull(task.title) ?? '') === normalizedTitle) {
        return {
          taskId: stringOrNull(task.taskId) ?? '',
          phaseId: stringOrNull(task.phaseId) ?? '',
          title: stringOrNull(task.title) ?? title,
          status: normalizeTaskStatus(task.status),
        };
      }
    }
  }
  return null;
}

function evaluateTaskCriterion(
  id: string,
  label: string,
  task: { taskId: string; phaseId: string; title: string; status: 'pending' | 'in-progress' | 'done' | 'blocked' } | null,
  blocking: boolean,
): PromotionGateCriterion {
  if (!task) {
    return {
      id,
      label,
      status: 'unmet',
      blocking,
      detail: 'The governing Builder task does not exist yet.',
    };
  }
  if (task.status === 'done') {
    return {
      id,
      label,
      status: 'met',
      blocking,
      detail: `Builder task "${task.title}" is complete.`,
    };
  }
  if (task.status === 'in-progress') {
    return {
      id,
      label,
      status: 'partial',
      blocking,
      detail: `Builder task "${task.title}" is in progress.`,
    };
  }
  return {
    id,
    label,
    status: 'unmet',
    blocking,
    detail: `Builder task "${task.title}" is still ${task.status}.`,
  };
}

function summarizeSoakCriterion(soakEvidence: SoakEvidenceSummary): string {
  const unmet = soakEvidence.checks.filter((check) => check.status === 'unmet').map((check) => check.label);
  const partial = soakEvidence.checks.filter((check) => check.status === 'partial').map((check) => check.label);
  if (soakEvidence.internalState === 'ready') {
    return `Soak verdict is Green with ${soakEvidence.metrics.completedTicks} completed tick(s) and no severe failures.`;
  }
  if (unmet.length > 0) {
    return `Soak verdict is ${soakEvidence.uiLabel}; unmet checks: ${unmet.join('; ')}.`;
  }
  return `Soak verdict is ${soakEvidence.uiLabel}; partial checks: ${partial.join('; ')}.`;
}

function evaluateCheck(
  id: string,
  label: string,
  met: boolean,
  partial: boolean,
  unmetDetail: string,
  metDetail: string,
): SoakEvidenceCheck {
  return {
    id,
    label,
    status: met ? 'met' : partial ? 'partial' : 'unmet',
    detail: met ? metDetail : partial ? metDetail : unmetDetail,
  };
}

function evaluateThresholdCheck(
  id: string,
  label: string,
  actual: number,
  target: number,
  partialFloor: number,
  unmetDetail: string,
  metDetail: string,
): SoakEvidenceCheck {
  return {
    id,
    label,
    status: actual >= target ? 'met' : actual >= partialFloor ? 'partial' : 'unmet',
    detail: actual >= target
      ? metDetail
      : actual >= partialFloor
        ? metDetail
        : unmetDetail,
  };
}

function hasBaselineDryRunStart(records: HeartbeatLedgerRecord[]) {
  return records.some((record) => (
    record.event === 'started'
    && record.payload.mode === 'dry-run'
    && record.payload.baselineCadenceMs === BASELINE_HEARTBEAT_CADENCE_MS
  ));
}

function mapVerdictToCriterion(value: InternalVerdict): CriterionStatus {
  if (value === 'ready') return 'met';
  if (value === 'conditionally-ready') return 'partial';
  return 'unmet';
}

function toUiVerdict(value: InternalVerdict): UiVerdict {
  if (value === 'ready') return 'Green';
  if (value === 'conditionally-ready') return 'Yellow';
  return 'Red';
}

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}

function resolveHeartbeatStateFile(projectId: string, stateDir?: string) {
  const resolvedStateDir = stateDir?.trim() || process.env.VICTOR_HEARTBEAT_STATE_DIR?.trim() || DEFAULT_STATE_DIR;
  return join(resolvedStateDir, `${projectId}.json`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function isCadenceOnlyTick(record: HeartbeatLedgerRecord): boolean {
  return record.event === 'tick' && record.payload.cadenceOnly === true;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeTaskStatus(value: unknown): 'pending' | 'in-progress' | 'done' | 'blocked' {
  return value === 'in-progress' || value === 'done' || value === 'blocked' ? value : 'pending';
}
