import { chromium } from 'playwright';
const isOrig = process.argv[2] === 'o';
const b = await chromium.launch(isOrig ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(isOrig ? 'https://shopos.framer.website/' : 'http://127.0.0.1:4321/', { waitUntil: 'load' });
await p.waitForTimeout(6500);
const S = isOrig ? ['[data-framer-name="Button/Button Copy"]', '[data-framer-name="Frame 9"]'] : ['.hero__btn--upload', '[data-chip="1"]'];
const rep = async (label) => console.log(label, JSON.stringify(await p.evaluate((isOrig) => {
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(2)); };
  return isOrig ? { box: q('.framer-NTrrJ .framer-1q2hnjd'), input: q('.framer-NTrrJ input[type=text]'), btns: q('.framer-NTrrJ .framer-svqv5l'), chips: q('.framer-NTrrJ .framer-1g82yo7') }
    : { box: q('.hero__box'), input: q('.hero__input'), btns: q('.hero__actions'), chips: q('.hero__chips') };
}, isOrig)));
await rep('V1');
for (const [i, s] of [S[0], S[1], S[0]].entries()) { const bb = await p.locator(s).first().boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.move(2, 2); await p.waitForTimeout(1500); await rep('step' + i); }
await b.close();
