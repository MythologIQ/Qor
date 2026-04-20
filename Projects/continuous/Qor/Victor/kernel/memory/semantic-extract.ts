import type { SemanticEdgeRecord, SemanticNodeRecord, SourceChunkRecord } from './types';
import { hashContent } from './provenance';

interface ExtractionResult {
  nodes: SemanticNodeRecord[];
  edges: SemanticEdgeRecord[];
}

export function extractSemanticGraph(chunks: SourceChunkRecord[]): ExtractionResult {
  const nodes: SemanticNodeRecord[] = [];
  const edges: SemanticEdgeRecord[] = [];

  for (const chunk of chunks) {
    const lines = chunk.text.split('\n');
    const localNodes: SemanticNodeRecord[] = [];
    let moduleNodeId: string | null = null;
    let moduleLabel: string | null = null;

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const heading = line.match(/^#{1,3}\s+(.+)$/);
      if (heading) {
        const label = heading[1].trim();
        const node = createNode(chunk, 'Module', label, label, {});
        moduleNodeId = node.id;
        moduleLabel = label;
        localNodes.push(node);
        continue;
      }

      const taskMatch = line.match(/^[-*]\s+\[( |x)\]\s+(.+)$/i);
      if (taskMatch) {
        const done = taskMatch[1].toLowerCase() === 'x';
        const body = taskMatch[2].trim();
        const dependencyMatch = body.match(/\bdepends on\b\s+(.+)$/i);
        const taskLabel = dependencyMatch ? body.slice(0, dependencyMatch.index).trim() : body;
        const taskAttributes: Record<string, string> = {
          status: done ? 'done' : 'pending',
        };
        const taskSummaryParts = [body];
        const relatedNodeSpecs: Array<{
          nodeType: SemanticNodeRecord['nodeType'];
          label: string;
          edgeType: SemanticEdgeRecord['edgeType'];
        }> = [];

        let lookahead = index + 1;
        while (lookahead < lines.length) {
          const metadataLine = lines[lookahead];
          const metadataMatch = metadataLine.match(/^\s{2,}-\s+(Description|Acceptance|Owner|Depends On|Blocks|Status):\s+(.+)$/i);
          if (!metadataMatch) {
            break;
          }

          const field = metadataMatch[1].toLowerCase();
          const value = metadataMatch[2].trim();
          taskSummaryParts.push(`${metadataMatch[1]}: ${value}`);

          if (field === 'status') {
            taskAttributes.status = value.toLowerCase();
          } else if (field === 'description') {
            taskAttributes.description = value;
          } else if (field === 'acceptance') {
            relatedNodeSpecs.push({ nodeType: 'Goal', label: value, edgeType: 'supports' });
          } else if (field === 'owner') {
            taskAttributes.owner = value;
            relatedNodeSpecs.push({ nodeType: 'Actor', label: value, edgeType: 'owned-by' });
          } else if (field === 'depends on') {
            relatedNodeSpecs.push({ nodeType: 'Dependency', label: value, edgeType: 'depends-on' });
          } else if (field === 'blocks') {
            relatedNodeSpecs.push({ nodeType: 'Dependency', label: value, edgeType: 'blocks' });
          }

          lookahead += 1;
        }

        const taskNode = createNode(chunk, 'Task', taskLabel, taskSummaryParts.join('. '), taskAttributes);
        localNodes.push(taskNode);

        if (moduleNodeId) {
          edges.push(createEdge(chunk, taskNode.id, moduleNodeId, 'relates-to'));
        }

        if (dependencyMatch) {
          const dependencyLabel = dependencyMatch[1].trim();
          const dependencyNode = createNode(chunk, 'Dependency', dependencyLabel, dependencyLabel, {});
          localNodes.push(dependencyNode);
          edges.push(createEdge(chunk, taskNode.id, dependencyNode.id, 'depends-on'));
        }

        for (const spec of relatedNodeSpecs) {
          const relatedNode = createNode(chunk, spec.nodeType, spec.label, spec.label, {});
          localNodes.push(relatedNode);
          edges.push(createEdge(chunk, taskNode.id, relatedNode.id, spec.edgeType));
        }

        index = lookahead - 1;

        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        const body = bulletMatch[1].trim().replace(/\.$/, '');
        const nodeType = classifyBulletNodeType(moduleLabel, body);
        if (nodeType) {
          const node = createNode(chunk, nodeType, body, body, {});
          localNodes.push(node);
          if (moduleNodeId) {
            edges.push(createEdge(chunk, node.id, moduleNodeId, nodeType === 'Goal' ? 'supports' : 'derived-from'));
          }
        }
        continue;
      }

      const decisionMatch = line.match(/^decision:\s+(.+)$/i);
      if (decisionMatch) {
        const label = decisionMatch[1].trim();
        const node = createNode(chunk, 'Decision', label, label, {});
        localNodes.push(node);
        if (moduleNodeId) {
          edges.push(createEdge(chunk, node.id, moduleNodeId, 'derived-from'));
        }
        continue;
      }

      const constraintMatch = line.match(/^constraint:\s+(.+)$/i);
      if (constraintMatch) {
        const label = constraintMatch[1].trim();
        const node = createNode(chunk, 'Constraint', label, label, {});
        localNodes.push(node);
        continue;
      }

      const goalMatch = line.match(/^goal:\s+(.+)$/i);
      if (goalMatch) {
        const label = goalMatch[1].trim();
        localNodes.push(createNode(chunk, 'Goal', label, label, {}));
        continue;
      }

      const actorMatch = line.match(/^owner:\s+(.+)$/i);
      if (actorMatch) {
        localNodes.push(createNode(chunk, 'Actor', actorMatch[1].trim(), actorMatch[1].trim(), {}));
        continue;
      }

      const declarativeDecision = classifyDeclarativeDecision(line);
      if (declarativeDecision) {
        const node = createNode(chunk, 'Decision', declarativeDecision, declarativeDecision, {});
        localNodes.push(node);
        if (moduleNodeId) {
          edges.push(createEdge(chunk, node.id, moduleNodeId, 'derived-from'));
        }
      }
    }

    nodes.push(...dedupeById(localNodes));
  }

  return {
    nodes: dedupeById(nodes),
    edges: dedupeById(edges),
  };
}

function createNode(
  chunk: SourceChunkRecord,
  nodeType: SemanticNodeRecord['nodeType'],
  label: string,
  summary: string,
  attributes: Record<string, string>,
): SemanticNodeRecord {
  return {
    id: hashContent(chunk.id, nodeType, label.toLowerCase()),
    documentId: chunk.documentId,
    sourceChunkId: chunk.id,
    nodeType,
    label,
    summary,
    fingerprint: hashContent(chunk.id, nodeType, label, summary),
    span: chunk.span,
    attributes,
    state: 'active',
  };
}

function createEdge(
  chunk: SourceChunkRecord,
  fromNodeId: string,
  toNodeId: string,
  edgeType: SemanticEdgeRecord['edgeType'],
): SemanticEdgeRecord {
  return {
    id: hashContent(chunk.id, fromNodeId, toNodeId, edgeType),
    documentId: chunk.documentId,
    sourceChunkId: chunk.id,
    fromNodeId,
    toNodeId,
    edgeType,
    fingerprint: hashContent(chunk.id, fromNodeId, toNodeId, edgeType),
    attributes: {},
    state: 'active',
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return [...seen.values()];
}

function classifyBulletNodeType(
  moduleLabel: string | null,
  body: string,
): SemanticNodeRecord['nodeType'] | null {
  const normalizedModule = moduleLabel?.toLowerCase() ?? '';
  if (normalizedModule.includes('goal')) {
    return 'Goal';
  }
  if (normalizedModule.includes('non-goal') || normalizedModule.includes('trust bound') || normalizedModule.includes('failure mode')) {
    return 'Constraint';
  }

  if (/^(keep|prefer|separate|avoid|defer|refuse)\b/i.test(body)) {
    return 'Constraint';
  }
  if (/^(make|build|use|optimize|provide|attach|expose|highlight|draft|classify|retrieve|expand|merge|produce|store|preserve|maintain|watch|normalize|fingerprint|chunk|generate|extract|tombstone|check)\b/i.test(body)) {
    return 'Goal';
  }

  return null;
}

function classifyDeclarativeDecision(line: string): string | null {
  const normalized = line.trim();
  if (!normalized.endsWith('.')) {
    return null;
  }
  if (normalized.length < 20 || normalized.length > 220) {
    return null;
  }
  if (/^(the )?(system|architecture|model|design|layer|interface|cache|retrieval|victor|builder console|zo-qore)\b/i.test(normalized)
    && /\b(is|are|remains?|form|should be|must be)\b/i.test(normalized)) {
    return normalized.slice(0, -1);
  }
  return null;
}
