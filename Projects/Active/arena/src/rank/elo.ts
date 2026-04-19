import type { EloInput, EloResult } from "./types";

export function elo(input: EloInput): EloResult {
  const { ratingA, ratingB, scoreA, kFactor = 32 } = input;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const newA = ratingA + kFactor * (scoreA - expectedA);
  const newB = ratingB + kFactor * ((1 - scoreA) - (1 - expectedA));
  return { newA: Math.round(newA), newB: Math.round(newB), delta: Math.round(newA - ratingA) };
}