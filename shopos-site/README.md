# House of Models — Astro rebuild of shopos.framer.website

A hand-built, content-driven rebuild of https://shopos.framer.website/ that matches the
original section by section at all four Framer breakpoints (≥1440, 1200–1439, 810–1199, <810).

## Run

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

## Edit content

All copy, links, images and videos live in JSON:

- `src/content/site.json` — page meta, shared links (app URL, contact email), section order
- `src/content/sections/<section>.json` — one file per section

Assets are self-hosted in `public/assets/` (`img/`, `video/`, `svg/`, `fonts/`).

## Structure

```
src/
  layouts/Base.astro            <head>, global CSS, shared script
  pages/index.astro             renders site.json → sections
  components/sections/*.astro   one component per section (scoped CSS)
  content/                      site.json + sections/*.json
  styles/global.css             reset, font + colour tokens, gradient text, reveal
  scripts/interactions.js       scroll reveal, video play/pause (?static disables motion)
reference/                      capture of the original (spec trees, screenshots, tools)
scripts/crosscheck.mjs          per-section visual diff vs the original
docs/BUILDING.md                conventions used to build each section
```

## Cross-check against the original

```bash
npm run dev &
node scripts/crosscheck.mjs --clone http://127.0.0.1:4321/            # all sections, 4 widths
node scripts/crosscheck.mjs --refs 04,06 --widths 1440,390            # subset
```

Writes `crosscheck/report.html` (original | clone | diff per section per width) and
`crosscheck/results.json` (mismatch % and height delta).

## Cross-check results (production build vs original)

Pixel mismatch per block at each reference width. Section heights match the original exactly
(Δh = 0) everywhere, and the full page height is identical (19476 / 19388 / 19872 / 19781 px).
Videos are hidden during the check.

| Block | Section | 1440 | 1280 | 834 | 390 |
|---|---|---|---|---|---|
| 02 | Hero + nav | 0.12% | 0.13% | 0% | 0% |
| 03 | Video intro | 0% | 0% | 0% | 0% |
| 04 | Explore | 1.88% | 2.06% | 1.42% | 2.13% |
| 05 | Video | 0% | 0% | 0% | 0% |
| 06 | Sell Better | 0.06% | 0.05% | 0.06% | 0.14% |
| 07 | Glow divider | 0% | 0% | 0% | 0% |
| 08 | Generated (marquee) | 0.02% | 0.05% | 0.07% | 0.11% |
| 09 | Video strip | 0% | 0% | 0% | 0% |
| 10 | How it works | 0.46% | 0% | 0% | 0.37% |
| 11 | Brand OS | 0.1% | 0.05% | 0.01% | 0.18% |
| 12 | Multi-platform | 0.19% | 0.03% | 0.33% | 0% |
| 13 | Make. Media. Magical. | 0.28% | 0.01% | 0.01% | 0.91% |
| 14 | Your Store/Data/Model | 0.4% | 0.08% | 0% | 1.48% |
| 15 | Supercharged 3X | 0.43% | 0.48% | 0.64% | 0.12% |
| 16 | Under the hood | 0.27% | 0.27% | 0.71% | 0.6% |
| 17 | Testimonials heading | 0.13% | 0.09% | 0.35% | 0% |
| 18 | Testimonial tickers | 0% | 0% | 0% | 0% |
| 19 | Final CTA heading | 0% | 0% | 0% | 0% |
| 20 | Get Started button | 0.06% | 0% | 0.18% | 1.36% |
| 21 | Video outro | 0% | 0% | 0% | 0% |
| 22 | Social bar | 0.01% | 0.02% | 0.03% | 0.03% |
| 23 | Footer line | 0% | 0% | 0% | 0% |
| 24 | Copyright | 0.13% | 0.15% | 0.23% | 0.49% |

Remaining differences are animated GIF frames (block 04), the original's script-driven button
glow caught mid-loop (block 20 @390) and sub-pixel text anti-aliasing.

Faithfully reproduced quirks of the original: the Generate/Personalize/Sell cards in block 12
collapse to 0px below 1200px; the crystal image in block 14 is hidden below 1200px; a few
heights are in `vh`; "BDO Grotesk" (no weight file) falls back to the system font in two labels.

Tip: cross-check against `npm run build && npx astro preview --port 4322` — the dev server can
serve stale CSS after files are rewritten by scripts.
