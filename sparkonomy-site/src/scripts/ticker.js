// Port of the original site's Framer "Ticker" component (reference/source/page.pretty.js:76–330,
// defaults/property controls at :330–520). Markup contract:
//
//   <div data-ticker='{"speed":60,"direction":"left","gap":10,...}'>   ← Ticker's <section>
//     <ul>  <li>…</li> <li>…</li>  </ul>                               ← the slots (originals)
//   </div>
//
// Options (JSON in data-ticker) mirror the component props: speed (px/s), direction
// (left|right|top|bottom), gap, padding, alignment, hoverFactor, fadeOptions
// {fadeContent, overflow, fadeWidth, fadeInset, fadeAlpha} and `overrides` keyed by
// breakpoint (desktop|laptop|tablet|mobile) – the Home tree's per-breakpoint prop overrides.
//
// Algorithm (same as the source):
//  • measure  parent   = section offsetWidth/Height (incl. padding)              (:121)
//             children = last.offsetLeft+offsetWidth − first.offsetLeft + gap     (:122–133)
//  • dupes    q = min(round(parent / children * 2) + 1, 100) extra copies, aria-hidden (:109–113, :190)
//  • loop     Y = children + children * round(parent / children)                  (:233)
//  • motion   WAAPI  transform: [f(0), f(Y)], duration Y / speed * 1000 ms, linear, infinite (:245–255)
//             f = left: translateX(-Ypx) · right: translateX(Ypx) · top: translateY(-Ypx) · bottom: translateY(Ypx) (:333–338)
//             right/bottom start the list at left/top: −Y                       (:289–290)
//  • hover    mouseenter on the list → playbackRate = hoverFactor (instant), mouseleave → 1 (:299–304)
//  • before the first measurement the section is opacity 0 and has no copies (:109–117, :282)
//  • re-measured on resize (ResizeObserver on the section, :149–155); the animation restarts
//    from 0 only when Y / speed / hoverFactor change (effect deps, :257)
//  • no animation under prefers-reduced-motion (useReducedMotion, :243) or html.no-motion
//    (?static) – the list then rests at its start position.
const BREAKPOINTS = {
  // page.pretty.js:11592 (Ao)
  desktop: '(min-width: 1440px)',
  laptop: '(min-width: 1200px) and (max-width: 1439px)',
  tablet: '(min-width: 810px) and (max-width: 1199px)',
  mobile: '(max-width: 809px)',
};
const MAX_DUPES = 100; // ye, page.pretty.js:332
const TRANSFORM = {
  // be, page.pretty.js:333–338
  left: (v) => `translateX(-${v}px)`,
  right: (v) => `translateX(${v}px)`,
  top: (v) => `translateY(-${v}px)`,
  bottom: (v) => `translateY(${v}px)`,
};
const DEFAULTS = {
  // ve.defaultProps + property-control defaults, page.pretty.js:342–360, 365–383
  gap: 10,
  padding: 10,
  speed: 100,
  direction: 'left',
  alignment: 'center',
  hoverFactor: 1,
  fadeOptions: { fadeContent: true, overflow: false, fadeWidth: 25, fadeAlpha: 0, fadeInset: 0 },
};
const clamp = (v, min, max) => Math.min(Math.max(v, min), max); // De, page.pretty.js:534

const root = document.documentElement;
const noMotion = () =>
  root.classList.contains('no-motion') || new URLSearchParams(location.search).has('static');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canWAAPI = typeof Animation !== 'undefined' && typeof Animation.prototype.updatePlaybackRate === 'function'; // xe, :339

function activeBreakpoint() {
  for (const [name, q] of Object.entries(BREAKPOINTS)) if (matchMedia(q).matches) return name;
  return 'desktop';
}

class Ticker {
  constructor(section) {
    this.section = section;
    this.list = section.querySelector(':scope > ul');
    this.base = { ...DEFAULTS, ...JSON.parse(section.dataset.ticker || '{}') };
    this.originals = [...this.list.children];
    this.dupes = [];
    this.anim = null;
    this.hovering = false;
    this.animKey = '';
    this.list.addEventListener('mouseenter', () => {
      this.hovering = true;
      if (this.anim) this.anim.playbackRate = this.props.hoverFactor;
    });
    this.list.addEventListener('mouseleave', () => {
      this.hovering = false;
      if (this.anim) this.anim.playbackRate = 1;
    });
    this.applyProps();
    requestAnimationFrame(() => this.measure()); // A.read(ue) on mount, :147
    let first = true;
    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!first && (width || height)) this.measure();
      first = false;
    }).observe(section);
    // per-breakpoint prop overrides (Framer's breakpoint variants) – re-measure on switch
    for (const q of Object.values(BREAKPOINTS)) matchMedia(q).addEventListener('change', () => this.measure());
  }

  applyProps() {
    const bp = activeBreakpoint();
    const o = this.base.overrides?.[bp] || {};
    const p = { ...this.base, ...o, fadeOptions: { ...this.base.fadeOptions, ...(o.fadeOptions || {}) } };
    this.props = p;
    this.horizontal = p.direction === 'left' || p.direction === 'right';
    const { fadeContent, overflow, fadeWidth, fadeInset, fadeAlpha } = p.fadeOptions;
    // mask: page.pretty.js:258–262
    const dir = this.horizontal ? 'to right' : 'to bottom';
    const a = fadeWidth / 2;
    const b = 100 - fadeWidth / 2;
    const mask = `linear-gradient(${dir}, rgba(0, 0, 0, ${fadeAlpha}) ${clamp(fadeInset, 0, a)}%, rgba(0, 0, 0, 1) ${a}%, rgba(0, 0, 0, 1) ${b}%, rgba(0, 0, 0, ${fadeAlpha}) ${100 - fadeInset}%)`;
    const s = this.section.style;
    s.webkitMaskImage = s.maskImage = fadeContent ? mask : 'none';
    s.overflow = overflow ? 'visible' : 'hidden';
    s.padding = p.paddingPerSide
      ? `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`
      : `${p.padding}px`;
    const l = this.list.style;
    l.gap = `${p.gap}px`;
    l.placeItems = p.alignment;
    l.position = 'relative';
    l.flexDirection = this.horizontal ? 'row' : 'column';
  }

  measure() {
    this.applyProps();
    const { gap } = this.props;
    const parent = this.horizontal ? this.section.offsetWidth : this.section.offsetHeight;
    const first = this.originals[0];
    const last = this.originals[this.originals.length - 1];
    const start = this.horizontal ? first.offsetLeft : first.offsetTop;
    const end = this.horizontal ? last.offsetLeft + last.offsetWidth : last.offsetTop + last.offsetHeight;
    const children = end - start + gap;
    this.update(parent, children);
  }

  update(parent, children) {
    const p = this.props;
    // copies (:109–113) – only once the section has a size
    const q = parent ? Math.min(Math.round((parent / children) * 2) + 1, MAX_DUPES) : 0;
    if (q * this.originals.length !== this.dupes.length) {
      this.dupes.forEach((d) => d.remove());
      this.dupes = [];
      for (let i = 0; i < q; i++)
        for (const li of this.originals) {
          const c = li.cloneNode(true);
          c.setAttribute('aria-hidden', 'true');
          c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
          this.dupes.push(c);
        }
      this.list.append(...this.dupes);
    }
    this.section.style.opacity = parent ? '1' : '0'; // J, :109–117
    const Y = children + children * Math.round(parent / children); // :233
    const l = this.list.style;
    l.top = p.direction === 'bottom' && Number.isFinite(Y) ? `${-Y}px` : '';
    l.left = p.direction === 'right' && Number.isFinite(Y) ? `${-Y}px` : '';

    const animate = parent && Y && p.speed && canWAAPI && !noMotion() && !reducedMotion.matches;
    const key = animate ? `${Y}|${p.speed}|${p.hoverFactor}|${p.direction}` : '';
    if (key === this.animKey) return;
    this.animKey = key;
    if (this.anim) { this.anim.cancel(); this.anim = null; }
    if (!animate) return;
    const f = TRANSFORM[p.direction];
    this.anim = this.list.animate(
      { transform: [f(0), f(Y)] },
      { duration: (Math.abs(Y) / p.speed) * 1e3, iterations: Infinity, easing: 'linear' },
    );
    // like the source, a fresh animation starts at playbackRate 1 even mid-hover (:245–256)
  }
}

document.querySelectorAll('[data-ticker]').forEach((el) => new Ticker(el));
