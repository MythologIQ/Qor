/**
 * Response Utilities for API Optimization
 *
 * Provides:
 * - ETag generation for conditional requests (If-None-Match)
 * - Gzip compression for large responses
 * - Standard response envelope utilities
 */

import * as zlib from "zlib";
import * as crypto from "crypto";

/**
 * Generate ETag for response body
 * Uses SHA-256 hash of content for strong ETags
 */
export function generateETag(content: string | Buffer): string {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return `"${hash.slice(0, 16)}"`; // Use first 16 chars for shorter ETag
}

/**
 * Generate weak ETag for JSON objects (uses JSON serialization)
 * Useful for objects that may have equivalent content but different serialization
 */
export function generateWeakETag(obj: unknown): string {
  const content = JSON.stringify(obj);
  const hash = crypto.createHash("md5").update(content).digest("hex");
  return `W/"${hash.slice(0, 12)}"`;
}

/**
 * Check if client has fresh content via If-None-Match header
 * Returns true if client should use cached version (304)
 */
export function isNotModified(
  req: { headers: Record<string, string | string[] | undefined> },
  etag: string,
): boolean {
  const ifNoneMatch = req.headers["if-none-match"];
  if (!ifNoneMatch) return false;

  const clientETags = Array.isArray(ifNoneMatch)
    ? ifNoneMatch
    : ifNoneMatch.split(",").map((s) => s.trim());

  return clientETags.includes(etag) || clientETags.includes("*");
}

/**
 * Check if client accepts gzip encoding
 */
export function acceptsGzip(
  req: { headers: Record<string, string | string[] | undefined> },
): boolean {
  const acceptEncoding = req.headers["accept-encoding"];
  if (!acceptEncoding) return false;

  const encodings = Array.isArray(acceptEncoding)
    ? acceptEncoding.join(", ")
    : acceptEncoding;

  return /\bgzip\b/i.test(encodings);
}

/**
 * Compress content using gzip
 */
export async function gzipCompress(content: string | Buffer): Promise<Buffer> {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

  return new Promise((resolve, reject) => {
    zlib.gzip(buffer, (err, compressed) => {
      if (err) reject(err);
      else resolve(compressed);
    });
  });
}

/**
 * Response envelope for paginated data
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
    etag?: string;
  };
}

/**
 * Create paginated response envelope
 */
export function createPaginatedResponse<T>(
  data: T[],
  options: {
    page: number;
    limit: number;
    total: number;
    includeETag?: boolean;
  },
): PaginatedResponse<T> {
  const response: PaginatedResponse<T> = {
    data,
    meta: {
      pagination: {
        page: options.page,
        limit: options.limit,
        total: options.total,
        hasMore: options.page * options.limit < options.total,
      },
    },
  };

  if (options.includeETag) {
    response.meta.etag = generateWeakETag(data);
  }

  return response;
}

/**
 * Standard response envelope
 */
export interface StandardResponse<T> {
  data: T;
  meta?: {
    etag?: string;
    timestamp?: string;
  };
}

/**
 * Create standard response envelope
 */
export function createStandardResponse<T>(
  data: T,
  options: {
    includeETag?: boolean;
    includeTimestamp?: boolean;
  } = {},
): StandardResponse<T> {
  const response: StandardResponse<T> = { data };

  if (options.includeETag || options.includeTimestamp) {
    response.meta = {};
    if (options.includeETag) {
      response.meta.etag = generateWeakETag(data);
    }
    if (options.includeTimestamp) {
      response.meta.timestamp = new Date().toISOString();
    }
  }

  return response;
}

/**
 * Minimum size threshold for compression (1KB)
 * Responses smaller than this won't be compressed
 */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

/**
 * Optimized response sender
 * Handles ETags, compression, and conditional requests
 */
export class OptimizedResponder {
  constructor(
    private readonly compressionThreshold = COMPRESSION_THRESHOLD_BYTES,
  ) {}

  /**
   * Send JSON response with ETag and optional compression
   * Returns true if response was sent (including 304)
   */
  async sendJson<T>(
    req: { headers: Record<string, string | string[] | undefined> },
    res: {
      statusCode: number;
      setHeader: (name: string, value: string | number) => void;
      end: (data?: Buffer | string) => void;
    },
    statusCode: number,
    payload: T,
    options: {
      skipCompression?: boolean;
      skipETag?: boolean;
    } = {},
  ): Promise<boolean> {
    const json = JSON.stringify(payload);
    const etag = options.skipETag ? undefined : generateETag(json);

    // Check If-None-Match for cached content
    if (etag && statusCode === 200 && isNotModified(req, etag)) {
      res.statusCode = 304;
      res.setHeader("ETag", etag);
      res.end();
      return true;
    }

    // Set ETag header
    if (etag) {
      res.setHeader("ETag", etag);
    }

    // Check if compression is beneficial
    const contentLength = Buffer.byteLength(json, "utf-8");
    const shouldCompress =
      !options.skipCompression &&
      acceptsGzip(req) &&
      contentLength >= this.compressionThreshold;

    if (shouldCompress) {
      const compressed = await gzipCompress(json);
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", compressed.length);
      res.setHeader("Vary", "Accept-Encoding");
      res.end(compressed);
    } else {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Length", contentLength);
      res.end(json);
    }

    return true;
  }

  /**
   * Send paginated response with ETag and compression
   */
  async sendPaginated<T>(
    req: { headers: Record<string, string | string[] | undefined> },
    res: {
      statusCode: number;
      setHeader: (name: string, value: string | number) => void;
      end: (data?: Buffer | string) => void;
    },
    options: {
      page: number;
      limit: number;
      total: number;
    },
    data: T[],
  ): Promise<boolean> {
    const payload = createPaginatedResponse(data, {
      ...options,
      includeETag: true,
    });

    return this.sendJson(req, res, 200, payload);
  }
}

/**
 * Create default optimized responder instance
 */
export function createOptimizedResponder(
  compressionThreshold = COMPRESSION_THRESHOLD_BYTES,
): OptimizedResponder {
  return new OptimizedResponder(compressionThreshold);
}
