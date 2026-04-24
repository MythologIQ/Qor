import type { PolicyPack } from "../types.ts";

export const APEX_POLICY_PACK: PolicyPack = {
  id: "apex-v1",
  tier: "apex",
  modelId: "house-default",
  planningHorizon: 3,
  doctrine: {
    opening: [
      "Value initiative only when it compounds into multi-round control.",
      "Open with lane commitments that preserve counterplay options.",
    ],
    terrain: [
      "Treat terrain as a tempo multiplier, not just defense.",
      "Stage attacks from covered hexes before bidding high.",
    ],
    threat: [
      "Project the opponent's best two-ply counter before committing.",
      "Avoid exchanges that improve the opponent's endgame geometry.",
    ],
    bidding: [
      "Spend AP aggressively only on decisive initiative swings.",
      "Preserve carry where the board can pivot next round.",
    ],
    targeting: [
      "Target units whose removal changes multiple contested hexes.",
      "Prefer structural kills over cosmetic damage.",
    ],
    endgame: [
      "Shift from material logic to conversion logic once the board tilts.",
      "Force the opponent into low-agency replies before sealing territory.",
    ],
  },
  matchupNotes: {
    default: ["Play for durable control, not headline aggression."],
    scout: ["Punish overextension by shrinking future mobility."],
    heavy: ["Win around anchors, not always through them."],
  },
  antiPatterns: [
    "Do not burn bid/AP to win a round that does not improve conversion odds.",
    "Do not chase kills that reopen stable territory edges.",
  ],
};
