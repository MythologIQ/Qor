// HexaWars Elo Ranking Types

export interface EloInput {
  ratingA: number;
  ratingB: number;
  scoreA: 0 | 0.5 | 1;
  kFactor?: number;
}

export interface EloResult {
  newA: number;
  newB: number;
  delta: number;
}
