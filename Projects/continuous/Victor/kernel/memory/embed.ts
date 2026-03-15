import type { EmbeddingConfig } from './types';

export interface EmbeddingProvider {
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleEmbeddingProvider(config);
  }

  return new LocalTransformersEmbeddingProvider(config);
}

class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(
    private readonly config: Extract<EmbeddingConfig, { provider: 'openai-compatible' }>,
  ) {
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedMany([text]);
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        dimensions: this.config.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding request failed with ${response.status}`);
    }

    const payload = await response.json() as {
      data?: Array<{ embedding: number[] }>;
    };

    const vectors = payload.data?.map((item) => item.embedding) ?? [];
    if (vectors.length !== texts.length) {
      throw new Error('Embedding provider returned an unexpected number of vectors');
    }

    return vectors;
  }
}

class LocalTransformersEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  private extractorPromise: Promise<FeatureExtractor> | null = null;

  constructor(private readonly config: Extract<EmbeddingConfig, { provider: 'local-transformers' }>) {
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedMany([text]);
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getExtractor();
    const output = await extractor(texts, {
      pooling: 'mean',
      normalize: true,
    });

    return coerceEmbeddings(output, texts.length, this.dimensions);
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = loadLocalFeatureExtractor(this.config);
    }
    return this.extractorPromise;
  }
}

type FeatureExtractor = (
  input: string | string[],
  options: {
    pooling: 'mean';
    normalize: boolean;
  },
) => Promise<unknown>;

async function loadLocalFeatureExtractor(
  config: Extract<EmbeddingConfig, { provider: 'local-transformers' }>,
): Promise<FeatureExtractor> {
  const transformers = await import('@xenova/transformers');
  transformers.env.useBrowserCache = false;
  if (config.cacheDir) {
    transformers.env.cacheDir = config.cacheDir;
  }

  return transformers.pipeline('feature-extraction', config.model) as Promise<FeatureExtractor>;
}

function coerceEmbeddings(output: unknown, expectedCount: number, expectedDimensions: number): number[][] {
  if (!output || typeof output !== 'object') {
    throw new Error('Local embedding provider returned an invalid payload');
  }

  const maybeTensor = output as {
    data?: Float32Array | number[];
    dims?: number[];
  };

  const dims = maybeTensor.dims ?? [];
  const data = maybeTensor.data ? Array.from(maybeTensor.data) : null;

  if (dims.length !== 2 || !data) {
    throw new Error('Local embedding provider returned unexpected tensor dimensions');
  }

  const [rows, cols] = dims;
  if (rows !== expectedCount || cols !== expectedDimensions) {
    throw new Error(
      `Local embedding provider returned ${rows}x${cols}, expected ${expectedCount}x${expectedDimensions}`,
    );
  }

  const vectors: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    vectors.push(data.slice(start, start + cols));
  }

  return vectors;
}
