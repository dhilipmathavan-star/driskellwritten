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
