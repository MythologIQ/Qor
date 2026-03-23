import { readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

import { appendSystemReflection } from './system-reflection';
import { VictorKernelUnified } from './victor-kernel-unified';

const DEFAULT_ROOT = '/home/workspace/Documents';
const DEFAULT_PROJECT_ID = 'victor-research';
const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.pdf',
]);
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '__pycache__',
]);

const REFLECTION_QUERIES = [
  'How does the research corpus characterize autopoietic system design?',
  'What architecture patterns are proposed for wisdom over intelligence systems?',
  'What governance constraints should guide Victor when integrating new research into long-term memory?',
  'What contradictions or unresolved constraints exist across the research corpus?',
] as const;

async function main() {
  const { root, projectId } = parseArgs(Bun.argv.slice(2));
  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  const files = await collectFiles(root);
  const ingested: Array<{ path: string; changedChunks: number; addedNodes: number }> = [];

  for (const path of files) {
    const content = await loadContent(path);
    const plan = await kernel.ingestArtifactContent(path, content, projectId);
    ingested.push({
      path,
      changedChunks: plan.changedChunkIds.length,
      addedNodes: plan.addedNodeIds.length,
    });
    console.log(`ingested ${relative(root, path)}`);
  }

  const bundles = [];
  for (const query of REFLECTION_QUERIES) {
    bundles.push(await kernel.groundedQuery(projectId, query));
  }

  const reflection = await appendSystemReflection({
    actorId: 'victor-ingest',
    projectId,
    mode: 'dry-run',
    cadenceMode: 'baseline',
    reason: 'Post-ingest reflection after promoting the Documents corpus from short-term ingest into durable governed memory.',
    content: formatReflection(root, ingested, REFLECTION_QUERIES, bundles),
  });

  console.log(JSON.stringify({
    projectId,
    root,
    ingestedCount: ingested.length,
    files: ingested.map((entry) => ({
      path: relative(root, entry.path),
      changedChunks: entry.changedChunks,
      addedNodes: entry.addedNodes,
    })),
    reflection,
  }, null, 2));
}

function parseArgs(args: string[]): { root: string; projectId: string } {
  let root = DEFAULT_ROOT;
  let projectId = DEFAULT_PROJECT_ID;

  for (const arg of args) {
    if (arg.startsWith('--root=')) {
      root = resolve(arg.slice('--root='.length));
      continue;
    }

    if (arg.startsWith('--project-id=')) {
      projectId = arg.slice('--project-id='.length).trim() || DEFAULT_PROJECT_ID;
    }
  }

  return { root, projectId };
}

async function collectFiles(root: string): Promise<string[]> {
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

async function loadContent(path: string): Promise<string> {
  if (extname(path).toLowerCase() === '.pdf') {
    const output = Bun.spawnSync(['pdftotext', '-layout', '-nopgbrk', path, '-'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (output.exitCode !== 0) {
      throw new Error(`pdftotext failed for ${path}: ${output.stderr.toString().trim()}`);
    }
    return output.stdout.toString();
  }

  return Bun.file(path).text();
}

function formatReflection(
  root: string,
  ingested: Array<{ path: string; changedChunks: number; addedNodes: number }>,
  queries: readonly string[],
  bundles: Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>[],
): string {
  const totalChangedChunks = ingested.reduce((sum, entry) => sum + entry.changedChunks, 0);
  const totalAddedNodes = ingested.reduce((sum, entry) => sum + entry.addedNodes, 0);
  const topFiles = ingested
    .slice()
    .sort((left, right) => right.addedNodes - left.addedNodes || right.changedChunks - left.changedChunks)
    .slice(0, 5)
    .map((entry) => `- ${relative(root, entry.path)}: ${entry.changedChunks} changed chunks, ${entry.addedNodes} added nodes`);
  const groundedModes = bundles.map((bundle) => bundle.recallDecision?.mode ?? 'unknown');
  const uniqueRecommendations = [...new Set(
    bundles.flatMap((bundle) => bundle.recommendedNextActions).map((item) => item.trim()).filter(Boolean),
  )].slice(0, 6);
  const salientNodes = [...new Set(
    bundles.flatMap((bundle) => bundle.semanticNodes).map((node) => `${node.nodeType}: ${node.label}`),
  )].slice(0, 10);
  const contradictions = bundles.flatMap((bundle) => bundle.contradictions.map((item) => `${item.kind}: ${item.key}`));
  const missingInformation = bundles.flatMap((bundle) => bundle.missingInformation);

  return [
    '# Victor Ingest Reflection',
    '',
    '## Ingest',
    `- Corpus root: ${root}`,
    `- Artifacts ingested: ${ingested.length}`,
    `- Changed chunks: ${totalChangedChunks}`,
    `- Added semantic nodes: ${totalAddedNodes}`,
    ...topFiles,
    '',
    '## Consolidation',
    `- Recall modes across reflection queries: ${groundedModes.join(', ')}`,
    ...queries.map((query, index) => `- Query ${index + 1}: ${query}`),
    '',
    '## Long-Term Memory',
    ...salientNodes.map((item) => `- ${item}`),
    '',
    '## Governance',
    ...(contradictions.length > 0 ? contradictions.map((item) => `- Friction: ${item}`) : ['- No active contradictions surfaced in the reflection pass.']),
    ...(missingInformation.length > 0 ? missingInformation.slice(0, 8).map((item) => `- Missing: ${item}`) : ['- No missing-information blockers surfaced in the reflection pass.']),
    '',
    '## Next Actions',
    ...(uniqueRecommendations.length > 0 ? uniqueRecommendations.map((item) => `- ${item}`) : ['- Continue ingesting new material under governed recall and re-run reflection after each meaningful corpus expansion.']),
  ].join('\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
