import type { RoundPlan } from "../shared/types.ts";

function isCoord(value: unknown): value is { q: number; r: number; s: number } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { q?: unknown }).q === "number" &&
    typeof (value as { r?: unknown }).r === "number" &&
    typeof (value as { s?: unknown }).s === "number",
  );
}

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export function parseRoundPlan(text: string): RoundPlan {
  const value = parseJson(text) as Partial<RoundPlan>;
  if (typeof value.bid !== "number" || value.bid < 0) {
    throw new Error("invalid bid");
  }
  if (!Array.isArray(value.extras)) {
    throw new Error("missing extras");
  }
  if (value.freeMove) {
    if (!value.freeMove.unitId || !isCoord(value.freeMove.from) || !isCoord(value.freeMove.to)) {
      throw new Error("invalid freeMove");
    }
  }
  if (value.freeAction) {
    if (
      !value.freeAction.unitId ||
      !isCoord(value.freeAction.from) ||
      !isCoord(value.freeAction.to) ||
      (value.freeAction.type !== "attack" && value.freeAction.type !== "ability")
    ) {
      throw new Error("invalid freeAction");
    }
  }
  return {
    bid: value.bid,
    extras: value.extras,
    freeMove: value.freeMove,
    freeAction: value.freeAction,
  };
}
