#!/usr/bin/env bash
# Full read-only audit pipeline for https://www.sparkonomy.com/
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-https://www.sparkonomy.com/}"
node tools/capture.cjs "$URL"          # screenshots + DOM/CSS/motion/network → data/raw/
node tools/logical-shots.cjs "$URL"   # logical-section screenshots + geometry → screenshots/, data/raw/logical-sections.json
node tools/download-assets.cjs         # original assets → assets/<category>/
node tools/normalize.cjs               # data/raw + data/annotations.json → data/*.json
node tools/build-report.cjs            # → Sparkonomy-Homepage-Audit.pdf
