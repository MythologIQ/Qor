/**
 * Moltbook - Meta-Operational Ledger for Victor
 * Persistent append-only log of heartbeats, tasks, vetoes, and state transitions
 */

export type MoltEntryType = 
  | "HEARTBEAT" 
  | "TASK_COMPLETE" 
  | "TASK_DERIVED"
  | "VETO"
  | "STATE_TRANSITION"
  | "AUDIT";

export interface MoltEntry {
  seq: number;
  timestamp: string;
  type: MoltEntryType;
  hash: string;
  prevHash: string;
  payload: unknown;
  provenance: {
    source: string;
    tier: number;
    autonomyLevel: number;
  };
}

export class Moltbook {
  private entries: MoltEntry[] = [];
  private seq = 0;

  append(type: MoltEntryType, payload: unknown, provenance: MoltEntry["provenance"]): MoltEntry {
    const prevHash = this.entries.length > 0 
      ? this.entries[this.entries.length - 1].hash 
      : "genesis";
    
    const entry: MoltEntry = {
      seq: ++this.seq,
      timestamp: new Date().toISOString(),
      type,
      hash: this.computeHash(prevHash, type, payload),
      prevHash,
      payload,
      provenance,
    };
    
    this.entries.push(entry);
    return entry;
  }

  private computeHash(prev: string, type: string, payload: unknown): string {
    const data = JSON.stringify({ prev, type, payload });
    return btoa(data).slice(0, 32);
  }

  getEntries(filter?: { type?: MoltEntryType; since?: string }): MoltEntry[] {
    let result = [...this.entries];
    if (filter?.type) result = result.filter(e => e.type === filter.type);
    if (filter?.since) result = result.filter(e => e.timestamp >= filter.since);
    return result;
  }

  getChainIntegrity(): { valid: boolean; brokenAt?: number } {
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].prevHash !== this.entries[i - 1].hash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  }
}

export const moltbook = new Moltbook();
