// FX Rush custom effect, written to PixelFX's effect contract (docs/AUTHORING.md): a bolt that hops through
// any list of points (the chain lightning skill's real targets), re-striking every other frame and dying away.
// It draws with PixelFX's own lightning toolkit (third_party/pixelfx/src/fx/lightning/_lib.js).

import { Rng, fit, sparkle } from "pixelfx";
import { zigzag, stroke, VOLT } from "../../../third_party/pixelfx/src/fx/lightning/_lib.js";

export const meta = {
  name: "Chain bolt",
  desc: "A bolt hops through a list of points in turn, each link snapping in a frame apart, flickering and fading.",
  tags: ["lightning", "chain", "fxrush"],
  size: [320, 180],
  origin: [20, 120],
  duration: 0.5,
  loop: false,
  fps: 30,
  options: { palette: VOLT, pts: [[0, 0], [60, 0]], hop: 0.035, seed: 1 },
};

export function create(o) {
  const C = fit(o.palette, 8);
  let t = 0, cache = [], frameN = -1;
  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      const pts = o.pts, f = Math.floor(t * 20);
      if (f !== frameN) {
        frameN = f;
        const R = new Rng((o.seed ?? 1) * 97 + f * 13);
        cache = [];
        for (let i = 0; i < pts.length - 1; i++) cache.push(zigzag(R, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.3, 0.3));
      }
      for (let i = 0; i < cache.length; i++) {
        const born = i * o.hop, age = t - born;
        if (age < 0) continue;
        const k = age < 0.06 ? 1 : Math.max(0, 1 - (age - 0.06) / 0.34);
        stroke(p, cache[i], k, C, 1, { light: 0.6, hero: age < 0.05 });
        if (age < 0.08) sparkle(p, pts[i + 1][0], pts[i + 1][1], 6 * (1 - age / 0.08), C[7], C[5]);
      }
    },
  };
}
