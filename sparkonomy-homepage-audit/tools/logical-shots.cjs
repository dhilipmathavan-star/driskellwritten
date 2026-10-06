#!/usr/bin/env node
// Clean screenshots of the homepage's LOGICAL sections (the page is one long <main> of
// scroll-driven sticky "screens" over a fixed WebGL background, so DOM-node screenshots are
// of limited use). For each screen it scrolls to the scroll position where the screen's last
// beat is fully revealed (same maths as the site's own "story tour"), waits for the word-ink
// transitions, and takes a viewport screenshot. Also captures: hero load sequence, cookie
// banner, nav/CTA hover states, mobile menu, Creator Record card states, component crops,
// and a geometry/computed-style dump (data/raw/logical-sections.json).
// Usage: node tools/logical-shots.cjs [url]
'use strict';
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const URL_ = process.argv[2] || 'https://www.sparkonomy.com/';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'screenshots');
const RAW = path.join(ROOT, 'data', 'raw');
['_motion', '_states', '_components'].forEach((d) => fs.mkdirSync(path.join(SHOTS, d), { recursive: true }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// logical section -> DOM anchor used to position the viewport
const SECTIONS = [
  { n: '03', slug: 'story-roots', id: 'roots' },
  { n: '04', slug: 'story-people', id: 'people' },
  { n: '05', slug: 'story-reality', id: 'reality' },
  { n: '06', slug: 'story-love', id: 'love' },
  { n: '07', slug: 'story-turn', id: 'turn' },
  { n: '08', slug: 'story-mission', id: 'mission' },
  { n: '10', slug: 'closing', id: 'future' },
];

// Port of the site's beat-window maths (chunk 414c2cf9ce43ae7e.js, function y()).
const IN_PAGE = `
window.__beatWindows = (e, t) => {
  const n = (.84 - 45 / (55 * e + 45)) / e;
  const r = t === 'replace' ? .22 * n : Math.min(.32 * n, .14);
  return Array.from({ length: e }, (_, i) => { const a = .06 + i * n; return { in0: a, in1: a + r }; });
};
// keep the site's 10 s idle "auto story tour" from scrolling the page while we capture
setInterval(() => window.dispatchEvent(new PointerEvent('pointermove')), 2000);
window.__stops = () => {
  const out = {};
  document.querySelectorAll('[data-tour-beats]').forEach((s) => {
    const top = s.getBoundingClientRect().top + scrollY;
    const sticky = s.dataset.tourFlow === undefined ? s.firstElementChild : null;
    const travel = s.offsetHeight - (sticky ? sticky.offsetHeight : innerHeight);
    const beats = Number(s.dataset.tourBeats);
    const wins = window.__beatWindows(beats, s.dataset.tourMode);
    out[s.id] = { top: Math.round(top), height: s.offsetHeight, travel: Math.round(travel), beats, mode: s.dataset.tourMode, beatMs: s.dataset.tourBeatMs ? +s.dataset.tourBeatMs : null, flow: s.dataset.tourFlow !== undefined,
      styleHeight: s.style.height || null, marginTop: s.style.marginTop || null,
      stops: sticky ? wins.map((w) => Math.round(top + Math.min(1, w.in1 + .03) * travel)) : null, windows: wins };
  });
  return out;
};
`;

async function settle(page, ms) {
  // keep the site's 10s idle "auto story tour" from starting while we wait
  const end = Date.now() + ms;
  while (Date.now() < end) { await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove'))); await sleep(Math.min(1500, end - Date.now())); }
}
async function go(page, y, wait = 2600) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await settle(page, wait);
}
const hideBanner = (page) => page.addStyleTag({ content: '.cky-consent-container,.cky-overlay,.cky-btn-revisit-wrapper{display:none!important}' });

async function styleOf(page, sel, props) {
  return page.evaluate(({ sel, props }) => {
    const e = document.querySelector(sel); if (!e) return null;
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    return { selector: sel, text: (e.innerText || '').trim().slice(0, 200), box: [Math.round(r.width), Math.round(r.height)], ...Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)])) };
  }, { sel, props });
}
const BTN_PROPS = ['background-image', 'background-color', 'background-size', 'background-position', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'padding', 'border-radius', 'border', 'box-shadow', 'opacity', 'transition', 'animation'];

async function desktop(browser, out) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(IN_PAGE);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // hero load sequence (no wheel/key input, so the hero's 3000 ms intro timer runs naturally)
  for (const ms of [0, 1000, 2000, 3000, 3500, 4000, 4500, 5200, 6500]) {
    const w = ms - (Date.now() - t0); if (w > 0) await sleep(w);
    await page.screenshot({ path: path.join(SHOTS, '_motion', `hero-desktop-${String(ms).padStart(4, '0')}ms.png`) });
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 1500);
  // cookie banner (CookieYes) as first served
  const banner = await page.evaluate(() => {
    const c = document.querySelector('.cky-consent-container'); if (!c) return null;
    const pick = (sel) => { const e = c.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { text: e.innerText.trim(), bg: s.backgroundColor, color: s.color, border: s.border, radius: s.borderRadius, font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`, padding: s.padding, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; };
    const s = getComputedStyle(c); const r = c.getBoundingClientRect();
    return { classes: c.className, position: s.position, top: s.top, bottom: s.bottom, left: s.left, right: s.right, zIndex: s.zIndex, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bar: pick('.cky-consent-bar'), title: pick('.cky-title'), description: pick('.cky-notice-des'), reject: pick('.cky-btn-reject'), accept: pick('.cky-btn-accept'), customize: pick('.cky-btn-customize'), close: pick('.cky-banner-btn-close'), poweredBy: pick('.cky-powered-by, [data-cky-tag="powered-by"]'), html: c.outerHTML.slice(0, 4000) };
  });
  out.cookieBanner = banner;
  await page.screenshot({ path: path.join(SHOTS, '01-header-cookie-banner.png'), clip: { x: 0, y: 0, width: 1440, height: 160 } });
  await page.screenshot({ path: path.join(SHOTS, '_states', 'cookie-banner-desktop-full.png') });
  if (banner) { const b = banner.box; await page.screenshot({ path: path.join(SHOTS, '_components', 'cookie-banner.png'), clip: { x: Math.max(0, b[0] - 8), y: Math.max(0, b[1] - 8), width: Math.min(1440, b[2] + 16), height: b[3] + 16 } }).catch(() => {}); }
  await hideBanner(page);
  await settle(page, 800);
  await page.screenshot({ path: path.join(SHOTS, '01-header-nav.png'), clip: { x: 0, y: 0, width: 1440, height: 120 } });
  await page.screenshot({ path: path.join(SHOTS, '02-hero.png') });
  // hero components + styles
  out.styles = {
    navLink: await styleOf(page, 'header nav[aria-label="Main"] a', BTN_PROPS),
    navCta: await styleOf(page, 'header nav[aria-label="Main"] a.rounded-full', BTN_PROPS),
    heroCta: await styleOf(page, '#opening a.rounded-full', BTN_PROPS),
    heroCard: await styleOf(page, '#opening [data-hero-reveal].rounded-\\[28px\\]', ['background-color', 'border-radius', 'padding', 'max-width', 'width']),
    newBadge: await styleOf(page, '#opening span.absolute', BTN_PROPS),
    readStory: await styleOf(page, '#opening button', BTN_PROPS),
    wordmark: await styleOf(page, '#opening h1', ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-family']),
    tagline: await styleOf(page, '#opening > p', ['font-size', 'font-weight', 'line-height', 'color', 'font-family']),
    headerInner: await styleOf(page, 'header > div.relative', ['max-width', 'padding', 'height']),
    headerScrim: await styleOf(page, 'header > div[aria-hidden]', ['background-image', 'height']),
  };
  const crop = async (sel, file, pad = 12) => {
    const bb = await page.locator(sel).first().boundingBox().catch(() => null);
    if (!bb || !bb.width) return null;
    await page.screenshot({ path: path.join(SHOTS, '_components', file), clip: { x: Math.max(0, bb.x - pad), y: Math.max(0, bb.y - pad), width: bb.width + pad * 2, height: bb.height + pad * 2 } });
    return `_components/${file}`;
  };
  await crop('header nav[aria-label="Main"] a.rounded-full', 'btn-nav-cta.png');
  await crop('#opening a.rounded-full', 'btn-hero-cta.png');
  await crop('#opening button', 'btn-read-our-story.png');
  await crop('#opening [data-hero-reveal].rounded-\\[28px\\]', 'hero-launch-card.png', 24);
  await crop('#opening .overflow-hidden', 'partner-marquee.png', 6);
  // hover states
  await page.hover('header nav[aria-label="Main"] a.rounded-full'); await sleep(500);
  await crop('header nav[aria-label="Main"] a.rounded-full', 'btn-nav-cta-hover.png');
  out.styles.navCtaHover = await styleOf(page, 'header nav[aria-label="Main"] a.rounded-full', ['opacity']);
  await page.hover('header nav[aria-label="Main"] a'); await sleep(400);
  out.styles.navLinkHover = await styleOf(page, 'header nav[aria-label="Main"] a', ['color']);
  await page.screenshot({ path: path.join(SHOTS, '_states', 'nav-link-hover.png'), clip: { x: 760, y: 0, width: 680, height: 80 } });
  await page.mouse.move(5, 890); await sleep(300);

  // story screens
  out.desktopGeometry = await page.evaluate(() => window.__stops());
  out.desktopDocHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const G = out.desktopGeometry;
  for (const s of SECTIONS) {
    const g = G[s.id];
    const last = g.stops[g.stops.length - 1];
    await go(page, last, s.id === 'mission' ? 4200 : 3000);
    await page.screenshot({ path: path.join(SHOTS, `${s.n}-${s.slug}.png`) });
    // intermediate beats for the motion chapter
    if (['people', 'reality'].includes(s.id)) {
      for (let i = 0; i < g.stops.length - 1; i++) { await go(page, g.stops[i], 1600); await page.screenshot({ path: path.join(SHOTS, '_motion', `beats-${s.id}-${i + 1}of${g.stops.length}.png`) }); }
    }
    if (s.id === 'mission') {
      await go(page, g.top - 50, 600);
      await page.evaluate((yy) => window.scrollTo(0, yy), last); await sleep(700);
      await page.screenshot({ path: path.join(SHOTS, '_motion', 'word-ink-mission-0700ms.png') });
      await sleep(1100); await page.screenshot({ path: path.join(SHOTS, '_motion', 'word-ink-mission-1800ms.png') });
      await settle(page, 2500); await page.screenshot({ path: path.join(SHOTS, '_motion', 'word-ink-mission-4300ms.png') });
    }
  }
  // Creator Record (flow section #ocg)
  const ocg = await page.evaluate(() => {
    const s = document.getElementById('ocg'); const top = s.getBoundingClientRect().top + scrollY;
    const h2 = s.querySelector('h2'); const c = s.querySelector('[data-tour-center]');
    return { top: Math.round(top), height: s.offsetHeight, h2Top: Math.round(h2.getBoundingClientRect().top + scrollY), centerTop: Math.round(c.getBoundingClientRect().top + scrollY), centerH: c.offsetHeight, pinTop: c.dataset.pinTop || null, pinned: getComputedStyle(c).position };
  });
  out.ocg = ocg;
  await go(page, ocg.h2Top - 300, 3000);
  await page.screenshot({ path: path.join(SHOTS, '09-creator-record-intro.png') });
  await go(page, ocg.centerTop + ocg.centerH / 2 - 450, 3200);
  await page.screenshot({ path: path.join(SHOTS, '09-creator-record.png') });
  out.styles.recordCta = await styleOf(page, '#ocg a.rounded-full', BTN_PROPS);
  out.styles.recordCardOuter = await styleOf(page, '#ocg .rounded-3xl.p-px', ['background-image', 'border-radius', 'padding']);
  out.styles.recordCardInner = await styleOf(page, '#ocg .rounded-\\[23px\\]', ['background-color', 'border-radius', 'padding', 'width']);
  out.styles.stancePill = await styleOf(page, '#ocg span.w-\\[108px\\]', ['color', 'border', 'background-color', 'border-radius', 'font-size', 'padding', 'width']);
  out.recordCardText = await page.evaluate(() => document.querySelector('#ocg .rounded-\\[23px\\]')?.innerText || null);
  await crop('#ocg .rounded-3xl.p-px', 'creator-record-card.png', 16);
  await crop('#ocg a.rounded-full', 'btn-record-cta.png');
  // footer
  await go(page, out.desktopDocHeight - 900, 2000);
  await page.screenshot({ path: path.join(SHOTS, '11-footer.png') });
  const fb = await page.locator('footer').boundingBox();
  if (fb) await page.screenshot({ path: path.join(SHOTS, '_components', 'footer.png'), clip: { x: 0, y: fb.y, width: 1440, height: Math.min(fb.height, 900 - fb.y) } });
  await page.hover('footer a[aria-label="X"]'); await sleep(400);
  out.styles.socialHover = await styleOf(page, 'footer a[aria-label="X"]', ['color']);
  out.styles.footerLink = await styleOf(page, 'footer a.text-sm', ['color', 'font-size', 'line-height', 'font-weight']);
  out.styles.footerHeading = await styleOf(page, 'footer p.font-medium', ['color', 'font-size', 'line-height', 'font-weight']);
  out.styles.footerInner = await styleOf(page, 'footer > div', ['max-width', 'padding', 'border-top', 'grid-template-columns']);
  out.styles.footerGrid = await styleOf(page, 'footer > div > div', ['display', 'grid-template-columns', 'gap']);
  // canvas
  out.canvas = await page.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return null; const gl = c.getContext('webgl2') ? 'webgl2' : 'webgl'; return { width: c.width, height: c.height, cssW: c.clientWidth, cssH: c.clientHeight, context: gl }; });
  await ctx.close();
}

async function mobileLike(browser, out, name, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(IN_PAGE);
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await settle(page, 7000);
  await page.screenshot({ path: path.join(SHOTS, '_states', `cookie-banner-${name}.png`) });
  out[`cookieBanner_${name}`] = await page.evaluate(() => { const c = document.querySelector('.cky-consent-container'); if (!c) return null; const r = c.getBoundingClientRect(); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], text: c.innerText.trim() }; });
  await hideBanner(page); await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, `${name}-02-hero.png`) });
  // menu
  const btn = page.locator('header button[aria-controls="story-menu"]');
  if (await btn.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, '_states', `${name}-menu-closed.png`) });
    await btn.click(); await sleep(900);
    await page.screenshot({ path: path.join(SHOTS, '_states', `${name}-menu-open.png`) });
    out[`menu_${name}`] = await page.evaluate(() => {
      const m = document.getElementById('story-menu'); const s = getComputedStyle(m);
      const b = document.querySelector('header button[aria-controls="story-menu"]');
      return { hidden: m.hidden, bg: s.backgroundColor, height: s.height, padding: s.padding, bodyOverflow: document.body.style.overflow, buttonAria: b.getAttribute('aria-expanded'), buttonLabel: b.innerText.trim(),
        links: [...m.querySelectorAll('a')].map((a) => { const t = getComputedStyle(a); return { text: a.innerText.trim(), href: a.getAttribute('href'), target: a.target || null, font: `${t.fontWeight} ${t.fontSize}/${t.lineHeight}`, color: t.color, borderBottom: t.borderBottom, padding: t.padding }; }),
        labels: [...m.querySelectorAll('p')].map((p) => p.innerText.trim()), logos: [...m.querySelectorAll('img')].map((i) => i.alt) };
    });
    await btn.click(); await sleep(600);
  }
  out[`${name}Geometry`] = await page.evaluate(() => window.__stops());
  out[`${name}DocHeight`] = await page.evaluate(() => document.documentElement.scrollHeight);
  const G = out[`${name}Geometry`];
  for (const s of SECTIONS) {
    const g = G[s.id]; if (!g || !g.stops) continue;
    await go(page, g.stops[g.stops.length - 1], s.id === 'mission' ? 4200 : 3000);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${s.n}-${s.slug}.png`) });
  }
  // Creator Record: collapsed then expanded (mobile expands once the heading scrolls under the header)
  const ocg = await page.evaluate(() => { const s = document.getElementById('ocg'); const h2 = s.querySelector('h2'); const card = s.querySelector('.rounded-3xl.p-px'); return { top: Math.round(s.getBoundingClientRect().top + scrollY), h2Bottom: Math.round(h2.getBoundingClientRect().bottom + scrollY), cardTop: Math.round((card?.getBoundingClientRect().top || 0) + scrollY), height: s.offsetHeight }; });
  out[`ocg_${name}`] = ocg;
  await go(page, ocg.top + 40, 3000);
  await page.screenshot({ path: path.join(SHOTS, `${name}-09-creator-record-intro.png`) });
  await go(page, ocg.h2Bottom - 40, 3000);
  await page.screenshot({ path: path.join(SHOTS, `${name}-09-creator-record.png`) });
  await go(page, out[`${name}DocHeight`] - vp.h, 2000);
  await page.screenshot({ path: path.join(SHOTS, `${name}-11-footer.png`) });
  await page.locator('footer').screenshot({ path: path.join(SHOTS, '_components', `footer-${name}.png`) }).catch(() => {});
  await ctx.close();
}

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const out = { url: URL_, capturedAt: new Date().toISOString() };
  try {
    process.stdout.write('desktop…\n'); await desktop(browser, out);
    process.stdout.write('mobile…\n'); await mobileLike(browser, out, 'mobile', { w: 390, h: 844, dpr: 2 });
    process.stdout.write('tablet…\n'); await mobileLike(browser, out, 'tablet', { w: 834, h: 1112, dpr: 1 });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(RAW, 'logical-sections.json'), JSON.stringify(out, null, 2));
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
