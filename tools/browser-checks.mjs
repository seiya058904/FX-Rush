// Fast regressions on real input and rendered controls. Run after `npm run build`.
// Dev modules expose state for precise assertions; chunk failures exercise the production build.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, preview } from "vite";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
assert.ok(existsSync(`${root}/dist/index.html`), "Run npm run build before npm run test:browser");
let dev, prod, browser;
let passed = 0;
const frame = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const logical = (p, x, y) => p.evaluate(([x, y]) => {
  const b = document.querySelector("canvas").getBoundingClientRect();
  return [b.x + x * b.width / 320, b.y + y * b.height / 180];
}, [x, y]);
const click = async (p, x, y) => { await p.mouse.click(...await logical(p, x, y)); await frame(p); };
const start = async (p, url) => {
  await p.goto(url);
  await p.waitForFunction(() => window.__fxrush?.state === "title");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => window.__fxrush.state === "play");
  await p.evaluate(() => window.__fxrush.setGod(true));
};
async function check(name, opts, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && m.text().includes("frame error")) errors.push(m.text()); });
  try {
    await run(page);
    assert.deepEqual(errors, [], "no application errors");
    console.log(`PASS ${name}`);
    passed++;
  } finally { await context.close(); }
}
try {
  dev = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  await dev.listen();
  prod = await preview({ root, preview: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  const devUrl = `http://127.0.0.1:${dev.httpServer.address().port}/`;
  const prodUrl = `http://127.0.0.1:${prod.httpServer.address().port}/`;
  browser = await chromium.launch({ ...(process.env.CI ? {} : { channel: "chrome" }), headless: true });

  await check("screen boundaries discard old presses; keyboard owns card focus", {}, async (p) => {
    await p.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 10 }));
    await start(p, devUrl);
    assert.equal(await p.locator(".touch-pause").isVisible(), false, "touch capability alone must not replace mouse/keyboard UI");
    await p.evaluate(() => { window.__originalRun = window.__fxrush.game; });
    await p.keyboard.press("Tab");
    await p.keyboard.press("KeyD"); await frame(p);
    await p.keyboard.press("KeyD"); await frame(p);
    await p.keyboard.press("Escape"); await frame(p);
    await p.keyboard.press("Enter"); await frame(p);
    assert.equal(await p.evaluate(() => window.__fxrush.state === "play" && window.__fxrush.game === window.__originalRun), true, "Enter resumes the same run");
    await p.keyboard.down("KeyD");
    await p.keyboard.press("Escape"); await frame(p);
    await p.keyboard.up("KeyD");
    await p.keyboard.press("Escape"); await frame(p);
    assert.equal(await p.evaluate(async () => (await import("/src/engine/input.js")).input.held("right")), false, "keyup while paused releases movement");
    await p.keyboard.press("Digit2"); await frame(p);
    await p.evaluate(() => window.__fxrush.game.openCards()); await frame(p);
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards.chosen), -1, "a pre-card key does not choose");
    await p.mouse.move(...await logical(p, 50, 90)); await frame(p);
    await p.keyboard.press("ArrowRight"); await frame(p);
    await p.keyboard.press("ArrowRight"); await frame(p);
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards.hover), 2, "stationary mouse cannot overwrite keyboard focus");
    await p.keyboard.press("Enter"); await frame(p);
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards.chosen), 2);
  });

  await check("pause during selection; auto-pick changes apply to the open cards", {}, async (p) => {
    await start(p, devUrl);
    await p.evaluate(() => window.__fxrush.game.openCards());
    await click(p, 310, 42);
    assert.equal(await p.evaluate(() => window.__fxrush.state), "pause");
    await p.evaluate(() => window.__fxrush.pauseAction("autoPick"));
    await p.keyboard.press("Escape"); await frame(p);
    await p.waitForTimeout(6300);
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards.chosen), -1, "turning auto-pick off stops this countdown");
    await p.keyboard.press("Escape"); await frame(p);
    await p.evaluate(() => window.__fxrush.pauseAction("autoPick"));
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards.t), 0, "turning it on grants six new seconds");
    await p.keyboard.press("Escape"); await frame(p);
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards.chosen), -1);
  });

  await check("flash setting gates new and already-running impact frames", {}, async (p) => {
    await start(p, devUrl);
    await p.waitForFunction(() => window.__fxrush.loadStats().loaded >= 244);
    const before = await p.evaluate(() => {
      const g = window.__fxrush.game;
      g.cards = null; g.hero.act = null; g.hero.moveOverride = null; g.hero.onGround = true; g.rushV = 100;
      for (const dx of [-25, 25, 45]) g.testSpawn("slime", dx, 10).spawning = 0;
      g.tryUltimate();
      window.__fxrush.pause();
      return !!g.hero.moveOverride && g.fx.list.some((h) => h.id === "impacts/impact-frame" && h.alive);
    });
    assert.equal(before, true, "default presentation still uses the effect");
    await p.evaluate(() => window.__fxrush.pauseAction("flashes")); await frame(p);
    assert.equal(await p.evaluate(() => {
      const g = window.__fxrush.game;
      g.flashScreen(.3);
      return !g.screenFlash && !g.fx.list.some((h) => h.id === "impacts/impact-frame" && h.alive)
        && g.fx.play("impacts/impact-frame", { screen: true }) === null;
    }), true);
  });

  await check("production critical chunk failure blocks play and reload recovers", {}, async (p) => {
    let blocked = 0;
    await p.route("**/assets/pfx-melee-*.js", (route) => { blocked++; return route.abort(); });
    await p.goto(prodUrl);
    await p.waitForFunction(() => window.__fxrush?.state === "load-error");
    assert.ok(blocked > 0);
    assert.equal(await p.evaluate(() => window.__fxrush.coreProgress().ready), false);
    // Other resources arriving cannot make a missing core resource count as ready.
    await p.evaluate(() => window.__fxrush.start(7));
    await click(p, 60, 100);
    assert.equal(await p.evaluate(() => window.__fxrush.game), null);
    await p.unroute("**/assets/pfx-melee-*.js");
    await p.getByRole("button", { name: "重新加载", exact: true }).click();
    await p.waitForFunction(() => window.__fxrush?.state === "title");
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => window.__fxrush.state === "play" && Object.keys(window.__fxrush.game.hero.moveCount).length > 0);
  });

  await check("production decorative chunk failure does not block play", {}, async (p) => {
    let blocked = 0;
    await p.route(/\/assets\/pfx-(water|weather)-[^/]+\.js$/, (route) => { blocked++; return route.abort(); });
    await start(p, prodUrl);
    await p.waitForFunction(() => window.__fxrush.loadStats().failed.some(([id]) => id.startsWith("water/")));
    assert.ok(blocked > 0);
    assert.equal(await p.evaluate(() => window.__fxrush.coreProgress().ready), true);
    assert.equal(await p.evaluate(() => window.__fxrush.state), "play");
  });

  await check("production slow critical chunk cannot be replaced by optional load counts", {}, async (p) => {
    let release;
    const ready = new Promise((resolve) => { release = resolve; });
    await p.route("**/assets/pfx-melee-*.js", async (route) => { await ready; await route.continue(); });
    try {
      await p.goto(prodUrl);
      await p.waitForFunction(() => window.__fxrush?.loadStats().loaded > window.__fxrush?.coreProgress().total);
      assert.equal(await p.evaluate(() => window.__fxrush.state), "loading");
      assert.equal(await p.evaluate(() => window.__fxrush.coreProgress().ready), false);
      await p.keyboard.press("Enter"); await frame(p);
      assert.equal(await p.evaluate(() => window.__fxrush.game), null);
      release();
      await p.waitForFunction(() => window.__fxrush.state === "title");
    } finally { release(); }
  });

  await check("portrait and landscape touch: readable choices, pause, settings, continue", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (p) => {
    await p.goto(devUrl);
    await p.waitForFunction(() => window.__fxrush?.state === "title");
    await p.touchscreen.tap(...await logical(p, 160, 100));
    await p.waitForFunction(() => window.__fxrush.state === "play");
    await p.evaluate(() => { window.__fxrush.setGod(true); window.__originalRun = window.__fxrush.game; window.__fxrush.game.openCards(); });
    const cards = p.locator(".touch-choice");
    await cards.first().waitFor({ state: "visible" });
    assert.equal(await cards.count(), 3);
    const measurements = await cards.evaluateAll((bs) => bs.map((b) => ({ height: b.getBoundingClientRect().height, font: parseFloat(getComputedStyle(b).fontSize) })));
    assert.ok(measurements.every((b) => b.height >= 44 && b.font >= 16));
    await p.locator(".choice-countdown").tap();
    await p.getByRole("button", { name: "暂停", exact: true }).tap();
    await p.getByRole("button", { name: "游戏设置", exact: true }).tap();
    await p.getByRole("button", { name: "闪光：开", exact: true }).tap();
    await p.getByRole("button", { name: "闪光：关", exact: true }).waitFor();
    await p.keyboard.press("KeyM");
    await p.getByRole("button", { name: "声音：静音", exact: true }).waitFor();
    await p.keyboard.press("KeyM");
    await p.setViewportSize({ width: 844, height: 390 });
    await p.getByRole("button", { name: "返回暂停菜单", exact: true }).tap();
    await p.getByRole("button", { name: "继续游戏", exact: true }).waitFor();
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "settings", "return to the settings entry");
    await p.getByRole("button", { name: "继续游戏", exact: true }).focus();
    await p.keyboard.press("ArrowDown");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "mode");
    await p.keyboard.press("ArrowUp");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "resume");
    await p.getByRole("button", { name: "继续游戏", exact: true }).tap();
    await p.waitForFunction(() => window.__fxrush.state === "play");
    assert.equal(await p.evaluate(() => window.__fxrush.game === window.__originalRun), true);
    await p.setViewportSize({ width: 390, height: 844 });
    await cards.nth(1).tap();
    await p.waitForFunction(() => !window.__fxrush.game.cards);
    assert.equal(await p.evaluate(() => window.__fxrush.game.skills.order.length), 1);
    // Compact portrait keeps the panel scrollable and the last option reachable.
    await p.setViewportSize({ width: 320, height: 480 });
    await p.evaluate(() => window.__fxrush.game.openCards());
    await p.waitForFunction(() => {
      const panel = document.querySelector(".touch-cards");
      return panel && panel.scrollHeight > panel.clientHeight;
    });
    // A real touch drag must scroll, not just Playwright's automatic scroll-into-view.
    const box = await p.locator(".touch-cards").boundingBox();
    const cdp = await p.context().newCDPSession(p);
    const x = box.x + box.width / 2, y = box.y + box.height - 20;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - (box.height - 40) * i / 6 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p.waitForFunction(() => document.querySelector(".touch-cards").scrollTop > 20);
    await cdp.detach();
    await cards.nth(2).tap();
    await p.waitForFunction(() => !window.__fxrush.game.cards);
  });
  await check("desktop build preserves the open choice, full result and keyboard focus", {}, async (p) => {
    await start(p, devUrl);
    await p.evaluate(() => {
      const g = window.__fxrush.game;
      for (const id of ["blade", "chain", "inferno", "frost", "missile", "aegis"]) g.skills.add(id);
      for (let i = 0; i < 4; i++) g.skills.add("blade");
      g.skills.add("might"); g.skills.add("might");
      g.openCards(); window.__cards = g.cards;
    });
    await p.keyboard.press("Escape"); await frame(p);
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    await p.getByRole("heading", { name: "本局构筑", exact: true }).waitFor();
    assert.equal(await p.locator(".build-list details").count(), 6);
    assert.match(await p.locator('[data-stat="might"]').innerText(), /力量 ×2/);
    await p.locator('[data-skill="blade"] summary').click();
    assert.equal(await p.locator('[data-skill="blade"] li').count(), 5);
    assert.match(await p.locator('[data-skill="blade"]').innerText(), /巨型死神镰刃/);
    await p.getByRole("button", { name: "返回暂停菜单", exact: true }).focus();
    await p.keyboard.press("Shift+Tab");
    assert.equal(await p.evaluate(() => document.activeElement.closest("details")?.dataset.skill), "aegis");
    await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "back");
    await p.keyboard.press("Escape"); await frame(p);
    assert.equal(await p.evaluate(() => document.activeElement.id), "game");
    assert.equal(await p.evaluate(() => window.__fxrush.state), "pause");
    await p.keyboard.press("Escape"); await frame(p);
    assert.equal(await p.evaluate(() => window.__fxrush.game.cards === window.__cards), true);
    await p.evaluate(() => window.__fxrush.game.end(false));
    await p.waitForFunction(() => window.__fxrush.state === "results");
    await p.waitForTimeout(1100);
    await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("Enter");
    await p.getByRole("button", { name: "返回结算", exact: true }).waitFor();
    assert.match(await p.locator('[data-stat="might"]').innerText(), /力量 ×2/);
    await p.keyboard.press("Escape"); await frame(p);
    await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.keyboard.press("Enter");
    await p.waitForFunction(() => window.__fxrush.state === "play" && window.__fxrush.game.level === 1);
    assert.deepEqual(await p.evaluate(() => window.__fxrush.game.skills.statLv), {});
  });

  await check("touch dialogs keep focus; portrait results stay readable through rotation and restart", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (p) => {
    await start(p, devUrl);
    await p.getByRole("button", { name: "暂停", exact: true }).tap();
    await p.keyboard.press("Shift+Tab");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "title");
    await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "resume");
    assert.equal(await p.locator("#game").evaluate((c) => c.inert), true);
    await p.getByRole("button", { name: "游戏设置", exact: true }).tap();
    await p.keyboard.press("Shift+Tab");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "mute");
    await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => document.activeElement.dataset.action), "back");
    await p.keyboard.press("Escape"); await frame(p);
    await p.getByRole("button", { name: "继续游戏", exact: true }).tap();
    await p.evaluate(() => {
      const g = window.__fxrush.game; g.skills.add("frost"); g.skills.add("vigor"); g.end(true);
      window.__result = g.result;
    });
    const retry = p.getByRole("button", { name: "再来一次", exact: true });
    await retry.waitFor();
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 480 }]) {
      await p.setViewportSize(viewport); await frame(p);
      const sizes = await p.locator(".results-actions button").evaluateAll((bs) => bs.map((b) => ({ h: b.getBoundingClientRect().height, font: parseFloat(getComputedStyle(b).fontSize) })));
      assert.ok(sizes.every((s) => s.h >= 48 && s.font >= 16));
      assert.equal(await p.evaluate(() => window.__fxrush.game.result === window.__result), true);
    }
    await p.getByRole("button", { name: "本局构筑", exact: true }).tap();
    assert.match(await p.locator('[data-stat="vigor"]').innerText(), /活力 ×1/);
    await p.getByRole("button", { name: "返回结算", exact: true }).tap();
    await retry.tap();
    await p.evaluate(() => window.__fxrush.resultsAction(1)); // crossed action during the closing transition
    await p.waitForFunction(() => window.__fxrush.state === "play" && !window.__fxrush.game.result);
    assert.equal(await p.locator("#game").evaluate((c) => c.inert), false);
  });

  await check("production missing fire chunk keeps hostile projectiles visible and damaging", {}, async (p) => {
    await p.route("**/assets/pfx-fire-*.js", (route) => route.abort());
    await start(p, prodUrl);
    await p.evaluate(() => {
      const f = window.__fxrush, g = f.game; f.pause();
      Object.assign(g.hero, { x: 100, y: 0, hp: 100, god: false, iframes: 0, invuln: 0 });
      const e = g.testSpawn("skull", 80, 1);
      Object.assign(e, { x: 180, y: -18, cy: 0, spawning: 0 });
      g.enemyShoot(e);
      window.__shot = g.projectiles.at(-1);
    });
    await p.waitForFunction(() => window.__fxrush.loadStats().failed.some(([id]) => id === "fire/fireball"));
    const result = await p.evaluate(() => {
      const g = window.__fxrush.game, shot = window.__shot;
      // Isolate the shot from the opening full-screen wipe and screen shake.
      g.fx.list = g.fx.list.filter((h) => !h.screen); g.shakeT = 0;
      const ctx = document.querySelector("#game").getContext("2d");
      g.projectiles = []; g.draw(ctx);
      const x = Math.round(shot.x - g.camX), y = Math.round(150 + shot.y);
      const before = [...ctx.getImageData(x, y, 1, 1).data];
      g.projectiles = [shot]; g.draw(ctx);
      const after = [...ctx.getImageData(x, y, 1, 1).data];
      for (let i = 0; i < 120 && !shot.dead; i++) shot.update(1 / 60);
      return { noEffect: !shot.handle, before, after, hp: g.hero.hp, dead: shot.dead };
    });
    assert.equal(result.noEffect, true);
    assert.notDeepEqual(result.before, result.after, "the rendered collision point has a fallback marker");
    assert.equal(result.hp, 91);
    assert.equal(result.dead, true);
  });
  console.log(`${passed}/${passed} browser checks passed`);
} finally {
  await browser?.close();
  await dev?.close();
  if (prod) await new Promise((resolve) => prod.httpServer.close(resolve));
}
