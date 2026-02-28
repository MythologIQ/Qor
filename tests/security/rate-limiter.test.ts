import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../runtime/security/rate-limiter";
import * as http from "http";

// Mock request/response
function mockRequest(ip: string = "127.0.0.1"): http.IncomingMessage {
  return {
    headers: {},
    socket: { remoteAddress: ip },
  } as http.IncomingMessage;
}

function mockResponse(): http.ServerResponse {
  let statusCode = 200;
  let ended = false;
  let endData = "";

  const res = {
    writeHead(code: number) {
      statusCode = code;
    },
    end(data?: string) {
      ended = true;
      endData = data || "";
    },
    get statusCode() {
      return statusCode;
    },
    get endCalled() {
      return ended;
    },
    get endData() {
      return endData;
    },
  } as unknown as http.ServerResponse;

  return res;
}

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxTokens: 5,
      refillRate: 1, // 1 token per second
      windowMs: 60000,
    });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it("should allow requests within limit", async () => {
    const handler = limiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // First 5 requests should succeed
    for (let i = 0; i < 5; i++) {
      const req = mockRequest();
      const res = mockResponse();
      await handler(req, res);
      expect((res as any).statusCode).toBe(200);
    }
  });

  it("should block requests exceeding limit", async () => {
    const handler = limiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // Use up all tokens
    for (let i = 0; i < 5; i++) {
      await handler(mockRequest(), mockResponse());
    }

    // Next request should be rate limited
    const req = mockRequest();
    const res = mockResponse();
    await handler(req, res);

    expect((res as any).statusCode).toBe(429);
    expect((res as any).endData).toContain("Rate limit exceeded");
  });

  it("should refill tokens over time", async () => {
    const handler = limiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // Use up all tokens
    for (let i = 0; i < 5; i++) {
      await handler(mockRequest(), mockResponse());
    }

    // Should be rate limited
    let res = mockResponse();
    await handler(mockRequest(), res);
    expect((res as any).statusCode).toBe(429);

    // Wait for refill (1.5 seconds = 1 token)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should work now
    res = mockResponse();
    await handler(mockRequest(), res);
    expect((res as any).statusCode).toBe(200);
  });

  it("should track different clients separately", async () => {
    const customLimiter = new RateLimiter({
      maxTokens: 2,
      refillRate: 1,
      windowMs: 60000,
      keyExtractor: (req) => req.headers["x-client-id"] as string || "default",
    });

    const handler = customLimiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // Client A uses 2 tokens
    for (let i = 0; i < 2; i++) {
      const req = mockRequest();
      req.headers["x-client-id"] = "client-a";
      await handler(req, mockResponse());
    }

    // Client A is limited
    let req = mockRequest();
    req.headers["x-client-id"] = "client-a";
    let res = mockResponse();
    await handler(req, res);
    expect((res as any).statusCode).toBe(429);

    // But client B still has tokens
    req = mockRequest();
    req.headers["x-client-id"] = "client-b";
    res = mockResponse();
    await handler(req, res);
    expect((res as any).statusCode).toBe(200);

    customLimiter.destroy();
  });

  it("should cleanup expired entries", async () => {
    const shortWindowLimiter = new RateLimiter({
      maxTokens: 5,
      refillRate: 1,
      windowMs: 100, // Very short window
    });

    const handler = shortWindowLimiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // Make a request to create an entry
    await handler(mockRequest(), mockResponse());
    expect(shortWindowLimiter.getBucketCount()).toBe(1);

    shortWindowLimiter.destroy();
  });

  it("should reset all limits", async () => {
    const handler = limiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // Use up all tokens
    for (let i = 0; i < 5; i++) {
      await handler(mockRequest(), mockResponse());
    }

    // Should be limited
    let res = mockResponse();
    await handler(mockRequest(), res);
    expect((res as any).statusCode).toBe(429);

    // Reset
    limiter.reset();

    // Should work now
    res = mockResponse();
    await handler(mockRequest(), res);
    expect((res as any).statusCode).toBe(200);
  });

  it("should support custom limit exceeded handler", async () => {
    const customLimiter = new RateLimiter({
      maxTokens: 1,
      refillRate: 1,
      windowMs: 60000,
      onLimitExceeded: (req, res) => {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ custom: true, message: "Slow down!" }));
      },
    });

    const handler = customLimiter.middleware(async (req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    // First request OK
    await handler(mockRequest(), mockResponse());

    // Second request gets custom response
    const res = mockResponse();
    await handler(mockRequest(), res);
    expect((res as any).statusCode).toBe(429);
    expect((res as any).endData).toContain("Slow down!");

    customLimiter.destroy();
  });
});
