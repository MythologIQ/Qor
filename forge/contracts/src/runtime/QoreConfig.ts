/**
 * Qore Configuration
 *
 * Configuration types and defaults for the Qore runtime.
 */

import type { WorkspaceProvider } from './interfaces.js';

/**
 * Evaluation routing configuration
 */
export interface EvaluationRoutingConfig {
  enabled?: boolean;
  defaultStrategy?: string;
  strategies?: Record<string, unknown>;
  tier2_risk_threshold?: number;
  tier3_risk_threshold?: number;
  tier2_novelty_threshold?: number;
  tier3_novelty_threshold?: number;
  tier2_confidence_threshold?: number;
  tier3_confidence_threshold?: number;
}

/**
 * Ledger tier configuration
 */
export interface LedgerTierConfig {
  enabled?: boolean;
  path?: string;
  tier0_enabled?: boolean;
  tier1_enabled?: boolean;
  tier2_enabled?: boolean;
  tier3_enabled?: boolean;
}

/**
 * Evaluation configuration
 */
export interface EvaluationConfig {
  enabled?: boolean;
  metricsEndpoint?: string;
  sampleRate?: number;
  routing?: EvaluationRoutingConfig;
  ledger?: LedgerTierConfig | { enabled?: boolean; path?: string };
}

/**
 * QoreLogic configuration
 */
export interface QoreLogicConfig {
  enabled?: boolean;
  l3ApprovalTimeout?: number;
  l3SLA?: number;
  overseerEndpoint?: string;
  strictMode?: boolean;
}

/**
 * Qore runtime configuration
 */
export interface QoreConfig {
  /** Workspace provider for filesystem access */
  workspaceProvider?: WorkspaceProvider;
  /** Policy directory path */
  policyDir?: string;
  /** Ledger directory path */
  ledgerDir?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum concurrent requests */
  maxConcurrency?: number;
  /** Evaluation configuration */
  evaluation?: EvaluationConfig;
  /** QoreLogic configuration */
  qorelogic?: QoreLogicConfig;
}

/**
 * Default Qore configuration
 */
export const defaultQoreConfig: QoreConfig = {
  debug: false,
  timeoutMs: 30000,
  maxConcurrency: 10,
};
