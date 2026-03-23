/**
 * Security Headers Middleware
 *
 * Adds security-related HTTP headers to protect against common vulnerabilities:
 * - XSS attacks
 * - Clickjacking
 * - MIME sniffing
 * - Protocol downgrade attacks
 */

import * as http from "http";

export interface SecurityHeadersConfig {
  /** Content Security Policy directive */
  contentSecurityPolicy?: string | false;
  /** Strict Transport Security max age (seconds) */
  hstsMaxAge?: number;
  /** Include subdomains in HSTS */
  hstsIncludeSubdomains?: boolean;
  /** X-Frame-Options value */
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  /** Referrer Policy */
  referrerPolicy?: string;
  /** Permissions Policy */
  permissionsPolicy?: string | false;
}

const DEFAULT_CONFIG: Required<SecurityHeadersConfig> = {
  // Default CSP: restrict to self, allow inline styles (needed for many frameworks)
  contentSecurityPolicy:
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
  // HSTS: 1 year, include subdomains
  hstsMaxAge: 31536000,
  hstsIncludeSubdomains: true,
  // Prevent framing
  frameOptions: "DENY",
  // Don't leak referrer to other origins
  referrerPolicy: "strict-origin-when-cross-origin",
  // Disable dangerous browser features
  permissionsPolicy: "geolocation=(), microphone=(), camera=()",
};

/**
 * Security headers middleware wrapper
 */
export function withSecurityHeaders<
  T extends (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>
>(handler: T, config: SecurityHeadersConfig = {}): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // Content Security Policy
    if (mergedConfig.contentSecurityPolicy !== false) {
      res.setHeader("Content-Security-Policy", mergedConfig.contentSecurityPolicy);
    }

    // Strict Transport Security (HTTPS only)
    const protocol = req.headers["x-forwarded-proto"] ?? "http";
    if (protocol === "https") {
      let hsts = `max-age=${mergedConfig.hstsMaxAge}`;
      if (mergedConfig.hstsIncludeSubdomains) {
        hsts += "; includeSubDomains";
      }
      res.setHeader("Strict-Transport-Security", hsts);
    }

    // X-Frame-Options
    if (mergedConfig.frameOptions !== false) {
      res.setHeader("X-Frame-Options", mergedConfig.frameOptions);
    }

    // X-Content-Type-Options (prevent MIME sniffing)
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Referrer-Policy
    res.setHeader("Referrer-Policy", mergedConfig.referrerPolicy);

    // Permissions-Policy
    if (mergedConfig.permissionsPolicy !== false) {
      res.setHeader("Permissions-Policy", mergedConfig.permissionsPolicy);
    }

    // X-XSS-Protection (legacy, but doesn't hurt)
    res.setHeader("X-XSS-Protection", "1; mode=block");

    await handler(req, res);
  };
}

/**
 * Pre-configured security header sets
 */
export const SecurityHeaderPresets = {
  /**
   * Strict security (recommended for production)
   */
  strict: (config?: SecurityHeadersConfig) =>
    withSecurityHeaders(
      async () => {},
      {
        ...config,
        contentSecurityPolicy:
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
        frameOptions: "DENY",
        hstsMaxAge: 31536000,
        hstsIncludeSubdomains: true,
      }
    ),

  /**
   * Standard security (balanced for most apps)
   */
  standard: (config?: SecurityHeadersConfig) => withSecurityHeaders(async () => {}, config),

  /**
   * Relaxed security (for development/testing)
   */
  relaxed: (config?: SecurityHeadersConfig) =>
    withSecurityHeaders(
      async () => {},
      {
        ...config,
        contentSecurityPolicy:
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; font-src * data:; connect-src *",
        frameOptions: "SAMEORIGIN",
        hstsMaxAge: 0,
      }
    ),

  /**
   * API-only security (minimal headers for JSON APIs)
   */
  apiOnly: (config?: SecurityHeadersConfig) =>
    withSecurityHeaders(
      async () => {},
      {
        ...config,
        contentSecurityPolicy: false,
        frameOptions: false,
        permissionsPolicy: false,
      }
    ),
};
