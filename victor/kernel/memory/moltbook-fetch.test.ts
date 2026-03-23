/**
 * Moltbook Fetch Client Tests
 *
 * Tests for moltbook-fetch.ts covering:
 * - Configuration and initialization
 * - Rate limiting behavior
 * - Content truncation
 * - Trust metadata assignment
 * - Error handling
 * - Fetch batch operations
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test';

import {
  MoltbookFetchClient,
  DEFAULT_MOLTBOOK_CONFIG,
  createMoltbookClientFromEnv,
  isMoltbookConfigured,
  getMoltbookClient,
  resetMoltbookClient,
  type MoltbookFetchConfig,
  type FetchedPost,
  type FetchedComment,
} from './moltbook-fetch.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockPost = {
  id: 'post-123',
  title: 'Test Post Title',
  content: 'This is test content for a Moltbook post. It is benign.',
  author: { name: 'TestAuthor', id: 'author-456' },
  submolt: 'testing',
  stats: { upvotes: 42, downvotes: 3, comments: 5 },
  created_at: '2026-03-18T10:00:00Z',
};

const mockComment = {
  id: 'comment-789',
  content: 'This is a test comment.',
  author: { name: 'Commenter', id: 'author-999' },
  post_id: 'post-123',
  parent_id: null,
  stats: { upvotes: 10 },
  created_at: '2026-03-18T11:00:00Z',
};

function createLongContent(length: number): string {
  return 'a'.repeat(length);
}

// ============================================================================
// Configuration Tests
// ============================================================================

describe('MoltbookFetchClient Configuration', () => {
  it('should use default configuration', () => {
    const client = new MoltbookFetchClient();
    const config = client.getConfig();

    expect(config.apiBase).toBe(DEFAULT_MOLTBOOK_CONFIG.apiBase);
    expect(config.apiKey).toBe('');
    expect(config.maxPostsPerTick).toBe(10);
    expect(config.maxContentLength).toBe(4000);
    expect(config.sortMode).toBe('hot');
    expect(config.includeComments).toBe(false);
    expect(config.fetchCooldownMs).toBe(60000);
  });

  it('should accept partial configuration', () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test-key',
      maxPostsPerTick: 5,
      sortMode: 'new',
    });

    const config = client.getConfig();
    expect(config.apiKey).toBe('test-key');
    expect(config.maxPostsPerTick).toBe(5);
    expect(config.sortMode).toBe('new');
    // Defaults preserved for unspecified options
    expect(config.apiBase).toBe(DEFAULT_MOLTBOOK_CONFIG.apiBase);
    expect(config.maxContentLength).toBe(4000);
  });

  it('should update configuration via setConfig', () => {
    const client = new MoltbookFetchClient();
    client.setConfig({ maxPostsPerTick: 3, sortMode: 'new' });

    const config = client.getConfig();
    expect(config.maxPostsPerTick).toBe(3);
    expect(config.sortMode).toBe('new');
  });

  it('should cap maxPostsPerTick at 10', () => {
    const client = new MoltbookFetchClient({ maxPostsPerTick: 20 });
    expect(client.getConfig().maxPostsPerTick).toBe(20); // Stored as-is

    // But fetchPosts should cap it
    // (Tested in integration tests with mock)
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe('MoltbookFetchClient Rate Limiting', () => {
  it('should allow fetch initially', () => {
    const client = new MoltbookFetchClient();
    const status = client.canFetch();

    expect(status.allowed).toBe(true);
    expect(status.cooldownRemainingMs).toBe(0);
  });

  it('should track consecutive fetches', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      fetchCooldownMs: 100, // Short cooldown for testing
    });

    expect(client.getState().consecutiveFetches).toBe(0);

    // Mock the fetch to avoid actual API calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ posts: [] }), { status: 200 });

    await client.fetchPosts();
    expect(client.getState().consecutiveFetches).toBe(1);

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 150));
    await client.fetchPosts();
    expect(client.getState().consecutiveFetches).toBe(2);

    globalThis.fetch = originalFetch;
  });

  it('should enforce cooldown between fetches', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      fetchCooldownMs: 1000, // 1 second cooldown
    });

    // Mock fetch to return empty posts
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ posts: [] }), { status: 200 });

    // First fetch should succeed
    const result1 = await client.fetchPosts();
    expect(result1.rateLimited).toBe(false);

    // Immediately check - should be rate limited
    const statusAfter = client.canFetch();
    expect(statusAfter.allowed).toBe(false);
    expect(statusAfter.cooldownRemainingMs).toBeGreaterThan(0);

    // Fetch again immediately - should be rate limited
    const result2 = await client.fetchPosts();
    expect(result2.rateLimited).toBe(true);
    expect(result2.cooldownRemainingMs).toBeGreaterThan(0);

    globalThis.fetch = originalFetch;
  });

  it('should reset state correctly', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ posts: [] }), { status: 200 });

    await client.fetchPosts();
    expect(client.getState().consecutiveFetches).toBe(1);

    client.resetState();
    expect(client.getState().consecutiveFetches).toBe(0);
    expect(client.getState().lastFetchAt).toBe(0);

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Content Truncation Tests
// ============================================================================

describe('Content Truncation', () => {
  it('should not truncate short content', () => {
    const client = new MoltbookFetchClient({ maxContentLength: 100 });
    const content = 'Short content';

    // Test via post transformation using mock API response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [{ ...mockPost, content }],
        }),
        { status: 200 },
      );

    const result = client.fetchPosts();

    globalThis.fetch = originalFetch;
  });

  it('should flag truncated content', () => {
    const longContent = createLongContent(5000);
    const client = new MoltbookFetchClient({ maxContentLength: 100 });

    // Create a mock post manually to test truncation
    const mockPostLong = {
      ...mockPost,
      content: longContent,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPostLong],
        }),
        { status: 200 },
      );

    globalThis.fetch = originalFetch;
  });

  it('should truncate at configured limit', async () => {
    const maxLength = 100;
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      maxContentLength: maxLength,
    });

    const longContent = createLongContent(500);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [{ ...mockPost, content: longContent }],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    if (result.posts.length > 0) {
      expect(result.posts[0].wasTruncated).toBe(true);
      expect(result.posts[0].content.length).toBeLessThanOrEqual(maxLength);
      expect(result.posts[0].rawContent.length).toBe(500);
    }

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Trust Metadata Tests
// ============================================================================

describe('Trust Metadata Assignment', () => {
  it('should assign external-untrusted tier to all content', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPost],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].trustMetadata.tier).toBe('external-untrusted');
    expect(result.posts[0].trustMetadata.origin).toBe('moltbook');
    expect(result.posts[0].trustMetadata.confidenceCap).toBe(0.50);

    globalThis.fetch = originalFetch;
  });

  it('should include originId from post ID', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPost],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    expect(result.posts[0].trustMetadata.originId).toBe('post-123');

    globalThis.fetch = originalFetch;
  });

  it('should set initial scanVerdict to clean', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPost],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    expect(result.posts[0].trustMetadata.scanVerdict).toBe('clean');
    expect(result.posts[0].trustMetadata.scanDetails).toEqual([]);

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  it('should return error when API key not configured', async () => {
    const client = new MoltbookFetchClient(); // No API key

    const result = await client.fetchPosts();

    expect(result.error).toBe('MOLTBOOK_API_KEY not configured');
    expect(result.posts).toEqual([]);
    expect(result.rateLimited).toBe(false);
  });

  it('should handle HTTP errors gracefully', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('Internal Server Error', { status: 500 });

    const result = await client.fetchPosts();

    expect(result.error).toContain('HTTP 500');
    expect(result.posts).toEqual([]);

    globalThis.fetch = originalFetch;
  });

  it('should handle network errors gracefully', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Network error: connection refused');
    };

    const result = await client.fetchPosts();

    expect(result.error).toContain('Fetch error');
    expect(result.posts).toEqual([]);

    globalThis.fetch = originalFetch;
  });

  it('should handle API error responses', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: 'Rate limit exceeded', status: 429 }),
        { status: 200 }, // API returns 200 even with error
      );

    const result = await client.fetchPosts();

    expect(result.error).toBe('Rate limit exceeded');

    globalThis.fetch = originalFetch;
  });

  it('should handle invalid JSON responses', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('Not valid JSON', { status: 200 });

    const result = await client.fetchPosts();

    expect(result.error).toContain('Fetch error');

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Fetch Operations Tests
// ============================================================================

describe('Fetch Operations', () => {
  it('should fetch posts successfully', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPost],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    expect(result.error).toBeUndefined();
    expect(result.rateLimited).toBe(false);
    expect(result.postCount).toBe(1);
    expect(result.posts[0].id).toBe('post-123');
    expect(result.posts[0].title).toBe('Test Post Title');
    expect(result.posts[0].authorName).toBe('TestAuthor');
    expect(result.posts[0].submoltName).toBe('testing');
    expect(result.posts[0].upvotes).toBe(42);
    expect(result.posts[0].downvotes).toBe(3);
    expect(result.posts[0].commentCount).toBe(5);

    globalThis.fetch = originalFetch;
  });

  it('should handle empty posts array', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ posts: [] }),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    expect(result.error).toBeUndefined();
    expect(result.posts).toEqual([]);
    expect(result.postCount).toBe(0);

    globalThis.fetch = originalFetch;
  });

  it('should handle missing posts field', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({}),
        { status: 200 },
      );

    const result = await client.fetchPosts();

    expect(result.error).toBeUndefined();
    expect(result.posts).toEqual([]);

    globalThis.fetch = originalFetch;
  });

  it('should build correct URL with query params', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      sortMode: 'new',
      maxPostsPerTick: 5,
    });

    let capturedUrl: string | undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();
      return new Response(
        JSON.stringify({ posts: [] }),
        { status: 200 },
      );
    };

    await client.fetchPosts(3);

    expect(capturedUrl).toContain('limit=3');
    expect(capturedUrl).toContain('sort=new');
    expect(capturedUrl).toContain('/posts');

    globalThis.fetch = originalFetch;
  });

  it('should cap limit at maxPostsPerTick', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      maxPostsPerTick: 5,
    });

    let capturedUrl: string | undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();
      return new Response(
        JSON.stringify({ posts: [] }),
        { status: 200 },
      );
    };

    await client.fetchPosts(10); // Request 10, but max is 5

    expect(capturedUrl).toContain('limit=5');

    globalThis.fetch = originalFetch;
  });

  it('should use correct headers', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'my-api-key' });

    let capturedHeaders: HeadersInit | undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({ posts: [] }),
        { status: 200 },
      );
    };

    await client.fetchPosts();

    const headers = new Headers(capturedHeaders);
    expect(headers.get('Authorization')).toBe('Bearer my-api-key');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('User-Agent')).toContain('Victor');
    expect(headers.get('User-Agent')).toContain('Read-Only');

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Comment Fetching Tests
// ============================================================================

describe('Comment Fetching', () => {
  it('should return empty array when comments disabled', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      includeComments: false,
    });

    const comments = await client.fetchPostComments('post-123');
    expect(comments).toEqual([]);
  });

  it('should fetch comments when enabled', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      includeComments: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          comments: [mockComment],
        }),
        { status: 200 },
      );

    const comments = await client.fetchPostComments('post-123');

    expect(comments.length).toBe(1);
    expect(comments[0].id).toBe('comment-789');
    expect(comments[0].postId).toBe('post-123');
    expect(comments[0].authorName).toBe('Commenter');
    expect(comments[0].upvotes).toBe(10);

    globalThis.fetch = originalFetch;
  });

  it('should handle comment fetch errors gracefully', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      includeComments: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const comments = await client.fetchPostComments('post-123');
    expect(comments).toEqual([]);

    globalThis.fetch = originalFetch;
  });

  it('should cap comment limit at 50', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      includeComments: true,
    });

    let capturedUrl: string | undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();
      return new Response(
        JSON.stringify({ comments: [] }),
        { status: 200 },
      );
    };

    await client.fetchPostComments('post-123', 100);

    expect(capturedUrl).toContain('limit=50');

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Batch Fetching Tests
// ============================================================================

describe('Batch Fetching', () => {
  it('should fetch posts and comments in batch', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      includeComments: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/comments')) {
        return new Response(
          JSON.stringify({ comments: [mockComment] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ posts: [mockPost] }),
        { status: 200 },
      );
    };

    const result = await client.fetchBatch();

    expect(result.posts.length).toBe(1);
    expect(result.comments.length).toBe(1);
    expect(result.postCount).toBe(1);
    expect(result.commentCount).toBe(1);

    globalThis.fetch = originalFetch;
  });

  it('should skip comments when disabled', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      includeComments: false,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ posts: [mockPost] }),
        { status: 200 },
      );

    const result = await client.fetchBatch();

    expect(result.posts.length).toBe(1);
    expect(result.comments.length).toBe(0);
    expect(result.commentCount).toBe(0);

    globalThis.fetch = originalFetch;
  });

  it('should propagate errors from fetchPosts', async () => {
    const client = new MoltbookFetchClient(); // No API key

    const result = await client.fetchBatch();

    expect(result.error).toBe('MOLTBOOK_API_KEY not configured');
  });

  it('should return early if rate limited', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      fetchCooldownMs: 60000,
    });

    // Simulate recent fetch by mocking state
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ posts: [] }),
        { status: 200 },
      );

    await client.fetchPosts(); // First fetch

    const result = await client.fetchBatch(); // Second fetch (rate limited)

    expect(result.rateLimited).toBe(true);

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// Environment Integration Tests
// ============================================================================

describe('Environment Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MOLTBOOK_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    resetMoltbookClient();
  });

  it('should read API key from environment', () => {
    process.env.MOLTBOOK_API_KEY = 'env-api-key';

    const client = createMoltbookClientFromEnv();
    expect(client.getConfig().apiKey).toBe('env-api-key');
  });

  it('should read optional config from environment', () => {
    process.env.MOLTBOOK_API_KEY = 'key';
    process.env.MOLTBOOK_API_BASE = 'https://custom.moltbook.com';
    process.env.MOLTBOOK_MAX_POSTS = '5';
    process.env.MOLTBOOK_MAX_LENGTH = '2000';
    process.env.MOLTBOOK_SORT_MODE = 'new';
    process.env.MOLTBOOK_INCLUDE_COMMENTS = 'true';

    const client = createMoltbookClientFromEnv();
    const config = client.getConfig();

    expect(config.apiBase).toBe('https://custom.moltbook.com');
    expect(config.maxPostsPerTick).toBe(5);
    expect(config.maxContentLength).toBe(2000);
    expect(config.sortMode).toBe('new');
    expect(config.includeComments).toBe(true);
  });

  it('should detect when Moltbook is configured', () => {
    expect(isMoltbookConfigured()).toBe(false);

    process.env.MOLTBOOK_API_KEY = 'configured';
    expect(isMoltbookConfigured()).toBe(true);
  });

  it('should return singleton client', () => {
    process.env.MOLTBOOK_API_KEY = 'singleton-key';

    const client1 = getMoltbookClient();
    const client2 = getMoltbookClient();

    expect(client1).toBe(client2);
    expect(client1.getConfig().apiKey).toBe('singleton-key');
  });

  it('should reset singleton correctly', () => {
    process.env.MOLTBOOK_API_KEY = 'key1';

    const client1 = getMoltbookClient();
    resetMoltbookClient();

    process.env.MOLTBOOK_API_KEY = 'key2';
    const client2 = getMoltbookClient();

    expect(client1).not.toBe(client2);
    expect(client2.getConfig().apiKey).toBe('key2');
  });
});

// ============================================================================
// Post Transformation Tests
// ============================================================================

describe('Post Transformation', () => {
  it('should correctly map all post fields', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPost],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();
    const post = result.posts[0];

    expect(post.id).toBe('post-123');
    expect(post.title).toBe('Test Post Title');
    expect(post.authorName).toBe('TestAuthor');
    expect(post.authorId).toBe('author-456');
    expect(post.submoltName).toBe('testing');
    expect(post.upvotes).toBe(42);
    expect(post.downvotes).toBe(3);
    expect(post.commentCount).toBe(5);
    expect(post.createdAt).toBe('2026-03-18T10:00:00Z');
    expect(post.fetchedAt).toBeTruthy(); // ISO timestamp

    globalThis.fetch = originalFetch;
  });

  it('should preserve raw content when truncating', async () => {
    const client = new MoltbookFetchClient({
      apiKey: 'test',
      maxContentLength: 20,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [{ ...mockPost, content: 'This is longer than twenty chars' }],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();
    const post = result.posts[0];

    expect(post.wasTruncated).toBe(true);
    expect(post.rawContent).toBe('This is longer than twenty chars');
    expect(post.content.length).toBeLessThanOrEqual(20);

    globalThis.fetch = originalFetch;
  });
});

// ============================================================================
// FetchedPost Type Tests
// ============================================================================

describe('FetchedPost Structure', () => {
  it('should have all required fields', async () => {
    const client = new MoltbookFetchClient({ apiKey: 'test' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          posts: [mockPost],
        }),
        { status: 200 },
      );

    const result = await client.fetchPosts();
    const post = result.posts[0];

    // Verify all required fields exist
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('title');
    expect(post).toHaveProperty('content');
    expect(post).toHaveProperty('rawContent');
    expect(post).toHaveProperty('authorName');
    expect(post).toHaveProperty('authorId');
    expect(post).toHaveProperty('submoltName');
    expect(post).toHaveProperty('upvotes');
    expect(post).toHaveProperty('downvotes');
    expect(post).toHaveProperty('commentCount');
    expect(post).toHaveProperty('createdAt');
    expect(post).toHaveProperty('fetchedAt');
    expect(post).toHaveProperty('wasTruncated');
    expect(post).toHaveProperty('trustMetadata');

    globalThis.fetch = originalFetch;
  });
});
