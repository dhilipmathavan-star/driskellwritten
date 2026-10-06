#!/usr/bin/env node
// Read-only capture of a single page: screenshots + DOM/CSS/motion/network extraction.
// Usage: node tools/capture.cjs [url]   (default https://www.sparkonomy.com/)
// Output: ../screenshots/*.png, ../data/raw/*.json
'use strict';
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const URL_ = process.argv[2] || 'https://www.sparkonomy.com/';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'screenshots');
const RAW = path.join(ROOT, 'data', 'raw');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  tablet: { width: 834, height: 1112, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const writeJSON = (name, obj) => fs.writeFileSync(path.join(RAW, name), JSON.stringify(obj, null, 2));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Records inline-style / class mutations so JS-driven animations (framer-motion, GSAP, Webflow IX) are visible.
const INIT_SCRIPT = `
(() => {
  window.__mut = [];
  const pathOf = (el) => {
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      let s = el.tagName.toLowerCase();
      if (el.id) { s += '#' + el.id; parts.unshift(s); break; }
      const fn = el.getAttribute('data-framer-name'); if (fn) s += '[data-framer-name="' + fn + '"]';
      else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
      parts.unshift(s); el = el.parentElement;
    }
    return parts.join(' > ');
  };
  const start = performance.now();
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (window.__mut.length > 20000) return;
      if (m.type !== 'attributes') continue;
      window.__mut.push({ t: Math.round(performance.now() - start), attr: m.attributeName, path: pathOf(m.target),
        old: (m.oldValue || '').slice(0, 300), now: (m.target.getAttribute(m.attributeName) || '').slice(0, 300) });
    }
  });
  const go = () => obs.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class'] });
  if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go);
})();
`;

async function autoScroll(page, step = 400, pause = 250) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h + step; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await sleep(pause);
  }
  await sleep(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);
}

// ---------- in-page extractors ----------
function extractPage() {
  const vw = window.innerWidth;
  const cs = (el) => getComputedStyle(el);
  const visible = (el) => {
    const s = cs(el); const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const cssPath = (el) => {
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 8) {
      let s = el.tagName.toLowerCase();
      if (el.id) { s += '#' + CSS.escape(el.id); parts.unshift(s); break; }
      const fn = el.getAttribute('data-framer-name'); if (fn) s += `[data-framer-name="${fn}"]`;
      else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).map(CSS.escape).join('.');
      const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName) : [];
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(el) + 1})`;
      parts.unshift(s); el = el.parentElement;
    }
    return parts.join(' > ');
  };
  const bgUrls = (s) => [...(s.backgroundImage || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => abs(m[1]));
  const docTop = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.top + scrollY); };

  // --- section detection: descend single-child wrappers, then take visible children ---
  let node = document.body;
  for (let i = 0; i < 12; i++) {
    const kids = [...node.children].filter((c) => visible(c) && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK'].includes(c.tagName));
    const big = kids.filter((c) => c.getBoundingClientRect().height > 100);
    if (big.length === 1 && kids.length <= 3 && big[0].children.length) node = big[0]; else break;
  }
  let candidates = [...node.children].filter((c) => visible(c) && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK'].includes(c.tagName));
  // pull fixed/sticky header out of anywhere if not already a candidate
  const hdr = document.querySelector('header, [role=banner], nav');
  if (hdr && !candidates.some((c) => c.contains(hdr))) candidates.unshift(hdr);
  candidates = candidates.filter((c) => c.getBoundingClientRect().height >= 20);

  const sectionInfo = (el, i) => {
    const r = el.getBoundingClientRect(); const s = cs(el);
    // texts in DOM order (leaf-ish text blocks)
    const texts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    let t; const seenParents = new Set();
    while ((t = walker.nextNode())) {
      // group to the nearest block-level ancestor so split <span> words stay together
      let p = t.parentElement;
      while (p && p !== el && ['inline', 'inline-block', 'contents'].includes(cs(p).display) && !['A', 'BUTTON', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'LABEL'].includes(p.tagName)) p = p.parentElement;
      if (!p || seenParents.has(p)) continue;
      seenParents.add(p);
      const ps = cs(p);
      const pr = p.getBoundingClientRect();
      texts.push({
        tag: p.tagName.toLowerCase(), text: (p.innerText || p.textContent || '').replace(/\s+\n/g, '\n').trim(),
        visible: visible(p) && ps.opacity !== '0', top: Math.round(pr.top + scrollY), left: Math.round(pr.left),
        font: { family: ps.fontFamily, weight: ps.fontWeight, size: ps.fontSize, lineHeight: ps.lineHeight, letterSpacing: ps.letterSpacing, transform: ps.textTransform, style: ps.fontStyle },
        color: ps.color, path: cssPath(p),
      });
    }
    const links = [...el.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim(), aria: a.getAttribute('aria-label'), href: a.getAttribute('href'), abs: a.href, target: a.target || null, rel: a.rel || null, visible: visible(a), path: cssPath(a) }));
    const buttons = [...el.querySelectorAll('button, [role=button], input[type=submit], a[class*=button i], a[class*=btn i]')].map((b) => {
      const bs = cs(b);
      return { tag: b.tagName.toLowerCase(), text: (b.innerText || b.value || '').trim(), aria: b.getAttribute('aria-label'), href: b.getAttribute('href'),
        style: { bg: bs.backgroundColor, bgImage: bs.backgroundImage, color: bs.color, border: bs.border, radius: bs.borderRadius, padding: bs.padding, font: `${bs.fontWeight} ${bs.fontSize}/${bs.lineHeight} ${bs.fontFamily}`, letterSpacing: bs.letterSpacing, shadow: bs.boxShadow, transition: bs.transition, width: Math.round(b.getBoundingClientRect().width), height: Math.round(b.getBoundingClientRect().height) },
        path: cssPath(b), visible: visible(b) };
    });
    const images = [...el.querySelectorAll('img')].map((img) => ({ src: abs(img.getAttribute('src') || ''), currentSrc: img.currentSrc, srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes'), alt: img.getAttribute('alt'), natural: [img.naturalWidth, img.naturalHeight], rendered: [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)], loading: img.loading, objectFit: cs(img).objectFit, path: cssPath(img), visible: visible(img) }));
    const pictures = [...el.querySelectorAll('picture source')].map((so) => ({ srcset: so.srcset, type: so.type, media: so.media }));
    const svgs = [...el.querySelectorAll('svg')].filter((sv) => !sv.parentElement.closest('svg')).map((sv) => ({ rendered: [Math.round(sv.getBoundingClientRect().width), Math.round(sv.getBoundingClientRect().height)], viewBox: sv.getAttribute('viewBox'), aria: sv.getAttribute('aria-label'), title: sv.querySelector('title')?.textContent || null, markup: sv.outerHTML.length < 200000 ? sv.outerHTML : null, path: cssPath(sv), visible: visible(sv) }));
    const videos = [...el.querySelectorAll('video')].map((v) => ({ src: v.currentSrc || v.getAttribute('src'), sources: [...v.querySelectorAll('source')].map((so) => ({ src: abs(so.getAttribute('src')), type: so.type })), poster: v.poster, autoplay: v.autoplay, loop: v.loop, muted: v.muted, playsInline: v.playsInline, controls: v.controls, rendered: [Math.round(v.getBoundingClientRect().width), Math.round(v.getBoundingClientRect().height)], path: cssPath(v) }));
    const iframes = [...el.querySelectorAll('iframe')].map((f) => ({ src: f.src, title: f.title, rendered: [Math.round(f.getBoundingClientRect().width), Math.round(f.getBoundingClientRect().height)] }));
    const lotties = [...el.querySelectorAll('lottie-player, dotlottie-player, [data-animation-type=lottie], [data-src$=".json"], canvas')].map((x) => ({ tag: x.tagName.toLowerCase(), src: x.getAttribute('src') || x.getAttribute('data-src'), rendered: [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)], path: cssPath(x) }));
    const backgrounds = [];
    for (const e of [el, ...el.querySelectorAll('*')]) {
      const es = cs(e);
      if (es.backgroundImage && es.backgroundImage !== 'none') backgrounds.push({ path: cssPath(e), backgroundImage: es.backgroundImage.slice(0, 600), urls: bgUrls(es), size: es.backgroundSize, position: es.backgroundPosition, repeat: es.backgroundRepeat, rendered: [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)] });
      if (backgrounds.length > 200) break;
    }
    // layout hints: the main inner container width + grid/flex usage
    const layout = [];
    for (const e of [el, ...el.querySelectorAll('*')]) {
      const es = cs(e);
      if ((es.display.includes('grid') || es.display.includes('flex')) && e.children.length > 1 && e.getBoundingClientRect().width > 200) {
        layout.push({ path: cssPath(e), display: es.display, direction: es.flexDirection, wrap: es.flexWrap, gap: es.gap, columns: es.gridTemplateColumns, justify: es.justifyContent, align: es.alignItems, width: Math.round(e.getBoundingClientRect().width), maxWidth: es.maxWidth, padding: es.padding, children: e.children.length });
      }
      if (layout.length > 40) break;
    }
    // overflow/marquee hints
    const marquees = [];
    for (const e of el.querySelectorAll('*')) {
      const es = cs(e);
      if ((es.overflow.includes('hidden') || es.overflowX === 'hidden') && e.scrollWidth > e.clientWidth * 1.5 && e.children.length) {
        marquees.push({ path: cssPath(e), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, maskImage: es.maskImage || es.webkitMaskImage, items: e.querySelectorAll('img, svg').length });
      }
      if (marquees.length > 20) break;
    }
    return {
      index: i + 1, tag: el.tagName.toLowerCase(), id: el.id || null, className: typeof el.className === 'string' ? el.className : null,
      framerName: el.getAttribute('data-framer-name'), ariaLabel: el.getAttribute('aria-label'), path: cssPath(el),
      box: { top: docTop(el), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      style: { position: s.position, zIndex: s.zIndex, bg: s.backgroundColor, bgImage: s.backgroundImage.slice(0, 600), padding: s.padding, margin: s.margin, maxWidth: s.maxWidth, display: s.display, color: s.color, borderRadius: s.borderRadius, backdropFilter: s.backdropFilter, boxShadow: s.boxShadow },
      texts, links, buttons, images, pictures, svgs, videos, iframes, lotties, backgrounds, layout, marquees,
    };
  };
  const sections = candidates.map(sectionInfo);

  // --- typography census ---
  const typo = {};
  for (const e of document.body.querySelectorAll('*')) {
    if (!visible(e)) continue;
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText) continue;
    const s = cs(e);
    const key = [s.fontFamily, s.fontWeight, s.fontSize, s.lineHeight, s.letterSpacing, s.textTransform, s.fontStyle].join(' | ');
    const ctx = e.closest('h1,h2,h3,h4,h5,h6,p,a,button,li,label,nav,footer,header')?.tagName.toLowerCase() || e.tagName.toLowerCase();
    typo[key] ??= { family: s.fontFamily, weight: s.fontWeight, size: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, transform: s.textTransform, style: s.fontStyle, count: 0, tags: {}, colors: {}, samples: [] };
    const o = typo[key]; o.count++; o.tags[ctx] = (o.tags[ctx] || 0) + 1; o.colors[s.color] = (o.colors[s.color] || 0) + 1;
    if (o.samples.length < 4) o.samples.push(e.textContent.trim().slice(0, 80));
  }
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => { const s = cs(h); return { tag: h.tagName.toLowerCase(), text: h.innerText.trim(), family: s.fontFamily, weight: s.fontWeight, size: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: s.color, visible: visible(h) }; });

  // --- colour census ---
  const colors = {}; const gradients = {};
  const bump = (c, prop) => { if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return; colors[c] ??= { count: 0, props: {} }; colors[c].count++; colors[c].props[prop] = (colors[c].props[prop] || 0) + 1; };
  for (const e of document.querySelectorAll('*')) {
    if (!visible(e)) continue;
    const s = cs(e);
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (hasText) bump(s.color, 'color');
    bump(s.backgroundColor, 'background');
    if (parseFloat(s.borderTopWidth) > 0) bump(s.borderTopColor, 'border');
    if (e instanceof SVGElement) { bump(s.fill, 'svg-fill'); if (s.stroke !== 'none') bump(s.stroke, 'svg-stroke'); }
    if (s.backgroundImage.includes('gradient')) gradients[s.backgroundImage] = (gradients[s.backgroundImage] || 0) + 1;
  }

  // --- root custom properties ---
  const rootVars = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (rule.selectorText && /(^|,)\s*(:root|html|body)\b/.test(rule.selectorText)) {
        for (const p of rule.style) if (p.startsWith('--')) rootVars[p] = rule.style.getPropertyValue(p).trim();
      }
    }
  }

  // --- head / tech ---
  const meta = [...document.querySelectorAll('meta')].map((m) => ({ name: m.name || m.getAttribute('property') || m.httpEquiv || m.getAttribute('charset') && 'charset', content: m.content || m.getAttribute('charset') }));
  const linksHead = [...document.querySelectorAll('link')].map((l) => ({ rel: l.rel, href: l.href, as: l.getAttribute('as'), type: l.type, sizes: l.getAttribute('sizes') }));
  const scripts = [...document.querySelectorAll('script')].map((s) => ({ src: s.src || null, type: s.type || null, async: s.async, defer: s.defer, id: s.id || null, inline: s.src ? null : s.textContent.trim().slice(0, 400) }));
  const styles = [...document.querySelectorAll('style')].map((s) => s.textContent);
  const htmlAttrs = Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]));
  const bodyAttrs = Object.fromEntries([...document.body.attributes].map((a) => [a.name, a.value]));
  const globals = ['Framer', '__framer_importFromPackage', 'Webflow', '__NEXT_DATA__', 'next', '__NUXT__', 'gsap', 'ScrollTrigger', 'Lenis', 'lenis', 'LocomotiveScroll', 'Swiper', 'Splide', 'jQuery', 'lottie', 'bodymovin', 'gtag', 'dataLayer', 'fbq', 'hj', 'clarity', 'posthog', 'mixpanel', 'amplitude', 'analytics', 'Intercom', 'HubSpotConversations', '_hsq', 'Calendly', 'lintrk', '_linkedin_partner_id', 'ttq', 'twq', 'React', 'Vue', 'Alpine', 'Sentry', 'Cal', 'zE', 'Tawk_API', 'crisp', '$crisp']
    .filter((g) => { try { return typeof window[g] !== 'undefined'; } catch { return false; } });
  const fonts = [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status, display: f.display, unicodeRange: f.unicodeRange }));

  // --- all links on the page ---
  const allLinks = [...document.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim(), aria: a.getAttribute('aria-label'), title: a.title || null, href: a.getAttribute('href'), abs: a.href, target: a.target || null, rel: a.rel || null, section: (candidates.findIndex((c) => c.contains(a)) + 1) || null, visible: visible(a), hasSvg: !!a.querySelector('svg'), hasImg: !!a.querySelector('img'), imgAlt: a.querySelector('img')?.alt || null, path: cssPath(a) }));

  // --- sticky/fixed elements ---
  const positioned = [...document.querySelectorAll('*')].filter((e) => ['fixed', 'sticky'].includes(cs(e).position) && visible(e)).map((e) => ({ path: cssPath(e), position: cs(e).position, top: cs(e).top, zIndex: cs(e).zIndex, box: e.getBoundingClientRect().toJSON(), bg: cs(e).backgroundColor, backdrop: cs(e).backdropFilter }));

  // --- elements carrying CSS transitions/animations ---
  const motion = [];
  for (const e of document.querySelectorAll('*')) {
    const s = cs(e);
    const hasT = s.transitionDuration && s.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
    const hasA = s.animationName && s.animationName !== 'none';
    if (hasT || hasA) motion.push({ path: cssPath(e), transition: hasT ? `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction} ${s.transitionDelay}` : null, animation: hasA ? `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction} ${s.animationDelay} ${s.animationIterationCount} ${s.animationDirection}` : null, willChange: s.willChange });
    if (motion.length > 400) break;
  }

  return {
    url: location.href, title: document.title, lang: document.documentElement.lang, viewport: { w: vw, h: innerHeight },
    docHeight: document.documentElement.scrollHeight, wrapperPath: cssPath(node),
    sections, headings, typography: Object.values(typo).sort((a, b) => b.count - a.count), colors, gradients, rootVars,
    meta, linksHead, scripts, styles, htmlAttrs, bodyAttrs, globals, fonts, allLinks, positioned, motion,
  };
}

function collectAnimations() {
  const out = [];
  for (const a of document.getAnimations()) {
    const eff = a.effect; const tgt = eff && eff.target;
    let kf = null; try { kf = eff.getKeyframes().map((k) => { const o = { ...k }; delete o.computedOffset; return o; }); } catch {}
    const timing = eff ? eff.getComputedTiming() : {};
    const path = tgt ? (tgt.getAttribute && (tgt.getAttribute('data-framer-name') || tgt.className?.baseVal || tgt.className || tgt.tagName)) : null;
    out.push({ type: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || null, playState: a.playState, target: tgt ? (tgt.tagName || '').toLowerCase() : null, targetHint: typeof path === 'string' ? path.slice(0, 120) : null,
      duration: timing.duration, delay: timing.delay, iterations: timing.iterations, easing: eff?.getTiming?.().easing, direction: timing.direction, fill: timing.fill, keyframes: kf && kf.slice(0, 6) });
  }
  return out;
}

async function captureViewport(browser, name, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch,
    userAgent: vp.isMobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const network = [];
  page.on('response', async (res) => {
    const req = res.request();
    let size = null; try { size = Number(res.headers()['content-length']) || null; } catch {}
    network.push({ url: res.url(), status: res.status(), type: req.resourceType(), contentType: res.headers()['content-type'] || null, size, server: res.headers()['server'] || null, cache: res.headers()['x-cache'] || res.headers()['cf-cache-status'] || null });
  });
  const consoleMsgs = [];
  page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) }));

  const t0 = Date.now();
  const resp = await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const headers = resp ? resp.headers() : {};
  const html = resp ? await resp.text() : '';
  // page-load (above the fold) animation snapshots, before any scrolling
  const loadShots = [];
  for (const ms of [0, 300, 800, 1600, 3000]) {
    const wait = ms - (Date.now() - t0); if (wait > 0) await sleep(wait);
    if (name === 'desktop' || name === 'mobile') {
      const f = `load-${name}-${String(ms).padStart(4, '0')}ms.png`;
      await page.screenshot({ path: path.join(SHOTS, '_motion', f) }).catch(() => {});
      loadShots.push(f);
    }
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const animsAtLoad = await page.evaluate(collectAnimations);
  const mutLoad = await page.evaluate(() => window.__mut.splice(0));

  // scroll through to fire lazy loading + scroll reveals, sampling animations on the way
  const scrollAnims = [];
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += Math.round(vp.height * 0.5)) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await sleep(350);
    if (name === 'desktop') scrollAnims.push({ y, anims: await page.evaluate(collectAnimations) });
  }
  await sleep(1200);
  const mutScroll = await page.evaluate(() => window.__mut.splice(0));

  // header state after scroll
  let headerScrolled = null;
  if (name === 'desktop' || name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 1200)); await sleep(900);
    await page.screenshot({ path: path.join(SHOTS, `_states/header-scrolled-${name}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(200, vp.height) } }).catch(() => {});
    headerScrolled = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position) && e.getBoundingClientRect().height > 0).map((e) => { const s = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), framerName: e.getAttribute('data-framer-name'), cls: typeof e.className === 'string' ? e.className.slice(0, 80) : null, top: e.getBoundingClientRect().top, height: e.getBoundingClientRect().height, bg: s.backgroundColor, backdrop: s.backdropFilter, shadow: s.boxShadow, transform: s.transform, opacity: s.opacity }; }));
    // scroll up a little: detect hide-on-scroll-down / show-on-scroll-up headers
    await page.evaluate(() => window.scrollTo(0, 900)); await sleep(900);
    await page.screenshot({ path: path.join(SHOTS, `_states/header-scrolled-up-${name}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(200, vp.height) } }).catch(() => {});
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(1200);

  await page.screenshot({ path: path.join(SHOTS, `homepage-full-${name}.png`), fullPage: true });
  await page.screenshot({ path: path.join(SHOTS, `first-viewport-${name}.png`) });
  const data = await page.evaluate(extractPage);
  data.httpHeaders = headers;

  // per-section screenshots
  const sectionShots = [];
  if (opts.sectionShots) {
    const handles = await page.evaluateHandle((paths) => paths.map((p) => document.querySelector(p)), data.sections.map((s) => s.path));
    const props = await handles.getProperties();
    let i = 0;
    for (const sec of data.sections) {
      const el = props.get(String(i))?.asElement(); i++;
      const label = sec.framerName || sec.id || sec.ariaLabel || sec.tag;
      const f = `_dom-nodes/${name === 'desktop' ? '' : name + '-'}${String(sec.index).padStart(2, '0')}-${slug(label)}.png`; // DOM-node shots; logical-section shots come from tools/logical-shots.cjs
      try {
        if (!el) throw new Error('no handle');
        await el.scrollIntoViewIfNeeded(); await sleep(700);
        const box = sec.box;
        if (sec.style.position === 'fixed' || sec.style.position === 'sticky') {
          await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);
          await page.screenshot({ path: path.join(SHOTS, f), clip: { x: 0, y: 0, width: vp.width, height: Math.max(box.height, 40) } });
        } else {
          // hide fixed/sticky overlays (header, chat widgets) so they don't cover the section
          await page.evaluate((sel) => { const own = document.querySelector(sel); for (const e of document.querySelectorAll('*')) { const p = getComputedStyle(e).position; if ((p === 'fixed' || p === 'sticky') && !(own && (own.contains(e) || e.contains(own)))) { e.dataset.auditHidden = e.style.visibility; e.style.visibility = 'hidden'; } } }, sec.path);
          await el.screenshot({ path: path.join(SHOTS, f), timeout: 20000 }).finally(() => page.evaluate(() => { for (const e of document.querySelectorAll('[data-audit-hidden]')) { e.style.visibility = e.dataset.auditHidden; delete e.dataset.auditHidden; } }));
        }
        sectionShots.push({ index: sec.index, file: f });
      } catch (e) { sectionShots.push({ index: sec.index, file: null, error: String(e).slice(0, 200) }); }
    }
  }

  // hover states (desktop only)
  const hovers = [];
  if (opts.hover) {
    await page.evaluate(() => window.__mut.splice(0));
    const targets = await page.$$('a, button, [role=button]');
    for (const t of targets.slice(0, 120)) {
      try {
        if (!(await t.isVisible())) continue;
        const before = await t.evaluate((e) => { const s = getComputedStyle(e); return { text: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 60), href: e.getAttribute('href'), bg: s.backgroundColor, color: s.color, border: s.borderColor, shadow: s.boxShadow, transform: s.transform, opacity: s.opacity, textDecoration: s.textDecorationLine, transition: s.transition, filter: s.filter }; });
        await t.scrollIntoViewIfNeeded(); await t.hover({ timeout: 3000 }); await sleep(600);
        const after = await t.evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, border: s.borderColor, shadow: s.boxShadow, transform: s.transform, opacity: s.opacity, textDecoration: s.textDecorationLine, filter: s.filter }; });
        const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] !== v).map(([k, v]) => [k, { from: before[k], to: v }]));
        const muts = await page.evaluate(() => window.__mut.splice(0).slice(0, 15));
        hovers.push({ text: before.text, href: before.href, transition: before.transition, changed, childStyleMutations: muts });
        await page.mouse.move(0, 0); await sleep(250);
      } catch {}
    }
  }

  // mobile/tablet navigation
  let mobileNav = null;
  if (opts.mobileNav) {
    const cand = await page.$$('header button, nav button, [aria-label*=menu i], [class*=hamburger i], [class*=menu i][role=button], [data-framer-name*=menu i], [data-framer-name*=burger i], [class*=nav-toggle i], .w-nav-button');
    for (const c of cand) {
      try {
        if (!(await c.isVisible())) continue;
        const bb = await c.boundingBox(); if (!bb || bb.y > 200) continue;
        await page.screenshot({ path: path.join(SHOTS, `_states/${name}-menu-closed.png`) });
        await c.click({ timeout: 3000 }); await sleep(1200);
        await page.screenshot({ path: path.join(SHOTS, `_states/${name}-menu-open.png`) });
        mobileNav = await page.evaluate(() => ({
          links: [...document.querySelectorAll('a')].filter((a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return r.top < innerHeight && r.bottom > 0 && r.width > 0 && s.visibility !== 'hidden' && s.opacity !== '0'; }).map((a) => ({ text: a.innerText.trim(), href: a.getAttribute('href'), target: a.target || null })),
          mutations: window.__mut.splice(0).slice(0, 60),
        }));
        mobileNav.trigger = await c.evaluate((e) => ({ tag: e.tagName.toLowerCase(), aria: e.getAttribute('aria-label'), framerName: e.getAttribute('data-framer-name'), cls: typeof e.className === 'string' ? e.className : null }));
        break;
      } catch {}
    }
  }

  await ctx.close();
  return { name, viewport: vp, loadShots, animsAtLoad, scrollAnims, mutations: { load: mutLoad, scroll: mutScroll.slice(0, 5000) }, headerScrolled, data, sectionShots, hovers, mobileNav, network, consoleMsgs, html };
}

(async () => {
  fs.mkdirSync(path.join(SHOTS, '_motion'), { recursive: true });
  fs.mkdirSync(path.join(SHOTS, '_states'), { recursive: true });
  fs.mkdirSync(path.join(SHOTS, '_dom-nodes'), { recursive: true });
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(URL_);
  const proxy = process.env.HTTPS_PROXY && !local ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await playwright.chromium.launch({ proxy, executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined });
  try {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      process.stdout.write(`capturing ${name}…\n`);
      const r = await captureViewport(browser, name, vp, { sectionShots: true, hover: name === 'desktop', mobileNav: name !== 'desktop' });
      if (name === 'desktop') fs.writeFileSync(path.join(RAW, 'homepage.html'), r.html);
      delete r.html;
      writeJSON(`capture-${name}.json`, r);
      process.stdout.write(`  sections=${r.data.sections.length} links=${r.data.allLinks.length} requests=${r.network.length}\n`);
    }
    // stylesheets as served, for @font-face / @keyframes / @media / transitions
    const desk = JSON.parse(fs.readFileSync(path.join(RAW, 'capture-desktop.json'), 'utf8'));
    const cssUrls = [...new Set(desk.network.filter((n) => n.type === 'stylesheet' || (n.contentType || '').includes('text/css')).map((n) => n.url))];
    const ctx = await browser.newContext();
    const css = [];
    for (const u of cssUrls) { try { const r = await ctx.request.get(u); css.push({ url: u, text: await r.text() }); } catch (e) { css.push({ url: u, error: String(e) }); } }
    css.push(...desk.data.styles.map((t, i) => ({ url: `inline-style-${i + 1}`, text: t })));
    const all = css.map((c) => c.text || '').join('\n');
    const grab = (re) => [...all.matchAll(re)].map((m) => m[0]);
    writeJSON('css.json', {
      sources: css.map((c) => ({ url: c.url, bytes: (c.text || '').length, error: c.error })),
      fontFaces: grab(/@font-face\s*{[^}]*}/g),
      keyframes: grab(/@(?:-webkit-)?keyframes\s+[\w-]+\s*{(?:[^{}]*{[^{}]*})*[^{}]*}/g),
      mediaQueries: [...new Set(grab(/@media[^{]+/g).map((s) => s.trim()))],
      transitions: [...new Set(grab(/transition\s*:[^;}]+/g))].slice(0, 300),
      animations: [...new Set(grab(/animation\s*:[^;}]+/g))].slice(0, 300),
      customProps: [...new Set(grab(/--[\w-]+\s*:[^;}]+/g))].slice(0, 1500),
    });
    fs.writeFileSync(path.join(RAW, 'all-styles.css'), all);
    await ctx.close();
  } finally {
    await browser.close();
  }
  process.stdout.write('done\n');
})().catch((e) => { console.error(e); process.exit(1); });
