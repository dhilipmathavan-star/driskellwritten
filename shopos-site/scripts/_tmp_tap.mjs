import fs from 'node:fs';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
const OFFS = Array.from({ length: 26 }, (_, i) => i * 16);
const STEPS = [
  ['upload', '[data-framer-name="Button/Button Copy"]', '.hero__btn--upload'],
  ['chip2', '[data-framer-name="Frame 9"]', '[data-chip="1"]'],
  ['upload2', '[data-framer-name="Button/Button Copy"]', '.hero__btn--upload'],
  ['chip1', '[data-framer-name="Frame 8"]', '[data-chip="0"]'],
];
const OUT = 'motioncheck/02-tap'; fs.mkdirSync(OUT, { recursive: true });
async function run(url, isOrig) {
  const b = await chromium.launch(isOrig ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) console.log('nav', isOrig, f.url()); });
  await p.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  await p.addStyleTag({ content: 'video{visibility:hidden!important}' });
  await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 300);
  const tick = () => p.evaluate(() => { const now = performance.now(); for (const a of document.getAnimations()) { if (a.__s === undefined) { a.__s = now - (a.currentTime ?? 0); a.pause(); } try { a.currentTime = now - a.__s; } catch {} } }).catch((e) => console.log('tick err', isOrig, e.message.slice(0, 60)));
  for (let i = 0; i < 500; i++) { await p.clock.runFor(16); await tick(); }
  const frames = {};
  for (const [name, so, sc] of STEPS) {
    const bb = await p.locator(isOrig ? so : sc).first().boundingBox();
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    let t = 0;
    for (const off of OFFS) { while (t < off) { await p.clock.runFor(16); t += 16; await tick(); } await tick(); await p.waitForTimeout(30); frames[`${name}-${off}`] = await p.screenshot({ clip: { x: 0, y: 380, width: 1440, height: 520 } }); }
    for (let i = 0; i < 60; i++) { await p.clock.runFor(16); await tick(); }
    await p.mouse.move(5, 5);
  }
  await b.close();
  return frames;
}
const o = await run('https://shopos.framer.website/', true);
const c = await run('http://127.0.0.1:4321/', false);
for (const [name] of STEPS) {
  const res = [];
  for (const off of OFFS) {
    const k = `${name}-${off}`; const A = PNG.sync.read(o[k]), B = PNG.sync.read(c[k]); const { width: w, height: h } = A;
    const D = new PNG({ width: w, height: h });
    const bad = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.12, includeAA: false });
    res.push(`${off}:${(bad / (w * h) * 100).toFixed(2)}%`);
    const cmp = new PNG({ width: w * 3 + 20, height: h }); cmp.data.fill(90);
    [A, B, D].forEach((im, i) => PNG.bitblt(im, cmp, 0, 0, w, h, i * (w + 10), 0));
    fs.writeFileSync(`${OUT}/${k}-compare.png`, PNG.sync.write(cmp));
  }
  console.log(name, res.join(' '));
  const dif = (a, b) => { const A = PNG.sync.read(a), B = PNG.sync.read(b); return (pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.12 }) / (A.width * A.height) * 100); };
  for (const sh of [0, -16, -32, -48]) { let tot = 0; const r = []; for (const off of OFFS) { const k2 = `${name}-${off + sh}`; if (!c[k2]) continue; const d = dif(o[`${name}-${off}`], c[k2]); tot += d; r.push(d.toFixed(2)); } console.log('  shift', sh, 'sum', tot.toFixed(2), r.join(' ')); }
}
