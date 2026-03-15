import { existsSync } from 'node:fs';

import { ViewStore, createPlanningLedger, createStoreIntegrity } from '../../Zo-Qore/runtime/planning';
import { runVictorSafeAutomation, type AutomationAction } from './automation-runner';
import type { GroundedContextBundle } from './memory/types';

const DEFAULT_BUILDER_REPO_ROOT = '/home/workspace/Projects/continuous/Zo-Qore';
const DEFAULT_PROJECTS_DIR = `${DEFAULT_BUILDER_REPO_ROOT}/.qore/projects`;
const GOVERNED_AUTOMATION_TERMS = ['automation', 'governed', 'governance', 'victor', 'builder console', 'prompt'];

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
  name: string;
  objective?: string;
  tasks?: BuilderConsoleTask[];
}

export interface GovernedBuildRequest {
  projectId?: string;
  projectsDir?: string;
  dryRun?: boolean;
  actorId?: string;
  maxActions?: number;
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

export async function runGovernedAutomationBuild(
  request: GovernedBuildRequest,
  groundedQuery: (projectId: string, query: string) => Promise<GroundedContextBundle>,
): Promise<GovernedBuildResult> {
  const projectId = request.projectId?.trim() || 'builder-console';
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

  if (!selected) {
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
            query: 'What governed automation task should Victor advance next?',
          },
        ],
      },
      async () => ({
        query: 'What governed automation task should Victor advance next?',
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

  const reflectionMode = selected.task.status === 'in-progress';
  const query = reflectionMode
    ? `What is the next grounded reflection for the active governed automation task "${selected.task.title}" in phase "${selectedPhaseName}"?`
    : `What should happen next with the governed automation task "${selected.task.title}" in phase "${selectedPhaseName}"?`;
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

export async function previewGovernedAutomationSelection(
  request: Pick<GovernedBuildRequest, 'projectId' | 'projectsDir'>,
): Promise<GovernedBuildSelectionPreview> {
  const projectId = request.projectId?.trim() || 'builder-console';
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
  const payload = await pathStore.read<{ phases?: BuilderConsolePhase[] }>();
  return payload?.phases ?? [];
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
  const pendingCandidates = phases.flatMap((phase) => {
    const phaseText = `${phase.name} ${phase.objective ?? ''}`;
    const phaseScore = keywordScore(phaseText);
    return (phase.tasks ?? [])
      .filter((task) => task.status === 'pending')
      .map((task) => {
        const taskText = `${task.title} ${task.description} ${task.acceptance.join(' ')}`;
        const score = phaseScore + keywordScore(taskText);
        return {
          phase,
          task,
          score,
          reason: `Selected pending task "${task.title}" because it most strongly matches the governed automation objective for ${projectId}.`,
        };
      })
      .filter((candidate) => candidate.score > 0);
  });

  pendingCandidates.sort((left, right) => right.score - left.score || left.task.title.localeCompare(right.task.title));
  return pendingCandidates[0] ?? null;
}

function collectActiveCandidates(projectId: string, phases: BuilderConsolePhase[]) {
  const activeCandidates = phases.flatMap((phase) => {
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
    const query = `What is the next grounded reflection for the active governed automation task "${candidate.task.title}" in phase "${candidate.phase.name}"?`;
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
    );
    if (draftAction) {
      draftCandidates.push({ candidate, groundedContext, action: draftAction });
    }
    if (!fallback) {
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
): AutomationAction | null {
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

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}
