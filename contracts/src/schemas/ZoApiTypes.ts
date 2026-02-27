/**
 * Zo API Types
 *
 * Types for Zo Ask API integration.
 */

/**
 * Zo Ask request from external clients
 */
export interface ZoAskRequest {
  input?: string;
  conversationId?: string;
  modelName?: string;
  model?: string;  // Alias for modelName
  personaId?: string;
  stream?: boolean;
  prompt?: string;  // Alias for input
  sessionId?: string;
  context?: Record<string, unknown>;
  outputFormat?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Zo Ask request schema for validation
 */
export const ZoAskRequestSchema = {
  type: "object",
  required: [],  // No single required field - input OR prompt must be provided (checked in parse)
  properties: {
    input: { type: "string" },
    prompt: { type: "string" },  // Alias for input
    conversationId: { type: "string" },
    modelName: { type: "string" },
    personaId: { type: "string" },
    stream: { type: "boolean" },
    outputFormat: { type: "object" },
  },
  parse: (data: unknown): ZoAskRequest => {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      const input = (obj.input as string) || (obj.prompt as string);
      if (!input) {
        throw new Error("Invalid ZoAskRequest: either 'input' or 'prompt' is required");
      }
      return {
        input,
        conversationId: obj.conversationId as string | undefined,
        modelName: (obj.modelName as string) || (obj.model as string),
        personaId: obj.personaId as string | undefined,
        stream: obj.stream as boolean | undefined,
        prompt: obj.prompt as string | undefined,
        sessionId: obj.sessionId as string | undefined,
        context: obj.context as Record<string, unknown> | undefined,
        outputFormat: obj.outputFormat as ZoAskRequest["outputFormat"] | undefined,
      };
    }
    throw new Error("Invalid ZoAskRequest");
  },
};

/**
 * Zo Ask forward result for proxy handling
 */
export interface ZoAskForwardResult {
  success: boolean;
  output?: string;
  error?: string;
  conversationId?: string;
  traceId?: string;
  duration?: number;
  statusCode?: number;
  body?: Record<string, unknown>;
}

/**
 * Zo Ask forward result schema for validation
 */
export const ZoAskForwardResultSchema = {
  type: "object",
  required: ["success"],
  properties: {
    success: { type: "boolean" },
    output: { type: "string" },
    error: { type: "string" },
    conversationId: { type: "string" },
    traceId: { type: "string" },
    duration: { type: "number" },
  },
  parse: (data: unknown): ZoAskForwardResult => {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      return {
        success: obj.success as boolean,
        output: obj.output as string | undefined,
        error: obj.error as string | undefined,
        conversationId: obj.conversationId as string | undefined,
        traceId: obj.traceId as string | undefined,
        duration: obj.duration as number | undefined,
        statusCode: obj.statusCode as number | undefined,
        body: obj.body as Record<string, unknown> | undefined,
      };
    }
    throw new Error("Invalid ZoAskForwardResult");
  },
};
