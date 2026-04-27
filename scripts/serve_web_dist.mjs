#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIST_DIR = path.join(PROJECT_ROOT, 'web', 'dist');

const HTTP_PROXY_PREFIXES = ['/api', '/folders', '/resources', '/var'];
// T2459-G16 — `/api` added so WebSocket endpoints under the API
// namespace (e.g. /api/devices/ws from T2459-G2) upgrade through the
// preview server proxy. Previously only /ws and /pipedal upgraded.
const UPGRADE_PROXY_PREFIXES = ['/ws', '/pipedal', '/api'];
const STATIC_PREFIXES = ['/assets/', '/css/', '/img/', '/posters/'];

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Source maps must never reach end-user browsers — they leak the full TS source.
function isForbiddenStaticPath(pathname) {
  return pathname.endsWith('.map');
}

// Local-network audio control plane: lock script/style to same-origin and allow
// WebSocket + HTTP backend on :8080. CSP is intentionally strict — adjust only
// when the app truly needs another origin.
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function parseArgs(argv) {
  const args = {
    backendHost: process.env.MAP2_BACKEND_HOST || '127.0.0.1',
    backendPort: Number(process.env.MAP2_BACKEND_PORT || 8080),
    distDir: process.env.MAP2_WEB_DIST_DIR || DEFAULT_DIST_DIR,
    host: process.env.HOST || process.env.MAP2_WEB_HOST || '0.0.0.0',
    port: Number(process.env.PORT || process.env.MAP2_WEB_PORT || 3000),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === '--host' && value) {
      args.host = value;
      index += 1;
    } else if (arg === '--port' && value) {
      args.port = Number(value);
      index += 1;
    } else if (arg === '--dist' && value) {
      args.distDir = value;
      index += 1;
    } else if (arg === '--backend-host' && value) {
      args.backendHost = value;
      index += 1;
    } else if (arg === '--backend-port' && value) {
      args.backendPort = Number(value);
      index += 1;
    }
  }

  return args;
}

function stripQuery(pathname) {
  return pathname.split('?')[0].split('#')[0];
}

function startsWithSegment(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isHttpProxyPath(pathname) {
  return HTTP_PROXY_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix));
}

function isUpgradeProxyPath(pathname) {
  return UPGRADE_PROXY_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix));
}

function hasExtension(pathname) {
  return path.posix.extname(pathname) !== '';
}

function shouldServeSpaFallback(pathname) {
  if (pathname === '/') {
    return true;
  }
  if (isHttpProxyPath(pathname) || isUpgradeProxyPath(pathname)) {
    return false;
  }
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return !hasExtension(pathname);
}

function isImmutableAsset(pathname) {
  return pathname.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\./.test(path.basename(pathname));
}

function cacheControlForPath(pathname, isHtmlFallback = false) {
  if (isHtmlFallback || pathname === '/index.html') {
    return 'no-store, must-revalidate';
  }
  if (isImmutableAsset(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safeJoin(rootDir, requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalized = path.posix.normalize(decodedPath);
  const stripped = normalized.replace(/^(\.\.(\/|\\|$))+/, '');
  const relative = stripped.replace(/^\/+/, '');
  const resolved = path.resolve(rootDir, relative);
  const rootResolved = path.resolve(rootDir);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    return null;
  }
  return resolved;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function sendFile(response, filePath, requestPath, method, isHtmlFallback = false) {
  const stat = await fs.promises.stat(filePath);
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'Cache-Control': cacheControlForPath(requestPath, isHtmlFallback),
    'Content-Length': stat.size,
    'Content-Type': contentTypeFor(filePath),
  });

  if (method === 'HEAD') {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

function sendText(response, statusCode, message) {
  const body = `${message}\n`;
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function proxyHttpRequest(request, response, backendHost, backendPort) {
  const proxyRequest = http.request(
    {
      headers: {
        ...request.headers,
        host: `${backendHost}:${backendPort}`,
      },
      hostname: backendHost,
      method: request.method,
      path: request.url,
      port: backendPort,
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on('error', (error) => {
    if (!response.headersSent) {
      sendText(response, 502, `Backend proxy error: ${error.message}`);
    } else {
      response.destroy(error);
    }
  });

  request.pipe(proxyRequest);
}

function trackSocket(registry, socket) {
  registry.add(socket);
  socket.on('close', () => {
    registry.delete(socket);
  });
  return socket;
}

function destroyTrackedSockets(registry) {
  for (const socket of registry) {
    socket.destroy();
  }
}

function proxyUpgrade(request, socket, head, backendHost, backendPort, auxiliarySockets) {
  const backendSocket = net.connect(backendPort, backendHost, () => {
    let headerBlock = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          headerBlock += `${name}: ${entry}\r\n`;
        }
      } else if (value !== undefined) {
        headerBlock += `${name}: ${value}\r\n`;
      }
    }
    headerBlock += '\r\n';
    backendSocket.write(headerBlock);
    if (head.length > 0) {
      backendSocket.write(head);
    }
    socket.pipe(backendSocket).pipe(socket);
  });
  trackSocket(auxiliarySockets, backendSocket);

  backendSocket.on('error', () => {
    socket.destroy();
  });

  socket.on('error', () => {
    backendSocket.destroy();
  });
}

function createServer(options) {
  const distDir = path.resolve(options.distDir);
  const indexPath = path.join(distDir, 'index.html');
  const clientSockets = new Set();
  const auxiliarySockets = new Set();

  const server = http.createServer(async (request, response) => {
    const method = request.method || 'GET';
    const pathname = stripQuery(request.url || '/');

    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) {
      sendText(response, 405, 'Method Not Allowed');
      return;
    }

    if (isHttpProxyPath(pathname)) {
      proxyHttpRequest(request, response, options.backendHost, options.backendPort);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendText(response, 405, 'Method Not Allowed');
      return;
    }

    if (isForbiddenStaticPath(pathname)) {
      sendText(response, 404, 'Not Found');
      return;
    }

    const requestPath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = safeJoin(distDir, requestPath);
    if (resolvedPath === null) {
      sendText(response, 400, 'Bad Request');
      return;
    }

    if (await fileExists(resolvedPath)) {
      await sendFile(response, resolvedPath, requestPath, method);
      return;
    }

    if (shouldServeSpaFallback(pathname) && await fileExists(indexPath)) {
      await sendFile(response, indexPath, '/index.html', method, true);
      return;
    }

    sendText(response, 404, 'Not Found');
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = stripQuery(request.url || '/');
    if (!isUpgradeProxyPath(pathname)) {
      socket.destroy();
      return;
    }
    proxyUpgrade(request, socket, head, options.backendHost, options.backendPort, auxiliarySockets);
  });

  server.on('clientError', (error, socket) => {
    if (socket.writable) {
      socket.end(`HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n${error.message}`);
    } else {
      socket.destroy();
    }
  });

  server.on('connection', (socket) => {
    trackSocket(clientSockets, socket);
  });

  server.destroyTrackedConnections = () => {
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    destroyTrackedSockets(clientSockets);
    destroyTrackedSockets(auxiliarySockets);
  };

  return server;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const distDir = path.resolve(options.distDir);

  if (!await fileExists(path.join(distDir, 'index.html'))) {
    console.error(`MAP2 production web bundle not found: ${path.join(distDir, 'index.html')}`);
    process.exitCode = 1;
    return;
  }

  const server = createServer(options);
  server.listen(options.port, options.host, () => {
    console.log(
      `MAP2 production web server listening on http://${options.host}:${options.port} ` +
      `(dist=${distDir}, backend=${options.backendHost}:${options.backendPort})`,
    );
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down MAP2 production web server`);
    server.close(() => {
      process.exit(0);
    });
    server.destroyTrackedConnections?.();
    const forcedExitTimer = setTimeout(() => {
      server.destroyTrackedConnections?.();
      process.exit(0);
    }, 2000);
    forcedExitTimer.unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export {
  cacheControlForPath,
  contentTypeFor,
  createServer,
  isForbiddenStaticPath,
  isHttpProxyPath,
  isUpgradeProxyPath,
  parseArgs,
  SECURITY_HEADERS,
  shouldServeSpaFallback,
  safeJoin,
};
