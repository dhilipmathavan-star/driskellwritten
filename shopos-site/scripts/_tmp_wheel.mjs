import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch(/127\./.test(url) ? {} : { proxy: { server: process.env.HTTPS_PROXY } });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
await p.goto(url, { waitUntil: 'load', timeout: 120000 });
await p.clock.runFor(8000);
await p.mouse.move(720, 450);
const cls = await p.evaluate(() => document.documentElement.className);
await p.clock.pauseAt(new Date(Date.now() + 100000)).catch(()=>{});
await p.mouse.wheel(0, 400);
const out = [];
let t = 0;
for (const target of [0, 100, 200, 400, 600, 800, 1000, 1500, 2000, 2500]) {
  while (t < target) { await p.clock.runFor(16); t += 16; }
  out.push(`${target}:${Math.round(await p.evaluate(() => scrollY))}`);
}
console.log(url, cls, out.join(' '));
await b.close();
