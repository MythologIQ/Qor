import {
  getHeartbeatStatus,
  runHeartbeatPreflight,
  startHeartbeat,
  stopHeartbeat,
  tickHeartbeat,
  type HeartbeatContract,
} from './heartbeat';
import { runHeartbeatLoop } from './heartbeat-loop';
import { VictorKernelUnified } from './victor-kernel-unified';

const command = process.argv[2] || 'status';
const request = process.argv[3] ? JSON.parse(process.argv[3]) : {};

async function resolveGroundedQuery(contract: HeartbeatContract) {
  const allowWorkspaceFallback = (request as { allowWorkspaceFallback?: boolean }).allowWorkspaceFallback === true;
  try {
    const kernel = new VictorKernelUnified();
    await kernel.initialize();
    return async (projectId: string, query: string) => kernel.groundedQuery(projectId, query);
  } catch (error) {
    if (allowWorkspaceFallback && contract.projectsDir) {
      const { createWorkspaceGroundedQuery } = await import('./workspace-grounded-query');
      return createWorkspaceGroundedQuery(contract.projectsDir, contract.projectId);
    }
    throw new Error(
      `Live Victor memory is required for heartbeat automation entrypoints. ${
        error instanceof Error ? error.message : 'Unknown memory initialization failure'
      }`,
    );
  }
}

const result = await runCommand(command, request);
console.log(JSON.stringify(result, null, 2));

async function runCommand(name: string, payload: Record<string, unknown>) {
  if (name === 'preflight') {
    return runHeartbeatPreflight(payload, resolveGroundedQuery);
  }
  if (name === 'start') {
    return startHeartbeat(payload, resolveGroundedQuery);
  }
  if (name === 'tick') {
    return tickHeartbeat(payload, resolveGroundedQuery);
  }
  if (name === 'stop') {
    return stopHeartbeat(payload, typeof payload.reason === 'string' ? payload.reason : undefined);
  }
  if (name === 'status') {
    return getHeartbeatStatus(payload);
  }
  if (name === 'loop') {
    return runHeartbeatLoop(payload, resolveGroundedQuery);
  }

  throw new Error(`Unknown heartbeat command: ${name}`);
}
