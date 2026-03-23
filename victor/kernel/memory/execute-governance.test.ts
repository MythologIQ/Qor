/**
 * Execute Governance Tests
 *
 * Tests for the tiered execute mode governance system.
 */

import { describe, it, expect } from 'vitest';
import {
  // Types and constants
  TIER_NAMES,
  TIER_DESCRIPTIONS,
  TIER_AUTHORIZATION,
  TIER_CAPABILITIES,
  TIER_REVOCATION_RULES,
  REVOCATION_TRIGGER_DESCRIPTIONS,
  MAX_TIER,
  MIN_TIER,
  DEFAULT_TIER2_OBSERVATION_WINDOW,
  DEFAULT_TIER3_OBSERVATION_WINDOW,
  DEFAULT_TIER4_OBSERVATION_WINDOW,
  DEFAULT_TIER5_OBSERVATION_WINDOW,
  CONSTITUTIONAL_CONSTRAINTS,
  TIER4_MIN_SELF_CORRECTIONS,
  TIER4_MIN_GOVERNANCE_ACCURACY,
  TIER4_MIN_GOVERNANCE_EVALUATIONS,
  TIER5_MIN_AGENTS_GOVERNED,
  TIER5_MIN_POLICY_MODIFICATIONS,
  TIER5_MIN_CUMULATIVE_HIGH_TIER_TICKS,

  // State management
  createInitialGovernanceState,

  // Evaluation
  evaluatePromotion,
  checkRevocationTriggers,

  // State updates
  recordProductiveTick,
  recordBlockedTick,
  recordSuccessfulAction,
  recordFailedAction,
  promoteTier,
  demoteTier,
  activateTrigger,
  clearTrigger,
  pauseExecuteMode,
  resumeExecuteMode,
  recordSelfCorrection,
  recordGovernanceEvaluation,
  recordAgentGoverned,
  recordPolicyModification,
  markConstitutionalReviewPassed,

  // Queries
  getTierStatusSummary,
  isCapabilityAllowed,
  getPromotionRequirements,

  // Types
  type ExecuteGovernanceState,
} from './execute-governance.js';

describe('Execute Governance', () => {
  describe('Tier Constants', () => {
    it('should define tier names for all 5 tiers', () => {
      expect(TIER_NAMES[1]).toBe('Observer (Tier 1)');
      expect(TIER_NAMES[2]).toBe('Apprentice (Tier 2)');
      expect(TIER_NAMES[3]).toBe('Autonomous (Tier 3)');
      expect(TIER_NAMES[4]).toBe('Governor (Tier 4)');
      expect(TIER_NAMES[5]).toBe('Paladin of Truth (Tier 5)');
    });

    it('should define tier descriptions', () => {
      expect(TIER_DESCRIPTIONS[1]).toContain('Dry-run');
      expect(TIER_DESCRIPTIONS[2]).toContain('Assisted');
      expect(TIER_DESCRIPTIONS[3]).toContain('Autonomous');
      expect(TIER_DESCRIPTIONS[4]).toContain('Governor');
      expect(TIER_DESCRIPTIONS[5]).toContain('Paladin');
    });

    it('should define min/max tiers', () => {
      expect(MIN_TIER).toBe(1);
      expect(MAX_TIER).toBe(5);
    });

    it('should define observation window sizes', () => {
      expect(DEFAULT_TIER2_OBSERVATION_WINDOW).toBe(50);
      expect(DEFAULT_TIER3_OBSERVATION_WINDOW).toBe(100);
      expect(DEFAULT_TIER4_OBSERVATION_WINDOW).toBe(200);
      expect(DEFAULT_TIER5_OBSERVATION_WINDOW).toBe(500);
    });

    it('should define constitutional constraints', () => {
      expect(CONSTITUTIONAL_CONSTRAINTS.length).toBe(5);
      expect(CONSTITUTIONAL_CONSTRAINTS).toContain('Cannot self-promote past Tier 5');
      expect(CONSTITUTIONAL_CONSTRAINTS).toContain('Cannot fabricate or falsify evidence');
    });
  });

  describe('Tier Authorization', () => {
    it('Tier 1 requires explicit user authorization', () => {
      expect(TIER_AUTHORIZATION[1].mode).toBe('explicit_user');
      expect(TIER_AUTHORIZATION[1].requiresUserConfirmation).toBe(true);
    });

    it('Tier 2 requires evidence-gated authorization', () => {
      expect(TIER_AUTHORIZATION[2].mode).toBe('evidence_gated');
      expect(TIER_AUTHORIZATION[2].minObservationTicks).toBe(50);
      expect(TIER_AUTHORIZATION[2].minSuccessfulActions).toBe(10);
      expect(TIER_AUTHORIZATION[2].evidenceThreshold).toBe(0.95);
    });

    it('Tier 3 requires evidence-gated authorization with higher threshold', () => {
      expect(TIER_AUTHORIZATION[3].mode).toBe('evidence_gated');
      expect(TIER_AUTHORIZATION[3].minObservationTicks).toBe(100);
      expect(TIER_AUTHORIZATION[3].minSuccessfulActions).toBe(50);
      expect(TIER_AUTHORIZATION[3].evidenceThreshold).toBe(0.98);
    });

    it('Tier 4 requires 200 ticks and 100 actions', () => {
      expect(TIER_AUTHORIZATION[4].mode).toBe('evidence_gated');
      expect(TIER_AUTHORIZATION[4].minObservationTicks).toBe(200);
      expect(TIER_AUTHORIZATION[4].minSuccessfulActions).toBe(100);
      expect(TIER_AUTHORIZATION[4].evidenceThreshold).toBe(0.99);
    });

    it('Tier 5 requires 500 ticks and 250 actions with perfect evidence', () => {
      expect(TIER_AUTHORIZATION[5].mode).toBe('evidence_gated');
      expect(TIER_AUTHORIZATION[5].minObservationTicks).toBe(500);
      expect(TIER_AUTHORIZATION[5].minSuccessfulActions).toBe(250);
      expect(TIER_AUTHORIZATION[5].evidenceThreshold).toBe(1.0);
    });
  });

  describe('Tier Capabilities', () => {
    it('Tier 1 has no execute capability', () => {
      expect(TIER_CAPABILITIES[1].canExecuteWrites).toBe(false);
      expect(TIER_CAPABILITIES[1].canExecuteWithoutApproval).toBe(false);
      expect(TIER_CAPABILITIES[1].maxActionsPerTick).toBe(0);
    });

    it('Tier 2 can execute with approval', () => {
      expect(TIER_CAPABILITIES[2].canExecuteWrites).toBe(true);
      expect(TIER_CAPABILITIES[2].canExecuteWithoutApproval).toBe(false);
      expect(TIER_CAPABILITIES[2].maxActionsPerTick).toBe(1);
      expect(TIER_CAPABILITIES[2].maxRuntimeMinutes).toBe(30);
    });

    it('Tier 3 has full autonomy within bounds', () => {
      expect(TIER_CAPABILITIES[3].canExecuteWrites).toBe(true);
      expect(TIER_CAPABILITIES[3].canExecuteWithoutApproval).toBe(true);
      expect(TIER_CAPABILITIES[3].maxActionsPerTick).toBe(3);
      expect(TIER_CAPABILITIES[3].canScheduleFuture).toBe(true);
      expect(TIER_CAPABILITIES[3].canCrossProject).toBe(true);
    });

    it('Tier 4 can evaluate agents and modify routing', () => {
      expect(TIER_CAPABILITIES[4].canEvaluateAgents).toBe(true);
      expect(TIER_CAPABILITIES[4].canApproveRejectActions).toBe(true);
      expect(TIER_CAPABILITIES[4].canModifyTaskRouting).toBe(true);
      expect(TIER_CAPABILITIES[4].canAuthorPolicy).toBe(false);
      expect(TIER_CAPABILITIES[4].maxActionsPerTick).toBe(5);
    });

    it('Tier 5 can author policy and serve as trust authority', () => {
      expect(TIER_CAPABILITIES[5].canAuthorPolicy).toBe(true);
      expect(TIER_CAPABILITIES[5].canServeTrustAuthority).toBe(true);
      expect(TIER_CAPABILITIES[5].maxActionsPerTick).toBe(7);
    });

    it('lower tiers cannot evaluate agents or author policy', () => {
      for (const tier of [1, 2, 3] as const) {
        expect(TIER_CAPABILITIES[tier].canEvaluateAgents).toBe(false);
        expect(TIER_CAPABILITIES[tier].canAuthorPolicy).toBe(false);
      }
    });

    it('all tiers require verification packets', () => {
      for (const tier of [1, 2, 3, 4, 5] as const) {
        expect(TIER_CAPABILITIES[tier].requiresVerificationPacket).toBe(true);
      }
    });
  });

  describe('Revocation Rules', () => {
    it('Tier 1 only has user override revocation', () => {
      expect(TIER_REVOCATION_RULES[1]).toHaveLength(1);
      expect(TIER_REVOCATION_RULES[1][0].trigger).toBe('user_override');
    });

    it('Tier 2 has multiple revocation triggers', () => {
      expect(TIER_REVOCATION_RULES[2].length).toBeGreaterThan(1);
      const triggers = TIER_REVOCATION_RULES[2].map((r) => r.trigger);
      expect(triggers).toContain('consecutive_failures');
      expect(triggers).toContain('consecutive_blocked');
      expect(triggers).toContain('user_override');
      expect(triggers).toContain('policy_violation');
    });

    it('Tier 2 demotes to Tier 1 on revocation', () => {
      for (const rule of TIER_REVOCATION_RULES[2]) {
        expect(rule.demoteTo).toBe(1);
      }
    });

    it('Tier 3 has most revocation triggers', () => {
      expect(TIER_REVOCATION_RULES[3].length).toBeGreaterThan(3);
    });

    it('Tier 3 can demote to Tier 2 or Tier 1', () => {
      const demoteTargets = new Set(TIER_REVOCATION_RULES[3].map((r) => r.demoteTo));
      expect(demoteTargets.has(1)).toBe(true);
      expect(demoteTargets.has(2)).toBe(true);
    });

    it('Tier 4 has governance accuracy failure trigger', () => {
      const triggers = TIER_REVOCATION_RULES[4].map((r) => r.trigger);
      expect(triggers).toContain('governance_accuracy_failure');
      expect(triggers).toContain('evidence_fabrication');
      expect(triggers).toContain('cost_governance_bypass');
    });

    it('Tier 5 has constitutional violation trigger', () => {
      const triggers = TIER_REVOCATION_RULES[5].map((r) => r.trigger);
      expect(triggers).toContain('constitutional_violation');
      expect(triggers).toContain('evidence_fabrication');
      expect(triggers).toContain('audit_trail_suppression');
    });

    it('constitutional violations at Tier 5 demote to Tier 3 with immediate halt', () => {
      const rule = TIER_REVOCATION_RULES[5].find((r) => r.trigger === 'constitutional_violation');
      expect(rule).toBeDefined();
      expect(rule!.demoteTo).toBe(3);
      expect(rule!.immediateHalt).toBe(true);
      expect(rule!.requiresReauthorization).toBe(true);
    });
  });

  describe('Revocation Trigger Descriptions', () => {
    it('should have descriptions for all trigger types', () => {
      const triggerTypes = [
        'consecutive_failures',
        'consecutive_blocked',
        'user_override',
        'policy_violation',
        'safety_trigger',
        'drift_detected',
        'verification_failure',
        'governance_accuracy_failure',
        'constitutional_violation',
        'evidence_fabrication',
        'cost_governance_bypass',
        'audit_trail_suppression',
      ];

      for (const type of triggerTypes) {
        expect(REVOCATION_TRIGGER_DESCRIPTIONS[type as keyof typeof REVOCATION_TRIGGER_DESCRIPTIONS]).toBeDefined();
        expect(REVOCATION_TRIGGER_DESCRIPTIONS[type as keyof typeof REVOCATION_TRIGGER_DESCRIPTIONS]).not.toBe('');
      }
    });
  });

  describe('Initial State', () => {
    it('should start at Tier 1', () => {
      const state = createInitialGovernanceState();
      expect(state.currentTier).toBe(1);
    });

    it('should have zero counters initially', () => {
      const state = createInitialGovernanceState();
      expect(state.totalProductiveTicks).toBe(0);
      expect(state.currentTierTicks).toBe(0);
      expect(state.totalSuccessfulActions).toBe(0);
      expect(state.consecutiveBlocked).toBe(0);
      expect(state.consecutiveFailures).toBe(0);
    });

    it('should have empty history initially', () => {
      const state = createInitialGovernanceState();
      expect(state.tierHistory).toHaveLength(0);
      expect(state.activeTriggers).toHaveLength(0);
    });

    it('should not be paused initially', () => {
      const state = createInitialGovernanceState();
      expect(state.isPaused).toBe(false);
    });

    it('should set timestamps', () => {
      const state = createInitialGovernanceState();
      expect(state.tierEnteredAt).toBeDefined();
      expect(state.lastUpdatedAt).toBeDefined();
    });
  });

  describe('Promotion Evaluation', () => {
    it('should not be eligible for promotion at Tier 5 (constitutional cap)', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 5,
        currentTierTicks: 999,
        currentTierSuccessfulActions: 999,
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.targetTier).toBe(5);
      expect(evaluation.missingCriteria[0]).toContain('maximum tier');
    });

    it('should require minimum ticks for Tier 2 promotion', () => {
      const state = createInitialGovernanceState();
      state.currentTierTicks = 10; // Less than 50 required
      state.currentTierSuccessfulActions = 15; // More than 10 required

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.missingCriteria.some((c) => c.includes('50 ticks'))).toBe(true);
    });

    it('should require minimum actions for Tier 2 promotion', () => {
      const state = createInitialGovernanceState();
      state.currentTierTicks = 60; // More than 50 required
      state.currentTierSuccessfulActions = 5; // Less than 10 required

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.missingCriteria.some((c) => c.includes('10 successful'))).toBe(true);
    });

    it('should block promotion with active triggers', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTierTicks: 60,
        currentTierSuccessfulActions: 15,
        activeTriggers: ['consecutive_blocked'],
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.missingCriteria.some((c) => c.includes('Active revocation'))).toBe(true);
      expect(evaluation.confidence).toBeLessThan(0.6);
    });

    it('should be eligible when all criteria met', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTierTicks: 60,
        currentTierSuccessfulActions: 15,
        activeTriggers: [],
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.targetTier).toBe(2);
      expect(evaluation.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Revocation Check', () => {
    it('should trigger on consecutive failures', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
        consecutiveFailures: 2,
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
      expect(check.demoteTo).toBe(1);
      expect(check.firedTriggers.length).toBeGreaterThan(0);
    });

    it('should trigger on consecutive blocked', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
        consecutiveBlocked: 3,
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
    });

    it('should trigger on active revocation triggers', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
        activeTriggers: ['user_override'],
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
      expect(check.immediateHalt).toBe(true);
    });

    it('should not trigger when within thresholds', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
        consecutiveFailures: 1,
        consecutiveBlocked: 2,
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(false);
    });

    it('Tier 3 should have more revocation triggers', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
        activeTriggers: ['drift_detected'],
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
      expect(check.demoteTo).toBe(2);
    });
  });

  describe('State Updates', () => {
    it('should record productive ticks', () => {
      let state = createInitialGovernanceState();
      state = recordProductiveTick(state);

      expect(state.totalProductiveTicks).toBe(1);
      expect(state.currentTierTicks).toBe(1);
      expect(state.consecutiveBlocked).toBe(0);
    });

    it('should record multiple productive ticks', () => {
      let state = createInitialGovernanceState();
      state = recordProductiveTick(state);
      state = recordProductiveTick(state);
      state = recordProductiveTick(state);

      expect(state.totalProductiveTicks).toBe(3);
      expect(state.currentTierTicks).toBe(3);
    });

    it('should record blocked ticks', () => {
      let state = createInitialGovernanceState();
      state = recordBlockedTick(state);

      expect(state.consecutiveBlocked).toBe(1);
    });

    it('should accumulate blocked ticks', () => {
      let state = createInitialGovernanceState();
      state = recordBlockedTick(state);
      state = recordBlockedTick(state);
      state = recordBlockedTick(state);

      expect(state.consecutiveBlocked).toBe(3);
    });

    it('should reset consecutive blocked on productive tick', () => {
      let state = createInitialGovernanceState();
      state = recordBlockedTick(state);
      state = recordBlockedTick(state);
      state = recordProductiveTick(state);

      expect(state.consecutiveBlocked).toBe(0);
    });

    it('should record successful actions', () => {
      let state = createInitialGovernanceState();
      state = recordSuccessfulAction(state);

      expect(state.totalSuccessfulActions).toBe(1);
      expect(state.currentTierSuccessfulActions).toBe(1);
      expect(state.consecutiveFailures).toBe(0);
    });

    it('should record failed actions', () => {
      let state = createInitialGovernanceState();
      state = recordFailedAction(state);

      expect(state.consecutiveFailures).toBe(1);
    });

    it('should accumulate consecutive failures', () => {
      let state = createInitialGovernanceState();
      state = recordFailedAction(state);
      state = recordFailedAction(state);
      state = recordFailedAction(state);

      expect(state.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on success', () => {
      let state = createInitialGovernanceState();
      state = recordFailedAction(state);
      state = recordFailedAction(state);
      state = recordSuccessfulAction(state);

      expect(state.consecutiveFailures).toBe(0);
    });

    it('should update lastUpdatedAt on state changes', () => {
      const before = Date.now();
      let state = createInitialGovernanceState();
      const after = Date.now();

      const updatedAt = new Date(state.lastUpdatedAt).getTime();
      expect(updatedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(updatedAt).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('Tier Promotion', () => {
    it('should promote from Tier 1 to Tier 2', () => {
      let state = createInitialGovernanceState();
      state = promoteTier(state);

      expect(state.currentTier).toBe(2);
      expect(state.currentTierTicks).toBe(0);
      expect(state.currentTierSuccessfulActions).toBe(0);
    });

    it('should promote from Tier 2 to Tier 3', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
      };
      state = promoteTier(state);

      expect(state.currentTier).toBe(3);
    });

    it('should record promotion in history', () => {
      let state = createInitialGovernanceState();
      state = promoteTier(state);

      expect(state.tierHistory).toHaveLength(1);
      expect(state.tierHistory[0].from).toBe(1);
      expect(state.tierHistory[0].to).toBe(2);
      expect(state.tierHistory[0].reason).toBe('promotion');
    });

    it('should update tier entered timestamp', () => {
      let state = createInitialGovernanceState();
      const beforeTierAt = state.tierEnteredAt;

      // Wait a tick to ensure timestamp changes
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Busy wait for 10ms
      }

      state = promoteTier(state);
      expect(state.tierEnteredAt).not.toBe(beforeTierAt);
    });

    it('should reset active triggers on promotion', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        activeTriggers: ['consecutive_blocked'],
      };
      state = promoteTier(state);

      expect(state.activeTriggers).toHaveLength(0);
    });
  });

  describe('Tier Demotion', () => {
    it('should demote from Tier 2 to Tier 1', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
      };
      state = demoteTier(state, 1, 'consecutive_failures');

      expect(state.currentTier).toBe(1);
    });

    it('should demote from Tier 3 to Tier 2', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
      };
      state = demoteTier(state, 2, 'drift_detected');

      expect(state.currentTier).toBe(2);
    });

    it('should record demotion in history with trigger', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
      };
      state = demoteTier(state, 1, 'consecutive_failures');

      expect(state.tierHistory).toHaveLength(1);
      expect(state.tierHistory[0].from).toBe(2);
      expect(state.tierHistory[0].to).toBe(1);
      expect(state.tierHistory[0].reason).toBe('demotion');
      expect(state.tierHistory[0].trigger).toBe('consecutive_failures');
    });

    it('should clear the trigger that caused demotion', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
        activeTriggers: ['consecutive_failures', 'consecutive_blocked'],
      };
      state = demoteTier(state, 1, 'consecutive_failures');

      expect(state.activeTriggers).toContain('consecutive_blocked');
      expect(state.activeTriggers).not.toContain('consecutive_failures');
    });
  });

  describe('Trigger Management', () => {
    it('should activate triggers', () => {
      let state = createInitialGovernanceState();
      state = activateTrigger(state, 'consecutive_blocked');

      expect(state.activeTriggers).toContain('consecutive_blocked');
    });

    it('should not duplicate active triggers', () => {
      let state = createInitialGovernanceState();
      state = activateTrigger(state, 'consecutive_blocked');
      state = activateTrigger(state, 'consecutive_blocked');

      expect(state.activeTriggers).toHaveLength(1);
    });

    it('should clear triggers', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        activeTriggers: ['consecutive_blocked', 'consecutive_failures'],
      };
      state = clearTrigger(state, 'consecutive_blocked');

      expect(state.activeTriggers).not.toContain('consecutive_blocked');
      expect(state.activeTriggers).toContain('consecutive_failures');
    });

    it('should handle clearing non-existent triggers', () => {
      let state = createInitialGovernanceState();
      state = clearTrigger(state, 'consecutive_blocked');

      expect(state.activeTriggers).toHaveLength(0);
    });
  });

  describe('Pause/Resume', () => {
    it('should pause execute mode', () => {
      let state = createInitialGovernanceState();
      state = pauseExecuteMode(state);

      expect(state.isPaused).toBe(true);
    });

    it('should resume execute mode', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        isPaused: true,
      };
      state = resumeExecuteMode(state);

      expect(state.isPaused).toBe(false);
    });
  });

  describe('Status Queries', () => {
    it('should generate tier status summary', () => {
      const state = createInitialGovernanceState();
      const summary = getTierStatusSummary(state);

      expect(summary).toContain('Observer (Tier 1)');
      expect(summary).toContain('ACTIVE');
      expect(summary).toContain('Total Productive Ticks: 0');
    });

    it('should show paused status', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        isPaused: true,
      };
      const summary = getTierStatusSummary(state);

      expect(summary).toContain('PAUSED');
    });

    it('should show active triggers in summary', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        activeTriggers: ['consecutive_blocked'],
      };
      const summary = getTierStatusSummary(state);

      expect(summary).toContain('Active Revocation Triggers');
      expect(summary).toContain('Too many consecutive blocked ticks');
    });

    it('should show tier history', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
        tierHistory: [
          {
            from: 1,
            to: 2,
            timestamp: new Date().toISOString(),
            reason: 'promotion',
          },
        ],
      };
      const summary = getTierStatusSummary(state);

      expect(summary).toContain('Tier History');
      expect(summary).toContain('1 → 2');
    });

    it('should check capability permissions', () => {
      const state = createInitialGovernanceState();

      expect(isCapabilityAllowed(state, 'canExecuteWrites')).toBe(false);
      expect(isCapabilityAllowed(state, 'requiresVerificationPacket')).toBe(true);
    });

    it('should report capability allowed at Tier 2', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 2,
      };

      expect(isCapabilityAllowed(state, 'canExecuteWrites')).toBe(true);
      expect(isCapabilityAllowed(state, 'canExecuteWithoutApproval')).toBe(false);
    });

    it('should report promotion requirements', () => {
      const state = createInitialGovernanceState();
      const requirements = getPromotionRequirements(state);

      expect(requirements).not.toBeNull();
      expect(requirements!.ticksRemaining).toBe(50);
      expect(requirements!.actionsRemaining).toBe(10);
    });

    it('should report partial progress toward requirements', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTierTicks: 30,
        currentTierSuccessfulActions: 5,
      };
      const requirements = getPromotionRequirements(state);

      expect(requirements!.ticksRemaining).toBe(20);
      expect(requirements!.actionsRemaining).toBe(5);
    });

    it('should return Tier 4 promotion requirements from Tier 3', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
      };
      const requirements = getPromotionRequirements(state);

      expect(requirements).not.toBeNull();
      expect(requirements!.ticksRemaining).toBe(200);
      expect(requirements!.actionsRemaining).toBe(100);
      expect(requirements!.selfCorrectionsRemaining).toBe(TIER4_MIN_SELF_CORRECTIONS);
      expect(requirements!.governanceEvaluationsRemaining).toBe(TIER4_MIN_GOVERNANCE_EVALUATIONS);
      expect(requirements!.governanceAccuracyMet).toBe(false);
    });

    it('should return null for Tier 5 promotion requirements', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 5,
      };
      const requirements = getPromotionRequirements(state);

      expect(requirements).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state updates', () => {
      let state = createInitialGovernanceState();

      for (let i = 0; i < 100; i++) {
        state = recordProductiveTick(state);
        if (i % 3 === 0) {
          state = recordSuccessfulAction(state);
        }
      }

      expect(state.totalProductiveTicks).toBe(100);
      expect(state.totalSuccessfulActions).toBe(34); // floor(100/3) + 1
    });

    it('should maintain state immutability', () => {
      const original = createInitialGovernanceState();
      const updated = recordProductiveTick(original);

      expect(original.totalProductiveTicks).toBe(0);
      expect(updated.totalProductiveTicks).toBe(1);
    });

    it('should handle all revocation trigger types', () => {
      const allTriggers: Array<import('./execute-governance.js').RevocationTriggerType> = [
        'consecutive_failures',
        'consecutive_blocked',
        'user_override',
        'policy_violation',
        'safety_trigger',
        'drift_detected',
        'verification_failure',
        'governance_accuracy_failure',
        'constitutional_violation',
        'evidence_fabrication',
        'cost_governance_bypass',
        'audit_trail_suppression',
      ];

      for (const trigger of allTriggers) {
        let state = createInitialGovernanceState();
        state = activateTrigger(state, trigger);
        expect(state.activeTriggers).toContain(trigger);
      }
    });

    it('should correctly identify Tier 3 capabilities', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
      };

      expect(isCapabilityAllowed(state, 'canExecuteWrites')).toBe(true);
      expect(isCapabilityAllowed(state, 'canExecuteWithoutApproval')).toBe(true);
      expect(isCapabilityAllowed(state, 'canScheduleFuture')).toBe(true);
      expect(isCapabilityAllowed(state, 'canCrossProject')).toBe(true);
      expect(isCapabilityAllowed(state, 'requiresVerificationPacket')).toBe(true);
    });
  });

  describe('Governor (Tier 4) Tracking', () => {
    it('should record self-corrections', () => {
      let state = createInitialGovernanceState();
      state = recordSelfCorrection(state);
      state = recordSelfCorrection(state);
      expect(state.selfCorrectionCount).toBe(2);
    });

    it('should track governance evaluation accuracy', () => {
      let state = createInitialGovernanceState();
      state = recordGovernanceEvaluation(state, true);
      state = recordGovernanceEvaluation(state, true);
      state = recordGovernanceEvaluation(state, false);
      expect(state.governanceEvaluationCount).toBe(3);
      expect(state.governanceAccuracy).toBeCloseTo(2 / 3);
    });

    it('should record agents governed', () => {
      let state = createInitialGovernanceState();
      state = recordAgentGoverned(state);
      expect(state.agentsGoverned).toBe(1);
    });

    it('should accumulate high-tier ticks at Tier 3+', () => {
      let state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
      };
      state = recordProductiveTick(state);
      state = recordProductiveTick(state);
      expect(state.cumulativeHighTierTicks).toBe(2);
    });

    it('should not accumulate high-tier ticks at Tier 1-2', () => {
      let state = createInitialGovernanceState();
      state = recordProductiveTick(state);
      expect(state.cumulativeHighTierTicks).toBe(0);
    });

    it('should require self-correction and governance accuracy for Tier 4 promotion', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
        currentTierTicks: 200,
        currentTierSuccessfulActions: 100,
        selfCorrectionCount: 0,
        governanceEvaluationCount: 0,
        governanceAccuracy: 0,
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.missingCriteria.some(c => c.includes('self-correction'))).toBe(true);
      expect(evaluation.missingCriteria.some(c => c.includes('governance evaluations'))).toBe(true);
    });

    it('should allow Tier 4 promotion when all criteria met', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 3,
        currentTierTicks: 200,
        currentTierSuccessfulActions: 100,
        selfCorrectionCount: 10,
        governanceEvaluationCount: 25,
        governanceAccuracy: 0.96,
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.targetTier).toBe(4);
    });

    it('should fire governance accuracy failure revocation at Tier 4', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 4,
        activeTriggers: ['governance_accuracy_failure'],
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
      expect(check.demoteTo).toBe(3);
    });
  });

  describe('Paladin of Truth (Tier 5)', () => {
    it('should record policy modifications', () => {
      let state = createInitialGovernanceState();
      state = recordPolicyModification(state);
      expect(state.policyModificationsAuthored).toBe(1);
    });

    it('should mark constitutional review passed', () => {
      let state = createInitialGovernanceState();
      expect(state.constitutionalReviewPassed).toBe(false);
      state = markConstitutionalReviewPassed(state);
      expect(state.constitutionalReviewPassed).toBe(true);
    });

    it('should require all criteria for Tier 5 promotion', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 4,
        currentTierTicks: 500,
        currentTierSuccessfulActions: 250,
        selfCorrectionCount: 20,
        governanceEvaluationCount: 50,
        governanceAccuracy: 0.97,
        agentsGoverned: 1,
        policyModificationsAuthored: 0,
        constitutionalReviewPassed: false,
        cumulativeHighTierTicks: 300,
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.missingCriteria.some(c => c.includes('agents governed'))).toBe(true);
      expect(evaluation.missingCriteria.some(c => c.includes('policy modification'))).toBe(true);
      expect(evaluation.missingCriteria.some(c => c.includes('Constitutional review'))).toBe(true);
      expect(evaluation.missingCriteria.some(c => c.includes('cumulative'))).toBe(true);
    });

    it('should allow Tier 5 promotion when all criteria met', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 4,
        currentTierTicks: 500,
        currentTierSuccessfulActions: 250,
        selfCorrectionCount: 20,
        governanceEvaluationCount: 50,
        governanceAccuracy: 0.97,
        agentsGoverned: 3,
        policyModificationsAuthored: 2,
        constitutionalReviewPassed: true,
        cumulativeHighTierTicks: 600,
      };

      const evaluation = evaluatePromotion(state);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.targetTier).toBe(5);
    });

    it('should fire constitutional violation at Tier 5', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 5,
        activeTriggers: ['constitutional_violation'],
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
      expect(check.demoteTo).toBe(3);
      expect(check.immediateHalt).toBe(true);
    });

    it('should fire evidence fabrication at Tier 5 and demote to Tier 1', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 5,
        activeTriggers: ['evidence_fabrication'],
      };

      const check = checkRevocationTriggers(state);
      expect(check.shouldRevoke).toBe(true);
      expect(check.demoteTo).toBe(1);
      expect(check.immediateHalt).toBe(true);
    });

    it('should promote through full tier progression', () => {
      let state = createInitialGovernanceState();
      state = promoteTier(state); // 1 → 2
      expect(state.currentTier).toBe(2);
      state = promoteTier(state); // 2 → 3
      expect(state.currentTier).toBe(3);
      state = promoteTier(state); // 3 → 4
      expect(state.currentTier).toBe(4);
      state = promoteTier(state); // 4 → 5
      expect(state.currentTier).toBe(5);

      expect(state.tierHistory).toHaveLength(4);
      expect(state.tierHistory[3].from).toBe(4);
      expect(state.tierHistory[3].to).toBe(5);
    });

    it('should get Tier 5 promotion requirements from Tier 4', () => {
      const state: ExecuteGovernanceState = {
        ...createInitialGovernanceState(),
        currentTier: 4,
        agentsGoverned: 1,
        policyModificationsAuthored: 0,
        cumulativeHighTierTicks: 200,
      };
      const reqs = getPromotionRequirements(state);

      expect(reqs).not.toBeNull();
      expect(reqs!.agentsGovernedRemaining).toBe(1);
      expect(reqs!.policyModificationsRemaining).toBe(1);
      expect(reqs!.constitutionalReviewPassed).toBe(false);
      expect(reqs!.cumulativeHighTierTicksRemaining).toBe(300);
    });
  });
});
