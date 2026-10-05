import { chromium } from 'playwright';
for (const [url, isOrig] of [['https://shopos.framer.website/', true], ['http://127.0.0.1:4321/', false]]) {
  for (let k = 0; k < 1; k++) {
  const b = await chromium.launch(isOrig ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.addInitScript((isOrig) => { window.__mark = {}; new MutationObserver(() => { const el = isOrig ? document.querySelector('.framer-ZIJOV') : document.querySelector('[data-loader]'); if (!el) return; const v = (isOrig ? el.getAttribute('data-framer-name') : el.dataset.variant).toLowerCase(); if (!window.__mark[v]) window.__mark[v] = Math.round(performance.now()); }).observe(document, { subtree: true, childList: true, attributes: true }); }, isOrig);
  await p.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector(isOrig ? '#main > div' : '[data-ref]');
  const t0 = await p.evaluate(() => Math.round(performance.now()));
  await p.waitForLoadState('networkidle').catch(() => {});
  const t1 = await p.evaluate(() => Math.round(performance.now()));
  const tick = () => p.evaluate(() => { const now = performance.now(); for (const a of document.getAnimations()) { if (a.__s === undefined) { a.__s = now - (a.currentTime ?? 0); a.pause(); } try { a.currentTime = now - a.__s; } catch {} } });
  const r0 = Date.now(); for (let i = 0; i < 200; i++) { await p.clock.runFor(16); await tick(); }
  const t2 = await p.evaluate(() => Math.round(performance.now())); console.log('settle real ms', Date.now() - r0, 'jump at', t2);
  console.log(isOrig ? 'orig ' : 'clone', 't0', t0, 'networkidle', t1, JSON.stringify(await p.evaluate(() => window.__mark)));
  await b.close();
  }
}
