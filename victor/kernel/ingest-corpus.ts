import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { VictorKernelUnified } from './victor-kernel-unified';

const DEFAULT_ROOT = '/home/workspace/Documents';
const DEFAULT_PROJECT_ID = 'victor-research';
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
  const { root, projectId } = parseArgs(Bun.argv.slice(2));
  const files = await collectFiles(root);
  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  const ingested: string[] = [];

  for (const path of files) {
    await kernel.ingestWorkspaceFile(path, projectId);
    ingested.push(path);
    console.log(`ingested ${relative(root, path)}`);
  }

  console.log(JSON.stringify({
    projectId,
    root,
    ingestedCount: ingested.length,
    ingested: ingested.map((path) => relative(root, path)),
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
      continue;
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
