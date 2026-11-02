// The canvas: 320 x 180 logical pixels, scaled to the window with nearest-neighbour filtering. Integer scales
// when they fill most of the window (crisp, even pixels), otherwise the largest fit (still nearest-neighbour).

import { W, H } from "../config.js";

export const canvas = document.getElementById("game");
// not desynchronized: the frame must only reach the screen once the HUD is drawn over the game
export const ctx = canvas.getContext("2d", { alpha: false });
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

export const view = { scale: 1, left: 0, top: 0, width: W, height: H, touch: false };

export function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const fitScale = Math.min(vw / W, vh / H);
  const whole = Math.floor(fitScale);
  // a whole-number scale unless it would waste more than 12% of the window
  const s = whole >= 1 && whole / fitScale > 0.88 ? whole : fitScale;
  const w = Math.floor(W * s), h = Math.floor(H * s);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const left = Math.floor((vw - w) / 2), top = Math.floor((vh - h) / 2);
  canvas.style.left = left + "px";
  canvas.style.top = top + "px";
  Object.assign(view, { scale: s, left, top, width: w, height: h });
}
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", () => setTimeout(fit, 120));
fit();

/** Client (CSS px) coordinates to logical canvas pixels. */
export function toLogical(clientX, clientY) {
  return [(clientX - view.left) / view.scale, (clientY - view.top) / view.scale];
}
