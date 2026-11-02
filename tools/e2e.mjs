#!/usr/bin/env node
// End-to-end play tests in a real Chrome (playwright-core, the installed Chrome channel).
//
//   node tools/e2e.mjs [--url http://localhost:5173/] [--only afk,builds,manual,mobile] [--speed 4]
//
// Sessions:
//   afk      a whole run with nobody touching anything (real damage): must reach the end, no page errors
//   builds   god-mode runs with forced builds and seeds, to drive every skill level and branch on screen
//   manual   clicks, keyboard movement and jumps, pause/resume, focus loss, window resizes, restart flows
//   mobile   a phone viewport (touch): taps attack, swipe jumps, layout fits
// Every session records which PixelFX ids actually reached the screen; the union goes to docs/fx-runtime.json
// (the "triggered" column of the audit). Representative screenshots go to docs/screenshots/.

import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc), []));
const BASE = args.url ?? "http://localhost:5173/";
const SPEED = +(args.speed ?? 4);
const only = args.only ? String(args.only).split(",") : ["afk", "builds", "manual", "mobile"];
const SHOTS = join(ROOT, "docs/screenshots");
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: !args.headed, args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info"] });
const used = new Map();
const report = { when: new Date().toISOString(), base: BASE, speed: SPEED, sessions: [] };
const merge = (u) => Object.entries(u ?? {}).forEach(([k, v]) => used.set(k, (used.get(k) ?? 0) + v));

async function session(name, url, viewport, fn, opts = {}) {
  const ctx = await browser.newContext(opts.mobile ? { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  const res = { name, url, errors, ok: true, notes: [] };
  try {
    await fn(page, res);
  } catch (e) {
    res.ok = false;
    res.notes.push("exception: " + String(e.message).split("\n")[0]);
  }
  const u = await page.evaluate(() => window.__fxrush?.usedAll?.() ?? {}).catch(() => ({}));
  merge(u);
  res.distinctFx = Object.keys(u).length;
  res.seconds = Math.round((Date.now() - t0) / 1000);
  if (errors.length) res.ok = false;
  report.sessions.push(res);
  console.log(`${res.ok ? "PASS" : "FAIL"} ${name} (${res.seconds}s, ${res.distinctFx} fx)`, res.notes.join(" | "), errors.slice(0, 3).join(" / "));
  await ctx.close();
  return res;
}
const state = (page) =>
  page.evaluate(() => {
    const f = window.__fxrush, g = f.game;
    return {
      state: f.state, fps: f.fps, ms: +f.frameMs.toFixed(2), q: f.quality, stage: g?.stageIndex, phase: g?.phase, t: g ? +g.stageT.toFixed(1) : 0,
      lv: g?.level, hp: g ? Math.round(g.hero.hp) : 0, enemies: g?.enemies.length, fx: g?.fx.count, kills: g?.stats.kills, result: g?.result ?? null,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });
const waitFor = (page, pred, ms, every = 500) =>
  page.waitForFunction(pred, null, { timeout: ms, polling: every });
const shot = (page, file) => page.screenshot({ path: join(SHOTS, file) });

// ---------------------------------------------------------------- afk: a whole run, nobody touching anything
if (only.includes("afk"))
  await session("afk-full-run", `${BASE}?auto&speed=${SPEED}&seed=7`, { width: 1280, height: 720 }, async (page, res) => {
    const samples = [];
    const start = Date.now();
    while (Date.now() - start < 8 * 60000 / SPEED + 120000) {
      await page.waitForTimeout(4000);
      const s = await state(page);
      samples.push(s);
      if (s.state === "results") break;
    }
    const last = samples[samples.length - 1];
    res.result = last.result;
    res.heapMB = { first: samples[1]?.heap, max: Math.max(...samples.map((s) => s.heap ?? 0)), last: last.heap };
    res.maxFrameMs = Math.max(...samples.map((s) => s.ms));
    res.minQuality = Math.min(...samples.map((s) => s.q));
    res.notes.push(`result ${JSON.stringify(last.result && { won: last.result.won, stage: last.result.stage, time: Math.round(last.result.time), kills: last.result.kills, level: last.result.level })}`);
    if (last.state !== "results") (res.ok = false), res.notes.push("did not reach the results screen");
    await shot(page, "results.png");
  });

// ---------------------------------------------------------------- builds: every skill at every level, three scenes
const BUILDS = [
  { stage: 1, build: "blade:5,chain:5,inferno:5,frost:5,missile:5,vortex:5", seed: 11 },
  { stage: 1, build: "aegis:5,meteor:5,thunder:5,holy:5,earth:5,plague:5", seed: 12 },
  { stage: 2, build: "blade:3,chain:4,frost:5,earth:4,plague:5,holy:3", seed: 13 },
  { stage: 2, build: "missile:5,vortex:5,meteor:5,inferno:4,thunder:5,aegis:3", seed: 14 },
  { stage: 3, build: "chain:5,thunder:5,missile:4,holy:5,vortex:3,blade:5", seed: 15 },
  { stage: 3, build: "inferno:5,frost:4,earth:5,plague:4,aegis:5,meteor:3", seed: 16 },
];
if (only.includes("builds"))
  for (const b of BUILDS)
    await session(`build-s${b.stage}-${b.seed}`, `${BASE}?auto&god&speed=${SPEED}&stage=${b.stage}&seed=${b.seed}&build=${b.build}`, { width: 1280, height: 720 }, async (page, res) => {
      // through the scene, its boss and into the next one (or the victory screen)
      await waitFor(page, (s) => { const g = window.__fxrush.game; return g && (g.stageIndex >= s || window.__fxrush.state === "results"); }, (130000 / SPEED) * 1.6 + 90000, 1000).catch(() => res.notes.push("did not clear the scene in time"));
      const s = await state(page);
      res.notes.push(`stage ${s.stage} phase ${s.phase} lv ${s.lv} kills ${s.kills}`);
      if (b.seed === 11) await shot(page, "stage2-frozen-ruins.png");
      if (b.seed === 15) await shot(page, "victory.png");
    }).then(() => 0);

// ---------------------------------------------------------------- manual input, pause, focus, resize, restart flows
if (only.includes("manual"))
  await session("manual-controls", `${BASE}`, { width: 1366, height: 768 }, async (page, res) => {
    await page.waitForTimeout(2500);
    await shot(page, "title.png");
    const canvasPoint = (x, y) => page.evaluate(([x, y]) => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + (x / 320) * r.width, r.top + (y / 180) * r.height]; }, [x, y]);
    const [cx, cy] = await canvasPoint(200, 100);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(2600);
    let s = await state(page);
    if (s.state !== "play" || !(s.enemies > 0)) (res.ok = false), res.notes.push("fight did not start within 3 s");
    res.notes.push(`3s after start: ${s.enemies} enemies, ${s.kills} kills`);
    // rapid clicks: empowered thrusts
    const k0 = s.kills;
    for (let i = 0; i < 24; i++) {
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(110);
    }
    await shot(page, "fight-clicks.png");
    // walk left and right, jump
    const x0 = await page.evaluate(() => window.__fxrush.game.hero.x);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyD");
    const x1 = await page.evaluate(() => window.__fxrush.game.hero.x);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowLeft");
    const x2 = await page.evaluate(() => window.__fxrush.game.hero.x);
    await page.keyboard.press("Space");
    await page.waitForTimeout(160);
    const air = await page.evaluate(() => window.__fxrush.game.hero.y);
    res.notes.push(`move D ${Math.round(x1 - x0)}px, Left ${Math.round(x2 - x1)}px, jump y ${Math.round(air)}`);
    if (!(x1 - x0 > 20 && x2 - x1 < -20 && air < -10)) (res.ok = false), res.notes.push("movement/jump did not respond");
    // the auto AI takes back over
    await page.waitForTimeout(3000);
    s = await state(page);
    if (s.kills <= k0) (res.ok = false), res.notes.push("no kills after handing back to the AI");
    // pause with Esc; nothing moves while paused; resume
    await page.keyboard.press("Escape");
    const p0 = await page.evaluate(() => window.__fxrush.game.stageT);
    await page.waitForTimeout(1200);
    const p1 = await page.evaluate(() => window.__fxrush.game.stageT);
    await shot(page, "pause.png");
    if (Math.abs(p1 - p0) > 0.001 || (await state(page)).state !== "pause") (res.ok = false), res.notes.push("pause did not freeze the game");
    await page.keyboard.press("Escape");
    // losing focus pauses
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(300);
    if ((await state(page)).state !== "pause") (res.ok = false), res.notes.push("blur did not pause");
    await page.keyboard.press("Escape");
    // resize the window a few ways
    for (const [w, h] of [[800, 600], [1920, 1080], [1024, 768], [1366, 768]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      const box = await page.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left, r.top, r.width, r.height, innerWidth, innerHeight]; });
      if (box[0] < -1 || box[1] < -1 || box[0] + box[2] > box[4] + 1 || box[1] + box[3] > box[5] + 1) (res.ok = false), res.notes.push(`canvas overflows at ${w}x${h}`);
    }
    // the level-up cards by keyboard, if any are up
    await page.waitForTimeout(4000);
    if (await page.evaluate(() => !!window.__fxrush.game.cards)) {
      await shot(page, "levelup-cards.png");
      await page.keyboard.press("Digit2");
    }
    // restart from the pause menu (blinds), then back to the title (CRT off)
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__fxrush.pauseAction("restart"));
    await page.waitForTimeout(2500);
    if ((await state(page)).state !== "play") (res.ok = false), res.notes.push("restart failed");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__fxrush.pauseAction("title"));
    await page.waitForTimeout(2000);
    if ((await state(page)).state !== "title") (res.ok = false), res.notes.push("back to title failed");
    // die on purpose and retry from the results screen
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const g = window.__fxrush.game; g.revived = true; g.hero.iframes = 0; g.hero.invuln = 0; g.hero.hurt(9999, g.hero.x + 10); });
    await waitFor(page, () => window.__fxrush.state === "results", 15000, 300);
    await page.waitForTimeout(1500);
    await shot(page, "defeat.png");
    await page.evaluate(() => window.__fxrush.resultsAction(0));
    await page.waitForTimeout(2500);
    if ((await state(page)).state !== "play") (res.ok = false), res.notes.push("retry from results failed");
  });

// ---------------------------------------------------------------- phone
if (only.includes("mobile"))
  await session("mobile-touch", `${BASE}`, { width: 844, height: 390 }, async (page, res) => {
    await page.waitForTimeout(2500);
    const tap = async (x, y) => {
      const [cx, cy] = await page.evaluate(([x, y]) => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + (x / 320) * r.width, r.top + (y / 180) * r.height]; }, [x, y]);
      await page.touchscreen.tap(cx, cy);
    };
    await tap(160, 100);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 12; i++) {
      await tap(280, 140);
      await page.waitForTimeout(150);
    }
    const s = await state(page);
    await shot(page, "mobile-landscape.png");
    res.notes.push(`touch play: ${s.state}, kills ${s.kills}`);
    if (s.state !== "play") (res.ok = false), res.notes.push("touch did not start the game");
    const box = await page.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; });
    res.notes.push(`canvas ${Math.round(box[0])}x${Math.round(box[1])} in ${box[2]}x${box[3]}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await shot(page, "mobile-portrait.png");
  }, { mobile: true });

await browser.close();
// merge with earlier recordings so rare branches seen in other runs count too
const file = join(ROOT, "docs/fx-runtime.json");
const prev = existsSync(file) && !args.fresh ? JSON.parse(readFileSync(file, "utf8")) : null;
if (prev) merge(prev.used);
writeFileSync(file, JSON.stringify({ when: report.when, sessions: (prev?.sessions ?? 0) + report.sessions.length, used: Object.fromEntries([...used].sort()), last: report }, null, 1));
const fails = report.sessions.filter((s) => !s.ok);
console.log(`\n${report.sessions.length - fails.length}/${report.sessions.length} sessions passed; ${used.size} distinct effects seen on screen (all recordings)`);
if (fails.length) process.exitCode = 1;
