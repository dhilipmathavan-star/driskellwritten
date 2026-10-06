#!/usr/bin/env node
// Downloads original assets referenced by the captured homepage into ../assets/<category>/
// and writes ../data/raw/assets-downloaded.json. Optional ../data/raw/asset-overrides.json:
// { "<original url or inline-svg key>": { "category": "logos", "name": "logo-acme" } }
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const ASSETS = path.join(ROOT, 'assets');
const CATS = ['logos', 'images', 'icons', 'illustrations', 'videos', 'backgrounds'];
CATS.forEach((c) => fs.mkdirSync(path.join(ASSETS, c), { recursive: true }));

const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const overrides = fs.existsSync(path.join(RAW, 'asset-overrides.json')) ? read('asset-overrides.json') : {};
const views = ['desktop', 'tablet', 'mobile'].filter((v) => fs.existsSync(path.join(RAW, `capture-${v}.json`))).map((v) => [v, read(`capture-${v}.json`)]);

const largestFromSrcset = (ss) => {
  if (!ss) return null;
  const c = ss.split(',').map((p) => p.trim().split(/\s+/)).map(([u, d]) => ({ u, n: parseFloat(d) || 1 }));
  c.sort((a, b) => b.n - a.n);
  return c[0]?.u || null;
};
const stripQuery = (u) => { try { const x = new URL(u); x.search = ''; return x.href; } catch { return u; } };
// Next.js image optimiser URLs (/_next/image?url=%2Fpath.png&w=..&q=..): fetch the untouched original first
const originalOf = (u) => { try { const x = new URL(u); if (x.pathname === '/_next/image' && x.searchParams.get('url')) return new URL(x.searchParams.get('url'), x.origin).href; } catch {} return null; };
const LOGO_RE = /logo|brand|partner|client|trusted|backed|investor|featured|press|award|badge|certif/i;

const items = new Map(); // key -> record
const add = (key, rec) => {
  const ex = items.get(key);
  if (ex) { ex.sections = [...new Set([...ex.sections, ...rec.sections])]; ex.viewports = [...new Set([...ex.viewports, ...rec.viewports])]; ex.alts = [...new Set([...ex.alts, ...rec.alts])].filter(Boolean); return; }
  items.set(key, rec);
};

for (const [vp, cap] of views) {
  for (const sec of cap.data.sections) {
    const secLabel = `${sec.index}:${sec.framerName || sec.id || sec.tag}`;
    const secText = sec.texts.map((t) => t.text).join(' ');
    const logoish = LOGO_RE.test(secText) || sec.marquees.length > 0;
    for (const img of sec.images) {
      const best = largestFromSrcset(img.srcset) || img.currentSrc || img.src;
      if (!best || best.startsWith('data:') && best.length < 200) continue;
      const abs = new URL(best, cap.data.url).href;
      const small = Math.max(...img.rendered) <= 48;
      const cat = LOGO_RE.test(`${img.alt} ${img.src} ${img.path}`) || (logoish && img.rendered[1] <= 120) ? 'logos' : small ? 'icons' : 'images';
      add(abs, { kind: 'img', url: abs, candidates: [...new Set([originalOf(abs), abs, img.src, img.currentSrc].filter(Boolean))], category: cat, alts: [img.alt], natural: img.natural, rendered: img.rendered, sections: [secLabel], viewports: [vp], path: img.path });
    }
    for (const v of sec.videos) {
      for (const u of [v.src, ...v.sources.map((s) => s.src)].filter(Boolean)) add(u, { kind: 'video', url: u, candidates: [u], category: 'videos', alts: [], rendered: v.rendered, sections: [secLabel], viewports: [vp], meta: { autoplay: v.autoplay, loop: v.loop, muted: v.muted, controls: v.controls } });
      if (v.poster) add(v.poster, { kind: 'poster', url: v.poster, candidates: [v.poster], category: 'images', alts: ['video poster'], rendered: v.rendered, sections: [secLabel], viewports: [vp] });
    }
    for (const l of sec.lotties) if (l.src) { const u = new URL(l.src, cap.data.url).href; add(u, { kind: 'lottie', url: u, candidates: [u], category: 'videos', alts: [], rendered: l.rendered, sections: [secLabel], viewports: [vp] }); }
    for (const b of sec.backgrounds) for (const u of b.urls) {
      if (u.startsWith('data:') && u.length < 200) continue;
      add(u, { kind: 'background', url: u, candidates: [stripQuery(u), u], category: 'backgrounds', alts: [], rendered: b.rendered, sections: [secLabel], viewports: [vp], meta: { size: b.size, position: b.position, repeat: b.repeat } });
    }
    for (const s of sec.svgs) {
      if (!s.markup || vp !== 'desktop' && items.has('svg:' + hash(s.markup))) continue;
      const key = 'svg:' + hash(s.markup);
      const max = Math.max(...s.rendered);
      const cat = LOGO_RE.test(`${s.aria} ${s.title} ${s.path}`) || (logoish && s.rendered[1] <= 120 && s.rendered[0] > 40) ? 'logos' : max <= 48 ? 'icons' : 'illustrations';
      add(key, { kind: 'inline-svg', url: null, markup: s.markup, candidates: [], category: cat, alts: [s.aria, s.title], rendered: s.rendered, sections: [secLabel], viewports: [vp], path: s.path });
    }
  }
  // head assets: favicons, touch icons, og:image
  for (const l of cap.data.linksHead) if (/icon/i.test(l.rel)) add(l.href, { kind: 'favicon', url: l.href, candidates: [l.href], category: 'logos', alts: [l.rel], rendered: null, sections: ['head'], viewports: [vp] });
  for (const m of cap.data.meta) if (/^(og:image|og:image:url|og:image:secure_url|twitter:image)$/i.test(m.name || '') && /^https?:/.test(m.content || '')) add(m.content, { kind: 'social-image', url: m.content, candidates: [m.content], category: 'images', alts: [m.name], rendered: null, sections: ['head'], viewports: [vp] });
  // anything image/media the network saw that the DOM pass missed
  for (const n of cap.network) if (['image', 'media'].includes(n.type) && !/googletagmanager\.com|google-analytics\.com|clarity\.ms|log\.cookieyes\.com|doubleclick\.net|facebook\.com\/tr/.test(n.url) && !items.has(n.url) && ![...items.values()].some((i) => i.candidates.includes(n.url))) add(n.url, { kind: 'network-' + n.type, url: n.url, candidates: [stripQuery(n.url), n.url], category: n.type === 'media' ? 'videos' : 'images', alts: [], rendered: null, sections: ['network-only'], viewports: [vp] });
}

// extra assets referenced outside the DOM pass (e.g. JSON-LD logo), declared in asset-overrides.json "_extra"
for (const x of overrides._extra || []) add(x.url, { kind: x.kind || 'extra', url: x.url, candidates: [x.url], category: x.category || 'images', alts: [x.alt].filter(Boolean), rendered: null, sections: x.sections || ['head'], viewports: ['desktop'] });

function hash(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 10); }
const extFrom = (ct, u) => {
  const m = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'application/json': 'json', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };
  const fromCt = m[(ct || '').split(';')[0].trim()];
  if (fromCt) return fromCt;
  const e = (u || '').split('?')[0].split('.').pop().toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(e) ? e : 'bin';
};
const baseName = (u) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop()).replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 50); } catch { return 'asset'; } };
const dims = (buf, ext) => {
  try {
    if (ext === 'png') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    if (ext === 'gif') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
    if (ext === 'svg') { const t = buf.toString('utf8', 0, 4000); const vb = t.match(/viewBox=["']([\d.\s,-]+)["']/); const w = t.match(/\swidth=["']([\d.]+)/); const h = t.match(/\sheight=["']([\d.]+)/); if (w && h) return [+w[1], +h[1]]; if (vb) { const p = vb[1].trim().split(/[\s,]+/).map(Number); return [p[2], p[3]]; } }
    if (ext === 'jpg') { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) return null; const mk = buf[i + 1]; const len = buf.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + len; } }
    if (ext === 'webp') { const f = buf.toString('ascii', 12, 16); if (f === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]; if (f === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]; if (f === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; } }
  } catch {}
  return null;
};

(async () => {
  const local = views[0] && /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(views[0][1].data.url);
  const browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined });
  const ctx = await browser.newContext({ proxy: process.env.HTTPS_PROXY && !local ? { server: process.env.HTTPS_PROXY } : undefined });
  const counters = Object.fromEntries(CATS.map((c) => [c, 0]));
  const out = [];
  for (const [key, it] of items) {
    const ov = overrides[it.url || key] || overrides[key] || {};
    if (ov.skip) continue;
    const cat = ov.category || it.category;
    const n = String(++counters[cat]).padStart(2, '0');
    const prefix = { logos: 'logo', images: 'image', icons: 'icon', illustrations: 'illustration', videos: 'video', backgrounds: 'bg' }[cat];
    let buf = null; let ct = null; let fetched = null; let err = null;
    if (it.kind === 'inline-svg') { buf = Buffer.from(it.markup.includes('xmlns=') ? it.markup : it.markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')); ct = 'image/svg+xml'; }
    else if (it.url.startsWith('data:')) { const m = it.url.match(/^data:([^;,]+)(;base64)?,(.*)$/s); if (m) { ct = m[1]; buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])); fetched = 'data-uri'; } }
    else {
      for (const c of it.candidates) {
        try { const r = await ctx.request.get(c, { timeout: 60000 }); if (r.ok()) { buf = await r.body(); ct = r.headers()['content-type']; fetched = c; break; } err = `HTTP ${r.status()} for ${c}`; } catch (e) { err = String(e).slice(0, 200); }
      }
    }
    const ext = buf ? extFrom(ct, fetched || it.url) : null;
    const file = buf ? `${ov.name || `${prefix}-${n}${it.kind === 'inline-svg' ? '-inline' : '-' + baseName(fetched || it.url)}`}.${ext}` : null;
    if (buf) fs.writeFileSync(path.join(ASSETS, cat, file), buf);
    out.push({ asset: `${prefix}-${n}`, label: ov.label || null, file: file ? `assets/${cat}/${file}` : null, category: cat, kind: it.kind, originalUrl: it.url || 'inline <svg> in DOM', downloadedFrom: fetched, fileType: ext, bytes: buf ? buf.length : null, intrinsicDimensions: buf ? dims(buf, ext) : null, naturalDimensions: it.natural || null, renderedDimensions: it.rendered, alt: it.alts.filter(Boolean), sections: it.sections, viewports: it.viewports, domPath: it.path || null, meta: it.meta || null, error: buf ? null : err });
  }
  await browser.close();
  fs.writeFileSync(path.join(RAW, 'assets-downloaded.json'), JSON.stringify(out, null, 2));
  const ok = out.filter((o) => o.file).length;
  console.log(`assets: ${out.length} found, ${ok} saved, ${out.length - ok} failed`);
  console.log(Object.entries(counters).map(([k, v]) => `${k}=${v}`).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
