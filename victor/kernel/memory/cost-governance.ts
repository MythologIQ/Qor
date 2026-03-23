/**
 * Cost Governance Module
 *
 * Deterministic cost budgeting and model-tier policy enforcement.
 * Mirrors FailSafe Pro's capability broker pattern: every action has a cost,
 * every model has a budget, and the code — not the LLM — decides what's allowed.
 *
 * @module cost-governance
 */

// ============================================================================
// Model Tier Definitions
// ============================================================================

/**
 * Model capability tiers.
 * Governance decisions adjust based on model tier — weaker models get
 * tighter guardrails and simpler task routing.
 */
export type ModelTier = 'free' | 'standard' | 'premium';

export interface ModelProfile {
  id: string;
  name: string;
  tier: ModelTier;
  /** Estimated cost per invocation in USD (0 for free models) */
  costPerInvocation: number;
  /** Maximum reasoning complexity this model can reliably handle */
  maxReasoningDepth: 'shallow' | 'moderate' | 'deep';
  /** Whether this model reliably follows structured output formats */
  structuredOutputReliability: 'low' | 'medium' | 'high';
  /** Maximum safe actions per tick for this model */
  maxActionsPerTick: number;
}

/** Known model profiles — extend as models are added */
export const MODEL_PROFILES: Record<string, ModelProfile> = {
  'vercel:moonshotai/kimi-k2.5': {
    id: 'vercel:moonshotai/kimi-k2.5',
    name: 'Kimi K2.5',
    tier: 'free',
    costPerInvocation: 0,
    maxReasoningDepth: 'moderate',
    structuredOutputReliability: 'medium',
    maxActionsPerTick: 1,
  },
  'vercel:minimax/minimax-m2.7': {
    id: 'vercel:minimax/minimax-m2.7',
    name: 'Minimax M2.7',
    tier: 'free',
    costPerInvocation: 0,
    maxReasoningDepth: 'moderate',
    structuredOutputReliability: 'medium',
    maxActionsPerTick: 1,
  },
  'vercel:minimax/minimax-m2.5': {
    id: 'vercel:minimax/minimax-m2.5',
    name: 'Minimax M2.5',
    tier: 'free',
    costPerInvocation: 0,
    maxReasoningDepth: 'shallow',
    structuredOutputReliability: 'medium',
    maxActionsPerTick: 1,
  },
  'vercel:zai/glm-5': {
    id: 'vercel:zai/glm-5',
    name: 'GLM-5',
    tier: 'free',
    costPerInvocation: 0,
    maxReasoningDepth: 'moderate',
    structuredOutputReliability: 'medium',
    maxActionsPerTick: 1,
  },
  'vercel:google/gemini-3.1-pro-preview': {
    id: 'vercel:google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    tier: 'free',
    costPerInvocation: 0,
    maxReasoningDepth: 'deep',
    structuredOutputReliability: 'high',
    maxActionsPerTick: 1,
  },
  'anthropic:claude-sonnet-4-5-20250929': {
    id: 'anthropic:claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    tier: 'premium',
    costPerInvocation: 0.75,
    maxReasoningDepth: 'deep',
    structuredOutputReliability: 'high',
    maxActionsPerTick: 1,
  },
  'anthropic:claude-opus-4-6': {
    id: 'anthropic:claude-opus-4-6',
    name: 'Claude Opus 4.6',
    tier: 'premium',
    costPerInvocation: 2.50,
    maxReasoningDepth: 'deep',
    structuredOutputReliability: 'high',
    maxActionsPerTick: 1,
  },
  'openai:gpt-5.4-2026-03-05': {
    id: 'openai:gpt-5.4-2026-03-05',
    name: 'GPT 5.4',
    tier: 'standard',
    costPerInvocation: 0.50,
    maxReasoningDepth: 'deep',
    structuredOutputReliability: 'high',
    maxActionsPerTick: 1,
  },
  'zo:fast': {
    id: 'zo:fast',
    name: 'Zo Fast',
    tier: 'standard',
    costPerInvocation: 0.10,
    maxReasoningDepth: 'moderate',
    structuredOutputReliability: 'high',
    maxActionsPerTick: 1,
  },
  'zo:smart': {
    id: 'zo:smart',
    name: 'Zo Smart',
    tier: 'standard',
    costPerInvocation: 0.25,
    maxReasoningDepth: 'deep',
    structuredOutputReliability: 'high',
    maxActionsPerTick: 1,
  },
};

// ============================================================================
// Cost Budget
// ============================================================================

export interface CostBudget {
  /** Maximum USD spend per day */
  dailyLimitUsd: number;
  /** Maximum USD spend per tick */
  perTickLimitUsd: number;
  /** Maximum invocations per day */
  dailyInvocationLimit: number;
  /** Allowed model tiers (empty = all allowed) */
  allowedTiers: ModelTier[];
  /** Preferred model ID for heartbeat */
  preferredModelId: string;
  /** Fallback model ID if preferred is unavailable */
  fallbackModelId?: string;
}

/** Conservative budget — free models only, zero cost */
export const FREE_TIER_BUDGET: CostBudget = {
  dailyLimitUsd: 0,
  perTickLimitUsd: 0,
  dailyInvocationLimit: 200,
  allowedTiers: ['free'],
  preferredModelId: 'vercel:moonshotai/kimi-k2.5',
  fallbackModelId: 'vercel:minimax/minimax-m2.7',
};

/** Standard budget — allows paid models within limits */
export const STANDARD_BUDGET: CostBudget = {
  dailyLimitUsd: 5.00,
  perTickLimitUsd: 1.00,
  dailyInvocationLimit: 100,
  allowedTiers: ['free', 'standard'],
  preferredModelId: 'zo:smart',
  fallbackModelId: 'vercel:moonshotai/kimi-k2.5',
};

/** Premium budget — unrestricted model access */
export const PREMIUM_BUDGET: CostBudget = {
  dailyLimitUsd: 50.00,
  perTickLimitUsd: 5.00,
  dailyInvocationLimit: 200,
  allowedTiers: ['free', 'standard', 'premium'],
  preferredModelId: 'anthropic:claude-sonnet-4-5-20250929',
  fallbackModelId: 'zo:smart',
};

// ============================================================================
// Cost Ledger (Append-Only Tracking)
// ============================================================================

export interface CostLedgerEntry {
  timestamp: string;
  modelId: string;
  modelTier: ModelTier;
  estimatedCostUsd: number;
  tickId: string;
  action: string;
  verdict: 'allowed' | 'blocked' | 'budget-exceeded';
}

export interface CostLedgerState {
  entries: CostLedgerEntry[];
  dailyTotalUsd: number;
  dailyInvocationCount: number;
  lastResetDate: string;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createCostLedgerState(): CostLedgerState {
  return {
    entries: [],
    dailyTotalUsd: 0,
    dailyInvocationCount: 0,
    lastResetDate: todayDateString(),
  };
}

function resetIfNewDay(state: CostLedgerState): CostLedgerState {
  const today = todayDateString();
  if (state.lastResetDate !== today) {
    return {
      entries: [],
      dailyTotalUsd: 0,
      dailyInvocationCount: 0,
      lastResetDate: today,
    };
  }
  return state;
}

// ============================================================================
// Cost Governance Decisions
// ============================================================================

export interface CostGovernanceDecision {
  allowed: boolean;
  modelId: string;
  modelTier: ModelTier;
  estimatedCostUsd: number;
  reason: string;
  budgetRemaining: {
    dailyUsd: number;
    dailyInvocations: number;
  };
}

/**
 * Evaluate whether a model invocation is allowed under the current budget.
 * This is deterministic — no LLM reasoning, just arithmetic.
 */
export function evaluateModelCost(
  modelId: string,
  budget: CostBudget,
  ledgerState: CostLedgerState,
  tickId: string,
): { decision: CostGovernanceDecision; updatedState: CostLedgerState } {
  const state = resetIfNewDay(ledgerState);
  const profile = MODEL_PROFILES[modelId] ?? getUnknownProfile(modelId);
  const cost = profile.costPerInvocation;

  // Check tier allowance
  if (budget.allowedTiers.length > 0 && !budget.allowedTiers.includes(profile.tier)) {
    const entry: CostLedgerEntry = {
      timestamp: new Date().toISOString(),
      modelId,
      modelTier: profile.tier,
      estimatedCostUsd: cost,
      tickId,
      action: 'model-invocation',
      verdict: 'blocked',
    };
    return {
      decision: {
        allowed: false,
        modelId,
        modelTier: profile.tier,
        estimatedCostUsd: cost,
        reason: `Model tier '${profile.tier}' not in allowed tiers: [${budget.allowedTiers.join(', ')}].`,
        budgetRemaining: {
          dailyUsd: budget.dailyLimitUsd - state.dailyTotalUsd,
          dailyInvocations: budget.dailyInvocationLimit - state.dailyInvocationCount,
        },
      },
      updatedState: { ...state, entries: [...state.entries, entry] },
    };
  }

  // Check daily invocation limit
  if (state.dailyInvocationCount >= budget.dailyInvocationLimit) {
    const entry: CostLedgerEntry = {
      timestamp: new Date().toISOString(),
      modelId,
      modelTier: profile.tier,
      estimatedCostUsd: cost,
      tickId,
      action: 'model-invocation',
      verdict: 'budget-exceeded',
    };
    return {
      decision: {
        allowed: false,
        modelId,
        modelTier: profile.tier,
        estimatedCostUsd: cost,
        reason: `Daily invocation limit reached (${state.dailyInvocationCount}/${budget.dailyInvocationLimit}).`,
        budgetRemaining: {
          dailyUsd: budget.dailyLimitUsd - state.dailyTotalUsd,
          dailyInvocations: 0,
        },
      },
      updatedState: { ...state, entries: [...state.entries, entry] },
    };
  }

  // Check daily cost limit (skip for free models)
  if (cost > 0 && state.dailyTotalUsd + cost > budget.dailyLimitUsd) {
    const entry: CostLedgerEntry = {
      timestamp: new Date().toISOString(),
      modelId,
      modelTier: profile.tier,
      estimatedCostUsd: cost,
      tickId,
      action: 'model-invocation',
      verdict: 'budget-exceeded',
    };
    return {
      decision: {
        allowed: false,
        modelId,
        modelTier: profile.tier,
        estimatedCostUsd: cost,
        reason: `Would exceed daily budget ($${(state.dailyTotalUsd + cost).toFixed(2)} > $${budget.dailyLimitUsd.toFixed(2)}).`,
        budgetRemaining: {
          dailyUsd: budget.dailyLimitUsd - state.dailyTotalUsd,
          dailyInvocations: budget.dailyInvocationLimit - state.dailyInvocationCount,
        },
      },
      updatedState: { ...state, entries: [...state.entries, entry] },
    };
  }

  // Check per-tick limit (skip for free models)
  if (cost > 0 && cost > budget.perTickLimitUsd) {
    const entry: CostLedgerEntry = {
      timestamp: new Date().toISOString(),
      modelId,
      modelTier: profile.tier,
      estimatedCostUsd: cost,
      tickId,
      action: 'model-invocation',
      verdict: 'budget-exceeded',
    };
    return {
      decision: {
        allowed: false,
        modelId,
        modelTier: profile.tier,
        estimatedCostUsd: cost,
        reason: `Model cost ($${cost.toFixed(2)}) exceeds per-tick limit ($${budget.perTickLimitUsd.toFixed(2)}).`,
        budgetRemaining: {
          dailyUsd: budget.dailyLimitUsd - state.dailyTotalUsd,
          dailyInvocations: budget.dailyInvocationLimit - state.dailyInvocationCount,
        },
      },
      updatedState: { ...state, entries: [...state.entries, entry] },
    };
  }

  // Allowed
  const entry: CostLedgerEntry = {
    timestamp: new Date().toISOString(),
    modelId,
    modelTier: profile.tier,
    estimatedCostUsd: cost,
    tickId,
    action: 'model-invocation',
    verdict: 'allowed',
  };
  const updatedState: CostLedgerState = {
    ...state,
    entries: [...state.entries, entry],
    dailyTotalUsd: state.dailyTotalUsd + cost,
    dailyInvocationCount: state.dailyInvocationCount + 1,
  };

  return {
    decision: {
      allowed: true,
      modelId,
      modelTier: profile.tier,
      estimatedCostUsd: cost,
      reason: cost === 0
        ? `Free model '${profile.name}' — no cost impact.`
        : `Allowed: $${cost.toFixed(2)} within budget ($${updatedState.dailyTotalUsd.toFixed(2)}/$${budget.dailyLimitUsd.toFixed(2)}).`,
      budgetRemaining: {
        dailyUsd: budget.dailyLimitUsd - updatedState.dailyTotalUsd,
        dailyInvocations: budget.dailyInvocationLimit - updatedState.dailyInvocationCount,
      },
    },
    updatedState,
  };
}

// ============================================================================
// Model Selection (Deterministic)
// ============================================================================

/**
 * Select the best model for a tick given budget constraints.
 * Returns the preferred model if allowed, otherwise the fallback, otherwise blocks.
 */
export function selectModel(
  budget: CostBudget,
  ledgerState: CostLedgerState,
  tickId: string,
): { modelId: string; decision: CostGovernanceDecision; updatedState: CostLedgerState } {
  // Try preferred model
  const preferred = evaluateModelCost(budget.preferredModelId, budget, ledgerState, tickId);
  if (preferred.decision.allowed) {
    return { modelId: budget.preferredModelId, ...preferred };
  }

  // Try fallback
  if (budget.fallbackModelId) {
    const fallback = evaluateModelCost(budget.fallbackModelId, budget, preferred.updatedState, tickId);
    if (fallback.decision.allowed) {
      return { modelId: budget.fallbackModelId, ...fallback };
    }
  }

  // No model available within budget
  return {
    modelId: budget.preferredModelId,
    decision: {
      ...preferred.decision,
      reason: `No model available within budget. Preferred: ${preferred.decision.reason}`,
    },
    updatedState: preferred.updatedState,
  };
}

// ============================================================================
// Model-Tier Guardrails
// ============================================================================

export interface ModelGuardrails {
  maxActionsPerTick: number;
  requireStructuredPrompt: boolean;
  maxPromptComplexity: 'simple' | 'moderate' | 'complex';
  allowedActionTypes: string[];
  requireEvidenceBeforeWrite: boolean;
}

/**
 * Get guardrails for a model tier.
 * Weaker models get tighter constraints — the code enforces what the model can't.
 */
export function getModelGuardrails(tier: ModelTier): ModelGuardrails {
  switch (tier) {
    case 'free':
      return {
        maxActionsPerTick: 1,
        requireStructuredPrompt: true,
        maxPromptComplexity: 'simple',
        allowedActionTypes: ['update-task-status', 'create-draft-task'],
        requireEvidenceBeforeWrite: true,
      };
    case 'standard':
      return {
        maxActionsPerTick: 1,
        requireStructuredPrompt: true,
        maxPromptComplexity: 'moderate',
        allowedActionTypes: ['update-task-status', 'create-draft-task'],
        requireEvidenceBeforeWrite: true,
      };
    case 'premium':
      return {
        maxActionsPerTick: 2,
        requireStructuredPrompt: false,
        maxPromptComplexity: 'complex',
        allowedActionTypes: ['update-task-status', 'create-draft-task'],
        requireEvidenceBeforeWrite: true,
      };
  }
}

// ============================================================================
// Utilities
// ============================================================================

function getUnknownProfile(modelId: string): ModelProfile {
  return {
    id: modelId,
    name: modelId,
    tier: 'premium',
    costPerInvocation: 1.00,
    maxReasoningDepth: 'moderate',
    structuredOutputReliability: 'medium',
    maxActionsPerTick: 1,
  };
}

export function getModelProfile(modelId: string): ModelProfile {
  return MODEL_PROFILES[modelId] ?? getUnknownProfile(modelId);
}

export function describeBudget(budget: CostBudget): string {
  const lines = [
    `Cost Budget:`,
    `  Daily limit: $${budget.dailyLimitUsd.toFixed(2)}`,
    `  Per-tick limit: $${budget.perTickLimitUsd.toFixed(2)}`,
    `  Daily invocations: ${budget.dailyInvocationLimit}`,
    `  Allowed tiers: ${budget.allowedTiers.join(', ')}`,
    `  Preferred model: ${budget.preferredModelId}`,
  ];
  if (budget.fallbackModelId) {
    lines.push(`  Fallback model: ${budget.fallbackModelId}`);
  }
  return lines.join('\n');
}
