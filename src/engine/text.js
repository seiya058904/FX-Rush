// Pixel text, crisp at the game's own pixel size. Chinese UI text uses Fusion Pixel 10px (OFL, bundled under
// public/fonts); numbers and short English words can use PixelFX's code-drawn "mini" (3x5) and "big" (5x7)
// fonts. Every string is rasterised once into a cached bitmap, thresholded so no anti-aliasing ever shows,
// with an optional 1 px outline and drop shadow, and blitted at integer scales.

import { FONTS, textWidth } from "pixelfx";
import { rasterText } from "../../third_party/pixelfx/src/core/font.js";

const FAMILY = "ArkPixel10";
let cjkReady = false;
export async function loadFonts() {
  try {
    const url = new URL("fonts/fusion-pixel/fusion-pixel-10px-proportional-zh_hans.otf.woff2", document.baseURI).href;
    const face = new FontFace(FAMILY, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    cjkReady = true;
  } catch (e) {
    console.warn("pixel font failed to load, falling back", e);
  }
  cache.clear();
  GLYPHS.clear();
}

const cache = new Map();
const MAX = 600;
const scratch = document.createElement("canvas");
const sctx = scratch.getContext("2d", { willReadFrequently: true });

function css(c) {
  return typeof c === "string" ? c : `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
}

// One CJK-font glyph as font pixels. At its design size the browser anti-aliases the font (its metrics sit a
// fraction of a pixel off the grid), so each glyph is drawn 10x larger, its own pixel grid is found from its
// ink, and every font pixel is read at its cell's center. Rows count from the baseline so all glyphs line up.
const GLYPHS = new Map();
function glyph(ch) {
  let gl = GLYPHS.get(ch);
  if (gl) return gl;
  const K = 10, ASC = 10, BL = 14 * K;
  sctx.font = `10px ${cjkReady ? FAMILY : "monospace"}`;
  const adv = Math.round(sctx.measureText(ch).width);
  const cssFont = `${10 * K}px ${cjkReady ? FAMILY : "monospace"}`;
  scratch.width = (adv + 4) * K;
  scratch.height = 20 * K;
  sctx.font = cssFont;
  sctx.textBaseline = "alphabetic";
  sctx.fillStyle = "#fff";
  sctx.clearRect(0, 0, scratch.width, scratch.height);
  sctx.fillText(ch, K, BL);
  const W2 = scratch.width, H2 = scratch.height, img = sctx.getImageData(0, 0, W2, H2).data;
  const on = (x, y) => img[(y * W2 + x) * 4 + 3] > 127;
  let gx = -1, gy = -1;
  for (let y = 0; y < H2 && gy < 0; y++) for (let x = 0; x < W2; x++) if (on(x, y)) { gy = y; break; }
  for (let x = 0; x < W2 && gx < 0; x++) for (let y = 0; y < H2; y++) if (on(x, y)) { gx = x; break; }
  const bits = [];
  if (gx >= 0) {
    const col0 = Math.round((gx - K) / K), row0 = Math.round((gy - BL) / K) + ASC;
    for (let r = 0; r < 13; r++)
      for (let c = col0; c < col0 + adv + 2; c++) {
        const px = gx + (c - col0) * K + (K >> 1), py = gy + (r - row0) * K + (K >> 1);
        if (px >= 0 && py >= 0 && px < W2 && py < H2 && on(px, py)) bits.push([r, c]);
      }
  }
  gl = { adv: Math.max(adv, 1), bits };
  GLYPHS.set(ch, gl);
  return gl;
}

/** Rasterise a string to a 1-bit mask: { w, h, data }. */
function maskOf(str, font) {
  if (font === "mini" || font === "big") {
    const f = FONTS[font], w = Math.max(1, textWidth(str, font)), h = f.h;
    const data = new Uint8Array(w * h);
    rasterText(str, font, (x, y) => {
      if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 1;
    });
    return { w, h, data };
  }
  // the CJK pixel font, one glyph at a time from a glyph cache, placed at whole-pixel advances
  const H0 = 13, glyphs = [...str].map(glyph);
  const w = Math.max(1, glyphs.reduce((a, gl) => a + gl.adv, 0));
  const data = new Uint8Array(w * H0);
  let pen = 0, maxX = 0;
  for (const gl of glyphs) {
    for (const [r, c] of gl.bits) {
      const x = pen + c;
      if (x >= 0 && x < w && r >= 0 && r < H0) {
        data[r * w + x] = 1;
        maxX = Math.max(maxX, x);
      }
    }
    pen += gl.adv;
  }
  return { w, h: H0, data, ink: maxX + 1 };
}

function bitmap(str, font, color, outline, shadow) {
  const key = `${font}|${color}|${outline}|${shadow}|${str}`;
  let b = cache.get(key);
  if (b) {
    cache.delete(key);
    cache.set(key, b);
    return b;
  }
  const m = maskOf(str, font), pad = outline || shadow ? 1 : 0, sh = shadow ? 1 : 0;
  const w = m.w + pad * 2 + sh, h = m.h + pad * 2 + sh;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d"), id = c.createImageData(w, h), d = new Uint32Array(id.data.buffer);
  const col = (v) => {
    if (typeof v === "number") return v;
    const s = v.replace("#", ""), n = parseInt(s.length === 3 ? s.replace(/./g, "$&$&") : s, 16);
    return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
  };
  const on = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.data[y * m.w + x];
  if (shadow) {
    const sc = col(shadow);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (on(x, y)) {
      d[(y + pad + 1) * w + x + pad + 1] = sc;
      if (outline) for (const [dx, dy] of [[2, 1], [1, 2], [2, 2]]) d[(y + pad + dy) * w + x + pad + dx] = sc;
    }
  }
  if (outline) {
    const oc = col(outline);
    for (let y = -1; y <= m.h; y++)
      for (let x = -1; x <= m.w; x++) {
        if (on(x, y)) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) d[(y + pad) * w + x + pad] = oc;
      }
  }
  const fc = col(color);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (on(x, y)) d[(y + pad) * w + x + pad] = fc;
  c.putImageData(id, 0, 0);
  b = { cv, w, h, pad, ink: (m.ink ?? m.w) + pad * 2 + sh };
  cache.set(key, b);
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return b;
}

/**
 * Draw text. opts: { color, font: "cjk" | "mini" | "big", scale (integer), align: left|center|right,
 * outline (color), shadow (color), alpha }. x, y: top-left of the glyphs (outline goes 1 px outside).
 */
export function drawText(ctx, str, x, y, opts = {}) {
  str = String(str);
  if (!str) return 0;
  const { color = "#ffffff", font = "cjk", scale = 1, align = "left", outline = null, shadow = null, alpha = 1 } = opts;
  const b = bitmap(str, font, color, outline, shadow);
  const w = b.ink * scale;
  let dx = x - b.pad * scale;
  if (align === "center") dx = Math.round(x - w / 2);
  else if (align === "right") dx = Math.round(x - w);
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(b.cv, Math.round(dx), Math.round(y - b.pad * scale), b.w * scale, b.h * scale);
  if (alpha < 1) ctx.globalAlpha = 1;
  return w;
}

export function measureText(str, opts = {}) {
  const { font = "cjk", scale = 1, outline = null, shadow = null } = opts;
  return bitmap(String(str), font, "#fff", outline, shadow).ink * scale;
}

/** Break a string into lines no wider than maxW (CJK text breaks anywhere; spaces preferred). */
export function wrapText(str, maxW, opts = {}) {
  const lines = [];
  let line = "";
  for (const ch of String(str)) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    const next = line + ch;
    if (measureText(next, opts) > maxW && line) {
      lines.push(line);
      line = ch === " " ? "" : ch;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export { css };
