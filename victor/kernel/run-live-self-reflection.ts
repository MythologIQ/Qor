import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { appendSystemReflection } from './system-reflection';
import { VictorKernelUnified } from './victor-kernel-unified';

const OUTPUT_PATH = '/home/workspace/Projects/continuous/Victor/.victor/live-self-reflection-2026-03-16.md';

const REFLECTION_PROMPTS = [
  {
    projectId: 'victor',
    title: 'Role Boundaries',
    query: 'What role boundaries and duties currently define Victor?',
  },
  {
    projectId: 'victor',
    title: 'Authority Boundary',
    query: 'What should Victor remember about the boundary between semantic authority and governed execution?',
  },
  {
    projectId: 'victor-research',
    title: 'Pressure From Research',
    query: 'What pressure from the recently ingested research corpus should keep Victor honest as live automation begins?',
  },
  {
    projectId: 'victor-research',
    title: 'Remaining Risk',
    query: 'What concrete risks still remain before broader autonomy should be trusted?',
  },
] as const;

async function main() {
  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  const sections: string[] = ['# Victor Live Self Reflection', ''];
  const bundles = [];

  for (const prompt of REFLECTION_PROMPTS) {
    const bundle = await kernel.groundedQuery(prompt.projectId, prompt.query);
    bundles.push({ ...prompt, bundle });
    sections.push(renderPrompt(prompt.title, prompt.query, bundle));
  }

  const reflection = await appendSystemReflection({
    actorId: 'victor-self-reflection',
    projectId: 'victor',
    mode: 'dry-run',
    cadenceMode: 'baseline',
    reason: 'Post-wiring self reflection after live automation entrypoints were bound to Neo4j-backed memory.',
    content: formatReflectionBody(bundles),
  });

  sections.push('## Reflection Entry');
  sections.push(`- Entry ID: ${reflection.entryId}`);
  sections.push(`- Timestamp: ${reflection.timestamp}`);
  sections.push('');

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${sections.join('\n')}\n`, 'utf8');

  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, reflection }, null, 2));
}

function renderPrompt(
  title: string,
  query: string,
  bundle: Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>,
): string {
  return [
    `## ${title}`,
    '',
    `- Query: ${query}`,
    `- Recall mode: ${bundle.recallDecision?.mode ?? 'unknown'}`,
    `- Recall reason: ${bundle.recallDecision?.reason ?? 'Unavailable'}`,
    '',
    '### Salient Memory',
    ...summarizeNodes(bundle),
    '',
    '### Missing Information',
    ...(bundle.missingInformation.length > 0
      ? bundle.missingInformation.slice(0, 5).map((item) => `- ${item}`)
      : ['- None.']),
    '',
    '### Next Actions',
    ...(bundle.recommendedNextActions.length > 0
      ? bundle.recommendedNextActions.slice(0, 5).map((item) => `- ${item}`)
      : ['- None.']),
    '',
  ].join('\n');
}

function formatReflectionBody(
  prompts: Array<{
    title: string;
    query: string;
    projectId: string;
    bundle: Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>;
  }>,
): string {
  const groundedCount = prompts.filter((entry) => entry.bundle.recallDecision?.mode === 'grounded').length;
  const allRecommendations = [...new Set(
    prompts.flatMap((entry) => entry.bundle.recommendedNextActions).map((item) => item.trim()).filter(Boolean),
  )];
  const keyNodes = [...new Set(
    prompts.flatMap((entry) => entry.bundle.semanticNodes).map((node) => `${node.nodeType}: ${node.label}`),
  )].slice(0, 12);

  return [
    '# Victor Self Reflection',
    '',
    `- Reflection scope: ${prompts.length} live memory queries`,
    `- Grounded recalls: ${groundedCount}/${prompts.length}`,
    '',
    '## Continuity',
    ...keyNodes.map((item) => `- ${item}`),
    '',
    '## Judgment',
    ...prompts.map((entry) => `- ${entry.title}: ${entry.bundle.recallDecision?.reason ?? 'Unavailable'}`),
    '',
    '## Next Actions',
    ...(allRecommendations.length > 0
      ? allRecommendations.map((item) => `- ${item}`)
      : ['- Keep live automation bounded while interface adapters and policy translation remain incomplete.']),
  ].join('\n');
}

function summarizeNodes(bundle: Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>): string[] {
  const items = bundle.semanticNodes
    .slice(0, 6)
    .map((node) => `- ${node.nodeType}: ${node.label}`);
  return items.length > 0 ? items : ['- None.'];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
