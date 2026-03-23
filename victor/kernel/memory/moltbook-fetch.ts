/**
 * Moltbook Fetch Client — Read-only client for Moltbook API
 *
 * Fetches posts and comments from Moltbook (agent social network) with:
 * - Rate limiting (max 1 batch per tick, max 10 posts)
 * - Content truncation (4000 chars max)
 * - Automatic external-untrusted trust tier assignment
 * - GET-only operations (no writes to Moltbook)
 *
 * Integration points:
 * - quarantine-gate.ts: SourceTrustTier, CONFIDENCE_CAPS
 * - quarantine-scan.ts: ScanResult (scan fetched content before ingestion)
 * - types.ts: SourceTrustMetadata
 */

import type { SourceTrustTier, SourceTrustMetadata } from './types.js';
import type { ScanResult } from './quarantine-scan.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface MoltbookFetchConfig {
  /** API base URL (default: https://www.moltbook.com/api/v1) */
  apiBase: string;
  /** API key for authentication (from MOLTBOOK_API_KEY env var) */
  apiKey: string;
  /** Maximum posts per fetch batch (default: 10, max: 10) */
  maxPostsPerTick: number;
  /** Maximum content length in characters (default: 4000) */
  maxContentLength: number;
  /** Sort mode for posts (default: 'hot') */
  sortMode: 'hot' | 'new';
  /** Whether to include comments (default: false) */
  includeComments: boolean;
  /** Cooldown between fetch batches in ms (default: 60000) */
  fetchCooldownMs: number;
}

/** Default configuration values */
export const DEFAULT_MOLTBOOK_CONFIG: MoltbookFetchConfig = {
  apiBase: 'https://www.moltbook.com/api/v1',
  apiKey: '',
  maxPostsPerTick: 10,
  maxContentLength: 4000,
  sortMode: 'hot',
  includeComments: false,
  fetchCooldownMs: 60000,
};

/** Rate limiting state */
interface FetchState {
  lastFetchAt: number;
  consecutiveFetches: number;
  totalPostsFetched: number;
}

// ============================================================================
// Fetched Content Types
// ============================================================================

export interface FetchedPost {
  /** Moltbook post UUID */
  id: string;
  /** Post title */
  title: string;
  /** Post content (truncated to maxContentLength) */
  content: string;
  /** Original content before truncation */
  rawContent: string;
  /** Author display name */
  authorName: string;
  /** Author unique ID */
  authorId: string;
  /** Submolt (community) name */
  submoltName: string;
  /** Upvote count */
  upvotes: number;
  /** Downvote count */
  downvotes: number;
  /** Comment count */
  commentCount: number;
  /** Post creation timestamp (ISO 8601) */
  createdAt: string;
  /** When this post was fetched */
  fetchedAt: string;
  /** Full trust metadata for quarantine pipeline */
  trustMetadata: SourceTrustMetadata;
  /** Whether content was truncated */
  wasTruncated: boolean;
}

export interface FetchedComment {
  /** Comment UUID */
  id: string;
  /** Comment content (truncated) */
  content: string;
  /** Original content before truncation */
  rawContent: string;
  /** Author display name */
  authorName: string;
  /** Author unique ID */
  authorId: string;
  /** Parent post ID */
  postId: string;
  /** Parent comment ID (null if top-level) */
  parentId: string | null;
  /** Upvote count */
  upvotes: number;
  /** Comment creation timestamp */
  createdAt: string;
  /** When this comment was fetched */
  fetchedAt: string;
  /** Trust metadata */
  trustMetadata: SourceTrustMetadata;
  /** Whether content was truncated */
  wasTruncated: boolean;
}

export interface FetchBatchResult {
  /** Posts fetched in this batch */
  posts: FetchedPost[];
  /** Comments fetched (if includeComments enabled) */
  comments: FetchedComment[];
  /** Number of posts fetched */
  postCount: number;
  /** Number of comments fetched */
  commentCount: number;
  /** When this batch was fetched */
  fetchedAt: string;
  /** Whether rate limit prevented fetch */
  rateLimited: boolean;
  /** Time until next fetch allowed (ms, 0 if can fetch now) */
  cooldownRemainingMs: number;
  /** Error message if fetch failed */
  error?: string;
}

// ============================================================================
// Moltbook API Response Types (internal)
// ============================================================================

interface MoltbookApiPost {
  id: string;
  title: string;
  content: string;
  author: {
    name: string;
    id: string;
  };
  submolt: string;
  stats: {
    upvotes: number;
    downvotes: number;
    comments: number;
  };
  created_at: string;
}

interface MoltbookApiComment {
  id: string;
  content: string;
  author: {
    name: string;
    id: string;
  };
  post_id: string;
  parent_id: string | null;
  stats: {
    upvotes: number;
  };
  created_at: string;
}

interface MoltbookApiResponse {
  posts?: MoltbookApiPost[];
  comments?: MoltbookApiComment[];
  error?: string;
  status?: number;
}

// ============================================================================
// Fetch Client Class
// ============================================================================

export class MoltbookFetchClient {
  private config: MoltbookFetchConfig;
  private state: FetchState;

  constructor(config: Partial<MoltbookFetchConfig> = {}) {
    this.config = { ...DEFAULT_MOLTBOOK_CONFIG, ...config };
    this.state = {
      lastFetchAt: 0,
      consecutiveFetches: 0,
      totalPostsFetched: 0,
    };
  }

  /**
   * Get current configuration.
   */
  getConfig(): MoltbookFetchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(updates: Partial<MoltbookFetchConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current fetch state.
   */
  getState(): FetchState {
    return { ...this.state };
  }

  /**
   * Check if fetch is allowed based on rate limiting.
   */
  canFetch(now: number = Date.now()): { allowed: boolean; cooldownRemainingMs: number } {
    const elapsed = now - this.state.lastFetchAt;
    const cooldownRemainingMs = Math.max(0, this.config.fetchCooldownMs - elapsed);
    return {
      allowed: cooldownRemainingMs === 0,
      cooldownRemainingMs,
    };
  }

  /**
   * Fetch a batch of posts from Moltbook.
   *
   * @param limit - Number of posts to fetch (capped at maxPostsPerTick)
   * @returns FetchBatchResult with posts and metadata
   */
  async fetchPosts(limit?: number): Promise<FetchBatchResult> {
    const now = Date.now();
    const fetchTime = new Date().toISOString();

    // Check rate limiting
    const { allowed, cooldownRemainingMs } = this.canFetch(now);
    if (!allowed) {
      return {
        posts: [],
        comments: [],
        postCount: 0,
        commentCount: 0,
        fetchedAt: fetchTime,
        rateLimited: true,
        cooldownRemainingMs,
      };
    }

    // Validate API key
    if (!this.config.apiKey) {
      return {
        posts: [],
        comments: [],
        postCount: 0,
        commentCount: 0,
        fetchedAt: fetchTime,
        rateLimited: false,
        cooldownRemainingMs: 0,
        error: 'MOLTBOOK_API_KEY not configured',
      };
    }

    const fetchLimit = Math.min(limit ?? this.config.maxPostsPerTick, this.config.maxPostsPerTick);

    try {
      // Build URL with query parameters
      const url = new URL('/posts', this.config.apiBase);
      url.searchParams.set('limit', fetchLimit.toString());
      url.searchParams.set('sort', this.config.sortMode);

      // Execute fetch
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Victor/1.0 (Read-Only Bot)',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          posts: [],
          comments: [],
          postCount: 0,
          commentCount: 0,
          fetchedAt: fetchTime,
          rateLimited: false,
          cooldownRemainingMs: 0,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data: MoltbookApiResponse = await response.json();

      if (data.error) {
        return {
          posts: [],
          comments: [],
          postCount: 0,
          commentCount: 0,
          fetchedAt: fetchTime,
          rateLimited: false,
          cooldownRemainingMs: 0,
          error: data.error,
        };
      }

      // Transform posts
      const posts: FetchedPost[] = (data.posts ?? []).map(post =>
        this.transformPost(post, fetchTime),
      );

      // Update state
      this.state.lastFetchAt = now;
      this.state.consecutiveFetches++;
      this.state.totalPostsFetched += posts.length;

      return {
        posts,
        comments: [],
        postCount: posts.length,
        commentCount: 0,
        fetchedAt: fetchTime,
        rateLimited: false,
        cooldownRemainingMs: this.config.fetchCooldownMs,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        posts: [],
        comments: [],
        postCount: 0,
        commentCount: 0,
        fetchedAt: fetchTime,
        rateLimited: false,
        cooldownRemainingMs: 0,
        error: `Fetch error: ${errorMessage}`,
      };
    }
  }

  /**
   * Fetch comments for a specific post.
   *
   * @param postId - The post ID to fetch comments for
   * @param limit - Maximum comments to fetch
   * @returns Array of fetched comments
   */
  async fetchPostComments(postId: string, limit?: number): Promise<FetchedComment[]> {
    if (!this.config.includeComments) {
      return [];
    }

    if (!this.config.apiKey) {
      return [];
    }

    const fetchTime = new Date().toISOString();
    const fetchLimit = Math.min(limit ?? 20, 50); // Max 50 comments per request

    try {
      const url = new URL(`/posts/${postId}/comments`, this.config.apiBase);
      url.searchParams.set('limit', fetchLimit.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Victor/1.0 (Read-Only Bot)',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data: MoltbookApiResponse = await response.json();

      return (data.comments ?? []).map(comment =>
        this.transformComment(comment, fetchTime),
      );

    } catch {
      return [];
    }
  }

  /**
   * Fetch posts with automatic comment fetching (if enabled).
   *
   * @param limit - Number of posts to fetch
   * @returns FetchBatchResult with posts and comments
   */
  async fetchBatch(limit?: number): Promise<FetchBatchResult> {
    const result = await this.fetchPosts(limit);

    if (result.error || result.rateLimited || result.posts.length === 0) {
      return result;
    }

    // Fetch comments if enabled
    if (this.config.includeComments) {
      const allComments: FetchedComment[] = [];

      for (const post of result.posts) {
        const comments = await this.fetchPostComments(post.id, 10);
        allComments.push(...comments);
      }

      return {
        ...result,
        comments: allComments,
        commentCount: allComments.length,
      };
    }

    return result;
  }

  /**
   * Reset fetch state (for testing or after long pause).
   */
  resetState(): void {
    this.state = {
      lastFetchAt: 0,
      consecutiveFetches: 0,
      totalPostsFetched: 0,
    };
  }

  // ============================================================================
  // Private Transform Methods
  // ============================================================================

  private transformPost(post: MoltbookApiPost, fetchTime: string): FetchedPost {
    const truncated = this.truncateContent(post.content);
    const trustTier: SourceTrustTier = 'external-untrusted';

    return {
      id: post.id,
      title: post.title,
      content: truncated.content,
      rawContent: post.content,
      authorName: post.author.name,
      authorId: post.author.id,
      submoltName: post.submolt,
      upvotes: post.stats.upvotes,
      downvotes: post.stats.downvotes,
      commentCount: post.stats.comments,
      createdAt: post.created_at,
      fetchedAt: fetchTime,
      wasTruncated: truncated.wasTruncated,
      trustMetadata: this.createTrustMetadata(trustTier, post.id, fetchTime),
    };
  }

  private transformComment(comment: MoltbookApiComment, fetchTime: string): FetchedComment {
    const truncated = this.truncateContent(comment.content);
    const trustTier: SourceTrustTier = 'external-untrusted';

    return {
      id: comment.id,
      content: truncated.content,
      rawContent: comment.content,
      authorName: comment.author.name,
      authorId: comment.author.id,
      postId: comment.post_id,
      parentId: comment.parent_id,
      upvotes: comment.stats.upvotes,
      createdAt: comment.created_at,
      fetchedAt: fetchTime,
      wasTruncated: truncated.wasTruncated,
      trustMetadata: this.createTrustMetadata(trustTier, comment.id, fetchTime),
    };
  }

  private truncateContent(content: string): { content: string; wasTruncated: boolean } {
    if (content.length <= this.config.maxContentLength) {
      return { content, wasTruncated: false };
    }

    // Truncate and add indicator
    const truncated = content.slice(0, this.config.maxContentLength - 3) + '...';
    return { content: truncated, wasTruncated: true };
  }

  private createTrustMetadata(
    tier: SourceTrustTier,
    originId: string,
    fetchTime: string,
  ): SourceTrustMetadata {
    return {
      tier,
      origin: 'moltbook',
      originId,
      fetchedAt: fetchTime,
      scanVerdict: 'clean', // Will be updated after scanning
      scanDetails: [],
      confidenceCap: 0.50, // external-untrusted cap
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a Moltbook fetch client from environment variables.
 */
export function createMoltbookClientFromEnv(): MoltbookFetchClient {
  const apiKey = process.env.MOLTBOOK_API_KEY ?? '';

  const config: Partial<MoltbookFetchConfig> = {
    apiKey,
    apiBase: process.env.MOLTBOOK_API_BASE,
    maxPostsPerTick: process.env.MOLTBOOK_MAX_POSTS ? parseInt(process.env.MOLTBOOK_MAX_POSTS, 10) : undefined,
    maxContentLength: process.env.MOLTBOOK_MAX_LENGTH ? parseInt(process.env.MOLTBOOK_MAX_LENGTH, 10) : undefined,
    sortMode: process.env.MOLTBOOK_SORT_MODE as 'hot' | 'new' | undefined,
    includeComments: process.env.MOLTBOOK_INCLUDE_COMMENTS === 'true',
  };

  // Remove undefined values
  const definedConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  ) as Partial<MoltbookFetchConfig>;

  return new MoltbookFetchClient(definedConfig);
}

/**
 * Check if Moltbook API key is configured.
 */
export function isMoltbookConfigured(): boolean {
  return !!process.env.MOLTBOOK_API_KEY;
}

/**
 * Global singleton client instance.
 */
let globalClient: MoltbookFetchClient | undefined;

export function getMoltbookClient(): MoltbookFetchClient {
  if (!globalClient) {
    globalClient = createMoltbookClientFromEnv();
  }
  return globalClient;
}

export function resetMoltbookClient(): void {
  globalClient = undefined;
}
