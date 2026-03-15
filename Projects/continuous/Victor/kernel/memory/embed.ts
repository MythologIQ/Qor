import type { EmbeddingConfig } from './types';

export interface EmbeddingProvider {
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  return new OpenAICompatibleEmbeddingProvider(config);
}

class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(private readonly config: EmbeddingConfig) {
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
