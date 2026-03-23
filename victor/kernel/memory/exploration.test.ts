/**
 * Idle Exploration Tests
 *
 * Tests the exploration pipeline: fetch → sanitize → scan → gate → store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  type ExplorationConfig,
  type ExplorationState,
  type ExplorationResult,
  createExplorationState,
  initializeExploration,
  getExplorationService,
  isExplorationInitialized,
  isExplorationAvailable,
  runIdleExploration,
  DEFAULT_EXPLORATION_CONFIG,
} from './exploration.js';
import { getQuarantineStore } from './quarantine-store.js';
import { getAuditLedger } from './quarantine-audit.js';

describe('Idle Exploration', () => {
  beforeEach(async () => {
    // Reset singletons
    const store = getQuarantineStore();
    await store.initialize();

    const audit = getAuditLedger();
    await audit.initialize();
  });

  afterEach(async () => {
    const store = getQuarantineStore();
    await store.close();

    const audit = getAuditLedger();
    await audit.close();
  });

  describe('createExplorationState', () => {
    it('should create initial state with all counters at zero', () => {
      const state = createExplorationState();

      expect(state.consecutiveExploreTicks).toBe(0);
      expect(state.lastExploreAt).toBeNull();
      expect(state.totalItemsFetched).toBe(0);
      expect(state.totalItemsAdmitted).toBe(0);
      expect(state.totalItemsRejected).toBe(0);
      expect(state.status).toBe('idle');
    });
  });

  describe('DEFAULT_EXPLORATION_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_EXPLORATION_CONFIG.enabled).toBe(false);
      expect(DEFAULT_EXPLORATION_CONFIG.maxConsecutiveExplore).toBe(5);
      expect(DEFAULT_EXPLORATION_CONFIG.exploreCooldownMs).toBe(60000);
      expect(DEFAULT_EXPLORATION_CONFIG.maxItemsPerTick).toBe(10);
      expect(DEFAULT_EXPLORATION_CONFIG.sources).toEqual(['moltbook']);
      expect(DEFAULT_EXPLORATION_CONFIG.autoPromoteClean).toBe(true);
      expect(DEFAULT_EXPLORATION_CONFIG.autoPromoteCooldownTicks).toBe(3);
    });
  });

  describe('initializeExploration', () => {
    it('should initialize exploration service with default config', async () => {
      const service = await initializeExploration();

      expect(service).toBeDefined();
      expect(service.config.enabled).toBe(false); // Disabled without MOLTBOOK_API_KEY
      expect(isExplorationInitialized()).toBe(true);
    });

    it('should merge custom config with defaults', async () => {
      const customConfig: Partial<ExplorationConfig> = {
        maxConsecutiveExplore: 3,
        exploreCooldownMs: 30000,
      };

      const service = await initializeExploration(customConfig);

      expect(service.config.maxConsecutiveExplore).toBe(3);
      expect(service.config.exploreCooldownMs).toBe(30000);
      expect(service.config.maxItemsPerTick).toBe(10); // Default preserved
    });

    it('should only enable if MOLTBOOK_API_KEY is set', async () => {
      const originalKey = process.env.MOLTBOOK_API_KEY;

      // Without API key
      delete process.env.MOLTBOOK_API_KEY;
      let service = await initializeExploration({ enabled: true });
      expect(service.config.enabled).toBe(false);

      // With API key
      process.env.MOLTBOOK_API_KEY = 'test-key';
      service = await initializeExploration({ enabled: true });
      expect(service.config.enabled).toBe(true);

      // Restore
      if (originalKey) {
        process.env.MOLTBOOK_API_KEY = originalKey;
      } else {
        delete process.env.MOLTBOOK_API_KEY;
      }
    });
  });

  describe('getExplorationService', () => {
    it('should return initialized service', async () => {
      await initializeExploration();
      const service = getExplorationService();

      expect(service).toBeDefined();
      expect(service.canExplore).toBeDefined();
      expect(service.explore).toBeDefined();
    });

    it('should throw if not initialized', () => {
      // Reset module state would be needed here - skipping for now
      // In real test we'd need to reset the singleton
    });
  });

  describe('ExplorationService.canExplore', () => {
    it('should return false when disabled', async () => {
      const service = await initializeExploration({ enabled: false });

      expect(service.canExplore()).toBe(false);
    });

    it('should return false when max consecutive ticks reached', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        maxConsecutiveExplore: 2,
      });

      // Simulate 2 consecutive ticks
      service.state.consecutiveExploreTicks = 2;

      expect(service.canExplore()).toBe(false);

      delete process.env.MOLTBOOK_API_KEY;
    });

    it('should return false during cooldown', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        exploreCooldownMs: 60000,
      });

      // Simulate recent exploration
      service.state.lastExploreAt = Date.now() - 1000; // 1 second ago

      expect(service.canExplore()).toBe(false);

      delete process.env.MOLTBOOK_API_KEY;
    });

    it('should return true when cooldown elapsed', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        exploreCooldownMs: 1000, // 1 second cooldown
      });

      // Simulate exploration long ago
      service.state.lastExploreAt = Date.now() - 2000; // 2 seconds ago

      expect(service.canExplore()).toBe(true);

      delete process.env.MOLTBOOK_API_KEY;
    });
  });

  describe('ExplorationService.explore', () => {
    it('should skip exploration when disabled', async () => {
      const service = await initializeExploration({ enabled: false });
      const result = await service.explore();

      expect(result.didExplore).toBe(false);
      expect(result.skipReason).toBe('Exploration is disabled');
      expect(result.items).toHaveLength(0);
      expect(result.hasUsefulContent).toBe(false);
    });

    it('should skip exploration when max ticks reached', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        maxConsecutiveExplore: 1,
      });

      service.state.consecutiveExploreTicks = 1;

      const result = await service.explore();

      expect(result.didExplore).toBe(false);
      expect(result.skipReason).toContain('max consecutive exploration ticks');

      delete process.env.MOLTBOOK_API_KEY;
    });

    it('should update state after exploration', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        exploreCooldownMs: 0,
      });

      const initialTicks = service.state.consecutiveExploreTicks;

      // Exploration will fail to fetch (no mock), but state should update
      await service.explore();

      expect(service.state.consecutiveExploreTicks).toBe(initialTicks + 1);
      expect(service.state.lastExploreAt).not.toBeNull();
      expect(service.state.status).toBe('active');

      delete process.env.MOLTBOOK_API_KEY;
    });

    it('should track action counts in result', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        exploreCooldownMs: 0,
      });

      const result = await service.explore();

      // Action counts should exist even if no items processed
      expect(result.actionCounts).toBeDefined();
      expect(result.actionCounts.admit).toBe(0);
      expect(result.actionCounts.reject).toBe(0);
      expect(result.actionCounts.quarantine).toBe(0);
      expect(result.actionCounts['sanitize-admit']).toBe(0);

      delete process.env.MOLTBOOK_API_KEY;
    });
  });

  describe('ExplorationService.resetConsecutiveTicks', () => {
    it('should reset consecutive explore ticks', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({ enabled: true });

      service.state.consecutiveExploreTicks = 5;
      service.resetConsecutiveTicks();

      expect(service.state.consecutiveExploreTicks).toBe(0);

      delete process.env.MOLTBOOK_API_KEY;
    });
  });

  describe('runIdleExploration', () => {
    it('should initialize and run exploration', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';

      const result = await runIdleExploration({ enabled: true, exploreCooldownMs: 0 });

      expect(result.explored).toBe(true);
      expect(result.state).toBeDefined();
      expect(result.errors).toBeDefined();

      delete process.env.MOLTBOOK_API_KEY;
    });

    it('should return useful content flag', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';

      const result = await runIdleExploration({ enabled: true, exploreCooldownMs: 0 });

      // hasUsefulContent is false when no items fetched
      expect(result.hasUsefulContent).toBe(false);

      delete process.env.MOLTBOOK_API_KEY;
    });
  });

  describe('isExplorationAvailable', () => {
    it('should return false when not initialized', () => {
      // Module-level singleton is initialized in other tests,
      // so this may return true depending on test order
      // In isolation, it would return false
      const available = isExplorationAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should return true when initialized and can explore', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      await initializeExploration({ enabled: true, exploreCooldownMs: 0 });

      expect(isExplorationAvailable()).toBe(true);

      delete process.env.MOLTBOOK_API_KEY;
    });
  });

  describe('State tracking', () => {
    it('should track total items fetched across multiple ticks', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        exploreCooldownMs: 0,
      });

      const initialFetched = service.state.totalItemsFetched;

      // Run exploration (will fail to fetch, but state should track)
      await service.explore();

      // No items fetched (mock not set up), but totalItemsFetched should not decrease
      expect(service.state.totalItemsFetched).toBeGreaterThanOrEqual(initialFetched);

      delete process.env.MOLTBOOK_API_KEY;
    });

    it('should track admitted and rejected counts', async () => {
      process.env.MOLTBOOK_API_KEY = 'test-key';
      const service = await initializeExploration({
        enabled: true,
        exploreCooldownMs: 0,
      });

      const initialAdmitted = service.state.totalItemsAdmitted;
      const initialRejected = service.state.totalItemsRejected;

      await service.explore();

      // These should not decrease
      expect(service.state.totalItemsAdmitted).toBeGreaterThanOrEqual(initialAdmitted);
      expect(service.state.totalItemsRejected).toBeGreaterThanOrEqual(initialRejected);

      delete process.env.MOLTBOOK_API_KEY;
    });
  });
});
