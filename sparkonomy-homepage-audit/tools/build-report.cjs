#!/usr/bin/env node
// Builds Sparkonomy-Homepage-Audit.pdf from data/*.json, data/annotations.json and screenshots/.
'use strict';
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const SHOTS = path.join(ROOT, 'screenshots');
const SLICES = path.join(ROOT, 'data', 'raw', 'slices');
const read = (f, d = {}) => (fs.existsSync(path.join(DATA, f)) ? JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')) : d);
const UNK = 'Unable to determine';

const sectionsDoc = read('sections.json');
const content = read('content.json');
const links = read('links.json');
const typo = read('typography.json');
const colours = read('colours.json');
const assets = read('assets.json');
const ann = read('annotations.json');

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
    if (/^\s*[-*] /.test(l)) { html += '<ul>'; while (i < lines.length && /^\s*[-*] /.test(lines[i])) { const nested = /^\s{2,}/.test(lines[i]); html += `<li${nested ? ' class="nested"' : ''}>${inline(lines[i].replace(/^\s*[-*] /, ''))}</li>`; i++; } html += '</ul>'; continue; }
    if (l.trim().startsWith('|')) { const rows = []; while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]); html += table(rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))); continue; }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\s*[-*] |```|\|)/.test(lines[i])) buf.push(lines[i++]);
    html += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return html;
}
const table = (rows, raw = false) => {
  if (!rows.length) return '';
  const [h, ...b] = rows; const cell = (c) => (raw ? c : inline(c));
  return `<table><thead><tr>${h.map((c) => `<th>${cell(c)}</th>`).join('')}</tr></thead><tbody>${b.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
};
const kv = (obj) => `<dl>${Object.entries(obj).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${typeof v === 'string' && v.includes('\n') ? md(v) : inline(v ?? UNK)}</dd>`).join('')}</dl>`;
const img = (rel, cls = '') => (rel && fs.existsSync(path.join(ROOT, rel)) ? `<img class="shot ${cls}" src="${esc(rel)}">` : '');
const shot = (f, cls = '') => (f ? img(`screenshots/${f}`, cls) : '');
const swatch = (hex) => `<span class="sw" style="background:${esc(hex)}"></span>`;

async function sliceTall(page, rel, maxH) {
  // splits a tall screenshot into page-sized slices so it prints legibly
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  fs.mkdirSync(SLICES, { recursive: true });
  const b64 = fs.readFileSync(abs).toString('base64');
  const parts = await page.evaluate(async ({ b64, maxH }) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const out = [];
    for (let y = 0; y < im.naturalHeight; y += maxH) {
      const h = Math.min(maxH, im.naturalHeight - y);
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = h;
      c.getContext('2d').drawImage(im, 0, y, im.naturalWidth, h, 0, 0, im.naturalWidth, h);
      out.push(c.toDataURL('image/png').split(',')[1]);
    }
    return out;
  }, { b64, maxH });
  const base = path.basename(rel, '.png');
  return parts.map((p, i) => { const f = path.join(SLICES, `${base}-${String(i + 1).padStart(2, '0')}.png`); fs.writeFileSync(f, Buffer.from(p, 'base64')); return path.relative(ROOT, f); });
}

(async () => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  const fullSlices = {
    desktop: await sliceTall(page, 'screenshots/homepage-full-desktop.png', 1900),
    tablet: await sliceTall(page, 'screenshots/homepage-full-tablet.png', 2400),
    mobile: await sliceTall(page, 'screenshots/homepage-full-mobile.png', 3600),
  };
  const secs = sectionsDoc.sections || [];
  const toc = ['Cover', 'Website URL', 'Homepage overview', 'Homepage section map', 'Header / navigation', 'Hero', 'Every homepage section', 'Exact copy', 'Visual assets', 'Logo inventory', 'Image inventory', 'Typography', 'Colour palette', 'Buttons & CTAs', 'Animations / interactions', 'Social media links', 'Footer', 'Responsive behaviour', 'Technical findings', 'Existing design system', 'Screenshots', 'Asset inventory'];
  const H = (n, t) => `<h1 id="s${n}" class="chap"><span>${String(n).padStart(2, '0')}</span>${esc(t)}</h1>`;
  const byCat = (c) => (assets.assets || []).filter((a) => a.category === c);
  const assetCard = (a) => `<div class="acard">${a.file && /\.(svg|png|jpe?g|webp|gif|avif|ico)$/i.test(a.file) ? `<div class="athumb"><img src="${esc(a.file)}"></div>` : '<div class="athumb none">no preview</div>'}<div class="ameta"><b>${esc(a.asset)}</b><br>${esc(a.file ? path.basename(a.file) : 'not downloaded')}<br><span>${esc((a.alt || []).join(', ') || '—')}</span></div></div>`;
  const assetRow = (a) => [a.asset, a.file ? path.basename(a.file) : `— (${a.error || 'not saved'})`, a.originalUrl, (a.fileType || '').toUpperCase(), a.intrinsicDimensions ? a.intrinsicDimensions.join('×') : a.naturalDimensions?.[0] ? a.naturalDimensions.join('×') : UNK, a.renderedDimensions ? a.renderedDimensions.join('×') : '—', (a.sections || []).join(', '), a.purpose || (a.alt || []).join(', ') || UNK];

  let body = '';
  // 1 cover
  body += `<section class="cover"><div class="cv-top">Homepage audit · reference extraction</div><h1>Sparkonomy<br>Homepage Audit</h1><p class="cv-url">${esc(sectionsDoc.url || 'https://www.sparkonomy.com/')}</p><p class="cv-meta">Captured: ${esc(ann.capturedAt || UNK)} · Viewports: ${esc((sectionsDoc.viewportsCaptured || []).join(', '))}</p>${img('screenshots/first-viewport-desktop.png', 'cv-shot')}<ol class="toc">${toc.map((t, i) => `<li>${esc(t)}</li>`).join('')}</ol></section>`;
  // 2 url
  body += `${H(2, 'Website URL')}${kv({ 'Audited URL': sectionsDoc.url, 'Page title': content.title, 'Scope': 'Homepage only. Linked pages are recorded as destinations, not audited.', 'Capture method': 'Headless Chromium (Playwright) at 1440×900 desktop, 834×1112 tablet, 390×844 mobile; DOM, computed CSS, stylesheets, network log, Web Animations API and style-mutation log captured; original assets downloaded from their source URLs.' })}`;
  // 3 overview
  body += `${H(3, 'Homepage overview')}${md(ann.overview)}${table([['Meta', 'Value'], ...(content.meta || []).filter((m) => m.name && m.content).map((m) => [m.name, m.content])])}`;
  // 4 section map
  body += `${H(4, 'Homepage section map')}<pre class="map">${esc(secs.map((s) => `${String(s.position).padStart(2, '0')}. ${s.name}`).join('\n'))}</pre>${table([['#', 'Section', 'Purpose', 'DOM node', 'Top (px)', 'Height (px)'], ...secs.map((s) => [String(s.position), s.name, s.purpose, [s.domNode.tag, s.domNode.framerName && `"${s.domNode.framerName}"`, s.domNode.id && `#${s.domNode.id}`].filter(Boolean).join(' '), String(s.desktopBox.top), String(s.desktopBox.height)])])}`;
  // 5 header
  body += `${H(5, 'Header / navigation')}${shot(secs[0]?.screenshots.desktop)}${md(ann.header)}<div class="two">${img('screenshots/_states/header-scrolled-desktop.png')}${img('screenshots/_states/mobile-menu-open.png', 'phone')}</div><p class="cap">Left: header after scrolling 1200px (desktop). Right: mobile menu open state.</p>`;
  // 6 hero
  body += `${H(6, 'Hero')}${md(ann.hero)}<div class="two">${img('screenshots/first-viewport-desktop.png')}${img('screenshots/first-viewport-mobile.png', 'phone')}</div><h3>Page-load sequence (desktop)</h3><div class="strip">${['0000', '0300', '0800', '1600', '3000'].map((ms) => `<figure>${img(`screenshots/_motion/load-desktop-${ms}ms.png`)}<figcaption>${+ms} ms</figcaption></figure>`).join('')}</div>`;
  // 7 every section
  body += H(7, 'Every homepage section');
  for (const s of secs) {
    const c = (content.sections || [])[s.position - 1] || {};
    body += `<div class="sec"><h2>${String(s.position).padStart(2, '0')} · ${esc(s.name)}</h2>${shot(s.screenshots.desktop)}${kv({ Position: String(s.position), Purpose: s.purpose, Layout: s.layout, Background: s.background, CTA: s.cta || (c.buttons || []).map((b) => `${b.text} → ${b.href || '(no href)'}`).join('; ') || 'None', Interaction: s.interaction, 'Visual assets': s.visualAssets || `${s.counts.images} <img>, ${s.counts.svgs} inline <svg>, ${s.counts.videos} <video>, ${s.counts.backgrounds} CSS backgrounds`, Notes: s.notes || '—' })}</div>`;
  }
  // 8 exact copy
  body += `${H(8, 'Exact copy')}<p class="cap">Visible text in DOM order per section, captured from the rendered desktop page. Text is verbatim (line breaks inside an element preserved).</p>`;
  for (const c of content.sections || []) {
    body += `<h2>${String(c.position).padStart(2, '0')} · ${esc(c.section)}</h2>`;
    if (c.structured) body += `<pre class="copy">${esc(c.structured)}</pre>`;
    body += table([['Element', 'Exact text', 'Style'], ...c.textBlocks.filter((t) => t.text).map((t) => [t.tag + (t.visible ? '' : ' (hidden)'), t.text, t.font])]);
    if (c.links.length) body += table([['Link text', 'URL', 'Target'], ...c.links.map((l) => [l.text || '(icon/no text)', l.href || '—', l.target || '—'])]);
  }
  // 9 visual assets
  body += `${H(9, 'Visual assets')}${md(ann.assetsNotes)}${table([['Category', 'Count', 'Folder'], ...['logos', 'images', 'icons', 'illustrations', 'videos', 'backgrounds'].map((c) => [c, String(byCat(c).length), `assets/${c}/`])])}`;
  // 10 logos
  body += `${H(10, 'Logo inventory')}${md(ann.logoNotes)}<div class="grid">${byCat('logos').map(assetCard).join('')}</div>`;
  // 11 images
  body += `${H(11, 'Image inventory')}<div class="grid">${[...byCat('images'), ...byCat('illustrations'), ...byCat('backgrounds'), ...byCat('icons')].map(assetCard).join('')}</div>${byCat('videos').length ? table([['Video / animation', 'Original URL', 'Section'], ...byCat('videos').map((v) => [v.asset, v.originalUrl, (v.sections || []).join(', ')])]) : ''}`;
  // 12 typography
  const ty = ann.typography || {};
  body += `${H(12, 'Typography')}${md(ty.notes)}${ty.system ? `<pre class="copy">${esc(ty.system)}</pre>` : ''}<h3>Heading styles (computed, desktop)</h3>${table([['Role', 'Font', 'Weight', 'Size', 'Line height', 'Letter spacing', 'Colour', 'Example'], ...(typo.headingStyles || []).map((h) => [h.role, h.font, h.weight, h.size, h.lineHeight, h.letterSpacing, h.color, h.examples[0]])])}<h3>Heading sizes by viewport</h3>${table([['Tag', 'Text', 'Desktop', 'Tablet', 'Mobile'], ...((typo.headingSizesByViewport || {}).desktop || []).map((h, i) => [h.tag, h.text, `${h.size}/${h.lineHeight}`, ((typo.headingSizesByViewport.tablet || [])[i] || {}).size || '—', ((typo.headingSizesByViewport.mobile || [])[i] || {}).size || '—'])])}<h3>Text-style census (computed, desktop, most-used first)</h3>${table([['Family', 'Wt', 'Size', 'LH', 'LS', 'Uses', 'Used in', 'Sample'], ...(typo.textStyleCensus || []).slice(0, 30).map((t) => [t.family.split(',')[0], t.weight, t.size, t.lineHeight, t.letterSpacing, String(t.count), Object.keys(t.tags).join(', '), t.samples[0] || ''])])}<h3>Loaded font files</h3>${table([['URL', 'Type'], ...(typo.fontFiles || []).map((f) => [f.url, f.contentType || ''])])}`;
  // 13 colours
  const pal = (colours.palette || []);
  body += `${H(13, 'Colour palette')}${pal.length ? table([['', 'Name', 'HEX', 'RGB', 'Usage'], ...pal.map((p) => [swatch(p.hex), esc(p.name), esc(p.hex), esc(p.rgb), inline(p.usage)])], true) : ''}<h3>Computed colour census (desktop)</h3>${table([['', 'HEX', 'RGB', 'α', 'Uses', 'Used as'], ...(colours.census || []).slice(0, 40).map((c) => [swatch(c.hex || c.value), esc(c.hex || c.value), esc(c.rgb), esc(c.alpha), String(c.uses), esc(Object.entries(c.usedAs).map(([k, v]) => `${k} ${v}`).join(', '))])], true)}${(colours.gradients || []).length ? `<h3>Gradients</h3>${table([['Gradient', 'Uses'], ...colours.gradients.slice(0, 20).map((g) => [g.gradient, String(g.uses)])])}` : ''}`;
  // 14 buttons
  body += `${H(14, 'Buttons & CTAs')}${md(ann.buttonsNotes)}${(ann.buttons || []).map((b) => `<div class="btncard">${b.screenshot ? img(b.screenshot, 'btnshot') : ''}${kv(Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'screenshot')))}</div>`).join('') || `<p class="unk">${UNK}</p>`}`;
  // 15 animations
  body += `${H(15, 'Animations / interactions')}${md(ann.animationsNotes)}${(ann.animations || []).map((a) => `<div class="btncard">${kv(a)}</div>`).join('')}`;
  // 16 social
  body += `${H(16, 'Social media links')}${(links.social || []).length ? table([['Platform', 'Exact URL', 'Location', 'Icon'], ...links.social.map((s) => [s.platform, s.href, s.sectionName || '—', s.icon || 'text'])]) : '<p>No social media links found on the homepage.</p>'}${md(ann.socialNotes || '')}`;
  // 17 footer
  const last = secs[secs.length - 1];
  body += `${H(17, 'Footer')}${shot(last?.screenshots.desktop)}${md(ann.footer)}`;
  // 18 responsive
  body += `${H(18, 'Responsive behaviour')}${md(ann.responsive)}<div class="three"><figure>${img('screenshots/first-viewport-desktop.png')}<figcaption>Desktop 1440</figcaption></figure><figure>${img('screenshots/first-viewport-tablet.png')}<figcaption>Tablet 834</figcaption></figure><figure>${img('screenshots/first-viewport-mobile.png')}<figcaption>Mobile 390</figcaption></figure></div>`;
  // 19 technical
  body += `${H(19, 'Technical findings')}${md(ann.technical)}`;
  // 20 design system
  body += `${H(20, 'Existing design system')}${md(ann.designSystem)}`;
  // 21 screenshots
  body += `${H(21, 'Screenshots')}<h3>Full homepage — desktop (1440px)</h3>${fullSlices.desktop.map((f) => img(f, 'slice')).join('')}<h3>Full homepage — tablet (834px)</h3><div class="narrow">${fullSlices.tablet.map((f) => img(f, 'slice')).join('')}</div><h3>Full homepage — mobile (390px)</h3><div class="narrower">${fullSlices.mobile.map((f) => img(f, 'slice')).join('')}</div>`;
  // 22 asset inventory
  body += `${H(22, 'Asset inventory')}<table class="small">${table([['Asset', 'Filename', 'Original URL', 'Type', 'Dimensions', 'Rendered', 'Section', 'Purpose'], ...(assets.assets || []).map(assetRow)]).replace(/^<table>|<\/table>$/g, '')}</table><h3>All link destinations</h3>${table([['Text', 'URL', 'Type', 'Section'], ...(links.links || []).map((l) => [l.text || l.ariaLabel || '(icon)', l.href || '—', l.type, l.sectionName || '—'])])}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sparkonomy Homepage Audit</title><style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 9.5pt/1.45 -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif; color: #17181c; margin: 0; }
  h1.chap { font-size: 20pt; margin: 0 0 10pt; padding-top: 2pt; break-before: page; display: flex; gap: 10pt; align-items: baseline; border-bottom: 2px solid #17181c; padding-bottom: 6pt; }
  h1.chap span { color: #8a8d96; font-weight: 500; font-size: 12pt; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 12pt 0 4pt; break-after: avoid; text-transform: uppercase; letter-spacing: .04em; color: #4a4d57; }
  h4, h5, h6 { font-size: 10pt; margin: 10pt 0 3pt; break-after: avoid; }
  p { margin: 0 0 6pt; } ul { margin: 0 0 6pt; padding-left: 14pt; } li.nested { margin-left: 12pt; list-style: circle; }
  code { font: 8.5pt ui-monospace, Menlo, monospace; background: #f1f2f4; padding: 0 2pt; border-radius: 2pt; }
  pre { font: 8pt/1.4 ui-monospace, Menlo, monospace; background: #f6f7f9; border: 1px solid #e3e5e9; padding: 7pt; white-space: pre-wrap; word-break: break-word; border-radius: 4pt; }
  pre.map { font-size: 10pt; } pre.copy { background: #fffdf5; border-color: #eee2b8; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 8pt; table-layout: auto; }
  th, td { border: 1px solid #e3e5e9; padding: 3pt 4pt; text-align: left; vertical-align: top; word-break: break-word; }
  th { background: #f1f2f4; font-weight: 600; } tr { break-inside: avoid; }
  table.small td, table.small th { font-size: 7pt; }
  dl { display: grid; grid-template-columns: 110pt 1fr; gap: 3pt 10pt; margin: 6pt 0 10pt; } dt { font-weight: 600; color: #4a4d57; } dd { margin: 0; } dd p:last-child { margin: 0; }
  .unk { color: #a0522d; font-style: italic; }
  img.shot { display: block; max-width: 100%; border: 1px solid #e3e5e9; margin: 6pt 0; break-inside: avoid; }
  img.phone { max-width: 46%; } .two { display: flex; gap: 8pt; align-items: flex-start; } .two img { max-width: 60%; } .two img.phone { max-width: 30%; }
  .three { display: grid; grid-template-columns: 2.2fr 1.3fr .7fr; gap: 8pt; align-items: start; } figure { margin: 0; } figcaption, .cap { font-size: 7.5pt; color: #6b6e78; }
  .strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4pt; }
  img.slice { margin: 0 auto; border: 0; break-before: auto; } .narrow img.slice { max-width: 62%; } .narrower img.slice { max-width: 42%; }
  .sec { break-inside: auto; border-top: 1px solid #e3e5e9; margin-top: 10pt; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; }
  .acard { border: 1px solid #e3e5e9; border-radius: 4pt; overflow: hidden; break-inside: avoid; font-size: 7pt; }
  .athumb { height: 70pt; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#f3f4f6 0 25%, #fff 0 50%) 0 0/12px 12px; padding: 6pt; }
  .athumb img { max-width: 100%; max-height: 100%; object-fit: contain; } .athumb.none { color: #999; }
  .ameta { padding: 4pt; word-break: break-all; } .ameta span { color: #6b6e78; }
  .btncard { border: 1px solid #e3e5e9; border-radius: 4pt; padding: 6pt 8pt; margin: 6pt 0; break-inside: avoid; } img.btnshot { max-height: 60pt; width: auto; }
  .sw { display: inline-block; width: 16pt; height: 12pt; border: 1px solid #ccd; border-radius: 2pt; vertical-align: middle; }
  .cover { height: 265mm; display: flex; flex-direction: column; }
  .cover h1 { font-size: 38pt; line-height: 1.05; margin: 30pt 0 10pt; } .cv-top { text-transform: uppercase; letter-spacing: .12em; font-size: 8pt; color: #6b6e78; }
  .cv-url { font-size: 13pt; margin: 0; } .cv-meta { color: #6b6e78; } img.cv-shot { margin: 14pt 0; max-height: 110mm; object-fit: cover; object-position: top; }
  .toc { columns: 2; font-size: 8.5pt; color: #4a4d57; margin-top: auto; }
  a { color: #2848d8; text-decoration: none; }
  </style></head><body>${body}</body></html>`;
  const htmlPath = path.join(ROOT, 'data', 'raw', 'report.html');
  fs.writeFileSync(htmlPath, html.replace(/(src|href)="(screenshots|assets|data)\//g, '$1="../../$2/'));
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.pdf({ path: path.join(ROOT, 'Sparkonomy-Homepage-Audit.pdf'), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:7pt;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>Sparkonomy — Homepage Audit</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  await browser.close();
  console.log('wrote Sparkonomy-Homepage-Audit.pdf');
})().catch((e) => { console.error(e); process.exit(1); });
