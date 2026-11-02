// The PixelFX adapter: one place that knows where the vendored library lives, loads effect modules lazily
// (bundled one chunk per category), and owns the game's frame. Everything else imports from here.

import { createFrame, clearFrame, createFx, composite, painterFor } from "pixelfx";
import { FX } from "../fx/registry.gen.js";
import { FW, FH, M, FLOOR } from "../config.js";

export * from "pixelfx";

// every effect file, lazily: "fire/torch" -> () => import(...)
const globbed = import.meta.glob(["../../third_party/pixelfx/src/fx/*/*.js", "!../../third_party/pixelfx/src/fx/*/_*.js"]);
const loaders = {};
for (const [path, load] of Object.entries(globbed)) {
  const m = path.match(/src\/fx\/([a-z]+\/[a-z0-9-]+)\.js$/);
  if (m) loaders[m[1]] = load;
}
export const ALL_IDS = Object.keys(FX);

const mods = new Map();
const pending = new Map();
const failed = new Map();

// FX Rush's own effects, written to the PixelFX contract (not counted as library coverage)
import * as chainBolt from "../fx/custom/chain-bolt.js";
const CUSTOM = { "fxrush/chain-bolt": chainBolt };
for (const [id, m] of Object.entries(CUSTOM)) {
  mods.set(id, m);
  const me = m.meta;
  FX[id] = { id, cat: "custom", loop: !!me.loop, duration: me.duration, w: me.size[0], h: me.size[1], ox: me.origin[0], oy: me.origin[1], actor: 0, act: false, onBody: false };
}

/** The effect module if it's loaded, else null (and it starts loading). */
export function fxModule(id) {
  const m = mods.get(id);
  if (m) return m;
  if (!pending.has(id) && !failed.has(id)) loadFx(id);
  return null;
}
export function isLoaded(id) {
  return mods.has(id);
}
export function loadFx(id) {
  if (mods.has(id)) return Promise.resolve(mods.get(id));
  if (pending.has(id)) return pending.get(id);
  const load = loaders[id];
  if (!load) {
    failed.set(id, "no such effect");
    return Promise.resolve(null);
  }
  const p = load()
    .then((mod) => {
      mods.set(id, mod);
      pending.delete(id);
      return mod;
    })
    .catch((e) => {
      failed.set(id, String(e?.message ?? e));
      pending.delete(id);
      return null;
    });
  pending.set(id, p);
  return p;
}
export function preload(ids) {
  return Promise.all([...new Set(ids)].map(loadFx));
}
export const loadStats = () => ({ loaded: mods.size, pending: pending.size, failed: [...failed.entries()], total: ALL_IDS.length });
export const hasLoader = (id) => !!loaders[id];

/** A live effect instance, or null if its module isn't loaded yet. */
export function makeFx(id, opts) {
  const mod = fxModule(id);
  return mod ? createFx(mod, opts) : null;
}

// ---- the game's frame: world space is placed into it by the camera
export const frame = createFrame(FW, FH, 0, 0);
export const image = new ImageData(FW, FH);
export const bg32 = new Uint32Array(FW * FH);
/** Camera: world x of the screen's left edge. */
export function setCamera(camX) {
  frame.ox = Math.round(camX) - M;
  frame.oy = -FLOOR - M;
}
export function beginFrame() {
  clearFrame(frame);
}
export function endFrame(lightK = 1) {
  composite(frame, image.data, bg32, lightK);
}
export { painterFor, clearFrame, createFrame };
