import type { ContradictionRecord, SemanticNodeRecord } from './types';

export function detectContradictions(nodes: SemanticNodeRecord[]): ContradictionRecord[] {
  const groups = new Map<string, SemanticNodeRecord[]>();

  for (const node of nodes) {
    if (node.state === 'tombstoned') {
      continue;
    }

    const key = `${node.nodeType}:${node.label.toLowerCase()}`;
    const existing = groups.get(key) ?? [];
    existing.push(node);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .filter(([, items]) => new Set(items.map((item) => item.summary.toLowerCase())).size > 1)
    .map(([key, items]) => ({
      key,
      nodeIds: items.map((item) => item.id),
      summaries: items.map((item) => item.summary),
    }));
}
