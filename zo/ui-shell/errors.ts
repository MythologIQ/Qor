/**
 * Zo-Qore User-Facing Error System
 * 
 * Standardized error shape for UI consumption.
 * Every error should tell the user WHAT happened, WHY, and WHAT TO DO.
 */

/**
 * Standard error codes for the Zo-Qore system
 */
export type ErrorCode =
  // Authentication & Authorization
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_LOCKED'
  | 'AUTH_IP_DENIED'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_MFA_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  
  // Validation
  | 'VALIDATION_REQUIRED'
  | 'VALIDATION_INVALID_FORMAT'
  | 'VALIDATION_OUT_OF_RANGE'
  | 'VALIDATION_TOO_LONG'
  | 'VALIDATION_TOO_SHORT'
  
  // Resource
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'RESOURCE_DELETED'
  | 'RESOURCE_LOCKED'
  
  // Policy & Governance
  | 'POLICY_DENIED'
  | 'POLICY_VIOLATION'
  | 'INTEGRITY_FAILURE'
  | 'INTEGRITY_CHECK_FAILED'
  
  // Pipeline State
  | 'PIPELINE_INVALID_STATE'
  | 'PIPELINE_PREREQUISITE_NOT_MET'
  | 'PIPELINE_STAGE_INCOMPLETE'
  
  // System
  | 'SYSTEM_ERROR'
  | 'SYSTEM_UNAVAILABLE'
  | 'SYSTEM_TIMEOUT'
  | 'STORAGE_UNAVAILABLE'
  
  // Rate Limiting
  | 'RATE_LIMITED'
  | 'RATE_LIMIT_EXCEEDED';

/**
 * Error severity levels
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Standard user-facing error shape
 * 
 * This interface ensures every error provides:
 * - WHAT happened (title)
 * - WHY it happened (detail)
 * - WHAT TO DO (resolution)
 * - WHERE TO GO (link, optional)
 */
export interface UserFacingError {
  /** Machine-readable error code */
  code: ErrorCode;
  
  /** Short human-readable summary (2-6 words) */
  title: string;
  
  /** Full explanation of what happened and why */
  detail: string;
  
  /** Actionable guidance for the user */
  resolution: string;
  
  /** Optional navigation link for resolution */
  link?: string;
  
  /** Error severity for UI styling */
  severity: ErrorSeverity;
  
  /** HTTP status code for context */
  status?: number;
  
  /** Additional context-specific data */
  context?: Record<string, unknown>;
}

/**
 * Error factory for creating consistent UserFacingError instances
 */
export const ErrorFactory = {
  /**
   * Authentication required
   */
  authRequired(link?: string): UserFacingError {
    return {
      code: 'AUTH_REQUIRED',
      title: 'Authentication Required',
      detail: 'You must be logged in to access this resource.',
      resolution: 'Please log in and try again.',
      link: link || '/login',
      severity: 'warning',
      status: 401,
    };
  },

  /**
   * Invalid credentials
   */
  authInvalidCredentials(): UserFacingError {
    return {
      code: 'AUTH_INVALID_CREDENTIALS',
      title: 'Invalid Credentials',
      detail: 'The username or password you entered is incorrect.',
      resolution: 'Please check your credentials and try again.',
      severity: 'error',
      status: 401,
    };
  },

  /**
   * Account locked due to too many failed attempts
   */
  authLocked(): UserFacingError {
    return {
      code: 'AUTH_LOCKED',
      title: 'Account Temporarily Locked',
      detail: 'Too many failed login attempts. Your account has been temporarily locked for security.',
      resolution: 'Please wait a few minutes before trying again, or contact support.',
      severity: 'error',
      status: 429,
    };
  },

  /**
   * IP address not allowed
   */
  authIpDenied(ip?: string): UserFacingError {
    return {
      code: 'AUTH_IP_DENIED',
      title: 'Access Denied',
      detail: `Your IP address${ip ? ` (${ip})` : ''} is not authorized to access this system.`,
      resolution: 'Please contact your administrator to request access.',
      severity: 'error',
      status: 403,
      context: ip ? { ip } : undefined,
    };
  },

  /**
   * Resource not found
   */
  notFound(resource: string, id?: string): UserFacingError {
    return {
      code: 'RESOURCE_NOT_FOUND',
      title: `${resource} Not Found`,
      detail: `The ${resource.toLowerCase()}${id ? ` with ID "${id}"` : ''} could not be found.`,
      resolution: `Please verify the identifier and try again, or navigate to the ${resource.toLowerCase()} list.`,
      severity: 'warning',
      status: 404,
      context: id ? { resource, id } : { resource },
    };
  },

  /**
   * Project not found
   */
  projectNotFound(projectId?: string): UserFacingError {
    return {
      code: 'RESOURCE_NOT_FOUND',
      title: 'Project Not Found',
      detail: `The project${projectId ? ` "${projectId}"` : ''} does not exist or has been deleted.`,
      resolution: 'Please select an existing project from the dashboard.',
      link: '/',
      severity: 'warning',
      status: 404,
    };
  },

  /**
   * Required field missing
   */
  validationRequired(field: string): UserFacingError {
    return {
      code: 'VALIDATION_REQUIRED',
      title: 'Required Field Missing',
      detail: `The "${field}" field is required but was not provided.`,
      resolution: `Please provide a value for "${field}" and try again.`,
      severity: 'warning',
      status: 400,
      context: { field },
    };
  },

  /**
   * Invalid format
   */
  validationInvalidFormat(field: string, expectedFormat: string): UserFacingError {
    return {
      code: 'VALIDATION_INVALID_FORMAT',
      title: 'Invalid Format',
      detail: `The "${field}" field has an invalid format. Expected: ${expectedFormat}`,
      resolution: `Please correct the format and try again.`,
      severity: 'warning',
      status: 400,
      context: { field, expectedFormat },
    };
  },

  /**
   * Policy denied - user tried to do something not allowed by current state
   */
  policyDenied(reason: string, resolution: string, link?: string): UserFacingError {
    return {
      code: 'POLICY_DENIED',
      title: 'Action Not Allowed',
      detail: reason,
      resolution,
      link,
      severity: 'warning',
      status: 403,
    };
  },

  /**
   * Pipeline prerequisite not met
   */
  pipelinePrerequisiteNotMet(
    currentStage: string,
    requiredStage: string,
    link?: string
  ): UserFacingError {
    return {
      code: 'PIPELINE_PREREQUISITE_NOT_MET',
      title: 'Prerequisite Not Complete',
      detail: `Cannot proceed to "${currentStage}" because "${requiredStage}" has not been completed.`,
      resolution: `Please complete the "${requiredStage}" stage first.`,
      link,
      severity: 'info',
      status: 400,
      context: { currentStage, requiredStage },
    };
  },

  /**
   * Void session not found
   */
  voidSessionNotFound(sessionId?: string): UserFacingError {
    return {
      code: 'RESOURCE_NOT_FOUND',
      title: 'Capture Session Not Found',
      detail: `The capture session${sessionId ? ` "${sessionId}"` : ''} does not exist or has expired.`,
      resolution: 'Start a new capture session in the Void view.',
      link: '/?view=void',
      severity: 'warning',
      status: 404,
    };
  },

  /**
   * Storage unavailable
   */
  storageUnavailable(): UserFacingError {
    return {
      code: 'STORAGE_UNAVAILABLE',
      title: 'Storage Unavailable',
      detail: 'The data storage system is currently unavailable.',
      resolution: 'Please try again in a moment. If the problem persists, contact support.',
      severity: 'critical',
      status: 503,
    };
  },

  /**
   * System error (catch-all for unexpected errors)
   */
  systemError(message?: string): UserFacingError {
    return {
      code: 'SYSTEM_ERROR',
      title: 'Unexpected Error',
      detail: message || 'An unexpected error occurred while processing your request.',
      resolution: 'Please try again. If the problem persists, contact support.',
      severity: 'error',
      status: 500,
    };
  },

  /**
   * Rate limit exceeded
   */
  rateLimited(retryAfter?: number): UserFacingError {
    return {
      code: 'RATE_LIMITED',
      title: 'Too Many Requests',
      detail: 'You have made too many requests in a short period.',
      resolution: `Please wait${retryAfter ? ` ${retryAfter} seconds` : ' a moment'} before trying again.`,
      severity: 'warning',
      status: 429,
      context: retryAfter ? { retryAfter } : undefined,
    };
  },

  /**
   * Integrity check failed
   */
  integrityFailure(checkId: string, details: string): UserFacingError {
    return {
      code: 'INTEGRITY_FAILURE',
      title: 'Data Integrity Issue',
      detail: `Integrity check "${checkId}" failed: ${details}`,
      resolution: 'Please review the data and correct any inconsistencies. Contact support if needed.',
      severity: 'critical',
      status: 500,
      context: { checkId },
    };
  },
};

/**
 * Helper to convert UserFacingError to JSON response
 */
export function errorToJson(error: UserFacingError): Record<string, unknown> {
  return {
    error: {
      code: error.code,
      title: error.title,
      detail: error.detail,
      resolution: error.resolution,
      link: error.link,
      severity: error.severity,
      context: error.context,
    },
  };
}

/**
 * HTTP status code mapping for error codes
 */
export function getStatusForCode(code: ErrorCode): number {
  switch (code) {
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID_CREDENTIALS':
    case 'AUTH_TOKEN_EXPIRED':
    case 'AUTH_TOKEN_INVALID':
      return 401;
    
    case 'AUTH_LOCKED':
    case 'RATE_LIMITED':
    case 'RATE_LIMIT_EXCEEDED':
      return 429;
    
    case 'AUTH_IP_DENIED':
    case 'AUTH_MFA_INVALID':
    case 'POLICY_DENIED':
    case 'POLICY_VIOLATION':
      return 403;
    
    case 'RESOURCE_NOT_FOUND':
    case 'RESOURCE_DELETED':
      return 404;
    
    case 'VALIDATION_REQUIRED':
    case 'VALIDATION_INVALID_FORMAT':
    case 'VALIDATION_OUT_OF_RANGE':
    case 'VALIDATION_TOO_LONG':
    case 'VALIDATION_TOO_SHORT':
    case 'PIPELINE_INVALID_STATE':
    case 'PIPELINE_PREREQUISITE_NOT_MET':
    case 'PIPELINE_STAGE_INCOMPLETE':
      return 400;
    
    case 'RESOURCE_ALREADY_EXISTS':
      return 409;
    
    case 'STORAGE_UNAVAILABLE':
    case 'SYSTEM_UNAVAILABLE':
      return 503;
    
    case 'SYSTEM_TIMEOUT':
      return 504;
    
    case 'INTEGRITY_FAILURE':
    case 'INTEGRITY_CHECK_FAILED':
    case 'SYSTEM_ERROR':
    default:
      return 500;
  }
}

/**
 * Create a UserFacingError from a simple error message
 * (for migration from legacy error patterns)
 */
export function fromLegacyError(message: string, status: number = 500): UserFacingError {
  // Try to map common patterns
  if (message.toLowerCase().includes('not found')) {
    return ErrorFactory.notFound('Resource');
  }
  if (message.toLowerCase().includes('required')) {
    return ErrorFactory.validationRequired('field');
  }
  if (status === 401) {
    return ErrorFactory.authRequired();
  }
  if (status === 403) {
    return ErrorFactory.policyDenied(message, 'Please contact support if you believe this is an error.');
  }
  
  return {
    code: 'SYSTEM_ERROR',
    title: 'Error',
    detail: message,
    resolution: 'Please try again. If the problem persists, contact support.',
    severity: status >= 500 ? 'error' : 'warning',
    status,
  };
}
