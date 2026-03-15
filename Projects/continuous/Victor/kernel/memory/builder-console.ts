import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

interface BuilderConsoleProject {
  projectId: string;
  name: string;
  description?: string;
  createdBy?: string;
  pipelineState?: Record<string, string>;
}

interface VoidThought {
  thoughtId: string;
  projectId: string;
  content: string;
  source: 'text' | 'voice';
  capturedAt: string;
  capturedBy: string;
  tags: string[];
  status: 'raw' | 'claimed';
}

interface RevealCluster {
  clusterId: string;
  projectId: string;
  label: string;
  thoughtIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'formed';
}

interface ConstellationMap {
  constellationId: string;
  projectId: string;
  nodes: Array<{
    nodeId: string;
    clusterId: string;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    edgeId: string;
    fromNodeId: string;
    toNodeId: string;
    relationship: string;
    weight: number;
  }>;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'mapped';
}

interface PathPhase {
  phaseId: string;
  projectId: string;
  ordinal: number;
  name: string;
  objective: string;
  sourceClusterIds: string[];
  tasks: Array<{
    taskId: string;
    phaseId: string;
    title: string;
    description: string;
    acceptance: string[];
    status: 'pending' | 'in-progress' | 'done' | 'blocked';
  }>;
  status: 'planned' | 'active' | 'complete' | 'blocked';
  createdAt: string;
  updatedAt: string;
}

export interface BuilderConsoleArtifact {
  path: string;
  content: string;
  projectId: string;
  sourceProjectId: string;
  sourceKind: 'project' | 'void' | 'reveal' | 'constellation' | 'path';
}

export async function resolveBuilderConsoleProjectsDir(repoRoot: string): Promise<string | null> {
  const direct = join(repoRoot, '.qore', 'projects');
  if (await pathExists(direct)) {
    return direct;
  }

  const backupsDir = join(repoRoot, '.failsafe', 'backups');
  if (!(await pathExists(backupsDir))) {
    return null;
  }

  const entries = await readdir(backupsDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(backupsDir, entry.name, 'files', '.qore', 'projects'))
    .sort()
    .reverse();

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function loadBuilderConsoleArtifacts(
  projectsDir: string,
  targetProjectId = 'builder-console',
): Promise<BuilderConsoleArtifact[]> {
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const projectDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => join(projectsDir, entry.name));
  const artifacts: BuilderConsoleArtifact[] = [];

  for (const projectDir of projectDirs.sort()) {
    const project = await readJson<BuilderConsoleProject>(join(projectDir, 'project.json'));
    if (!project?.projectId) {
      continue;
    }

    const thoughts = await readJsonLines<VoidThought>(join(projectDir, 'void', 'thoughts.jsonl'));
    const clusters = (await readJson<{ clusters?: RevealCluster[] }>(join(projectDir, 'reveal', 'clusters.json')))?.clusters ?? [];
    const constellation = await readJson<ConstellationMap>(join(projectDir, 'constellation', 'map.json'));
    const phases = (await readJson<{ phases?: PathPhase[] }>(join(projectDir, 'path', 'phases.json')))?.phases ?? [];

    artifacts.push({
      path: syntheticPath(project.projectId, 'project'),
      content: renderProjectSummary(project, thoughts, clusters, phases),
      projectId: targetProjectId,
      sourceProjectId: project.projectId,
      sourceKind: 'project',
    });

    if (thoughts.length > 0) {
      artifacts.push({
        path: syntheticPath(project.projectId, 'void'),
        content: renderThoughts(thoughts),
        projectId: targetProjectId,
        sourceProjectId: project.projectId,
        sourceKind: 'void',
      });
    }

    if (clusters.length > 0) {
      artifacts.push({
        path: syntheticPath(project.projectId, 'reveal'),
        content: renderClusters(clusters, thoughts),
        projectId: targetProjectId,
        sourceProjectId: project.projectId,
        sourceKind: 'reveal',
      });
    }

    if (constellation && (constellation.nodes.length > 0 || constellation.edges.length > 0)) {
      artifacts.push({
        path: syntheticPath(project.projectId, 'constellation'),
        content: renderConstellation(constellation, clusters),
        projectId: targetProjectId,
        sourceProjectId: project.projectId,
        sourceKind: 'constellation',
      });
    }

    if (phases.length > 0) {
      artifacts.push({
        path: syntheticPath(project.projectId, 'path'),
        content: renderPhases(phases, clusters),
        projectId: targetProjectId,
        sourceProjectId: project.projectId,
        sourceKind: 'path',
      });
    }
  }

  return artifacts;
}

export async function materializeBuilderConsoleArtifacts(
  artifacts: BuilderConsoleArtifact[],
): Promise<BuilderConsoleArtifact[]> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'victor-builder-console-'));
  return Promise.all(
    artifacts.map(async (artifact) => {
      const path = join(tempRoot, artifact.path);
      await mkdir(dirname(path), { recursive: true });
      await Bun.write(path, artifact.content);
      return { ...artifact, path };
    }),
  );
}

function renderProjectSummary(
  project: BuilderConsoleProject,
  thoughts: VoidThought[],
  clusters: RevealCluster[],
  phases: PathPhase[],
): string {
  const pipeline = Object.entries(project.pipelineState ?? {})
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  return [
    `# Builder Console Project ${project.name || project.projectId}`,
    '',
    'Decision: Builder Console governance is binding on Victor when operating through these artifacts.',
    `Goal: Convert fragmented ideas into actionable plans for ${project.name || project.projectId}.`,
    '',
    '## Project',
    `- Project ID: ${project.projectId}`,
    `- Name: ${project.name || project.projectId}`,
    `- Description: ${project.description || 'No description provided.'}`,
    `- Created By: ${project.createdBy || 'unknown'}`,
    '',
    '## Pipeline State',
    pipeline || '- No pipeline state recorded.',
    '',
    '## Planning Summary',
    `- Thoughts captured: ${thoughts.length}`,
    `- Clusters formed: ${clusters.length}`,
    `- Phases defined: ${phases.length}`,
  ].join('\n');
}

function renderThoughts(thoughts: VoidThought[]): string {
  return [
    '# Builder Console Void Thoughts',
    '',
    '## Thoughts',
    ...thoughts.map((thought) => [
      `### Thought ${thought.thoughtId}`,
      `- Status: ${thought.status}`,
      `- Source: ${thought.source}`,
      `- Captured By: ${thought.capturedBy}`,
      `- Captured At: ${thought.capturedAt}`,
      thought.tags.length > 0 ? `- Tags: ${thought.tags.join(', ')}` : '- Tags: none',
      '',
      thought.content,
      '',
    ].join('\n')),
  ].join('\n');
}

function renderClusters(clusters: RevealCluster[], thoughts: VoidThought[]): string {
  const thoughtById = new Map(thoughts.map((thought) => [thought.thoughtId, thought]));

  return [
    '# Builder Console Reveal Clusters',
    '',
    '## Clusters',
    ...clusters.map((cluster) => [
      `### Cluster ${cluster.label}`,
      `Decision: Cluster ${cluster.label} is a candidate actionable concept.`,
      `- Cluster ID: ${cluster.clusterId}`,
      `- Status: ${cluster.status}`,
      `- Thought Count: ${cluster.thoughtIds.length}`,
      cluster.notes ? `- Notes: ${cluster.notes}` : '- Notes: none',
      '',
      '#### Source Thoughts',
      ...cluster.thoughtIds.map((thoughtId) => `- ${thoughtById.get(thoughtId)?.content || thoughtId}`),
      '',
    ].join('\n')),
  ].join('\n');
}

function renderConstellation(constellation: ConstellationMap, clusters: RevealCluster[]): string {
  const clusterById = new Map(clusters.map((cluster) => [cluster.clusterId, cluster.label]));
  const nodeById = new Map(constellation.nodes.map((node) => [node.nodeId, node]));

  return [
    '# Builder Console Constellation Map',
    '',
    `- Status: ${constellation.status}`,
    `- Node Count: ${constellation.nodes.length}`,
    `- Edge Count: ${constellation.edges.length}`,
    '',
    '## Relationships',
    ...constellation.edges.map((edge) => {
      const from = nodeById.get(edge.fromNodeId);
      const to = nodeById.get(edge.toNodeId);
      const fromLabel = from ? clusterById.get(from.clusterId) || from.clusterId : edge.fromNodeId;
      const toLabel = to ? clusterById.get(to.clusterId) || to.clusterId : edge.toNodeId;
      return `- Dependency: ${fromLabel} ${edge.relationship} ${toLabel} (weight ${edge.weight})`;
    }),
  ].join('\n');
}

function renderPhases(phases: PathPhase[], clusters: RevealCluster[]): string {
  const clusterById = new Map(clusters.map((cluster) => [cluster.clusterId, cluster.label]));

  return [
    '# Builder Console Path Phases',
    '',
    '## Phases',
    ...phases
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((phase) => [
        `### Phase ${phase.ordinal}: ${phase.name}`,
        `Goal: ${phase.objective}`,
        `- Status: ${phase.status}`,
        phase.sourceClusterIds.length > 0
          ? `- Source Clusters: ${phase.sourceClusterIds.map((id) => clusterById.get(id) || id).join(', ')}`
          : '- Source Clusters: none',
        '',
        '#### Tasks',
        ...phase.tasks.map((task) => [
          `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}`,
          task.description ? `  - Description: ${task.description}` : '',
          ...(task.acceptance ?? []).map((criterion) => `  - Acceptance: ${criterion}`),
        ].filter(Boolean).join('\n')),
        '',
      ].join('\n')),
  ].join('\n');
}

function syntheticPath(projectId: string, kind: BuilderConsoleArtifact['sourceKind']): string {
  return join('builder-console', projectId, `${kind}.md`);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  try {
    const content = await readFile(path, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}
