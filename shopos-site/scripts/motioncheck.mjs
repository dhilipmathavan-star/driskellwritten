#!/usr/bin/env node
// Frame-by-frame animation comparison, original vs clone, at desktop (1440×900) under a
// controlled clock so both pages are captured at the same animation time.
//
//   node scripts/motioncheck.mjs --ref 20 --trigger load   --times 0,500,1500,2000,3000
//   node scripts/motioncheck.mjs --ref 18 --trigger scroll --times 0,1000,5000
//   node scripts/motioncheck.mjs --ref 22 --trigger hover --orig 'SELECTOR' --clone-sel 'SELECTOR' --times 0,100,300
//
// trigger:
//   load   – t = ms since navigation (page at top unless --at <ref> given, clip = ref box)
//   scroll – page settles 3s at top, then jumps so the block is in view; t = ms after the jump
//   hover  – block in view and settled, then mouse moves onto the selector; t = ms after hover
// Time control: Playwright's fake clock (rAF/timers/Date/performance) + every Web/CSS
// Animation is paused and stepped to (its time at trigger + t).
// Output: motioncheck/<ref>-<trigger>/<t>-{original,clone,compare}.png and summary.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const REF = String(arg('ref', '02')).padStart(2, '0');
const TRIGGER = arg('trigger', 'scroll');
const TIMES = String(arg('times', '0,250,500,1000,2000')).split(',').map(Number);
const ORIGINAL = 'https://shopos.framer.website/';
const CLONE = arg('clone', 'http://127.0.0.1:4322/');
const SEL = { orig: arg('orig'), clone: arg('clone-sel') };
const PIN = argv.includes('--pin-tickers');
const PAD = Number(arg('pad', 0)); // extra px around the block clip
const OUT = path.join(ROOT, 'motioncheck', `${REF}-${TRIGGER}${arg('tag') ? '-' + arg('tag') : ''}`);
fs.mkdirSync(OUT, { recursive: true });

async function blockBox(page, isOrig, ref) {
  return page.evaluate(({ isOrig, ref }) => {
    let el;
    if (isOrig) {
      const root = document.querySelector('#main > div');
      const kids = [...root.children].filter((c) => { const s = getComputedStyle(c); const r = c.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0); });
      const sorted = kids.map((c, i) => ({ c, i, top: c.getBoundingClientRect().top + scrollY })).sort((a, b) => a.top - b.top || a.i - b.i);
      el = sorted[Number(ref) - 1]?.c;
    } else el = document.querySelector(`[data-ref="${ref}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height };
  }, { isOrig, ref });
}

async function run(browser, url, isOrig) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  // Advance the fake clock in 16ms ticks; every Web/CSS animation is paused and driven from
  // the same fake time, so JS (rAF) and WAAPI/CSS animations stay in sync and both pages
  // are captured at identical animation times.
  const tick = () => page.evaluate(() => {
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (a.__s === undefined) { a.__s = now - (a.currentTime ?? 0); a.pause(); }
      try { a.currentTime = now - a.__s; } catch {}
    }
  });
  const film = async (clipFn) => {
    const frames = {}; let t = 0;
    for (const target of TIMES) {
      while (t < target) { const d = Math.min(16, target - t); await page.clock.runFor(d); t += d; await tick(); }
      if (PIN) await page.evaluate((T) => { for (const a of document.getAnimations()) if (a.__tk) a.currentTime = T; }, target);
      await tick();
      await page.waitForTimeout(30);
      frames[target] = await page.screenshot({ clip: await clipFn() });
    }
    return frames;
  };
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.addStyleTag({ content: 'video{visibility:hidden!important}' }); // frames never line up
  await page.waitForSelector(isOrig ? '#main > div' : '[data-ref]', { timeout: 60000 });
  let box = await blockBox(page, isOrig, REF);
  if (!box) throw new Error(`block ${REF} not found (${isOrig ? 'original' : 'clone'})`);
  const clip = async () => {
    const vt = await page.evaluate(() => scrollY);
    return { x: 0, y: Math.max(0, box.top - PAD - vt), width: 1440, height: Math.min(900, box.height + PAD * 2) };
  };
  if (TRIGGER === 'load') { const frames = await film(clip); await ctx.close(); return frames; }
  await page.waitForLoadState('networkidle').catch(() => {});
  for (let i = 0; i < 500; i++) { await page.clock.runFor(16); await tick(); } // settle 8s: past the page-load loader (2s + 2s + 1.3s after hydration)
  box = await blockBox(page, isOrig, REF);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, box.top - PAD - Number(arg('offset', 0))));
  if (TRIGGER === 'hover') {
    for (let i = 0; i < 120; i++) { await page.clock.runFor(16); await tick(); }
    const bb = await page.locator(isOrig ? SEL.orig : SEL.clone).first().boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 1 });
  }
  // --pin-tickers: infinite ticker loops start at phase 0 at the trigger in both pages
  // (their phase otherwise depends on when each page hydrated)
  if (PIN) await page.evaluate(() => { for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations === Infinity && a.effect?.target?.tagName === 'UL') { a.__tk = 1; a.pause(); a.currentTime = 0; } });
  const frames = await film(clip);
  await ctx.close();
  return frames;
}

(async () => {
  const proxied = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const local = await chromium.launch();
  const o = await run(proxied, ORIGINAL, true);
  const c = await run(/^https?:\/\/(localhost|127\.)/.test(CLONE) ? local : proxied, CLONE, false);
  const summary = {};
  for (const t of TIMES) {
    const a = PNG.sync.read(o[t]); const b = PNG.sync.read(c[t]);
    const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    const crop = (p) => { const x = new PNG({ width: w, height: h }); PNG.bitblt(p, x, 0, 0, w, h, 0, 0); return x; };
    const A = crop(a), B = crop(b), D = new PNG({ width: w, height: h });
    const bad = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.12, includeAA: false });
    summary[t] = Math.round((bad / (w * h)) * 10000) / 100;
    fs.writeFileSync(path.join(OUT, `${t}-original.png`), PNG.sync.write(A));
    fs.writeFileSync(path.join(OUT, `${t}-clone.png`), PNG.sync.write(B));
    const cmp = new PNG({ width: w * 3 + 20, height: h }); cmp.data.fill(90);
    [A, B, D].forEach((im, k) => PNG.bitblt(im, cmp, 0, 0, w, h, k * (w + 10), 0));
    fs.writeFileSync(path.join(OUT, `${t}-compare.png`), PNG.sync.write(cmp));
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`${REF} ${TRIGGER}:`, Object.entries(summary).map(([t, v]) => `${t}ms ${v}%`).join('  '), '→', path.relative(ROOT, OUT));
  await proxied.close(); await local.close();
})().catch((e) => { console.error(e); process.exit(1); });
