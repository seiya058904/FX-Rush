#!/usr/bin/env node
// End-to-end play tests in a real Chrome (playwright-core, the installed Chrome channel).
//
//   node tools/e2e.mjs [--url http://localhost:5173/] [--only afk,builds,manual,outro,mobile] [--speed 4]
//
// Sessions:
//   afk      a whole run with nobody touching anything (real damage): must reach the end, no page errors
//   builds   god-mode runs with forced builds and seeds, to drive every skill level and branch on screen
//   manual   auto mode ignores clicks; Tab switches to manual: idle hero stays put, clicks attack toward the clicked
//            side, keyboard movement and jumps; pause/resume, focus loss, window resizes, restart flows
//   outro    crossed buttons, repeated confirm keys and the pause menu during a closing transition: one navigation
//   mobile   a phone viewport (touch): tap to start, the hero fights by himself, layout fits
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
const only = args.only ? String(args.only).split(",") : ["afk", "builds", "branches", "manual", "outro", "mobile"];
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
  // a hung browser call must fail its own session, not stall the whole suite
  const limit = (opts.limit ?? 600) * 1000;
  const crashed = new Promise((_, reject) => page.once("crash", () => reject(new Error("the page crashed"))));
  crashed.catch(() => {});
  try {
    await within(Promise.race([fn(page, res), crashed]), limit, `session timed out after ${limit / 1000}s`);
  } catch (e) {
    res.ok = false;
    res.notes.push("exception: " + String(e.message).split("\n")[0]);
  }
  const u = await within(page.evaluate(() => window.__fxrush?.usedAll?.() ?? {}), 15000, "usedAll timed out").catch(() => ({}));
  merge(u);
  res.distinctFx = Object.keys(u).length;
  res.seconds = Math.round((Date.now() - t0) / 1000);
  if (errors.length) res.ok = false;
  report.sessions.push(res);
  console.log(`${res.ok ? "PASS" : "FAIL"} ${name} (${res.seconds}s, ${res.distinctFx} fx)`, res.notes.join(" | "), errors.slice(0, 3).join(" / "));
  await within(ctx.close(), 15000, "close timed out").catch(() => {});
  return res;
}
function within(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(timer));
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
const waitFor = (page, pred, ms, every = 500, arg = null) =>
  page.waitForFunction(pred, arg, { timeout: ms, polling: every });
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
    // variety: the combo bags should have dealt (nearly) every melee act, and no ultimate twice in a row
    const v = await page.evaluate(() => { const g = window.__fxrush.game; return { blows: g.hero.moveCount, ults: g.stats.moves ?? [], best: g.result?.bestHit ?? 0 }; });
    const kinds = Object.keys(v.blows).length, repeats = v.ults.filter((m, i) => i && m === v.ults[i - 1]).length;
    res.notes.push(`${kinds} melee acts used, ${new Set(v.ults).size} distinct ultimates in ${v.ults.length}, ${repeats} back-to-back repeats, best hit ${v.best}`);
    if (kinds < 10) (res.ok = false), res.notes.push("too few distinct melee acts");
    if (repeats) (res.ok = false), res.notes.push("an ultimate repeated back to back");
    await page.waitForTimeout(1800);
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
      await waitFor(page, (s) => { const g = window.__fxrush.game; return g && (g.stageIndex >= s || window.__fxrush.state === "results"); }, (130000 / SPEED) * 1.6 + 90000, 1000, b.stage).catch(() => res.notes.push("did not clear the scene in time"));
      const s = await state(page);
      res.notes.push(`stage ${s.stage} phase ${s.phase} lv ${s.lv} kills ${s.kills}`);
      if (b.seed === 11) await shot(page, "stage2-frozen-ruins.png");
      if (b.seed === 15) await shot(page, "victory.png");
    }).then(() => 0);

// ---------------------------------------------------------------- rare branches, driven directly through the QA hooks
if (only.includes("branches"))
  await session("rare-branches", `${BASE}?god&stage=3&seed=21`, { width: 1280, height: 720 }, async (page, res) => {
    await page.waitForTimeout(2000);
    const [cx, cy] = await page.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(2500);
    const T = (js, arg) => page.evaluate(js, arg);
    // a gunner spawned on top of him: it shoots (ricochets off the hero), then smoke-bombs away
    await T(() => { const t = window.__fxrush.test; t.spawn("gunner", 70); });
    await page.waitForTimeout(2500);
    await T(() => { const g = window.__fxrush.game, e = g.enemies.find((m) => m.typeId === "gunner" && !m.dead); if (e) e.x = g.hero.x + 30; });
    await page.waitForTimeout(3500);
    // the jet trooper: rocket, homing missile, then its EMP death
    await T(() => { window.__fxrush.game.trooperTest = window.__fxrush.test.spawn("trooper", 120, 6); window.__fxrush.game.hero.introT = 8; });
    await page.waitForFunction(() => (window.__fxrush.game.trooperTest?.shots ?? 0) >= 2, null, { timeout: 20000 }).catch(() => res.notes.push("trooper did not fire twice"));
    await page.waitForTimeout(1500);
    await T(() => window.__fxrush.test.kill(window.__fxrush.game.trooperTest));
    await page.waitForTimeout(1500);
    // a ghoul's claws
    await T(() => { window.__fxrush.test.spawn("ghoul", 36, 8); window.__fxrush.game.hero.introT = 3.5; });
    await page.waitForTimeout(4000);
    // every melee alternative and the fire jet, performed on cue next to the frozen hero
    for (const [type, attack] of [["brute", "eHammer"], ["brute", "eUpper"], ["brute", "flame"], ["lancer", "eSweep"], ["lancer", "eThrust"], ["reaper", "eFlurry"], ["reaper", "eScythe"], ["witch", "eWhip"], ["ghoul", "eClaw"], ["knight", "eSlash"]]) {
      await T(([t, a]) => window.__fxrush.test.attackWith(t, a), [type, attack]);
      await page.waitForTimeout(1800);
    }
    // the shield takes a hit: block, sunburst, feathers
    await T(() => window.__fxrush.test.aegisBlock());
    await page.waitForTimeout(2200);
    // low health: the healing bloom; then a death: the one-time resurrection
    await T(() => { window.__fxrush.test.god(false); window.__fxrush.test.lowHp(); });
    await page.waitForTimeout(2500);
    await T(() => window.__fxrush.test.die());
    await page.waitForTimeout(2600);
    const back = await T(() => { const g = window.__fxrush.game; g.hero.god = true; return { revived: g.revived, dead: g.hero.dead, hp: Math.round(g.hero.hp) }; });
    await page.waitForTimeout(1500);
    const s = await state(page);
    res.notes.push(`after the death: ${JSON.stringify(back)}, state ${s.state}`);
    if (!back.revived || back.dead || !(back.hp > 0) || s.state !== "play") (res.ok = false), res.notes.push("resurrection did not bring him back");
  });

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
    const k0 = s.kills;
    // auto mode (the default): clicks do nothing to the hero
    for (let i = 0; i < 6; i++) await page.mouse.click(cx, cy);
    const queued = await page.evaluate(() => window.__fxrush.game.hero.queued);
    if (queued) (res.ok = false), res.notes.push("a click reached the hero in auto mode");
    await shot(page, "fight-clicks.png");
    // walk left and right, jump (first close a level-up card screen if one is up: it pauses the world)
    const noCards = async () => {
      for (let i = 0; i < 4 && (await page.evaluate(() => !!window.__fxrush.game.cards)); i++) {
        await page.keyboard.press("Digit1");
        await page.waitForTimeout(500);
      }
      // isolate the keys from the fight: no level-ups (no XP either), no ultimate (a full RUSH meter takes over the body),
      // no knockback from hits and no slow motion while they are measured
      await page.evaluate(() => { const g = window.__fxrush.game; g.pendingLevels = 0; g.xp = -1e9; g.rushV = 0; g.hero.god = true; g.slow = null; });
    };
    // Tab: manual mode
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => window.__fxrush.game.hero.manual, undefined, { timeout: 2000 }).catch(() => {});
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem("fxrush.settings") ?? "{}").mode);
    if (mode !== "manual") (res.ok = false), res.notes.push(`Tab did not switch to manual (mode ${mode})`);
    await noCards();
    // left alone, the hero neither walks nor cuts
    const idle0 = await page.evaluate(() => { const h = window.__fxrush.game.hero; return { x: h.x, n: Object.values(h.moveCount).reduce((a, b) => a + b, 0) }; });
    await page.waitForTimeout(1200);
    const idle1 = await page.evaluate(() => { const h = window.__fxrush.game.hero; return { x: h.x, n: Object.values(h.moveCount).reduce((a, b) => a + b, 0) }; });
    res.notes.push(`manual idle: moved ${Math.round(idle1.x - idle0.x)}px, ${idle1.n - idle0.n} blows`);
    if (Math.abs(idle1.x - idle0.x) > 4 || idle1.n !== idle0.n) (res.ok = false), res.notes.push("the hero acted on his own in manual mode");
    // a click attacks toward the clicked side
    const sideClick = async (dx) => {
      const hx = await page.evaluate(() => { const g = window.__fxrush.game; return g.hero.x - g.camX; });
      const [px, py] = await canvasPoint(Math.max(4, Math.min(316, hx + dx)), 110);
      const n0 = await page.evaluate(() => Object.values(window.__fxrush.game.hero.moveCount).reduce((a, b) => a + b, 0));
      await page.mouse.click(px, py);
      await page.waitForTimeout(250);
      return page.evaluate((n0) => { const h = window.__fxrush.game.hero; return { blows: Object.values(h.moveCount).reduce((a, b) => a + b, 0) - n0, facing: h.facing }; }, n0);
    };
    const right = await sideClick(70);
    await page.waitForTimeout(500);
    const left = await sideClick(-70);
    res.notes.push(`click right: ${right.blows} blow facing ${right.facing}; click left: ${left.blows} blow facing ${left.facing}`);
    if (!(right.blows >= 1 && right.facing === 1 && left.blows >= 1 && left.facing === -1)) (res.ok = false), res.notes.push("manual clicks did not attack toward the clicked side");
    await noCards();
    const x0 = await page.evaluate(() => window.__fxrush.game.hero.x);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyD");
    const x1 = await page.evaluate(() => window.__fxrush.game.hero.x);
    await noCards();
    const x1b = await page.evaluate(() => window.__fxrush.game.hero.x);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowLeft");
    const x2 = await page.evaluate(() => window.__fxrush.game.hero.x);
    await noCards();
    await page.keyboard.press("Space");
    await page.waitForTimeout(160);
    const air = await page.evaluate(() => window.__fxrush.game.hero.y);
    res.notes.push(`move D ${Math.round(x1 - x0)}px, Left ${Math.round(x2 - x1b)}px, jump y ${Math.round(air)}`);
    if (!(x1 - x0 > 20 && x2 - x1b < -20 && air < -10)) (res.ok = false), res.notes.push("movement/jump did not respond");
    await page.evaluate(() => { const g = window.__fxrush.game; g.hero.god = false; g.xp = 0; });
    // Tab again: back to auto, and the hero takes over
    await page.keyboard.press("Tab");
    await page.waitForTimeout(3000);
    s = await state(page);
    if (s.kills <= k0) (res.ok = false), res.notes.push("no kills after handing back to auto mode");
    // pause with Esc; nothing moves while paused; resume
    await page.keyboard.press("Escape");
    const p0 = await page.evaluate(() => window.__fxrush.game.stageT);
    await page.waitForTimeout(1200);
    const p1 = await page.evaluate(() => window.__fxrush.game.stageT);
    await shot(page, "pause.png");
    if (Math.abs(p1 - p0) > 0.001 || (await state(page)).state !== "pause") (res.ok = false), res.notes.push("pause did not freeze the game");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
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

// ---------------------------------------------------------------- a closing transition navigates once, however often it's asked
if (only.includes("outro"))
  await session("outro-navigates-once", `${BASE}?seed=7`, { width: 1280, height: 720 }, async (page, res) => {
    await waitFor(page, () => window.__fxrush.state === "title" && window.__fxrush.loadStats().loaded > 30, 30000, 200);
    // every screen and run the page goes through, read once a frame
    await page.evaluate(() => {
      const f = window.__fxrush, ids = new Map();
      const now = () => {
        if (f.game && !ids.has(f.game)) ids.set(f.game, ids.size);
        return `${f.state}#${f.game ? ids.get(f.game) : "-"}`;
      };
      window.__navMark = () => (window.__nav = [now()]);
      window.__navMark();
      const watch = () => {
        requestAnimationFrame(watch);
        const n = now();
        if (window.__nav.at(-1) !== n) window.__nav.push(n);
      };
      watch();
    });
    const click = async (x, y) => {
      const [cx, cy] = await page.evaluate(([x, y]) => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + (x / 320) * r.width, r.top + (y / 180) * r.height]; }, [x, y]);
      await page.mouse.click(cx, cy);
    };
    // inputs of one frame are one decision; this lets the first start its transition before the second arrives
    const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const toResults = async () => {
      await page.evaluate(() => { const f = window.__fxrush; f.start(7); f.game.revived = true; f.test.die(); });
      await waitFor(page, () => window.__fxrush.state === "results", 15000, 100);
      await page.waitForTimeout(1300);
    };
    const toPause = async () => {
      await page.evaluate(() => window.__fxrush.start(7));
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => window.__fxrush.state === "pause", undefined, { timeout: 3000 });
    };
    const RETRY = [119, 150], LEAVE = [201, 150], MENU_RESTART = [160, 65], MENU_TITLE = [160, 161];
    // what is asked in one go; the screen it must end on; how many new runs may appear on the way
    const cases = [
      ["single retry click", toResults, async () => { await click(...RETRY); }, "play", 1],
      ["single leave click", toResults, async () => { await click(...LEAVE); }, "title", 0],
      ["retry then leave", toResults, async () => { await click(...RETRY); await frames(); await click(...LEAVE); }, "play", 1],
      ["leave then retry", toResults, async () => { await click(...LEAVE); await frames(); await click(...RETRY); }, "title", 0],
      ["confirm key twice", toResults, async () => { await page.keyboard.press("Enter"); await frames(); await page.keyboard.press("Enter"); }, "play", 1],
      ["leave, then confirm key", toResults, async () => { await click(...LEAVE); await frames(); await page.keyboard.press("Enter"); }, "title", 0],
      ["pause menu: single restart", toPause, async () => { await click(...MENU_RESTART); }, "play", 1],
      ["pause menu: restart twice", toPause, async () => { await click(...MENU_RESTART); await frames(); await click(...MENU_RESTART); }, "play", 1],
      ["pause menu: restart then title", toPause, async () => { await click(...MENU_RESTART); await frames(); await click(...MENU_TITLE); }, "play", 1],
      ["pause menu: title, then Esc", toPause, async () => { await click(...MENU_TITLE); await frames(); await page.keyboard.press("Escape"); }, "title", 0],
    ];
    for (const [name, setup, ask, end, runs] of cases) {
      await setup();
      await page.evaluate(() => window.__navMark());
      await ask();
      await page.waitForTimeout(2600);
      const nav = await page.evaluate(() => window.__nav);
      const run0 = nav[0].split("#")[1];
      const created = new Set(nav.map((n) => n.split("#")[1]).filter((id) => id !== "-" && id !== run0)).size;
      const screens = nav.map((n) => n.split("#")[0]);
      // the run being left must not come back to life on the way out, and no screen may flash past
      const revived = nav.slice(1).includes(`play#${run0}`);
      const bad = screens.at(-1) !== end || created !== runs || revived || (end === "play" && screens.includes("title"));
      res.notes.push(`${bad ? "BAD" : "ok"} ${name}: ${nav.join(" > ")}`);
      if (bad) res.ok = false;
    }
  }, { limit: 180 });

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
    await page.waitForTimeout(1800);
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
