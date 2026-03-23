import type { ContradictionRecord, SemanticNodeRecord } from './types';

export function detectContradictions(nodes: SemanticNodeRecord[]): ContradictionRecord[] {
  const groups = new Map<string, SemanticNodeRecord[]>();

  for (const node of nodes) {
    if (node.state === 'tombstoned') {
      continue;
    }

    addToGroup(groups, `label:${node.nodeType}:${normalize(node.label)}`, node);

    const sourceLabel = node.attributes.sourceLabel?.trim();
    if (sourceLabel) {
      addToGroup(groups, `source-label:${node.nodeType}:${normalize(sourceLabel)}`, node);
    }
  }

  const contradictions = new Map<string, ContradictionRecord>();
  for (const [key, items] of groups.entries()) {
    if (!isConflictGroup(items)) {
      continue;
    }
    if (isAlternativeStrategySet(key, items)) {
      continue;
    }

    const contradiction = buildContradiction(key, items);
    contradictions.set(contradictionIdentity(contradiction), contradiction);
  }

  return [...contradictions.values()];
}

function addToGroup(
  groups: Map<string, SemanticNodeRecord[]>,
  key: string,
  node: SemanticNodeRecord,
): void {
  const existing = groups.get(key) ?? [];
  existing.push(node);
  groups.set(key, existing);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isConflictGroup(items: SemanticNodeRecord[]): boolean {
  if (items.length < 2) {
    return false;
  }

  const uniqueSummaries = new Set(items.map((item) => normalize(item.summary)));
  if (uniqueSummaries.size > 1) {
    return true;
  }

  const uniqueDocuments = new Set(items.map((item) => item.documentId));
  const uniqueSourceLabels = new Set(
    items
      .map((item) => item.attributes.sourceLabel?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return uniqueDocuments.size > 1 && uniqueSourceLabels.size > 1;
}

function buildContradiction(
  key: string,
  items: SemanticNodeRecord[],
): ContradictionRecord {
  return {
    key,
    kind: inferContradictionKind(items),
    nodeIds: items.map((item) => item.id),
    documentIds: [...new Set(items.map((item) => item.documentId))],
    summaries: [...new Set(items.map((item) => item.summary))],
    sourceLabels: [...new Set(
      items
        .map((item) => item.attributes.sourceLabel?.trim())
        .filter((value): value is string => Boolean(value)),
    )],
  };
}

function isAlternativeStrategySet(
  key: string,
  items: SemanticNodeRecord[],
): boolean {
  if (!key.startsWith('source-label:Goal:')) {
    return false;
  }

  const sourceLabels = new Set(
    items
      .map((item) => normalize(item.attributes.sourceLabel ?? ''))
      .filter((value) => value.length > 0),
  );
  if (![...sourceLabels].every((label) => label === 'solution' || label === 'proposed solution')) {
    return false;
  }

  const labels = new Set(items.map((item) => normalize(item.label)));
  if (labels.size < 2) {
    return false;
  }

  const texts = items.flatMap((item) => [item.label, item.summary]);
  if (texts.some((text) => /\b(not|never|cannot|can't|instead|only|must not|reject)\b/i.test(text))) {
    return false;
  }

  return true;
}

function inferContradictionKind(
  items: SemanticNodeRecord[],
): ContradictionRecord['kind'] {
  const texts = items.flatMap((item) => [item.label, item.summary, item.attributes.sourceLabel ?? '']);

  if (texts.some((text) => /\b(supersed(?:e|es|ed|ing)?|replac(?:e|es|ed|ing)?|deprecated|obsolete|retir(?:e|es|ed|ing)?)\b/i.test(text))) {
    return 'supersession';
  }

  if (texts.some((text) => /\b(authority|authoritative|canonical|binding|policy)\b/i.test(text))) {
    return 'authority-split';
  }

  const sourceLabels = new Set(
    items
      .map((item) => item.attributes.sourceLabel?.trim())
      .filter((value): value is string => Boolean(value?.length)),
  );
  if (sourceLabels.size > 0) {
    return 'perspective-shift';
  }

  return 'disagreement';
}

function contradictionIdentity(
  contradiction: ContradictionRecord,
): string {
  return [
    contradiction.kind,
    [...contradiction.nodeIds].sort().join(','),
    [...contradiction.sourceLabels].sort().join(','),
  ].join('|');
}
