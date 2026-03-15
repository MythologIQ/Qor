/**
 * Victor Service Server - Zo Native Integration
 * 
 * Exposes Victor kernel via HTTP API for integration with Zo ecosystem.
 * Deterministic processing - no LLM for core functions.
 */

import { Hono, type Context } from 'hono';
import { listAutomationAuditRecords, summarizeAutomationActivity, summarizeBuildProgress } from './automation-audit';
import { runVictorSafeAutomation } from './automation-runner';
import { createGovernedBuilderConsoleDraftTask, updateGovernedBuilderConsoleTaskStatus } from './builder-console-write';
import { runGovernedAutomationBuild } from './governed-build-runner';
import {
  getHeartbeatStatus,
  runHeartbeatPreflight,
  startHeartbeat,
  stopHeartbeat,
  tickHeartbeat,
  type HeartbeatContract,
  type HeartbeatRequest,
} from './heartbeat';
import { victorKernel } from './victor-kernel';
import { VictorKernelUnified } from './victor-kernel-unified';
import { createWorkspaceGroundedQuery } from './workspace-grounded-query';

const app = new Hono();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 9500;
let memoryKernelPromise: Promise<VictorKernelUnified> | null = null;

async function getMemoryKernel(): Promise<VictorKernelUnified> {
  if (!memoryKernelPromise) {
    memoryKernelPromise = (async () => {
      const kernel = new VictorKernelUnified();
      await kernel.initialize();
      return kernel;
    })();
  }

  return memoryKernelPromise;
}

// Health check
app.get('/health', (c) => {
  return c.json({
    service: 'victor-kernel',
    status: 'healthy',
    mode: 'deterministic',
    llm: 'disabled',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/victor/memory/status', async (c) => {
  try {
    await getMemoryKernel();
    return c.json({
      service: 'victor-memory-kernel',
      status: 'ready',
      storage: 'neo4j',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    memoryKernelPromise = null;
    return c.json(
      {
        service: 'victor-memory-kernel',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown initialization failure',
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

app.post('/api/victor/memory/ingest', async (c) => {
  try {
    const request = await c.req.json();
    if (!request.path || !request.projectId) {
      return c.json({ error: 'Invalid request - missing path or projectId' }, 400);
    }

    const kernel = await getMemoryKernel();
    const result = await kernel.ingestWorkspaceFile(request.path, request.projectId);

    return c.json({
      status: 'ok',
      documentId: result.document.id,
      changedChunkIds: result.changedChunkIds,
      addedNodeIds: result.addedNodeIds,
      removedNodeIds: result.removedNodeIds,
      staleCacheIds: result.staleCacheIds,
      ingestionRunId: result.ingestionRun.id,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Ingestion failed',
      },
      500,
    );
  }
});

app.post('/api/victor/memory/query', async (c) => {
  try {
    const request = await c.req.json();
    if (!request.projectId || !request.query) {
      return c.json({ error: 'Invalid request - missing projectId or query' }, 400);
    }

    const kernel = await getMemoryKernel();
    const result = await kernel.groundedQuery(request.projectId, request.query);

    return c.json({
      status: 'ok',
      ...serializeGroundedContext(result),
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Grounded query failed',
      },
      500,
    );
  }
});

app.post('/api/victor/builder-console/tasks/draft', async (c) => {
  try {
    const request = await c.req.json();
    if (!request.projectId || !request.phaseId || !request.title || !request.description || !request.query) {
      return c.json({ error: 'Invalid request - missing projectId, phaseId, title, description, or query' }, 400);
    }

    const kernel = await getMemoryKernel();
    const groundedContext = await kernel.groundedQuery(request.projectId, request.query);
    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectId: request.projectId,
        phaseId: request.phaseId,
        title: request.title,
        description: request.description,
        acceptance: request.acceptance,
        actorId: request.actorId,
        query: request.query,
        projectsDir: request.projectsDir,
      },
      groundedContext,
    );

    const status = result.status === 'created' ? 201 : result.status === 'duplicate' ? 409 : 422;
    return c.json({
      status: result.status,
      groundedContext: serializeGroundedContext(groundedContext),
      result,
    }, status);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Builder Console draft task creation failed',
      },
      500,
    );
  }
});

app.post('/api/victor/builder-console/tasks/status', async (c) => {
  try {
    const request = await c.req.json();
    if (!request.projectId || !request.phaseId || !request.taskId || !request.status || !request.query) {
      return c.json({ error: 'Invalid request - missing projectId, phaseId, taskId, status, or query' }, 400);
    }

    const kernel = await getMemoryKernel();
    const groundedContext = await kernel.groundedQuery(request.projectId, request.query);
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectId: request.projectId,
        phaseId: request.phaseId,
        taskId: request.taskId,
        taskTitle: request.taskTitle,
        status: request.status,
        actorId: request.actorId,
        query: request.query,
        projectsDir: request.projectsDir,
      },
      groundedContext,
    );

    const status = result.status === 'updated' ? 200 : 422;
    return c.json({
      status: result.status,
      groundedContext: serializeGroundedContext(groundedContext),
      result,
    }, status);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Builder Console task status update failed',
      },
      500,
    );
  }
});

app.post('/api/victor/automation/run', async (c) => {
  try {
    const request = await c.req.json();
    if (!Array.isArray(request.actions) || request.actions.length === 0) {
      return c.json({ error: 'Invalid request - actions array is required' }, 400);
    }

    const kernel = await getMemoryKernel();
    const result = await runVictorSafeAutomation(
      {
        actions: request.actions,
        actorId: request.actorId,
        projectsDir: request.projectsDir,
        dryRun: request.dryRun,
        maxActions: request.maxActions,
        stopOnBlock: request.stopOnBlock,
      },
      async (projectId, query) => kernel.groundedQuery(projectId, query),
    );

    const status =
      result.status === 'completed'
        ? result.mode === 'dry-run'
          ? 200
          : 201
        : 422;
    return c.json(result, status);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Victor safe automation run failed',
      },
      500,
    );
  }
});

app.get('/api/victor/automation/audit', async (c) => {
  try {
    const projectId = c.req.query('projectId');
    if (!projectId) {
      return c.json({ error: 'Invalid request - projectId is required' }, 400);
    }

    const limitValue = c.req.query('limit');
    const limit = limitValue ? Number.parseInt(limitValue, 10) : 50;
    const audit = await listAutomationAuditRecords(
      projectId,
      c.req.query('projectsDir') ?? undefined,
      {
        runId: c.req.query('runId') ?? undefined,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      },
    );

    return c.json({
      status: 'ok',
      projectId,
      count: audit.length,
      audit,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Automation audit query failed',
      },
      500,
    );
  }
});

async function handleAutomationActivitySummary(c: Context) {
  try {
    const projectId = c.req.query('projectId');
    if (!projectId) {
      return c.json({ error: 'Invalid request - projectId is required' }, 400);
    }

    const hoursValue = c.req.query('hours');
    const hours = hoursValue ? Number.parseInt(hoursValue, 10) : 12;
    const limitValue = c.req.query('limit');
    const limit = limitValue ? Number.parseInt(limitValue, 10) : 100;
    const since =
      Number.isFinite(hours) && hours > 0
        ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
        : undefined;

    const summary = await summarizeAutomationActivity(
      projectId,
      c.req.query('projectsDir') ?? undefined,
      {
        since,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
      },
    );

    return c.json({
      status: 'ok',
      summary,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Automation activity summary failed',
      },
      500,
    );
  }
}

app.get('/api/victor/automation/activity', handleAutomationActivitySummary);
app.get('/api/victor/automation/review', handleAutomationActivitySummary);

app.get('/api/victor/build/progress', async (c) => {
  try {
    const projectId = c.req.query('projectId');
    if (!projectId) {
      return c.json({ error: 'Invalid request - projectId is required' }, 400);
    }

    const hoursValue = c.req.query('hours');
    const hours = hoursValue ? Number.parseInt(hoursValue, 10) : 24;
    const limitValue = c.req.query('limit');
    const limit = limitValue ? Number.parseInt(limitValue, 10) : 20;
    const since =
      Number.isFinite(hours) && hours > 0
        ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
        : undefined;

    const summary = await summarizeBuildProgress(
      projectId,
      c.req.query('projectsDir') ?? undefined,
      {
        since,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
      },
    );

    return c.json({
      status: 'ok',
      summary,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Build progress summary failed',
      },
      500,
    );
  }
});

app.get('/api/victor/heartbeat/preflight', async (c) => {
  try {
    const result = await runHeartbeatPreflight(parseHeartbeatQueryRequest(c), resolveGroundedQuery);
    return c.json(result, result.ok ? 200 : 422);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Heartbeat preflight failed',
      },
      500,
    );
  }
});

app.get('/api/victor/heartbeat/status', async (c) => {
  try {
    const state = await getHeartbeatStatus(parseHeartbeatQueryRequest(c));
    return c.json({
      status: 'ok',
      state,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Heartbeat status query failed',
      },
      500,
    );
  }
});

app.post('/api/victor/heartbeat/start', async (c) => {
  try {
    const request = await c.req.json().catch(() => ({}));
    const result = await startHeartbeat(request, resolveGroundedQuery);
    return c.json(result, result.status === 'started' ? 201 : 409);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Heartbeat start failed',
      },
      500,
    );
  }
});

app.post('/api/victor/heartbeat/tick', async (c) => {
  try {
    const request = await c.req.json().catch(() => ({}));
    const result = await tickHeartbeat(request, resolveGroundedQuery);
    const status =
      result.status === 'completed'
        ? 200
        : result.status === 'blocked'
          ? 422
          : 500;
    return c.json(result, status);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Heartbeat tick failed',
      },
      500,
    );
  }
});

app.post('/api/victor/heartbeat/stop', async (c) => {
  try {
    const request = await c.req.json().catch(() => ({}));
    const result = await stopHeartbeat(request, typeof request.reason === 'string' ? request.reason : undefined);
    return c.json(result, result.status === 'stopped' ? 200 : 404);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Heartbeat stop failed',
      },
      500,
    );
  }
});

app.post('/api/victor/automation/governed-build', async (c) => {
  try {
    const request = await c.req.json().catch(() => ({}));
    const groundedQuery = await resolveGroundedQuery({
      projectId: request.projectId,
      projectsDir: request.projectsDir,
      dryRun: request.dryRun,
      actorId: request.actorId,
    });
    const result = await runGovernedAutomationBuild(
      {
        projectId: request.projectId,
        projectsDir: request.projectsDir,
        dryRun: request.dryRun,
        actorId: request.actorId,
        maxActions: request.maxActions,
      },
      groundedQuery,
    );

    const status =
      result.status === 'completed'
        ? result.mode === 'dry-run'
          ? 200
          : 201
        : 422;
    return c.json(result, status);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Victor governed build run failed',
      },
      500,
    );
  }
});

async function resolveGroundedQuery(request: HeartbeatRequest | { projectId?: string; projectsDir?: string; dryRun?: boolean; actorId?: string }) {
  try {
    const kernel = await getMemoryKernel();
    return async (projectId: string, query: string) => kernel.groundedQuery(projectId, query);
  } catch (error) {
    if (!request.projectsDir) {
      throw error;
    }
    return createWorkspaceGroundedQuery(request.projectsDir, request.projectId || 'builder-console');
  }
}

function parseHeartbeatQueryRequest(c: Context): HeartbeatRequest {
  const parseIntValue = (value: string | undefined) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const parseBoolValue = (value: string | undefined) => {
    if (!value) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  };

  return {
    projectId: c.req.query('projectId') ?? undefined,
    projectsDir: c.req.query('projectsDir') ?? undefined,
    actorId: c.req.query('actorId') ?? undefined,
    dryRun: parseBoolValue(c.req.query('dryRun')),
    cadenceMs: parseIntValue(c.req.query('cadenceMs')),
    staleAfterMs: parseIntValue(c.req.query('staleAfterMs')),
    maxActionsPerTick: parseIntValue(c.req.query('maxActionsPerTick')),
    stopOnBlock: parseBoolValue(c.req.query('stopOnBlock')),
    maxConsecutiveBlocked: parseIntValue(c.req.query('maxConsecutiveBlocked')),
    maxConsecutiveFailures: parseIntValue(c.req.query('maxConsecutiveFailures')),
    stateDir: c.req.query('stateDir') ?? undefined,
  };
}

function serializeGroundedContext(result: Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>) {
  return {
    ...result,
    chunkHits: result.chunkHits.map((hit) => ({
      ...hit,
      chunk: {
        ...hit.chunk,
        embedding: undefined,
      },
    })),
  };
}

// Victor API endpoints
app.post('/api/victor/process', async (c) => {
  try {
    const request = await c.req.json();
    
    // Validate request structure
    if (!request.id || !request.userId || !request.action) {
      return c.json({ error: 'Invalid request - missing required fields' }, 400);
    }
    
    // Process through Victor kernel
    const result = await victorKernel.process(request);
    
    return c.json(result, result.allowed ? 200 : 403);
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, 500);
  }
});

// Task management endpoints (deterministic)
app.post('/api/tasks', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'anonymous',
    action: 'task.create',
    params: await c.req.json(),
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

app.get('/api/tasks', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'anonymous',
    action: 'task.list',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

// Governance endpoints
app.get('/api/victor/mode', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'system',
    action: 'victor.mode',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

app.post('/api/victor/stance', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'system',
    action: 'victor.stance',
    params: await c.req.json(),
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

// Audit log
app.get('/api/audit', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'system',
    action: 'audit.log',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

// Start server
console.log('Victor Kernel Service starting...');
console.log(`Port: ${PORT}`);
console.log('Mode: Deterministic (no LLM)');

Bun.serve({
  fetch: app.fetch,
  port: PORT
});
