// Runs the real game modules in Node through Vite's module loader, so tests exercise src/ itself (import.meta.glob,
// the pixelfx alias and the lazily loaded effects included). Only the browser's page objects are stubbed.

import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) });
const canvas = { style: {}, width: 0, height: 0, getContext: () => ctx2d, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }) };
Object.assign(globalThis, {
  window: globalThis,
  addEventListener: noop,
  innerWidth: 1280,
  innerHeight: 720,
  document: { getElementById: () => canvas, createElement: () => canvas, addEventListener: noop, hidden: false, fonts: { load: async () => [], ready: Promise.resolve() } },
  ImageData: class { constructor(data, w, h) { Object.assign(this, { data, width: w, height: h }); } },
});

const server = await createServer({ root: ROOT, configFile: `${ROOT}vite.config.js`, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false } });
export const load = (path) => server.ssrLoadModule(path);
export const close = () => server.close();

/** Math.random, seeded: monsters use it for small variations, and tests compare whole runs. */
export function seedRandom(seed) {
  let s = seed >>> 0 || 1;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
