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
