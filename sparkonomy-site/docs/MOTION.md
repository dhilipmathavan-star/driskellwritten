# Matching the original's motion 1:1

Rule: **no guessing.** Every duration, delay, easing curve, spring (stiffness/damping/mass),
keyframe, transform, speed and gap must be copied from the original's source, with a short
comment citing where it came from (`// page.pretty.js:7458`).

## Source of truth

`reference/source/` holds the original site's JS bundles, formatted:

| File | What's in it |
|---|---|
| `page.pretty.js` | The Home page + every component used on it (Ticker, Smooth Scroll, Loader, Navigation, Buttons, Dock, Running-Stroke, …) with their variants, transitions and CSS |
| `framer.pretty.js` | Framer runtime (withFX / appear effects / scroll effects, `useLoop`, presence, spring defaults) |
| `motion.pretty.js` | framer-motion (spring solver, easing, `animate`) |
| `../page-live.html` | The SSR HTML (inline CSS, `data-framer-appear-id`, appear script) |

Components in `page.pretty.js` (search the `displayName`):

| Line | Component | Used where (Home tree line) |
|---|---|---|
| ~70–500 | Ticker (props `speed`, `direction`, `gap`, `hoverFactor`, `fadeOptions`, `padding`, `alignment`) | Sell Better agents (14076, 16173, 18299), Generated rows (21495), Testimonials (28026, 28499) |
| 1122–1203 | Smooth Scroll (`intensity: 20` at 29381) | whole page |
| 1548 | Card shine | find usages |
| 2469 | Holo effect card | find usages |
| 2624 | Assets/Divider | find usages |
| 2915 / 3469 | list / list Copy | Brand OS (22727, 22768) |
| 5412 | Hov | Brand OS (22695) |
| 5724–7116 | Button variants | find usages |
| 7409 | Dock | footer social bar (29330) |
| 7630 | Loader Comp | page-load overlay, block 01 (11730) |
| 7917 | Running-Stroke | Get Started button, block 20 (29240) |
| 8256 | Navigation | nav in block 02 (11753) |
| 8472–9553 | Button/* | find usages |
| 11436 | In Copy | hero prompt box (12161) |
| 11623–11660 | Home-level: `Lo`/`Io` scroll style effect, `Ro`/`zo` appear (spring stiffness 200, damping 40, mass 1, delay 1.5) | `Group 129 › Section` (26111, block 16) and `Group 135` (29234, block 20) |

The page CSS (class rules for every `framer-xxxx`) is at the end of `page.pretty.js`
(~29398+) and inside each component; transitions/hover CSS live there too.

## Verify: `scripts/motioncheck.mjs` (desktop 1440×900 only)

```bash
node scripts/motioncheck.mjs --ref 20 --trigger load   --times 0,500,1500,2000,3000 --clone http://127.0.0.1:4321/
node scripts/motioncheck.mjs --ref 18 --trigger scroll --times 0,1000,4000           --clone http://127.0.0.1:4321/
node scripts/motioncheck.mjs --ref 22 --trigger hover  --orig '<css selector>' --clone-sel '<css selector>' --times 0,100,250,500 --clone http://127.0.0.1:4321/
```
- Both pages run under the same fake clock (16ms ticks); every Web/CSS animation is paused
  and stepped from that clock, so frames at time *t* are the same animation state.
- `--trigger load`: t from navigation. `scroll`: page settles, block jumps into view, t from
  the jump. `hover`: mouse moves onto the selector, t from then. `--pad N` widens the clip,
  `--offset N` scrolls N px less, `--tag x` names the output folder.
- Output: `motioncheck/<ref>-<trigger>[-tag]/<t>-compare.png` (original | clone | diff) and
  `summary.json`. **Read the compare images** and confirm the states match at every t.
- `--pin-tickers`: start every infinite ticker loop at phase 0 at the trigger in both pages (their phase otherwise depends on hydration timing).
- Videos are hidden in both. Real network still loads images, so allow a settle time.
- Your scripts/animations must still respect `html.no-motion` (`?static`), which the static
  `scripts/crosscheck.mjs` uses — after your changes, rerun crosscheck for your blocks at
  1440 to make sure the static layout didn't regress.

Dev server: http://127.0.0.1:4321/ (hot reload; don't restart). The dev server can serve stale
CSS after a file is rewritten by a script — edit files with the Edit tool.
