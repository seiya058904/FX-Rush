#!/usr/bin/env node
// Headless self-test of every vendored PixelFX effect, the same checks as the in-browser FX Lab:
// it loads, draws something, keeps inside its canvas, ends (one-shots report done, loops stop when told),
// and what a frame costs. Writes docs/fx-smoke.json (the "previewed" column of the coverage audit).
//
//   node tools/fx-smoke.mjs [ids...]

import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PFX = join(ROOT, "third_party/pixelfx/src");
const { createFrame, clearFrame, createFx } = await import(pathToFileURL(join(PFX, "core/index.js")).href);
const reg = JSON.parse(readFileSync(join(ROOT, "docs/fx-registry.json"), "utf8"));
const only = process.argv.slice(2);
const list = reg.effects.filter((e) => !only.length || only.some((o) => e.id.startsWith(o)));

const results = [];
const t0 = Date.now();
for (const info of list) {
  const r = { id: info.id, status: "pass", notes: [] };
  try {
    const mod = await import(pathToFileURL(join(PFX, "fx", info.id + ".js")).href);
    const [W, H] = info.size, [OX, OY] = info.origin, M = 24, w = W + M * 2, h = H + M * 2;
    const frame = createFrame(w, h, 0, 0), inst = createFx(mod, { x: OX + M, y: OY + M });
    const fps = 30, n = Math.min(360, Math.ceil(info.duration * fps) + (info.loop ? 0 : 1));
    let drawn = 0, outside = 0, glowOut = 0, ms = 0, worst = 0;
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      if (i) inst.update(1 / fps);
      clearFrame(frame);
      inst.draw(frame);
      const d = performance.now() - a;
      ms += d;
      worst = Math.max(worst, d);
      let any = false, spill = 0, glow = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const j = y * w + x;
          const c = frame.color[j], l = frame.light[j];
          if (!c && !(l & 0xffffff)) continue;
          any = true;
          // the same rule as upstream tools/check.mjs: any color past the canvas, or bright glow past it
          if (x < M || y < M || x >= M + W || y >= M + H) {
            if (c >>> 24) spill++;
            else if ((l & 255) + ((l >>> 8) & 255) + ((l >>> 16) & 255) > 90) glow++;
          }
        }
      outside = Math.max(outside, spill);
      glowOut = Math.max(glowOut, glow);
      if (any) drawn++;
    }
    Object.assign(r, { frames: n, drawnFrames: drawn, avgMs: +(ms / n).toFixed(3), worstMs: +worst.toFixed(2), outsidePx: outside });
    if (!drawn) (r.status = "fail"), r.notes.push("never draws anything");
    if (outside) (r.status = r.status === "fail" ? "fail" : "warn"), r.notes.push(`${outside} px drawn outside its canvas`);
    if (glowOut > 60) (r.status = r.status === "fail" ? "fail" : "warn"), r.notes.push(`glow spills ${glowOut} px past its canvas`);
    if (info.loop) {
      inst.stop();
      for (let i = 0; i < 12; i++) inst.update(1 / 30);
      if (!inst.done()) (r.status = "fail"), r.notes.push("loop does not stop");
    } else {
      inst.update(info.duration);
      if (!inst.done()) (r.status = "fail"), r.notes.push("one-shot never ends");
    }
    if (r.avgMs > 6) (r.status = r.status === "fail" ? "fail" : "warn"), r.notes.push(`slow: ${r.avgMs} ms/frame`);
  } catch (e) {
    r.status = "fail";
    r.notes.push("error: " + String(e?.message ?? e).split("\n")[0]);
  }
  results.push(r);
}
const count = (s) => results.filter((r) => r.status === s).length;
const out = { when: new Date().toISOString(), node: process.version, total: results.length, pass: count("pass"), warn: count("warn"), fail: count("fail"), seconds: (Date.now() - t0) / 1000, results };
if (!only.length) writeFileSync(join(ROOT, "docs/fx-smoke.json"), JSON.stringify(out, null, 1));
console.log(`effects ${out.total}: pass ${out.pass}, warn ${out.warn}, fail ${out.fail} (${out.seconds}s)`);
for (const r of results.filter((r) => r.status !== "pass")) console.log(" ", r.status, r.id, r.notes.join("; "));
const slow = results.slice().sort((a, b) => (b.avgMs ?? 0) - (a.avgMs ?? 0)).slice(0, 8);
console.log("slowest:", slow.map((r) => `${r.id} ${r.avgMs}ms`).join(", "));
if (out.fail) process.exitCode = 1;
