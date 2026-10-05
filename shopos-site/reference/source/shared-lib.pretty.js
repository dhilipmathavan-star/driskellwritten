import { t as e } from "./rolldown-runtime.Dh6celcD.mjs";
import {
  C as t,
  M as n,
  R as r,
  T as i,
  b as a,
  k as o,
  o as s,
  s as c,
  v as l,
  x as u,
  z as d,
} from "./react.CsskEXBS.mjs";
import { W as ee, k as f, t as p } from "./motion.DkSjkGDO.mjs";
import { L as m, b as h, et as g, m as _, r as v } from "./framer.pD4xj56o.mjs";
var y,
  b,
  x = e(() => {
    (m(),
      (y = {
        position: `relative`,
        width: `100%`,
        height: `100%`,
        display: `flex`,
        justifyContent: `center`,
        alignItems: `center`,
      }),
      { ...y },
      (b = {
        onClick: { type: v.EventHandler },
        onMouseEnter: { type: v.EventHandler },
        onMouseLeave: { type: v.EventHandler },
      }),
      v.Number,
      v.Boolean,
      v.String,
      v.Enum);
  });
function S(e, t) {
  return w(!0, e, t);
}
function C(e, t) {
  return w(!1, e, t);
}
function w(e, t, n = !0) {
  let r = g();
  a(() => {
    n && r === e && t();
  }, [r]);
}
var T = e(() => {
  (m(), i());
});
function E(e) {
  let t = u(null);
  return (t.current === null && (t.current = e()), t.current);
}
var D = e(() => {
    i();
  }),
  O = e(() => {
    m();
  }),
  k = e(() => {
    m();
  }),
  A = e(() => {
    i();
  }),
  j = e(() => {
    m();
  }),
  M,
  N,
  P = e(() => {
    (r(),
      i(),
      (M = () => {
        if (d !== void 0) {
          let e = d.userAgent.toLowerCase();
          return (
            (e.indexOf(`safari`) > -1 ||
              e.indexOf(`framermobile`) > -1 ||
              e.indexOf(`framerx`) > -1) &&
            e.indexOf(`chrome`) < 0
          );
        } else return !1;
      }),
      (N = () => n(() => M(), [])));
  }),
  F = e(() => {
    (i(), k());
  }),
  I = e(() => {
    (i(), m(), k(), D());
  }),
  L = e(() => {
    (m(), i(), x());
  });
function R() {
  return n(() => _.current() === _.canvas, []);
}
var z = e(() => {
    (i(), m());
  }),
  B = e(() => {
    i();
  });
function V(e) {
  let {
    borderRadius: t,
    isMixedBorderRadius: r,
    topLeftRadius: i,
    topRightRadius: a,
    bottomRightRadius: o,
    bottomLeftRadius: s,
  } = e;
  return n(
    () => (r ? `${i}px ${a}px ${o}px ${s}px` : `${t}px`),
    [t, r, i, a, o, s],
  );
}
var H,
  U = e(() => {
    (i(),
      m(),
      (H = {
        borderRadius: {
          title: `Radius`,
          type: v.FusedNumber,
          toggleKey: `isMixedBorderRadius`,
          toggleTitles: [`Radius`, `Radius per corner`],
          valueKeys: [
            `topLeftRadius`,
            `topRightRadius`,
            `bottomRightRadius`,
            `bottomLeftRadius`,
          ],
          valueLabels: [`TL`, `TR`, `BR`, `BL`],
          min: 0,
        },
      }),
      v.FusedNumber);
  }),
  W = e(() => {
    (x(), T(), D(), O(), k(), A(), j(), P(), F(), I(), L(), z(), B(), U());
  }),
  G = e(() => {
    W();
  });
function K(e) {
  let {
    width: t,
    height: n,
    topLeft: r,
    topRight: i,
    bottomRight: a,
    bottomLeft: o,
    id: s,
    children: c,
    ...l
  } = e;
  return l;
}
function q(e) {
  let t = K(e);
  return s(Z, { ...t });
}
function J(e) {
  let t = g(),
    n = u(!1),
    r = o((t) => {
      if (!e.current) return;
      let n = (t === 1 ? 0.999 : t) * e.current.duration,
        r = Math.abs(e.current.currentTime - n) < 0.1;
      e.current.duration > 0 && !r && (e.current.currentTime = n);
    }, []);
  return {
    play: o(() => {
      !(
        e.current.currentTime > 0 &&
        e.current.onplaying &&
        !e.current.paused &&
        !e.current.ended &&
        e.current.readyState > e.current.HAVE_CURRENT_DATA
      ) &&
        e.current &&
        !n.current &&
        t &&
        ((n.current = !0),
        e.current
          .play()
          .catch((e) => {})
          .finally(() => (n.current = !1)));
    }, []),
    pause: o(() => {
      !e.current || n.current || e.current.pause();
    }, []),
    setProgress: r,
  };
}
function Y({ playingProp: e, muted: t, loop: n, playsinline: r, controls: i }) {
  let [a] = l(() => e),
    [o, s] = l(!1);
  e !== a && !o && s(!0);
  let c = a && t && n && r && !i && !o,
    u;
  return ((u = c ? `on-viewport` : a ? `on-mount` : `no-autoplay`), u);
}
function te(e) {
  return e.charAt(0).toUpperCase() + e.slice(1);
}
function ne(e) {
  return (e.match(Q) || []).map(te).join(` `);
}
var re,
  ie,
  X,
  Z,
  Q,
  $,
  ae = e(() => {
    (c(),
      m(),
      p(),
      G(),
      i(),
      (function (e) {
        ((e.Fill = `fill`),
          (e.Contain = `contain`),
          (e.Cover = `cover`),
          (e.None = `none`),
          (e.ScaleDown = `scale-down`));
      })((re ||= {})),
      (function (e) {
        ((e.Video = `Upload`), (e.Url = `URL`));
      })((ie ||= {})),
      (X = !1),
      (Z = t(function (e) {
        let {
            srcType: t,
            srcFile: r,
            srcUrl: i,
            playing: o,
            muted: c,
            playsinline: l,
            controls: d,
            progress: p,
            objectFit: m,
            backgroundColor: h,
            onSeeked: g,
            onPause: _,
            onPlay: v,
            onEnd: y,
            onClick: b,
            onMouseEnter: x,
            onMouseLeave: w,
            onMouseDown: T,
            onMouseUp: E,
            poster: D,
            posterEnabled: O,
            startTime: k,
            volume: A,
            loop: j,
          } = e,
          M = u(),
          P = N(),
          F = u(null),
          I = u(null),
          L = R(),
          z = V(e),
          B = L
            ? `no-autoplay`
            : Y({
                playingProp: o,
                muted: c,
                loop: j,
                playsinline: l,
                controls: d,
              }),
          H = L ? !0 : ee(M),
          U = k === 100 ? 99.9 : k,
          { play: W, pause: G, setProgress: K } = J(M);
        (a(() => {
          L || (o ? W() : G());
        }, [o]),
          a(() => {
            L || (B === `on-viewport` && (H ? W() : G()));
          }, [B, H]),
          a(() => {
            if (!X) {
              X = !0;
              return;
            }
            let e = f(p) ? p.get() : (p ?? 0) * 0.01;
            K((e ?? 0) || (U ?? 0) / 100);
          }, [U, r, i, p]),
          a(() => {
            if (f(p)) return p.on(`change`, (e) => K(e));
          }, [p]),
          S(() => {
            F.current !== null && M.current && ((!I && j) || !F.current) && W();
          }),
          C(() => {
            M.current &&
              ((I.current = M.current.ended),
              (F.current = M.current.paused),
              G());
          }));
        let q = n(() => {
          if (t === `URL`) return i + ``;
          if (t === `Upload`) return r + ``;
        }, [t, r, i, U]);
        return (
          a(() => {
            P && M.current && B === `on-mount` && setTimeout(() => W(), 50);
          }, []),
          a(() => {
            M.current && !c && (M.current.volume = (A ?? 0) / 100);
          }, [A]),
          s(`video`, {
            onClick: b,
            onMouseEnter: x,
            onMouseLeave: w,
            onMouseDown: T,
            onMouseUp: E,
            src: q,
            loop: j,
            ref: M,
            onSeeked: (e) => g?.(e),
            onPause: (e) => _?.(e),
            onPlay: (e) => v?.(e),
            onEnded: (e) => y?.(e),
            autoPlay: B === `on-mount`,
            poster: O ? D : void 0,
            onLoadedData: () => {
              M.current &&
                (M.current.currentTime < 0.3 && K((U ?? 0) * 0.01),
                B === `on-mount` && W());
            },
            controls: d,
            muted: L ? !0 : c,
            playsInline: l,
            style: {
              cursor: b ? `pointer` : `auto`,
              width: `100%`,
              height: `100%`,
              borderRadius: z,
              display: `block`,
              objectFit: m,
              backgroundColor: h,
              objectPosition: `50% 50%`,
            },
          })
        );
      })),
      (q.displayName = `Video`),
      (q.defaultProps = {
        srcType: `URL`,
        srcUrl: `https://assets.mixkit.co/videos/preview/mixkit-shining-sun-in-the-sky-surrounded-by-moving-clouds-31793-small.mp4`,
        srcFile: ``,
        posterEnabled: !1,
        controls: !1,
        playing: !0,
        loop: !0,
        muted: !0,
        playsinline: !0,
        restartOnEnter: !1,
        objectFit: `cover`,
        backgroundColor: `rgba(0,0,0,0)`,
        radius: 0,
        volume: 25,
        startTime: 0,
      }),
      (Q = /[A-Z]{2,}|[A-Z][a-z]+|[a-z]+|[A-Z]|\d+/gu),
      ($ = [`cover`, `fill`, `contain`, `scale-down`, `none`]),
      h(q, {
        srcType: {
          type: v.Enum,
          displaySegmentedControl: !0,
          title: `Source`,
          options: [`URL`, `Upload`],
        },
        srcUrl: {
          type: v.String,
          title: `URL`,
          placeholder: `../example.mp4`,
          hidden(e) {
            return e.srcType === `Upload`;
          },
          description: `Hosted video file URL. For YouTube, use the YouTube component.`,
        },
        srcFile: {
          type: v.File,
          title: `File`,
          allowedFileTypes: [`mp4`, `webm`],
          hidden(e) {
            return e.srcType === `URL`;
          },
        },
        playing: {
          type: v.Boolean,
          title: `Playing`,
          enabledTitle: `Yes`,
          disabledTitle: `No`,
        },
        posterEnabled: {
          type: v.Boolean,
          title: `Poster`,
          enabledTitle: `Yes`,
          disabledTitle: `No`,
        },
        poster: {
          type: v.Image,
          title: ` `,
          hidden: ({ posterEnabled: e }) => !e,
        },
        backgroundColor: { type: v.Color, title: `Background` },
        ...H,
        startTime: {
          title: `Start Time`,
          type: v.Number,
          min: 0,
          max: 100,
          step: 0.1,
          unit: `%`,
        },
        loop: {
          type: v.Boolean,
          title: `Loop`,
          enabledTitle: `Yes`,
          disabledTitle: `No`,
        },
        objectFit: {
          type: v.Enum,
          title: `Fit`,
          options: $,
          optionTitles: $.map(ne),
        },
        controls: {
          type: v.Boolean,
          title: `Controls`,
          enabledTitle: `Show`,
          disabledTitle: `Hide`,
        },
        muted: {
          type: v.Boolean,
          title: `Muted`,
          enabledTitle: `Yes`,
          disabledTitle: `No`,
        },
        volume: {
          type: v.Number,
          max: 100,
          min: 0,
          unit: `%`,
          hidden: ({ muted: e }) => e,
        },
        onEnd: { type: v.EventHandler },
        onSeeked: { type: v.EventHandler },
        onPause: { type: v.EventHandler },
        onPlay: { type: v.EventHandler },
        ...b,
      }));
  });
export {
  x as _,
  U as a,
  R as c,
  D as d,
  E as f,
  b as g,
  C as h,
  H as i,
  P as l,
  S as m,
  ae as n,
  V as o,
  T as p,
  G as r,
  z as s,
  q as t,
  N as u,
};
//# sourceMappingURL=shared-lib.C70vwirp.mjs.map
