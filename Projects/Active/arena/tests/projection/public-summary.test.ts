import { describe, expect, test } from "bun:test";
import { projectPublicMatch } from "../../src/projection/public-match.ts";
import { buildPublicMatchSummary, buildPublicReplayCard } from "../../src/projection/public-summary.ts";

const projection = projectPublicMatch({
  matchId: "match-demo-2",
  mode: "replay",
  round: 12,
  roundCap: 18,
  phase: "Runout",
  pressure: 33,
  headline: "Blue consolidates.",
  featuredEvent: "Territory lead holds.",
  board: [],
  units: [],
  territories: { A: 14, B: 10 },
  agents: [
    {
      id: "a",
      side: "A",
      operator: "Blue Horizon",
      modelId: "minimax/m2.7",
      status: "acting",
      totalMs: 1200,
      totalActions: 12,
      invalidCount: 0,
    },
    {
      id: "b",
      side: "B",
      operator: "Red Morrow",
      modelId: "minimax/m2.7",
      status: "observing",
      totalMs: 1400,
      totalActions: 12,
      invalidCount: 0,
    },
  ],
  outcome: { winner: "A", reason: "territory_control" },
});

describe("public summaries", () => {
  test("builds a summary from projection only", () => {
    const summary = buildPublicMatchSummary(projection);
    expect(summary.operatorA).toBe("Blue Horizon");
    expect(summary.territoryB).toBe(10);
    expect(summary.outcome?.winner).toBe("A");
  });

  test("builds a replay card from the summary", () => {
    const summary = buildPublicMatchSummary(projection);
    const card = buildPublicReplayCard(summary);
    expect(card.title).toBe("Blue Horizon vs Red Morrow");
    expect(card.subtitle).toContain("Round 12/18");
    expect(card.winner).toBe("A");
    expect(card.reason).toBe("territory_control");
  });
});
