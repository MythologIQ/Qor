/**
 * Policy Error Mapping
 * 
 * Converts policy evaluation results to user-facing errors with
 * actionable guidance and resolution links.
 */

import type { PolicyEvaluationResult } from './planning-policies';
import type { UserFacingError } from '../../runtime/service/errors';
import { formatUserError } from '../../runtime/service/errors';

/**
 * Policy error configurations with user-facing messages and resolution actions.
 */
export const POLICY_ERROR_CONFIGS: Record<string, Omit<UserFacingError, 'code' | 'details'>> = {
  'PL-POL-01': {
    title: 'Void is Empty',
    detail: 'You cannot create or modify clusters because no thoughts have been captured yet.',
    resolution: 'Go to Void and capture at least one thought before organizing.',
    link: '/void',
    severity: 'info',
  },
  'PL-POL-02': {
    title: 'No Clusters Available',
    detail: 'You cannot map relationships because no clusters have been formed yet.',
    resolution: 'Go to Reveal and create clusters from your thoughts first.',
    link: '/reveal',
    severity: 'info',
  },
  'PL-POL-03': {
    title: 'Constellation Not Mapped',
    detail: 'You cannot create phases because the constellation has no mapped relationships.',
    resolution: 'Go to Constellation and map relationships between your clusters first.',
    link: '/constellation',
    severity: 'info',
  },
  'PL-POL-04': {
    title: 'No Phases Defined',
    detail: 'You cannot assess risks because no project phases have been created.',
    resolution: 'Go to Path and create phases from your constellation map first.',
    link: '/path',
    severity: 'info',
  },
  'PL-POL-05': {
    title: 'Risk Register Empty',
    detail: 'You cannot activate autonomy because no risks have been assessed.',
    resolution: 'Go to Risk and identify potential risks before activating autonomy.',
    link: '/risk',
    severity: 'warning',
  },
  'PL-POL-06': {
    title: 'Guardrails Not Configured',
    detail: 'You cannot activate autonomy because no guardrails have been defined.',
    resolution: 'Add at least one guardrail to your autonomy configuration before activating.',
    link: '/autonomy',
    severity: 'warning',
  },
  'PL-POL-07': {
    title: 'Invalid Reference',
    detail: 'A reference to a cluster or node could not be found. The data may be corrupted.',
    resolution: 'Check your constellation and path for broken references. You may need to rebuild.',
    severity: 'error',
  },
  'PL-POL-08': {
    title: 'Phase Order Invalid',
    detail: 'Phases must be sequential without gaps. The current phase ordering is invalid.',
    resolution: 'Reorder your phases to ensure they are numbered 1, 2, 3... without skipping.',
    link: '/path',
    severity: 'warning',
  },
};

/**
 * Default error for unknown policy violations
 */
const UNKNOWN_POLICY_ERROR: Omit<UserFacingError, 'code' | 'details'> = {
  title: 'Action Not Allowed',
  detail: 'This action violates a governance policy.',
  resolution: 'Review the project state and ensure all prerequisites are met.',
  severity: 'warning',
};

/**
 * Convert a policy evaluation result to a user-facing error.
 *
 * @param result - The policy evaluation result
 * @param context - Optional additional context for the error
 * @returns A UserFacingError with actionable guidance
 */
export function policyToUserError(
  result: PolicyEvaluationResult,
  context?: Record<string, unknown>
): UserFacingError {
  const config = POLICY_ERROR_CONFIGS[result.policyId] ?? UNKNOWN_POLICY_ERROR;

  return formatUserError(result.policyId, {
    ...config,
    detail: result.reason || config.detail,
    details: context,
  });
}

/**
 * Check if a policy result represents a denial.
 */
export function isPolicyDenied(result: PolicyEvaluationResult): boolean {
  return result.allowed === false;
}

/**
 * Get a quick resolution link for a policy violation.
 * Returns the link to navigate to for resolution, or undefined if none.
 */
export function getPolicyResolutionLink(policyId: string): string | undefined {
  return POLICY_ERROR_CONFIGS[policyId]?.link;
}

/**
 * Get a human-readable title for a policy.
 */
export function getPolicyTitle(policyId: string): string {
  return POLICY_ERROR_CONFIGS[policyId]?.title ?? 'Policy Violation';
}

/**
 * Pipeline stage names for error messages
 */
export const PIPELINE_STAGES = {
  void: 'Void',
  reveal: 'Reveal',
  constellation: 'Constellation',
  path: 'Path',
  risk: 'Risk',
  autonomy: 'Autonomy',
} as const;

/**
 * Get the prerequisite stage for a given stage.
 * Returns undefined if the stage has no prerequisite.
 */
export function getPrerequisiteStage(
  stage: keyof typeof PIPELINE_STAGES
): keyof typeof PIPELINE_STAGES | undefined {
  const prerequisites: Record<keyof typeof PIPELINE_STAGES, keyof typeof PIPELINE_STAGES | undefined> = {
    void: undefined,
    reveal: 'void',
    constellation: 'reveal',
    path: 'constellation',
    risk: 'path',
    autonomy: 'risk',
  };
  return prerequisites[stage];
}

/**
 * Create a "not ready" error for a pipeline stage.
 * Used when a user tries to access a stage before completing prerequisites.
 */
export function createNotReadyError(
  targetStage: keyof typeof PIPELINE_STAGES,
  reason: string
): UserFacingError {
  const prerequisite = getPrerequisiteStage(targetStage);
  const stageName = PIPELINE_STAGES[targetStage];

  if (!prerequisite) {
    return formatUserError('PIPELINE_ERROR', {
      title: `${stageName} Not Ready`,
      detail: reason,
      resolution: 'Check the project state and try again.',
      severity: 'warning',
    });
  }

  const prerequisiteName = PIPELINE_STAGES[prerequisite];
  return formatUserError('DEPENDENCY_NOT_MET', {
    title: `${stageName} Requires ${prerequisiteName}`,
    detail: `You cannot proceed to ${stageName} because ${prerequisiteName} is not complete. ${reason}`,
    resolution: `Complete ${prerequisiteName} first, then return to ${stageName}.`,
    link: `/${prerequisite}`,
    severity: 'info',
  });
}
