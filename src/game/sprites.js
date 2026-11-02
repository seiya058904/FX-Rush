// Monsters made of PixelFX critters. A critter is a pure loop (its frame is a function of t), so each one is
// baked lazily into small cropped frames (color + light) the first time a frame index is needed, then blitted
// with the game's own touches: hit flash, status tint, squash and stretch on impact, mirroring and dithered
// fades. The same bake gives each monster an `actor` (mask + pixels) so PixelFX's status effects (frozen,
// burning, poisoned...) wrap the monster's real silhouette instead of the stock humanoid.

import { createFrame, clearFrame, painterFor, resolveOptions, fxModule, frame, posed, STAND, markUsed } from "../engine/pfx.js";
import { addLight, mixc } from "./rig.js";

const BAKE_FPS = 24;
const banks = new Map();

/** A sprite bank for one critter with fixed options (palette etc.). */
export function critterBank(key, id, opts = {}) {
  let b = banks.get(key);
  if (b) return b;
  b = { key, id, opts, frames: [], mod: null, resolved: null, n: 0, actor: null, scratch: null };
  banks.set(key, b);
  return b;
}

function ensureMod(b) {
  if (b.mod) return true;
  const mod = fxModule(b.id);
  if (!mod) return false;
  b.mod = mod;
  markUsed(b.id);
  b.resolved = resolveOptions(mod.meta, { ...b.opts, x: 0, y: 0 });
  b.n = Math.max(1, Math.round(mod.meta.duration * BAKE_FPS));
  const [w, h] = mod.meta.size;
  b.scratch = createFrame(w, h, 0, 0);
  return true;
}

function bake(b, i) {
  const f = b.scratch, m = b.mod.meta, [ox, oy] = m.origin, t = (i / b.n) * m.duration;
  clearFrame(f);
  const p = painterFor(f).place(ox, oy, false, 0);
  const o = b.resolved;
  if (b.mod.drawBack) {
    p.layer = "back";
    b.mod.drawBack(p, t, o);
  }
  p.layer = "front";
  b.mod.draw(p, t, o);
  // crop to what was drawn
  let x0 = f.w, y0 = f.h, x1 = -1, y1 = -1;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const j = y * f.w + x;
      if (f.color[j] || (f.light[j] & 0xffffff)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < 0) return (b.frames[i] = { w: 0, h: 0 });
  const w = x1 - x0 + 1, h = y1 - y0 + 1, color = new Uint32Array(w * h), light = new Uint32Array(w * h);
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = (y + y0) * f.w + x + x0, c = f.color[j];
      color[y * w + x] = c;
      light[y * w + x] = f.light[j];
      if (c >>> 24 > 200) {
        const lx = x + x0 - ox, ly = y + y0 - oy;
        if (lx < bx0) bx0 = lx;
        if (lx > bx1) bx1 = lx;
        if (ly < by0) by0 = ly;
        if (ly > by1) by1 = ly;
      }
    }
  return (b.frames[i] = { w, h, lx: x0 - ox, ly: y0 - oy, color, light, body: [bx0, by0, bx1, by1] });
}

export function bankFrame(b, t) {
  if (!ensureMod(b)) return null;
  const i = Math.floor(((((t / b.mod.meta.duration) % 1) + 1) % 1) * b.n) % b.n;
  return b.frames[i] ?? bake(b, i);
}

/**
 * Blit a critter frame at world (x, y) (the critter's origin). opts: flip, sx, sy (squash, around the origin's
 * floor point), flash 0..1, tint [color, k], alpha, lightK, outline (color number for an elite rim).
 */
export function drawCritter(b, t, x, y, opts = {}) {
  const fr = bankFrame(b, t);
  if (!fr || !fr.w) return fr;
  const { flip = false, sx = 1, sy = 1, flash = 0, tint = null, alpha = 1, lightK = 1, pivotY = 0 } = opts;
  const C = frame.color, L = frame.light, FWd = frame.w, FHd = frame.h;
  const X = Math.round(x) - frame.ox, Y = Math.round(y) - frame.oy;
  // destination box
  const lx0 = fr.lx, lx1 = fr.lx + fr.w, ly0 = fr.ly, ly1 = fr.ly + fr.h;
  const dx0 = Math.floor(Math.min(lx0 * sx, lx1 * sx)), dx1 = Math.ceil(Math.max(lx0 * sx, lx1 * sx));
  const dy0 = Math.floor(pivotY + (ly0 - pivotY) * sy), dy1 = Math.ceil(pivotY + (ly1 - pivotY) * sy);
  const tc = tint ? tint[0] : 0, tk = tint ? tint[1] : 0;
  for (let dy = dy0; dy < dy1; dy++) {
    const py = Y + dy;
    if (py < 0 || py >= FHd) continue;
    const ly = Math.floor(pivotY + (dy + 0.5 - pivotY) / sy) - fr.ly;
    if (ly < 0 || ly >= fr.h) continue;
    for (let dx = dx0; dx < dx1; dx++) {
      const lx = Math.floor((dx + 0.5) / sx) - fr.lx;
      if (lx < 0 || lx >= fr.w) continue;
      const px = flip ? X - dx - 1 : X + dx;
      if (px < 0 || px >= FWd) continue;
      const s = ly * fr.w + lx, j = py * FWd + px;
      let c = fr.color[s];
      if (c) {
        if (alpha < 1 && ((px * 7 + py * 13) & 15) / 16 >= alpha) continue;
        const a = c >>> 24;
        if (flash > 0) c = mixc(c, 0xffffffff, flash);
        else if (tk > 0) c = mixc(c, tc, tk);
        if (a >= 250) C[j] = c;
        else {
          // translucent bits of a critter (a jellyfish bell, smoke) blend over what's there
          const d = C[j], k = a / 255;
          if (!d) C[j] = ((a << 24) | (c & 0xffffff)) >>> 0;
          else {
            const r = (c & 255) * k + (d & 255) * (1 - k), g = ((c >>> 8) & 255) * k + ((d >>> 8) & 255) * (1 - k), bl = ((c >>> 16) & 255) * k + ((d >>> 16) & 255) * (1 - k);
            C[j] = ((Math.max(a, d >>> 24) << 24) | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
          }
        }
      }
      const l = fr.light[s];
      if (l & 0xffffff) addLight(L, j, l, lightK * alpha * (flash > 0 ? 1.5 : 1));
    }
  }
  return fr;
}

/**
 * An actor for PixelFX's status effects, from a critter's baked frame: its silhouette and colors, placed so the
 * status effect's origin is the bottom-center of the body. Returns { actor, footX, footY } (offsets from the
 * critter origin to where the status effect should be placed).
 */
export function critterActor(b, t = 0) {
  if (b.actor) return b.actor;
  const fr = bankFrame(b, t);
  if (!fr || !fr.w) return null;
  const [bx0, by0, bx1, by1] = fr.body;
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1, data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  const footX = Math.round((bx0 + bx1 + 1) / 2), footY = by1 + 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const lx = bx0 + x - fr.lx, ly = by0 + y - fr.ly;
      if (lx < 0 || ly < 0 || lx >= fr.w || ly >= fr.h) continue;
      const c = fr.color[ly * fr.w + lx];
      if (c >>> 24 > 200) {
        data[y * w + x] = 1;
        pixels[y * w + x] = c;
      }
    }
  const ax = bx0 - footX, ay = by0 - footY;
  b.actor = {
    actor: { mask: { w, h, data }, pixels, x: ax, y: ay, w, h, k: 2, head: [0, ay], chest: [0, Math.round(ay + h * 0.45)] },
    footX, footY, w, h,
  };
  return b.actor;
}

/** The same for a rig character: its standing pose, in its own skin. */
const rigActors = new Map();
export function rigActor(skin) {
  let a = rigActors.get(skin);
  if (a) return a;
  const r = posed(STAND);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < r.n; i++) {
    x0 = Math.min(x0, r.xs[i]); x1 = Math.max(x1, r.xs[i]); y0 = Math.min(y0, r.ys[i]); y1 = Math.max(y1, r.ys[i]);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let i = 0; i < r.n; i++) {
    const j = (r.ys[i] - y0) * w + (r.xs[i] - x0);
    data[j] = 1;
    pixels[j] = skin.map.get(r.color[i]) ?? r.color[i];
  }
  a = { actor: { mask: { w, h, data }, pixels, x: x0, y: y0, w, h, k: 2, head: [0, y0], chest: [0, -26] }, footX: 0, footY: 0, w, h };
  rigActors.set(skin, a);
  return a;
}

/** Forget every baked bank (between scenes: the next scene bakes its own monsters and scenery lazily). */
export function clearBanks() {
  banks.clear();
}
