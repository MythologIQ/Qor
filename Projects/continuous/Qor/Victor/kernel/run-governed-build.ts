import { runGovernedAutomationBuild } from './governed-build-runner';
import { VictorKernelUnified } from './victor-kernel-unified';
import { createWorkspaceGroundedQuery } from './workspace-grounded-query';

const request = process.argv[2] ? JSON.parse(process.argv[2]) : {};

let groundedQuery: (projectId: string, query: string) => Promise<Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>>;

try {
  const kernel = new VictorKernelUnified();
  await kernel.initialize();
  groundedQuery = async (projectId, query) => kernel.groundedQuery(projectId, query);
} catch (error) {
  if (!request.projectsDir) {
    throw error;
  }
  groundedQuery = await createWorkspaceGroundedQuery(request.projectsDir, request.projectId || 'builder-console');
}

const result = await runGovernedAutomationBuild(
  request,
  groundedQuery,
);

console.log(JSON.stringify(result, null, 2));
