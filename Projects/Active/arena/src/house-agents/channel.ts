import type { AgentChannel, RoundFrame } from "../runner/types.ts";
import type { BaseAgent } from "../agents/base.ts";
import type { RoundPlan } from "../shared/types.ts";

export class LocalAgentChannel implements AgentChannel {
  private frame: RoundFrame | null = null;

  constructor(private readonly agent: BaseAgent) {}

  send(frame: RoundFrame): void {
    this.frame = frame;
  }

  async receivePlan(): Promise<RoundPlan> {
    if (!this.frame) {
      throw new Error("local agent channel received no frame");
    }
    return this.agent.getRoundPlan(this.frame.state, this.frame.budget);
  }
}
