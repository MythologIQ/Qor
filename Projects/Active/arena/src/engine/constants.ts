import type { UnitType } from "./units";

export const ROUND_CAP = 50;
export const BASE_AP = 3;
export const AP_CAP = 4;
export const MAX_CARRY = 1;
export const BID_MIN = 0;

export const MOVE_POINTS: Record<UnitType, number> = {
  infantry: 2,
  scout: 3,
  heavy: 1,
};

export const RANGE: Record<UnitType, number> = {
  infantry: 1,
  scout: 1,
  heavy: 2,
};
