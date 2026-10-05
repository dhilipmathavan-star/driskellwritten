import { t as e } from "./rolldown-runtime.Dh6celcD.mjs";
import {
  B as t,
  C as n,
  D as r,
  F as i,
  P as a,
  R as o,
  T as s,
  _ as c,
  a as l,
  b as u,
  d,
  h as f,
  i as p,
  k as m,
  n as h,
  r as g,
  t as _,
  v,
  x as y,
  z as b,
} from "./react.CsskEXBS.mjs";
import {
  B as x,
  F as S,
  G as C,
  H as w,
  I as T,
  J as E,
  K as D,
  L as O,
  R as k,
  U as A,
  Z as j,
  a as M,
  d as N,
  ft as P,
  nt as F,
  ot as I,
  pt as L,
  s as R,
  u as z,
} from "./framer.pD4xj56o.mjs";
async function B({
  routeId: e,
  pathVariables: a,
  canonicalPathVariables: o,
  localeId: s,
  collectionItemId: c,
  contentLocaleId: l,
  shouldResolveInitialRouteContentState: f = !1,
}) {
  let h = U[e].page.preload();
  (D({
    checkServerSideRouter: !0,
    disableCustomCode: !1,
    disableHoverOnMobile: !1,
    editorBarDisableFrameAncestorsSecurity: !1,
    motionDivToDiv: !1,
    onPageLocalizationSupport: !0,
    onPageMoveTool: !0,
    onPageRichTextBlockSelection: !0,
    scrollRestoration: !0,
    synchronousNavigationOnDesktop: !1,
    yieldOnTap: !1,
  }),
    C(q));
  let g = d(z, {
    children: d(R, {
      children: d(N, {
        isWebsite: !0,
        environment: `site`,
        routeId: e,
        pathVariables: a,
        canonicalPathVariables: o,
        routes: U,
        collectionUtils: G,
        serverDatabaseClient: K,
        framerSiteId: q,
        notFoundPage: k(
          () => import(`./SitesNotFoundPage.js@1.4.y3GnVw50.mjs`),
        ),
        isReducedMotion: void 0,
        localeId: s,
        locales: W,
        preserveQueryParams: void 0,
        siteCanonicalURL: void 0,
        EditorBar:
          t === void 0
            ? void 0
            : (() => {
                if (Y) {
                  console.log(
                    `[Framer On-Page Editing] Unavailable because navigator is bot`,
                  );
                  return;
                }
                return k(async () => {
                  t.__framer_editorBarDependencies = {
                    __version: 3,
                    framer: {
                      useCurrentRoute: j,
                      useLocaleInfo: F,
                      useRouter: I,
                    },
                    react: {
                      createElement: d,
                      Fragment: i,
                      memo: n,
                      useCallback: m,
                      useEffect: u,
                      useRef: y,
                      useState: v,
                      useLayoutEffect: r,
                    },
                    "react-dom": { createPortal: p },
                  };
                  let { createEditorBar: e } = await import(
                    `https://framer.com/edit/init.mjs`
                  );
                  return { default: e() };
                });
              })(),
        adaptLayoutToTextDirection: !1,
        loadSnippetsModule: void 0,
        initialCollectionItemId: c,
        initialContentLocaleIdOverride: l,
      }),
    }),
    value: { routes: {} },
  });
  return (await h, g);
}
function V() {
  J && t.__framer_events.push(arguments);
}
async function H(e, n) {
  function r(e, n, r = !0) {
    if (e.caught || t.__framer_hadFatalError) return;
    let i = n?.componentStack;
    if (r) {
      if (
        (console.warn(
          `Caught a recoverable error. The site is still functional, but might have some UI flickering or degraded page load performance. If you are the author of this website, update external components and check recently added custom code or code overrides to fix the following server/client mismatches:
`,
          e,
          i,
        ),
        Math.random() > 0.01)
      )
        return;
    } else
      console.error(
        `Caught a fatal error. Please report the following to the Framer team via https://www.framer.com/contact/:
`,
        e,
        i,
      );
    V(
      r ? `published_site_load_recoverable_error` : `published_site_load_error`,
      {
        message: String(e),
        componentStack: i,
        stack: i
          ? void 0
          : e instanceof Error && typeof e.stack == `string`
            ? e.stack
            : null,
      },
    );
  }
  try {
    let i, o, s, c, l, u, d;
    if (e)
      ((d = JSON.parse(n.dataset.framerHydrateV2)),
        (i = d.routeId),
        (o = d.localeId),
        (s = d.contentLocaleId),
        (c = d.pathVariables),
        (l = d.canonicalPathVariables),
        (u = d.breakpoints),
        (i = w(U, i)));
    else {
      w(U, void 0);
      let e = performance
        .getEntriesByType(`navigation`)[0]
        ?.serverTiming?.find((e) => e.name === `route`)?.description;
      if (e) {
        let t = new URLSearchParams(e);
        ((i = t.get(`id`)), (o = t.get(`locale`)));
        for (let [e, n] of t.entries())
          e.startsWith(`var.`) && ((c ??= {}), (c[e.slice(4)] = n));
      }
      if (!i || !o) {
        let e = S(U, decodeURIComponent(location.pathname), !0, W);
        ((i = e.routeId), (o = e.localeId), (c = e.pathVariables));
      }
    }
    let f = B({
      routeId: i,
      localeId: o,
      contentLocaleId: s,
      pathVariables: c,
      canonicalPathVariables: l,
      collectionItemId: e ? d?.collectionItemId : void 0,
      shouldResolveInitialRouteContentState: !e,
    });
    t !== void 0 &&
      (async () => {
        let e = U[i],
          n = W.find(({ id: e }) => (o ? e === o : e === "default")).code,
          r = d?.collectionItemId ?? null;
        if (r === null && e?.collectionId && G) {
          let t = await G[e.collectionId]?.(),
            [i] = Object.values(c);
          t &&
            typeof i == `string` &&
            (r = (await t.getRecordIdBySlug(i, n || void 0)) ?? null);
        }
        let a = Intl.DateTimeFormat().resolvedOptions(),
          s = a.timeZone,
          l = a.locale;
        (await new Promise((e) => {
          document.prerendering
            ? document.addEventListener(`prerenderingchange`, e, { once: !0 })
            : e();
        }),
          t.__framer_events.push([
            `published_site_pageview`,
            {
              framerSiteId: q,
              version: 2,
              routePath: e?.path || `/`,
              collectionItemId: r,
              framerLocale: n || null,
              webPageId: e?.abTestingVariantId ?? i,
              abTestId: e?.abTestId,
              referrer: document.referrer || null,
              url: t.location.href,
              hostname: t.location.hostname || null,
              pathname: t.location.pathname || null,
              hash: t.location.hash || null,
              search: t.location.search || null,
              timezone: s,
              locale: l,
            },
            `eager`,
          ]),
          await L({
            priority: `background`,
            ensureContinueBeforeUnload: !0,
            continueAfter: `paint`,
          }),
          document.dispatchEvent(
            new CustomEvent(`framer:pageview`, {
              detail: { framerLocale: n || null },
            }),
          ));
      })();
    let p = await f;
    e
      ? (P(`framer-rewrite-breakpoints`, () => {
          (A(u), t.__framer_onRewriteBreakpoints?.(u));
        }),
        (Y ? (e) => e() : a)(() => {
          (x(), E(), _(n, p, { onRecoverableError: r }));
        }))
      : g(n, { onRecoverableError: r }).render(p);
  } catch (e) {
    throw (r(e, void 0, !1), e);
  }
}
var U, W, G, K, q, J, Y;
e(() => {
  if (
    (o(),
    O(),
    s(),
    l(),
    h(),
    (U = {
      augiA20Il: {
        elements: {
          E3GvRzp2n: `2`,
          eva67EI0j: `product`,
          HRUJNFKQC: `2-1`,
          lJCEYM9AV: `4`,
          lRKknA1pV: `5`,
          lx3ERpzKo: `3`,
          WRhuRzqfe: `6`,
          XJLFuTsIP: `1`,
        },
        page: k(
          () =>
            import(
              `./a1f9nGtkwwnb0xrkY2MpFHJFoQkdT3pW4k21dZpYLWE.Cd9_KVfT.mjs`
            ),
        ),
        path: `/`,
      },
      mPQu4iYxh: {
        elements: { g5vEutwYU: `form`, I2a2s0AQs: `form-1` },
        page: k(
          () =>
            import(
              `./uuvB1NKOOGTidMc1G6sTcY6dmkibKoMR8KQdMo-tTPI.CVYA7216.mjs`
            ),
        ),
        path: `/balcony`,
      },
      NQQ5K6ZbU: {
        elements: {},
        page: k(
          () =>
            import(
              `./EF-_DzgB_krsJAQzgacXtGlQbQiO2ksPI-uxUvq2N8s.CLE5_Yge.mjs`
            ),
        ),
        path: `/thankyou`,
      },
    }),
    (W = [
      {
        code: `en-US`,
        id: `default`,
        name: `English`,
        slug: ``,
        textDirection: `ltr`,
      },
    ]),
    (G = {}),
    (K = void 0),
    (q = `e211689b382a1c90fdf8495feb798ba24cce181c4e24278d4d11afd1ceb40708`),
    (J = typeof document < `u`),
    (Y =
      J &&
      /bot|-google|google-|yandex|ia_archiver|crawl|spider/iu.test(
        b.userAgent,
      )),
    J)
  ) {
    ((t.__framer_importFromPackage = (e, t) => () =>
      d(M, {
        error: `Package component not supported: "` + t + `" in "` + e + `"`,
      })),
      (t.__framer_events = t.__framer_events || []),
      T());
    let e = document.getElementById(`main`);
    `framerHydrateV2` in e.dataset ? H(!0, e) : H(!1, e);
  }
  (function () {
    J &&
      a(() => {
        _(
          document.getElementById(`__framer-badge-container`),
          d(f, {}, d(c(() => import(`./PX9hIOIVM.B-rCTUu6.mjs`)))),
        );
      });
  })();
})();
export { B as getPageRoot };
//# sourceMappingURL=script_main.x7H7OWjf.mjs.map
