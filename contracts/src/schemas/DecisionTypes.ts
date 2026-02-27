/**
 * Decision Types
 *
 * Types for governance decision requests and responses.
 */

import { z } from "zod";
import type { RiskGrade } from "./shared.types";

/**
 * Decision request for policy evaluation
 */
export interface DecisionRequest {
  requestId: string;
  actorId: string;
  projectId?: string;
  action: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  context?: Record<string, unknown>;
  targetPath?: string;
  content?: string;
}

/**
 * Decision type (both uppercase and lowercase forms)
 */
export type DecisionType = 
  | "allow" 
  | "deny" 
  | "warn" 
  | "escalate"
  | "ALLOW"
  | "DENY"
  | "WARN"
  | "ESCALATE";

/**
 * Decision response from policy engine
 */
export interface DecisionResponse {
  requestId: string;
  decision: DecisionType;
  reason?: string;
  reasons?: string[];  // Plural form
  riskGrade?: RiskGrade;
  conditions?: string[];
  timestamp: string;
  traceId?: string;
  decisionId?: string;
  auditEventId?: string;
  requiredActions?: string[];
  evaluationTier?: number;
  policyVersion?: string;
  evaluatedAt?: string;
}

/**
 * Decision request schema for validation (Zod)
 */
export const DecisionRequestSchema = z.object({
  requestId: z.string(),
  actorId: z.string(),
  projectId: z.string().optional(),
  action: z.string(),
  payload: z.any().optional(),
  timestamp: z.string(), // Required for validation
  context: z.any().optional(),
  targetPath: z.string().optional(),
  content: z.string().optional(),
});

/**
 * Decision response schema for validation (Zod)
 */
export const DecisionResponseSchema = z.object({
  requestId: z.string(),
  decision: z.enum(["allow", "deny", "warn", "escalate", "ALLOW", "DENY", "WARN", "ESCALATE"]),
  reason: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  riskGrade: z.any().optional(),
  conditions: z.array(z.string()).optional(),
  timestamp: z.string(),
  traceId: z.string().optional(),
  decisionId: z.string().optional(),
  auditEventId: z.string().optional(),
  requiredActions: z.array(z.string()).optional(),
  evaluationTier: z.number().optional(),
  policyVersion: z.string().optional(),
  evaluatedAt: z.string().optional(),
});
