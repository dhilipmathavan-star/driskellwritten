import fs from 'node:fs';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
const OFFS = [0, 200, 400, 560, 600, 640, 680, 720, 800, 1000, 1300];
const OUT = 'motioncheck/01-leave'; fs.mkdirSync(OUT, { recursive: true });
async function run(url, isOrig) {
  const b = await chromium.launch(isOrig ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript((isOrig) => {
    window.__mark = {};
    new MutationObserver(() => {
      const el = isOrig ? document.querySelector('.framer-ZIJOV') : document.querySelector('[data-loader]');
      if (!el) return;
      const v = isOrig ? el.getAttribute('data-framer-name') : el.dataset.variant;
      if (!window.__mark[v]) window.__mark[v] = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  }, isOrig);
  await p.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  const tick = () => p.evaluate(() => { const now = performance.now(); for (const a of document.getAnimations()) { if (a.__s === undefined) { a.__s = now - (a.currentTime ?? 0); a.pause(); } try { a.currentTime = now - a.__s; } catch {} } });
  await p.waitForLoadState('load').catch(()=>{});
  await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 300);
  let m;
  for (let i = 0; i < 1000; i++) {
    m = await p.evaluate(() => window.__mark).catch(() => ({}));
    if (m.Leave || m.leave) break;
    await p.clock.runFor(16); await tick();
  }
  const frames = {}; let t = 0;
  for (const off of OFFS) { while (t < off) { const d = Math.min(16, off - t); await p.clock.runFor(d); t += d; await tick(); } await tick(); await p.waitForTimeout(30); frames[off] = await p.screenshot(); }
  await b.close();
  return { m, frames };
}
const o = await run('https://shopos.framer.website/', true);
const c = await run('http://127.0.0.1:4321/', false);
console.log('orig marks', JSON.stringify(o.m), '\nclone marks', JSON.stringify(c.m));
const res = [];
for (const off of OFFS) {
  const A = PNG.sync.read(o.frames[off]), B = PNG.sync.read(c.frames[off]); const { width: w, height: h } = A;
  const D = new PNG({ width: w, height: h });
  const bad = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.12, includeAA: false });
  res.push(`${off}ms ${(bad / (w * h) * 100).toFixed(2)}%`);
  const cmp = new PNG({ width: w * 3 + 20, height: h }); cmp.data.fill(90);
  [A, B, D].forEach((im, k) => PNG.bitblt(im, cmp, 0, 0, w, h, k * (w + 10), 0));
  fs.writeFileSync(`${OUT}/${off}-compare.png`, PNG.sync.write(cmp));
}
console.log('leave+', res.join('  '));
const dif = (a, b) => { const A = PNG.sync.read(a), B = PNG.sync.read(b); return (pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.12 }) / (A.width * A.height) * 100).toFixed(2); };
for (const sh of [-32, -16, 0, 16, 32]) console.log('clone shift', sh, OFFS.filter((t) => c.frames[t + sh]).map((t) => `${t}:${dif(o.frames[t], c.frames[t + sh])}`).join(' '));
