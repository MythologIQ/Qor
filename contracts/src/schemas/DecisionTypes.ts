/**
 * Decision Types
 *
 * Types for governance decision requests and responses.
 */

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
  decision: "allow" | "deny" | "warn" | "escalate";
  reason?: string;
  reasons?: string[];  // Plural form
  riskGrade?: RiskGrade;
  conditions?: string[];
  timestamp: string;
  traceId?: string;
  decisionId?: string;
  auditEventId?: string;
  requiredActions?: string[];
}

/**
 * Decision request schema for validation
 */
export const DecisionRequestSchema = {
  type: "object",
  required: ["requestId", "actorId", "action", "timestamp"],
  properties: {
    requestId: { type: "string" },
    actorId: { type: "string" },
    projectId: { type: "string" },
    action: { type: "string" },
    payload: { type: "object" },
    timestamp: { type: "string" },
    context: { type: "object" },
  },
  parse: (data: unknown): DecisionRequest => {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      return {
        requestId: obj.requestId as string,
        actorId: obj.actorId as string,
        projectId: obj.projectId as string | undefined,
        action: obj.action as string,
        payload: obj.payload as Record<string, unknown> | undefined,
        timestamp: obj.timestamp as string,
        context: obj.context as Record<string, unknown> | undefined,
        targetPath: obj.targetPath as string | undefined,
        content: obj.content as string | undefined,
      };
    }
    throw new Error("Invalid DecisionRequest");
  },
};

/**
 * Decision response schema for validation
 */
export const DecisionResponseSchema = {
  type: "object",
  required: ["requestId", "decision", "timestamp"],
  properties: {
    requestId: { type: "string" },
    decision: { type: "string", enum: ["allow", "deny", "warn", "escalate"] },
    reason: { type: "string" },
    riskGrade: { type: "string" },
    conditions: { type: "array", items: { type: "string" } },
    timestamp: { type: "string" },
    traceId: { type: "string" },
  },
  parse: (data: unknown): DecisionResponse => {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      return {
        requestId: obj.requestId as string,
        decision: obj.decision as DecisionResponse["decision"],
        reason: obj.reason as string | undefined,
        reasons: obj.reasons as string[] | undefined,
        riskGrade: obj.riskGrade as RiskGrade | undefined,
        conditions: obj.conditions as string[] | undefined,
        timestamp: obj.timestamp as string,
        traceId: obj.traceId as string | undefined,
        decisionId: obj.decisionId as string | undefined,
        auditEventId: obj.auditEventId as string | undefined,
        requiredActions: obj.requiredActions as string[] | undefined,
      };
    }
    throw new Error("Invalid DecisionResponse");
  },
};
