import { describe, it, expect } from 'vitest';
import {
  evaluateModelCost,
  selectModel,
  getModelGuardrails,
  getModelProfile,
  createCostLedgerState,
  FREE_TIER_BUDGET,
  STANDARD_BUDGET,
  PREMIUM_BUDGET,
  MODEL_PROFILES,
  type CostBudget,
  type CostLedgerState,
} from './cost-governance';

describe('cost-governance', () => {
  describe('evaluateModelCost', () => {
    it('allows free model with zero cost', () => {
      const state = createCostLedgerState();
      const { decision } = evaluateModelCost('vercel:moonshotai/kimi-k2.5', FREE_TIER_BUDGET, state, 'tick_1');
      expect(decision.allowed).toBe(true);
      expect(decision.estimatedCostUsd).toBe(0);
      expect(decision.modelTier).toBe('free');
    });

    it('blocks premium model under free budget', () => {
      const state = createCostLedgerState();
      const { decision } = evaluateModelCost('anthropic:claude-sonnet-4-5-20250929', FREE_TIER_BUDGET, state, 'tick_1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('not in allowed tiers');
    });

    it('blocks when daily invocation limit reached', () => {
      const state: CostLedgerState = {
        entries: [],
        dailyTotalUsd: 0,
        dailyInvocationCount: 200,
        lastResetDate: new Date().toISOString().slice(0, 10),
      };
      const { decision } = evaluateModelCost('vercel:moonshotai/kimi-k2.5', FREE_TIER_BUDGET, state, 'tick_201');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('invocation limit');
    });

    it('blocks when daily cost limit would be exceeded', () => {
      const budget: CostBudget = {
        ...STANDARD_BUDGET,
        allowedTiers: ['free', 'standard', 'premium'],
      };
      const state: CostLedgerState = {
        entries: [],
        dailyTotalUsd: 4.50,
        dailyInvocationCount: 5,
        lastResetDate: new Date().toISOString().slice(0, 10),
      };
      const { decision } = evaluateModelCost('anthropic:claude-sonnet-4-5-20250929', budget, state, 'tick_6');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('exceed daily budget');
    });

    it('blocks when per-tick limit exceeded', () => {
      const budget: CostBudget = {
        ...STANDARD_BUDGET,
        perTickLimitUsd: 0.50,
        allowedTiers: ['free', 'standard', 'premium'],
      };
      const state = createCostLedgerState();
      const { decision } = evaluateModelCost('anthropic:claude-sonnet-4-5-20250929', budget, state, 'tick_1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('per-tick limit');
    });

    it('resets counters on new day', () => {
      const state: CostLedgerState = {
        entries: [],
        dailyTotalUsd: 100,
        dailyInvocationCount: 999,
        lastResetDate: '2020-01-01',
      };
      const { decision, updatedState } = evaluateModelCost('vercel:moonshotai/kimi-k2.5', FREE_TIER_BUDGET, state, 'tick_1');
      expect(decision.allowed).toBe(true);
      expect(updatedState.dailyInvocationCount).toBe(1);
      expect(updatedState.dailyTotalUsd).toBe(0);
    });

    it('tracks cost in updated state', () => {
      const state = createCostLedgerState();
      const { updatedState } = evaluateModelCost('anthropic:claude-sonnet-4-5-20250929', PREMIUM_BUDGET, state, 'tick_1');
      expect(updatedState.dailyTotalUsd).toBe(0.75);
      expect(updatedState.dailyInvocationCount).toBe(1);
      expect(updatedState.entries).toHaveLength(1);
      expect(updatedState.entries[0]!.verdict).toBe('allowed');
    });

    it('treats unknown models as premium tier', () => {
      const state = createCostLedgerState();
      const { decision } = evaluateModelCost('unknown:mystery-model', FREE_TIER_BUDGET, state, 'tick_1');
      expect(decision.allowed).toBe(false);
      expect(decision.modelTier).toBe('premium');
    });
  });

  describe('selectModel', () => {
    it('selects preferred free model under free budget', () => {
      const state = createCostLedgerState();
      const { modelId, decision } = selectModel(FREE_TIER_BUDGET, state, 'tick_1');
      expect(modelId).toBe('vercel:moonshotai/kimi-k2.5');
      expect(decision.allowed).toBe(true);
    });

    it('falls back when preferred is over budget', () => {
      const budget: CostBudget = {
        dailyLimitUsd: 0,
        perTickLimitUsd: 0,
        dailyInvocationLimit: 200,
        allowedTiers: ['free'],
        preferredModelId: 'anthropic:claude-sonnet-4-5-20250929',
        fallbackModelId: 'vercel:moonshotai/kimi-k2.5',
      };
      const state = createCostLedgerState();
      const { modelId, decision } = selectModel(budget, state, 'tick_1');
      expect(modelId).toBe('vercel:moonshotai/kimi-k2.5');
      expect(decision.allowed).toBe(true);
    });

    it('blocks when neither preferred nor fallback is available', () => {
      const budget: CostBudget = {
        dailyLimitUsd: 0,
        perTickLimitUsd: 0,
        dailyInvocationLimit: 200,
        allowedTiers: ['premium'],
        preferredModelId: 'vercel:moonshotai/kimi-k2.5',
        fallbackModelId: 'vercel:minimax/minimax-m2.7',
      };
      const state = createCostLedgerState();
      const { decision } = selectModel(budget, state, 'tick_1');
      expect(decision.allowed).toBe(false);
    });
  });

  describe('getModelGuardrails', () => {
    it('free tier gets tight guardrails', () => {
      const guardrails = getModelGuardrails('free');
      expect(guardrails.maxActionsPerTick).toBe(1);
      expect(guardrails.requireStructuredPrompt).toBe(true);
      expect(guardrails.maxPromptComplexity).toBe('simple');
      expect(guardrails.requireEvidenceBeforeWrite).toBe(true);
    });

    it('premium tier gets relaxed guardrails', () => {
      const guardrails = getModelGuardrails('premium');
      expect(guardrails.maxActionsPerTick).toBe(2);
      expect(guardrails.requireStructuredPrompt).toBe(false);
      expect(guardrails.maxPromptComplexity).toBe('complex');
    });
  });

  describe('getModelProfile', () => {
    it('returns known profile', () => {
      const profile = getModelProfile('vercel:moonshotai/kimi-k2.5');
      expect(profile.name).toBe('Kimi K2.5');
      expect(profile.tier).toBe('free');
    });

    it('returns premium fallback for unknown model', () => {
      const profile = getModelProfile('unknown:model');
      expect(profile.tier).toBe('premium');
      expect(profile.costPerInvocation).toBe(1.00);
    });
  });

  describe('MODEL_PROFILES', () => {
    it('has profiles for all free models', () => {
      const freeModels = Object.values(MODEL_PROFILES).filter(p => p.tier === 'free');
      expect(freeModels.length).toBeGreaterThanOrEqual(4);
      for (const model of freeModels) {
        expect(model.costPerInvocation).toBe(0);
      }
    });
  });
});
