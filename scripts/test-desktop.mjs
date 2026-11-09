import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const temp = await mkdtemp(join(tmpdir(), 'govee-plugin-test-'));
const home = join(temp, 'home');
const appdata = join(home, 'AppData', 'Roaming');
const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appdata };
const marketplace = join(home, '.agents', 'plugins', 'marketplace.json');
const unrelated = { name: 'existing-plugin', source: './existing', policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' };
let client;
try {
  await mkdir(join(home, '.agents', 'plugins'), { recursive: true });
  await writeFile(marketplace, JSON.stringify({ name: 'test-personal', plugins: [unrelated] }));
  execFileSync(process.execPath, [resolve('desktop-package/install-local.cjs')], { env, stdio: 'pipe' });
  const catalog = JSON.parse(await readFile(marketplace, 'utf8'));
  assert.equal(catalog.name, 'test-personal');
  assert.deepEqual(catalog.plugins[0], unrelated);
  assert.equal(catalog.plugins.length, 2);
  assert.throws(() => execFileSync(process.execPath, [resolve('desktop-package/install-local.cjs')], { env, stdio: 'pipe' }));
  const root = join(home, '.codex', 'plugins', 'govee-lights-local-0.1.1');
  const manifest = JSON.parse(await readFile(join(root, 'mcp.json'), 'utf8'));
  const mcp = manifest.mcpServers.govee;
  assert.equal(mcp.command, process.execPath);
  client = new Client({ name: 'desktop-package-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: mcp.command, args: mcp.args.map(s => s.replaceAll('${PLUGIN_ROOT}', root)), cwd: root, env, stderr: 'pipe' }));
  assert.equal((await client.listTools()).tools.length, 8);
  const listed = await client.callTool({ name: 'list_lights', arguments: {} });
  assert.equal(listed.structuredContent.demo, true);
  const lightId = listed.structuredContent.lights[0].lightId;
  await client.callTool({ name: 'set_light_power', arguments: { lightId, on: true } });
  const state = await client.callTool({ name: 'get_light_state', arguments: { lightId } });
  assert.equal(state.structuredContent.power, 1);
  console.log('Desktop package: isolated registration, safe repeat behavior, bundled launch and 8-tool demo smoke passed.');
} finally {
  if (client) await client.close();
  await rm(temp, { recursive: true, force: true });
}
