/**
 * Qora Connector - Bridges Moltbook ledger to Constellation visualization
 * Transforms ledger entries into graph nodes/edges for Qora mindmap
 */

import { moltbook, type MoltEntry, type MoltEntryType } from "../moltbook/ledger";
import type { 
  ConstellationNode, 
  ConstellationEdge 
} from "../../../Builder/Zo-Qore/contracts/src/planning/constellation";

export interface QoraGraphView {
  nodes: QoraNode[];
  edges: QoraEdge[];
  meta: {
    entryCount: number;
    timeRange: { from: string; to: string };
    filters: MoltFilter;
  };
}

export interface QoraNode extends ConstellationNode {
  entryRef: MoltEntry;
  visualState: "fresh" | "aging" | "archived";
  weight: number;
}

export interface QoraEdge extends ConstellationEdge {
  relationType: "causal" | "temporal" | "semantic";
}

export interface MoltFilter {
  types?: MoltEntryType[];
  since?: string;
  tier?: number;
  limit?: number;
}

export class MoltbookConnector {
  private moltbook = moltbook;

  /**
   * Sync Moltbook entries to Qora visualization graph
   * Call this after each heartbeat or on demand
   */
  syncToQora(filter?: MoltFilter): QoraGraphView {
    const entries = this.moltbook.getEntries({
      type: filter?.types?.[0],
      since: filter?.since,
    });

    const nodes: QoraNode[] = entries.map((e, i) => this.entryToNode(e, i));
    const edges: QoraEdge[] = this.deriveEdges(entries);

    return {
      nodes,
      edges,
      meta: {
        entryCount: entries.length,
        timeRange: {
          from: entries[0]?.timestamp || new Date().toISOString(),
          to: entries[entries.length - 1]?.timestamp || new Date().toISOString(),
        },
        filters: filter || {},
      },
    };
  }

  private entryToNode(entry: MoltEntry, index: number): QoraNode {
    const age = Date.now() - new Date(entry.timestamp).getTime();
    const visualState = age < 60000 ? "fresh" : age < 3600000 ? "aging" : "archived";
    
    return {
      nodeId: `molt-${entry.seq}`,
      clusterId: entry.provenance.source,
      position: {
        x: Math.cos(index * 0.5) * (100 + entry.seq * 10),
        y: Math.sin(index * 0.5) * (100 + entry.seq * 10),
      },
      entryRef: entry,
      visualState,
      weight: entry.provenance.tier * 0.25 + entry.provenance.autonomyLevel * 0.1,
    };
  }

  private deriveEdges(entries: MoltEntry[]): QoraEdge[] {
    const edges: QoraEdge[] = [];
    
    for (let i = 1; i < entries.length; i++) {
      edges.push({
        edgeId: `edge-${i}`,
        fromNodeId: `molt-${entries[i-1].seq}`,
        toNodeId: `molt-${entries[i].seq}`,
        relationship: "temporal_chain",
        weight: 1.0,
        relationType: "temporal",
      });

      if (entries[i].provenance.source === entries[i-1].provenance.source) {
        edges.push({
          edgeId: `causal-${i}`,
          fromNodeId: `molt-${entries[i-1].seq}`,
          toNodeId: `molt-${entries[i].seq}`,
          relationship: "source_continuity",
          weight: 0.8,
          relationType: "causal",
        });
      }
    }

    return edges;
  }

  /**
   * Real-time stream handler - call on each new Moltbook entry
   */
  onNewEntry(callback: (graph: QoraGraphView) => void): () => void {
    const checkInterval = setInterval(() => {
      const latest = this.syncToQora({ limit: 1 });
      if (latest.nodes.length > 0) {
        callback(latest);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }
}

export const qoraConnector = new MoltbookConnector();
