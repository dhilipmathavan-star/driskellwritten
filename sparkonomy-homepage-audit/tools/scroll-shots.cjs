// Viewport screenshots while scrolling through the page (fixed/sticky scroll-story sites
// can't be captured as one full-page image).
const fs = require('fs'); const path = require('path');
let playwright; try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const OUT = path.resolve(__dirname, '..', 'screenshots', 'scroll'); fs.mkdirSync(OUT, { recursive: true });
  const b = await playwright.chromium.launch({ executablePath: '/usr/bin/google-chrome', proxy: { server: process.env.HTTPS_PROXY } });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.argv[2] || 'https://www.sparkonomy.com/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = 0; y < h; y += 450) {
    await p.mouse.wheel(0, y === 0 ? 0 : 450); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `${String(i++).padStart(3, '0')}-y${await p.evaluate(() => Math.round(scrollY))}.png`) });
  }
  console.log(i, 'shots, height', h); await b.close();
})();
