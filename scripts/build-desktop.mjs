import { build } from 'esbuild';
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const out = resolve('desktop-package');
await mkdir(out, { recursive: true });
await cp('plugin', out, { recursive: true });
await cp('LICENSE', `${out}/LICENSE`);
const result = await build({
  entryPoints: ['src/desktop.ts'], outfile: `${out}/server/govee-desktop.cjs`,
  bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  metafile: true, minify: false, sourcemap: false, legalComments: 'eof',
});
const included = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/node_modules\/(?:@[^/]+\/)?[^/]+/);
  if (match) included.add(match[0]);
}
let notices = '# Bundled dependency notices\n\nThe project’s own code is MIT. Bundled dependencies retain the licenses below.\n';
for (const dir of [...included].sort()) {
  const pkg = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
  notices += `\n## ${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? 'see text below'}\n\n`;
  let found = false;
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'COPYING', 'LICENSE-MIT']) {
    try { notices += await readFile(`${dir}/${name}`, 'utf8'); found = true; break; } catch {}
  }
  if (!found) throw new Error(`Missing license text for ${pkg.name}`);
  notices += '\n';
}
await writeFile(`${out}/THIRD-PARTY-NOTICES.md`, notices);
await writeFile(`${out}/build-info.json`, JSON.stringify({ version: '0.1.1', nodeMinimum: 22, bundledPackages: [...included].sort() }, null, 2));
console.log(`Built desktop plugin at ${out}`);
