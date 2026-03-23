import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { VictorKernelUnified } from './victor-kernel-unified';

const ROOT = '/home/workspace/Projects/continuous/Victor';
const PROJECT_ID = 'victor';
const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.py',
  '.cypher',
  '.txt',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'assets', 'tts-data', '__pycache__', '.runtime', '.victor']);

async function main() {
  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  const files = await collectFiles(ROOT);
  const ingested: string[] = [];

  for (const path of files) {
    await kernel.ingestWorkspaceFile(path, PROJECT_ID);
    ingested.push(relative(ROOT, path));
    console.log(`ingested ${relative(ROOT, path)}`);
  }

  console.log(JSON.stringify({ projectId: PROJECT_ID, root: ROOT, ingestedCount: ingested.length }, null, 2));
  process.exit(0);
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
  console.error(error);
  process.exit(1);
});
