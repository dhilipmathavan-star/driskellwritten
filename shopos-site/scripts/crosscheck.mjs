#!/usr/bin/env node
// Section-by-section visual cross-check: original Framer page vs this Astro build.
//
//   node scripts/crosscheck.mjs [--widths 1440,1280,834,390] [--refs 02,04] \
//        [--clone http://localhost:4321/] [--refresh] [--videos]
//
// Section N of the original = Nth top-level block sorted by its top offset (see
// reference/tree/*.txt). In the clone each block is the element with data-ref="NN".
// Videos are hidden in both pages unless --videos (their frames never line up).
// Output: crosscheck/<width>/<ref>-{original,clone,diff}.png, crosscheck/results.json,
// crosscheck/report.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'crosscheck');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const ORIGINAL = 'https://shopos.framer.website/';
const CLONE = args.clone || 'http://localhost:4321/';
const WIDTHS = String(args.widths || '1440,1280,834,390').split(',').map(Number);
const REFS = args.refs ? String(args.refs).split(',').map((r) => r.padStart(2, '0')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(browser, url, width, isOriginal) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 400) { await page.evaluate((yy) => scrollTo(0, yy), y); await sleep(isOriginal ? 220 : 60); }
  await sleep(isOriginal ? 2000 : 500);
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(800);
  await page.addStyleTag({ content: `${args.videos ? '' : 'video{visibility:hidden!important}'} *{caret-color:transparent!important}` });
  await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 0; } catch {} } });
  const boxes = await page.evaluate((orig) => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), height: Math.round(r.height) }; };
    if (orig) {
      const root = document.querySelector('#main > div');
      const kids = [...root.children].filter((c) => { const s = getComputedStyle(c); const r = c.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0); });
      return kids.map((c, i) => ({ i, ...box(c), fixed: getComputedStyle(c).position === 'fixed' }))
        .sort((a, b) => a.top - b.top || a.i - b.i)
        .map((b, n) => ({ ref: String(n + 1).padStart(2, '0'), top: b.top, height: b.height, fixed: b.fixed }));
    }
    return [...document.querySelectorAll('[data-ref]')].flatMap((el) => el.dataset.ref.includes('-') ? [] : [{ ref: el.dataset.ref, ...box(el) }]);
  }, isOriginal);
  // hide fixed overlays so they don't paint over every section
  await page.evaluate(() => { for (const e of document.querySelectorAll('body *')) if (getComputedStyle(e).position === 'fixed') e.style.visibility = 'hidden'; });
  const buf = await page.screenshot({ fullPage: true });
  await page.close();
  return { boxes, png: PNG.sync.read(buf) };
}

function crop(png, top, height) {
  const h = Math.max(1, Math.min(height, png.height - top));
  const out = new PNG({ width: png.width, height: h });
  PNG.bitblt(png, out, 0, Math.max(0, top), png.width, h, 0, 0);
  return out;
}

(async () => {
  // loopback can't go through the egress proxy, so the clone gets its own browser
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const local = await chromium.launch();
  // one result file per width+ref so parallel runs on different refs never clobber each other
  const RES = path.join(OUT, 'results');
  fs.mkdirSync(RES, { recursive: true });
  const results = {};
  for (const W of WIDTHS) {
    const dir = path.join(OUT, String(W));
    fs.mkdirSync(dir, { recursive: true });
    const cacheImg = path.join(OUT, 'original-cache', `${W}.png`);
    const cacheBox = path.join(OUT, 'original-cache', `${W}.json`);
    let orig;
    if (!args.refresh && fs.existsSync(cacheImg)) orig = { png: PNG.sync.read(fs.readFileSync(cacheImg)), boxes: JSON.parse(fs.readFileSync(cacheBox, 'utf8')) };
    else {
      orig = await shoot(browser, ORIGINAL, W, true);
      fs.mkdirSync(path.dirname(cacheImg), { recursive: true });
      fs.writeFileSync(cacheImg, PNG.sync.write(orig.png));
      fs.writeFileSync(cacheBox, JSON.stringify(orig.boxes, null, 1));
    }
    const clone = await shoot(/^https?:\/\/(localhost|127\.)/.test(CLONE) ? local : browser, CLONE + (CLONE.includes('?') ? '&' : '?') + 'static', W, false);
    results[W] ??= {};
    for (const ob of orig.boxes) {
      if (ob.fixed || (REFS && !REFS.includes(ob.ref))) continue;
      const cb = clone.boxes.find((b) => b.ref === ob.ref);
      const o = crop(orig.png, ob.top, ob.height);
      fs.writeFileSync(path.join(dir, `${ob.ref}-original.png`), PNG.sync.write(o));
      if (!cb) { results[W][ob.ref] = { status: 'missing', origHeight: ob.height }; fs.writeFileSync(path.join(RES, `${W}-${ob.ref}.json`), JSON.stringify(results[W][ob.ref])); continue; }
      const c = crop(clone.png, cb.top, cb.height);
      fs.writeFileSync(path.join(dir, `${ob.ref}-clone.png`), PNG.sync.write(c));
      const h = Math.min(o.height, c.height);
      const a = crop(o, 0, h); const b = crop(c, 0, h);
      const diff = new PNG({ width: W, height: h });
      const bad = pixelmatch(a.data, b.data, diff.data, W, h, { threshold: 0.12, includeAA: false });
      fs.writeFileSync(path.join(dir, `${ob.ref}-diff.png`), PNG.sync.write(diff));
      // original | clone | diff side by side, for eyeballing
      const ch = Math.max(o.height, c.height);
      const cmp = new PNG({ width: W * 3 + 20, height: ch }); cmp.data.fill(90);
      [o, c, diff].forEach((im, k) => PNG.bitblt(im, cmp, 0, 0, im.width, im.height, k * (W + 10), 0));
      fs.writeFileSync(path.join(dir, `${ob.ref}-compare.png`), PNG.sync.write(cmp));
      results[W][ob.ref] = { status: 'ok', mismatchPct: Math.round((bad / (W * h)) * 10000) / 100, origTop: ob.top, cloneTop: cb.top, origHeight: ob.height, cloneHeight: cb.height, heightDelta: cb.height - ob.height };
      fs.writeFileSync(path.join(RES, `${W}-${ob.ref}.json`), JSON.stringify(results[W][ob.ref]));
    }
    const line = Object.entries(results[W]).sort().filter(([r]) => !REFS || REFS.includes(r)).map(([r, v]) => `${r}:${v.status === 'ok' ? `${v.mismatchPct}%${v.heightDelta ? `(Δh${v.heightDelta > 0 ? '+' : ''}${v.heightDelta})` : ''}` : v.status}`).join('  ');
    console.log(`${W}px  ${line}`);
  }
  await browser.close();
  await local.close();
  // report from every stored result
  const all = {};
  for (const f of fs.readdirSync(RES)) { const [W, ref] = f.replace('.json', '').split('-'); (all[W] ??= {})[ref] = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')); }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(all, null, 1));
  const rows = [];
  for (const [W, secs] of Object.entries(all).sort((a, b) => b[0] - a[0])) for (const [ref, v] of Object.entries(secs).sort()) {
    rows.push(`<tr><td>${W}</td><td>${ref}</td><td>${v.status === 'ok' ? `${v.mismatchPct}%` : v.status}</td><td>${v.origHeight ?? ''} → ${v.cloneHeight ?? '—'}</td>
      <td><img loading="lazy" src="${W}/${ref}-original.png"></td><td>${v.status === 'ok' ? `<img loading="lazy" src="${W}/${ref}-clone.png">` : ''}</td><td>${v.status === 'ok' ? `<img loading="lazy" src="${W}/${ref}-diff.png">` : ''}</td></tr>`);
  }
  fs.writeFileSync(path.join(OUT, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Cross-check</title><style>body{font:13px system-ui;background:#111;color:#eee;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:4px;vertical-align:top}img{width:100%;max-width:420px;display:block}</style><table><tr><th>Width</th><th>Ref</th><th>Mismatch</th><th>Height</th><th>Original</th><th>Clone</th><th>Diff</th></tr>${rows.join('')}</table>`);
})().catch((e) => { console.error(e); process.exit(1); });
