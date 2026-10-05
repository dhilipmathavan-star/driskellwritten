import { chromium } from 'playwright';
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('framenavigated', (f) => { if (f === p.mainFrame()) console.log('nav', f.url()); });
await p.goto('https://shopos.framer.website/', { waitUntil: 'load' });
await p.waitForTimeout(6000);
for (const s of ['[data-framer-name="Button/Button Copy"]', '[data-framer-name="Frame 9"]', '[data-framer-name="Frame 8"]']) {
  const l = p.locator(s); console.log(s, await l.count(), JSON.stringify(await l.first().boundingBox()));
}
const bb = await p.locator('[data-framer-name="Button/Button Copy"]').first().boundingBox();
await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => document.querySelector('.framer-NTrrJ')?.getAttribute('data-framer-name')), p.url());
await b.close();
