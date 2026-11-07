// The effect director: every PixelFX instance in the game is started, placed, timed and retired here.
//
// - play(id, opts) starts an effect at a world position (or pinned to the screen, or following an entity).
// - Layers decide draw order around the characters: "ground" < "back" < (characters) < "front" < "top" < "screen";
//   "split" draws an effect's drawBack behind the characters and its draw in front (rings round the feet).
// - Budgets: a priority per request (0 critical: hit feedback, telegraphs, transitions; 1 skills; 2 cosmetic;
//   3 ambient) against a cap that drops with the quality level, so a 40-kill chain degrades the confetti, never
//   the contact frame. The same id is capped too, oldest retired first.
// - Long tails (explosions keep smoking for 5 s) are trimmed per category; stop() fades them over 0.3 s.
// - Every id that actually reaches the screen is recorded, for the runtime coverage report.

import { makeFx, fxModule, frame, createFrame, clearFrame } from "../engine/pfx.js";
import { critterBank, drawCritter } from "../game/sprites.js";
import { FX } from "./registry.gen.js";
import { W, M, FLOOR } from "../config.js";
import { settings } from "../settings.js";

// how long a one-shot of each category may run in play before it's faded out (quality 2 / 1 / 0)
const TRIM = {
  explosions: [2.4, 2, 1.5], fire: [2.4, 2, 1.5], impacts: [1.2, 1, 0.8], spawn: [2.2, 1.8, 1.4], nature: [2.2, 1.8, 1.4],
  ice: [2.2, 1.8, 1.4], lightning: [1.7, 1.4, 1.2], holy: [2, 1.7, 1.4], shadow: [2.4, 2, 1.5], arcane: [2.4, 2, 1.5],
  scifi: [2, 1.7, 1.4], water: [2.4, 2, 1.5], melee: [1.6, 1.3, 1], projectiles: [2.5, 2, 1.5], moves: [8, 8, 8],
  ui: [3.4, 3, 2.4], pickups: [4.6, 4, 3], transitions: [9, 9, 9], status: [9, 9, 9], weather: [99, 99, 99], critters: [99, 99, 99],
};
const CAP = [34, 52, 64];
// every world effect glows at this share of its own light: the fight stays readable under a pile of effects
const FX_LIGHT = 0.7;
const PER_ID = [4, 6, 8];

/** Lay one frame's pixels over another's (color over color respecting alpha, light added). */
function blendInto(src, dst) {
  const S = src.color, SL = src.light, D = dst.color, DL = dst.light, n = S.length;
  for (let i = 0; i < n; i++) {
    const c = S[i];
    if (c) {
      const a = c >>> 24;
      if (a >= 250 || !D[i]) D[i] = c;
      else {
        const d = D[i], k = a / 255;
        const r = (c & 255) * k + (d & 255) * (1 - k), g = ((c >>> 8) & 255) * k + ((d >>> 8) & 255) * (1 - k), b = ((c >>> 16) & 255) * k + ((d >>> 16) & 255) * (1 - k);
        D[i] = ((Math.max(a, d >>> 24) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
      }
    }
    const l = SL[i];
    if (l & 0xffffff) {
      const d = DL[i];
      DL[i] = ((255 << 24) | (Math.min(255, ((d >>> 16) & 255) + ((l >>> 16) & 255)) << 16) | (Math.min(255, ((d >>> 8) & 255) + ((l >>> 8) & 255)) << 8) | Math.min(255, (d & 255) + (l & 255))) >>> 0;
    }
  }
}

export class Director {
  constructor() {
    this.list = [];
    this.used = new Map(); // id -> times started
    this.quality = 2;
    this.dropped = 0;
    this.camX = 0;
    this.seed = 1;
  }
  reset() {
    this.list.length = 0;
  }
  /**
   * Start an effect. opts: x, y (world; with screen: true, screen pixels), flip, angle, seed, palette, light, any
   * of the effect's own options; layer, prio, life (seconds before it fades), speed (time scale), follow (an
   * object with x, y), dx, dy (offset from follow), vx, vy (drift px/s), screen, tag, onUpdate(h, dt).
   * Returns a handle (whose x, y, alive, stop() the caller may use) or null if dropped or not loaded yet.
   */
  play(id, opts = {}) {
    // This effect paints opaque black/white frames, independently of Game.screenFlash.
    if (id === "impacts/impact-frame" && !settings.flashes) return null;
    const info = FX[id];
    if (!info) {
      if (import.meta.env?.DEV) console.warn("unknown effect", id);
      return null;
    }
    const prio = opts.prio ?? 1, q = this.quality;
    const n = this.list.length;
    if (prio > 0) {
      const cap = CAP[q] * (prio === 1 ? 1 : prio === 2 ? 0.75 : 0.55);
      if (n >= cap) {
        this.dropped++;
        return null;
      }
    } else if (n >= CAP[2] + 24) {
      // even critical effects retire the oldest cosmetic one rather than pile up without bound
      const old = this.list.find((h) => h.prio >= 2 && !h.stopping);
      if (old) old.stop();
    }
    // the same effect too many times at once: retire the oldest
    const same = this.list.filter((h) => h.id === id && !h.stopping);
    if (same.length >= (opts.maxSame ?? PER_ID[q])) same[0].stop();
    if (!fxModule(id)) {
      this.dropped++;
      return null;
    }
    let { x = 0, y = 0, layer, life, speed, follow, dx = 0, dy = 0, vx, vy, screen, tag, onUpdate, maxSame, center, ...rest } = opts;
    // center: put the effect's visual center (measured per effect) on the point, whatever its origin convention
    if (center) {
      const ox = -(info.fx ?? 0) * (rest.flip ? -1 : 1), oy = -(info.fy ?? 0);
      x += ox;
      y += oy;
      dx += ox;
      dy += oy;
    }
    // an option passed as undefined must not wipe out the effect's own default (palettes especially)
    for (const k in rest) if (rest[k] === undefined) delete rest[k];
    if (!screen && info.cat !== "ui" && info.cat !== "transitions") rest.light = (rest.light ?? 1) * FX_LIGHT;
    const o = { ...rest, x, y, seed: rest.seed ?? (this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff) % 9973 };
    const inst = makeFx(id, o);
    if (!inst) return null;
    // bake: a pure loop with fixed options (scenery) is rendered once per frame index and blitted afterwards
    let bank = null;
    if (opts.bake && info.loop && !fxModule(id).create) {
      const { x: _x, y: _y, seed: _s, bake: _b, ...look } = o;
      bank = critterBank(`${id}|${JSON.stringify(look)}`, id, look);
    }
    const trim = info.loop ? Infinity : Math.min(info.duration, (TRIM[info.cat] ?? [3, 2.5, 2])[2 - q] ?? info.duration);
    const h = {
      id, inst, info, x, y, prio,
      layer: layer ?? (info.actor || id.startsWith("status/") ? "split" : "front"),
      life: life ?? trim,
      speed: speed ?? 1,
      follow: follow ?? null,
      dx, dy, vx: vx ?? 0, vy: vy ?? 0,
      screen: !!screen, tag, onUpdate, bank, fade: 1, every: opts.every ?? 0, tick: 0, buf: null, phase: bank ? (this.seed % 97) / 13 : 0,
      age: 0, alive: true, stopping: false,
      stop() {
        if (!this.stopping) {
          this.stopping = true;
          this.inst.stop();
        }
      },
      kill() {
        this.alive = false;
      },
    };
    this.list.push(h);
    this.used.set(id, (this.used.get(id) ?? 0) + 1);
    return h;
  }
  /** Is an effect with this tag still running? */
  has(tag) {
    return this.list.some((h) => h.tag === tag && h.alive && !h.stopping);
  }
  stopTag(tag) {
    for (const h of this.list) if (h.tag === tag) h.stop();
  }
  /** dt: game time (0 during a hit-stop); rdt: real time, for screen-pinned effects (transitions). */
  update(dt, rdt) {
    for (const h of this.list) {
      if (!h.alive) continue;
      const step = (h.screen ? rdt : dt) * h.speed;
      if (step <= 0) continue;
      if (h.follow) {
        if (h.follow.dead && !h.stopping && h.follow.removed) h.stop();
        h.x = h.follow.x + h.dx * (h.follow.facing < 0 && h.mirror ? -1 : 1);
        h.y = h.follow.y + h.dy;
      }
      h.x += h.vx * step;
      h.y += h.vy * step;
      h.onUpdate?.(h, step);
      h.age += step;
      if (h.bank) {
        if (!h.stopping && h.age >= h.life) h.stop();
        if (h.stopping && (h.fade -= step / 0.3) <= 0) h.alive = false;
        continue;
      }
      h.inst.update(step);
      if (!h.stopping && h.age >= h.life) h.stop();
      if (h.inst.done()) h.alive = false;
    }
    if (this.list.some((h) => !h.alive)) this.list = this.list.filter((h) => h.alive);
  }
  /** Draw every effect of a layer into the frame. which: "back" | "front" (the halves of split effects). */
  draw(layer, which = null) {
    for (const h of this.list) {
      if (!h.alive) continue;
      // Also retire a flash already running when the player disables it while paused.
      if (h.id === "impacts/impact-frame" && !settings.flashes) {
        h.alive = false;
        continue;
      }
      const L = h.layer;
      let part;
      if (L === layer) part = undefined;
      else if (L === "split" && (layer === "back" || layer === "front")) part = layer;
      else continue;
      const o = h.inst.options;
      if (h.screen) {
        o.x = this.camX + h.x;
        o.y = h.y - FLOOR;
      } else {
        o.x = h.x;
        o.y = h.y;
      }
      // cheap cull: skip effects whose whole canvas is off screen
      const info = h.info, reach = Math.max(info.ox, info.w - info.ox) + 16;
      if (!h.screen && !h.angle && Math.abs(o.x - (this.camX + W / 2)) > W / 2 + M + reach) continue;
      if (h.bank) drawCritter(h.bank, h.age + h.phase, o.x, o.y, { flip: !!o.flip, alpha: h.fade, lightK: o.light ?? 1 });
      else if (h.every > 1) {
        // full-screen weather: redrawn every few frames into its own buffer, blended in every frame
        if (!h.buf) h.buf = createFrame(frame.w, frame.h, 0, 0);
        h.buf.ox = frame.ox;
        h.buf.oy = frame.oy;
        if (h.tick++ % h.every === 0) {
          clearFrame(h.buf);
          h.inst.draw(h.buf, part);
        }
        blendInto(h.buf, frame);
      }
      else h.inst.draw(frame, part);
    }
  }
  get count() {
    return this.list.length;
  }
}
