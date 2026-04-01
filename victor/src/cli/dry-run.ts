/**
 * CLI Handler: --dry-run flag
 * Entry: victor-shell --dry-run [options]
 */

import { deriveAutonomy, deriveTasksFromContext, type AgentContext } from "../heartbeat/mod";

interface DryRunOptions {
  tier?: number;
  mode?: string;
  cadence?: number;
  objective?: string;
  format?: "json" | "yaml" | "table";
}

export class DryRunCommand {
  async execute(args: string[]): Promise<number> {
    const opts = this.parseArgs(args);
    const ctx = this.buildContext(opts);
    
    console.error("\n🔍 DRY-RUN: Previewing derivation from context\n");
    console.error(`  Tier: ${ctx.tier}`);
    console.error(`  Mode: ${ctx.mode}`);
    console.error(`  Cadence: ${ctx.cadence}m`);
    console.error(`  Objective: ${ctx.phase.objective}`);
    console.error("");
    
    const autonomy = deriveAutonomy(ctx);
    console.error(`  Derived Autonomy Level: ${AutonomyLevel[autonomy]}`);
    console.error("");
    
    if (autonomy < 2) {
      console.error("  ⚠️  Would prompt user (insufficient autonomy)");
      return 0;
    }
    
    const result = await deriveTasksFromContext(ctx);
    
    this.renderOutput(result, opts.format || "table");
    
    return 0;
  }
  
  private parseArgs(args: string[]): DryRunOptions {
    const opts: DryRunOptions = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--tier") opts.tier = parseInt(args[++i]);
      if (args[i] === "--mode") opts.mode = args[++i];
      if (args[i] === "--cadence") opts.cadence = parseInt(args[++i]);
      if (args[i] === "--objective") opts.objective = args[++i];
      if (args[i] === "--format") opts.format = args[++i] as any;
    }
    return opts;
  }
  
  private buildContext(opts: DryRunOptions): AgentContext {
    return {
      tier: opts.tier ?? 2,
      mode: (opts.mode as any) ?? "execute",
      cadence: opts.cadence ?? 30,
      phase: {
        objective: opts.objective ?? "Memory Operator Surface and Ergonomic API",
        name: "dry-run-phase"
      },
      progress: { completed: 142, total: 156 },
      blockers: ["Governance blocker", "No eligible Victor work"]
    };
  }
  
  private renderOutput(result: any, format: string): void {
    switch (format) {
      case "json":
        console.log(JSON.stringify(result, null, 2));
        break;
      case "yaml":
        this.renderYaml(result);
        break;
      default:
        this.renderTable(result);
    }
  }
  
  private renderTable(result: any): void {
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ DERIVED TASKS (would be submitted to queue)                  │");
    console.log("├─────────────────────────────────────────────────────────────┤");
    
    result.tasks?.forEach((task: any, i: number) => {
      console.log(`│ ${i + 1}. ${task.title.padEnd(54)} │`);
      console.log(`│    Source: ${task.source.padEnd(48)} │`);
      console.log(`│    Urgency: ${task.urgency.padEnd(47)} │`);
      console.log("├─────────────────────────────────────────────────────────────┤");
    });
    
    console.log(`│ Provenance Hash: ${result.provenanceHash?.substring(0, 50) || "N/A"} │`);
    console.log(`│ Confidence: ${(result.confidence * 100).toFixed(1)}%                                    │`);
    console.log(`│ Sources: ${result.sources?.join(", ")?.substring(0, 40) || "N/A"} │`);
    console.log("└─────────────────────────────────────────────────────────────┘");
  }
  
  private renderYaml(result: any): void {
    console.log("---");
    console.log("dry_run: true");
    console.log(`confidence: ${result.confidence}`);
    console.log(`provenance_hash: ${result.provenanceHash}`);
    console.log("sources:");
    result.sources?.forEach((s: string) => console.log(`  - ${s}`));
    console.log("tasks:");
    result.tasks?.forEach((t: any) => {
      console.log(`  - id: ${t.id}`);
      console.log(`    title: ${t.title}`);
      console.log(`    urgency: ${t.urgency}`);
      console.log(`    source: ${t.source}`);
    });
  }
}

// CLI entry point
if (import.meta.main) {
  const cmd = new DryRunCommand();
  const exitCode = await cmd.execute(Bun.argv.slice(2));
  process.exit(exitCode);
}
