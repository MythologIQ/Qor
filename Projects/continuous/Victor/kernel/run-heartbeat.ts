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
import { createWorkspaceGroundedQuery } from './workspace-grounded-query';

const command = process.argv[2] || 'status';
const request = process.argv[3] ? JSON.parse(process.argv[3]) : {};

async function resolveGroundedQuery(contract: HeartbeatContract) {
  try {
    const kernel = new VictorKernelUnified();
    await kernel.initialize();
    return async (projectId: string, query: string) => kernel.groundedQuery(projectId, query);
  } catch (error) {
    if (!contract.projectsDir) {
      throw error;
    }
    return createWorkspaceGroundedQuery(contract.projectsDir, contract.projectId);
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
