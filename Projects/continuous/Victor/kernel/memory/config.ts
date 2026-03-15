import type { EmbeddingConfig, Neo4jConfig } from './types';

const DEFAULT_URI = 'neo4j://127.0.0.1:7687';
const DEFAULT_USERNAME = 'neo4j';
const DEFAULT_DATABASE = 'neo4j';

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
): EmbeddingConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
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
