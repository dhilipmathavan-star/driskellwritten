#!/usr/bin/env node
// Downloads every framerusercontent.com asset the reference page uses (all breakpoints)
// into ../../public/assets/{img,video,fonts}/ and writes asset-map.json (original → local).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REF = path.resolve(__dirname, '..');
const PUB = path.resolve(REF, '..', 'public', 'assets');
const urls = new Set();
const add = (u) => { if (u && u.includes('framerusercontent.com/')) urls.add(u.split('?')[0]); };
const walk = (o) => { if (!o) return; if (o.src) add(o.src); if (o.s?.bgi) for (const m of o.s.bgi.matchAll(/url\("?([^")]+)/g)) add(m[1]); (o.c || []).forEach(walk); };
for (const f of fs.readdirSync(path.join(REF, 'tree')).filter((f) => /^tree-\d+\.json$/.test(f))) {
  const t = JSON.parse(fs.readFileSync(path.join(REF, 'tree', f), 'utf8'));
  t.sections.forEach((s) => walk(s.tree));
  for (const svg of t.svgs) for (const m of svg.matchAll(/href="([^"]+)"/g)) add(m[1].replace(/&amp;/g, '&'));
}
for (const f of fs.readdirSync(path.join(REF, 'data', 'raw')).filter((f) => /^capture-.*\.json$/.test(f))) {
  const c = JSON.parse(fs.readFileSync(path.join(REF, 'data', 'raw', f), 'utf8'));
  for (const n of c.network) if (['image', 'media', 'font'].includes(n.type)) add(n.url);
}
const html = fs.readFileSync(path.join(REF, 'page.html'), 'utf8');
for (const m of html.matchAll(/https:\/\/framerusercontent\.com\/images\/[^"'\s)&]+/g)) add(m[0]);
for (const m of html.matchAll(/https:\/\/framerusercontent\.com\/assets\/[^"'\s)&]+\.(?:mp4|webm|woff2|png|jpe?g|svg|gif|webp)/g)) add(m[0]);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const map = {};
  for (const u of [...urls].sort()) {
    const name = u.split('/').pop();
    const ext = (name.split('.').pop() || '').toLowerCase();
    const dir = ['mp4', 'webm', 'mov'].includes(ext) ? 'video' : ['woff', 'woff2', 'ttf', 'otf'].includes(ext) ? 'fonts' : 'img';
    const dest = path.join(PUB, dir, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) {
      try { const r = await ctx.request.get(u, { timeout: 120000 }); if (!r.ok()) { console.log('FAIL', r.status(), u); continue; } fs.writeFileSync(dest, await r.body()); }
      catch (e) { console.log('ERR', u, String(e).slice(0, 120)); continue; }
    }
    map[u] = `/assets/${dir}/${name}`;
  }
  fs.writeFileSync(path.join(REF, 'asset-map.json'), JSON.stringify(map, null, 2));
  console.log('assets', Object.keys(map).length, 'of', urls.size);
  await b.close();
})();
