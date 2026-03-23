import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { refreshNegativeConstraintSummaryCache, archiveQueryFailureIfNeeded } from './memory/failure-memory';
import { applyIngestionPlan, planArtifactIngestion } from './memory/ingest';
import { LocalExerciseStore } from './memory/local-exercise-store';
import { retrieveGroundedContext } from './memory/retrieve';
import { hashContent } from './memory/provenance';

const DEFAULT_ROOT = '/home/workspace/Documents';
const DEFAULT_PROJECT_ID = 'victor-research';
const DEFAULT_QUERIES = [
  'How does the research corpus characterize autopoietic system design?',
  'What architecture patterns are proposed for wisdom over intelligence systems?',
  'What contradictions or unresolved constraints exist across the research corpus?',
];
const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
]);
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '__pycache__',
]);

async function main() {
  const { root, projectId, queries } = parseArgs(Bun.argv.slice(2));
  const store = new LocalExerciseStore();
  await store.initialize();

  const files = await collectFiles(root);
  for (const path of files) {
    const content = await readFile(path, 'utf8');
    const documentId = hashContent(projectId, path);
    const snapshot = await store.loadDocumentSnapshot(documentId);
    const plan = planArtifactIngestion({ path, content, projectId }, snapshot);
    await applyIngestionPlan(plan, store);
    console.log(`ingested ${relative(root, path)}`);
  }

  for (const query of queries) {
    const initialBundle = await retrieveGroundedContext(store, projectId, query);
    await archiveQueryFailureIfNeeded(store, {
      projectId,
      query,
      bundle: initialBundle,
    });
    await refreshNegativeConstraintSummaryCache(store, projectId);
    const stabilizedBundle = await retrieveGroundedContext(store, projectId, query);

    console.log(JSON.stringify({
      query,
      initial: summarizeBundle(initialBundle),
      stabilized: summarizeBundle(stabilizedBundle),
    }, null, 2));
  }
}

function summarizeBundle(bundle: Awaited<ReturnType<typeof retrieveGroundedContext>>) {
  return {
    recallDecision: bundle.recallDecision,
    retrievalTrace: bundle.retrievalTrace,
    contradictions: bundle.contradictions.map((item) => ({
      key: item.key,
      summaries: item.summaries,
    })),
    missingInformation: bundle.missingInformation,
    recommendedNextActions: bundle.recommendedNextActions,
    semanticNodes: bundle.semanticNodes.slice(0, 8).map((node) => ({
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
    })),
    chunkHits: bundle.chunkHits.slice(0, 5).map((hit) => ({
      chunkId: hit.chunk.id,
      documentId: hit.chunk.documentId,
      score: hit.score,
      textPreview: hit.chunk.text.slice(0, 180),
    })),
  };
}

function parseArgs(args: string[]): { root: string; projectId: string; queries: string[] } {
  let root = DEFAULT_ROOT;
  let projectId = DEFAULT_PROJECT_ID;
  const queries: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--root=')) {
      root = resolve(arg.slice('--root='.length));
      continue;
    }

    if (arg.startsWith('--project-id=')) {
      projectId = arg.slice('--project-id='.length).trim() || DEFAULT_PROJECT_ID;
      continue;
    }

    if (arg.startsWith('--query=')) {
      const value = arg.slice('--query='.length).trim();
      if (value) {
        queries.push(value);
      }
    }
  }

  return {
    root,
    projectId,
    queries: queries.length > 0 ? queries : DEFAULT_QUERIES,
  };
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

    const extension = entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : '';
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      continue;
    }

    results.push(path);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
