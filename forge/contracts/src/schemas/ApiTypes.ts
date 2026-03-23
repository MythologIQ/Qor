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
 * User-facing error for UI consumption
 *
 * Standardized error shape that tells the user what happened,
 * why, and what to do to resolve it.
 */
export interface UserFacingError {
  /** Error code for programmatic handling */
  code: string;  // 'POLICY_DENIED' | 'INTEGRITY_FAILURE' | 'VALIDATION_ERROR' | ...
  /** Short human-readable summary */
  title: string;
  /** Full explanation of what went wrong */
  detail: string;
  /** What the user should do to resolve this */
  resolution: string;
  /** Optional view/route to navigate to for resolution */
  link?: string;
  /** Severity level for UI styling */
  severity: 'info' | 'warning' | 'error' | 'critical';
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

/**
 * Convert ApiErrorResponse to UserFacingError
 */
export function toUserFacingError(apiError: ApiErrorResponse): UserFacingError {
  const resolutions: Record<ApiErrorCode, string> = {
    UNAUTHORIZED: "Please sign in to continue.",
    FORBIDDEN: "You don't have permission to access this resource.",
    NOT_FOUND: "The requested resource was not found.",
    BAD_REQUEST: "Please check your input and try again.",
    VALIDATION_ERROR: "Please correct the validation errors and try again.",
    CONFLICT: "This resource has been modified. Please refresh and try again.",
    RATE_LIMITED: "Please wait a moment and try again.",
    INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
    SERVICE_UNAVAILABLE: "The service is temporarily unavailable. Please try again later.",
    POLICY_DENIED: "This action is not allowed by policy. See the resolution guidance.",
    INTEGRITY_FAILURE: "Data integrity check failed. Please verify your data.",
    NOT_INITIALIZED: "The system has not been initialized. Please complete setup first.",
    PAYLOAD_TOO_LARGE: "The request is too large. Please reduce the size and try again.",
    REPLAY_CONFLICT: "This request was already processed.",
    BAD_JSON: "Invalid JSON format. Please check your request body.",
  };

  const titles: Record<ApiErrorCode, string> = {
    UNAUTHORIZED: "Authentication Required",
    FORBIDDEN: "Access Denied",
    NOT_FOUND: "Not Found",
    BAD_REQUEST: "Invalid Request",
    VALIDATION_ERROR: "Validation Failed",
    CONFLICT: "Resource Conflict",
    RATE_LIMITED: "Rate Limited",
    INTERNAL_ERROR: "Server Error",
    SERVICE_UNAVAILABLE: "Service Unavailable",
    POLICY_DENIED: "Action Denied",
    INTEGRITY_FAILURE: "Integrity Failure",
    NOT_INITIALIZED: "Not Initialized",
    PAYLOAD_TOO_LARGE: "Request Too Large",
    REPLAY_CONFLICT: "Duplicate Request",
    BAD_JSON: "Invalid Format",
  };

  const code = apiError.code;

  return {
    code,
    title: titles[code] || "Error",
    detail: apiError.message || "An error occurred.",
    resolution: resolutions[code] || "Please try again.",
    severity: ['POLICY_DENIED', 'INTEGRITY_FAILURE'].includes(code) ? 'error' :
             ['UNAUTHORIZED', 'FORBIDDEN'].includes(code) ? 'critical' :
             ['RATE_LIMITED', 'SERVICE_UNAVAILABLE'].includes(code) ? 'warning' : 'info',
  };
}
