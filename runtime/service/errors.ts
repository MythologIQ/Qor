/**
 * Zo-Qore Error System
 * 
 * Provides standardized error types for both internal use and user-facing display.
 * Every error includes actionable guidance for resolution.
 */

// ==========================================
// ERROR TYPES
// ==========================================

/** Error severity levels for UI display */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Error code type */
export type ErrorCode = string;

/**
 * User-facing error shape
 * 
 * All errors that reach the UI should conform to this interface.
 * Provides everything needed for clear user communication.
 */
export interface UserFacingError {
  /** Machine-readable error code */
  code: ErrorCode;
  /** Short human-readable summary (3-5 words) */
  title: string;
  /** Full explanation of what happened */
  detail: string;
  /** What the user should do to resolve the issue */
  resolution: string;
  /** Optional link to view/route for resolution */
  link?: string;
  /** Severity for UI styling */
  severity: ErrorSeverity;
  /** Additional context for debugging */
  details?: Record<string, unknown>;
}

// ==========================================
// ERROR CODE DEFINITIONS
// ==========================================

/**
 * Standard error definitions with user-facing messages
 */
export const ERROR_CODES: Record<string, Omit<UserFacingError, 'code' | 'details'>> = {
  // System Errors
  NOT_INITIALIZED: {
    title: 'System Not Ready',
    detail: 'The system has not been initialized. This usually happens during startup.',
    resolution: 'Wait a moment and try again. If the problem persists, restart the application.',
    severity: 'error',
  },
  
  // Policy Errors
  POLICY_INVALID: {
    title: 'Invalid Policy Configuration',
    detail: 'The policy configuration is invalid and cannot be enforced.',
    resolution: 'Check the policy configuration file for syntax errors.',
    severity: 'error',
  },
  POLICY_DENIED: {
    title: 'Action Not Allowed',
    detail: 'This action violates a governance policy and cannot be performed.',
    resolution: 'Review the policy requirements and ensure all conditions are met before retrying.',
    severity: 'warning',
  },
  
  // Evaluation Errors
  EVALUATION_FAILED: {
    title: 'Evaluation Failed',
    detail: 'The system could not complete the requested evaluation.',
    resolution: 'Check your input for errors and try again.',
    severity: 'error',
  },
  
  // Authentication Errors
  AUTH_REQUIRED: {
    title: 'Authentication Required',
    detail: 'You must be authenticated to perform this action.',
    resolution: 'Log in and try again.',
    severity: 'warning',
  },
  
  // Request Errors
  PAYLOAD_TOO_LARGE: {
    title: 'Request Too Large',
    detail: 'The request payload exceeds the maximum allowed size.',
    resolution: 'Reduce the size of your request and try again.',
    severity: 'error',
  },
  REPLAY_CONFLICT: {
    title: 'Request Already Processed',
    detail: 'This request has already been processed and cannot be repeated.',
    resolution: 'Refresh the page and try a new action.',
    severity: 'warning',
  },
  
  // Model Errors
  MODEL_REQUIRED: {
    title: 'Model Selection Required',
    detail: 'A model must be selected to perform this action.',
    resolution: 'Select a model from the available options.',
    severity: 'info',
  },
  MODEL_NOT_ALLOWED: {
    title: 'Model Not Allowed',
    detail: 'The selected model is not permitted for this operation.',
    resolution: 'Choose a different model from the allowed list.',
    severity: 'warning',
  },
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: {
    title: 'Too Many Requests',
    detail: 'You have exceeded the rate limit. Please wait before trying again.',
    resolution: 'Wait a few seconds and retry your request.',
    severity: 'warning',
  },
  
  // Data Integrity
  INTEGRITY_FAILURE: {
    title: 'Data Integrity Issue',
    detail: 'The data integrity check failed. Some data may be corrupted or missing.',
    resolution: 'Run the integrity repair tool or restore from a backup.',
    severity: 'critical',
  },
  
  // Project Errors
  PROJECT_NOT_FOUND: {
    title: 'Project Not Found',
    detail: 'The requested project could not be found.',
    resolution: 'Check the project ID and try again, or create a new project.',
    severity: 'error',
  },
  VIEW_NOT_FOUND: {
    title: 'View Not Found',
    detail: 'The requested view does not exist in this project.',
    resolution: 'Check the view name or create it from the pipeline.',
    severity: 'error',
  },
  
  // Storage Errors
  STORE_ERROR: {
    title: 'Storage Error',
    detail: 'An error occurred while reading or writing data.',
    resolution: 'Check available disk space and file permissions.',
    severity: 'error',
  },
  
  // Validation Errors
  VALIDATION_ERROR: {
    title: 'Validation Error',
    detail: 'The provided data is invalid.',
    resolution: 'Check the input values and correct any errors.',
    severity: 'warning',
  },
  
  // Pipeline Errors
  PIPELINE_ERROR: {
    title: 'Pipeline Error',
    detail: 'An error occurred in the planning pipeline.',
    resolution: 'Review the pipeline state and check for missing prerequisites.',
    severity: 'error',
  },
  CLUSTERING_FAILED: {
    title: 'Clustering Failed',
    detail: 'The thought clustering process could not complete.',
    resolution: 'Ensure you have captured enough thoughts for clustering.',
    link: '/void',
    severity: 'warning',
  },
  
  // Workflow Requirements
  RISK_REVIEW_REQUIRED: {
    title: 'Risk Review Required',
    detail: 'This action requires a risk review before proceeding.',
    resolution: 'Complete the risk review in the Risk view before continuing.',
    link: '/risk',
    severity: 'warning',
  },
  EMPTY_CAPTURE: {
    title: 'No Thoughts Captured',
    detail: "You haven't captured any thoughts yet.",
    resolution: 'Go to Void view and capture your first thought.',
    link: '/void',
    severity: 'info',
  },
  NOT_ENOUGH_THOUGHTS: {
    title: 'Not Enough Thoughts',
    detail: 'You need at least 3 thoughts before you can create clusters.',
    resolution: 'Capture more thoughts in Void view before organizing them.',
    link: '/void',
    severity: 'info',
  },
  PHASE_INCOMPLETE: {
    title: 'Phase Incomplete',
    detail: 'The current phase has incomplete tasks.',
    resolution: 'Complete all required tasks in the current phase before proceeding.',
    severity: 'warning',
  },
  DEPENDENCY_NOT_MET: {
    title: 'Dependency Not Met',
    detail: 'A prerequisite for this action has not been satisfied.',
    resolution: 'Complete the required prerequisite first.',
    severity: 'warning',
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Create a user-facing error from an error code
 */
export function formatUserError(
  code: ErrorCode,
  overrides?: Partial<UserFacingError>
): UserFacingError {
  const base = ERROR_CODES[code];
  if (!base) {
    return {
      code,
      title: 'Unknown Error',
      detail: `An unexpected error occurred (code: ${code})`,
      resolution: 'Try again or contact support if the problem persists.',
      severity: 'error',
      ...overrides,
    };
  }
  
  return {
    code,
    ...base,
    ...overrides,
  };
}

/**
 * Convert any error to a user-facing error
 */
export function toUserError(error: unknown): UserFacingError {
  if (isUserFacingError(error)) {
    return error;
  }
  
  if (isRuntimeError(error)) {
    return error.toUserFacingError();
  }
  
  if (isValidationError(error)) {
    return error.toUserFacingError();
  }
  
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      title: 'Error',
      detail: error.message,
      resolution: 'Try again or contact support if the problem persists.',
      severity: 'error',
    };
  }
  
  return {
    code: 'UNKNOWN_ERROR',
    title: 'Unknown Error',
    detail: 'An unexpected error occurred.',
    resolution: 'Try again or contact support if the problem persists.',
    severity: 'error',
  };
}

// ==========================================
// ERROR CLASSES
// ==========================================

/**
 * Runtime error with error code and optional details
 */
export class RuntimeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
  
  /**
   * Convert to user-facing error
   */
  toUserFacingError(): UserFacingError {
    return formatUserError(this.code, {
      details: this.details,
    });
  }
}

/**
 * Validation error for field-level validation failures
 */
export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
  
  /**
   * Convert to user-facing error
   */
  toUserFacingError(): UserFacingError {
    return {
      code: 'VALIDATION_ERROR',
      title: 'Validation Error',
      detail: `Invalid value for ${this.field}: ${this.message}`,
      resolution: `Please provide a valid value for ${this.field}.`,
      severity: 'warning',
      details: { field: this.field, value: this.value },
    };
  }
}

/**
 * Integrity error for data consistency issues
 */
export class IntegrityError extends Error {
  constructor(
    public readonly file: string,
    message: string,
    public readonly expected?: string,
    public readonly actual?: string
  ) {
    super(message);
    this.name = 'IntegrityError';
  }
  
  /**
   * Convert to user-facing error
   */
  toUserFacingError(): UserFacingError {
    return {
      code: 'INTEGRITY_FAILURE',
      title: 'Data Integrity Issue',
      detail: `Integrity check failed for ${this.file}: ${this.message}`,
      resolution: 'Run the integrity repair tool or restore from a backup.',
      severity: 'critical',
      details: { file: this.file, expected: this.expected, actual: this.actual },
    };
  }
}

// ==========================================
// TYPE GUARDS
// ==========================================

/**
 * Check if an object is a UserFacingError
 */
export function isUserFacingError(error: unknown): error is UserFacingError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'title' in error &&
    'detail' in error &&
    'resolution' in error &&
    'severity' in error
  );
}

/**
 * Check if an error is a RuntimeError
 */
export function isRuntimeError(error: unknown): error is RuntimeError {
  return error instanceof RuntimeError;
}

/**
 * Check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if an error is an IntegrityError
 */
export function isIntegrityError(error: unknown): error is IntegrityError {
  return error instanceof IntegrityError;
}
