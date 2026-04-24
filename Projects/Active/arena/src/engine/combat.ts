import type { Unit, HexCell } from "../shared/types.ts";

type Combatant = Pick<Unit, "id" | "hp" | "strength">;

export interface CombatResult {
  attackerHp: number;
  defenderHp: number;
  destroyed: string[];
}

const TERRAIN_DEFENSE_BONUS: Record<HexCell["terrain"], number> = {
  plain: 0,
  forest: 1,
  mountain: 2,
  water: 0,
};

function defenderDamage(defender: Combatant, terrain: HexCell["terrain"]): number {
  return defender.strength + TERRAIN_DEFENSE_BONUS[terrain];
}

export function resolveCombat(
  attacker: Combatant,
  defender: Combatant,
  terrain: HexCell["terrain"],
  aimPenalty: number = 0,
): CombatResult {
  const reduced = Math.round(attacker.strength * (1 - aimPenalty));
  const atkDmg = Math.max(0, reduced);
  const defDmg = defenderDamage(defender, terrain);

  // Attacks from mountain terrain cannot reach the defender
  const atkDmgActual = terrain === "mountain" ? 0 : atkDmg;

  const defHpAfter = Math.max(0, defender.hp - atkDmgActual);
  const atkHpAfter = Math.max(0, attacker.hp - defDmg);

  const destroyed: string[] = [];

  // Tie rule: when both combatants would be destroyed, defender wins
  if (defHpAfter === 0 && atkHpAfter === 0) {
    destroyed.push(attacker.id);
  } else {
    if (defHpAfter === 0) destroyed.push(defender.id);
    if (atkHpAfter === 0) destroyed.push(attacker.id);
  }

  return {
    attackerHp: atkHpAfter,
    defenderHp: defHpAfter,
    destroyed,
  };
}
