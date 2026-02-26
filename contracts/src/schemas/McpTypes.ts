/**
 * MCP Types
 *
 * Types for Model Context Protocol integration.
 */

/**
 * MCP request structure
 */
export interface McpRequest {
  jsonrpc?: string;
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
  meta?: {
    timestamp?: string;
    traceId?: string;
    source?: string;
  };
}

/**
 * MCP request schema for validation
 */
export const McpRequestSchema = {
  type: "object",
  required: ["id", "method"],
  properties: {
    id: { oneOf: [{ type: "string" }, { type: "number" }] },
    method: { type: "string" },
    params: { type: "object" },
    meta: { type: "object" },
  },
  parse: (data: unknown): McpRequest => {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      return {
        jsonrpc: obj.jsonrpc as string | undefined,
        id: obj.id as string | number,
        method: obj.method as string,
        params: obj.params as Record<string, unknown> | undefined,
        meta: obj.meta as McpRequest["meta"] | undefined,
      };
    }
    throw new Error("Invalid McpRequest");
  },
};

/**
 * MCP response structure
 */
export interface McpResponse {
  id: string | number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
  meta?: {
    timestamp?: string;
    traceId?: string;
    duration?: number;
  };
}

/**
 * MCP response schema for validation
 */
export const McpResponseSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { oneOf: [{ type: "string" }, { type: "number" }] },
    result: { type: "object" },
    error: {
      type: "object",
      properties: {
        code: { type: "number" },
        message: { type: "string" },
        data: { type: "object" },
      },
    },
    meta: { type: "object" },
  },
  parse: (data: unknown): McpResponse => {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      return {
        id: obj.id as string | number,
        result: obj.result as Record<string, unknown> | undefined,
        error: obj.error as McpResponse["error"] | undefined,
        meta: obj.meta as McpResponse["meta"] | undefined,
      };
    }
    throw new Error("Invalid McpResponse");
  },
};
