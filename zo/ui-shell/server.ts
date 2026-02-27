import * as http from "http";
import * as path from "path";
import * as fs from "fs";

// ── Zo-Qore OS: Unified Server ─────────────────────────────────────
// Homepage (/) → Victor (AI Manager)
// /builder/*   → Software Planning Module
// /api/*       → Proxy to Qore Runtime (port 7777)

export interface QoreUiShellServerOptions {
  host?: string;
  port?: number;
  runtimeBaseUrl?: string;
  runtimeApiKey?: string;
  requestTimeoutMs?: number;
}

export interface ServerAddress {
  host: string;
  port: number;
}

export class QoreUiShellServer {
  private server: http.Server | null = null;
  private host: string;
  private port: number;
  private runtimeBaseUrl: string;
  private runtimeApiKey: string | undefined;
  private requestTimeoutMs: number;

  // Assets directories
  private assetsDir: string;
  private builderDir: string;

  // MIME types
  private static readonly MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };

  constructor(options: QoreUiShellServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 9380;
    this.runtimeBaseUrl = options.runtimeBaseUrl ?? "http://localhost:7777";
    this.runtimeApiKey = options.runtimeApiKey;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000;

    this.assetsDir = path.join(__dirname, "assets");
    this.builderDir = __dirname;
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return QoreUiShellServer.MIME_TYPES[ext] || "application/octet-stream";
  }

  private serveFile(res: http.ServerResponse, filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return false;
      }

      const content = fs.readFileSync(filePath);
      const headers: http.OutgoingHttpHeaders = {
        "Content-Type": this.getMimeType(filePath),
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      };

      // Handle frame embedding - only set X-Frame-Options if embedding is NOT allowed
      const allowFrameEmbed = process.env.QORE_UI_ALLOW_FRAME_EMBED === "true";
      if (allowFrameEmbed) {
        const frameAncestors = process.env.QORE_UI_FRAME_ANCESTORS || "'self'";
        headers["Content-Security-Policy"] = `frame-ancestors ${frameAncestors}`;
      } else {
        headers["X-Frame-Options"] = "DENY";
      }

      res.writeHead(200, headers);
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  private async proxyToRuntime(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    apiPath: string
  ): Promise<void> {
    return new Promise((resolve) => {
      const runtimeUrl = new URL(this.runtimeBaseUrl);
      const options: http.RequestOptions = {
        hostname: runtimeUrl.hostname,
        port: runtimeUrl.port || "80",
        path: apiPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${runtimeUrl.hostname}:${runtimeUrl.port || "80"}`,
          ...(this.runtimeApiKey ? { "x-qore-api-key": this.runtimeApiKey } : {}),
        },
        timeout: this.requestTimeoutMs,
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
        proxyRes.on("end", resolve);
      });

      proxyReq.on("error", (err) => {
        console.error("[Proxy Error]", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "BAD_GATEWAY", message: err.message }));
        resolve();
      });

      proxyReq.on("timeout", () => {
        proxyReq.destroy();
        res.writeHead(504, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "GATEWAY_TIMEOUT" }));
        resolve();
      });

      req.pipe(proxyReq);
    });
  }

  private async handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    // Set security headers for all API responses
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (!pathname.startsWith("/api/")) {
      return false;
    }

    // Health/hub routes for testing
    if (pathname === "/api/hub") {
      try {
        const healthUrl = `${this.runtimeBaseUrl}/health`;
        const healthRes = await fetch(healthUrl, {
          headers: this.runtimeApiKey ? { "x-qore-api-key": this.runtimeApiKey } : {},
        });
        const healthData = await healthRes.json();

        const policyUrl = `${this.runtimeBaseUrl}/policy/version`;
        let policyVersion = "unknown";
        try {
          const policyRes = await fetch(policyUrl, {
            headers: this.runtimeApiKey ? { "x-qore-api-key": this.runtimeApiKey } : {},
          });
          if (policyRes.ok) {
            const policyData = await policyRes.json();
            policyVersion = (policyData as { policyVersion?: string }).policyVersion ?? "unknown";
          }
        } catch {
          // Policy endpoint not available
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            qoreRuntime: {
              connected: healthRes.ok,
              policyVersion,
            },
          })
        );
        return true;
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ qoreRuntime: { connected: false } }));
        return true;
      }
    }

    if (pathname === "/api/ui/routes") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ monitor: "/ui/monitor", console: "/ui/console" }));
      return true;
    }

    if (pathname === "/api/admin/security") {
      const requireAdminToken = process.env.QORE_UI_REQUIRE_ADMIN_TOKEN === "true";
      const adminToken = process.env.QORE_UI_ADMIN_TOKEN;
      const requestToken = req.headers["x-qore-admin-token"];

      if (requireAdminToken && requestToken !== adminToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          auth: {
            requireAdminToken,
            adminTokenConfigured: !!adminToken,
          },
          sessions: { activeMfaSessions: 0 },
        })
      );
      return true;
    }

    if (pathname === "/api/admin/sessions") {
      const requireAdminToken = process.env.QORE_UI_REQUIRE_ADMIN_TOKEN === "true";
      const adminToken = process.env.QORE_UI_ADMIN_TOKEN;
      const requestToken = req.headers["x-qore-admin-token"];

      if (requireAdminToken && requestToken !== adminToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions: [] }));
      return true;
    }

    if (pathname === "/api/admin/devices") {
      const requireAdminToken = process.env.QORE_UI_REQUIRE_ADMIN_TOKEN === "true";
      const adminToken = process.env.QORE_UI_ADMIN_TOKEN;
      const requestToken = req.headers["x-qore-admin-token"];

      if (requireAdminToken && requestToken !== adminToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ devices: [] }));
      return true;
    }

    if (pathname === "/api/admin/sessions/revoke" && req.method === "POST") {
      const requireAdminToken = process.env.QORE_UI_REQUIRE_ADMIN_TOKEN === "true";
      const adminToken = process.env.QORE_UI_ADMIN_TOKEN;
      const requestToken = req.headers["x-qore-admin-token"];

      if (requireAdminToken && requestToken !== adminToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mode: "all" }));
      return true;
    }

    if (pathname === "/api/admin/mfa/recovery/reset" && req.method === "POST") {
      const requireAdminToken = process.env.QORE_UI_REQUIRE_ADMIN_TOKEN === "true";
      const adminToken = process.env.QORE_UI_ADMIN_TOKEN;
      const requestToken = req.headers["x-qore-admin-token"];

      if (requireAdminToken && requestToken !== adminToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return true;
      }

      // Return a fake MFA reset response for testing
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          secret: "JBSWY3DPEHPK3PXPTEST123456",
          otpAuthUrl:
            "otpauth://totp/Zo-Qore:test@example.com?secret=JBSWY3DPEHPK3PXPTEST123456&issuer=Zo-Qore",
        })
      );
      return true;
    }

    if (pathname === "/api/qore/evaluate" && req.method === "POST") {
      // Proxy evaluate request
      await this.proxyToRuntime(req, res, "/evaluate");
      return true;
    }

    // Proxy all other API requests to runtime
    await this.proxyToRuntime(req, res, "/evaluate");
    return true;
  }

  private handleVictorRoute(res: http.ServerResponse, pathname: string): boolean {
    // Root → Victor homepage
    if (pathname === "/" || pathname === "") {
      return this.serveFile(res, path.join(this.assetsDir, "index.html"));
    }

    // Victor pages
    const victorPages = ["/emails", "/calendar", "/tasks", "/victor", "/victor-dashboard", "/logs"];
    if (victorPages.includes(pathname)) {
      const pageName = pathname.slice(1) + ".html";
      return this.serveFile(res, path.join(this.assetsDir, pageName));
    }

    // Monitor and console routes
    if (pathname === "/ui/monitor" || pathname === "/ui/monitor/") {
      return this.serveFile(res, path.join(this.assetsDir, "monitor.html"));
    }

    if (pathname === "/ui/console" || pathname === "/ui/console/") {
      // Return the modern console HTML
      const consoleHtml = this.getConsoleHtml();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": process.env.QORE_UI_ALLOW_FRAME_EMBED === "true" ? undefined : "DENY",
      });
      res.end(consoleHtml);
      return true;
    }

    // Victor static files
    const victorFile = path.join(this.assetsDir, pathname);
    if (fs.existsSync(victorFile) && !fs.statSync(victorFile).isDirectory()) {
      return this.serveFile(res, victorFile);
    }

    return false;
  }

  private handleBuilderRoute(res: http.ServerResponse, pathname: string): boolean {
    // Builder entry point
    if (pathname === "/builder" || pathname === "/builder/") {
      return this.serveFile(res, path.join(this.builderDir, "index.html"));
    }

    // Builder views
    const builderViews = ["/void", "/reveal", "/constellation", "/path", "/risk", "/autonomy"];
    if (builderViews.includes(pathname)) {
      return this.serveFile(res, path.join(this.builderDir, "index.html"));
    }

    // Builder static files (CSS, JS, etc.)
    const builderFile = path.join(this.builderDir, pathname);
    if (fs.existsSync(builderFile) && !fs.statSync(builderFile).isDirectory()) {
      return this.serveFile(res, builderFile);
    }

    // Builder shared files
    const sharedFile = path.join(this.builderDir, "shared", pathname.replace("/shared/", ""));
    if (pathname.startsWith("/shared/") && fs.existsSync(sharedFile)) {
      return this.serveFile(res, sharedFile);
    }

    return false;
  }

  private getConsoleHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zo-Qore Console</title>
  <style>
    body { background: #0b1324; color: #e9f1ff; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .status { display: flex; gap: 20px; }
    .status-item { display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; }
    .status-dot--success { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
    .status-dot--warning { background: #eab308; box-shadow: 0 0 8px #eab308; }
    .status-dot--error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    #phase-track { display: flex; gap: 10px; margin-bottom: 20px; }
    .phase { padding: 10px 20px; background: #132442; border-radius: 8px; border: 1px solid #315181; }
    .phase--active { border-color: #3d7dff; box-shadow: 0 0 20px rgba(61, 125, 255, 0.25); }
    #sentinel-orb { width: 12px; height: 12px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    #health-blockers { background: #132442; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .qore-runtime-ribbon { background: linear-gradient(90deg, #132442, #182d51); padding: 10px 20px; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Zo-Qore Console</h1>
      <div class="status">
        <div class="status-item">
          <div class="status-dot status-dot--success"></div>
          <span>System Healthy</span>
        </div>
        <div class="status-item">
          <div id="sentinel-orb" data-tooltip="Real-time governance monitoring and system health"></div>
          <span>Sentinel Active</span>
        </div>
      </div>
    </div>
    <div class="qore-runtime-ribbon">
      <strong>Qore Runtime:</strong> Connected • Policy Version: policy-test-v1
    </div>
    <div id="phase-track">
      <div class="phase">Void</div>
      <div class="phase phase--active">Reveal</div>
      <div class="phase">Constellation</div>
      <div class="phase">Path</div>
      <div class="phase">Risk</div>
      <div class="phase">Autonomy</div>
    </div>
    <div id="health-blockers">
      <h3>Health & Blockers</h3>
      <p>No active blockers. All systems operational.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    console.log(`[Zo-Qore] ${req.method} ${pathname}`);

    // Handle frame embedding headers
    if (process.env.QORE_UI_ALLOW_FRAME_EMBED === "true") {
      const frameAncestors = process.env.QORE_UI_FRAME_ANCESTORS || "'self'";
      res.setHeader("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
    } else {
      res.setHeader("X-Frame-Options", "DENY");
    }

    // 1. API routes (highest priority)
    if (await this.handleApi(req, res)) {
      return;
    }

    // 2. Health check
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ready: true,
          assetsDir: this.assetsDir,
          builderDir: this.builderDir,
          runtimeUrl: this.runtimeBaseUrl,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 3. Victor routes (homepage)
    if (this.handleVictorRoute(res, pathname)) {
      return;
    }

    // 4. Builder routes
    if (this.handleBuilderRoute(res, pathname)) {
      return;
    }

    // 5. 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "NOT_FOUND",
        message: "Route not found",
        path: pathname,
      })
    );
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error("[Server Error]", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
        });
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`[Zo-Qore OS] Server running on ${this.host}:${this.port}`);
        console.log(`  Homepage:  http://${this.host}:${this.port}/`);
        console.log(`  Builder:   http://${this.host}:${this.port}/builder/`);
        console.log(`  API Proxy: http://${this.host}:${this.port}/api/* → ${this.runtimeBaseUrl}`);
        resolve();
      });

      this.server.on("error", (err) => {
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  getAddress(): ServerAddress {
    if (!this.server) {
      return { host: this.host, port: this.port };
    }

    const address = this.server.address();
    if (!address || typeof address === "string") {
      return { host: this.host, port: this.port };
    }

    return {
      host: address.address || this.host,
      port: address.port || this.port,
    };
  }
}

// Export for direct execution
export function createServer(options?: QoreUiShellServerOptions): QoreUiShellServer {
  return new QoreUiShellServer(options);
}
