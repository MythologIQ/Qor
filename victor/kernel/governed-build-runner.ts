import { existsSync } from 'node:fs';

import { ViewStore, createPlanningLedger, createStoreIntegrity } from '../../runtime/planning';
import { runVictorSafeAutomation, type AutomationAction } from './automation-runner';
import type { GroundedContextBundle } from './memory/types';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Zo-Qore';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;
const DEFAULT_AUTOMATION_PROJECT_ID = 'victor-resident';

/**
 * Project scan order for multi-project heartbeat.
 * Victor scans his own queue first, then falls back to the Forge queue.
 * This is the priority order — first project with eligible work wins.
 */
export const PROJECT_SCAN_ORDER = [
  'victor-resident',
  'builder-console',
];
const GOVERNED_AUTOMATION_TERMS = [
  'automation',
  'governed',
  'governance',
  'victor',
  'builder console',
  'prompt',
  'memory',
  'retrieval',
  'cache',
  'decay',
  'saturation',
  'thermodynamic',
  'routing',
  'crystallized',
  'validation',
  'test',
];

type BuilderConsoleTaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

interface BuilderConsoleTask {
  taskId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance: string[];
  status: BuilderConsoleTaskStatus;
}

interface BuilderConsolePhase {
  phaseId: string;
  ordinal?: number;
  name: string;
  objective?: string;
  status?: string;
  tasks?: BuilderConsoleTask[];
}

export interface GovernedBuildRequest {
  projectId?: string;
  projectsDir?: string;
  dryRun?: boolean;
  actorId?: string;
  maxActions?: number;
  /** When true, scan PROJECT_SCAN_ORDER for the first project with eligible work */
  multiProject?: boolean;
}

export interface GovernedBuildResult {
  status: 'completed' | 'blocked';
  mode: 'dry-run' | 'execute';
  selectedTask?: {
    projectId: string;
    phaseId: string;
    taskId: string;
    title: string;
    status: BuilderConsoleTaskStatus;
    score: number;
  };
  selectionReason: string;
  automation: Awaited<ReturnType<typeof runVictorSafeAutomation>>;
}

export interface GovernedBuildSelectionPreview {
  projectId: string;
  mode?: 'advance' | 'reflect';
  selectedTask?: {
    projectId: string;
    phaseId: string;
    taskId: string;
    title: string;
    status: BuilderConsoleTaskStatus;
    score: number;
  };
  reason: string;
}

function buildExecutionFirstTaskQuery(taskTitle: string, phaseName: string): string {
  return [
    `For the governed automation task "${taskTitle}" in phase "${phaseName}", choose the single highest-value next safe action Victor should take now.`,
    `Prefer direct advancement of the task. If that is not justified, choose the most concrete unblock action that would create governed progress.`,
    `Return guidance that supports exactly one governed action or one explicit no-action veto with a named blocker.`,
    `Do not recommend passive observation, generic monitoring, or "continue current work" unless you also identify the exact blocker or missing artifact.`,
  ].join(' ');
}

function buildExecutionFirstReflectionQuery(taskTitle: string, phaseName: string): string {
  return [
    `For the active governed automation task "${taskTitle}" in phase "${phaseName}", determine whether Victor should complete it, create one follow-on draft task, or hold execution.`,
    `Prefer a concrete governed action. If no safe action is justified, name the blocker and the missing artifact required to resume progress.`,
    `Do not return generic reflection or passive observation. The answer must support one concrete governed action or one explicit veto with reasons.`,
  ].join(' ');
}

function buildExecutionFirstProjectDraftQuery(projectId: string, phaseSummary: string, targetPhaseName: string): string {
  return [
    `Choose the single highest-value governed task Victor should queue next for project "${projectId}" now that the currently authored phases are complete.`,
    `Ground the answer in explicit project decisions, goals, dependencies, or remaining work only.`,
    `Prefer the most concrete executable or unblock task over broad strategy language.`,
    `Do not recommend passive observation, generic monitoring, or "continue current work". If no safe task can be queued, state the blocker and the exact missing artifact or dependency.`,
    `Current phase history: ${phaseSummary}`,
    `Target phase for a follow-on draft: "${targetPhaseName}".`,
  ].join(' ');
}

/**
 * Scan multiple project queues for the first one with eligible work.
 * Returns the projectId of the project with highest-priority pending/active work,
 * or falls back to DEFAULT_AUTOMATION_PROJECT_ID if none found.
 */
export async function selectProjectWithWork(
  projectsDir?: string,
): Promise<{ projectId: string; reason: string }> {
  const dir = resolveProjectsDir(projectsDir);

  for (const candidateId of PROJECT_SCAN_ORDER) {
    try {
      const phases = await readPhases(candidateId, dir);
      const hasEligibleWork = phases.some((phase) => {
        const status = phase.status;
        if (status === 'complete') return false;
        const tasks = phase.tasks ?? [];
        return tasks.some((t) => t.status === 'pending' || t.status === 'in-progress');
      });
      if (hasEligibleWork) {
        return { projectId: candidateId, reason: `Eligible work found in ${candidateId}` };
      }
    } catch {
      // Project doesn't exist or phases unreadable — skip
    }
  }

  return { projectId: DEFAULT_AUTOMATION_PROJECT_ID, reason: 'No project with eligible work found; falling back to default' };
}

export async function runGovernedAutomationBuild(
  request: GovernedBuildRequest,
  groundedQuery: (projectId: string, query: string) => Promise<GroundedContextBundle>,
): Promise<GovernedBuildResult> {
  let projectId = request.projectId?.trim() || DEFAULT_AUTOMATION_PROJECT_ID;

  // Multi-project scanning: find the first project with eligible work
  if (request.multiProject && !request.projectId) {
    const selection = await selectProjectWithWork(request.projectsDir);
    projectId = selection.projectId;
  }
  const projectsDir = resolveProjectsDir(request.projectsDir);
  const maxActions = request.maxActions ?? 1;
  const dryRun = request.dryRun !== false;
  const phases = await readPhases(projectId, projectsDir);
  const pendingSelection = selectPendingGovernedAutomationTask(projectId, phases);
  const activeSelection = pendingSelection
    ? null
    : await assessActiveGovernedAutomationTask(projectId, phases, groundedQuery);
  const selected = pendingSelection ?? activeSelection?.candidate ?? null;
  const selectedPhaseName = phases.find((phase) => phase.phaseId === selected?.task.phaseId)?.name ?? selected?.phase.name ?? '';
  const derivedDraft = selected
    ? null
    : await deriveGovernedAutomationDraft(projectId, phases, groundedQuery);

  if (!selected && !derivedDraft) {
    const automation = await runVictorSafeAutomation(
      {
        dryRun,
        maxActions,
        actorId: request.actorId,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId,
            phaseId: 'missing-phase',
            taskId: 'missing-task',
            status: 'in-progress',
            query: 'Choose the single highest-value governed task Victor should advance next. Prefer a concrete executable or unblock action; do not recommend passive observation.',
          },
        ],
      },
      async () => ({
        query: 'Choose the single highest-value governed task Victor should advance next. Prefer a concrete executable or unblock action; do not recommend passive observation.',
        chunkHits: [],
        semanticNodes: [],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        recommendedNextActions: [],
        missingInformation: ['No eligible governed automation task was found in Builder Console path state.'],
      }),
    );

    return {
      status: 'blocked',
      mode: dryRun ? 'dry-run' : 'execute',
      selectionReason: 'No eligible governed automation task was found.',
      automation,
    };
  }

  if (selected) {
    const reflectionMode = selected.task.status === 'in-progress';
    const query = reflectionMode
      ? buildExecutionFirstReflectionQuery(selected.task.title, selectedPhaseName)
      : buildExecutionFirstTaskQuery(selected.task.title, selectedPhaseName);
    const groundedContext = activeSelection?.groundedContext
      ?? (reflectionMode ? await groundedQuery(projectId, query) : null);
    const reflectiveAction = activeSelection?.action
      ?? (groundedContext ? buildReflectiveDraftTaskAction(projectId, selected.task, selectedPhaseName, query, groundedContext) : null);
    const action: AutomationAction = reflectiveAction ?? {
      kind: 'update-task-status',
      projectId,
      phaseId: selected.phase.phaseId,
      taskId: selected.task.taskId,
      taskTitle: selected.task.title,
      status: 'in-progress',
      query,
    };
    const automation = await runVictorSafeAutomation(
      {
        dryRun: reflectionMode ? !reflectiveAction || dryRun : dryRun,
        maxActions,
        actorId: request.actorId,
        projectsDir,
        actions: [action],
      },
      async (queryProjectId, queryText) => {
        if (groundedContext && queryProjectId === projectId && queryText === query) {
          return groundedContext;
        }
        return groundedQuery(queryProjectId, queryText);
      },
    );

    return {
      status: automation.status,
      mode: automation.mode,
      selectedTask: {
        projectId,
        phaseId: selected.task.phaseId,
        taskId: selected.task.taskId,
        title: selected.task.title,
        status: selected.task.status,
        score: selected.score,
      },
      selectionReason: reflectiveAction
        ? `${selected.reason} ${
            reflectiveAction.kind === 'update-task-status'
              ? 'Grounded reflection proposed governed task completion.'
              : 'Grounded reflection proposed a governed follow-on draft task.'
          }`
        : selected.reason,
      automation,
    };
  }

  if (!derivedDraft) {
    throw new Error('Derived draft invariant violated.');
  }

  const automation = await runVictorSafeAutomation(
    {
      dryRun,
      maxActions,
      actorId: request.actorId,
      projectsDir,
      actions: [derivedDraft.action],
    },
    async (queryProjectId, queryText) => {
      if (queryProjectId === projectId && queryText === derivedDraft.query) {
        return derivedDraft.groundedContext;
      }
      return groundedQuery(queryProjectId, queryText);
    },
  );

  const resultingTaskId = automation.results[0]?.taskId ?? `derived-${normalize(derivedDraft.action.title)}`;

  return {
    status: automation.status,
    mode: automation.mode,
    selectedTask: {
      projectId,
      phaseId: derivedDraft.targetPhase.phaseId,
      taskId: resultingTaskId,
      title: derivedDraft.action.title,
      status: 'pending',
      score: derivedDraft.score,
    },
    selectionReason: `No authored governed task was available. ${derivedDraft.reason}`,
    automation,
  };
}

export async function previewGovernedAutomationSelection(
  request: Pick<GovernedBuildRequest, 'projectId' | 'projectsDir'>,
): Promise<GovernedBuildSelectionPreview> {
  const projectId = request.projectId?.trim() || DEFAULT_AUTOMATION_PROJECT_ID;
  const projectsDir = resolveProjectsDir(request.projectsDir);
  const phases = await readPhases(projectId, projectsDir);
  const selected = selectGovernedAutomationTask(projectId, phases);

  if (!selected) {
    return {
      projectId,
      reason: 'No eligible governed automation task was found.',
    };
  }

  return {
    projectId,
    mode: selected.task.status === 'in-progress' ? 'reflect' : 'advance',
    selectedTask: {
      projectId,
      phaseId: selected.phase.phaseId,
      taskId: selected.task.taskId,
      title: selected.task.title,
      status: selected.task.status,
      score: selected.score,
    },
    reason: selected.reason,
  };
}

function selectGovernedAutomationTask(projectId: string, phases: BuilderConsolePhase[]) {
  return selectPendingGovernedAutomationTask(projectId, phases) ?? collectActiveCandidates(projectId, phases)[0] ?? null;
}

async function readPhases(projectId: string, projectsDir: string): Promise<BuilderConsolePhase[]> {
  const planningLedger = createPlanningLedger(projectId, projectsDir);
  const storeIntegrity = createStoreIntegrity(projectsDir);
  const pathStore = new ViewStore(projectsDir, projectId, 'path', {
    ledger: planningLedger,
    integrity: storeIntegrity,
  });
  try {
    const payload = await pathStore.read<{ phases?: BuilderConsolePhase[] }>();
    return payload?.phases ?? [];
  } catch {
    // Fallback: try reading the file directly and stripping any log lines
    // This handles cases where a prior write prepended non-JSON content
    try {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(`${projectsDir}/${projectId}/path/phases.json`, 'utf-8');
      const jsonStart = raw.indexOf('{');
      if (jsonStart > 0) {
        const parsed = JSON.parse(raw.slice(jsonStart)) as { phases?: BuilderConsolePhase[] };
        return parsed?.phases ?? [];
      }
    } catch {
      // Both attempts failed
    }
    return [];
  }
}

function keywordScore(text: string): number {
  const normalized = normalize(text);
  return GOVERNED_AUTOMATION_TERMS.reduce((score, term) => (
    normalized.includes(normalize(term)) ? score + 1 : score
  ), 0);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function selectPendingGovernedAutomationTask(projectId: string, phases: BuilderConsolePhase[]) {
  const currentPhase = resolveCurrentGovernedPhase(phases);
  if (!currentPhase) {
    return null;
  }

  const pendingCandidates = [currentPhase].flatMap((phase) => {
    const phaseText = `${phase.name} ${phase.objective ?? ''}`;
    const phaseScore = keywordScore(phaseText);
    return (phase.tasks ?? [])
      .filter((task) => task.status === 'pending')
      .map((task, taskIndex) => {
        const taskText = `${task.title} ${task.description} ${task.acceptance.join(' ')}`;
        const score = phaseScore + keywordScore(taskText);
        return {
          phase,
          task,
          taskIndex,
          score,
          reason: `Selected pending task "${task.title}" as the next authored governed step for ${projectId}.`,
        };
      })
      .filter((candidate) => candidate.score > 0);
  });

  pendingCandidates.sort((left, right) => left.taskIndex - right.taskIndex || right.score - left.score || left.task.title.localeCompare(right.task.title));
  return pendingCandidates[0] ?? null;
}

function collectActiveCandidates(projectId: string, phases: BuilderConsolePhase[]) {
  const currentPhase = resolveCurrentGovernedPhase(phases);
  if (!currentPhase) {
    return [];
  }

  const activeCandidates = [currentPhase].flatMap((phase) => {
    const phaseText = `${phase.name} ${phase.objective ?? ''}`;
    const phaseScore = keywordScore(phaseText);
    return (phase.tasks ?? [])
      .filter((task) => task.status === 'in-progress')
      .map((task) => {
        const taskText = `${task.title} ${task.description} ${task.acceptance.join(' ')}`;
        const score = phaseScore + keywordScore(taskText);
        return {
          phase,
          task,
          score,
          reason: `Selected active task "${task.title}" for grounded reflection because the governed automation queue for ${projectId} is already in progress.`,
        };
      })
      .filter((candidate) => candidate.score > 0);
  });

  activeCandidates.sort((left, right) => right.score - left.score || left.task.title.localeCompare(right.task.title));
  return activeCandidates;
}

async function assessActiveGovernedAutomationTask(
  projectId: string,
  phases: BuilderConsolePhase[],
  groundedQuery: (projectId: string, query: string) => Promise<GroundedContextBundle>,
): Promise<{
  candidate: ReturnType<typeof collectActiveCandidates>[number];
  groundedContext: GroundedContextBundle;
  action: AutomationAction | null;
} | null> {
  const activeCandidates = collectActiveCandidates(projectId, phases);
  const draftCandidates: Array<{
    candidate: ReturnType<typeof collectActiveCandidates>[number];
    groundedContext: GroundedContextBundle;
    action: AutomationAction;
  }> = [];
  let fallback: {
    candidate: ReturnType<typeof collectActiveCandidates>[number];
    groundedContext: GroundedContextBundle;
    action: AutomationAction | null;
  } | null = null;

  for (const candidate of activeCandidates) {
    const query = buildExecutionFirstReflectionQuery(candidate.task.title, candidate.phase.name);
    const groundedContext = await groundedQuery(projectId, query);
    const completionAction = buildCompletionStatusAction(projectId, candidate, query, groundedContext);
    if (completionAction) {
      return { candidate, groundedContext, action: completionAction };
    }
    const draftAction = buildReflectiveDraftTaskAction(
      projectId,
      candidate.task,
      candidate.phase.name,
      query,
      groundedContext,
      candidate,
    );
    if (draftAction) {
      draftCandidates.push({ candidate, groundedContext, action: draftAction });
    }
    if (!fallback || shouldHoldUmbrellaTaskOpen(fallback.candidate)) {
      fallback = { candidate, groundedContext, action: null };
    }
  }

  if (draftCandidates.length > 0) {
    return draftCandidates[0];
  }

  return fallback;
}

function buildCompletionStatusAction(
  projectId: string,
  candidate: ReturnType<typeof collectActiveCandidates>[number],
  query: string,
  groundedContext: GroundedContextBundle,
): AutomationAction | null {
  if (groundedContext.contradictions.length > 0 || groundedContext.missingInformation.length > 0) {
    return null;
  }
  if (shouldHoldUmbrellaTaskOpen(candidate)) {
    return null;
  }
  if (!hasSatisfiedAcceptance(candidate.task.acceptance, groundedContext)) {
    return null;
  }

  return {
    kind: 'update-task-status',
    projectId,
    phaseId: candidate.phase.phaseId,
    taskId: candidate.task.taskId,
    taskTitle: candidate.task.title,
    status: 'done',
    query,
  };
}

function shouldHoldUmbrellaTaskOpen(candidate: ReturnType<typeof collectActiveCandidates>[number]): boolean {
  const siblingInProgressCount = (candidate.phase.tasks ?? [])
    .filter((task) => task.status === 'in-progress' && task.taskId !== candidate.task.taskId)
    .length;
  return siblingInProgressCount > 0 && normalize(candidate.task.title).startsWith('automate ');
}

function shouldSuppressUmbrellaFollowOnDraft(candidate: ReturnType<typeof collectActiveCandidates>[number]): boolean {
  if (!normalize(candidate.task.title).startsWith('automate ')) {
    return false;
  }
  return (candidate.phase.tasks ?? [])
    .some((task) => task.taskId !== candidate.task.taskId && task.status === 'in-progress');
}

function hasSatisfiedAcceptance(acceptance: string[], groundedContext: GroundedContextBundle): boolean {
  if (acceptance.length === 0) {
    return false;
  }
  return acceptance.every((criterion) => criterionSatisfied(criterion, groundedContext));
}

function criterionSatisfied(criterion: string, groundedContext: GroundedContextBundle): boolean {
  const normalizedCriterion = normalizeEvidence(criterion);
  if (!normalizedCriterion) {
    return false;
  }

  const evidenceTexts = [
    ...groundedContext.semanticNodes.flatMap((node) => [node.label, node.summary]),
    ...groundedContext.chunkHits.map((hit) => hit.chunk.text),
  ].map(normalizeEvidence);

  return evidenceTexts.some((evidence) => {
    if (!evidence) {
      return false;
    }
    if (evidence.includes(normalizedCriterion) || normalizedCriterion.includes(evidence)) {
      return true;
    }
    const criterionTerms = new Set(normalizedCriterion.split(' ').filter(Boolean));
    const evidenceTerms = new Set(evidence.split(' ').filter(Boolean));
    const overlap = [...criterionTerms].filter((term) => evidenceTerms.has(term)).length;
    return criterionTerms.size > 0 && overlap / criterionTerms.size >= 0.7;
  });
}

function normalizeEvidence(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bi\s*\/\s*o\b/g, ' input output ')
    .replace(/\bio\b/g, ' input output ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildReflectiveDraftTaskAction(
  projectId: string,
  task: BuilderConsoleTask,
  phaseName: string,
  query: string,
  groundedContext: GroundedContextBundle,
  candidate?: ReturnType<typeof collectActiveCandidates>[number],
): AutomationAction | null {
  if (candidate && shouldSuppressUmbrellaFollowOnDraft(candidate)) {
    return null;
  }

  const recommendation = selectConcreteRecommendation(task, groundedContext.recommendedNextActions);
  if (!recommendation) {
    return null;
  }

  const title = toDraftTaskTitle(recommendation);
  if (!title || normalize(title) === normalize(task.title)) {
    return null;
  }

  return {
    kind: 'create-draft-task',
    projectId,
    phaseId: task.phaseId,
    title,
    description: [
      `Derived from grounded reflection on active task "${task.title}" in phase "${phaseName}".`,
      `Recommended next action: ${recommendation}`,
    ].join(' '),
    acceptance: [
      `Follow-on work remains grounded in "${task.title}" and governed through Builder Console.`,
    ],
    query,
  };
}

function selectConcreteRecommendation(task: BuilderConsoleTask, recommendations: string[]): string | null {
  for (const recommendation of recommendations) {
    const candidate = recommendation.trim();
    if (!candidate) {
      continue;
    }
    const normalized = normalize(candidate);
    if (!normalized || normalized === normalize(task.title)) {
      continue;
    }
    if (normalized.includes('advance the governed automation task')) {
      continue;
    }
    if (normalized.includes('grounded reflection')) {
      continue;
    }
    if (normalized.split(' ').length < 4) {
      continue;
    }
    return candidate;
  }
  return null;
}

function toDraftTaskTitle(recommendation: string): string {
  const trimmed = recommendation.trim().replace(/[.?!]+$/g, '');
  const withoutPrefix = trimmed.replace(/^(start implementation with|start with|begin with|begin|continue with|proceed with|next step:?|next:?)/i, '').trim();
  const title = withoutPrefix || trimmed;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

async function deriveGovernedAutomationDraft(
  projectId: string,
  phases: BuilderConsolePhase[],
  groundedQuery: (projectId: string, query: string) => Promise<GroundedContextBundle>,
): Promise<{
  action: AutomationAction & { kind: 'create-draft-task' };
  groundedContext: GroundedContextBundle;
  query: string;
  targetPhase: BuilderConsolePhase;
  score: number;
  reason: string;
} | null> {
  if (phases.length === 0) {
    return null;
  }

  const blockedPhase = phases.find((phase) => normalizePhaseStatus(phase) === 'blocked');
  if (blockedPhase) {
    return null;
  }

  const targetPhase = sortPhasesByOrdinal(phases).at(-1);
  if (!targetPhase) {
    return null;
  }

  const phaseSummary = sortPhasesByOrdinal(phases)
    .map((phase) => `Phase ${phase.ordinal ?? '?'} ${phase.name} (${normalizePhaseStatus(phase)}): ${phase.objective ?? 'No objective recorded.'}`)
    .join(' ');
  const query = buildExecutionFirstProjectDraftQuery(projectId, phaseSummary, targetPhase.name);
  const groundedContext = await groundedQuery(projectId, query);
  const recommendation = selectProjectLevelRecommendation(phases, groundedContext.recommendedNextActions);
  if (!recommendation) {
    return null;
  }

  const title = toDraftTaskTitle(recommendation);
  if (!title) {
    return null;
  }

  const phaseScore = keywordScore(`${targetPhase.name} ${targetPhase.objective ?? ''}`);
  const score = phaseScore + keywordScore(title);

  return {
    action: {
      kind: 'create-draft-task',
      projectId,
      phaseId: targetPhase.phaseId,
      title,
      description: [
        `Derived from grounded project-state review after authored queue exhaustion in phase "${targetPhase.name}".`,
        `Recommended next action: ${recommendation}`,
      ].join(' '),
      acceptance: [
        `The drafted task remains grounded in explicit project goals or decisions for "${projectId}".`,
      ],
      query,
    },
    groundedContext,
    query,
    targetPhase,
    score,
    reason: `Grounded project-state derivation proposed follow-on task "${title}" in phase "${targetPhase.name}".`,
  };
}

function selectProjectLevelRecommendation(
  phases: BuilderConsolePhase[],
  recommendations: string[],
): string | null {
  const existingTitles = new Set(
    phases.flatMap((phase) => (phase.tasks ?? []).map((task) => normalize(task.title))),
  );

  for (const recommendation of recommendations) {
    const candidate = recommendation.trim();
    if (!candidate) {
      continue;
    }
    const normalized = normalize(candidate);
    if (!normalized) {
      continue;
    }
    if (normalized.includes('advance the governed automation task')) {
      continue;
    }
    if (normalized.includes('continue observing cadence')) {
      continue;
    }
    if (normalized.includes('grounded reflection')) {
      continue;
    }
    if (normalized.includes('no eligible governed automation task')) {
      continue;
    }
    if (normalized.split(' ').length < 4) {
      continue;
    }

    const title = normalize(toDraftTaskTitle(candidate));
    if (!title || existingTitles.has(title)) {
      continue;
    }

    return candidate;
  }

  return null;
}

function resolveCurrentGovernedPhase(phases: BuilderConsolePhase[]): BuilderConsolePhase | null {
  for (const phase of sortPhasesByOrdinal(phases)) {
    const status = normalizePhaseStatus(phase);
    if (status === 'complete') {
      continue;
    }
    if (status === 'blocked') {
      return null;
    }
    return phase;
  }
  return null;
}

function sortPhasesByOrdinal(phases: BuilderConsolePhase[]): BuilderConsolePhase[] {
  return [...phases].sort((left, right) => (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER));
}

function normalizePhaseStatus(phase: BuilderConsolePhase): 'planned' | 'active' | 'complete' | 'blocked' {
  const normalized = normalize(String(phase.status ?? ''));
  if (normalized === 'blocked') {
    return 'blocked';
  }
  if (normalized === 'active') {
    return 'active';
  }
  if (normalized === 'complete' || normalized === 'completed') {
    return 'complete';
  }
  if (normalized === 'planned' || normalized === 'pending') {
    return 'planned';
  }

  const tasks = phase.tasks ?? [];
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

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}
