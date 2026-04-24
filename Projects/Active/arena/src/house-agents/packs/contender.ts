import type { PolicyPack } from "../types.ts";

export const CONTENDER_POLICY_PACK: PolicyPack = {
  id: "contender-v1",
  tier: "contender",
  modelId: "house-default",
  planningHorizon: 2,
  doctrine: {
    opening: [
      "Contest the center if it unlocks multiple follow-up captures.",
      "Value tempo when it creates the next attack window.",
    ],
    terrain: [
      "Anchor on defensive terrain before committing ranged pieces.",
      "Avoid exposing scouts to mountain-screened counters.",
    ],
    threat: [
      "Measure the best opponent reply before attacking.",
      "Preserve units that can contest two lanes at once.",
    ],
    bidding: [
      "Bid to seize initiative when a first strike flips board control.",
      "Save AP when the board is stable.",
    ],
    targeting: [
      "Prefer units that open a lane or collapse enemy tempo.",
      "Eliminate damaged units before pressuring anchors.",
    ],
    endgame: [
      "Convert pressure into territory when elimination is unlikely.",
      "Deny comeback lanes before chasing vanity damage.",
    ],
  },
  matchupNotes: {
    default: ["Sequence moves for tempo, not just immediate gain."],
    siege: ["Close distance only when the reply lane is covered."],
  },
  antiPatterns: [
    "Do not trade initiative for equal material without territory gain.",
    "Do not split forces across disconnected lanes.",
  ],
};
