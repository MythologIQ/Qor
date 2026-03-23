/**
 * Memory Facade — Simplified API for Common Memory Operations
 * 
 * Provides an ergonomic operator surface over the Victor memory subsystem.
 * Integrates thermodynamic decay, saturation boosts, and governance controls
 * into a unified, easy-to-use API.
 * 
 * @module Victor/kernel/memory/memory-facade
 */

import type {
  SemanticNodeRecord,
  SourceDocumentRecord,
  SourceChunkRecord,
  TemporalMetadata,
  GovernanceMetadata,
  GovernanceState,
  EpistemicType,
  GroundedContextBundle,
  SearchChunkHit,
  RecallDecision,
  DecayProfile,
} from './types.js';
import type { ThermodynamicState } from './thermodynamic-decay.js';
import {
  calculateTemperature,
  calculateEffectiveLambda,
  applyThermodynamicDecay,
  applyAccessBoost,
  updateStateOnAccess,
  initializeThermodynamicState,
  isGroundState,
  DEFAULT_DECAY_PARAMS,
} from './thermodynamic-decay.js';

// ============================================================================
// Facade Configuration
// ============================================================================

export interface MemoryFacadeConfig {
  /** Default decay profile for new memories */
  defaultDecayProfile: DecayProfile;
  /** Base lambda for decay calculations */
  baseLambda: number;
  /** Saturation threshold for promotion to crystallized */
  crystallizationThreshold: number;
  /** Confidence threshold for governance approval */
  confidenceThreshold: number;
  /** Enable automatic thermodynamic updates on access */
  autoUpdateOnAccess: boolean;
  /** Maximum search results to return */
  maxSearchResults: number;
  /** Decay profile to thermodynamic mapping */
  decayProfileSaturation: Record<DecayProfile, number>;
}

export const DEFAULT_FACADE_CONFIG: MemoryFacadeConfig = {
  defaultDecayProfile: 'standard',
  baseLambda: DEFAULT_DECAY_PARAMS.baseLambda,
  crystallizationThreshold: 0.95,
  confidenceThreshold: 0.7,
  autoUpdateOnAccess: true,
  maxSearchResults: 10,
  decayProfileSaturation: {
    ephemeral: 0.1,
    session: 0.3,
    standard: 0.5,
    durable: 0.7,
    permanent: 1.0,
  },
};

// ============================================================================
// Memory Entry Types
// ============================================================================

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: MemoryEntryMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryEntryMetadata {
  title?: string;
  tags: string[];
  projectId: string;
  sourcePath?: string;
  nodeType?: SemanticNodeRecord['nodeType'];
  governance: GovernanceMetadata;
  temporal: TemporalMetadata;
}

export interface StoreMemoryOptions {
  title?: string;
  tags?: string[];
  projectId: string;
  sourcePath?: string;
  nodeType?: SemanticNodeRecord['nodeType'];
  decayProfile?: DecayProfile;
  epistemicType?: EpistemicType;
  initialSaturation?: number;
  confidence?: number;
}

export interface SearchMemoryOptions {
  limit?: number;
  includeDecayed?: boolean;
  decayThreshold?: number;
  governanceStates?: GovernanceState[];
  projectId?: string;
  tags?: string[];
}

export interface AccessMemoryResult {
  entry: MemoryEntry | null;
  found: boolean;
  updated: boolean;
  wasDecayed: boolean;
  thermodynamicState: ThermodynamicState | null;
}

export interface MemoryStatistics {
  totalCount: number;
  byGovernanceState: Record<GovernanceState, number>;
  byDecayProfile: Record<DecayProfile, number>;
  groundStateCount: number;
  averageSaturation: number;
  averageTemperature: number;
}

export interface MemoryFacadeHealth {
  operational: boolean;
  config: MemoryFacadeConfig;
  memoryCount: number;
  issues: string[];
}

// ============================================================================
// In-Memory Storage (for facade operations)
// ============================================================================

/** Internal storage for memory entries */
const memoryStore = new Map<string, MemoryEntry>();

/** Access counters for saturation tracking */
const accessCounters = new Map<string, number>();

/** Current facade configuration */
let currentConfig: MemoryFacadeConfig = { ...DEFAULT_FACADE_CONFIG };

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Initialize or update the memory facade configuration.
 */
export function configureFacade(config: Partial<MemoryFacadeConfig>): MemoryFacadeConfig {
  currentConfig = { ...currentConfig, ...config };
  return { ...currentConfig };
}

/**
 * Get the current facade configuration.
 */
export function getFacadeConfig(): MemoryFacadeConfig {
  return { ...currentConfig };
}

/**
 * Reset the facade to default configuration and clear all memory.
 * USE WITH CAUTION — primarily for testing.
 */
export function resetFacade(): void {
  memoryStore.clear();
  accessCounters.clear();
  currentConfig = { ...DEFAULT_FACADE_CONFIG };
}

// ============================================================================
// Core Memory Operations
// ============================================================================

/**
 * Store a new memory entry with full governance and thermodynamic metadata.
 * 
 * @param content - The memory content to store
 * @param options - Storage options including governance and decay settings
 * @returns The stored memory entry
 */
export function storeMemory(content: string, options: StoreMemoryOptions): MemoryEntry {
  const now = Date.now();
  const decayProfile = options.decayProfile || currentConfig.defaultDecayProfile;
  const initialSaturation = options.initialSaturation ?? currentConfig.decayProfileSaturation[decayProfile];
  
  // Create thermodynamic state
  const thermodynamicState = initializeThermodynamicState(initialSaturation);
  
  // Create governance metadata
  const governance: GovernanceMetadata = {
    state: 'provisional',
    epistemicType: options.epistemicType || 'observation',
    provenanceComplete: !!options.sourcePath,
    confidence: options.confidence || 0.5,
    policyVersion: '1.0.0',
  };
  
  // Create temporal metadata
  const temporal: TemporalMetadata = {
    t0: now,
    w0: 1.0,
    lambda: thermodynamicState.effectiveLambda,
    decayProfile,
    restakeCount: 0,
    lastAccessedAt: now,
    thermodynamic: thermodynamicState,
    lastScore: 1.0, // Start with full score
  };
  
  const entry: MemoryEntry = {
    id: generateMemoryId(),
    content,
    metadata: {
      title: options.title,
      tags: options.tags || [],
      projectId: options.projectId,
      sourcePath: options.sourcePath,
      nodeType: options.nodeType,
      governance,
      temporal,
    },
    createdAt: now,
    updatedAt: now,
  };
  
  memoryStore.set(entry.id, entry);
  accessCounters.set(entry.id, 1);
  
  return entry;
}

/**
 * Retrieve a memory entry by ID, applying thermodynamic decay updates.
 * 
 * @param id - Memory entry ID
 * @returns Access result with entry and thermodynamic state
 */
export function accessMemory(id: string): AccessMemoryResult {
  const entry = memoryStore.get(id);
  
  if (!entry) {
    return {
      entry: null,
      found: false,
      updated: false,
      wasDecayed: false,
      thermodynamicState: null,
    };
  }
  
  const thermodynamic = entry.metadata.temporal.thermodynamic;
  if (!thermodynamic) {
    return {
      entry,
      found: true,
      updated: false,
      wasDecayed: false,
      thermodynamicState: null,
    };
  }
  
  // Calculate decay since last access
  const now = Date.now();
  const deltaTime = (now - (entry.metadata.temporal.lastAccessedAt || entry.createdAt)) / 1000;
  
  // Apply decay to lastScore
  const lastScore = entry.metadata.temporal.lastScore ?? 1.0;
  const decayedScore = applyThermodynamicDecay(
    lastScore,
    thermodynamic.saturation,
    deltaTime
  );
  
  const wasDecayed = decayedScore < lastScore;
  entry.metadata.temporal.lastScore = decayedScore;
  
  // Update access count and apply boost
  const accessCount = (accessCounters.get(id) || 0) + 1;
  accessCounters.set(id, accessCount);
  
  if (currentConfig.autoUpdateOnAccess) {
    updateStateOnAccess(thermodynamic);
    entry.metadata.temporal.lastAccessedAt = now;
    entry.updatedAt = now;
  }
  
  return {
    entry,
    found: true,
    updated: currentConfig.autoUpdateOnAccess,
    wasDecayed,
    thermodynamicState: thermodynamic,
  };
}

/**
 * Search memories by content similarity (simplified lexical search).
 * Returns results sorted by relevance, filtered by decay state.
 * 
 * @param query - Search query string
 * @param options - Search options
 * @returns Matching memory entries with scores
 */
export function searchMemories(
  query: string,
  options: SearchMemoryOptions = {}
): Array<{ entry: MemoryEntry; score: number }> {
  const {
    limit = currentConfig.maxSearchResults,
    includeDecayed = false,
    decayThreshold = 0.1,
    governanceStates,
    projectId,
    tags,
  } = options;
  
  const results: Array<{ entry: MemoryEntry; score: number }> = [];
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
  
  for (const entry of memoryStore.values()) {
    // Filter by project
    if (projectId && entry.metadata.projectId !== projectId) {
      continue;
    }
    
    // Filter by tags
    if (tags && tags.length > 0) {
      const hasTag = tags.some(tag => entry.metadata.tags.includes(tag));
      if (!hasTag) continue;
    }
    
    // Filter by governance state
    if (governanceStates && !governanceStates.includes(entry.metadata.governance.state)) {
      continue;
    }
    
    // Calculate current score with decay
    const thermodynamic = entry.metadata.temporal.thermodynamic;
    const lastScore = entry.metadata.temporal.lastScore ?? 1.0;
    
    // Calculate elapsed time and current score
    const now = Date.now();
    const deltaTime = (now - (entry.metadata.temporal.lastAccessedAt || entry.createdAt)) / 1000;
    const currentScore = thermodynamic 
      ? applyThermodynamicDecay(lastScore, thermodynamic.saturation, deltaTime)
      : lastScore;
    
    // Filter decayed memories
    if (!includeDecayed && currentScore < decayThreshold) {
      continue;
    }
    
    // Simple lexical scoring
    const contentLower = entry.content.toLowerCase();
    let matchScore = 0;
    
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matchScore += 1;
        // Bonus for title match
        if (entry.metadata.title?.toLowerCase().includes(term)) {
          matchScore += 2;
        }
      }
    }
    
    // Boost for exact phrase match
    if (contentLower.includes(queryLower)) {
      matchScore += 3;
    }
    
    // Normalize by term count
    if (queryTerms.length > 0) {
      matchScore = matchScore / queryTerms.length;
    }
    
    // Weight by thermodynamic score
    const finalScore = matchScore * currentScore;
    
    if (finalScore > 0) {
      results.push({ entry, score: finalScore });
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit);
}

/**
 * Update an existing memory entry's content and metadata.
 * Creates a new version with updated temporal metadata.
 * 
 * @param id - Memory entry ID
 * @param updates - Partial updates to apply
 * @returns Updated entry or null if not found
 */
export function updateMemory(
  id: string,
  updates: Partial<Pick<MemoryEntry, 'content'>> & Partial<Pick<MemoryEntryMetadata, 'title' | 'tags'>>
): MemoryEntry | null {
  const entry = memoryStore.get(id);
  if (!entry) return null;
  
  const now = Date.now();
  
  if (updates.content !== undefined) {
    entry.content = updates.content;
  }
  
  if (updates.title !== undefined) {
    entry.metadata.title = updates.title;
  }
  
  if (updates.tags !== undefined) {
    entry.metadata.tags = updates.tags;
  }
  
  // Boost saturation on update (edit = engagement)
  const thermodynamic = entry.metadata.temporal.thermodynamic;
  if (thermodynamic) {
    thermodynamic.saturation = applyAccessBoost(thermodynamic.saturation, 5);
    thermodynamic.temperature = calculateTemperature(thermodynamic.saturation);
    thermodynamic.effectiveLambda = calculateEffectiveLambda(
      thermodynamic.saturation,
      currentConfig.baseLambda
    );
  }
  
  entry.metadata.temporal.restakeCount++;
  entry.updatedAt = now;
  
  return entry;
}

/**
 * Remove a memory entry from storage.
 * 
 * @param id - Memory entry ID
 * @returns True if removed, false if not found
 */
export function forgetMemory(id: string): boolean {
  const existed = memoryStore.has(id);
  memoryStore.delete(id);
  accessCounters.delete(id);
  return existed;
}

/**
 * Restake a memory to boost its saturation and reset decay.
 * Used when a memory is validated or confirmed important.
 * 
 * @param id - Memory entry ID
 * @param boostAmount - Optional custom boost amount (default: 10)
 * @returns Updated entry or null if not found
 */
export function restakeMemory(id: string, boostAmount: number = 10): MemoryEntry | null {
  const entry = memoryStore.get(id);
  if (!entry) return null;
  
  const thermodynamic = entry.metadata.temporal.thermodynamic;
  if (!thermodynamic) return entry;
  
  // Apply significant saturation boost
  thermodynamic.saturation = applyAccessBoost(thermodynamic.saturation, boostAmount);
  thermodynamic.temperature = calculateTemperature(thermodynamic.saturation);
  thermodynamic.effectiveLambda = calculateEffectiveLambda(
    thermodynamic.saturation,
    currentConfig.baseLambda
  );
  
  // Reset score on restake
  entry.metadata.temporal.lastScore = 1.0;
  
  entry.metadata.temporal.restakeCount++;
  entry.metadata.temporal.lastAccessedAt = Date.now();
  entry.updatedAt = Date.now();
  
  // Update governance state if saturation crosses threshold
  if (thermodynamic.saturation >= currentConfig.crystallizationThreshold) {
    entry.metadata.governance.state = 'durable';
  }
  
  return entry;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Store multiple memories in a single batch operation.
 * 
 * @param items - Array of content and options
 * @returns Array of stored memory entries
 */
export function storeMemoryBatch(
  items: Array<{ content: string; options: StoreMemoryOptions }>
): MemoryEntry[] {
  return items.map(item => storeMemory(item.content, item.options));
}

/**
 * Access multiple memories by ID in a single batch.
 * 
 * @param ids - Array of memory entry IDs
 * @returns Array of access results
 */
export function accessMemoryBatch(ids: string[]): AccessMemoryResult[] {
  return ids.map(id => accessMemory(id));
}

/**
 * Forget multiple memories by ID.
 * 
 * @param ids - Array of memory entry IDs
 * @returns Count of successfully removed memories
 */
export function forgetMemoryBatch(ids: string[]): number {
  return ids.filter(id => forgetMemory(id)).length;
}

// ============================================================================
// Query and Inspection
// ============================================================================

/**
 * Get all memory entries (with optional filtering).
 * 
 * @param filter - Optional filter criteria
 * @returns Array of memory entries
 */
export function listMemories(filter?: {
  projectId?: string;
  governanceState?: GovernanceState;
  tags?: string[];
}): MemoryEntry[] {
  let entries = Array.from(memoryStore.values());
  
  if (filter?.projectId) {
    entries = entries.filter(e => e.metadata.projectId === filter.projectId);
  }
  
  if (filter?.governanceState) {
    entries = entries.filter(e => e.metadata.governance.state === filter.governanceState);
  }
  
  if (filter?.tags && filter.tags.length > 0) {
    entries = entries.filter(e => 
      filter.tags!.some(tag => e.metadata.tags.includes(tag))
    );
  }
  
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get comprehensive statistics about the memory store.
 */
export function getMemoryStatistics(): MemoryStatistics {
  const entries = Array.from(memoryStore.values());
  
  const byGovernanceState: Record<GovernanceState, number> = {
    ephemeral: 0,
    provisional: 0,
    durable: 0,
    contested: 0,
    deprecated: 0,
    rejected: 0,
    quarantined: 0,
  };
  
  const byDecayProfile: Record<DecayProfile, number> = {
    ephemeral: 0,
    session: 0,
    standard: 0,
    durable: 0,
    permanent: 0,
  };
  
  let groundStateCount = 0;
  let totalSaturation = 0;
  let totalTemperature = 0;
  let thermodynamicCount = 0;
  
  for (const entry of entries) {
    byGovernanceState[entry.metadata.governance.state]++;
    byDecayProfile[entry.metadata.temporal.decayProfile]++;
    
    const thermodynamic = entry.metadata.temporal.thermodynamic;
    if (thermodynamic) {
      thermodynamicCount++;
      totalSaturation += thermodynamic.saturation;
      totalTemperature += thermodynamic.temperature;
      
      if (isGroundState(thermodynamic)) {
        groundStateCount++;
      }
    }
  }
  
  return {
    totalCount: entries.length,
    byGovernanceState,
    byDecayProfile,
    groundStateCount,
    averageSaturation: thermodynamicCount > 0 ? totalSaturation / thermodynamicCount : 0,
    averageTemperature: thermodynamicCount > 0 ? totalTemperature / thermodynamicCount : 0,
  };
}

/**
 * Inspect the health and status of the memory facade.
 */
export function inspectFacadeHealth(): MemoryFacadeHealth {
  const stats = getMemoryStatistics();
  const issues: string[] = [];
  
  if (stats.totalCount === 0) {
    issues.push('No memories stored');
  }
  
  if (stats.averageSaturation < 0.3) {
    issues.push('Low average saturation - consider restaking important memories');
  }
  
  if (stats.groundStateCount === 0 && stats.totalCount > 0) {
    issues.push('No memories in ground state - none have reached zero-decay');
  }
  
  return {
    operational: true,
    config: getFacadeConfig(),
    memoryCount: stats.totalCount,
    issues,
  };
}

/**
 * Check if a memory entry is eligible for crystallization (L3 promotion).
 * 
 * @param id - Memory entry ID
 * @returns Crystallization eligibility status
 */
export function checkCrystallizationEligibility(id: string): {
  eligible: boolean;
  saturation: number;
  meetsThreshold: boolean;
  groundState: boolean;
  reason: string;
} {
  const entry = memoryStore.get(id);
  
  if (!entry) {
    return {
      eligible: false,
      saturation: 0,
      meetsThreshold: false,
      groundState: false,
      reason: 'Memory not found',
    };
  }
  
  const thermodynamic = entry.metadata.temporal.thermodynamic;
  if (!thermodynamic) {
    return {
      eligible: false,
      saturation: 0,
      meetsThreshold: false,
      groundState: false,
      reason: 'No thermodynamic state',
    };
  }
  
  const meetsThreshold = thermodynamic.saturation >= currentConfig.crystallizationThreshold;
  const groundState = isGroundState(thermodynamic);
  
  let reason: string;
  if (meetsThreshold && groundState) {
    reason = 'Fully qualified: saturation >= threshold and ground state reached';
  } else if (meetsThreshold) {
    reason = 'Saturation threshold met but not yet ground state';
  } else if (groundState) {
    reason = 'Ground state reached but saturation below threshold';
  } else {
    reason = `Saturation ${thermodynamic.saturation.toFixed(2)} below threshold ${currentConfig.crystallizationThreshold}`;
  }
  
  return {
    eligible: meetsThreshold,
    saturation: thermodynamic.saturation,
    meetsThreshold,
    groundState,
    reason,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique memory ID.
 */
function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Format a memory entry for display/logging.
 */
export function formatMemoryEntry(entry: MemoryEntry): string {
  const lines = [
    `Memory: ${entry.id}`,
    `Title: ${entry.metadata.title || '(untitled)'}`,
    `Project: ${entry.metadata.projectId}`,
    `State: ${entry.metadata.governance.state}`,
    `Created: ${new Date(entry.createdAt).toISOString()}`,
  ];
  
  const thermodynamic = entry.metadata.temporal.thermodynamic;
  if (thermodynamic) {
    const lastScore = entry.metadata.temporal.lastScore ?? 1.0;
    lines.push(
      `Saturation: ${thermodynamic.saturation.toFixed(3)}`,
      `Temperature: ${thermodynamic.temperature.toFixed(3)}`,
      `Score: ${lastScore.toFixed(3)}`,
      `Ground State: ${isGroundState(thermodynamic) ? 'Yes' : 'No'}`
    );
  }
  
  lines.push(`Content: ${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}`);
  
  return lines.join('\n');
}

/**
 * Export all memories to a serializable format.
 */
export function exportMemories(): MemoryEntry[] {
  return Array.from(memoryStore.values()).map(entry => ({ ...entry }));
}

/**
 * Import memories from a serialized format.
 * NOTE: This will replace existing memories with the same ID.
 * 
 * @param entries - Array of memory entries to import
 * @returns Count of imported memories
 */
export function importMemories(entries: MemoryEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    memoryStore.set(entry.id, { ...entry });
    count++;
  }
  return count;
}
