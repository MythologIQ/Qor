import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_REFLECTION_DIR = '/home/workspace/Projects/continuous/Victor/.victor';
const REFLECTION_FILE_NAME = 'system-reflections.jsonl';

export interface SystemReflectionEntry {
  entryId: string;
  timestamp: string;
  actorId: string;
  source: 'victor-heartbeat';
  category: 'cooldown-reflection';
  projectId?: string;
  runId?: string;
  taskId?: string;
  taskTitle?: string;
  mode: 'dry-run' | 'execute';
  cadenceMode: 'baseline' | 'elevated' | 'cooldown';
  reason: string;
  content: string;
}

export interface AppendSystemReflectionRequest {
  reflectionDir?: string;
  actorId: string;
  projectId?: string;
  runId?: string;
  taskId?: string;
  taskTitle?: string;
  mode: 'dry-run' | 'execute';
  cadenceMode: 'baseline' | 'elevated' | 'cooldown';
  reason: string;
  content: string;
}

export async function appendSystemReflection(
  request: AppendSystemReflectionRequest,
): Promise<SystemReflectionEntry> {
  const reflectionDir = resolveReflectionDir(request.reflectionDir);
  await mkdir(reflectionDir, { recursive: true });

  const entry: SystemReflectionEntry = {
    entryId: `reflection_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    actorId: request.actorId,
    source: 'victor-heartbeat',
    category: 'cooldown-reflection',
    projectId: request.projectId,
    runId: request.runId,
    taskId: request.taskId,
    taskTitle: request.taskTitle,
    mode: request.mode,
    cadenceMode: request.cadenceMode,
    reason: request.reason,
    content: request.content,
  };

  const file = resolveReflectionFile(reflectionDir);
  await appendJsonLine(file, entry);
  return entry;
}

export async function listSystemReflections(
  reflectionDir?: string,
  options: { limit?: number } = {},
): Promise<SystemReflectionEntry[]> {
  const file = resolveReflectionFile(resolveReflectionDir(reflectionDir));
  if (!existsSync(file)) {
    return [];
  }

  const raw = await readFile(file, 'utf8');
  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SystemReflectionEntry);

  const limit = options.limit && options.limit > 0 ? options.limit : entries.length;
  return entries.slice(-limit).reverse();
}

export function resolveReflectionDir(reflectionDir?: string): string {
  return reflectionDir?.trim() || process.env.VICTOR_REFLECTION_DIR?.trim() || DEFAULT_REFLECTION_DIR;
}

function resolveReflectionFile(reflectionDir: string): string {
  return join(reflectionDir, REFLECTION_FILE_NAME);
}

async function appendJsonLine(file: string, entry: SystemReflectionEntry) {
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  const next = `${existing}${JSON.stringify(entry)}\n`;
  await writeFile(file, next, 'utf8');
}
