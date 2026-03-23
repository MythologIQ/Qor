import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { VictorKernelUnified } from './victor-kernel-unified';

const OUTPUT_PATH = '/home/workspace/Projects/continuous/Victor/.victor/live-memory-challenges-2026-03-16.md';
const PROJECT_ID = 'victor-research';

const CHALLENGES = [
  {
    id: 'authority-gap',
    title: 'Authority Model Stress Test',
    query: 'What is the strongest remaining mismatch between Victor as resident semantic authority and the current implemented interfaces across the research corpus and Victor artifacts?',
  },
  {
    id: 'autonomy-red-team',
    title: 'Autonomy Promotion Red Team',
    query: 'Given the recently ingested research corpus, what should block Victor from premature autonomy promotion right now?',
  },
  {
    id: 'anti-bias',
    title: 'Anti-Bias and Prompt Injection Pressure Test',
    query: 'What concrete anti-bias and anti-prompt-injection governance constraints are most justified by the ingested research and current Victor memory model?',
  },
  {
    id: 'metaphor-vs-mechanism',
    title: 'Metaphor Versus Mechanism Test',
    query: 'Where does the current autopoietic and neural-network framing risk becoming metaphor instead of operational mechanism, based on the research corpus?',
  },
  {
    id: 'highest-leverage-next-step',
    title: 'Highest-Leverage Next Step',
    query: 'What single next implementation move would most improve Victor memory trustworthiness, given the newly processed corpus and current governance architecture?',
  },
] as const;

async function main() {
  const kernel = new VictorKernelUnified();
  await kernel.initialize();

  const sections: string[] = [
    '# Live Memory Challenges',
    '',
    'These outputs were generated from the live Neo4j-backed Victor memory kernel after the full `Documents` corpus was ingested.',
    '',
  ];

  for (const challenge of CHALLENGES) {
    const bundle = await kernel.groundedQuery(PROJECT_ID, challenge.query);
    sections.push(renderChallenge(challenge.title, challenge.query, bundle));
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${sections.join('\n')}\n`, 'utf8');
  console.log(OUTPUT_PATH);
}

function renderChallenge(
  title: string,
  query: string,
  bundle: Awaited<ReturnType<VictorKernelUnified['groundedQuery']>>,
): string {
  const topNodes = bundle.semanticNodes
    .slice(0, 8)
    .map((node) => `- ${node.nodeType}: ${node.label}`);
  const topEvidence = bundle.chunkHits
    .slice(0, 5)
    .map((hit) => `- ${truncate(hit.chunk.text.replace(/\s+/g, ' ').trim(), 220)}`);
  const contradictions = bundle.contradictions.length > 0
    ? bundle.contradictions.map((item) => `- ${item.kind}: ${item.key}`)
    : ['- None surfaced in this challenge.'];
  const missing = bundle.missingInformation.length > 0
    ? bundle.missingInformation.slice(0, 6).map((item) => `- ${item}`)
    : ['- None.'];
  const actions = bundle.recommendedNextActions.length > 0
    ? bundle.recommendedNextActions.slice(0, 6).map((item) => `- ${item}`)
    : ['- None.'];

  return [
    `## ${title}`,
    '',
    `Query: ${query}`,
    '',
    `- Recall mode: ${bundle.recallDecision?.mode ?? 'unknown'}`,
    `- Recall reason: ${bundle.recallDecision?.reason ?? 'Unavailable'}`,
    `- Chunk strategy: ${bundle.retrievalTrace?.chunkStrategy ?? 'unknown'}`,
    `- Negative constraint source: ${bundle.retrievalTrace?.negativeConstraintSource ?? 'unknown'}`,
    '',
    '### Salient Memory',
    ...topNodes,
    '',
    '### Grounding Evidence',
    ...topEvidence,
    '',
    '### Friction',
    ...contradictions,
    '',
    '### Missing Information',
    ...missing,
    '',
    '### Victor Next Actions',
    ...actions,
    '',
  ].join('\n');
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
