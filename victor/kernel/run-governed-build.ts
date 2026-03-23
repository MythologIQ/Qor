import { runGovernedAutomationBuild } from './governed-build-runner';
import { VictorKernelUnified } from './victor-kernel-unified';

const request = process.argv[2] ? JSON.parse(process.argv[2]) : {};

let groundedQuery: (projectId: string, query: string) => Promise<Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>>;

try {
  const kernel = new VictorKernelUnified();
  await kernel.initialize();
  groundedQuery = async (projectId, query) => kernel.groundedQuery(projectId, query);
} catch (error) {
  if (request.allowWorkspaceFallback && request.projectsDir) {
    const { createWorkspaceGroundedQuery } = await import('./workspace-grounded-query');
    groundedQuery = await createWorkspaceGroundedQuery(request.projectsDir, request.projectId || 'victor-resident');
  } else {
    throw new Error(
      `Live Victor memory is required for governed-build automation entrypoints. ${
        error instanceof Error ? error.message : 'Unknown memory initialization failure'
      }`,
    );
  }
}

const result = await runGovernedAutomationBuild(
  request,
  groundedQuery,
);

console.log(JSON.stringify(result, null, 2));
