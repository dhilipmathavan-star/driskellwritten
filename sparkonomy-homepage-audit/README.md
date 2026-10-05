# Sparkonomy homepage audit

Read-only audit package for `https://www.sparkonomy.com/` (homepage only).

## Status

Not yet captured. The cloud environment's network policy blocks `www.sparkonomy.com`.
Allow that host, then run:

```bash
tools/run-all.sh
```

## Pipeline

| Step | Script | Output |
|---|---|---|
| Capture (1440 / 834 / 390 px) | `tools/capture.cjs` | `screenshots/`, `data/raw/capture-*.json`, `data/raw/css.json`, `data/raw/homepage.html` |
| Download original assets | `tools/download-assets.cjs` | `assets/<logos\|images\|icons\|illustrations\|videos\|backgrounds>/`, `data/raw/assets-downloaded.json` |
| Normalise | `tools/normalize.cjs` | `data/sections.json`, `content.json`, `assets.json`, `links.json`, `typography.json`, `colours.json` |
| PDF | `tools/build-report.cjs` | `Sparkonomy-Homepage-Audit.pdf` |

`data/annotations.json` holds the manual analysis layer (section names, purposes, layout,
interaction notes, palette roles, button specs, design-system summary). `normalize.cjs` and
`build-report.cjs` merge it in; anything missing prints as "Unable to determine".
`data/raw/asset-overrides.json` can re-categorise or rename downloaded assets.

Requires Node 18+ and Playwright with Chromium.
