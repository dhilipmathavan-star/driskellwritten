import { chromium } from 'playwright';
import fs from 'node:fs';
const D = '/tmp/claude-0/-home-user-driskellwritten/b19c60bd-ffc0-51af-b0f1-a7ef58206430/scratchpad/rec';
fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
const W = Number(process.argv[2] || 1440), H = Number(process.argv[3] || 900);
for (const [name, url, proxy] of [['orig', 'https://shopos.framer.website/', true], ['clone', 'http://127.0.0.1:4323/', false]]) {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', proxy: proxy ? { server: process.env.HTTPS_PROXY } : undefined });
  // warm the cache first so network timing doesn't dominate the comparison
  const w = await b.newContext({ viewport: { width: W, height: H } }); const wp = await w.newPage(); await wp.goto(url, { waitUntil: 'networkidle' }); await w.close();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: `${D}/${name}`, size: { width: W, height: H } } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForTimeout(7500);
  console.log(name, 'recorded', Date.now() - t0, 'ms');
  await ctx.close(); await b.close();
}
