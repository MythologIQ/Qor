import type { EmbeddingConfig, Neo4jConfig } from './types';

const DEFAULT_URI = 'bolt://127.0.0.1:7687';
const DEFAULT_USERNAME = 'neo4j';
const DEFAULT_DATABASE = 'neo4j';
const DEFAULT_LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_LOCAL_DIMENSIONS = 384;

export function loadNeo4jConfig(env: Record<string, string | undefined> = process.env): Neo4jConfig {
  const uri = env.NEO4J_URI?.trim() || DEFAULT_URI;
  const username = env.NEO4J_USERNAME?.trim() || DEFAULT_USERNAME;
  const password = env.NEO4J_PASSWORD?.trim();
  const database = env.NEO4J_DATABASE?.trim() || DEFAULT_DATABASE;

  if (!password) {
    throw new Error('NEO4J_PASSWORD is required');
  }

  return {
    uri,
    username,
    password,
    database,
    vectorDimensions: Number(env.OPENAI_EMBEDDING_DIMENSIONS?.trim() || '1536'),
  };
}

export function loadEmbeddingConfig(
  env: Record<string, string | undefined> = process.env,
): EmbeddingConfig {
  const provider = env.EMBEDDING_PROVIDER?.trim().toLowerCase();
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (provider === 'openai-compatible' || provider === 'openai' || (!provider && apiKey)) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai-compatible');
    }

    const baseUrl = env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
    const model = env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
    const dimensions = Number(env.OPENAI_EMBEDDING_DIMENSIONS?.trim() || '1536');

    if (!Number.isFinite(dimensions) || dimensions <= 0) {
      throw new Error('OPENAI_EMBEDDING_DIMENSIONS must be a positive number');
    }

    return {
      provider: 'openai-compatible',
      baseUrl,
      apiKey,
      model,
      dimensions,
    };
  }

  if (provider && provider !== 'local-transformers' && provider !== 'local') {
    throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
  }

  const model = env.LOCAL_EMBEDDING_MODEL?.trim() || DEFAULT_LOCAL_MODEL;
  const dimensions = Number(env.LOCAL_EMBEDDING_DIMENSIONS?.trim() || String(DEFAULT_LOCAL_DIMENSIONS));
  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    throw new Error('LOCAL_EMBEDDING_DIMENSIONS must be a positive number');
  }

  return {
    provider: 'local-transformers',
    model,
    dimensions,
    cacheDir: env.LOCAL_EMBEDDING_CACHE_DIR?.trim() || undefined,
  };
}
