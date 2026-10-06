#!/usr/bin/env node
// Packages dist/ into a folder that works when index.html is double-clicked (file://):
// - absolute /assets/ and /_astro/ URLs → relative
// - fonts embedded as data: URIs (browsers block font files over file://)
// - external module scripts bundled (esbuild) and inlined (module src over file:// is blocked)
// - font preload links dropped
// Usage: npm run build && node scripts/package-offline.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'offline', 'Sparkonomy-site'));

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });

const rel = (text, prefix) => text.replace(/(?<![\w.])\/(assets|_astro)\//g, `${prefix}$1/`);
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');

// Bundle every external module script into one inline module (esbuild dedupes shared
// modules, so each runs once — same as the served page). Module scripts are deferred and run
// in document order, so one combined module at the first script's position keeps that order.
const scripts = [...html.matchAll(/<script type="module" src="(\/_astro\/[^"]+)"><\/script>/g)];
if (scripts.length) {
  const entry = scripts.map(([, src]) => `import ${JSON.stringify(path.join(DIST, src))};`).join('\n');
  const r = await build({ stdin: { contents: entry, resolveDir: DIST, loader: 'js' }, bundle: true, format: 'esm', write: false, minify: true, logLevel: 'silent' });
  const code = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  scripts.forEach(([tag], i) => { html = html.replace(tag, () => (i === 0 ? `<script type="module">${code}</script>` : '')); });
}
html = html.replace(/<link rel="preload"[^>]*woff2[^>]*>/g, '');
html = rel(html, './');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

for (const f of fs.readdirSync(path.join(OUT, '_astro'))) {
  const p = path.join(OUT, '_astro', f);
  if (f.endsWith('.js')) { fs.rmSync(p); continue; }
  if (!f.endsWith('.css')) continue;
  let css = fs.readFileSync(p, 'utf8');
  css = css.replace(/url\(\/assets\/fonts\/([^)]+\.woff2)\)/g, (_, n) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(DIST, 'assets', 'fonts', n)).toString('base64')})`);
  fs.writeFileSync(p, rel(css, '../'));
}
fs.writeFileSync(path.join(OUT, 'README.txt'), 'Double-click index.html to open the site in your browser.\n\nKeep all files in this folder together.\n');
console.log(`offline site → ${path.relative(process.cwd(), OUT)} (${scripts.length} module scripts bundled inline)`);
