# Building sections 1:1 — conventions

The goal is a clean, hand-written Astro site that renders **pixel-for-pixel like
https://shopos.framer.website/** at every breakpoint, with all copy/links/media driven
from JSON.

## Layout of the repo

| Path | What |
|---|---|
| `src/content/site.json` | Page meta, shared links (`links.app`, `links.email`), section order |
| `src/content/sections/<id>.json` | **All** copy, links, image/video paths, list items for one section |
| `src/components/sections/<Component>.astro` | One component per section; markup + scoped `<style>` (+ optional `<script>`) |
| `src/styles/global.css` | Reset, font tokens (`--f-medium` …), colour tokens, `.grad-text`, `[data-reveal]` |
| `src/scripts/interactions.js` | Shared scroll-reveal + video autoplay. `?static` in the URL disables motion |
| `public/assets/{img,video,svg,fonts}` | Every asset, downloaded from the original |
| `reference/tree/<width>-<NN>.txt` | **The spec.** Element tree of original block NN at width 1440/1280/834/390 |
| `reference/data/raw/capture-*.json` | Raw capture (hover diffs under `.hovers`, animations, links) |
| `crosscheck/original-cache/<width>.png` | Full-page screenshot of the original |

### Reading `reference/tree/<width>-<NN>.txt`

```
div "Frame 9" [597.5,664.2,245,41] flex=column gap:10px ... ; radius=30px  TEXT«…»  SRC=/assets/img/x.png  SVG=/assets/svg/y.svg
```
- `[x, y, w, h]` = box in px **relative to the block's top-left**, after layout.
- `flex=` / `grid=` = computed layout; `bg`, `bgi` (background-image), `border`, `radius`, `op`
  (opacity), `tf` (transform), `filter`, `shadow`, `ov` (overflow), `z`, `font=family weight size/line-height ls:letter-spacing colour align`.
- `SRC=` / `SVG=` paths are already local (`/assets/...`). SVG files are the original inline SVG
  markup; use `<img src>` or inline the file content when you need it.
- Elements that only appear at some widths are simply absent from the other widths' trees.

## Rules

1. **Breakpoints** — exactly the original's four (desktop styles are the default):
   ```css
   /* ≥1440 desktop: default rules */
   @media (min-width: 1200px) and (max-width: 1439px) { /* laptop  (ref width 1280) */ }
   @media (min-width: 810px)  and (max-width: 1199px) { /* tablet  (ref width 834)  */ }
   @media (max-width: 809px)                          { /* mobile  (ref width 390)  */ }
   ```
   Between reference widths the layout should behave like Framer's (fixed px vs. fill/percent) —
   compare boxes across widths to infer which dimensions are fixed and which stretch.
2. **Content in JSON.** No copy, URL, or asset path hard-coded in markup. Components receive
   `content` (their JSON) and `links` (from site.json) as props.
3. **`data-ref`** — wrap each original block in an element with `data-ref="NN"` (two digits),
   one element per block. The cross-check finds blocks by that attribute.
4. **Semantic HTML**: headings as `h1`/`h2`/`h3`, lists as `ul/li`, links as `a`, buttons as
   `button`, decorative imagery `alt=""` + `aria-hidden`. Only one `h1` (hero).
5. **Styling**: scoped `<style>` in the component; use the tokens in `global.css`; exact
   computed values from the tree (sizes, letter-spacing, line-height, colours, radii, shadows,
   blurs, gradients). Use the same font family names (`var(--f-medium)` etc.).
6. **Motion**: reproduce the original's motion (marquees, tickers, hover states, appear
   effects). Use `data-reveal` for simple fade-up appears. Any component script/animation must
   be a no-op when `document.documentElement.classList.contains('no-motion')` (CSS: scope
   animations with `html:not(.no-motion)`), so cross-check screenshots are deterministic.
   Videos: `muted loop playsinline autoplay data-autoplay`.
7. **Only edit your own files** (your components + their JSON). Anything global (tokens,
   layout, shared scripts) → describe it in your final report instead of editing.
8. Don't commit.

## Cross-check loop (mandatory, per section, per width)

Dev server runs at `http://127.0.0.1:4321/` (hot reload). Then:

```bash
node scripts/crosscheck.mjs --clone http://127.0.0.1:4321/ --refs 04 --widths 1440,1280,834,390
```
Prints mismatch % and height delta per block, and writes
`crosscheck/<width>/<NN>-compare.png` (original | clone | diff). **Look at the compare image**
(Read tool) — don't trust the number alone. Iterate until the clone height matches (Δh ≈ 0)
and the compare images are visually indistinguishable at all four widths. Videos are hidden in
both pages during the check. Glows that bleed in from a neighbouring block (big blurred
ellipses) can show up as diffs at block edges — note them, don't chase them.
