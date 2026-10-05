// Generates src/content/sections/<id>.json for the full-bleed video bands from the
// reference trees. x/w are % of viewport width; y/h are px (desktop/laptop/tablet)
// or vw (mobile, reference width 390).
const fs = require('fs');
const path = require('path');
const REF = path.resolve(__dirname, '..');
const OUT = path.resolve(REF, '..', 'src', 'content', 'sections');
// video-strip (block 09) is hand-written from source CSS: its container is height:auto (intrinsic
// video ratio), which the codec-less capture browser measured as a 150px fallback.
const BANDS = { 'video-intro': 3, 'video-mid': 5, 'video-outro': 21 };
const BP = { d: 1440, l: 1280, t: 834, m: 390 };
const map = require(path.join(REF, 'asset-map.json'));
const r = (n) => Math.round(n * 100) / 100;
for (const [id, idx] of Object.entries(BANDS)) {
  const out = { ref: String(idx).padStart(2, '0'), height: {}, layers: [] };
  const per = {};
  for (const [k, W] of Object.entries(BP)) {
    const t = JSON.parse(fs.readFileSync(path.join(REF, 'tree', `tree-${W}.json`), 'utf8'));
    const sec = t.sections.find((s) => s.i === idx);
    const root = sec.tree;
    const box = (b) => (k === 'm' ? b.map((v) => r((v / W) * 100)) : [r((b[0] / W) * 100), r(b[1]), r((b[2] / W) * 100), r(b[3])]);
    out.height[k] = k === 'm' ? r((root.b[3] / W) * 100) : root.b[3];
    const layers = [];
    const walk = (n) => {
      if (n.t === 'video' && !layers.some((l) => l.type === 'video')) layers.push({ type: 'video', src: n.src.startsWith('/') ? n.src : map[n.src.split('?')[0]], box: box(n.b), z: 0 });
      else if (n.s?.bgi?.startsWith('linear-gradient') && n.s.pos === 'absolute') layers.push({ type: 'fade', gradient: n.s.bgi, box: box(n.b), z: Number(n.s.z || 0) });
      else if (n.s?.bgi?.startsWith('linear-gradient')) layers.push({ type: 'fade', gradient: n.s.bgi, box: box(n.b), z: Number(n.s.z || 0) });
      (n.c || []).forEach(walk);
    };
    walk(root);
    per[k] = layers;
  }
  const vid = Object.fromEntries(Object.entries(per).map(([k, l]) => [k, l.find((x) => x.type === 'video')]));
  out.video = { src: Object.values(vid).find(Boolean).src, box: Object.fromEntries(Object.entries(vid).map(([k, v]) => [k, v ? v.box : null])) };
  out.fades = Object.fromEntries(Object.entries(per).map(([k, l]) => [k, l.filter((x) => x.type === 'fade').map(({ gradient, box, z }) => ({ gradient, box, z }))]));
  delete out.layers;
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(id, Object.values(out.fades).map((f) => f.length).join('/'), 'fades');
}
