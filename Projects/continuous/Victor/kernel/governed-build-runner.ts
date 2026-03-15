import { existsSync } from 'node:fs';

import { ViewStore, createPlanningLedger, createStoreIntegrity } from '../../Zo-Qore/runtime/planning';
import { runVictorSafeAutomation } from './automation-runner';
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

  const preview = await previewGovernedAutomationSelection({
    projectId,
    projectsDir,
  });
  const selected = preview.selectedTask
    ? {
        phase: {
          phaseId: preview.selectedTask.phaseId,
          name: '',
        },
        task: {
          taskId: preview.selectedTask.taskId,
          phaseId: preview.selectedTask.phaseId,
          title: preview.selectedTask.title,
          description: '',
          acceptance: [],
          status: preview.selectedTask.status,
        },
        score: preview.selectedTask.score,
        reason: preview.reason,
      }
    : null;
  const phases = await readPhases(projectId, projectsDir);
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
  const automation = await runVictorSafeAutomation(
    {
      dryRun: reflectionMode ? true : dryRun,
      maxActions,
      actorId: request.actorId,
      projectsDir,
      actions: [
          {
            kind: 'update-task-status',
            projectId,
            phaseId: selected.phase.phaseId,
            taskId: selected.task.taskId,
            taskTitle: selected.task.title,
            status: 'in-progress',
            query,
          },
      ],
    },
    groundedQuery,
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
    selectionReason: selected.reason,
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
  if (pendingCandidates[0]) {
    return pendingCandidates[0];
  }

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
  return activeCandidates[0] ?? null;
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

function resolveProjectsDir(projectsDir?: string): string {
  const candidate = projectsDir?.trim() || process.env.BUILDER_CONSOLE_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR;
  if (!existsSync(candidate)) {
    throw new Error(`Builder Console projects directory does not exist: ${candidate}`);
  }
  return candidate;
}
