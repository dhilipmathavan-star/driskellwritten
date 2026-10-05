#!/usr/bin/env node
// Video sections compared in real Google Chrome (H.264), desktop 1440×900: every video in the
// block is paused and seeked to the same time in both pages, then the block is diffed.
//   node scripts/videocheck.mjs --refs 03,05,09,21 --times 1,2.5,4 [--clone URL]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const REFS = String(arg('refs', '03,05,09,21')).split(',').map((r) => r.padStart(2, '0'));
const TIMES = String(arg('times', '1,2.5,4')).split(',').map(Number);
const CLONE = arg('clone', 'http://127.0.0.1:4323/');
const CHROME = arg('chrome', '/usr/bin/google-chrome');
const OUT = path.join(ROOT, 'motioncheck', 'video');
fs.mkdirSync(OUT, { recursive: true });

async function open(browser, url, isOrig) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url + (isOrig ? '' : (url.includes('?') ? '&' : '?') + 'static'), { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(isOrig ? 7000 : 1000); // original: past the page-load loader
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 500) { await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500);
  return page;
}
const blockBox = (page, isOrig, ref) => page.evaluate(({ isOrig, ref }) => {
  let el;
  if (isOrig) {
    const kids = [...document.querySelector('#main > div').children].filter((c) => { const s = getComputedStyle(c); const r = c.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0); });
    el = kids.map((c, i) => ({ c, i, t: getComputedStyle(c).position === 'fixed' ? 0 : c.getBoundingClientRect().top + scrollY })).sort((a, b) => a.t - b.t || a.i - b.i)[Number(ref) - 1]?.c;
  } else el = document.querySelector(`[data-ref="${ref}"]`);
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top + scrollY), height: Math.round(r.height) };
}, { isOrig, ref });

async function frame(page, isOrig, ref, t) {
  const box = await blockBox(page, isOrig, ref);
  await page.evaluate((y) => scrollTo(0, y), Math.max(0, box.top - 100));
  await page.waitForTimeout(300);
  await page.evaluate(async ({ top, height, t }) => {
    const vids = [...document.querySelectorAll('video')].filter((v) => { const r = v.getBoundingClientRect(); const y = r.top + scrollY; return y < top + height && y + r.height > top; });
    await Promise.all(vids.map((v) => new Promise((res) => { v.pause(); if (Math.abs(v.currentTime - t) < 0.001) return res(); v.addEventListener('seeked', res, { once: true }); v.currentTime = t; setTimeout(res, 5000); })));
  }, { ...box, t });
  await page.waitForTimeout(400);
  // fullPage + clip uses page coordinates, so tall blocks come out in one piece
  const out = PNG.sync.read(await page.screenshot({ fullPage: true, clip: { x: 0, y: box.top, width: 1440, height: box.height } }));
  return { png: out, box };
}

(async () => {
  const proxied = await chromium.launch({ executablePath: CHROME, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const local = await chromium.launch({ executablePath: CHROME });
  const op = await open(proxied, 'https://shopos.framer.website/', true);
  const cp = await open(/^https?:\/\/(localhost|127\.)/.test(CLONE) ? local : proxied, CLONE, false);
  const heights = [await op.evaluate(() => document.documentElement.scrollHeight), await cp.evaluate(() => document.documentElement.scrollHeight)];
  console.log(`page height  original ${heights[0]}  clone ${heights[1]}`);
  for (const ref of REFS) {
    const line = [];
    for (const t of TIMES) {
      const o = await frame(op, true, ref, t); const c = await frame(cp, false, ref, t);
      const w = 1440, h = Math.min(o.png.height, c.png.height);
      const crop = (p) => { const x = new PNG({ width: w, height: h }); PNG.bitblt(p, x, 0, 0, w, h, 0, 0); return x; };
      const A = crop(o.png), B = crop(c.png), D = new PNG({ width: w, height: h });
      const bad = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.12, includeAA: false });
      const cmp = new PNG({ width: w * 3 + 20, height: h }); cmp.data.fill(90);
      [A, B, D].forEach((im, k) => PNG.bitblt(im, cmp, 0, 0, w, h, k * (w + 10), 0));
      fs.writeFileSync(path.join(OUT, `${ref}-${t}s-compare.png`), PNG.sync.write(cmp));
      line.push(`${t}s ${Math.round((bad / (w * h)) * 10000) / 100}%`);
      if (t === TIMES[0]) line.unshift(`h ${o.box.height}→${c.box.height} top ${o.box.top}→${c.box.top}`);
    }
    console.log(ref, line.join('  '));
  }
  await proxied.close(); await local.close();
})().catch((e) => { console.error(e); process.exit(1); });
