import { chromium } from 'playwright';
const INIT = `(() => {
  const T = (window.__T = {});
  const mark = (k) => { if (T[k] === undefined) T[k] = performance.now(); };
  const isLoaderImg = (n) => n.nodeType === 1 && (n.matches?.('img') ) && (n.closest?.('[data-framer-name="Leave"], [data-loader]'));
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('[data-framer-name="Leave"],[data-loader]') || n.querySelector?.('[data-framer-name="Leave"],[data-loader]'))) { mark('overlayInDom'); requestAnimationFrame(() => mark('overlayPaintFrame')); }
      for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches('img') || n.querySelector?.('img')) && m.target.closest?.('[data-framer-name="Leave"],[data-loader]')) mark('gifRemoved');
    }
  }).observe(document, { subtree: true, childList: true });
  const seen = () => { if (T.overlayPaintFrame === undefined && document.querySelector('.framer-1f6cbgh-container,[data-loader]')) { mark('overlayInDom'); requestAnimationFrame(() => mark('overlayPaintFrame')); } if (T.overlayInDom === undefined) requestAnimationFrame(seen); };
  requestAnimationFrame(seen);
  const poll = () => {
    const bg = document.querySelector('[data-framer-name="BG"], .loader__bg'); if (bg && T.overlayInDom !== undefined && T.bgMoved === undefined && Math.abs(bg.getBoundingClientRect().top) > 0.5) mark('bgMoved');
    for (const a of document.getAnimations()) { const t = a.effect?.target; if (t && t.closest?.('[data-framer-name="Leave"],[data-loader]')) { mark('leaveAnimStart'); } }
    if (T.bgMoved === undefined) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})();`;
const out = {};
for (let run = 0; run < 4; run++) for (const [name, url, proxy] of [['orig', 'https://shopos.framer.website/', true], ['clone', 'http://127.0.0.1:4323/', false]]) {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', proxy: proxy ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'commit' }); await p.waitForTimeout(7000);
  const T = await p.evaluate(() => window.__T);
  const d = (k) => Math.round(T[k] - T.overlayPaintFrame);
  (out[name] ??= []).push([d('gifRemoved'), d('bgMoved')]);
  console.log(name, JSON.stringify(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)]))), '| from first paint: gif removed', d('gifRemoved'), 'bg starts moving', d('bgMoved'));
  await b.close();
}
for (const [k, v] of Object.entries(out)) console.log(k, 'mean gifRemoved', Math.round(v.reduce((s, x) => s + x[0], 0) / v.length), 'mean bgMoved', Math.round(v.reduce((s, x) => s + x[1], 0) / v.length));
