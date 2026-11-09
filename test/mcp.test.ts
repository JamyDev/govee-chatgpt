import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { DemoBackend } from '../src/demo.js';
import { LightService } from '../src/service.js';
import { createApp } from '../src/http.js';
import { createMcp } from '../src/mcp.js';
import { readConfig, type Config } from '../src/config.js';

async function withServer(config: Config, fn: (url: string) => Promise<void>, verify?: any) {
  const server = createApp(config, new LightService(new DemoBackend()), verify).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as any).port;
  try { await fn(`http://127.0.0.1:${port}`); } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
test('real MCP HTTP client initializes, lists eight tools, and executes demo controls', async () => {
  await withServer(readConfig({}), async url => {
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
    try {
      const tools = (await client.listTools()).tools;
      assert.equal(tools.length, 8);
      for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, tool.name.startsWith('list_') || tool.name.startsWith('get_'));
      const listed = await client.callTool({ name: 'list_lights', arguments: {} });
      const id = (listed.structuredContent as any).lights[0].lightId;
      const changed = await client.callTool({ name: 'set_light_color', arguments: { lightId: id, red: 1, green: 2, blue: 3 } });
      assert.equal((changed.structuredContent as any).requestedValue, 66051);
      const state = await client.callTool({ name: 'get_light_state', arguments: { lightId: id } });
      assert.equal((state.structuredContent as any).rgb, 66051);
      const invalid = await client.callTool({ name: 'set_light_brightness', arguments: { lightId: id, brightness: 0 } });
      assert.equal(invalid.isError, true);
      const extra = await client.callTool({ name: 'list_lights', arguments: { apiKey: 'DO-NOT-ACCEPT' } });
      assert.equal(extra.isError, true);
    } finally { await client.close(); }
  });
});
test('HTTP rejects DNS rebinding, browser origins, bad JSON and excess payloads', async () => {
  await withServer(readConfig({}), async url => {
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    const status = await new Promise<number | undefined>((resolve, reject) => { const req = request(`${url}/healthz`, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(status, 403);
    assert.equal((await fetch(`${url}/mcp`, { method: 'POST', headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'broken' })).status, 400);
    assert.equal((await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'x'.repeat(40000) }) })).status, 413);
    assert.equal((await fetch(`${url}/mcp`)).status, 405);
  });
});
test('OAuth metadata and all MCP requests require verified tokens', async () => {
  const config = readConfig({ OAUTH_ISSUER: 'https://issuer.example', OAUTH_JWKS_URL: 'https://issuer.example/jwks', MCP_RESOURCE_URL: 'https://mcp.example/mcp', OAUTH_ALLOWED_SUBJECTS: 'owner' });
  const verify = async (token: string) => { if (token !== 'valid') throw Error('private'); return { subject: 'owner', scopes: [] }; };
  await withServer(config, async url => {
    const meta = await (await fetch(`${url}/.well-known/oauth-protected-resource/mcp`)).json();
    assert.equal(meta.resource, 'https://mcp.example/mcp');
    const missing = await fetch(`${url}/mcp`, { method: 'POST' });
    assert.equal(missing.status, 401); assert.match(missing.headers.get('WWW-Authenticate')!, /resource_metadata/);
    const bad = await fetch(`${url}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer bad' } });
    assert.equal(bad.status, 401); assert.ok(!(await bad.text()).includes('private'));
    const noScope = await fetch(`${url}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer valid' } });
    assert.equal(noScope.status, 403);
  }, verify);
});
test('read-only auth cannot invoke writes even over direct MCP', async () => {
  const config = readConfig({ OAUTH_ISSUER: 'https://issuer.example', OAUTH_JWKS_URL: 'https://issuer.example/jwks', MCP_RESOURCE_URL: 'https://mcp.example/mcp', OAUTH_ALLOWED_SUBJECTS: 'owner' });
  const service = new LightService(new DemoBackend());
  const server = createMcp(service, { subject: 'owner', scopes: ['govee:read'] }, config.auth);
  const client = new Client({ name: 'test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const id = (await service.list()).lights[0]!.lightId;
    const result = await client.callTool({ name: 'set_light_power', arguments: { lightId: id, on: true } });
    assert.equal(result.isError, true); assert.ok(result._meta?.['mcp/www_authenticate']);
    assert.equal((await service.state(id)).power, 0);
  } finally { await client.close(); await server.close(); }
});
test('every write tool enforces control scope and publishes auth metadata', async () => {
  const config = readConfig({ OAUTH_ISSUER: 'https://issuer.example', OAUTH_JWKS_URL: 'https://issuer.example/jwks', MCP_RESOURCE_URL: 'https://mcp.example/mcp', OAUTH_ALLOWED_SUBJECTS: 'owner' });
  const service = new LightService(new DemoBackend());
  const server = createMcp(service, { subject: 'owner', scopes: ['govee:read'] }, config.auth);
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const lightId = (await service.list()).lights[0]!.lightId;
    const sceneId = (await service.listScenes(lightId)).scenes[0]!.sceneId;
    const cases = [
      ['set_light_power', { lightId, on: true }], ['set_light_brightness', { lightId, brightness: 12 }],
      ['set_light_color', { lightId, red: 1, green: 2, blue: 3 }], ['set_light_temperature', { lightId, kelvin: 2700 }],
      ['set_light_scene', { lightId, sceneId }],
    ] as const;
    const tools = (await client.listTools()).tools;
    for (const [name, args] of cases) {
      const result = await client.callTool({ name, arguments: args }); assert.equal(result.isError, true);
      const metadata: any = tools.find(t => t.name === name)?._meta;
      assert.deepEqual(metadata.securitySchemes[0].scopes, ['govee:read', 'govee:control']);
    }
    assert.equal((await service.state(lightId)).power, 0);
  } finally { await client.close(); await server.close(); }
});
