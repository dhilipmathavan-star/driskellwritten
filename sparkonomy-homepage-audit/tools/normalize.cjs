#!/usr/bin/env node
// Turns data/raw/* captures + data/annotations.json (manual analysis layer) into the
// deliverable data files: sections.json, content.json, assets.json, links.json,
// typography.json, colours.json.
//
// Sections are the LOGICAL sections defined in annotations.json (sections{index:{name, dom:{captureSection,
// selectors}, …}}). The automatic capture only sees 5 top-level DOM nodes (2 fixed background layers,
// <header>, one long <main>, <footer>), so every captured text/link/button/image is re-assigned to a
// logical section by its CSS path (e.g. "section#roots > …") or by its top-level DOM node.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const DATA = path.join(ROOT, 'data');
const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const write = (f, o) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(o, null, 2) + '\n');
const UNK = 'Unable to determine';

const cap = Object.fromEntries(['desktop', 'tablet', 'mobile'].map((v) => [v, read(path.join(RAW, `capture-${v}.json`), null)]).filter(([, c]) => c));
const D = cap.desktop;
if (!D) { console.error('run tools/capture.cjs first'); process.exit(1); }
const css = read(path.join(RAW, 'css.json'), {});
const assets = read(path.join(RAW, 'assets-downloaded.json'), []);
const L = read(path.join(RAW, 'logical-sections.json'), {}); // from tools/logical-shots.cjs
const ann = read(path.join(DATA, 'annotations.json'), {});
const shotExists = (f) => !!f && fs.existsSync(path.join(ROOT, 'screenshots', f));

// ---------- colour helpers ----------
const toHex = (c) => {
  const m = String(c).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const h = [m[1], m[2], m[3]].map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
  return { hex: '#' + h + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() : ''), rgb: `rgb(${Math.round(+m[1])}, ${Math.round(+m[2])}, ${Math.round(+m[3])})`, alpha: +a.toFixed(3) };
};

// ---------- logical sections ----------
const logical = Object.entries(ann.sections || {}).map(([k, v]) => ({ index: +k, ...v })).sort((a, b) => a.index - b.index);
if (!logical.length) { console.error('data/annotations.json has no sections'); process.exit(1); }
// path → logical index. Paths are cssPath()s that stop at the first ancestor with an id.
const idSel = (sel) => (sel.match(/#([\w-]+)/) || [])[1];
function logicalFor(capSectionIndex, p, top) {
  p = p || '';
  // id-anchored selectors first (section#roots, div#story-menu)
  for (const s of logical) for (const sel of s.dom?.selectors || []) { const id = idSel(sel); if (id && new RegExp(`(^|\\s)[a-z]+#${id}(\\s|$|[.:>\\[])`).test(p)) return s.index; }
  for (const s of logical) if (s.dom?.captureSection === capSectionIndex && !(s.dom.selectors || []).some((x) => /^section#/.test(x))) return s.index;
  // deep paths inside <main> lose their section#id anchor (cssPath is capped at 8 levels): fall back to document position
  if (typeof top === 'number') for (const s of logical) { const g = geometry(s); if (g && (s.dom?.selectors || []).some((x) => /^section#/.test(x)) && top >= g.scrollTop && top < g.scrollTop + g.height && !g.marginTop) return s.index; }
  return null;
}
const stateOf = (t, li) => {
  if (/^div#story-menu/.test(t.path) || /md\\:hidden/.test(t.path)) return 'mobile only (<768px)';
  if (t.tag === 'noscript') return 'noscript fallback';
  if (/span\.sr-only/.test(t.path)) return 'screen-reader only';
  if (li && li > 2 && li < 11) return 'revealed on scroll';
  if (t.visible) return 'visible on load';
  return 'hidden at capture';
};

const G = L.desktopGeometry || {};
const dSec = (i) => D.data.sections.find((s) => s.index === i);
const footerBox = dSec(5)?.box;
const docH = L.desktopDocHeight || D.data.docHeight;
function geometry(s) {
  const id = idSel((s.dom?.selectors || [])[0] || '');
  if (G[id]) { const g = G[id]; return { scrollTop: g.top, height: g.height, cssHeight: g.styleHeight || 'auto (min-height 100svh)', marginTop: g.marginTop, pinned: !g.flow, beats: g.beats, beatMode: g.mode, beatStopsY: g.stops }; }
  if (id === 'opening') return { scrollTop: 0, height: G.roots ? G.roots.top : 900, cssHeight: 'min-height: 100svh', pinned: false, beats: 0 };
  if (s.dom?.captureSection === 3) return { scrollTop: 0, height: 80, cssHeight: 'fixed, 79.5px (+112px scrim)', pinned: 'fixed', beats: 0 };
  if (s.dom?.captureSection === 5 && footerBox) return { scrollTop: docH - footerBox.height, height: footerBox.height, cssHeight: 'auto', pinned: false, beats: 0 };
  return null;
}

const persistentLayers = D.data.sections.filter((s) => s.style.position === 'fixed' && !s.texts.length && s.tag === 'div').map((s) => ({
  domNode: { tag: s.tag, className: s.className, cssPath: s.path }, zIndex: s.style.zIndex, background: s.style.bgImage !== 'none' ? s.style.bgImage : 'WebGL <canvas> (see Animations)', canvas: s.lotties.filter((x) => x.tag === 'canvas').map((x) => x.rendered),
}));

const sections = logical.map((s) => {
  const items = { texts: 0, links: 0, buttons: 0, images: 0, svgs: 0 };
  for (const ds of D.data.sections) for (const [k, arr] of Object.entries({ texts: ds.texts, links: ds.links, buttons: ds.buttons, images: ds.images, svgs: ds.svgs })) for (const it of arr) if (logicalFor(ds.index, it.path, it.top) === s.index) items[k]++;
  const sh = s.screenshots || {};
  return {
    position: s.index,
    name: s.name,
    purpose: s.purpose || UNK,
    domNode: { selectors: s.dom?.selectors || [], note: s.dom?.note || null, captureTopLevelNode: s.dom?.captureSection ? `${dSec(s.dom.captureSection)?.tag} (automatic section ${s.dom.captureSection})` : null },
    geometryDesktop: geometry(s),
    background: s.background || UNK,
    layout: s.layout || UNK,
    visualAssets: s.visualAssets || null,
    interaction: s.interaction || UNK,
    cta: s.cta || null,
    notes: s.notes || null,
    counts: items,
    screenshots: { desktop: shotExists(sh.desktop) ? sh.desktop : null, tablet: shotExists(sh.tablet) ? sh.tablet : null, mobile: shotExists(sh.mobile) ? sh.mobile : null, extra: (sh.extra || []).filter((e) => shotExists(e.file)) },
  };
});
write('sections.json', {
  url: D.data.url, capturedAt: ann.capturedAt || null, viewportsCaptured: Object.keys(cap), pageHeight: { desktop: docH, tablet: L.tabletDocHeight || cap.tablet?.data.docHeight || null, mobile: L.mobileDocHeight || cap.mobile?.data.docHeight || null },
  note: 'Logical sections (from data/annotations.json). The DOM only has 5 top-level nodes; see automaticDomNodes.',
  sections,
  persistentLayers,
  automaticDomNodes: D.data.sections.map((s) => ({ index: s.index, tag: s.tag, className: s.className, box: s.box, position: s.style.position, zIndex: s.style.zIndex, screenshot: (D.sectionShots || []).find((x) => x.index === s.index)?.file || null })),
  beatGeometry: { desktop: L.desktopGeometry || null, tablet: L.tabletGeometry || null, mobile: L.mobileGeometry || null },
});

// ---------- content ----------
const content = logical.map((s) => {
  const textBlocks = []; const links = []; const buttons = []; const imageAlts = [];
  for (const ds of D.data.sections) {
    for (const t of ds.texts) if (logicalFor(ds.index, t.path, t.top) === s.index && t.tag !== 'noscript' && !/span\.sr-only/.test(t.path)) {
      const text = t.tag === 'h1' && /\n/.test(t.text) ? t.text.split('\n')[0] : t.text; // H1 = sr-only copy + aria-hidden letters
      textBlocks.push({ tag: t.tag, text, state: stateOf(t, s.index), font: `${t.font.weight} ${t.font.size}/${t.font.lineHeight} ${t.font.family.split(',')[0]}${t.font.letterSpacing !== 'normal' ? ` ls ${t.font.letterSpacing}` : ''}${t.font.transform !== 'none' ? ` ${t.font.transform}` : ''}`, color: t.color });
    }
    for (const l of ds.links) if (logicalFor(ds.index, l.path) === s.index) links.push({ text: l.text || l.aria, href: l.href, target: l.target, rel: l.rel, state: /^div#story-menu/.test(l.path) ? 'mobile menu' : l.visible ? 'visible' : 'hidden at capture' });
    for (const b of ds.buttons) if (logicalFor(ds.index, b.path) === s.index) buttons.push({ text: b.text || b.aria, href: b.href });
    for (const i of ds.images) if (logicalFor(ds.index, i.path) === s.index && i.alt) imageAlts.push(i.alt);
  }
  // third-party / state-dependent copy captured by tools/logical-shots.cjs
  if (s.index === 1 && L.cookieBanner) {
    const cb = L.cookieBanner;
    if (cb.description) textBlocks.push({ tag: 'cookie-banner', text: cb.description.text.replace(/\n\n/g, '\n'), state: 'first visit (CookieYes)', font: cb.description.font.replace(/, "roboto Fallback"/, ''), color: cb.description.color });
    for (const b of [cb.reject, cb.accept]) if (b) textBlocks.push({ tag: 'cookie-button', text: b.text, state: 'first visit (CookieYes)', font: b.font.replace(/, "roboto Fallback"/, ''), color: `${b.color} on ${b.bg}` });
    textBlocks.push({ tag: 'cookie-banner', text: 'Powered by CookieYes', state: 'first visit (CookieYes)', font: '400 12px/20px', color: 'rgb(208, 208, 208)' });
  }
  return { position: s.index, section: s.name, structured: s.copy || null, textBlocks, links, buttons, imageAlts: [...new Set(imageAlts)] };
});
write('content.json', { url: D.data.url, title: D.data.title, meta: D.data.meta, sections: content });

// ---------- links ----------
const SOCIAL = [['LinkedIn', /linkedin\.com/], ['Instagram', /instagram\.com/], ['YouTube', /youtube\.com|youtu\.be/], ['X/Twitter', /(^|\.)x\.com|twitter\.com/], ['Facebook', /facebook\.com|fb\.com|fb\.me/], ['TikTok', /tiktok\.com/], ['Threads', /threads\.net/], ['Discord', /discord\.(gg|com)/], ['Telegram', /t\.me|telegram\./], ['WhatsApp', /wa\.me|whatsapp\./], ['Medium', /medium\.com/], ['GitHub', /github\.com/], ['Pinterest', /pinterest\./], ['Reddit', /reddit\.com/], ['Product Hunt', /producthunt\.com/], ['Substack', /substack\.com/], ['Spotify', /spotify\.com/], ['Snapchat', /snapchat\.com/]];
const host = (() => { try { return new URL(D.data.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
const platformOf = (l) => SOCIAL.find(([, re]) => { try { return re.test(new URL(l.abs).hostname); } catch { return false; } })?.[0] || null;
const classify = (l) => {
  const h = l.href || '';
  if (!h) return 'no-href';
  if (h.startsWith('#')) return 'anchor';
  if (h.startsWith('mailto:')) return 'email';
  if (h.startsWith('tel:')) return 'phone';
  if (h.startsWith('javascript:')) return 'javascript';
  try { const u = new URL(l.abs); if (platformOf(l)) return 'social'; const hn = u.hostname.replace(/^www\./, ''); return hn === host ? 'internal' : hn.endsWith('.' + host) ? 'external (Sparkonomy subdomain)' : 'external'; } catch { return 'unknown'; }
};
const nameOf = (i) => sections.find((s) => s.position === i)?.name || null;
const linkRows = D.data.allLinks.map((l) => {
  const li = logicalFor(l.section, l.path);
  return { text: l.text || null, ariaLabel: l.aria, title: l.title, href: l.href, absoluteUrl: l.abs, target: l.target, rel: l.rel, type: classify(l), platform: platformOf(l), section: li, sectionName: li ? nameOf(li) : (/cky|cookieyes/i.test(l.path + l.abs) ? 'Cookie banner (CookieYes, third-party)' : null), context: /^div#story-menu/.test(l.path) ? 'mobile menu' : l.visible ? 'visible on desktop' : 'hidden on desktop', icon: l.hasSvg ? 'inline SVG' : l.hasImg ? `img${l.imgAlt ? ` (alt: ${l.imgAlt})` : ''}` : null };
});
write('links.json', {
  url: D.data.url,
  links: linkRows,
  social: linkRows.filter((l) => l.type === 'social'),
  uniqueDestinations: [...new Set(linkRows.map((l) => l.absoluteUrl))].sort(),
  mobileMenu: L.menu_mobile || cap.mobile?.mobileNav || null,
});

// ---------- typography ----------
const fontNet = D.network.filter((n) => n.type === 'font' || /font\//.test(n.contentType || '') || /\.(woff2?|ttf|otf)(\?|$)/.test(n.url)).map((n) => ({ url: n.url, contentType: n.contentType, status: n.status, bytes: n.size }));
const role = (tag) => ({ h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6' }[tag]);
const headingStyles = {};
for (const h of D.data.headings.filter((x) => x.visible)) {
  const k = `${h.tag}|${h.family}|${h.weight}|${h.size}|${h.lineHeight}|${h.letterSpacing}`;
  headingStyles[k] ??= { role: role(h.tag), font: h.family.split(',')[0], weight: h.weight, size: h.size, lineHeight: h.lineHeight, letterSpacing: h.letterSpacing, color: h.color, examples: [] };
  if (headingStyles[k].examples.length < 3) headingStyles[k].examples.push(h.text.split('\n')[0].slice(0, 80));
}
const byViewport = Object.fromEntries(Object.entries(cap).map(([v, c]) => [v, c.data.headings.filter((h) => h.visible).map((h) => ({ tag: h.tag, size: h.size, lineHeight: h.lineHeight, weight: h.weight, text: (h.tag === 'h1' ? h.text.split('\n')[0] : h.text.replace(/\n/g, ' / ')).slice(0, 50) }))]));
write('typography.json', {
  summary: ann.typography || null,
  documentFonts: [...new Map(D.data.fonts.map((f) => [`${f.family}|${f.weight}|${f.style}`, f])).values()],
  fontFiles: fontNet,
  fontFaceRules: css.fontFaces || [],
  headingStyles: Object.values(headingStyles),
  headingSizesByViewport: byViewport,
  textStyleCensus: D.data.typography.slice(0, 60),
  measuredComponentStyles: L.styles || null,
});

// ---------- colours ----------
const colourRows = Object.entries(D.data.colors).filter(([c]) => c !== 'none').map(([c, v]) => ({ value: c, ...(toHex(c) || { hex: null, rgb: c, alpha: null }), uses: v.count, usedAs: v.props })).sort((a, b) => b.uses - a.uses);
write('colours.json', {
  palette: ann.colours || null,
  census: colourRows,
  gradients: Object.entries(D.data.gradients).map(([g, n]) => ({ gradient: g, uses: n })).sort((a, b) => b.uses - a.uses),
  rootCustomProperties: D.data.rootVars,
  cssCustomPropertyDeclarations: (css.customProps || []).filter((p) => /#|rgb|hsl|oklch|color/i.test(p)).slice(0, 400),
});

// ---------- assets ----------
write('assets.json', {
  url: D.data.url,
  notes: ann.assetsNotes || null,
  countsByCategory: ['logos', 'images', 'icons', 'illustrations', 'videos', 'backgrounds'].reduce((o, c) => ({ ...o, [c]: assets.filter((a) => a.category === c && a.file).length }), {}),
  assets: assets.map((a) => {
    // capture labels ("3:header", "2:div" …) are per-viewport DOM indexes; logical locations come from annotations.assetLocations
    const loc = (ann.assetLocations || {})[a.asset];
    return { ...a, captureSections: a.sections, sections: loc || a.sections, purpose: (ann.assetPurposes || {})[a.asset] || a.label || null };
  }),
});

console.log(`sections=${sections.length} textBlocks=${content.reduce((n, c) => n + c.textBlocks.length, 0)} links=${linkRows.length} social=${linkRows.filter((l) => l.type === 'social').length} colours=${colourRows.length} assets=${assets.length}`);
const orphan = D.data.sections.flatMap((ds) => ds.texts.filter((t) => t.tag !== 'noscript' && logicalFor(ds.index, t.path, t.top) == null).map((t) => t.text.slice(0, 40)));
if (orphan.length) console.log('texts not mapped to a logical section:', orphan);
