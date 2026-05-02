import { getForgeClient } from "../identity";

export class ForgeMemoryStore {
  async appendEntry(args: { type: string; payload?: unknown; provenance?: unknown }) {
    return getForgeClient().call<{ id: string; seq: number; hash: string; prevHash: string; timestamp: number }>(
      "events.ledger.append",
      { type: args.type, payload: args.payload, provenance: args.provenance },
    );
  }

  async queryRecentLedgerEntries(args?: { limit?: number; orderBy?: "seq ASC" | "seq DESC" }) {
    return getForgeClient().call<unknown[]>("events.ledger.query", args ?? {});
  }

  async getLastEntryHash() {
    return getForgeClient().call<{ hash: string | null; seq: number | null }>("events.ledger.getLastHash", {});
  }

  async index(packet: unknown) {
    return getForgeClient().call<{ id: string }>("events.index", packet);
  }

  async queryRecent(query: unknown) {
    return getForgeClient().call<unknown[]>("events.query", query);
  }
}

let store: ForgeMemoryStore | null = null;

export function getForgeMemoryStore(): ForgeMemoryStore {
  if (!store) store = new ForgeMemoryStore();
  return store;
}
