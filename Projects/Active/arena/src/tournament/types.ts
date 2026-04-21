// Tournament types

export type TournamentStatus = "pending" | "active" | "completed" | "cancelled";

export interface Pairing {
  roundIndex: number;
  matchIndex: number;
  playerAId: number;
  playerBId: number;
  winnerId?: number;
}

export interface Round {
  index: number;
  pairings: Pairing[];
}

export interface TournamentRecord {
  id: string;
  operatorId: number;
  title: string;
  status: TournamentStatus;
  rounds: Round[];
  createdAt: number;
}