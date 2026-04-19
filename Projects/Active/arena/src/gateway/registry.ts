import type { AgentChannel } from "../runner/types.ts";

export class SessionRegistry {
  #map = new Map<string, AgentChannel>();

  register(opId: string, channel: AgentChannel): void {
    this.#map.set(opId, channel);
  }

  unregister(opId: string): void {
    this.#map.delete(opId);
  }

  get(opId: string): AgentChannel | null {
    return this.#map.get(opId) ?? null;
  }

  size(): number {
    return this.#map.size;
  }
}
