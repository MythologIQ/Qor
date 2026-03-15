import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { loadBuilderConsoleArtifacts, resolveBuilderConsoleProjectsDir } from './builder-console';

describe('builder console adapter', () => {
  it('renders governed planning artifacts into Victor-ingestible documents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'victor-builder-fixture-'));
    const projectsDir = join(root, '.qore', 'projects');
    const projectDir = join(projectsDir, 'proj_demo');

    await mkdir(join(projectDir, 'void'), { recursive: true });
    await mkdir(join(projectDir, 'reveal'), { recursive: true });
    await mkdir(join(projectDir, 'constellation'), { recursive: true });
    await mkdir(join(projectDir, 'path'), { recursive: true });

    await writeFile(
      join(projectDir, 'project.json'),
      JSON.stringify({
        projectId: 'proj_demo',
        name: 'Demo Planning Project',
        description: 'Fragmented ideas becoming phases',
        createdBy: 'frostwulf',
        pipelineState: {
          void: 'active',
          reveal: 'active',
          constellation: 'active',
          path: 'active',
        },
      }),
    );

    await writeFile(
      join(projectDir, 'void', 'thoughts.jsonl'),
      [
        JSON.stringify({
          thoughtId: 'thought-1',
          projectId: 'proj_demo',
          content: 'Victor should turn fragments into plans.',
          source: 'text',
          capturedAt: '2026-03-15T00:00:00.000Z',
          capturedBy: 'frostwulf',
          tags: ['planning'],
          status: 'raw',
        }),
      ].join('\n'),
    );

    await writeFile(
      join(projectDir, 'reveal', 'clusters.json'),
      JSON.stringify({
        clusters: [
          {
            clusterId: 'cluster-1',
            projectId: 'proj_demo',
            label: 'Actionable Concepts',
            thoughtIds: ['thought-1'],
            notes: 'Transform fragments into governed plan objects.',
            createdAt: '2026-03-15T00:00:00.000Z',
            updatedAt: '2026-03-15T00:00:00.000Z',
            status: 'formed',
          },
        ],
      }),
    );

    await writeFile(
      join(projectDir, 'constellation', 'map.json'),
      JSON.stringify({
        constellationId: 'const-1',
        projectId: 'proj_demo',
        nodes: [{ nodeId: 'node-1', clusterId: 'cluster-1', position: { x: 0, y: 0 } }],
        edges: [],
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
        status: 'mapped',
      }),
    );

    await writeFile(
      join(projectDir, 'path', 'phases.json'),
      JSON.stringify({
        phases: [
          {
            phaseId: 'phase-1',
            projectId: 'proj_demo',
            ordinal: 1,
            name: 'Normalize Ideas',
            objective: 'Turn fragments into actionable concepts.',
            sourceClusterIds: ['cluster-1'],
            tasks: [
              {
                taskId: 'task-1',
                phaseId: 'phase-1',
                title: 'Extract candidate concepts',
                description: 'Convert clustered thoughts into plan-ready concepts.',
                acceptance: ['Concepts retain provenance'],
                status: 'pending',
              },
            ],
            status: 'planned',
            createdAt: '2026-03-15T00:00:00.000Z',
            updatedAt: '2026-03-15T00:00:00.000Z',
          },
        ],
      }),
    );

    await writeFile(
      join(projectDir, 'ledger.jsonl'),
      [
        JSON.stringify({
          projectId: 'proj_demo',
          view: 'path',
          action: 'update',
          artifactId: 'phase-1',
          actorId: 'frostwulf',
          payload: { status: 'planned' },
          timestamp: '2026-03-15T00:10:00.000Z',
        }),
      ].join('\n'),
    );

    await mkdir(join(projectDir, 'history'), { recursive: true });
    await writeFile(
      join(projectDir, 'history', '2026-03-15T00-05-00-000Z_led_demo.jsonl'),
      [
        JSON.stringify({
          projectId: 'proj_demo',
          view: 'void',
          action: 'create',
          artifactId: 'proj_demo',
          actorId: 'frostwulf',
          payload: { name: 'Demo Planning Project' },
          timestamp: '2026-03-15T00:05:00.000Z',
        }),
      ].join('\n'),
    );

    const artifacts = await loadBuilderConsoleArtifacts(projectsDir);

    expect(artifacts).toHaveLength(7);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'project')).toBe(true);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'void')).toBe(true);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'reveal')).toBe(true);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'constellation')).toBe(true);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'path')).toBe(true);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'ledger')).toBe(true);
    expect(artifacts.some((artifact) => artifact.sourceKind === 'history')).toBe(true);
    expect(artifacts.find((artifact) => artifact.sourceKind === 'project')?.content).toContain(
      'Builder Console governance is binding on Victor',
    );
    expect(artifacts.find((artifact) => artifact.sourceKind === 'path')?.content).toContain(
      'Extract candidate concepts',
    );
  });

  it('resolves the latest fallback backup projects directory when direct data is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'victor-builder-backup-'));
    const direct = join(root, '.qore', 'projects');
    const backupProjects = join(root, '.failsafe', 'backups', '20260315-010101Z', 'files', '.qore', 'projects');

    await mkdir(backupProjects, { recursive: true });
    await mkdir(join(backupProjects, 'proj_demo', 'path'), { recursive: true });
    await writeFile(join(backupProjects, 'proj_demo', 'project.json'), JSON.stringify({ projectId: 'proj_demo', name: 'Backup Project' }));
    await writeFile(join(backupProjects, 'proj_demo', 'path', 'phases.json'), JSON.stringify({ phases: [{ phaseId: 'phase-1', projectId: 'proj_demo', ordinal: 1, name: 'Backup', objective: 'Richer', sourceClusterIds: [], tasks: [], status: 'planned', createdAt: '2026-03-15T00:00:00.000Z', updatedAt: '2026-03-15T00:00:00.000Z' }] }));

    expect(await resolveBuilderConsoleProjectsDir(root)).toBe(backupProjects);
    expect(await resolveBuilderConsoleProjectsDir(join(root, 'missing'))).toBeNull();

    await mkdir(direct, { recursive: true });
    await mkdir(join(direct, 'proj_demo'), { recursive: true });
    await writeFile(join(direct, 'proj_demo', 'project.json'), JSON.stringify({ projectId: 'proj_demo', name: 'Direct Project' }));
    expect(await resolveBuilderConsoleProjectsDir(root)).toBe(backupProjects);
  });
});
