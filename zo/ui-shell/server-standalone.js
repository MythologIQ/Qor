#!/usr/bin/env node
/**
 * Zo-Qore OS Unified Server
 * 
 * Routes:
 *   /           → Victor (AI Manager homepage)
 *   /builder/*  → Software Planning Module
 *   /api/*      → Proxy to Qore Runtime (port 7777)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 9380;
const RUNTIME_PORT = 7777;
const API_KEY = process.env.QORE_API_KEY || 'qore_dev_53864b4213623eaba716687ebcc28e08';

// Directories
const ROOT_DIR = __dirname;
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

// Session/checkpoint store (in-memory for now)
let checkpointStore = [];
let sessionStore = {
  id: 'local-session',
  user: 'operator@local',
  status: 'active',
  createdAt: new Date().toISOString()
};

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function mime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function serve(res, filePath) {
  if (!fs.existsSync(filePath)) return false;
  if (fs.statSync(filePath).isDirectory()) return false;
  
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime(filePath), 'Cache-Control': 'no-cache' });
  res.end(content);
  return true;
}

function serveJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function proxy(req, res, targetPath) {
  return new Promise((resolve) => {
    const proxyReq = http.request({
      hostname: 'localhost',
      port: RUNTIME_PORT,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers, 'x-qore-api-key': API_KEY },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });
    proxyReq.on('error', (e) => {
      serveJson(res, 502, { error: 'BAD_GATEWAY', message: e.message });
      resolve();
    });
    req.pipe(proxyReq);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;
  
  console.log(`[Zo-Qore] ${req.method} ${pathname}`);
  
  // Health check
  if (pathname === '/health') {
    return serveJson(res, 200, {
      ready: true,
      assetsDir: ASSETS_DIR,
      builderDir: ROOT_DIR,
      timestamp: new Date().toISOString(),
    });
  }
  
  // UI-specific API routes (served locally, not proxied)
  if (pathname === '/api/hub') {
    return serveJson(res, 200, {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      checkpoints: checkpointStore,
      session: sessionStore,
      user: sessionStore.user,
      systemStatus: 'operational'
    });
  }
  
  if (pathname === '/api/checkpoints') {
    return serveJson(res, 200, { chainValid: true, checkpoints: checkpointStore });
  }
  
  if (pathname === '/api/session') {
    return serveJson(res, 200, sessionStore);
  }
  
  // API proxy to runtime
  if (pathname.startsWith('/api/')) {
    return proxy(req, res, pathname);
  }
  
  // Victor homepage (/)
  if (pathname === '/' || pathname === '') {
    const file = path.join(ASSETS_DIR, 'index.html');
    if (serve(res, file)) return;
  }
  
  // Victor pages
  const victorPages = ['/emails', '/calendar', '/tasks', '/victor', '/victor-dashboard', '/logs'];
  if (victorPages.includes(pathname)) {
    const file = path.join(ASSETS_DIR, pathname.slice(1) + '.html');
    if (serve(res, file)) return;
  }
  
  // Victor assets (explicit check to avoid catching builder assets)
  if (!pathname.startsWith('/builder') && !pathname.startsWith('/ui')) {
    const victorAsset = path.join(ASSETS_DIR, pathname);
    if (serve(res, victorAsset)) return;
  }
  
  // Builder routes (/builder/*)
  if (pathname === '/builder' || pathname === '/builder/') {
    return serve(res, path.join(ROOT_DIR, 'index.html'));
  }
  
  if (pathname.startsWith('/builder/')) {
    // Strip /builder prefix and serve from ROOT_DIR
    const subPath = pathname.slice(9); // Remove '/builder/'
    if (subPath === '' || subPath === '/') {
      return serve(res, path.join(ROOT_DIR, 'index.html'));
    }
    // Serve static file from ROOT_DIR
    const builderFile = path.join(ROOT_DIR, subPath);
    if (serve(res, builderFile)) return;
    // If file not found, serve index.html for SPA routing
    return serve(res, path.join(ROOT_DIR, 'index.html'));
  }
  
  // Legacy routes (/ui/*) - redirect to /builder/
  if (pathname.startsWith('/ui/')) {
    const subPath = pathname.slice(4);
    if (subPath === '' || subPath === '/') {
      return serve(res, path.join(ROOT_DIR, 'index.html'));
    }
    const legacyFile = path.join(ROOT_DIR, subPath);
    if (serve(res, legacyFile)) return;
  }
  
  // 404
  serveJson(res, 404, { error: 'NOT_FOUND', path: pathname });
}

const server = http.createServer(handle);
server.listen(PORT, () => {
  console.log(`[Zo-Qore OS] Running on port ${PORT}`);
  console.log(`  Victor:  http://localhost:${PORT}/`);
  console.log(`  Builder: http://localhost:${PORT}/builder/`);
  console.log(`  API:     http://localhost:${PORT}/api/* → localhost:${RUNTIME_PORT}`);
});
