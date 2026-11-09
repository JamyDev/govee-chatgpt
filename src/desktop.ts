/** Private desktop entry point. Never listens on a network port. */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GoveeBackend } from './govee.js';
import { DemoBackend } from './demo.js';
import { LightService } from './service.js';
import { createMcp } from './mcp.js';
import { AppError } from './domain.js';

const settingsSchema = z.object({
  mode: z.enum(['demo', 'live']).default('demo'),
  apiKey: z.string().min(1).optional(),
  allowedDevices: z.array(z.string().min(1)).default([]),
}).strict();
async function main() {
  const path = process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'GoveeChatGPT', 'config.json')
    : join(homedir(), '.config', 'govee-chatgpt', 'config.json');
  let settings = settingsSchema.parse({});
  try {
    const data = await readFile(path, 'utf8');
    if (data.length > 16384) throw new Error('oversized');
    settings = settingsSchema.parse(JSON.parse(data.replace(/^\uFEFF/, '')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new AppError('configuration_error', 'Govee local configuration is invalid. Check config.json without sharing its contents in chat.');
  }
  if (settings.mode === 'live' && !settings.apiKey) throw new AppError('configuration_error', 'Live mode requires a key in your private local configuration. Never paste it into chat.');
  const backend = settings.mode === 'live' ? new GoveeBackend(settings.apiKey!) : new DemoBackend();
  const server = createMcp(new LightService(backend, settings.allowedDevices));
  await server.connect(new StdioServerTransport());
  process.stderr.write(`Govee private desktop MCP ready (${settings.mode}).\n`);
  process.on('SIGTERM', () => { void server.close().then(() => process.exit(0)); });
}
main().catch(error => {
  process.stderr.write(`${error instanceof AppError ? error.message : 'Govee desktop server could not start.'}\n`);
  process.exitCode = 1;
});
