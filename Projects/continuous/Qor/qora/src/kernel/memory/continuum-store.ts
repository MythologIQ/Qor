import { getQoraClient } from "../identity";

export class QoraMemoryStore {
  async appendEntry(args: { type: string; payload?: unknown; provenance?: unknown }) {
    return getQoraClient().call<{ id: string; seq: number; hash: string; prevHash: string; timestamp: number }>(
      "events.ledger.append",
      { type: args.type, payload: args.payload, provenance: args.provenance },
    );
  }

  async queryRecentLedgerEntries(args?: { limit?: number; orderBy?: "seq ASC" | "seq DESC" }) {
    return getQoraClient().call<unknown[]>("events.ledger.query", args ?? {});
  }

  async getLastEntryHash() {
    return getQoraClient().call<{ hash: string | null; seq: number | null }>("events.ledger.getLastHash", {});
  }

  async importEntry(args: { seq: number; hash: string; prevHash: string; timestamp: number; type: string; payload?: unknown; provenance?: unknown }) {
    return getQoraClient().call<{ id: string }>("events.ledger.append", {
      mode: "import", seq: args.seq, hash: args.hash, prevHash: args.prevHash,
      timestamp: args.timestamp, type: args.type, payload: args.payload, provenance: args.provenance,
    });
  }

  async index(packet: unknown) {
    return getQoraClient().call<{ id: string }>("events.index", packet);
  }

  async queryRecent(query: unknown) {
    return getQoraClient().call<unknown[]>("events.query", query);
  }
}

let store: QoraMemoryStore | null = null;

export function getQoraMemoryStore(): QoraMemoryStore {
  if (!store) store = new QoraMemoryStore();
  return store;
}
