/**
 * Integrity Error Mapping
 * 
 * Converts integrity check results to user-facing errors with
 * actionable guidance and resolution links.
 */

import type { CheckResult, CheckId } from './IntegrityChecker';
import type { UserFacingError } from '../service/errors';
import { formatUserError } from '../service/errors';

/**
 * Integrity check error configurations with user-facing messages.
 * 
 * Maps each integrity check ID to a user-friendly error description
 * with guidance on how to resolve the issue.
 */
export const INTEGRITY_ERROR_CONFIGS: Record<CheckId, Omit<UserFacingError, 'code' | 'details'>> = {
  'PL-INT-01': {
    title: 'Checksum Verification Failed',
    detail: 'One or more data files have been corrupted or modified unexpectedly.',
    resolution: 'Run the integrity repair tool or restore from a backup. Check the file system for issues.',
    severity: 'critical',
  },
  'PL-INT-02': {
    title: 'Ledger Inconsistency Detected',
    detail: 'The planning ledger has inconsistencies that prevent reliable tracking of changes.',
    resolution: 'Review recent changes and run the ledger repair utility. Contact support if the issue persists.',
    severity: 'critical',
  },
  'PL-INT-03': {
    title: 'Void→Reveal Reference Broken',
    detail: 'Some clusters reference thoughts that no longer exist in Void.',
    resolution: 'Remove the broken cluster references or restore the missing thoughts from a backup.',
    link: '/reveal',
    severity: 'error',
  },
  'PL-INT-04': {
    title: 'Reveal→Constellation Reference Broken',
    detail: 'Some constellation nodes reference clusters that no longer exist in Reveal.',
    resolution: 'Remove the orphaned nodes or restore the missing clusters from a backup.',
    link: '/constellation',
    severity: 'error',
  },
  'PL-INT-05': {
    title: 'Constellation→Path Reference Broken',
    detail: 'Some phases reference clusters that no longer exist.',
    resolution: 'Update the phases to remove broken cluster references or restore the missing clusters.',
    link: '/path',
    severity: 'error',
  },
  'PL-INT-06': {
    title: 'Path→Risk Reference Broken',
    detail: 'Some risks reference phases that no longer exist.',
    resolution: 'Remove the orphaned risks or restore the missing phases from a backup.',
    link: '/risk',
    severity: 'error',
  },
  'PL-TRC-01': {
    title: 'Traceability Broken',
    detail: 'The full traceability chain from thoughts through autonomy has gaps or inconsistencies.',
    resolution: 'Review all pipeline stages and ensure all references are valid. Use the repair tool if needed.',
    severity: 'error',
  },
  'PL-TRC-02': {
    title: 'Orphaned Thoughts Detected',
    detail: 'Some thoughts are marked as claimed but are not in any cluster.',
    resolution: 'Go to Reveal and either assign these thoughts to clusters or mark them as unclaimed.',
    link: '/reveal',
    severity: 'warning',
  },
  'PL-TRC-03': {
    title: 'Incomplete Pipeline Coverage',
    detail: 'Some pipeline stages are empty while later stages have content.',
    resolution: 'Complete the earlier pipeline stages to ensure full traceability.',
    severity: 'warning',
  },
};

/**
 * Convert an integrity check result to a user-facing error.
 * 
 * Only returns an error if the check failed. Returns null for passing checks.
 * 
 * @param result - The integrity check result
 * @returns A UserFacingError with actionable guidance, or null if check passed
 */
export function integrityCheckToUserError(result: CheckResult): UserFacingError | null {
  // If check passed, no error to report
  if (result.passed) {
    return null;
  }

  const config = INTEGRITY_ERROR_CONFIGS[result.checkId];
  
  // Combine details from the check result with the standard message
  const detailsText = result.details.join('; ');
  const fullDetail = `${config.detail} ${detailsText}`;

  return formatUserError(result.checkId, {
    ...config,
    detail: fullDetail,
    details: {
      checkId: result.checkId,
      checkName: result.name,
      timestamp: result.timestamp,
      failures: result.details,
    },
  });
}

/**
 * Convert multiple integrity check results to user-facing errors.
 * 
 * Only returns errors for failed checks. Passing checks are filtered out.
 * 
 * @param results - Array of integrity check results
 * @returns Array of UserFacingErrors for failed checks only
 */
export function integrityChecksToUserErrors(results: CheckResult[]): UserFacingError[] {
  return results
    .map(integrityCheckToUserError)
    .filter((error): error is UserFacingError => error !== null);
}

/**
 * Get a human-readable description of an integrity check.
 * 
 * @param checkId - The integrity check ID
 * @returns A brief description of what the check does
 */
export function getIntegrityCheckDescription(checkId: CheckId): string {
  const descriptions: Record<CheckId, string> = {
    'PL-INT-01': 'Verifies that all data files have valid checksums and have not been corrupted.',
    'PL-INT-02': 'Ensures the planning ledger is internally consistent and all entries are valid.',
    'PL-INT-03': 'Checks that all cluster references to thoughts are valid and point to existing thoughts.',
    'PL-INT-04': 'Checks that all constellation node references to clusters are valid.',
    'PL-INT-05': 'Checks that all phase references to clusters are valid.',
    'PL-INT-06': 'Checks that all risk references to phases are valid.',
    'PL-TRC-01': 'Verifies full traceability from thoughts through the entire pipeline to autonomy.',
    'PL-TRC-02': 'Detects thoughts that are marked as claimed but not assigned to any cluster.',
    'PL-TRC-03': 'Ensures all pipeline stages have appropriate content coverage.',
  };
  
  return descriptions[checkId] ?? 'Unknown integrity check';
}

/**
 * Categorize integrity checks by severity.
 * 
 * @returns Object with checks grouped by category
 */
export function getIntegrityCheckCategories() {
  return {
    critical: ['PL-INT-01', 'PL-INT-02'] as CheckId[],
    referential: ['PL-INT-03', 'PL-INT-04', 'PL-INT-05', 'PL-INT-06'] as CheckId[],
    traceability: ['PL-TRC-01', 'PL-TRC-02', 'PL-TRC-03'] as CheckId[],
  };
}

/**
 * Get the recommended action priority for a failed integrity check.
 * 
 * @param checkId - The integrity check ID
 * @returns Priority level: 'immediate' | 'high' | 'medium' | 'low'
 */
export function getIntegrityCheckPriority(checkId: CheckId): 'immediate' | 'high' | 'medium' | 'low' {
  const priorities: Record<CheckId, 'immediate' | 'high' | 'medium' | 'low'> = {
    'PL-INT-01': 'immediate', // Checksum failures indicate corruption
    'PL-INT-02': 'immediate', // Ledger inconsistency blocks tracking
    'PL-INT-03': 'high',      // Broken references cause data loss risk
    'PL-INT-04': 'high',      // Broken references cause data loss risk
    'PL-INT-05': 'high',      // Broken references cause data loss risk
    'PL-INT-06': 'high',      // Broken references cause data loss risk
    'PL-TRC-01': 'medium',    // Traceability gaps are serious but not destructive
    'PL-TRC-02': 'medium',    // Orphans should be resolved but aren't critical
    'PL-TRC-03': 'low',       // Coverage gaps are informational
  };
  
  return priorities[checkId] ?? 'medium';
}
