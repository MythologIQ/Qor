import { describe, it, expect } from "bun:test";
import { deriveConceptNodes } from "../src/mindmap/derive";
import type { ConceptNode, ConceptEdge } from "../src/mindmap/derive";

const MOCK_PHASES = [
  {
    name: "Forge Source of Truth Realignment",
    status: "active",
    tasks: [
      { status: "done" },
      { status: "done" },
      { status: "pending" },
    ],
  },
  {
    name: "Victor Lifecycle and Forecast Foundation",
    status: "complete",
    tasks: [{ status: "done" }, { status: "done" }],
  },
  {
    name: "Qora – Moltbook Quarantine Pipeline",
    status: "complete",
    tasks: [{ status: "done" }],
  },
  {
    name: "Memory Governance Core Hardening",
    status: "complete",
    tasks: [{ status: "done" }, { status: "done" }],
  },
];

describe("deriveConceptNodes", () => {
  it("returns nodes and edges", () => {
    const result = deriveConceptNodes(MOCK_PHASES);
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it("creates root concept nodes", () => {
    const { nodes } = deriveConceptNodes(MOCK_PHASES);
    const rootIds = nodes.map((n) => n.id);
    expect(rootIds).toContain("concept-qor");
    expect(rootIds).toContain("concept-victor");
    expect(rootIds).toContain("concept-forge");
    expect(rootIds).toContain("concept-qora");
    expect(rootIds).toContain("concept-evolveai");
  });

  it("assigns children to correct parents", () => {
    const { nodes } = deriveConceptNodes(MOCK_PHASES);
    const forge = nodes.find((n) => n.id === "concept-forge");
    expect(forge).toBeDefined();
    expect(forge!.children.length).toBeGreaterThan(0);
    expect(forge!.children[0].label).toContain("Forge");
  });

  it("calculates task ratios for status", () => {
    const { nodes } = deriveConceptNodes(MOCK_PHASES);
    const victor = nodes.find((n) => n.id === "concept-victor");
    expect(victor).toBeDefined();
    expect(victor!.metadata.tasks!.done).toBeGreaterThan(0);
  });

  it("creates edges from root to children", () => {
    const { edges } = deriveConceptNodes(MOCK_PHASES);
    expect(edges.length).toBeGreaterThan(0);
    const forgeEdges = edges.filter((e) => e.source === "concept-forge");
    expect(forgeEdges.length).toBeGreaterThan(0);
    expect(forgeEdges[0].label).toBe("contains");
  });

  it("handles empty phases", () => {
    const { nodes, edges } = deriveConceptNodes([]);
    expect(nodes.length).toBe(5);
    expect(edges.length).toBe(0);
    for (const n of nodes) {
      expect(n.children.length).toBe(0);
      expect(n.status).toBe("seed");
    }
  });

  it("groups unmatched concepts under Other", () => {
    const phases = [
      { name: "Standalone Feature", status: "planned", tasks: [] },
    ];
    const { nodes } = deriveConceptNodes(phases);
    const other = nodes.find((n) => n.id === "concept-other");
    expect(other).toBeDefined();
    expect(other!.children.length).toBe(1);
    expect(other!.children[0].label).toBe("Standalone Feature");
  });

  it("assigns mature status when all tasks done", () => {
    const phases = [
      { name: "Victor Phase Complete", status: "done", tasks: [{ status: "done" }] },
    ];
    const { nodes } = deriveConceptNodes(phases);
    const victor = nodes.find((n) => n.id === "concept-victor");
    expect(victor!.status).toBe("mature");
  });

  it("assigns seed status when no tasks", () => {
    const phases = [
      { name: "Forge Empty Phase", status: "planned", tasks: [] },
    ];
    const { nodes } = deriveConceptNodes(phases);
    const forge = nodes.find((n) => n.id === "concept-forge");
    expect(forge!.children[0].status).toBe("seed");
  });
});
