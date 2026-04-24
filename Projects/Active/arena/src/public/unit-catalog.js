export const UNIT_CATALOG = [
  {
    id: "scout",
    name: "Scout",
    tagline: "fast recon",
    token: "/arena/static/tokens/Scout-Neutral.png?v=20260422n1",
    stats: { hp: 3, str: 2, move: 3, range: 1 },
    movement: { type: "Light ground", speed: "3 hexes / turn" },
    terrain: ["Cannot enter WATER", "No mountain penalty"],
    ability: {
      name: "Vanguard Sight",
      description: "Reveals fog in a 2-hex radius around this unit at the start of each turn.",
    },
  },
  {
    id: "raider",
    name: "Raider",
    tagline: "fast striker",
    token: "/arena/static/tokens/Raider-Neutral.png?v=20260422n1",
    stats: { hp: 4, str: 4, move: 3, range: 1 },
    movement: { type: "Light ground", speed: "3 hexes / turn" },
    terrain: ["Cannot enter WATER", "Half speed in FOREST"],
    ability: {
      name: "Flanker",
      description: "Deals +1 STR when attacking from a hex the defender is not facing.",
    },
  },
  {
    id: "interceptor",
    name: "Interceptor",
    tagline: "counter-screen",
    token: "/arena/static/tokens/Interceptor-Neutral.png?v=20260422n1",
    stats: { hp: 5, str: 4, move: 2, range: 1 },
    movement: { type: "Standard ground", speed: "2 hexes / turn" },
    terrain: ["Cannot enter WATER", "No mountain penalty"],
    ability: {
      name: "Overwatch",
      description: "If an enemy ends movement adjacent, retaliates once before being attacked.",
    },
  },
  {
    id: "siege",
    name: "Siege",
    tagline: "ranged artillery",
    token: "/arena/static/tokens/Siege-Neutral.png?v=20260422n1",
    stats: { hp: 6, str: 7, move: 1, range: 2 },
    movement: { type: "Heavy ground", speed: "1 hex / turn" },
    terrain: ["Cannot enter WATER or MOUNTAIN", "Cannot attack from FOREST"],
    ability: {
      name: "Indirect Fire",
      description: "Strikes targets 2 hexes away; ignores forest line-of-sight penalty.",
    },
  },
  {
    id: "captain",
    name: "Captain",
    tagline: "heavy anchor",
    token: "/arena/static/tokens/Captain-Neutral.png?v=20260422n1",
    stats: { hp: 8, str: 5, move: 2, range: 1 },
    movement: { type: "Standard ground", speed: "2 hexes / turn" },
    terrain: ["Cannot enter WATER", "No mountain penalty"],
    ability: {
      name: "Rally",
      description: "Adjacent friendly units gain +1 STR on their own attacks this turn.",
    },
  },
];

export function findUnit(id) {
  return UNIT_CATALOG.find((u) => u.id === id) ?? null;
}
