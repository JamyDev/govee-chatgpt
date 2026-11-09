#!/usr/bin/env node
/* Register this private plugin in the user's local desktop marketplace. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.error('Node.js 22 or newer is required. Install it from https://nodejs.org/ then retry.'); process.exit(1); }
const source = __dirname;
const home = os.homedir();
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
const name = manifest.name;
if (name !== 'govee-lights-local' || manifest.version !== '0.1.1') throw new Error('Unexpected plugin package.');
const relative = `.codex/plugins/${name}-${manifest.version}`;
const destination = path.join(home, ...relative.split('/'));
const catalogDir = path.join(home, '.agents', 'plugins');
const catalogPath = path.join(catalogDir, 'marketplace.json');
let catalog = { name: 'personal-local', interface: { displayName: 'Personal local plugins' }, plugins: [] };
let previous;
if (fs.existsSync(catalogPath)) {
  previous = fs.readFileSync(catalogPath, 'utf8');
  catalog = JSON.parse(previous.replace(/^\uFEFF/, ''));
  if (!catalog || typeof catalog.name !== 'string' || !Array.isArray(catalog.plugins)) throw new Error('Existing marketplace format is unexpected; nothing was changed.');
}
if (fs.existsSync(destination)) {
  console.error(`The destination already exists: ${destination}\nNothing was overwritten. Keep it or choose a newer plugin version.`);
  process.exit(1);
}
if (!fs.existsSync(path.join(source, 'server', 'govee-desktop.cjs'))) throw new Error('The bundled server is missing.');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
// Pin the runtime found by this install, so the desktop app does not rely on PATH.
for (const file of ['mcp.json', '.mcp.json']) {
  const filePath = path.join(destination, file);
  const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  config.mcpServers.govee.command = process.execPath;
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
}
const entry = { name, source: { source: 'local', path: `./${relative}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' };
const existing = catalog.plugins.findIndex(item => item.name === name);
if (existing >= 0) catalog.plugins[existing] = entry; else catalog.plugins.push(entry);
fs.mkdirSync(catalogDir, { recursive: true });
if (previous !== undefined) fs.writeFileSync(`${catalogPath}.backup-${Date.now()}`, previous, { flag: 'wx' });
const temporary = `${catalogPath}.govee-${process.pid}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' });
fs.renameSync(temporary, catalogPath);
console.log(`Registered Govee Lights (Local) in marketplace: ${catalog.name}`);
console.log('Restart the ChatGPT desktop app, open Plugins, select your personal local marketplace, and install Govee Lights (Local).');
console.log('Start a locally executing chat. Ask: List my Govee lights and tell me whether demo mode is active.');
console.log('This registration did not configure credentials or touch real lights.');
