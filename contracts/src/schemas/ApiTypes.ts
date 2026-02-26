/**
 * API Types
 *
 * Types for API request/response handling.
 */

/**
 * API error codes
 */
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "POLICY_DENIED"
  | "INTEGRITY_FAILURE"
  // Extended error codes
  | "NOT_INITIALIZED"
  | "PAYLOAD_TOO_LARGE"
  | "REPLAY_CONFLICT"
  | "BAD_JSON";

/**
 * API error response
 */
export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  traceId?: string;
  details?: Record<string, unknown>;
  error?: ApiErrorCode;  // Alias for code
}

/**
 * API success response wrapper
 */
export interface ApiSuccessResponse<T> {
  data: T;
  meta?: {
    timestamp?: string;
    traceId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}

/**
 * API response type (success or error)
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | { error: ApiErrorResponse };
