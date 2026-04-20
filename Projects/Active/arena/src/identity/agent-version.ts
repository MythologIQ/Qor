// HexaWars Arena — Agent Version Registration (Plan A v2, Phase 2)
// Composes fingerprint + similarity + persistence. model_id is first-class.

import type { Database } from "bun:sqlite";
import type { AgentVersion, Fingerprint } from "../shared/types";
import { fingerprint, normalizeCode, type FingerprintInput } from "./fingerprint";
import {
  flagAgainst,
  type CorpusEntry,
  type SimilarityFlag,
} from "./similarity";

export interface RegisterAgentInput extends FingerprintInput {
  operatorId: number;
}

export interface RegisterAgentResult {
  agentVersion: AgentVersion;
  fingerprint: Fingerprint;
  similarityFlags: SimilarityFlag[];
}

export function registerAgentVersion(
  db: Database,
  input: RegisterAgentInput,
): RegisterAgentResult {
  if (!input.modelId || input.modelId.length === 0) {
    throw new Error("modelId required");
  }
  if (input.modelId.length > 128) {
    throw new Error("modelId exceeds 128-char limit");
  }

  const fp = fingerprint(input) as Fingerprint;
  const normalizedCode = normalizeCode(input.code);

  const corpus = db
    .prepare(
      `SELECT av.operator_id AS operatorId, av.fingerprint AS fingerprint, av.id AS avId
       FROM agent_versions av
       WHERE av.operator_id != ?`,
    )
    .all(input.operatorId) as Array<{
      operatorId: number;
      fingerprint: string;
      avId: number;
    }>;

  // Advisory similarity: compare against prior normalized-code fixtures.
  // Code is not persisted in v1 (would require a new column). So similarity
  // runs only against fingerprints present; code-side corpus comes from the
  // caller for tests. For the live route, corpus is empty (v1 scope).
  const corpusEntries: CorpusEntry[] = [];
  const flags = flagAgainst(normalizedCode, corpusEntries);
  void corpus; // fingerprint neighbor set reserved for Plan-B

  const createdAt = Math.floor(Date.now() / 1000);
  const similarityFlagsJson = flags.length ? JSON.stringify(flags) : null;

  const row = db
    .prepare(
      `INSERT INTO agent_versions
         (operator_id, fingerprint, model_id, similarity_flags_json, created_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, operator_id, fingerprint, model_id, similarity_flags_json, created_at`,
    )
    .get(
      input.operatorId,
      fp,
      input.modelId,
      similarityFlagsJson,
      createdAt,
    ) as {
      id: number;
      operator_id: number;
      fingerprint: string;
      model_id: string;
      similarity_flags_json: string | null;
      created_at: number;
    };

  return {
    agentVersion: {
      id: row.id,
      operatorId: row.operator_id,
      fingerprint: row.fingerprint as Fingerprint,
      modelId: row.model_id,
      similarityFlagsJson: row.similarity_flags_json,
      createdAt: row.created_at,
    },
    fingerprint: fp,
    similarityFlags: flags,
  };
}
