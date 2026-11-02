#!/usr/bin/env node
// CPU-profile the game in Chrome and print the hottest functions by self time.
//   node tools/profile.mjs --url "http://localhost:5173/?auto&god" --warm 12000 --ms 6000 [--cpu 4]

import { chromium } from "playwright-core";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc), []));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const cdp = await page.context().newCDPSession(page);
if (args.cpu) await cdp.send("Emulation.setCPUThrottlingRate", { rate: +args.cpu });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(args.url ?? "http://localhost:5173/?auto&god", { waitUntil: "load" });
await page.waitForTimeout(+(args.warm ?? 12000));
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
const s0 = await page.evaluate(() => ({ fps: window.__fxrush.fps, ms: window.__fxrush.frameMs }));
await page.waitForTimeout(+(args.ms ?? 6000));
const { profile } = await cdp.send("Profiler.stop");
const s1 = await page.evaluate(() => {
  const f = window.__fxrush, g = f.game;
  return { fps: f.fps, ms: +f.frameMs.toFixed(2), q: f.quality, enemies: g?.enemies.length, fx: g?.fx.count, stage: g?.stageIndex, t: g?.stageT };
});
// self time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id), cf = n.callFrame;
  const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").slice(-2).join("/").replace(/\?.*$/, "")}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0));
});
const total = [...self.values()].reduce((a, b) => a + b, 0);
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, +(args.top ?? 28));
console.log("before", s0, "after", s1);
for (const [k, v] of top) console.log(((v / total) * 100).toFixed(1).padStart(5) + "%  " + k);
if (errors.length) console.log("errors:", errors.slice(0, 5));
await browser.close();
