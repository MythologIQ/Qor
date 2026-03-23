import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import { runGovernedAutomationBuild } from '../governed-build-runner';
import type { VictorKernelUnified } from '../victor-kernel-unified';
import { loadBuilderConsoleArtifacts } from './builder-console';
import { runEvaluationSuite } from './evaluate';

const DEFAULT_DOCUMENTS_ROOT = '/home/workspace/Documents';
const DEFAULT_BUILDER_PROJECT_ID = 'builder-console';
const DEFAULT_RESEARCH_PROJECT_ID = 'victor-research';
const BUILDER_TASK_QUERY = 'What comms tab prompt automation task exists in Builder Console?';
const BUILDER_GOVERNANCE_QUERY = 'What governance constraint binds Victor when operating through Builder Console?';
const RESEARCH_QUERY = 'What contradictions or unresolved constraints exist across the research corpus?';
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yml', '.yaml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '__pycache__']);

export interface MemoryAutomationReadinessRequest {
  kernel: VictorKernelUnified;
  projectsDir?: string;
  documentsRoot?: string;
  builderProjectId?: string;
  researchProjectId?: string;
  ingestBuilderArtifacts?: boolean;
  ingestDocuments?: boolean;
}

export interface MemoryAutomationReadinessCriterion {
  id:
    | 'evaluation-suite'
    | 'builder-artifacts'
    | 'builder-recall'
    | 'research-corpus'
    | 'automation-dry-run';
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  detail: string;
  data?: Record<string, unknown>;
}

export interface MemoryAutomationReadinessSummary {
  overall: 'ready' | 'conditionally-ready' | 'not-ready';
  checkedAt: string;
  builderProjectId: string;
  researchProjectId: string;
  criteria: MemoryAutomationReadinessCriterion[];
  recommendations: string[];
}

export async function assessMemoryAutomationReadiness(
  request: MemoryAutomationReadinessRequest,
): Promise<MemoryAutomationReadinessSummary> {
  const kernel = request.kernel;
  const builderProjectId = request.builderProjectId?.trim() || DEFAULT_BUILDER_PROJECT_ID;
  const researchProjectId = request.researchProjectId?.trim() || DEFAULT_RESEARCH_PROJECT_ID;
  const documentsRoot = resolve(request.documentsRoot?.trim() || DEFAULT_DOCUMENTS_ROOT);
  const criteria: MemoryAutomationReadinessCriterion[] = [];

  const evaluation = await runEvaluationSuite();
  criteria.push({
    id: 'evaluation-suite',
    label: 'Memory evaluation suite',
    status: evaluation.failed === 0 ? 'pass' : 'fail',
    detail:
      evaluation.failed === 0
        ? `All ${evaluation.passed}/${evaluation.total} evaluation cases passed.`
        : `${evaluation.failed}/${evaluation.total} evaluation cases failed.`,
    data: {
      total: evaluation.total,
      passed: evaluation.passed,
      failed: evaluation.failed,
      failures: evaluation.results.filter((result) => !result.passed),
    },
  });

  let builderArtifactsLoaded = false;
  if (!request.projectsDir) {
    criteria.push({
      id: 'builder-artifacts',
      label: 'Builder Console artifact ingestion',
      status: 'fail',
      detail: 'No Builder Console projects directory was provided for live automation readiness.',
    });
  } else if (!request.ingestBuilderArtifacts && !existsSync(request.projectsDir)) {
    criteria.push({
      id: 'builder-artifacts',
      label: 'Builder Console artifact ingestion',
      status: 'fail',
      detail: `Builder Console projects directory does not exist: ${request.projectsDir}`,
    });
  } else {
    const artifacts = await loadBuilderConsoleArtifacts(request.projectsDir, builderProjectId);
    if (artifacts.length === 0) {
      criteria.push({
        id: 'builder-artifacts',
        label: 'Builder Console artifact ingestion',
        status: 'fail',
        detail: 'No Builder Console artifacts were available to seed live memory.',
      });
    } else {
      if (request.ingestBuilderArtifacts !== false) {
        for (const artifact of artifacts) {
          await kernel.ingestArtifactContent(artifact.path, artifact.content, artifact.projectId);
        }
      }
      builderArtifactsLoaded = true;
      criteria.push({
        id: 'builder-artifacts',
        label: 'Builder Console artifact ingestion',
        status: 'pass',
        detail: `Loaded ${artifacts.length} Builder Console artifacts into the memory kernel.`,
        data: {
          artifactCount: artifacts.length,
          sourceKinds: [...new Set(artifacts.map((artifact) => artifact.sourceKind))],
        },
      });
    }
  }

  if (!builderArtifactsLoaded) {
    criteria.push({
      id: 'builder-recall',
      label: 'Builder Console grounded recall',
      status: 'skipped',
      detail: 'Builder Console recall check was skipped because artifact ingestion did not complete.',
    });
  } else {
    const taskResult = await kernel.groundedQuery(builderProjectId, BUILDER_TASK_QUERY);
    const governanceResult = await kernel.groundedQuery(builderProjectId, BUILDER_GOVERNANCE_QUERY);
    const hasPromptAutomationTask = taskResult.semanticNodes.some(
      (node) => node.nodeType === 'Task' && /automate comms-tab prompt construction/i.test(node.label),
    );
    const hasBindingGovernanceDecision = governanceResult.semanticNodes.some(
      (node) => node.nodeType === 'Decision' && /governance is binding on victor/i.test(node.label),
    );
    const recallBlocked = taskResult.recallDecision?.mode === 'blocked' || governanceResult.recallDecision?.mode === 'blocked';
    criteria.push({
      id: 'builder-recall',
      label: 'Builder Console grounded recall',
      status: hasPromptAutomationTask && hasBindingGovernanceDecision && !recallBlocked ? 'pass' : 'fail',
      detail:
        hasPromptAutomationTask && hasBindingGovernanceDecision && !recallBlocked
          ? 'Builder Console task and governance recall both resolved through grounded memory.'
          : 'Builder Console recall did not return the task and binding governance evidence needed for safe automation.',
      data: {
        taskRecallMode: taskResult.recallDecision?.mode ?? 'unknown',
        governanceRecallMode: governanceResult.recallDecision?.mode ?? 'unknown',
        taskLabels: taskResult.semanticNodes.filter((node) => node.nodeType === 'Task').map((node) => node.label),
        decisionLabels: governanceResult.semanticNodes.filter((node) => node.nodeType === 'Decision').map((node) => node.label),
        taskMissingInformation: taskResult.missingInformation,
        governanceMissingInformation: governanceResult.missingInformation,
      },
    });
  }

  if (!existsSync(documentsRoot)) {
    criteria.push({
      id: 'research-corpus',
      label: 'Research corpus ingest and recall',
      status: 'warn',
      detail: `Research corpus root does not exist: ${documentsRoot}`,
    });
  } else {
    const files = await collectCorpusFiles(documentsRoot);
    if (files.length === 0) {
      criteria.push({
        id: 'research-corpus',
        label: 'Research corpus ingest and recall',
        status: 'warn',
        detail: 'Research corpus root exists, but no ingestible files were found.',
      });
    } else {
      if (request.ingestDocuments !== false) {
        for (const path of files) {
          await kernel.ingestWorkspaceFile(path, researchProjectId);
        }
      }
      const researchResult = await kernel.groundedQuery(researchProjectId, RESEARCH_QUERY);
      const hasEvidence = researchResult.chunkHits.length > 0 || researchResult.semanticNodes.length > 0;
      const researchStatus = !hasEvidence
        ? 'fail'
        : researchResult.recallDecision?.mode === 'blocked'
          ? 'warn'
          : 'pass';
      criteria.push({
        id: 'research-corpus',
        label: 'Research corpus ingest and recall',
        status: researchStatus,
        detail: hasEvidence
          ? `Research corpus was ingested from ${files.length} files; recall mode is ${researchResult.recallDecision?.mode ?? 'unknown'}.`
          : 'Research corpus ingest completed but the verification query still found no usable evidence.',
        data: {
          fileCount: files.length,
          recallMode: researchResult.recallDecision?.mode ?? 'unknown',
          chunkHitCount: researchResult.chunkHits.length,
          semanticNodeCount: researchResult.semanticNodes.length,
          contradictionCount: researchResult.contradictions.length,
          missingInformation: researchResult.missingInformation,
        },
      });
    }
  }

  const builderRecallPassed = criteria.some((criterion) => criterion.id === 'builder-recall' && criterion.status === 'pass');
  if (!request.projectsDir || !builderRecallPassed) {
    criteria.push({
      id: 'automation-dry-run',
      label: 'Governed automation dry-run',
      status: 'skipped',
      detail: 'Automation dry-run was skipped because Builder Console memory readiness did not pass.',
    });
  } else {
    const automationResult = await runGovernedAutomationBuild(
      {
        projectId: builderProjectId,
        projectsDir: request.projectsDir,
        dryRun: true,
        maxActions: 1,
      },
      async (projectId, query) => kernel.groundedQuery(projectId, query),
    );
    const primaryAction = automationResult.automation.results[0];
    const automationPassed =
      automationResult.status === 'completed'
      && automationResult.mode === 'dry-run'
      && Boolean(primaryAction)
      && primaryAction.status === 'eligible';
    criteria.push({
      id: 'automation-dry-run',
      label: 'Governed automation dry-run',
      status: automationPassed ? 'pass' : 'fail',
      detail: automationPassed
        ? 'Governed automation completed a dry-run preview against live memory without blocking.'
        : 'Governed automation could not complete a safe dry-run preview against live memory.',
      data: {
        status: automationResult.status,
        mode: automationResult.mode,
        selectionReason: automationResult.selectionReason,
        selectedTask: automationResult.selectedTask,
        automation: automationResult.automation,
      },
    });
  }

  const failed = criteria.filter((criterion) => criterion.status === 'fail');
  const warned = criteria.filter((criterion) => criterion.status === 'warn');
  const overall = failed.length > 0 ? 'not-ready' : warned.length > 0 ? 'conditionally-ready' : 'ready';

  return {
    overall,
    checkedAt: new Date().toISOString(),
    builderProjectId,
    researchProjectId,
    criteria,
    recommendations: buildRecommendations(criteria),
  };
}

function buildRecommendations(criteria: MemoryAutomationReadinessCriterion[]): string[] {
  const recommendations: string[] = [];

  for (const criterion of criteria) {
    if (criterion.status === 'pass' || criterion.status === 'skipped') {
      continue;
    }

    if (criterion.id === 'evaluation-suite') {
      recommendations.push('Fix the failing memory evaluation cases before exposing live automation to execute-mode decisions.');
      continue;
    }

    if (criterion.id === 'builder-artifacts') {
      recommendations.push('Restore a readable Builder Console project graph so Victor has a governed live substrate to ingest.');
      continue;
    }

    if (criterion.id === 'builder-recall') {
      recommendations.push('Do not connect live automation until Builder Console queries return grounded task and governance evidence.');
      continue;
    }

    if (criterion.id === 'research-corpus') {
      recommendations.push('Keep ingesting and pressure-testing the research corpus so ambiguity, contradiction, and anti-bias handling stay exercised.');
      continue;
    }

    if (criterion.id === 'automation-dry-run') {
      recommendations.push('Require a clean governed automation dry-run before permitting live Victor automation hookup.');
    }
  }

  return recommendations;
}

async function collectCorpusFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  await walk(root, results);
  return results.sort();
}

async function walk(current: string, results: string[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(current, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walk(path, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!ALLOWED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    results.push(path);
  }
}
