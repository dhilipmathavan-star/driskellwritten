// Shared page behaviour: scroll reveals, autoplaying muted videos, marquees.
// Add ?static to the URL to disable motion (used by the cross-check screenshots).
const isStatic = new URLSearchParams(location.search).has('static');
if (isStatic) document.documentElement.classList.add('no-motion');

// Reveal on scroll
const revealEls = document.querySelectorAll('[data-reveal]');
if (isStatic || !('IntersectionObserver' in window)) {
  revealEls.forEach((el) => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  revealEls.forEach((el) => io.observe(el));
}

// Videos: play only while on screen
const vids = document.querySelectorAll('video[data-autoplay]');
if (!isStatic && 'IntersectionObserver' in window) {
  const vio = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
  });
  vids.forEach((v) => vio.observe(v));
}

// Smooth Scroll — the original's Framer "Smooth Scroll" component (page.pretty.js:1122–1203),
// used once on Home with intensity 20 (page.pretty.js:29381). It bundles Lenis 1.0.29
// (page.pretty.js:872 `lenisVersion = "1.0.29"`), so we use that exact package.
//   • mark every element whose computed overflow is `auto` with data-lenis-prevent (:1149–1155)
//   • new Lenis({ duration: intensity / 10 }) — all other options default (:1157)
//   • drive it from a requestAnimationFrame loop calling lenis.raf(t) (:1158–1161)
//   • inject the component's lenis CSS (:1170–1190)
// (Its first effect — scrollTo(0, {immediate}) — runs before the Lenis instance exists, so it
// is a no-op in the original and is not reproduced.) Disabled under html.no-motion.
import Lenis from '@studio-freight/lenis';

const SMOOTH_SCROLL_INTENSITY = 20; // page.pretty.js:29381
if (!isStatic) {
  for (const el of document.getElementsByTagName('*')) {
    if (getComputedStyle(el).getPropertyValue('overflow') === 'auto') el.setAttribute('data-lenis-prevent', 'true');
  }
  const lenis = new Lenis({ duration: SMOOTH_SCROLL_INTENSITY / 10 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const style = document.createElement('style');
  style.textContent = `
html.lenis { height: auto; }
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
.lenis.lenis-stopped { overflow: hidden; }
.lenis.lenis-scrolling iframe { pointer-events: none; }
`;
  document.head.appendChild(style);
}
