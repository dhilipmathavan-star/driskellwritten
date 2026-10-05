#!/usr/bin/env node
// Turns data/raw/* captures + data/annotations.json (manual analysis layer) into the
// deliverable data files: sections.json, content.json, assets.json, links.json,
// typography.json, colours.json.
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
const ann = read(path.join(DATA, 'annotations.json'), {});
const secAnn = (i) => (ann.sections || {})[String(i)] || {};

// ---------- colour helpers ----------
const toHex = (c) => {
  const m = String(c).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const h = [m[1], m[2], m[3]].map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
  return { hex: '#' + h + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() : ''), rgb: `rgb(${Math.round(+m[1])}, ${Math.round(+m[2])}, ${Math.round(+m[3])})`, alpha: +a.toFixed(3) };
};

// ---------- sections ----------
const shotFor = (vp, idx) => (cap[vp]?.sectionShots || []).find((s) => s.index === idx)?.file || null;
const sections = D.data.sections.map((s) => {
  const a = secAnn(s.index);
  return {
    position: s.index,
    name: a.name || s.framerName || s.ariaLabel || s.id || `Section ${s.index}`,
    purpose: a.purpose || UNK,
    domNode: { tag: s.tag, id: s.id, framerName: s.framerName, className: s.className, cssPath: s.path },
    desktopBox: s.box,
    background: a.background || [s.style.bg !== 'rgba(0, 0, 0, 0)' ? s.style.bg : null, s.style.bgImage !== 'none' ? s.style.bgImage : null].filter(Boolean).join(' + ') || 'transparent (inherits page background)',
    layout: a.layout || UNK,
    visualAssets: a.visualAssets || null,
    interaction: a.interaction || UNK,
    cta: a.cta || null,
    notes: a.notes || null,
    counts: { texts: s.texts.length, links: s.links.length, buttons: s.buttons.length, images: s.images.length, svgs: s.svgs.length, videos: s.videos.length, iframes: s.iframes.length, backgrounds: s.backgrounds.length },
    computedStyle: s.style,
    layoutContainers: s.layout.slice(0, 12),
    marquees: s.marquees,
    screenshots: { desktop: shotFor('desktop', s.index), tablet: shotFor('tablet', s.index), mobile: shotFor('mobile', s.index) },
  };
});
write('sections.json', { url: D.data.url, capturedAt: ann.capturedAt || null, viewportsCaptured: Object.keys(cap), pageHeightDesktop: D.data.docHeight, sections });

// ---------- content ----------
const content = D.data.sections.map((s) => ({
  position: s.index,
  section: sections[s.index - 1].name,
  structured: secAnn(s.index).copy || null,
  textBlocks: s.texts.map((t) => ({ tag: t.tag, text: t.text, visible: t.visible, font: `${t.font.weight} ${t.font.size}/${t.font.lineHeight} ${t.font.family.split(',')[0]}`, color: t.color })),
  links: s.links.map((l) => ({ text: l.text || l.aria, href: l.href, target: l.target })),
  buttons: s.buttons.map((b) => ({ text: b.text || b.aria, href: b.href })),
  imageAlts: s.images.map((i) => i.alt).filter(Boolean),
}));
write('content.json', { url: D.data.url, title: D.data.title, meta: D.data.meta, sections: content });

// ---------- links ----------
const SOCIAL = [['LinkedIn', /linkedin\.com/], ['Instagram', /instagram\.com/], ['YouTube', /youtube\.com|youtu\.be/], ['X/Twitter', /(^|\.)x\.com|twitter\.com/], ['Facebook', /facebook\.com|fb\.com|fb\.me/], ['TikTok', /tiktok\.com/], ['Threads', /threads\.net/], ['Discord', /discord\.(gg|com)/], ['Telegram', /t\.me|telegram\./], ['WhatsApp', /wa\.me|whatsapp\./], ['Medium', /medium\.com/], ['GitHub', /github\.com/], ['Pinterest', /pinterest\./], ['Reddit', /reddit\.com/], ['Product Hunt', /producthunt\.com/], ['Substack', /substack\.com/], ['Spotify', /spotify\.com/], ['Snapchat', /snapchat\.com/]];
const host = (() => { try { return new URL(D.data.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
const classify = (l) => {
  const h = l.href || '';
  if (!h) return 'no-href';
  if (h.startsWith('#')) return 'anchor';
  if (h.startsWith('mailto:')) return 'email';
  if (h.startsWith('tel:')) return 'phone';
  if (h.startsWith('javascript:')) return 'javascript';
  try { const u = new URL(l.abs); if (SOCIAL.some(([, re]) => re.test(u.hostname))) return 'social'; return u.hostname.replace(/^www\./, '') === host ? 'internal' : 'external'; } catch { return 'unknown'; }
};
const linkRows = D.data.allLinks.map((l) => ({ text: l.text || null, ariaLabel: l.aria, title: l.title, href: l.href, absoluteUrl: l.abs, target: l.target, rel: l.rel, type: classify(l), platform: SOCIAL.find(([, re]) => { try { return re.test(new URL(l.abs).hostname); } catch { return false; } })?.[0] || null, section: l.section, sectionName: l.section ? sections[l.section - 1]?.name : null, visibleOnDesktop: l.visible, icon: l.hasSvg ? 'inline SVG' : l.hasImg ? `img${l.imgAlt ? ` (alt: ${l.imgAlt})` : ''}` : null }));
write('links.json', {
  url: D.data.url,
  links: linkRows,
  social: linkRows.filter((l) => l.type === 'social'),
  uniqueDestinations: [...new Set(linkRows.map((l) => l.absoluteUrl))].sort(),
  mobileNavigation: cap.mobile?.mobileNav || null,
  tabletNavigation: cap.tablet?.mobileNav || null,
});

// ---------- typography ----------
const fontNet = D.network.filter((n) => n.type === 'font' || /font\//.test(n.contentType || '') || /\.(woff2?|ttf|otf)(\?|$)/.test(n.url)).map((n) => ({ url: n.url, contentType: n.contentType, status: n.status }));
const role = (tag) => ({ h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6' }[tag]);
const headingStyles = {};
for (const h of D.data.headings.filter((x) => x.visible)) {
  const k = `${h.tag}|${h.family}|${h.weight}|${h.size}|${h.lineHeight}|${h.letterSpacing}`;
  headingStyles[k] ??= { role: role(h.tag), font: h.family, weight: h.weight, size: h.size, lineHeight: h.lineHeight, letterSpacing: h.letterSpacing, color: h.color, examples: [] };
  if (headingStyles[k].examples.length < 3) headingStyles[k].examples.push(h.text.slice(0, 80));
}
const byViewport = Object.fromEntries(Object.entries(cap).map(([v, c]) => [v, c.data.headings.filter((h) => h.visible).map((h) => ({ tag: h.tag, size: h.size, lineHeight: h.lineHeight, weight: h.weight, text: h.text.slice(0, 50) }))]));
write('typography.json', {
  summary: ann.typography || null,
  documentFonts: [...new Map(D.data.fonts.map((f) => [`${f.family}|${f.weight}|${f.style}`, f])).values()],
  fontFiles: fontNet,
  fontFaceRules: css.fontFaces || [],
  headingStyles: Object.values(headingStyles),
  headingSizesByViewport: byViewport,
  textStyleCensus: D.data.typography.slice(0, 60),
});

// ---------- colours ----------
const colourRows = Object.entries(D.data.colors).map(([c, v]) => ({ value: c, ...(toHex(c) || { hex: null, rgb: c, alpha: null }), uses: v.count, usedAs: v.props })).sort((a, b) => b.uses - a.uses);
write('colours.json', {
  palette: ann.colours || null,
  census: colourRows,
  gradients: Object.entries(D.data.gradients).map(([g, n]) => ({ gradient: g, uses: n })).sort((a, b) => b.uses - a.uses),
  rootCustomProperties: D.data.rootVars,
  cssCustomPropertyDeclarations: (css.customProps || []).filter((p) => /#|rgb|hsl|oklch|color/i.test(p)).slice(0, 400),
});

// ---------- assets ----------
write('assets.json', { url: D.data.url, notes: ann.assetsNotes || null, assets: assets.map((a) => ({ ...a, purpose: (ann.assetPurposes || {})[a.asset] || null })) });

console.log(`sections=${sections.length} links=${linkRows.length} social=${linkRows.filter((l) => l.type === 'social').length} colours=${colourRows.length} assets=${assets.length}`);
