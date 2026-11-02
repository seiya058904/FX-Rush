// Characters drawn with PixelFX's skeleton (src/core/rig.js): a real 3D body solved from where the hands and
// feet should be, shaded into flat tones with one ink line. The library renders its neutral grey dummy; a
// "skin" maps those tones (and the weapon's steel) onto a character's own colors, so the hero, every knight and
// every elite share the same quality of motion with their own identity.

import { posed, skeleton, hex, frame } from "../engine/pfx.js";

const DUMMY = { k: "#0e0c14", A: "#e4e6ec", B: "#b6b9c3", C: "#868995", D: "#5c5e6a", E: "#6e707c", F: "#4b4d58", G: "#34353f", J: "#2a2b33", m: "#f53cd1" };
const STEEL = { hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033", olive: "#58663f", oliveA: "#7d8c58", oliveD: "#3a4529" };
const u = (c) => hex(c) >>> 0;

/** A skin: { body: {A..m}, steel: {hi..}, glow: color for light on the weapon } -> lookup tables. */
export function makeSkin({ body = {}, steel = {}, glow = null, mark = null }) {
  const map = new Map();
  for (const [k, v] of Object.entries(DUMMY)) map.set(u(v), u(body[k] ?? v));
  for (const [k, v] of Object.entries(STEEL)) map.set(u(v), u(steel[k] ?? v));
  const blade = new Set(["hi", "a", "b"].map((k) => u(steel[k] ?? STEEL[k])));
  return { map, blade, glow: glow ? u(glow) : 0, mark: mark ? u(mark) : 0, markSrc: u(body.m ?? DUMMY.m) };
}

export const SKINS = {
  hero: makeSkin({
    body: { k: "#0b0814", A: "#f6eedc", B: "#d2c3a4", C: "#94826f", D: "#5c4c55", E: "#5a5f94", F: "#3c3f6c", G: "#272848", J: "#1c1934", m: "#ff4d6d" },
    steel: { hi: "#ffffff", a: "#fff4dc", b: "#e0b878", d: "#9a6a44", gold: "#ffd84a", goldD: "#c08a2a", grip: "#7a1e2e", gripD: "#4a0e1a" },
    glow: "#ffb050",
    mark: "#ff4d6d",
  }),
  ash: makeSkin({
    body: { k: "#050306", A: "#7d6a6a", B: "#57464a", C: "#3a2c32", D: "#261c22", E: "#3a2226", F: "#28161a", G: "#1a0d10", J: "#140a0c", m: "#ff7a1a" },
    steel: { hi: "#ffd0a0", a: "#a89088", b: "#6a5856", d: "#40323a", gold: "#c86a2a", goldD: "#7a3a18", grip: "#3a1a14", gripD: "#24100c" },
    mark: "#ff7a1a",
  }),
  brute: makeSkin({
    body: { k: "#050204", A: "#9a5a3a", B: "#6e3a26", C: "#48241a", D: "#2e1610", E: "#5a1a14", F: "#3a100c", G: "#240a08", J: "#1a0606", m: "#ffcc3a" },
    steel: { hi: "#fff0c0", a: "#c8a888", b: "#7a6458", d: "#4a3a36", gold: "#ff8a2a", goldD: "#a04a14" },
    mark: "#ffcc3a",
  }),
  frost: makeSkin({
    body: { k: "#04060e", A: "#bcd2e6", B: "#86a2c0", C: "#566e8e", D: "#364664", E: "#2c3a5a", F: "#1e2842", G: "#141a2e", J: "#0e1424", m: "#6ff0ff" },
    steel: { hi: "#ffffff", a: "#d8f4ff", b: "#8ccce8", d: "#4a7a9a", gold: "#9ad8ff", goldD: "#4a7aa0", wood: "#5a6a8a", woodD: "#3a4660" },
    mark: "#6ff0ff",
  }),
  reaper: makeSkin({
    body: { k: "#05020a", A: "#6e5a8e", B: "#4e3c6c", C: "#33264a", D: "#221834", E: "#2a1840", F: "#1c0f2e", G: "#12081e", J: "#0e0618", m: "#ff3df0" },
    steel: { hi: "#ffd0ff", a: "#c8a0e8", b: "#8a64b0", d: "#4e3a70", dark: "#2a1a3a", darkD: "#1a0e26" },
    mark: "#ff3df0",
  }),
  gunner: makeSkin({
    body: { k: "#03060a", A: "#5ac8c0", B: "#3a8a8e", C: "#285a64", D: "#1a3a44", E: "#2a2a44", F: "#1c1c30", G: "#121220", J: "#0c0c18", m: "#ff2d8a" },
    steel: { hi: "#ffffff", a: "#c0f0f0", b: "#6aa0a8", d: "#3a5a64", olive: "#3a4a6a", oliveA: "#5a6a9a", oliveD: "#22304a" },
    mark: "#ff2d8a",
  }),
};

/**
 * Draw a posed character into the game frame with its feet at world (x, y).
 * opts: flash (0..1: white), tint ([color number, amount]), alpha (0..1 dithered), glow (light on the blade, 0..1),
 * outline (color number: a 1 px rim, for elites), shadow (bool: a contact shadow on the floor).
 */
export function drawRig(pose, x, y, flip, skin, opts = {}) {
  const r = posed(pose), W = frame.w, H = frame.h, C = frame.color, L = frame.light;
  const bx = Math.round(x) - frame.ox, by = Math.round(y) - frame.oy;
  const { flash = 0, tint = null, alpha = 1, glow = 0, rim = 0 } = opts;
  const map = skin.map;
  const flashOn = flash > 0;
  const tc = tint ? tint[0] : 0, tk = tint ? tint[1] : 0;
  for (let i = 0; i < r.n; i++) {
    const px = flip ? bx - r.xs[i] - 1 : bx + r.xs[i], py = by + r.ys[i];
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    if (alpha < 1 && ((px * 7 + py * 13) & 15) / 16 >= alpha) continue;
    let c = r.color[i];
    const src = c;
    c = map.get(c) ?? c;
    if (flashOn && !r.ink[i]) c = mixc(c, 0xffffffff, flash);
    else if (tk > 0 && !r.ink[i]) c = mixc(c, tc, tk);
    const j = py * W + px;
    C[j] = c;
    if (glow > 0 && skin.blade.has(c) && skin.glow) addLight(L, j, skin.glow, glow * 0.55);
    if (skin.mark && src === skin.markSrc) addLight(L, j, skin.mark, 0.9);
    if (rim && r.ink[i]) C[j] = rim;
  }
  return r;
}

/** An after-image: light, not paint, so trails brighten what's behind them and never muddy the scene. */
export function drawGhost(pose, x, y, flip, color, k) {
  const r = posed(pose), W = frame.w, H = frame.h, L = frame.light;
  const bx = Math.round(x) - frame.ox, by = Math.round(y) - frame.oy;
  for (let i = 0; i < r.n; i++) {
    const px = flip ? bx - r.xs[i] - 1 : bx + r.xs[i], py = by + r.ys[i];
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    addLight(L, py * W + px, color, k);
  }
}

/** A soft contact shadow under a character (dims what's already in the frame's background layer). */
export function drawShadow(shadowBuf, x, y, hw, k = 0.55) {
  const W = frame.w, cx = Math.round(x) - frame.ox, cy = Math.round(-frame.oy);
  const lift = Math.min(1, Math.max(0, -y / 60));
  const w = Math.max(2, Math.round(hw * (1 - lift * 0.5)));
  for (let dy = 0; dy < 2; dy++)
    for (let dx = -w + dy * 2; dx <= w - dy * 2; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= W || py < 0 || py >= frame.h) continue;
      shadowBuf[py * W + px] = Math.max(shadowBuf[py * W + px], Math.round(k * (1 - lift * 0.6) * 255));
    }
}

export function addLight(L, j, c, k) {
  const d = L[j];
  const r = Math.min(255, (d & 255) + (c & 255) * k) | 0;
  const g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k) | 0;
  const b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k) | 0;
  L[j] = (255 << 24) | (b << 16) | (g << 8) | r;
}
export function mixc(a, b, t) {
  const r = (a & 255) + ((b & 255) - (a & 255)) * t, g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t;
  const bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
  return ((255 << 24) | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}

// joints, cached by pose (poses hold on 12 fps steps, so the cache hits almost always)
const JCACHE = new Map();
export function jointsOf(pose) {
  let s = "";
  for (const k of Object.keys(pose).sort()) {
    const v = pose[k];
    if (v === undefined || k === "ghost") continue;
    s += k + (typeof v === "number" ? Math.round(v * 2) : v) + ",";
  }
  let j = JCACHE.get(s);
  if (!j) {
    if (JCACHE.size > 3000) JCACHE.clear();
    j = skeleton(pose).joints;
    JCACHE.set(s, j);
  }
  return j;
}
