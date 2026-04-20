import { VictorKernelUnified } from './victor-kernel-unified';
import {
  loadBuilderConsoleArtifacts,
  materializeBuilderConsoleArtifacts,
  resolveBuilderConsoleProjectsDir,
} from './memory/builder-console';

const BUILDER_REPO_ROOT = process.env.BUILDER_CONSOLE_REPO_ROOT
  || '/home/workspace/Projects/continuous/Zo-Qore';
const TARGET_PROJECT_ID = process.env.BUILDER_CONSOLE_TARGET_PROJECT_ID || 'builder-console';

async function main() {
  const projectsDir = process.env.BUILDER_CONSOLE_PROJECTS_DIR
    || await resolveBuilderConsoleProjectsDir(BUILDER_REPO_ROOT);

  if (!projectsDir) {
    throw new Error(`No Builder Console projects directory found under ${BUILDER_REPO_ROOT}`);
  }

  const artifacts = await loadBuilderConsoleArtifacts(projectsDir, TARGET_PROJECT_ID);
  const materialized = await materializeBuilderConsoleArtifacts(artifacts);

  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  for (const artifact of materialized) {
    await kernel.ingestWorkspaceFile(artifact.path, artifact.projectId);
    console.log(`ingested ${artifact.sourceProjectId}:${artifact.sourceKind}`);
  }

  console.log(JSON.stringify({
    projectsDir,
    targetProjectId: TARGET_PROJECT_ID,
    ingestedCount: materialized.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
