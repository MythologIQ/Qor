export interface GateResult {
  allowed: boolean;
  reason?: string;
  policyId?: string;
  evaluatedAt: number;
}

export interface ChatMessage {
  type: "message";
  content: string;
  mode: "chat" | "forge";
  model?: string;
}

export interface ChatFrame {
  type: "gate" | "chunk" | "complete" | "error";
  content?: string;
  result?: GateResult;
  messageId?: string;
  auditId?: string;
  reason?: string;
  stance?: string;
}

export interface AuditRecord {
  conversationId: string;
  messageId: string;
  gateResult: GateResult;
  modelUsed: string;
  tokenCount?: number;
  latencyMs: number;
  stance?: string;
  timestamp: number;
}
