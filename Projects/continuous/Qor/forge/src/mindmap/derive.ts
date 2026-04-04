export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  status: "seed" | "sprouting" | "growing" | "mature" | "dormant";
  children: ConceptNode[];
  metadata: {
    phases?: string[];
    tasks?: { total: number; done: number };
    risks?: string[];
    evidence?: number;
  };
}

export interface ConceptEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

const ROOT_CONCEPTS = ["Qor", "Victor", "Forge", "Qora", "EvolveAI"];

function slugify(label: string): string {
  return label.replace(/\s+/g, "-").toLowerCase();
}

function taskRatioToStatus(ratio: number): ConceptNode["status"] {
  if (ratio >= 1) return "mature";
  if (ratio > 0.5) return "growing";
  if (ratio > 0) return "sprouting";
  return "seed";
}

function buildConceptMap(phases: any[]) {
  const map = new Map<string, {
    label: string;
    description: string;
    phases: string[];
    tasks: { total: number; done: number };
  }>();

  for (const phase of phases) {
    const name: string = phase.name || phase.phase || "Unknown";
    const parts = name.split(/ [–\-] /).map((s: string) => s.trim()).filter(Boolean);
    const conceptLabel = parts.length > 1 ? parts[0] : name;
    const phaseLabel = parts.length > 1 ? parts.slice(1).join(" – ") : name;

    if (!map.has(conceptLabel)) {
      map.set(conceptLabel, {
        label: conceptLabel,
        description: name,
        phases: [],
        tasks: { total: 0, done: 0 },
      });
    }
    const entry = map.get(conceptLabel)!;
    entry.phases.push(phaseLabel);

    const tasks = phase.tasks || [];
    const done = tasks.filter((t: any) => t.status === "done").length;
    entry.tasks.total += tasks.length;
    entry.tasks.done += done;
  }

  return map;
}

function matchesToRoot(label: string, data: { phases: string[] }, root: string): boolean {
  return (
    label.startsWith(root) ||
    data.phases.some((p) => p.toLowerCase().includes(root.toLowerCase()))
  );
}

export function deriveConceptNodes(phases: any[]): {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
} {
  const conceptMap = buildConceptMap(phases);
  const nodes: ConceptNode[] = [];
  const edges: ConceptEdge[] = [];
  const claimed = new Set<string>();

  for (const rc of ROOT_CONCEPTS) {
    const children: ConceptNode[] = [];

    for (const [label, data] of conceptMap) {
      if (!matchesToRoot(label, data, rc)) continue;
      claimed.add(label);
      const ratio = data.tasks.total > 0 ? data.tasks.done / data.tasks.total : 0;
      children.push({
        id: `concept-${slugify(label)}`,
        label: data.label,
        description: data.description,
        status: taskRatioToStatus(ratio),
        children: [],
        metadata: { phases: data.phases, tasks: data.tasks },
      });
    }

    const childDone = children.reduce((s, c) => s + (c.metadata.tasks?.done || 0), 0);
    const childTotal = children.reduce((s, c) => s + (c.metadata.tasks?.total || 0), 0);
    const rootRatio = childTotal > 0 ? childDone / childTotal : 0;

    nodes.push({
      id: `concept-${rc.toLowerCase()}`,
      label: rc,
      description: `${rc} module`,
      status: taskRatioToStatus(rootRatio),
      children,
      metadata: {
        phases: children.flatMap((c) => c.metadata.phases || []),
        tasks: { total: childTotal, done: childDone },
      },
    });

    for (const child of children) {
      edges.push({
        id: `edge-${rc.toLowerCase()}-${child.id}`,
        source: `concept-${rc.toLowerCase()}`,
        target: child.id,
        label: "contains",
      });
    }
  }

  const unattached = [...conceptMap.keys()].filter((l) => !claimed.has(l));
  if (unattached.length > 0) {
    const otherChildren: ConceptNode[] = unattached.map((label) => {
      const data = conceptMap.get(label)!;
      const ratio = data.tasks.total > 0 ? data.tasks.done / data.tasks.total : 0;
      return {
        id: `concept-${slugify(label)}`,
        label: data.label,
        description: data.description,
        status: taskRatioToStatus(ratio),
        children: [],
        metadata: { phases: data.phases, tasks: data.tasks },
      };
    });

    nodes.push({
      id: "concept-other",
      label: "Other",
      description: "Uncategorized concepts",
      status: "seed" as const,
      children: otherChildren,
      metadata: {
        tasks: {
          total: otherChildren.reduce((s, c) => s + (c.metadata.tasks?.total || 0), 0),
          done: otherChildren.reduce((s, c) => s + (c.metadata.tasks?.done || 0), 0),
        },
      },
    });

    for (const child of otherChildren) {
      edges.push({
        id: `edge-other-${child.id}`,
        source: "concept-other",
        target: child.id,
        label: "contains",
      });
    }
  }

  return { nodes, edges };
}
