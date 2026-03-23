/**
 * Idle Exploration — Heartbeat idle-time content exploration with quarantine integration
 *
 * When the build queue is empty, Victor can explore external content sources
 * (Moltbook) during idle periods. All content undergoes full quarantine
 * pipeline: fetch → sanitize → scan → gate → store.
 *
 * Integration points:
 * - moltbook-fetch.ts: FetchClient for external content
 * - quarantine-sanitize.ts: Content sanitization
 * - quarantine-scan.ts: Adversarial scanning
 * - quarantine-gate.ts: Governance gate routing
 * - quarantine-store.ts: Quarantine storage
 * - quarantine-audit.ts: Audit ledger
 */

import type { FetchedPost } from './moltbook-fetch.js';
import { getMoltbookClient } from './moltbook-fetch.js';
import type { SanitizeResult } from './quarantine-sanitize.js';
import { sanitizeContent } from './quarantine-sanitize.js';
import type { ScanResult } from './quarantine-scan.js';
import { scanContent } from './quarantine-scan.js';
import type { GateDecision, GateAction } from './quarantine-gate.js';
import { evaluateGate, createSourceTrustMetadata } from './quarantine-gate.js';
import type { QuarantineStore, StoredItem } from './quarantine-store.js';
import { getQuarantineStore } from './quarantine-store.js';
import type { AuditLedger } from './quarantine-audit.js';
import { getAuditLedger } from './quarantine-audit.js';

// ============================================================================
// Exploration Configuration
// ============================================================================

export interface ExplorationConfig {
  /** Whether exploration is enabled (default: false) */
  enabled: boolean;
  /** Maximum consecutive exploration ticks before heartbeat parks (default: 5) */
  maxConsecutiveExplore: number;
  /** Cooldown between exploration ticks in ms (default: 60000) */
  exploreCooldownMs: number;
  /** Maximum items to process per exploration tick (default: 10) */
  maxItemsPerTick: number;
  /** Sources to explore (default: ['moltbook']) */
  sources: ExplorationSource[];
  /** Whether to auto-promote clean content after cooldown (default: true) */
  autoPromoteClean: boolean;
  /** Cooldown ticks before auto-promotion (default: 3) */
  autoPromoteCooldownTicks: number;
}

export type ExplorationSource = 'moltbook';

export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
  enabled: false,
  maxConsecutiveExplore: 5,
  exploreCooldownMs: 60000,
  maxItemsPerTick: 10,
  sources: ['moltbook'],
  autoPromoteClean: true,
  autoPromoteCooldownTicks: 3,
};

// ============================================================================
// Exploration State
// ============================================================================

export interface ExplorationState {
  /** Number of consecutive exploration ticks */
  consecutiveExploreTicks: number;
  /** Timestamp of last exploration tick */
  lastExploreAt: number | null;
  /** Total items fetched across all exploration ticks */
  totalItemsFetched: number;
  /** Total items admitted to provisional */
  totalItemsAdmitted: number;
  /** Total items rejected */
  totalItemsRejected: number;
  /** Current exploration status */
  status: ExplorationStatus;
}

export type ExplorationStatus = 'idle' | 'active' | 'paused' | 'disabled';

export function createExplorationState(): ExplorationState {
  return {
    consecutiveExploreTicks: 0,
    lastExploreAt: null,
    totalItemsFetched: 0,
    totalItemsAdmitted: 0,
    totalItemsRejected: 0,
    status: 'idle',
  };
}

// ============================================================================
// Exploration Result Types
// ============================================================================

export interface ExploredItem {
  id: string;
  source: ExplorationSource;
  post: FetchedPost;
  sanitizeResult: SanitizeResult;
  scanResult: ScanResult;
  gateDecision: GateDecision;
  storedItem?: StoredItem;
}

export interface ExplorationResult {
  /** Whether exploration was performed */
  didExplore: boolean;
  /** Reason for not exploring (if applicable) */
  skipReason?: string;
  /** Items processed during this exploration tick */
  items: ExploredItem[];
  /** Count by gate action */
  actionCounts: Record<GateAction, number>;
  /** Whether exploration produced useful content */
  hasUsefulContent: boolean;
  /** Updated exploration state */
  state: ExplorationState;
  /** Any errors encountered */
  errors: string[];
}

// ============================================================================
// Exploration Service
// ============================================================================

export interface ExplorationService {
  config: ExplorationConfig;
  state: ExplorationState;
  explore(): Promise<ExplorationResult>;
  canExplore(): boolean;
  resetConsecutiveTicks(): void;
}

class IdleExplorationService implements ExplorationService {
  constructor(
    public config: ExplorationConfig,
    public state: ExplorationState,
    private store: QuarantineStore,
    private audit: AuditLedger,
  ) {}

  canExplore(): boolean {
    if (!this.config.enabled) {
      return false;
    }
    if (this.state.consecutiveExploreTicks >= this.config.maxConsecutiveExplore) {
      return false;
    }
    if (this.state.lastExploreAt !== null) {
      const elapsed = Date.now() - this.state.lastExploreAt;
      if (elapsed < this.config.exploreCooldownMs) {
        return false;
      }
    }
    return true;
  }

  async explore(): Promise<ExplorationResult> {
    if (!this.canExplore()) {
      return {
        didExplore: false,
        skipReason: this.buildSkipReason(),
        items: [],
        actionCounts: { admit: 0, 'sanitize-admit': 0, quarantine: 0, reject: 0 },
        hasUsefulContent: false,
        state: this.state,
        errors: [],
      };
    }

    const items: ExploredItem[] = [];
    const actionCounts: Record<GateAction, number> = { admit: 0, 'sanitize-admit': 0, quarantine: 0, reject: 0 };
    const errors: string[] = [];

    try {
      // Fetch from Moltbook
      const fetchClient = getMoltbookClient();
      const fetchResult = await fetchClient.fetchBatch({ maxPosts: this.config.maxItemsPerTick });

      if (fetchResult.posts.length === 0) {
        this.state.consecutiveExploreTicks++;
        this.state.lastExploreAt = Date.now();
        this.state.status = 'active';

        return {
          didExplore: true,
          items: [],
          actionCounts,
          hasUsefulContent: false,
          state: this.state,
          errors: [],
        };
      }

      // Process each post through quarantine pipeline
      for (const post of fetchResult.posts) {
        try {
          const exploredItem = await this.processPost(post);
          items.push(exploredItem);
          actionCounts[exploredItem.gateDecision.action]++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to process post ${post.id}: ${message}`);
        }
      }

      // Update state
      this.state.consecutiveExploreTicks++;
      this.state.lastExploreAt = Date.now();
      this.state.totalItemsFetched += fetchResult.posts.length;
      this.state.totalItemsAdmitted += actionCounts.admit + actionCounts['sanitize-admit'];
      this.state.totalItemsRejected += actionCounts.reject;
      this.state.status = 'active';

      // Audit the exploration tick
      await this.audit.recordSystemEvent({
        eventType: 'exploration-tick',
        timestamp: Date.now(),
        details: {
          itemsProcessed: items.length,
          actionCounts,
          errors: errors.length,
        },
      });

      return {
        didExplore: true,
        items,
        actionCounts,
        hasUsefulContent: items.length > 0 && actionCounts.reject < items.length,
        state: this.state,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Exploration failed: ${message}`);

      return {
        didExplore: false,
        items,
        actionCounts,
        hasUsefulContent: false,
        state: this.state,
        errors,
      };
    }
  }

  resetConsecutiveTicks(): void {
    this.state.consecutiveExploreTicks = 0;
  }

  private buildSkipReason(): string {
    if (!this.config.enabled) {
      return 'Exploration is disabled';
    }
    if (this.state.consecutiveExploreTicks >= this.config.maxConsecutiveExplore) {
      return `Reached max consecutive exploration ticks (${this.config.maxConsecutiveExplore})`;
    }
    if (this.state.lastExploreAt !== null) {
      const elapsed = Date.now() - this.state.lastExploreAt;
      const remaining = this.config.exploreCooldownMs - elapsed;
      return `Cooldown active (${Math.ceil(remaining / 1000)}s remaining)`;
    }
    return 'Cannot explore';
  }

  private async processPost(post: FetchedPost): Promise<ExploredItem> {
    // Step 1: Sanitize
    const sanitizeResult = sanitizeContent(post.content, {
      maxLength: 4000,
      stripHtml: true,
      decodeBase64: true,
      normalizeUnicode: true,
      removeControlChars: true,
      flagEncoded: true,
    });

    // Step 2: Scan
    const scanResult = scanContent(sanitizeResult.sanitized, {
      checkSimilarity: true,
      checkFlood: true,
      authorId: post.authorId,
    });

    // Step 3: Gate
    const trustMetadata = createSourceTrustMetadata(
      'external-untrusted',
      'moltbook',
      post.id,
    );
    trustMetadata.fetchedAt = post.fetchedAt;

    const gateDecision = evaluateGate(
      scanResult,
      trustMetadata,
      sanitizeResult.sanitized,
    );

    // Step 4: Store based on gate decision
    let storedItem: StoredItem | undefined;

    if (gateDecision.action === 'quarantine' || gateDecision.action === 'sanitize-admit') {
      storedItem = await this.store.storeQuarantine(
        post.id,
        sanitizeResult.sanitized,
        post.content,  // raw content
        trustMetadata,
        scanResult,
        gateDecision,
        Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days expiry
      );
    } else if (gateDecision.action === 'reject') {
      storedItem = await this.store.storeRejected(
        post.id,
        sanitizeResult.sanitized,
        post.content,  // raw content
        trustMetadata,
        scanResult,
        gateDecision,
      );
    } else if (gateDecision.action === 'admit') {
      // Direct admit - store as provisional
      storedItem = await this.store.storeProvisional(
        post.id,
        sanitizeResult.sanitized,
        post.content,  // raw content
        trustMetadata,
        scanResult,
        gateDecision,
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      );
    }

    // Step 5: Audit
    await this.audit.recordGateDecision(
      gateDecision.action,
      trustMetadata,
      scanResult.verdict,
      post.id,
      gateDecision.reason,
    );

    return {
      id: post.id,
      source: 'moltbook',
      post,
      sanitizeResult,
      scanResult,
      gateDecision,
      storedItem,
    };
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let explorationService: ExplorationService | null = null;

export async function initializeExploration(config?: Partial<ExplorationConfig>): Promise<ExplorationService> {
  const store = getQuarantineStore();
  if (!store.isInitialized()) {
    await store.initialize();
  }

  const audit = getAuditLedger();
  if (!audit.isInitialized()) {
    await audit.initialize();
  }

  const fullConfig: ExplorationConfig = {
    ...DEFAULT_EXPLORATION_CONFIG,
    ...config,
    // Only enable if MOLTBOOK_API_KEY is set
    enabled: config?.enabled === true && !!process.env.MOLTBOOK_API_KEY,
  };

  explorationService = new IdleExplorationService(
    fullConfig,
    createExplorationState(),
    store,
    audit,
  );

  return explorationService;
}

export function getExplorationService(): ExplorationService {
  if (!explorationService) {
    throw new Error('Exploration service not initialized. Call initializeExploration() first.');
  }
  return explorationService;
}

export function isExplorationInitialized(): boolean {
  return explorationService !== null;
}

/**
 * Convenience function for heartbeat integration.
 * Returns true if exploration produced useful content (should not increment blocked counter).
 */
export async function runIdleExploration(
  config?: Partial<ExplorationConfig>,
): Promise<{ explored: boolean; hasUsefulContent: boolean; state: ExplorationState; errors: string[] }> {
  if (!isExplorationInitialized()) {
    await initializeExploration(config);
  }

  const service = getExplorationService();
  const result = await service.explore();

  return {
    explored: result.didExplore,
    hasUsefulContent: result.hasUsefulContent,
    state: result.state,
    errors: result.errors,
  };
}

/**
 * Check if exploration is enabled and available.
 */
export function isExplorationAvailable(): boolean {
  if (!isExplorationInitialized()) {
    return false;
  }
  return getExplorationService().canExplore();
}
