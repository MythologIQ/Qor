import { describe, expect, it } from 'bun:test';

import { loadEmbeddingConfig, loadNeo4jConfig } from './config';

describe('loadNeo4jConfig', () => {
  it('uses defaults for uri, username, and database', () => {
    const config = loadNeo4jConfig({
      NEO4J_PASSWORD: 'secret',
    });

    expect(config).toEqual({
      uri: 'bolt://127.0.0.1:7687',
      username: 'neo4j',
      password: 'secret',
      database: 'neo4j',
      vectorDimensions: 1536,
    });
  });

  it('throws when password is missing', () => {
    expect(() => loadNeo4jConfig({})).toThrow('NEO4J_PASSWORD is required');
  });

  it('trims explicit values', () => {
    const config = loadNeo4jConfig({
      NEO4J_URI: ' bolt://db.internal:7687 ',
      NEO4J_USERNAME: ' victor ',
      NEO4J_PASSWORD: ' top-secret ',
      NEO4J_DATABASE: ' memory ',
    });

    expect(config).toEqual({
      uri: 'bolt://db.internal:7687',
      username: 'victor',
      password: 'top-secret',
      database: 'memory',
      vectorDimensions: 1536,
    });
  });
});

describe('loadEmbeddingConfig', () => {
  it('defaults to a local transformers embedding config when no provider is configured', () => {
    expect(loadEmbeddingConfig({})).toEqual({
      provider: 'local-transformers',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      cacheDir: undefined,
    });
  });

  it('loads OpenAI-compatible embedding config', () => {
    expect(
      loadEmbeddingConfig({
        OPENAI_API_KEY: 'secret',
        OPENAI_BASE_URL: 'https://example.com/v1',
        OPENAI_EMBEDDING_MODEL: 'embed-small',
        OPENAI_EMBEDDING_DIMENSIONS: '768',
        EMBEDDING_PROVIDER: 'openai-compatible',
      }),
    ).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      model: 'embed-small',
      dimensions: 768,
    });
  });

  it('loads a local transformers embedding config explicitly', () => {
    expect(
      loadEmbeddingConfig({
        EMBEDDING_PROVIDER: 'local-transformers',
        LOCAL_EMBEDDING_MODEL: 'Xenova/bge-small-en-v1.5',
        LOCAL_EMBEDDING_DIMENSIONS: '384',
        LOCAL_EMBEDDING_CACHE_DIR: '/tmp/victor-embeddings',
      }),
    ).toEqual({
      provider: 'local-transformers',
      model: 'Xenova/bge-small-en-v1.5',
      dimensions: 384,
      cacheDir: '/tmp/victor-embeddings',
    });
  });
});
