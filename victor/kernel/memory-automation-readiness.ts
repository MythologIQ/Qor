import { assessMemoryAutomationReadiness } from './memory/readiness';
import { VictorKernelUnified } from './victor-kernel-unified';

try {
  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  const summary = await assessMemoryAutomationReadiness({
    kernel,
    projectsDir: process.env.BUILDER_CONSOLE_PROJECTS_DIR || '/home/workspace/Projects/continuous/Zo-Qore/.qore/projects',
    documentsRoot: process.env.VICTOR_RESEARCH_DOCUMENTS_ROOT || '/home/workspace/Documents',
    builderProjectId: process.env.BUILDER_CONSOLE_TARGET_PROJECT_ID || 'builder-console',
    researchProjectId: process.env.VICTOR_RESEARCH_PROJECT_ID || 'victor-research',
  });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.overall === 'not-ready') {
    process.exit(1);
  }
} catch (error) {
  console.log(JSON.stringify({
    overall: 'not-ready',
    checkedAt: new Date().toISOString(),
    criteria: [
      {
        id: 'kernel-initialization',
        label: 'Memory kernel initialization',
        status: 'fail',
        detail: error instanceof Error ? error.message : 'Unknown initialization failure',
      },
    ],
    recommendations: [
      'Provide working Neo4j configuration before connecting memory to live Victor automations.',
    ],
  }, null, 2));
  process.exit(1);
}
