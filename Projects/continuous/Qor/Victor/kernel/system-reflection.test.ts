import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { appendSystemReflection, listSystemReflections } from './system-reflection';

describe('system reflection log', () => {
  let reflectionDir: string;

  beforeEach(async () => {
    reflectionDir = await mkdtemp(join(tmpdir(), 'victor-reflections-'));
  });

  afterEach(async () => {
    await rm(reflectionDir, { recursive: true, force: true });
  });

  it('appends and lists system reflections in reverse chronological order', async () => {
    const first = await appendSystemReflection({
      reflectionDir,
      actorId: 'victor-heartbeat',
      projectId: 'builder-console',
      runId: 'run-1',
      taskId: 'task-1',
      taskTitle: 'Separate non-project reflection from Builder artifacts',
      mode: 'dry-run',
      cadenceMode: 'cooldown',
      reason: 'Cooldown reflection remained read-only.',
      content: '## Victor Cooldown Reflection\n- Result: read-only review.',
    });
    const second = await appendSystemReflection({
      reflectionDir,
      actorId: 'victor-heartbeat',
      projectId: 'builder-console',
      runId: 'run-2',
      taskId: 'task-2',
      taskTitle: 'Teach heartbeat to select the next governed slice after phase closure',
      mode: 'execute',
      cadenceMode: 'cooldown',
      reason: 'Cooldown reflection captured next transition risks.',
      content: '## Victor Cooldown Reflection\n- Result: transition review.',
    });

    const reflections = await listSystemReflections(reflectionDir);

    expect(reflections).toHaveLength(2);
    expect(reflections[0]?.entryId).toBe(second.entryId);
    expect(reflections[1]?.entryId).toBe(first.entryId);
    expect(reflections[0]?.source).toBe('victor-heartbeat');
    expect(reflections[0]?.category).toBe('cooldown-reflection');
  });
});
