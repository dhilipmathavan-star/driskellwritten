#!/usr/bin/env node
// Dumps a compact, style-annotated element tree per top-level section of a page.
// Usage: node tools/dump-tree.cjs <url> <width> [outDir]
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [url = 'https://shopos.framer.website/', width = '1440', out = path.resolve(__dirname, '..', 'tree')] = process.argv.slice(2);
const W = Number(width);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dump() {
  const SVG_STORE = [];
  const cs = (e) => getComputedStyle(e);
  const vis = (e) => { const s = cs(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0); };
  let root = document.querySelector('#main > div');
  const sections = [...root.children].filter(vis);
  const ownText = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
  const r1 = (n) => Math.round(n * 10) / 10;
  const node = (e, base, depth) => {
    const s = cs(e); const r = e.getBoundingClientRect();
    const o = { t: e.tagName.toLowerCase() };
    const fn = e.getAttribute('data-framer-name'); if (fn) o.n = fn;
    o.b = [r1(r.left - base.left), r1(r.top - base.top), r1(r.width), r1(r.height)];
    const st = {};
    if (s.position !== 'static' && s.position !== 'relative') st.pos = s.position;
    if (s.display.includes('flex')) st.flex = `${s.flexDirection} gap:${s.gap} j:${s.justifyContent} a:${s.alignItems}${s.flexWrap !== 'nowrap' ? ' wrap' : ''} pad:${s.padding}`;
    if (s.display.includes('grid')) st.grid = `${s.gridTemplateColumns} gap:${s.gap} pad:${s.padding}`;
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') st.bg = s.backgroundColor;
    if (s.backgroundImage !== 'none') st.bgi = s.backgroundImage.slice(0, 300);
    if (s.borderTopWidth !== '0px' || s.borderBottomWidth !== '0px' || s.borderLeftWidth !== '0px') st.border = `${s.borderTopWidth} ${s.borderRightWidth} ${s.borderBottomWidth} ${s.borderLeftWidth} ${s.borderTopStyle} ${s.borderTopColor}`;
    if (s.borderRadius !== '0px') st.radius = s.borderRadius;
    if (s.opacity !== '1') st.op = s.opacity;
    if (s.transform !== 'none') st.tf = s.transform;
    if (s.filter !== 'none') st.filter = s.filter;
    if (s.backdropFilter && s.backdropFilter !== 'none') st.backdrop = s.backdropFilter;
    if (s.boxShadow !== 'none') st.shadow = s.boxShadow;
    if (s.overflow !== 'visible') st.ov = s.overflow;
    if (s.maskImage && s.maskImage !== 'none') st.mask = s.maskImage.slice(0, 200);
    if (s.mixBlendMode !== 'normal') st.blend = s.mixBlendMode;
    if (s.zIndex !== 'auto') st.z = s.zIndex;
    if (s.objectFit !== 'fill' && ['IMG', 'VIDEO'].includes(e.tagName)) st.fit = s.objectFit;
    const txt = ownText(e);
    if (txt) { o.text = txt; st.font = `${s.fontFamily.split(',')[0].replace(/"/g, '')} ${s.fontWeight} ${s.fontSize}/${s.lineHeight} ls:${s.letterSpacing} ${s.color}${s.textAlign !== 'start' ? ' ' + s.textAlign : ''}${s.textTransform !== 'none' ? ' ' + s.textTransform : ''}`; if (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text') st.clip = 'text'; }
    if (Object.keys(st).length) o.s = st;
    if (e.tagName === 'IMG') { o.src = e.currentSrc || e.src; o.alt = e.alt; }
    if (e.tagName === 'VIDEO') o.src = e.currentSrc || e.src;
    if (e.tagName === 'A') o.href = e.getAttribute('href');
    if (e.tagName.toLowerCase() === 'svg') { SVG_STORE.push(e.outerHTML); o.svg = SVG_STORE.length - 1; return o; }
    const kids = [...e.children].filter(vis).map((c) => node(c, base, depth + 1));
    if (kids.length) o.c = kids;
    return o;
  };
  return { sections: sections.map((sec, i) => { const r = sec.getBoundingClientRect(); return { i: i + 1, n: sec.getAttribute('data-framer-name'), top: Math.round(r.top + scrollY), tree: node(sec, r, 0) }; }), svgs: SVG_STORE, docH: document.documentElement.scrollHeight };
}

// collapse wrappers: unstyled element with exactly one child and same box
function collapse(o) {
  if (o.c) o.c = o.c.map(collapse);
  while (o.c && o.c.length === 1 && !o.s && !o.text && !o.src && !o.href && o.c[0].b.join() === o.b.join()) { const n = o.n; Object.assign(o, o.c[0], { n: o.c[0].n || n }); if (!o.c || o.c === undefined) break; }
  return o;
}
function render(o, d = 0) {
  const pad = '  '.repeat(d);
  let line = `${pad}${o.t}${o.n ? ` "${o.n}"` : ''} [${o.b.join(',')}]`;
  if (o.s) line += ' ' + Object.entries(o.s).map(([k, v]) => `${k}=${v}`).join(' ; ');
  if (o.text) line += `  TEXT«${o.text}»`;
  if (o.src) line += `  SRC=${o.src}`;
  if (o.alt) line += ` ALT=${o.alt}`;
  if (o.href) line += `  HREF=${o.href}`;
  if (o.svg !== undefined) line += `  SVG#${o.svg}`;
  return [line, ...(o.c || []).map((c) => render(c, d + 1))].join('\n');
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 450) { await p.evaluate((yy) => scrollTo(0, yy), y); await sleep(200); }
  await sleep(1500); await p.evaluate(() => scrollTo(0, 0)); await sleep(1500);
  const d = await p.evaluate(dump);
  fs.writeFileSync(path.join(out, `tree-${W}.json`), JSON.stringify(d));
  fs.writeFileSync(path.join(out, `svgs-${W}.json`), JSON.stringify(d.svgs));
  for (const s of d.sections) fs.writeFileSync(path.join(out, `${W}-${String(s.i).padStart(2, '0')}.txt`), `# section ${s.i} "${s.n}" top=${s.top}\n` + render(collapse(s.tree)));
  console.log(`docH=${d.docH} sections=${d.sections.length} svgs=${d.svgs.length}`);
  await b.close();
})();
