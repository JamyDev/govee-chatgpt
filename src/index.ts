import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfig } from './config.js';
import { GoveeBackend } from './govee.js';
import { DemoBackend } from './demo.js';
import { LightService } from './service.js';
import { createMcp } from './mcp.js';
import { createApp } from './http.js';
import { AppError } from './domain.js';

try {
  const config = readConfig();
  const backend = config.mode === 'demo' ? new DemoBackend() : new GoveeBackend(config.apiKey!);
  const service = new LightService(backend, config.allowedDevices);
  if (config.transport === 'stdio') {
    // stdio is private to its process owner. OAuth applies only to HTTP deployments.
    const server = createMcp(service);
    await server.connect(new StdioServerTransport());
    process.stderr.write(`Govee MCP started on stdio (${config.mode}).\n`);
    process.on('SIGTERM', () => { void server.close().then(() => process.exit(0)); });
  } else {
    const server = createApp(config, service).listen(config.port, config.host, () => {
      process.stderr.write(`Govee MCP listening on ${config.host}:${config.port}/mcp (${config.mode}).\n`);
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    server.on('error', () => { process.stderr.write('Unable to start HTTP server. Check host and port.\n'); process.exitCode = 1; });
    const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  }
} catch (error) {
  process.stderr.write(`${error instanceof AppError ? error.message : 'Startup failed. Check server configuration.'}\n`);
  process.exitCode = 1;
}
