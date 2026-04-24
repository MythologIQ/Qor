import type { PolicyPack } from "../types.ts";

export const STARTER_POLICY_PACK: PolicyPack = {
  id: "starter-v1",
  tier: "starter",
  modelId: "house-default",
  planningHorizon: 1,
  doctrine: {
    opening: ["Claim neutral territory before trading."],
    terrain: ["Avoid water and prefer open lanes."],
    threat: ["Attack only when the local trade is favorable."],
    bidding: ["Prefer low bids unless an immediate capture exists."],
    targeting: ["Hit exposed enemies before defended anchors."],
    endgame: ["Protect a territory lead over speculative attacks."],
  },
  matchupNotes: {
    default: ["Play for stable captures and low-variance trades."],
  },
  antiPatterns: [
    "Do not overspend AP on low-value attacks.",
    "Do not abandon owned territory without compensation.",
  ],
};
