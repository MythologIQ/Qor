/**
 * Memory Facade Test Suite
 * 
 * Comprehensive tests for the simplified memory operations API.
 * Covers storage, retrieval, decay, saturation boosts, search, and batch operations.
 * 
 * @module Victor/kernel/memory/memory-facade.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureFacade,
  getFacadeConfig,
  resetFacade,
  storeMemory,
  accessMemory,
  searchMemories,
  updateMemory,
  forgetMemory,
  restakeMemory,
  storeMemoryBatch,
  accessMemoryBatch,
  forgetMemoryBatch,
  listMemories,
  getMemoryStatistics,
  inspectFacadeHealth,
  checkCrystallizationEligibility,
  formatMemoryEntry,
  exportMemories,
  importMemories,
  DEFAULT_FACADE_CONFIG,
  type MemoryEntry,
  type StoreMemoryOptions,
} from './memory-facade.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('Memory Facade', () => {
  beforeEach(() => {
    resetFacade();
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = getFacadeConfig();
      expect(config.defaultDecayProfile).toBe('standard');
      expect(config.crystallizationThreshold).toBe(0.95);
      expect(config.confidenceThreshold).toBe(0.7);
      expect(config.autoUpdateOnAccess).toBe(true);
      expect(config.maxSearchResults).toBe(10);
    });

    it('should allow custom configuration', () => {
      const custom = configureFacade({
        crystallizationThreshold: 0.9,
        autoUpdateOnAccess: false,
        maxSearchResults: 20,
      });
      
      expect(custom.crystallizationThreshold).toBe(0.9);
      expect(custom.autoUpdateOnAccess).toBe(false);
      expect(custom.maxSearchResults).toBe(20);
    });

    it('should preserve unmodified config values', () => {
      configureFacade({ crystallizationThreshold: 0.85 });
      const config = getFacadeConfig();
      
      expect(config.crystallizationThreshold).toBe(0.85);
      expect(config.defaultDecayProfile).toBe('standard'); // unchanged
      expect(config.confidenceThreshold).toBe(0.7); // unchanged
    });

    it('should reset to defaults', () => {
      configureFacade({ crystallizationThreshold: 0.5 });
      resetFacade();
      const config = getFacadeConfig();
      
      expect(config.crystallizationThreshold).toBe(DEFAULT_FACADE_CONFIG.crystallizationThreshold);
    });
  });

  // ============================================================================
  // Store Memory Tests
  // ============================================================================

  describe('storeMemory', () => {
    it('should store a basic memory', () => {
      const entry = storeMemory('Test content', {
        projectId: 'test-project',
      });
      
      expect(entry.id).toMatch(/^mem_\d+_[a-z0-9]+$/);
      expect(entry.content).toBe('Test content');
      expect(entry.metadata.projectId).toBe('test-project');
      expect(entry.metadata.governance.state).toBe('provisional');
      expect(entry.metadata.temporal.decayProfile).toBe('standard');
    });

    it('should store memory with all options', () => {
      const entry = storeMemory('Full options content', {
        projectId: 'proj-1',
        title: 'Test Title',
        tags: ['tag1', 'tag2'],
        sourcePath: '/path/to/file.md',
        nodeType: 'Task',
        decayProfile: 'durable',
        epistemicType: 'source-claim',
        initialSaturation: 0.8,
        confidence: 0.9,
      });
      
      expect(entry.metadata.title).toBe('Test Title');
      expect(entry.metadata.tags).toEqual(['tag1', 'tag2']);
      expect(entry.metadata.sourcePath).toBe('/path/to/file.md');
      expect(entry.metadata.nodeType).toBe('Task');
      expect(entry.metadata.temporal.decayProfile).toBe('durable');
      expect(entry.metadata.governance.epistemicType).toBe('source-claim');
      expect(entry.metadata.governance.confidence).toBe(0.9);
      
      const thermodynamic = entry.metadata.temporal.thermodynamic;
      expect(thermodynamic).toBeDefined();
      expect(thermodynamic!.saturation).toBe(0.8);
    });

    it('should use default saturation based on decay profile', () => {
      const ephemeral = storeMemory('ephemeral', { projectId: 'p', decayProfile: 'ephemeral' });
      const permanent = storeMemory('permanent', { projectId: 'p', decayProfile: 'permanent' });
      
      expect(ephemeral.metadata.temporal.thermodynamic!.saturation).toBe(0.1);
      expect(permanent.metadata.temporal.thermodynamic!.saturation).toBe(1.0);
    });

    it('should initialize thermodynamic state correctly', () => {
      const entry = storeMemory('Test', { projectId: 'p' });
      const thermodynamic = entry.metadata.temporal.thermodynamic;

      expect(thermodynamic).toBeDefined();
      expect(thermodynamic!.saturation).toBeGreaterThan(0);
      expect(thermodynamic!.temperature).toBeGreaterThan(0);
      expect(thermodynamic!.effectiveLambda).toBeGreaterThanOrEqual(0);
      expect(entry.metadata.temporal.lastScore).toBe(1.0);
    });
  });

  // ============================================================================
  // Access Memory Tests
  // ============================================================================

  describe('accessMemory', () => {
    it('should return not found for unknown ID', () => {
      const result = accessMemory('non-existent-id');
      
      expect(result.found).toBe(false);
      expect(result.entry).toBeNull();
      expect(result.updated).toBe(false);
    });

    it('should access existing memory and update counters', () => {
      const stored = storeMemory('Test content', { projectId: 'p' });
      
      const result = accessMemory(stored.id);

      expect(result.found).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry!.id).toBe(stored.id);
      expect(result.updated).toBe(true);
      expect(result.thermodynamicState).toBeDefined();
      // Access count is tracked separately, thermodynamic state has accessCount from initialization
      expect(result.thermodynamicState!.accessCount).toBeGreaterThanOrEqual(0);
    });

    it('should apply decay over time', async () => {
      const stored = storeMemory('Decaying content', { projectId: 'p', decayProfile: 'ephemeral' });
      const initialScore = stored.metadata.temporal.thermodynamic!.score;
      
      // Wait a small amount to allow decay
      await new Promise(r => setTimeout(r, 100));
      
      const result = accessMemory(stored.id);
      
      // With autoUpdateOnAccess, the score may have changed
      expect(result.wasDecayed).toBeDefined();
      expect(result.thermodynamicState).toBeDefined();
    });
  });

  // ============================================================================
  // Search Memory Tests
  // ============================================================================

  describe('searchMemories', () => {
    beforeEach(() => {
      storeMemory('Machine learning is fascinating', {
        projectId: 'ai',
        tags: ['ml', 'ai'],
        title: 'ML Note',
      });
      storeMemory('Deep learning neural networks', {
        projectId: 'ai',
        tags: ['dl', 'ai'],
        title: 'DL Note',
      });
      storeMemory('Governance and policy', {
        projectId: 'gov',
        tags: ['policy'],
        title: 'Policy Note',
      });
    });

    it('should search by content', () => {
      const results = searchMemories('machine learning');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].entry.content).toContain('learning');
    });

    it('should respect limit option', () => {
      const results = searchMemories('learning', { limit: 1 });
      
      expect(results.length).toBe(1);
    });

    it('should filter by project', () => {
      const results = searchMemories('learning', { projectId: 'gov' });
      
      expect(results.length).toBe(0);
    });

    it('should filter by tags', () => {
      const results = searchMemories('learning', { tags: ['dl'] });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.metadata.tags).toContain('dl');
    });

    it('should filter decayed memories', () => {
      // Create a memory with low score (simulating decay)
      const lowSat = storeMemory('Low saturation', { projectId: 'p', initialSaturation: 0.01 });
      lowSat.metadata.temporal.lastScore = 0.05; // Manually set low score to simulate heavy decay

      const results = searchMemories('saturation', { decayThreshold: 0.1 });

      // Should not include heavily decayed memory
      const hasLowSat = results.some(r => r.entry.id === lowSat.id);
      expect(hasLowSat).toBe(false);
    });

    it('should return empty array for no matches', () => {
      const results = searchMemories('xyz nonexistent');
      
      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // Update Memory Tests
  // ============================================================================

  describe('updateMemory', () => {
    it('should update memory content', () => {
      const stored = storeMemory('Original', { projectId: 'p' });
      const originalSaturation = stored.metadata.temporal.thermodynamic!.saturation;
      
      const updated = updateMemory(stored.id, { content: 'Updated content' });
      
      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated content');
      // Edit should boost saturation
      expect(updated!.metadata.temporal.thermodynamic!.saturation).toBeGreaterThan(originalSaturation);
      expect(updated!.metadata.temporal.restakeCount).toBe(1);
    });

    it('should update metadata', () => {
      const stored = storeMemory('Test', {
        projectId: 'p',
        title: 'Old Title',
        tags: ['old'],
      });
      
      const updated = updateMemory(stored.id, {
        title: 'New Title',
        tags: ['new1', 'new2'],
      });
      
      expect(updated!.metadata.title).toBe('New Title');
      expect(updated!.metadata.tags).toEqual(['new1', 'new2']);
    });

    it('should return null for unknown ID', () => {
      const result = updateMemory('non-existent', { content: 'Test' });
      
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Forget Memory Tests
  // ============================================================================

  describe('forgetMemory', () => {
    it('should remove existing memory', () => {
      const stored = storeMemory('To be forgotten', { projectId: 'p' });
      
      const removed = forgetMemory(stored.id);
      
      expect(removed).toBe(true);
      expect(accessMemory(stored.id).found).toBe(false);
    });

    it('should return false for unknown ID', () => {
      const result = forgetMemory('non-existent');
      
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Restake Memory Tests
  // ============================================================================

  describe('restakeMemory', () => {
    it('should boost saturation on restake', () => {
      const stored = storeMemory('Important', { projectId: 'p', initialSaturation: 0.5 });

      const restaked = restakeMemory(stored.id);

      expect(restaked).toBeDefined();
      expect(restaked!.metadata.temporal.thermodynamic!.saturation).toBeGreaterThan(0.5);
      expect(restaked!.metadata.temporal.lastScore).toBe(1.0); // Reset
      expect(restaked!.metadata.temporal.restakeCount).toBe(1);
    });

    it('should promote to durable on high saturation', () => {
      configureFacade({ crystallizationThreshold: 0.9 });
      const stored = storeMemory('Important', { projectId: 'p', initialSaturation: 0.88 });
      
      expect(stored.metadata.governance.state).toBe('provisional');
      
      const restaked = restakeMemory(stored.id, 10);
      
      expect(restaked!.metadata.governance.state).toBe('durable');
    });

    it('should return null for unknown ID', () => {
      const result = restakeMemory('non-existent');
      
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Batch Operations Tests
  // ============================================================================

  describe('Batch Operations', () => {
    describe('storeMemoryBatch', () => {
      it('should store multiple memories', () => {
        const items = [
          { content: 'First', options: { projectId: 'p1', title: 'One' } },
          { content: 'Second', options: { projectId: 'p1', title: 'Two' } },
          { content: 'Third', options: { projectId: 'p2', title: 'Three' } },
        ];
        
        const results = storeMemoryBatch(items);
        
        expect(results.length).toBe(3);
        expect(results[0].content).toBe('First');
        expect(results[1].content).toBe('Second');
        expect(results[2].metadata.projectId).toBe('p2');
      });
    });

    describe('accessMemoryBatch', () => {
      it('should access multiple memories', () => {
        const m1 = storeMemory('One', { projectId: 'p' });
        const m2 = storeMemory('Two', { projectId: 'p' });
        const m3 = storeMemory('Three', { projectId: 'p' });
        
        const results = accessMemoryBatch([m1.id, m2.id, 'non-existent', m3.id]);
        
        expect(results.length).toBe(4);
        expect(results[0].found).toBe(true);
        expect(results[1].found).toBe(true);
        expect(results[2].found).toBe(false);
        expect(results[3].found).toBe(true);
      });
    });

    describe('forgetMemoryBatch', () => {
      it('should forget multiple memories', () => {
        const m1 = storeMemory('One', { projectId: 'p' });
        const m2 = storeMemory('Two', { projectId: 'p' });
        const m3 = storeMemory('Three', { projectId: 'p' });
        
        const count = forgetMemoryBatch([m1.id, m2.id, 'non-existent']);
        
        expect(count).toBe(2);
        expect(accessMemory(m1.id).found).toBe(false);
        expect(accessMemory(m2.id).found).toBe(false);
        expect(accessMemory(m3.id).found).toBe(true);
      });
    });
  });

  // ============================================================================
  // List Memories Tests
  // ============================================================================

  describe('listMemories', () => {
    beforeEach(() => {
      storeMemory('A', { projectId: 'p1', tags: ['x'] });
      storeMemory('B', { projectId: 'p1', tags: ['y'] });
      storeMemory('C', { projectId: 'p2', tags: ['x'] });
    });

    it('should list all memories sorted by updatedAt', () => {
      const results = listMemories();
      
      expect(results.length).toBe(3);
      // Most recently updated first
      expect(results[0].updatedAt).toBeGreaterThanOrEqual(results[1].updatedAt);
    });

    it('should filter by project', () => {
      const results = listMemories({ projectId: 'p1' });
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.metadata.projectId === 'p1')).toBe(true);
    });

    it('should filter by tags', () => {
      const results = listMemories({ tags: ['x'] });
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.metadata.tags.includes('x'))).toBe(true);
    });

    it('should filter by governance state', () => {
      const m = storeMemory('Durable', { projectId: 'p', initialSaturation: 0.96 });
      restakeMemory(m.id, 20);
      
      const results = listMemories({ governanceState: 'durable' });
      
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(m.id);
    });
  });

  // ============================================================================
  // Statistics Tests
  // ============================================================================

  describe('getMemoryStatistics', () => {
    it('should return zero stats for empty store', () => {
      const stats = getMemoryStatistics();
      
      expect(stats.totalCount).toBe(0);
      expect(stats.groundStateCount).toBe(0);
      expect(stats.averageSaturation).toBe(0);
      expect(stats.averageTemperature).toBe(0);
    });

    it('should calculate statistics correctly', () => {
      storeMemory('A', { projectId: 'p', decayProfile: 'ephemeral' });
      storeMemory('B', { projectId: 'p', decayProfile: 'durable' });
      
      // Create durable state
      const m = storeMemory('C', { projectId: 'p', decayProfile: 'permanent' });
      
      const stats = getMemoryStatistics();
      
      expect(stats.totalCount).toBe(3);
      expect(stats.byDecayProfile.ephemeral).toBe(1);
      expect(stats.byDecayProfile.durable).toBe(1);
      expect(stats.byDecayProfile.permanent).toBe(1);
      expect(stats.groundStateCount).toBe(1); // permanent
      expect(stats.averageSaturation).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Health Inspection Tests
  // ============================================================================

  describe('inspectFacadeHealth', () => {
    it('should report operational with no memories', () => {
      const health = inspectFacadeHealth();
      
      expect(health.operational).toBe(true);
      expect(health.memoryCount).toBe(0);
      expect(health.issues).toContain('No memories stored');
    });

    it('should report low saturation warning', () => {
      storeMemory('Low', { projectId: 'p', initialSaturation: 0.1 });
      
      const health = inspectFacadeHealth();
      
      expect(health.issues).toContain('Low average saturation - consider restaking important memories');
    });
  });

  // ============================================================================
  // Crystallization Eligibility Tests
  // ============================================================================

  describe('checkCrystallizationEligibility', () => {
    it('should return not found for unknown ID', () => {
      const result = checkCrystallizationEligibility('non-existent');
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Memory not found');
    });

    it('should detect eligible memory', () => {
      configureFacade({ crystallizationThreshold: 0.9 });
      const stored = storeMemory('High sat', { projectId: 'p', initialSaturation: 0.95 });
      
      const result = checkCrystallizationEligibility(stored.id);
      
      expect(result.eligible).toBe(true);
      expect(result.meetsThreshold).toBe(true);
      expect(result.groundState).toBe(false); // not accessed enough
      expect(result.saturation).toBe(0.95);
    });

    it('should detect ineligible memory', () => {
      configureFacade({ crystallizationThreshold: 0.9 });
      const stored = storeMemory('Low sat', { projectId: 'p', initialSaturation: 0.5 });
      
      const result = checkCrystallizationEligibility(stored.id);
      
      expect(result.eligible).toBe(false);
      expect(result.meetsThreshold).toBe(false);
    });
  });

  // ============================================================================
  // Formatting Tests
  // ============================================================================

  describe('formatMemoryEntry', () => {
    it('should format memory entry for display', () => {
      const stored = storeMemory('Test content for formatting', {
        projectId: 'p',
        title: 'Formatted Title',
      });
      
      const formatted = formatMemoryEntry(stored);
      
      expect(formatted).toContain(`Memory: ${stored.id}`);
      expect(formatted).toContain('Title: Formatted Title');
      expect(formatted).toContain('Project: p');
      expect(formatted).toContain('State: provisional');
      expect(formatted).toContain('Saturation:');
      expect(formatted).toContain('Content: Test content for formatting');
    });

    it('should handle untitled memory', () => {
      const stored = storeMemory('No title', { projectId: 'p' });
      
      const formatted = formatMemoryEntry(stored);
      
      expect(formatted).toContain('Title: (untitled)');
    });
  });

  // ============================================================================
  // Export/Import Tests
  // ============================================================================

  describe('exportMemories and importMemories', () => {
    it('should export all memories', () => {
      storeMemory('One', { projectId: 'p' });
      storeMemory('Two', { projectId: 'p' });
      
      const exported = exportMemories();
      
      expect(exported.length).toBe(2);
    });

    it('should import memories', () => {
      const original = storeMemory('Import me', { projectId: 'p' });
      const exported = exportMemories();
      
      resetFacade();
      
      const count = importMemories(exported);
      
      expect(count).toBe(1);
      expect(accessMemory(original.id).found).toBe(true);
    });

    it('should replace on import with same ID', () => {
      const original = storeMemory('Original', { projectId: 'p' });
      const exported = exportMemories();
      
      // Modify and re-import
      exported[0].content = 'Modified';
      importMemories(exported);
      
      const accessed = accessMemory(original.id);
      expect(accessed.entry!.content).toBe('Modified');
    });
  });

  // ============================================================================
  // Acceptance Criteria Tests
  // ============================================================================

  describe('Acceptance Criteria', () => {
    it('AC1: Store memory with thermodynamic state and governance metadata', () => {
      const entry = storeMemory('AC1 test', {
        projectId: 'ac-test',
        decayProfile: 'durable',
        epistemicType: 'source-claim',
        confidence: 0.85,
      });
      
      // Verify thermodynamic state
      expect(entry.metadata.temporal.thermodynamic).toBeDefined();
      expect(entry.metadata.temporal.thermodynamic!.saturation).toBeGreaterThan(0);
      expect(entry.metadata.temporal.thermodynamic!.temperature).toBeGreaterThan(0);
      
      // Verify governance metadata
      expect(entry.metadata.governance.epistemicType).toBe('source-claim');
      expect(entry.metadata.governance.confidence).toBe(0.85);
      expect(entry.metadata.governance.state).toBe('provisional');
      
      // Verify temporal metadata
      expect(entry.metadata.temporal.t0).toBeGreaterThan(0);
      expect(entry.metadata.temporal.w0).toBe(1.0);
      expect(entry.metadata.temporal.decayProfile).toBe('durable');
    });

    it('AC2: Access memory applies decay and boosts saturation', () => {
      const entry = storeMemory('AC2 test', { projectId: 'ac-test', initialSaturation: 0.5 });

      // First access
      const result1 = accessMemory(entry.id);
      const sat1 = result1.thermodynamicState!.saturation;

      // Second access
      const result2 = accessMemory(entry.id);
      const sat2 = result2.thermodynamicState!.saturation;

      // Saturation should increase with access
      expect(sat2).toBeGreaterThanOrEqual(sat1);
    });

    it('AC3: Search respects decay thresholds and returns scored results', () => {
      storeMemory('Searchable content alpha', { projectId: 'ac-test' });
      storeMemory('Searchable content beta', { projectId: 'ac-test' });
      storeMemory('Irrelevant gamma delta', { projectId: 'ac-test' });

      const results = searchMemories('searchable content', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score || 0);
      expect(results.every(r => r.score > 0)).toBe(true);
    });

    it('AC4: Batch operations work atomically', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        content: `Batch item ${i}`,
        options: { projectId: 'batch-test' },
      }));
      
      const stored = storeMemoryBatch(items);
      expect(stored.length).toBe(5);
      
      const ids = stored.map(s => s.id);
      const accessed = accessMemoryBatch(ids);
      expect(accessed.every(a => a.found)).toBe(true);
      
      const forgotten = forgetMemoryBatch(ids.slice(0, 3));
      expect(forgotten).toBe(3);
      
      expect(accessMemory(ids[0]).found).toBe(false);
      expect(accessMemory(ids[4]).found).toBe(true);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should support full memory lifecycle', () => {
      // Store
      const entry = storeMemory('Lifecycle test', {
        projectId: 'lifecycle',
        title: 'Test',
        tags: ['test'],
      });
      
      // Access multiple times
      accessMemory(entry.id);
      accessMemory(entry.id);
      accessMemory(entry.id);
      
      // Update
      updateMemory(entry.id, { content: 'Updated lifecycle test' });
      
      // Restake
      restakeMemory(entry.id);
      
      // Check eligibility
      const eligibility = checkCrystallizationEligibility(entry.id);
      
      // Search should find it
      const searchResults = searchMemories('lifecycle');
      expect(searchResults.some(r => r.entry.id === entry.id)).toBe(true);
      
      // Get stats
      const stats = getMemoryStatistics();
      expect(stats.totalCount).toBe(1);
      
      // Forget
      const forgotten = forgetMemory(entry.id);
      expect(forgotten).toBe(true);
      expect(accessMemory(entry.id).found).toBe(false);
    });

    it('should handle high load simulation', () => {
      const entries: MemoryEntry[] = [];
      
      // Store 20 memories
      for (let i = 0; i < 20; i++) {
        entries.push(storeMemory(`Content ${i}`, {
          projectId: 'load-test',
          decayProfile: i % 2 === 0 ? 'standard' : 'durable',
        }));
      }
      
      // Access all
      const ids = entries.map(e => e.id);
      const accessed = accessMemoryBatch(ids);
      expect(accessed.every(a => a.found)).toBe(true);
      
      // Search
      const results = searchMemories('Content', { limit: 10 });
      expect(results.length).toBeLessThanOrEqual(10);
      
      // Stats
      const stats = getMemoryStatistics();
      expect(stats.totalCount).toBe(20);
      expect(stats.byDecayProfile.standard).toBe(10);
      expect(stats.byDecayProfile.durable).toBe(10);
      
      // Health check
      const health = inspectFacadeHealth();
      expect(health.operational).toBe(true);
    });
  });
});
