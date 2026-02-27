import * as crypto from "crypto";
import { FailureMode, ShadowGenomeEntry, SentinelVerdict } from "@mythologiq/qore-contracts/schemas/shared.types";

type ArchiveRequest = {
  verdict: SentinelVerdict;
  inputVector: string;
  decisionRationale?: string;
  environmentContext?: Record<string, unknown>;
  causalVector?: Record<string, unknown>;
};

export class ShadowGenomeManager {
  private readonly entries: ShadowGenomeEntry[] = [];

  async archiveFailure(request: ArchiveRequest): Promise<ShadowGenomeEntry> {
    const entry: ShadowGenomeEntry = {
      id: crypto.randomUUID(),
      pattern: request.inputVector,
      context: request.environmentContext ?? {},
      outcome: "failure",
      timestamp: new Date().toISOString(),
      confidence: 0.5,
      agentDid: request.verdict.agentDid,
      causalVector: request.causalVector,
      failureMode: this.mapVerdict(request.verdict.decision),
    };
    this.entries.push(entry);
    return entry;
  }

  async getEntriesByAgent(agentDid: string, limit = 20): Promise<ShadowGenomeEntry[]> {
    return this.entries.filter((entry) => entry.agentDid === agentDid).slice(-limit);
  }

  async getNegativeConstraintsForAgent(agentDid: string): Promise<Record<string, unknown>[]> {
    return this.entries
      .filter((entry) => entry.agentDid === agentDid && entry.causalVector)
      .map((entry) => entry.causalVector as Record<string, unknown>);
  }

  async analyzeFailurePatterns(): Promise<
    { failureMode: FailureMode; count: number; agentDids: string[]; recentCauses: Record<string, unknown>[] }[]
  > {
    const byMode = new Map<FailureMode | undefined, ShadowGenomeEntry[]>();
    for (const entry of this.entries) {
      const group = byMode.get(entry.failureMode) ?? [];
      group.push(entry);
      byMode.set(entry.failureMode, group);
    }

    return Array.from(byMode.entries())
      .filter(([mode]) => mode !== undefined)
      .map(([failureMode, items]) => ({
        failureMode: failureMode as FailureMode,
        count: items.length,
        agentDids: Array.from(new Set(items.map((item) => item.agentDid).filter((d): d is string => d !== undefined))),
        recentCauses: items.slice(-5).map((item) => item.causalVector ?? {}),
      }));
  }

  close(): void {
    this.entries.length = 0;
  }

  private mapVerdict(decision: SentinelVerdict["decision"]): FailureMode {
    if (decision === "QUARANTINE") return "TRUST_VIOLATION";
    if (decision === "BLOCK") return "SPEC_VIOLATION";
    if (decision === "ESCALATE") return "HIGH_COMPLEXITY";
    if (decision === "WARN") return "LOGIC_ERROR";
    return "OTHER";
  }
}

