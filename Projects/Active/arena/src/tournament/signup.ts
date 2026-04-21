// Tournament signup store
// Phase E — tournament signup persistence layer

import type { Database } from "bun:sqlite";
import { openDb } from "../persistence/db.ts";

export { openDb };

export interface CreateTournamentOptions {
  name: string;
  startAt: number; // unix ms
}

export function createTournament(db: Database, name: string, startAt: number): number {
  const result = db.prepare(
    "INSERT INTO tournaments (name, start_at, status) VALUES (?, ?, 'pending') RETURNING id"
  ).get(name, startAt) as { id: number };
  return result.id;
}

export interface SignupOptions {
  tournamentId: number;
  operatorId: number;
}

export function signup(db: Database, tournamentId: number, operatorId: number): number {
  const result = db.prepare(
    "INSERT INTO tournament_signups (tournament_id, operator_id) VALUES (?, ?) RETURNING id"
  ).get(tournamentId, operatorId) as { id: number };
  return result.id;
}

export interface TournamentSignupRecord {
  id: number;
  tournament_id: number;
  operator_id: number;
}

export function listSignups(db: Database, tournamentId: number): TournamentSignupRecord[] {
  return db.prepare(
    "SELECT id, tournament_id, operator_id FROM tournament_signups WHERE tournament_id = ?"
  ).all(tournamentId) as TournamentSignupRecord[];
}