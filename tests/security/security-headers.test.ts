import { describe, it, expect } from "vitest";
import { withSecurityHeaders } from "../../runtime/security/security-headers";
import * as http from "http";

// Mock request/response with header tracking
function mockRequest(protocol: string = "http"): http.IncomingMessage {
  return {
    headers: {
      "x-forwarded-proto": protocol,
    },
  } as unknown as http.IncomingMessage;
}

function mockResponse(): http.ServerResponse & { _headers: Map<string, string> } {
  const headers = new Map<string, string>();

  const res = {
    _headers: headers,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    getHeader(name: string) {
      return headers.get(name);
    },
  } as http.ServerResponse & { _headers: Map<string, string> };

  return res;
}

describe("Security Headers", () => {
  it("should add default security headers", async () => {
    const handler = withSecurityHeaders(async (req, res) => {
      // no-op
    });

    const req = mockRequest();
    const res = mockResponse();
    await handler(req, res);

    expect(res.getHeader("Content-Security-Policy")).toBeTruthy();
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff");
    expect(res.getHeader("X-Frame-Options")).toBe("DENY");
    expect(res.getHeader("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.getHeader("X-XSS-Protection")).toBe("1; mode=block");
  });

  it("should add HSTS header for HTTPS", async () => {
    const handler = withSecurityHeaders(async (req, res) => {
      // no-op
    });

    const req = mockRequest("https");
    const res = mockResponse();
    await handler(req, res);

    const hsts = res.getHeader("Strict-Transport-Security");
    expect(hsts).toBeTruthy();
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
  });

  it("should not add HSTS header for HTTP", async () => {
    const handler = withSecurityHeaders(async (req, res) => {
      // no-op
    });

    const req = mockRequest("http");
    const res = mockResponse();
    await handler(req, res);

    expect(res.getHeader("Strict-Transport-Security")).toBeUndefined();
  });

  it("should allow disabling specific headers", async () => {
    const handler = withSecurityHeaders(
      async (req, res) => {
        // no-op
      },
      {
        contentSecurityPolicy: false,
        frameOptions: false,
        permissionsPolicy: false,
      }
    );

    const req = mockRequest();
    const res = mockResponse();
    await handler(req, res);

    expect(res.getHeader("Content-Security-Policy")).toBeUndefined();
    expect(res.getHeader("X-Frame-Options")).toBeUndefined();
    expect(res.getHeader("Permissions-Policy")).toBeUndefined();

    // But these should still be set
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff");
    expect(res.getHeader("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("should allow custom CSP", async () => {
    const handler = withSecurityHeaders(
      async (req, res) => {
        // no-op
      },
      {
        contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'",
      }
    );

    const req = mockRequest();
    const res = mockResponse();
    await handler(req, res);

    expect(res.getHeader("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'"
    );
  });

  it("should allow custom frame options", async () => {
    const handler = withSecurityHeaders(
      async (req, res) => {
        // no-op
      },
      { frameOptions: "SAMEORIGIN" }
    );

    const req = mockRequest();
    const res = mockResponse();
    await handler(req, res);

    expect(res.getHeader("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
