/** Shared types for Continuum intelligence layers */

export interface EpisodicRecord {
  id: string;
  content: string;
  agent: string;
  type: string;
  timestamp: number;
  sessionId?: string;
  entities: string[];
  embedding?: number[];
}

export interface SemanticNode {
  id: string;
  type: "semantic";
  subtype: "co-occurrence" | "cluster";
  label: string;
  entities: string[];
  confidence: number;
  episodicCount: number;
  firstSeen: string;
  lastSeen: string;
  embedding?: number[];
}

export interface ProceduralNode {
  id: string;
  type: "procedural";
  status: "candidate" | "validated";
  label: string;
  steps: { action: string; entity?: string; avgDuration?: number }[];
  occurrences: number;
  successRate: number;
  outcomeType?: string;
  firstSeen: string;
  lastSeen: string;
}

export interface CoOccurrence {
  entityA: string;
  entityB: string;
  count: number;
  recordIds: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface Cluster {
  members: { id: string; embedding: number[]; content: string }[];
  centroid: number[];
  entities: string[];
}

export interface Chain {
  records: { id: string; type: string; agent: string; entities: string[]; timestamp: number }[];
  sessionId: string;
}

export interface Pattern {
  fingerprint: string;
  chains: Chain[];
  steps: { action: string; entity?: string }[];
}
