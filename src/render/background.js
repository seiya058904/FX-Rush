// Scenes: parallax layers painted procedurally at load (seeded, so every run's scene is the same art), a sky
// that can host PixelFX loops (aurora, eclipse, shooting stars) rendered into their own small frame, a floor
// with animated glow (lava seams, frost sheen, neon grid), and contact shadows. Everything is written straight
// into the background buffer that PixelFX's composite() puts the game's color and light over, so every effect's
// glow lights the scene behind it.

import { bg32, createFrame, clearFrame, makeFx, composite, hex, mix, rand, noise2, fbm, markUsed } from "../engine/pfx.js";
import { FW, FH, M, FLOOR, W } from "../config.js";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const c = (h) => hex(h) >>> 0;
const lerpC = (a, b, t) => mix(a, b, t) >>> 0;

class Layer {
  constructor(w, h, y0, parallax) {
    Object.assign(this, { w, h, y0, parallax, data: new Uint32Array(w * h) });
  }
  px(x, y, col) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    y = Math.round(y);
    if (y < 0 || y >= this.h) return;
    this.data[y * this.w + x] = col;
  }
  get(x, y) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    return y < 0 || y >= this.h ? 0 : this.data[y * this.w + x];
  }
  rect(x, y, w, h, col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col);
  }
  /** Filled polygon (even-odd), with a color function of (x, y). */
  poly(pts, col) {
    let y0 = 1e9, y1 = -1e9;
    for (const [, y] of pts) (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.px(x, y, typeof col === "function" ? col(x, y) : col);
    }
  }
  ellipse(cx, cy, rx, ry, col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, typeof col === "function" ? col(x, y, dx, dy) : col);
      }
  }
  /** Outline every filled pixel that borders empty space, in `col` (pixel art ink). */
  rim(col, top = null) {
    const out = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const v = this.data[y * this.w + x];
        if (!v) continue;
        if (top && !this.get(x, y - 1)) out.push([x, y, top]);
        else if (!this.get(x - 1, y) || !this.get(x + 1, y) || !this.get(x, y + 1) || !this.get(x, y - 1)) out.push([x, y, col]);
      }
    for (const [x, y, k] of out) this.data[y * this.w + x] = k;
  }
}

const dither = (x, y, t) => t > BAYER[((y & 3) << 2) | (x & 3)];

// ---------------------------------------------------------------- Ember Forge
function emberScene() {
  const S = {};
  const sky = new Uint32Array(FW * FH);
  const top = c("#07050b"), mid = c("#1a0b12"), low = c("#3a1018"), haze = c("#7a2a18");
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const t = (y - M) / FLOOR;
      let col = t < 0.55 ? lerpC(top, mid, Math.floor((t / 0.55) * 6 + BAYER[((y & 3) << 2) | (x & 3)]) / 6) : lerpC(mid, low, Math.floor(((t - 0.55) / 0.45) * 5 + BAYER[((y & 3) << 2) | (x & 3)]) / 5);
      if (t > 0.7) col = lerpC(col, haze, Math.max(0, (t - 0.7) / 0.3) * 0.5 * (dither(x, y, (t - 0.7) * 2.2) ? 1 : 0.6));
      sky[y * FW + x] = col;
    }
  S.sky = sky;
  // far: a range of forge-mountains and chimneys, lava veins glowing
  const far = new Layer(640, 110, 46, 0.12);
  const fcol = c("#120810"), fvein = c("#5a1810"), fhot = c("#b8401a");
  for (let x = 0; x < 640; x++) {
    const h = 34 + 22 * fbm(x * 0.012, 3.1, 7, 3) + 10 * Math.sin(x * 0.031);
    for (let y = Math.floor(110 - h); y < 110; y++) far.px(x, y, fcol);
  }
  for (const cx of [70, 210, 330, 470, 590]) {
    const w = 10 + ((cx * 7) % 6), h = 70 + ((cx * 13) % 24);
    far.rect(cx - w / 2, 110 - h, w, h, fcol);
    far.rect(cx - w / 2 - 2, 110 - h, w + 4, 3, fcol);
  }
  // veins of lava down the slopes
  for (let i = 0; i < 26; i++) {
    let x = rand(i, 1, 5) * 640, y = 60 + rand(i, 2, 5) * 30;
    for (let k = 0; k < 40; k++) {
      if (far.get(x, y)) far.px(x, y, k < 8 ? fhot : fvein);
      x += Math.round(rand(i, k, 9) * 2 - 1);
      y += 1;
    }
  }
  far.rim(c("#1c0c12"), c("#3a1416"));
  S.far = far;
  // mid: forge architecture, arches and pillars, lit from below by the lava
  const midL = new Layer(960, 120, 34, 0.42);
  const stone = c("#1e1018"), stoneL = c("#2e1820"), lit = c("#5a2418"), litH = c("#a8441c");
  for (let base = 0; base < 960; base += 160) {
    const bx = base + 20;
    // a pair of pillars with an arch
    for (const px of [bx, bx + 92]) {
      midL.rect(px, 18, 16, 102, stone);
      midL.rect(px - 3, 14, 22, 6, stoneL);
      midL.rect(px - 2, 108, 20, 12, stoneL);
      for (let y = 26; y < 106; y += 9) midL.rect(px + 2, y, 12, 1, c("#160a10"));
      midL.rect(px + 13, 20, 3, 88, c("#2a1418"));
    }
    midL.poly([[bx + 16, 22], [bx + 92, 22], [bx + 92, 34], [bx + 76, 30], [bx + 54, 28], [bx + 32, 30], [bx + 16, 34]], stone);
    // hanging chain and a cauldron of glowing metal
    for (let y = 34; y < 70; y += 3) midL.rect(bx + 54, y, 2, 2, c("#3a2028"));
    midL.ellipse(bx + 55, 76, 10, 7, (x, y, dx, dy) => (dy < -0.4 ? litH : dy < 0 ? lit : stone));
  }
  // gears
  for (const gx of [130, 450, 770]) {
    midL.ellipse(gx, 60, 18, 18, (x, y, dx, dy) => (dx * dx + dy * dy < 0.15 ? 0 : stoneL));
    for (let a = 0; a < 10; a++) {
      const an = (a / 10) * Math.PI * 2;
      midL.rect(gx + Math.cos(an) * 19 - 2, 60 + Math.sin(an) * 19 - 2, 4, 4, stoneL);
    }
  }
  midL.rim(c("#0e060a"));
  // under-lighting on the lower parts
  for (let y = 80; y < 120; y++)
    for (let x = 0; x < 960; x++) {
      const v = midL.get(x, y);
      if (v && v !== 0 && dither(x, y, (y - 80) / 60)) midL.data[y * 960 + x] = lerpC(v, c("#6a2416"), 0.35);
    }
  S.mid = midL;
  // floor: dark basalt flagstones with lava seams
  const floor = new Layer(640, FH - FLOOR - M + 8, FLOOR, 1);
  const f0 = c("#2a1a24"), f1 = c("#1f141c"), f2 = c("#160e15"), edge = c("#5a3040"), mortar = c("#0e080c");
  const glowMask = new Float32Array(640 * floor.h);
  for (let y = 0; y < floor.h; y++)
    for (let x = 0; x < 640; x++) {
      let col = y === 0 ? edge : y === 1 ? c("#3a2230") : y < 6 ? f0 : y < 14 ? f1 : f2;
      const row = Math.floor((y - 2) / 7), off = row % 2 ? 11 : 0;
      if (y > 2 && ((y - 2) % 7 === 6 || (x + off) % 22 === 0)) col = mortar;
      const n = noise2(x * 0.15, y * 0.4, 3);
      if (y > 3 && n > 0.72) col = lerpC(col, c("#3a2430"), 0.4);
      floor.data[y * 640 + x] = col;
    }
  // lava seams: crooked cracks that glow
  for (let i = 0; i < 18; i++) {
    let x = rand(i, 7, 3) * 640, y = 3 + rand(i, 8, 3) * 6;
    const len = 10 + rand(i, 9, 3) * 30;
    for (let k = 0; k < len; k++) {
      floor.px(x, y, c("#ff7a2a"));
      glowMask[(Math.round(y) * 640 + ((Math.round(x) % 640) + 640) % 640)] = 1 - k / len;
      x += 1;
      y += Math.round(rand(i, k, 4) * 2 - 1) * 0.5;
      y = Math.max(3, Math.min(floor.h - 1, y));
    }
  }
  S.floor = floor;
  S.floorGlow = { mask: glowMask, cool: c("#7a1e10"), hot: c("#ffb040"), light: c("#ff6a1a"), speed: 1.4 };
  S.ambient = { color: c("#ff6a1a"), rise: true, n: 26, kind: "ember" };
  S.skyFx = null;
  S.lightK = 1;
  return S;
}

// ---------------------------------------------------------------- Frozen Ruins
function frostScene() {
  const S = {};
  const sky = new Uint32Array(FW * FH);
  const top = c("#04060e"), mid = c("#0a1428"), low = c("#16304a");
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const t = (y - M) / FLOOR, b = BAYER[((y & 3) << 2) | (x & 3)];
      let col = t < 0.6 ? lerpC(top, mid, Math.floor((t / 0.6) * 6 + b) / 6) : lerpC(mid, low, Math.floor(((t - 0.6) / 0.4) * 5 + b) / 5);
      const r = rand(x, y, 31);
      if (t < 0.6 && r > 0.996) col = lerpC(col, c("#cfe8ff"), 0.5 + (r - 0.996) * 100);
      sky[y * FW + x] = col;
    }
  S.sky = sky;
  // far: snowy peaks
  const far = new Layer(640, 100, 54, 0.1);
  const rock = c("#0e1828"), snow = c("#5a7a9e"), snowH = c("#9cc0e0");
  for (let x = 0; x < 640; x++) {
    const h = 40 + 30 * fbm(x * 0.01, 1.7, 11, 3) + 14 * Math.abs(Math.sin(x * 0.02));
    const topY = Math.floor(100 - h);
    for (let y = topY; y < 100; y++) {
      const d = y - topY;
      far.px(x, y, d < 3 + 4 * noise2(x * 0.2, 1, 2) ? (d < 1 ? snowH : snow) : rock);
    }
  }
  S.far = far;
  // mid: ruined colonnade with frozen arches, icicles
  const midL = new Layer(960, 118, 36, 0.4);
  const st = c("#1a2a40"), stL = c("#2a4060"), stD = c("#121e30"), ice = c("#6cc4ec"), iceH = c("#c8f0ff");
  for (let base = 0; base < 960; base += 140) {
    const bx = base + 14, broken = (base / 140) % 3 === 1;
    for (const [px, hh] of [[bx, broken ? 70 : 100], [bx + 80, 100]]) {
      midL.rect(px, 118 - hh, 14, hh, st);
      midL.rect(px + 1, 118 - hh, 3, hh, stL);
      midL.rect(px + 11, 118 - hh, 3, hh, stD);
      midL.rect(px - 3, 118 - hh, 20, 5, stL);
      // snow cap and icicles
      midL.rect(px - 3, 118 - hh - 2, 20, 2, c("#a8c8e8"));
      for (let k = 0; k < 6; k++) {
        const ix = px - 2 + k * 3 + (k % 2), il = 2 + ((k * 7 + px) % 6);
        for (let j = 0; j < il; j++) midL.px(ix, 118 - hh + 5 + j, j === 0 ? iceH : ice);
      }
    }
    if (!broken) midL.poly([[bx + 14, 22], [bx + 80, 22], [bx + 80, 32], [bx + 60, 27], [bx + 34, 27], [bx + 14, 32]], st);
  }
  // a frozen statue head
  midL.ellipse(470, 92, 16, 20, (x, y, dx, dy) => (dx < -0.3 ? stL : dx > 0.4 ? stD : st));
  midL.rim(c("#060c16"), c("#9cc0e0"));
  S.mid = midL;
  // floor: packed snow over flagstones, with sheen
  const floor = new Layer(640, FH - FLOOR - M + 8, FLOOR, 1);
  const glowMask = new Float32Array(640 * floor.h);
  for (let y = 0; y < floor.h; y++)
    for (let x = 0; x < 640; x++) {
      const n = noise2(x * 0.08, y * 0.5, 5);
      let col = y === 0 ? c("#d8ecff") : y === 1 ? c("#9cc0e0") : y < 5 ? c("#5a7a9e") : y < 12 ? c("#2a405e") : c("#1a2a44");
      const row = Math.floor((y - 4) / 7), off = row % 2 ? 13 : 0;
      if (y > 5 && ((y - 4) % 7 === 6 || (x + off) % 26 === 0)) col = c("#101c30");
      if (y > 1 && y < 5 && n > 0.6) col = c("#7a9cc0");
      floor.data[y * 640 + x] = col;
      if (y > 2 && rand(x, y, 77) > 0.985) glowMask[y * 640 + x] = 0.6;
    }
  S.floor = floor;
  S.floorGlow = { mask: glowMask, cool: c("#2a405e"), hot: c("#e8f8ff"), light: c("#6cc4ec"), speed: 3, twinkle: true };
  S.ambient = { color: c("#cfe8ff"), rise: false, n: 0, kind: "none" };
  S.skyFx = { id: "weather/aurora", opts: { palette: ["#04060e", "#0a2a2a", "#0e5a4a", "#22a070", "#5ae0a0", "#b8ffd8", "#ffffff"], upper: ["#1a0a3a", "#4a1a7a", "#8a3ab0"] }, light: 0.8 };
  S.lightK = 1;
  return S;
}

// ---------------------------------------------------------------- Neon Void
function voidScene() {
  const S = {};
  const sky = new Uint32Array(FW * FH);
  const top = c("#030108"), mid = c("#0c0418"), low = c("#26082e");
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const t = (y - M) / FLOOR, b = BAYER[((y & 3) << 2) | (x & 3)];
      let col = t < 0.6 ? lerpC(top, mid, Math.floor((t / 0.6) * 5 + b) / 5) : lerpC(mid, low, Math.floor(((t - 0.6) / 0.4) * 6 + b) / 6);
      const r = rand(x, y, 51);
      if (t < 0.7 && r > 0.995) col = lerpC(col, r > 0.998 ? c("#ff8af0") : c("#8af0ff"), 0.45);
      sky[y * FW + x] = col;
    }
  S.sky = sky;
  // far: a synthwave horizon grid and floating monoliths
  const far = new Layer(640, 70, 84, 0.15);
  const grid = c("#5a1a6a"), gridH = c("#a83ab0");
  for (let y = 40; y < 70; y++) {
    const d = (y - 40) / 30;
    if (Math.abs(((y - 40) ** 1.6) % 6) < 1) for (let x = 0; x < 640; x++) far.px(x, y, d > 0.5 ? gridH : grid);
  }
  for (let x = 0; x < 640; x += 16) for (let y = 40; y < 70; y++) far.px(x + (x - 320) * ((y - 40) / 30) * 0.4, y, grid);
  for (const [mx, mh] of [[60, 50], [200, 34], [380, 58], [520, 40]]) {
    far.rect(mx, 40 - mh, 12, mh, c("#120620"));
    far.rect(mx, 40 - mh, 1, mh, c("#ff3df0"));
    far.rect(mx + 11, 40 - mh, 1, mh, c("#3a0a4a"));
  }
  S.far = far;
  // mid: broken platforms and neon arches drifting
  const midL = new Layer(960, 110, 40, 0.38);
  const plat = c("#140820"), platL = c("#24103a"), neonA = c("#ff2dd0"), neonB = c("#3af0ff");
  for (let base = 0; base < 960; base += 190) {
    const bx = base + 30, by = 20 + ((base / 190) % 3) * 14;
    midL.poly([[bx, by], [bx + 70, by], [bx + 60, by + 10], [bx + 44, by + 26], [bx + 30, by + 18], [bx + 12, by + 10]], (x, y) => (y < by + 2 ? platL : plat));
    for (let x = bx; x < bx + 70; x++) midL.px(x, by, (base / 190) % 2 ? neonA : neonB);
    // an arch frame
    const ax = base + 130;
    for (let y = 30; y < 110; y++) {
      midL.px(ax, y, neonA);
      midL.px(ax + 34, y, neonA);
      midL.px(ax + 1, y, plat);
      midL.px(ax + 33, y, plat);
    }
    for (let x = ax; x <= ax + 34; x++) midL.px(x, 30, neonA);
  }
  S.mid = midL;
  // floor: black glass with a cyan grid that pulses
  const floor = new Layer(640, FH - FLOOR - M + 8, FLOOR, 1);
  const glowMask = new Float32Array(640 * floor.h);
  for (let y = 0; y < floor.h; y++)
    for (let x = 0; x < 640; x++) {
      let col = y === 0 ? c("#ff7af0") : y === 1 ? c("#5a1a6a") : y < 8 ? c("#120a1e") : c("#0a0612");
      const line = y > 1 && ((y - 2) % 8 === 0 || x % 32 === 0);
      if (line) {
        col = c("#1a3a4a");
        glowMask[y * 640 + x] = 0.5;
      }
      if (y > 2 && y < 8 && rand(x, 1, 3) > 0.92) col = c("#1e1030");
      floor.data[y * 640 + x] = col;
    }
  S.floor = floor;
  S.floorGlow = { mask: glowMask, cool: c("#123040"), hot: c("#3af0ff"), light: c("#3af0ff"), speed: 2.2, wave: true };
  S.ambient = { color: c("#ff6ad8"), rise: true, n: 18, kind: "mote" };
  S.skyFx = { id: "shadow/eclipse", x: 250, y: 64, opts: { palette: ["#05020a", "#1a0628", "#4a0e5a", "#9a1a9a", "#ff3df0", "#ffb0f0", "#ffffff"], pearl: ["#ffd0f0", "#ffffff"] }, light: 0.8 };
  S.lightK = 1;
  return S;
}

// ---------------------------------------------------------------- title
function titleScene() {
  const S = frostScene();
  S.skyFx = { id: "weather/clouds", opts: {}, light: 0.7 };
  return S;
}

const BUILDERS = { ember: emberScene, frost: frostScene, void: voidScene, title: titleScene };
const cache = new Map();
export function scene(id) {
  if (!cache.has(id)) cache.set(id, BUILDERS[id]());
  return cache.get(id);
}

// ---------------------------------------------------------------- per-frame
const skyFrame = createFrame(FW, FH, 0, 0);
const skyImg = new Uint32Array(FW * FH);
const skyBytes = new Uint8ClampedArray(skyImg.buffer);
let skyInst = null, skyId = null, skyAcc = 0, skyTick = 0;
const motes = [];

/** Fill bg32 for this frame. camX: world x of the screen's left edge. t: scene time. */
export function drawBackground(S, camX, t, dt, quality = 2) {
  // sky (with an optional PixelFX loop living in it, refreshed at 20 fps)
  if (S.skyFx) {
    if (skyId !== S.skyFx.id) {
      skyInst = makeFx(S.skyFx.id, { x: (S.skyFx.x ?? 160) + M, y: (S.skyFx.y ?? 180) + M, ...S.skyFx.opts, light: S.skyFx.light });
      if (skyInst) {
        skyId = S.skyFx.id;
        markUsed(skyId);
      }
      skyTick = 1;
    }
    if (skyInst) {
      skyAcc += dt;
      if (skyAcc >= (quality > 1 ? 0.08 : quality > 0 ? 0.12 : 0.2) || skyTick) {
        skyInst.update(skyAcc);
        skyAcc = 0;
        skyTick = 0;
        clearFrame(skyFrame);
        skyInst.draw(skyFrame);
        composite(skyFrame, skyBytes, S.sky, 1);
      }
      bg32.set(skyImg);
    } else bg32.set(S.sky);
  } else bg32.set(S.sky);
  blit(S.far, camX);
  blit(S.mid, camX);
  blitFloor(S, camX, t);
  ambient(S, camX, t, dt, quality);
}
export function resetSky() {
  skyInst = null;
  skyId = null;
  motes.length = 0;
}

function blit(L, camX) {
  if (!L) return;
  const off = Math.floor(camX * L.parallax) - M;
  for (let y = 0; y < L.h; y++) {
    const fy = L.y0 + y + M;
    if (fy < 0 || fy >= FH) continue;
    const row = y * L.w, frow = fy * FW;
    for (let x = 0; x < FW; x++) {
      const v = L.data[row + ((((x + off) % L.w) + L.w) % L.w)];
      if (v) bg32[frow + x] = v;
    }
  }
}
function blitFloor(S, camX, t) {
  const L = S.floor, G = S.floorGlow, off = Math.floor(camX) - M;
  for (let y = 0; y < L.h; y++) {
    const fy = L.y0 + y + M;
    if (fy < 0 || fy >= FH) continue;
    const row = y * L.w, frow = fy * FW;
    for (let x = 0; x < FW; x++) {
      const sx = (((x + off) % L.w) + L.w) % L.w, v = L.data[row + sx], g = G.mask[row + sx];
      if (g > 0) {
        let k;
        if (G.twinkle) k = Math.max(0, Math.sin(t * G.speed + sx * 0.7 + y * 3.1)) ** 6;
        else if (G.wave) k = 0.25 + 0.75 * Math.max(0, Math.sin(t * G.speed - (x + off) * 0.03)) ** 3;
        else k = (0.55 + 0.45 * Math.sin(t * G.speed + sx * 0.05)) * g;
        bg32[frow + x] = lerpC(G.cool, G.hot, Math.min(1, k));
      } else bg32[frow + x] = v;
    }
  }
}
// a few drifting embers or motes in the air, painted straight into the background
function ambient(S, camX, t, dt, quality) {
  const A = S.ambient;
  if (!A || !A.n || quality === 0) return;
  while (motes.length < A.n) motes.push({ x: Math.random() * FW, y: Math.random() * FH, v: 6 + Math.random() * 14, ph: Math.random() * 6, life: Math.random() });
  for (const m of motes) {
    m.y -= (A.rise ? m.v : -m.v * 0.5) * dt;
    m.x += Math.sin(t * 1.3 + m.ph) * 6 * dt;
    if (m.y < 0) (m.y = FH - 1), (m.x = Math.random() * FW);
    if (m.y >= FH) m.y = 0;
    const x = Math.floor(((m.x - camX * 0.6) % FW + FW) % FW), y = Math.floor(m.y);
    if (y < FLOOR + M) {
      const k = 0.5 + 0.5 * Math.sin(t * 4 + m.ph);
      bg32[y * FW + x] = lerpC(bg32[y * FW + x], A.color, 0.4 + 0.6 * k);
    }
  }
}

/** Darken the floor under a character: a soft contact shadow. */
export function shadowAt(x, camX, y, hw) {
  const lift = Math.min(1, Math.max(0, -y / 70));
  const w = Math.max(2, Math.round(hw * (1 - lift * 0.5)));
  const cx = Math.round(x - camX) + M, row = FLOOR + M;
  for (let dy = 0; dy < 3; dy++) {
    const ww = w - dy * 2 - (dy === 0 ? 1 : 0);
    for (let dx = -ww; dx <= ww; dx++) {
      const px = cx + dx;
      if (px < 0 || px >= FW) continue;
      const i = (row + dy) * FW + px, v = bg32[i], k = 0.5 * (1 - lift * 0.7) * (dy === 2 ? 0.6 : 1);
      bg32[i] = ((255 << 24) | ((((v >>> 16) & 255) * (1 - k)) << 16) | ((((v >>> 8) & 255) * (1 - k)) << 8) | ((v & 255) * (1 - k))) >>> 0;
    }
  }
}

export { W };
