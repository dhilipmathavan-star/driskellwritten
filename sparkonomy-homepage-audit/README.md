# Sparkonomy homepage audit

Read-only audit package for `https://www.sparkonomy.com/` (homepage only).

## Status

Captured 2026-10-06. Deliverable: `Sparkonomy-Homepage-Audit.pdf` (22 chapters). Re-run with:

```bash
tools/run-all.sh
```

## Pipeline

| Step | Script | Output |
|---|---|---|
| Capture (1440 / 834 / 390 px) | `tools/capture.cjs` | `screenshots/`, `data/raw/capture-*.json`, `data/raw/css.json`, `data/raw/homepage.html` |
| Logical-section shots (scroll-story screens, cookie banner, mobile menu, hovers, component crops) | `tools/logical-shots.cjs` | `screenshots/NN-*.png`, `screenshots/{tablet,mobile}-NN-*.png`, `screenshots/_components/`, `_states/`, `_motion/`, `data/raw/logical-sections.json` |
| Download original assets | `tools/download-assets.cjs` | `assets/<logos\|images\|icons\|illustrations\|videos\|backgrounds>/`, `data/raw/assets-downloaded.json` |
| Normalise | `tools/normalize.cjs` | `data/sections.json`, `content.json`, `assets.json`, `links.json`, `typography.json`, `colours.json` |
| PDF | `tools/build-report.cjs` | `Sparkonomy-Homepage-Audit.pdf` |

`data/annotations.json` holds the manual analysis layer (section names, purposes, layout,
interaction notes, palette roles, button specs, design-system summary). `normalize.cjs` and
`build-report.cjs` merge it in; anything missing prints as "Unable to determine".
`data/raw/asset-overrides.json` can re-categorise, rename, skip (`"skip": true`) or add (`"_extra"`) assets.
Sections in the data files are the page's *logical* sections (header, hero, six story screens,
Creator Record, closing, footer); the five raw DOM-node screenshots live in `screenshots/_dom-nodes/`.

Requires Node 18+ and Playwright with Chromium.
