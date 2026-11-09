import express, { type ErrorRequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcp } from './mcp.js';
import { challenge, tokenVerifier, type VerifyToken } from './auth.js';
import type { Config } from './config.js';
import type { LightService } from './service.js';

export function createApp(config: Config, service: LightService, verify: VerifyToken | undefined = config.auth ? tokenVerifier(config.auth) : undefined) {
  const app = express();
  app.disable('x-powered-by');
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]', ...(config.auth ? [new URL(config.auth.resource).hostname] : [])]);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const host = req.headers.host;
    let hostname: string;
    try { hostname = new URL(`http://${host}`).hostname; } catch { res.sendStatus(403); return; }
    if (!host || !allowedHosts.has(hostname)) { res.sendStatus(403); return; }
    // Server-to-server MCP needs no CORS. Reject browser origins unless exactly our own.
    if (req.headers.origin && (!config.auth || req.headers.origin !== new URL(config.auth.resource).origin)) { res.sendStatus(403); return; }
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', mode: config.mode }));
  if (config.auth) {
    const metadata = { resource: config.auth.resource, authorization_servers: [config.auth.issuer], scopes_supported: ['govee:read', 'govee:control'], bearer_methods_supported: ['header'] };
    app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json(metadata));
  }
  app.use('/mcp', async (req, res, next) => {
    if (!config.auth) { next(); return; }
    const bearer = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    try {
      if (!bearer || !verify) throw new Error();
      res.locals.identity = await verify(bearer);
      if (!res.locals.identity.scopes.includes('govee:read')) {
        res.setHeader('WWW-Authenticate', challenge(config.auth)); res.status(403).json({ error: 'insufficient_scope' }); return;
      }
      next();
    } catch {
      res.setHeader('WWW-Authenticate', challenge(config.auth));
      res.status(401).json({ error: 'unauthorized' });
    }
  });
  app.use('/mcp', express.json({ limit: '32kb', strict: true }));
  app.post('/mcp', async (req, res) => {
    const connection = new AbortController();
    const server = createMcp(service, res.locals.identity, config.auth, connection.signal);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { connection.abort(); void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'mcp_request_failed' }); }
  });
  app.all('/mcp', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'method_not_allowed' }); });
  const safeError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error?.type === 'entity.too.large' ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'request_too_large' : 'invalid_request' });
  };
  app.use(safeError);
  return app;
}
