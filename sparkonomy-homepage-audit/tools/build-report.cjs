#!/usr/bin/env node
// Builds Sparkonomy-Homepage-Audit.pdf from data/*.json, data/annotations.json, data/raw/logical-sections.json
// and screenshots/. Screenshots are down-sampled to JPEG copies (data/raw/report-img/) so the PDF stays small;
// the full-resolution PNGs remain in screenshots/.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const IMGDIR = path.join(ROOT, 'data', 'raw', 'report-img');
const read = (f, d = {}) => (fs.existsSync(path.join(DATA, f)) ? JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')) : d);
const UNK = 'Unable to determine';

const sectionsDoc = read('sections.json');
const content = read('content.json');
const links = read('links.json');
const typo = read('typography.json');
const colours = read('colours.json');
const assets = read('assets.json');
const ann = read('annotations.json');
const L = read('raw/logical-sections.json');
const capD = read('raw/capture-desktop.json');
const cssRaw = read('raw/css.json');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
// minimal markdown: ###, -, ```, | tables |, paragraphs
function md(src) {
  if (src == null || src === '') return `<p class="unk">${UNK}</p>`;
  if (typeof src !== 'string') return `<pre>${esc(JSON.stringify(src, null, 2))}</pre>`;
  const lines = src.split('\n'); let html = ''; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) { let j = i + 1; const buf = []; while (j < lines.length && !lines[j].startsWith('```')) buf.push(lines[j++]); html += `<pre>${esc(buf.join('\n'))}</pre>`; i = j + 1; continue; }
    if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)[0].length; html += `<h${n + 2}>${inline(l.replace(/^#+ /, ''))}</h${n + 2}>`; i++; continue; }
    if (/^\s*([-*]|\d+\.) /.test(l)) { const ordered = /^\s*\d+\. /.test(l); html += ordered ? '<ol>' : '<ul>'; while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) { const nested = /^\s{2,}/.test(lines[i]); html += `<li${nested ? ' class="nested"' : ''}>${inline(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))}</li>`; i++; } html += ordered ? '</ol>' : '</ul>'; continue; }
    if (l.trim().startsWith('|')) { const rows = []; while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]); html += table(rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))); continue; }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\s*([-*]|\d+\.) |```|\|)/.test(lines[i])) buf.push(lines[i++]);
    html += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return html;
}
const table = (rows, raw = false, cls = '') => {
  if (!rows.length) return '';
  const [h, ...b] = rows; const cell = (c) => (raw ? c : inline(c));
  return `<table class="${cls}"><thead><tr>${h.map((c) => `<th>${cell(c)}</th>`).join('')}</tr></thead><tbody>${b.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
};
const kv = (obj) => `<dl>${Object.entries(obj).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${typeof v === 'string' && v.includes('\n') ? md(v) : inline(v ?? UNK)}</dd>`).join('')}</dl>`;
const swatch = (hex) => `<span class="sw" style="background:${esc(hex)}"></span>`;

// ---------- image preparation (JPEG down-sampling through the browser) ----------
let page;
const prepared = new Map();
async function prep(rel, maxW = 1400, quality = 0.84) {
  if (!rel) return null;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const key = `${rel}|${maxW}|${quality}|${fs.statSync(abs).mtimeMs}`;
  if (prepared.has(key)) return prepared.get(key);
  fs.mkdirSync(IMGDIR, { recursive: true });
  const out = path.join(IMGDIR, crypto.createHash('sha1').update(key).digest('hex').slice(0, 16) + '.jpg');
  if (!fs.existsSync(out)) {
    const b64 = fs.readFileSync(abs).toString('base64');
    const mime = /\.jpe?g$/i.test(rel) ? 'image/jpeg' : 'image/png';
    const data = await page.evaluate(async ({ b64, mime, maxW, quality }) => {
      const im = new Image(); im.src = `data:${mime};base64,` + b64; await im.decode();
      const s = Math.min(1, maxW / im.naturalWidth); const w = Math.round(im.naturalWidth * s); const h = Math.round(im.naturalHeight * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h);
      return c.toDataURL('image/jpeg', quality).split(',')[1];
    }, { b64, mime, maxW, quality });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
  }
  const r = path.relative(ROOT, out);
  prepared.set(key, r);
  return r;
}
async function shot(rel, { w = 1400, cls = '', cap = '' } = {}) {
  const r = await prep(rel.startsWith('screenshots/') || rel.startsWith('assets/') ? rel : `screenshots/${rel}`, w);
  if (!r) return '';
  return `<figure class="${cls}"><img class="shot" src="${esc(r)}">${cap ? `<figcaption>${inline(cap)}</figcaption>` : ''}</figure>`;
}

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined });
  page = await browser.newPage();
  const secs = sectionsDoc.sections || [];
  const toc = ['Cover', 'Website URL', 'Homepage overview', 'Homepage section map', 'Header / navigation', 'Hero', 'Every homepage section', 'Exact copy', 'Visual assets', 'Logo inventory', 'Image inventory', 'Typography', 'Colour palette', 'Buttons & CTAs', 'Animations / interactions', 'Social media links', 'Footer', 'Responsive behaviour', 'Technical findings', 'Existing design system', 'Screenshots', 'Asset inventory'];
  const H = (n, t) => `<h1 id="s${n}" class="chap"><span>${String(n).padStart(2, '0')}</span>${esc(t)}</h1>`;
  const byCat = (c) => (assets.assets || []).filter((a) => a.category === c);
  const dims = (a) => (a.intrinsicDimensions ? a.intrinsicDimensions.join('×') : a.naturalDimensions?.[0] ? a.naturalDimensions.join('×') : UNK);
  const assetCard = (a) => `<div class="acard">${a.file && /\.(svg|png|jpe?g|webp|gif|avif|ico)$/i.test(a.file) ? `<div class="athumb${/thirdparty|og-home|avatar|schema|certified/.test(a.file) ? ' light' : ''}"><img src="${esc(a.file)}"></div>` : '<div class="athumb none">no preview</div>'}<div class="ameta"><b>${esc(a.label || a.asset)}</b><br><code>${esc(a.file ? path.basename(a.file) : 'not downloaded')}</code> · ${esc((a.fileType || '').toUpperCase())} · ${esc(dims(a))}${a.renderedDimensions && a.renderedDimensions[0] ? ` (shown ${a.renderedDimensions.join('×')})` : ''}<br><span>${esc(a.purpose || '')}</span></div></div>`;
  const assetRow = (a) => [a.asset, a.file ? path.basename(a.file) : `— (${a.error || 'not saved'})`, a.category, a.originalUrl, (a.fileType || '').toUpperCase(), dims(a), a.renderedDimensions && a.renderedDimensions[0] ? a.renderedDimensions.join('×') : '—', (a.sections || []).join('; '), a.purpose || (a.alt || []).join(', ') || UNK];

  let body = '';
  // 1 cover
  body += `<section class="cover"><div class="cv-top">Homepage audit · reference extraction</div><h1>Sparkonomy<br>Homepage Audit</h1><p class="cv-url">${esc(sectionsDoc.url || 'https://www.sparkonomy.com/')}</p><p class="cv-meta">Captured: ${esc(ann.capturedAt || UNK)}<br>Viewports: desktop 1440×900 · tablet 834×1112 · mobile 390×844 (Google Chrome via Playwright)</p>${await shot('02-hero.png', { w: 1400, cls: 'cv-shot' })}<ol class="toc">${toc.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>`;

  // 2 url
  body += `${H(2, 'Website URL')}${kv({
    'Audited URL': sectionsDoc.url,
    'Final URL / canonical': 'https://www.sparkonomy.com/ (HTTP 200, no redirect; `<link rel="canonical" href="https://www.sparkonomy.com/">`)',
    'Page title': content.title,
    'Language': '`<html lang="en">`, og:locale en_IN',
    'Scope': 'Homepage only. Linked pages (/creator/earn, /about, /contact, /blogs, /legal/*, creatorgraph.sparkonomy.com) are recorded as destinations, not audited.',
    'Capture method': 'Real Google Chrome driven by Playwright. Automated pass (tools/capture.cjs): DOM, computed CSS, stylesheets, network log, Web Animations, style-mutation log, hover states at 1440×900, 834×1112 and 390×844. Logical-section pass (tools/logical-shots.cjs): scrolls to each story beat using the site\'s own beat maths and waits for the reveal/ink animations, plus cookie banner, mobile menu, hover and component crops. Page JS/CSS bundles were read to extract animation timings. Original assets downloaded from their source URLs (tools/download-assets.cjs).',
    'Document height': `desktop ${sectionsDoc.pageHeight?.desktop?.toLocaleString?.() || UNK}px · tablet ${sectionsDoc.pageHeight?.tablet?.toLocaleString?.() || UNK}px · mobile ${sectionsDoc.pageHeight?.mobile?.toLocaleString?.() || UNK}px`,
  })}`;

  // 3 overview
  body += `${H(3, 'Homepage overview')}${md(ann.overview)}<h3>Head metadata</h3>${table([['Meta', 'Value'], ...(content.meta || []).filter((m) => m.name && m.content).map((m) => [m.name, m.content])])}`;

  // 4 section map
  const geo = (s) => s.geometryDesktop || {};
  body += `${H(4, 'Homepage section map')}<p class="cap">Logical sections in scroll order. The DOM itself has only five top-level nodes — two fixed background layers (WebGL canvas, vignette), the fixed <code>&lt;header&gt;</code>, one long <code>&lt;main&gt;</code> containing nine <code>&lt;section&gt;</code>s, and the <code>&lt;footer&gt;</code> — so sections are mapped by their <code>section#id</code>. Scroll positions are for 1440×900.</p><pre class="map">${esc([
    '┌ fixed  z0   WebGL fluid canvas (100vw × 100lvh) ─ behind everything',
    '├ fixed  z1   radial vignette',
    '├ fixed  z40  HEADER  (+ CookieYes bar on first visit, + #story-menu <768px)',
    ...secs.filter((s) => s.position > 1).map((s) => { const g = geo(s); return `│ ${String(s.position).padStart(2, '0')}  ${(s.domNode.selectors[0] || '').padEnd(17)} ${g.pinned === true ? `pinned ${String(g.cssHeight).padEnd(7)}` : 'flow          '} ${String(g.beats ? g.beats + ' beat' + (g.beats > 1 ? 's' : '') : '').padEnd(8)} ${s.name.length > 52 ? s.name.slice(0, 51) + '…' : s.name}`; }),
  ].join('\n'))}</pre>${table([['#', 'Section', 'DOM anchor', 'Scroll top → bottom (px)', 'CSS height', 'Behaviour', 'Purpose'], ...secs.map((s) => { const g = geo(s); return [String(s.position), s.name, s.domNode.selectors.map((x) => `\`${x}\``).join(', '), g.scrollTop != null ? `${g.scrollTop.toLocaleString()} → ${(g.scrollTop + g.height).toLocaleString()}` : '—', `${g.cssHeight || '—'}${g.marginTop ? ` (margin-top ${g.marginTop})` : ''}`, g.pinned === 'fixed' ? 'fixed overlay' : g.pinned ? `sticky 100svh stage, ${g.beats} beat(s), ${g.beatMode}` : g.beats ? `normal flow, ${g.beats} beats` : 'normal flow', s.purpose]; })], false, 'small secmap')}<h3>Persistent layers (not sections)</h3>${table([['Layer', 'z-index', 'Content'], ['`div.fixed.inset-0.z-0`', '0', 'WebGL2 `<canvas>` 1440×900 (devicePixelRatio capped at 1), fluid ink simulation — see Animations'], ['`div.pointer-events-none.fixed.inset-0.z-[1]`', '1', '`radial-gradient(ellipse 68% 54% at 50% 50%, rgba(0,0,0,.62) 0%, rgba(0,0,0,.34) 46%, rgba(0,0,0,0) 76%)`'], ['`header.fixed.top-0.z-40`', '40', 'Header (section 01)'], ['`.cky-consent-container`', '9999999', 'CookieYes consent bar (first visit)']])}`;

  // 5 header
  const s1 = secs[0] || {};
  body += `${H(5, 'Header / navigation')}${await shot('01-header-nav.png', { cap: 'Desktop header (1440px), cookie banner dismissed' })}${await shot('01-header-cookie-banner.png', { cap: 'First visit: CookieYes bar overlaps the nav links' })}${await shot('_states/nav-link-hover.png', { w: 900, cls: 'half', cap: 'Hover: "Creator Payments" turns white' })}${md(ann.header)}<div class="phones">${await shot('_states/mobile-menu-closed.png', { w: 520, cap: 'Mobile 390: closed' })}${await shot('_states/mobile-menu-open.png', { w: 520, cap: 'Mobile 390: menu open' })}${await shot('_states/cookie-banner-mobile.png', { w: 520, cap: 'Mobile 390: cookie banner' })}${await shot('_states/header-scrolled-desktop.png', { w: 700, cap: 'Desktop after 1200px scroll (unchanged header)' })}</div>${kv({ Interaction: s1.interaction, Notes: s1.notes })}`;

  // 6 hero
  const s2 = secs[1] || {};
  body += `${H(6, 'Hero')}<div class="duo">${await shot('02-hero.png', { cap: 'Desktop 1440×900 (after intro)' })}${await shot('mobile-02-hero.png', { w: 520, cls: 'phone', cap: 'Mobile 390×844' })}</div>${md(ann.hero)}<h3>Page-load sequence (desktop, timed screenshots)</h3><div class="grid3">${(await Promise.all([0, 1000, 2000, 3000, 3500, 4000, 4500, 5200, 6500].map(async (ms) => shot(`_motion/hero-desktop-${String(ms).padStart(4, '0')}ms.png`, { w: 600, cap: `${ms} ms after navigation` })))).join('')}</div><div class="grid2">${await shot('_components/hero-launch-card.png', { w: 1000, cap: 'Launch card' })}${await shot('_components/partner-marquee.png', { w: 1000, cap: 'Partner marquee (edge-faded)' })}</div>${kv({ Layout: s2.layout, Background: s2.background, Notes: s2.notes })}`;

  // 7 every section
  body += `${H(7, 'Every homepage section')}<p class="cap">Desktop screenshot (left) is taken at the scroll position where the section's last beat is fully revealed; mobile (right) at 390×844. Additional states follow where relevant.</p>`;
  for (const s of secs) {
    const sh = s.screenshots || {};
    const g = geo(s);
    body += `<div class="sec${s === secs[0] ? ' first' : ''}"><h2>${String(s.position).padStart(2, '0')} · ${esc(s.name)}</h2><div class="duo">${sh.desktop ? await shot(sh.desktop, { cap: 'Desktop 1440' }) : ''}${sh.mobile ? await shot(sh.mobile, { w: 520, cls: 'phone', cap: 'Mobile 390' }) : ''}</div>${kv({
      Position: `${s.position} of ${secs.length}${g.scrollTop != null ? ` · desktop scroll ${g.scrollTop.toLocaleString()}–${(g.scrollTop + g.height).toLocaleString()}px` : ''}${g.beatStopsY ? ` · beat stops at ${g.beatStopsY.map((y) => y.toLocaleString()).join(', ')}px` : ''}`,
      'DOM anchor': `${s.domNode.selectors.map((x) => `\`${x}\``).join(', ')}${s.domNode.note ? ` — ${s.domNode.note}` : ''}`,
      Purpose: s.purpose, Layout: s.layout, Background: s.background, CTA: s.cta || 'None', Interaction: s.interaction, 'Visual assets': s.visualAssets || UNK, Notes: s.notes || '—',
    })}${(sh.extra || []).length ? `<div class="${(sh.extra || []).every((e) => e.phone) ? 'phones' : 'grid2'}">${(await Promise.all(sh.extra.map((e) => shot(e.file, { w: e.phone ? 520 : 1000, cap: e.caption })))).join('')}</div>` : ''}</div>`;
  }

  // 8 exact copy
  body += `${H(8, 'Exact copy')}<p class="cap">For each section: the copy as structured on the page (verbatim; line breaks as rendered on desktop; source vs. displayed case noted), followed by every captured text node in DOM order with its state and computed style, and the links in that section.</p>`;
  for (const c of content.sections || []) {
    body += `<h2>${String(c.position).padStart(2, '0')} · ${esc(c.section)}</h2>`;
    if (c.structured) body += `<pre class="copy">${esc(c.structured)}</pre>`;
    body += table([['Element', 'Exact text', 'State', 'Style (weight size/line-height family)', 'Colour'], ...c.textBlocks.filter((t) => t.text).map((t) => [t.tag, t.text.replace(/\n/g, ' ⏎ '), t.state, t.font, t.color])], false, 'small');
    if (c.links.length) body += table([['Link text', 'URL', 'Target', 'Context'], ...c.links.map((l) => [l.text || '(icon/no text)', l.href || '—', l.target || '—', l.state || ''])], false, 'small');
  }

  // 9 visual assets
  body += `${H(9, 'Visual assets')}${md(ann.assetsNotes)}${table([['Category', 'Files', 'Folder'], ...['logos', 'images', 'icons', 'illustrations', 'videos', 'backgrounds'].map((c) => [c, String(byCat(c).filter((a) => a.file).length), `assets/${c}/`])])}<h3>Non-file visuals</h3>${table([['Visual', 'Implementation'], ['Fluid ink background', 'WebGL2 canvas simulation (no file) — Animations chapter'], ['Vignette, header scrim, card glows, gradient borders', 'CSS gradients / masks — Colour palette chapter'], ['Hero wordmark', 'Live text (10 coloured spans)'], ['Stance pills, NEW badge', 'HTML/CSS']])}`;
  // 10 logos
  body += `${H(10, 'Logo inventory')}${md(ann.logoNotes)}<div class="grid">${byCat('logos').map(assetCard).join('')}</div>`;
  // 11 images
  body += `${H(11, 'Image inventory')}<h3>Images</h3><div class="grid">${byCat('images').map(assetCard).join('')}</div><h3>Illustrations</h3><div class="grid">${byCat('illustrations').map(assetCard).join('')}</div><h3>Icons</h3><div class="grid">${byCat('icons').map(assetCard).join('')}</div><h3>Videos / animations / backgrounds</h3>${byCat('videos').length || byCat('backgrounds').length ? table([['Asset', 'Original URL', 'Section'], ...[...byCat('videos'), ...byCat('backgrounds')].map((v) => [v.asset, v.originalUrl, (v.sections || []).join(', ')])]) : '<p>No video, Lottie, GIF or background-image files on the homepage. The animated background is a real-time WebGL simulation (see Animations).</p>'}`;

  // 12 typography
  const ty = ann.typography || {};
  body += `${H(12, 'Typography')}${md(ty.notes)}<h3>Type scale (computed)</h3>${ty.system ? `<pre class="copy tiny">${esc(ty.system)}</pre>` : ''}<h3>Heading styles (computed, desktop)</h3>${table([['Role', 'Font', 'Weight', 'Size', 'Line height', 'Letter spacing', 'Colour', 'Example'], ...(typo.headingStyles || []).map((h) => [h.role, h.font, h.weight, h.size, h.lineHeight, h.letterSpacing, h.color, h.examples[0]])], false, 'small')}<h3>Heading sizes by viewport</h3>${table([['Tag', 'Text', 'Desktop 1440', 'Tablet 834', 'Mobile 390'], ...((typo.headingSizesByViewport || {}).desktop || []).map((h, i) => [h.tag, h.text, `${h.size} / ${h.lineHeight}`, (((typo.headingSizesByViewport.tablet || [])[i] || {}).size || '—') + ' / ' + (((typo.headingSizesByViewport.tablet || [])[i] || {}).lineHeight || '—'), (((typo.headingSizesByViewport.mobile || [])[i] || {}).size || '—') + ' / ' + (((typo.headingSizesByViewport.mobile || [])[i] || {}).lineHeight || '—')])], false, 'small')}<h3>Text-style census (computed, desktop, most-used first)</h3>${table([['Family', 'Wt', 'Size', 'LH', 'LS', 'Case', 'Uses', 'Used in', 'Sample'], ...(typo.textStyleCensus || []).slice(0, 30).map((t) => [t.family.split(',')[0], t.weight, t.size, t.lineHeight, t.letterSpacing, t.transform, String(t.count), Object.keys(t.tags).join(', '), t.samples[0] || ''])], false, 'small')}<h3>Font files loaded</h3>${table([['URL', 'Type', 'Bytes'], ...(typo.fontFiles || []).map((f) => [f.url, f.contentType || '', f.bytes ? f.bytes.toLocaleString() : '—'])], false, 'small')}<h3>@font-face rules</h3><pre class="tiny">${esc((typo.fontFaceRules || []).join('\n'))}</pre>`;

  // 13 colours
  const pal = colours.palette || [];
  body += `${H(13, 'Colour palette')}${table([['', 'Name', 'HEX', 'RGB', 'Usage'], ...pal.map((p) => [swatch(p.hex), esc(p.name), esc(p.hex), esc(p.rgb), inline(p.usage)])], true)}<h3>Gradients (computed)</h3>${table([['Preview', 'Gradient', 'Uses'], ...(colours.gradients || []).slice(0, 20).map((g) => [`<span class="gsw" style="background:${esc(g.gradient)}"></span>`, esc(g.gradient), String(g.uses)])], true, 'small')}<h3>Computed colour census (desktop, visible elements)</h3>${table([['', 'HEX', 'RGB', 'α', 'Uses', 'Used as'], ...(colours.census || []).slice(0, 36).map((c) => [swatch(c.value), esc(c.hex || c.value), esc(c.rgb), esc(c.alpha), String(c.uses), esc(Object.entries(c.usedAs).map(([k, v]) => `${k} ${v}`).join(', '))])], true, 'small')}<h3>:root custom properties</h3>${table([['Property', 'Value'], ...Object.entries(colours.rootCustomProperties || {}).map(([k, v]) => [`\`${k}\``, `\`${v}\``])], false, 'small')}`;

  // 14 buttons
  const btns = [];
  for (const b of ann.buttons || []) btns.push(`<div class="btncard">${b.screenshot ? await shot(b.screenshot.replace(/^screenshots\//, ''), { w: 700, cls: 'btnshot natural' }) : ''}${kv(Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'screenshot')))}</div>`);
  body += `${H(14, 'Buttons & CTAs')}${md(ann.buttonsNotes)}<div class="duo">${await shot('_components/btn-nav-cta.png', { w: 500, cap: 'Header CTA — rest' })}${await shot('_components/btn-nav-cta-hover.png', { w: 500, cap: 'Header CTA — hover (opacity .9)' })}</div>${btns.join('') || `<p class="unk">${UNK}</p>`}`;

  // 15 animations
  body += `${H(15, 'Animations / interactions')}${md(ann.animationsNotes)}${(ann.animations || []).map((a) => `<div class="btncard">${kv(a)}</div>`).join('')}<h3>Beat reveals — "Students. / Homemakers. / Doctors. / Farmers."</h3><div class="grid3">${(await Promise.all(['_motion/beats-people-1of5.png', '_motion/beats-people-2of5.png', '_motion/beats-people-3of5.png', '_motion/beats-people-4of5.png', '04-story-people.png'].map((f, i) => shot(f, { w: 600, cap: `Beat ${i + 1} of 5` })))).join('')}</div><h3>"Soften" mode — "And we saw what it takes."</h3><div class="grid3">${(await Promise.all(['_motion/beats-reality-1of5.png', '_motion/beats-reality-2of5.png', '_motion/beats-reality-3of5.png', '_motion/beats-reality-4of5.png', '05-story-reality.png'].map((f, i) => shot(f, { w: 600, cap: `Beat ${i + 1} of 5` })))).join('')}</div><h3>Word ink — mission heading turning magenta</h3><div class="grid3">${(await Promise.all([['_motion/word-ink-mission-0700ms.png', '~0.7 s after arriving'], ['_motion/word-ink-mission-1800ms.png', '~1.8 s'], ['_motion/word-ink-mission-4300ms.png', '~4.3 s']].map(([f, c]) => shot(f, { w: 600, cap: c })))).join('')}</div><h3>CSS @keyframes in the stylesheet (homepage-relevant first)</h3><pre class="tiny">${esc((cssRaw.keyframes || []).filter((k) => /story-marquee|cta-sweep|scroll-cue|cue-pulse|wordmark|enter\{|exit\{/.test(k)).join('\n'))}</pre>`;

  // 16 social
  body += `${H(16, 'Social media links')}${(links.social || []).length ? table([['Platform', 'Exact URL', 'Location', 'Icon', 'aria-label', 'Target / rel'], ...links.social.map((s) => [s.platform, s.href, s.sectionName || '—', s.icon || 'text', s.ariaLabel || '—', `${s.target || '—'} / ${s.rel || '—'}`])]) : '<p>No social media links found on the homepage.</p>'}${md(ann.socialNotes || '')}`;

  // 17 footer
  body += `${H(17, 'Footer')}${await shot('_components/footer.png', { cap: 'Desktop footer (1440px)' })}<div class="duo">${await shot('_components/footer-tablet.png', { w: 900, cap: 'Tablet 834' })}${await shot('_components/footer-mobile.png', { w: 520, cls: 'phone', cap: 'Mobile 390' })}</div>${md(ann.footer)}`;

  // 18 responsive
  const tri = async (d, t, m, label) => `<h3>${esc(label)}</h3><div class="tri">${await shot(d, { w: 900, cap: 'Desktop 1440×900' })}${await shot(t, { w: 600, cap: 'Tablet 834×1112' })}${await shot(m, { w: 420, cap: 'Mobile 390×844' })}</div>`;
  body += `${H(18, 'Responsive behaviour')}${md(ann.responsive)}${await tri('02-hero.png', 'tablet-02-hero.png', 'mobile-02-hero.png', 'Hero')}${await tri('04-story-people.png', 'tablet-04-story-people.png', 'mobile-04-story-people.png', 'Story screen')}${await tri('09-creator-record.png', 'tablet-09-creator-record-intro.png', 'mobile-09-creator-record.png', 'Creator Record')}${await tri('11-footer.png', 'tablet-11-footer.png', 'mobile-11-footer.png', 'End of page / footer')}`;

  // 19 technical
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return u; } };
  const net = {}; for (const n of capD.network || []) { const k = `${hostOf(n.url)}|${n.type}`; net[k] = (net[k] || 0) + 1; }
  body += `${H(19, 'Technical findings')}${md(ann.technical)}<h3>Network requests on desktop load (by host and type)</h3>${table([['Host', 'Type', 'Requests'], ...Object.entries(net).sort((a, b) => b[1] - a[1]).map(([k, v]) => [...k.split('|'), String(v)])], false, 'small')}<h3>Response headers (HTML document)</h3>${table([['Header', 'Value'], ...Object.entries(capD.data?.httpHeaders || {}).filter(([k]) => !/^(date|etag|transfer-encoding|connection)$/.test(k)).map(([k, v]) => [k, String(v).replace(/\n/g, ' ')])], false, 'small')}<h3>Scripts</h3>${table([['src / id', 'async', 'Notes'], ...(capD.data?.scripts || []).filter((s) => s.src || s.id || s.type === 'application/ld+json').map((s) => [s.src || `inline${s.id ? ` #${s.id}` : ''}${s.type ? ` (${s.type})` : ''}`, String(!!s.async), s.inline ? s.inline.replace(/\s+/g, ' ').slice(0, 120) : ''])], false, 'small')}`;

  // 20 design system
  body += `${H(20, 'Existing design system')}${md(ann.designSystem)}`;

  // 21 screenshots
  const order = secs.map((s) => s.screenshots?.desktop).filter(Boolean);
  const gal = async (files, w, cls, capFn) => `<div class="${cls}">${(await Promise.all(files.map((f) => shot(f, { w, cap: capFn(f) })))).join('')}</div>`;
  const scrollFiles = fs.existsSync(path.join(ROOT, 'screenshots/scroll')) ? fs.readdirSync(path.join(ROOT, 'screenshots/scroll')).filter((f) => f.endsWith('.png')).sort().map((f) => `scroll/${f}`) : [];
  const fileCap = (f) => `\`screenshots/${f}\``;
  body += `${H(21, 'Screenshots')}<p class="cap">All files are full-resolution PNGs in <code>screenshots/</code> (this PDF embeds down-sampled copies). Because the page is a stack of pinned screens over a fixed canvas, the automatic full-page captures look mostly black; the logical-section shots and the scroll storyboard are the reliable visual record.</p><h3>A. Logical sections — desktop 1440×900</h3>${await gal(['01-header-cookie-banner.png', ...order.filter((f) => !/^_components/.test(f)), '09-creator-record-intro.png', '11-footer.png'], 900, 'grid2', fileCap)}<h3>B. Logical sections — tablet 834×1112</h3>${await gal(fs.readdirSync(path.join(ROOT, 'screenshots')).filter((f) => /^tablet-\d\d-.*\.png$/.test(f)).sort(), 500, 'grid4', fileCap)}<h3>C. Logical sections — mobile 390×844</h3>${await gal(fs.readdirSync(path.join(ROOT, 'screenshots')).filter((f) => /^mobile-\d\d-.*\.png$/.test(f)).sort(), 400, 'grid5', fileCap)}<h3>D. Scroll storyboard — viewport every 450px of scroll (desktop, cookie banner not dismissed)</h3>${await gal(scrollFiles, 480, 'grid3', (f) => `\`${path.basename(f)}\``)}<h3>E. Automatic full-page captures (scaled to fit)</h3><div class="full3">${await shot('homepage-full-desktop.png', { w: 260, cap: 'Desktop 1440 × 17,374' })}${await shot('homepage-full-tablet.png', { w: 200, cap: 'Tablet 834 × 21,063' })}${await shot('homepage-full-mobile.png', { w: 160, cap: 'Mobile 390 × 15,984 (@2x)' })}</div><h3>F. Component crops and states</h3>${await gal(['_components/creator-record-card.png', '_components/hero-launch-card.png', '_components/cookie-banner.png', '_states/header-scrolled-up-desktop.png'], 700, 'grid2', fileCap)}`;

  // 22 asset inventory
  body += `${H(22, 'Asset inventory')}<p class="cap">Every downloaded file with its original URL. Dimensions are intrinsic (of the downloaded original); "Rendered" is the on-page size at 1440px (0×0 = only shown on mobile).</p>${table([['ID', 'Filename', 'Category', 'Original URL', 'Type', 'Dimensions', 'Rendered', 'Where used', 'Purpose'], ...(assets.assets || []).map(assetRow)], false, 'small')}<h3>All link destinations</h3>${table([['Text / label', 'URL', 'Type', 'Section', 'Context'], ...(links.links || []).map((l) => [l.text || l.ariaLabel || '(icon)', l.href || '—', l.type, l.sectionName || '—', l.context])], false, 'small')}<h3>Package contents</h3><pre class="tiny">${esc(['assets/{logos,images,icons,illustrations,videos,backgrounds}/  original files', 'screenshots/NN-*.png                 logical sections, desktop', 'screenshots/tablet-NN-*.png, mobile-NN-*.png', 'screenshots/_components/  _states/  _motion/  scroll/  _dom-nodes/', 'data/sections.json  content.json  assets.json  links.json  typography.json  colours.json', 'data/annotations.json                manual analysis layer', 'data/raw/                            raw captures (capture-*.json, css.json, homepage.html, logical-sections.json, …)', 'tools/                               capture.cjs, logical-shots.cjs, download-assets.cjs, normalize.cjs, build-report.cjs'].join('\n'))}</pre>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sparkonomy Homepage Audit</title><style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 9.2pt/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #17181c; margin: 0; }
  h1.chap { font-size: 20pt; margin: 0 0 10pt; padding-top: 2pt; break-before: page; display: flex; gap: 10pt; align-items: baseline; border-bottom: 2px solid #17181c; padding-bottom: 6pt; }
  h1.chap span { color: #DE0075; font-weight: 600; font-size: 12pt; }
  h2 { font-size: 12.5pt; margin: 14pt 0 6pt; break-after: avoid; }
  h3 { font-size: 9.5pt; margin: 12pt 0 4pt; break-after: avoid; text-transform: uppercase; letter-spacing: .05em; color: #4a4d57; }
  h4, h5, h6 { font-size: 9.5pt; margin: 10pt 0 3pt; break-after: avoid; }
  p { margin: 0 0 6pt; } ul, ol { margin: 0 0 6pt; padding-left: 14pt; } li { margin-bottom: 1.5pt; } li.nested { margin-left: 12pt; list-style: circle; }
  code { font: 7.8pt ui-monospace, Menlo, Consolas, monospace; background: #f1f2f4; padding: 0 2pt; border-radius: 2pt; word-break: break-word; }
  pre { font: 7.6pt/1.4 ui-monospace, Menlo, Consolas, monospace; background: #f6f7f9; border: 1px solid #e3e5e9; padding: 7pt; white-space: pre-wrap; word-break: break-word; border-radius: 4pt; }
  pre.map { font-size: 7.8pt; white-space: pre; overflow: hidden; } pre.copy { background: #fffaf3; border-color: #f0d9bf; font-size: 8pt; } pre.tiny { font-size: 6.6pt; } pre.copy.tiny { font-size: 6.4pt; white-space: pre; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 7.8pt; table-layout: auto; }
  th, td { border: 1px solid #e3e5e9; padding: 3pt 4pt; text-align: left; vertical-align: top; word-break: break-word; }
  th { background: #f1f2f4; font-weight: 600; } tr { break-inside: avoid; }
  table.small td, table.small th { font-size: 6.8pt; padding: 2pt 3pt; }
  table.secmap td:nth-child(3) { width: 62pt; } table.secmap td:nth-child(3) code { word-break: normal; overflow-wrap: anywhere; }
  figure.natural img.shot { width: auto; max-width: 100%; }
  dl { display: grid; grid-template-columns: 92pt 1fr; gap: 3pt 10pt; margin: 6pt 0 10pt; } dt { font-weight: 600; color: #4a4d57; } dd { margin: 0; } dd p:last-child, dd ul:last-child { margin-bottom: 0; }
  .unk { color: #a0522d; font-style: italic; }
  figure { margin: 4pt 0; break-inside: avoid; } figcaption, .cap { font-size: 7.2pt; color: #6b6e78; margin-top: 2pt; }
  img.shot { display: block; width: 100%; height: auto; border: 1px solid #d6d8dd; background: #000; }
  figure.half { width: 62%; }
  .duo { display: grid; grid-template-columns: 1fr 26%; gap: 8pt; align-items: start; }
  .duo figure:only-child { grid-column: 1 / -1; }
  .phones { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; align-items: start; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; align-items: start; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; align-items: start; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; align-items: start; }
  .grid5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6pt; align-items: start; }
  .tri { display: grid; grid-template-columns: 2.25fr 1.1fr .62fr; gap: 6pt; align-items: start; }
  .full3 { display: flex; gap: 14pt; justify-content: center; align-items: flex-start; } .full3 figure { width: auto; } .full3 img.shot { height: 205mm; width: auto; }
  .sec { border-top: 1px solid #e3e5e9; margin-top: 8pt; break-before: page; } .sec.first { break-before: auto; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; }
  .acard { border: 1px solid #e3e5e9; border-radius: 4pt; overflow: hidden; break-inside: avoid; font-size: 6.8pt; }
  .athumb { height: 66pt; display: flex; align-items: center; justify-content: center; background: #1b1c22; padding: 8pt; }
  .athumb.light { background: repeating-conic-gradient(#e9eaee 0 25%, #fff 0 50%) 0 0/10px 10px; }
  .athumb img { max-width: 100%; max-height: 100%; object-fit: contain; } .athumb.none { color: #999; }
  .ameta { padding: 4pt; word-break: break-word; } .ameta span { color: #4a4d57; }
  .btncard { border: 1px solid #e3e5e9; border-radius: 4pt; padding: 6pt 8pt; margin: 6pt 0; break-inside: avoid; }
  .btncard dl { margin: 2pt 0; }
  figure.btnshot { margin-bottom: 4pt; }
  .sw { display: inline-block; width: 18pt; height: 12pt; border: 1px solid #b9bcc5; border-radius: 2pt; vertical-align: middle; }
  .gsw { display: inline-block; width: 48pt; height: 12pt; border: 1px solid #b9bcc5; border-radius: 2pt; background-color: #000; }
  .cover { height: 262mm; display: flex; flex-direction: column; }
  .cover h1 { font-size: 36pt; line-height: 1.05; margin: 22pt 0 8pt; } .cv-top { text-transform: uppercase; letter-spacing: .12em; font-size: 8pt; color: #DE0075; font-weight: 600; }
  .cv-url { font-size: 13pt; margin: 0; } .cv-meta { color: #6b6e78; } figure.cv-shot { margin: 12pt 0; }
  .toc { columns: 2; font-size: 8.5pt; color: #4a4d57; margin-top: auto; }
  a { color: #2848d8; text-decoration: none; }
  </style></head><body>${body}</body></html>`;
  const htmlPath = path.join(ROOT, 'data', 'raw', 'report.html');
  fs.writeFileSync(htmlPath, html.replace(/(src|href)="(screenshots|assets|data)\//g, '$1="../../$2/'));
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.pdf({ path: path.join(ROOT, 'Sparkonomy-Homepage-Audit.pdf'), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:7pt;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>Sparkonomy — Homepage Audit · https://www.sparkonomy.com/</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  await browser.close();
  console.log('wrote Sparkonomy-Homepage-Audit.pdf');
})().catch((e) => { console.error(e); process.exit(1); });
