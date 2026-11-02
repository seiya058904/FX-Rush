#!/usr/bin/env node
// Drive the game in a real Chrome and take screenshots: a quick visual check from the terminal.
//
//   node tools/shot.mjs --url http://localhost:5173/ --out output/shots --steps "wait:2500,shot:title,click,wait:4000,shot:fight"
//
// Steps: wait:MS | shot:NAME | click | click:X,Y (logical px) | key:CODE | hold:CODE:MS | eval:JS | state (prints game state)
// Options: --size WxH (default 1280x720), --mobile (390x844 touch, landscape if --land), --cpu N (CPU throttle)

import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc), []));
const url = args.url ?? "http://localhost:5173/";
const out = args.out ?? "output/shots";
mkdirSync(out, { recursive: true });
const [w, h] = (args.size ?? "1280x720").split("x").map(Number);
const mobile = !!args.mobile;

const browser = await chromium.launch({ channel: "chrome", headless: !args.headed, args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const ctx = await browser.newContext(
  mobile
    ? { viewport: args.land ? { width: 844, height: 390 } : { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: w, height: h } },
);
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}`));
if (args.cpu) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: +args.cpu });
}
await page.goto(url, { waitUntil: "load" });

const toClient = async (x, y) =>
  page.evaluate(([x, y]) => {
    const c = document.getElementById("game"), r = c.getBoundingClientRect();
    return [r.left + (x / 320) * r.width, r.top + (y / 180) * r.height];
  }, [x, y]);

try {
for (const step of (args.steps ?? "wait:2000,shot:screen").split(",")) {
  const [cmd, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (cmd === "wait") await page.waitForTimeout(+arg);
  else if (cmd === "shot") {
    await page.screenshot({ path: join(out, `${arg}.png`) });
    console.log("shot", join(out, `${arg}.png`));
  } else if (cmd === "click") {
    const [x, y] = arg ? arg.split(";").map(Number) : [160, 90];
    const [cx, cy] = await toClient(x, y);
    if (mobile) await page.touchscreen.tap(cx, cy);
    else await page.mouse.click(cx, cy);
  } else if (cmd === "clicks") {
    const [n, gap] = arg.split(";").map(Number);
    const [cx, cy] = await toClient(200, 100);
    for (let i = 0; i < n; i++) {
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(gap);
    }
  } else if (cmd === "key") await page.keyboard.press(arg);
  else if (cmd === "hold") {
    const [code, ms] = arg.split(";");
    await page.keyboard.down(code);
    await page.waitForTimeout(+ms);
    await page.keyboard.up(code);
  } else if (cmd === "eval") console.log("eval", await page.evaluate(arg));
  else if (cmd === "evalfile") console.log("eval", await page.evaluate(readFileSync(arg, "utf8")));
  else if (cmd === "state")
    console.log(
      "state",
      JSON.stringify(
        await page.evaluate(() => {
          const f = window.__fxrush, g = f.game;
          return g ? { state: f.state, fps: f.fps, ms: +f.frameMs.toFixed(2), q: f.quality, stage: g.stageIndex, phase: g.phase, t: +g.stageT.toFixed(1), lv: g.level, hp: Math.round(g.hero.hp), enemies: g.enemies.length, fx: g.fx.count, kills: g.stats.kills, combo: g.combo.best, rush: Math.round(g.rushV), skills: g.skills.lv, used: g.fx.used.size, dropped: g.fx.dropped } : { state: f.state, fps: f.fps };
        }),
      ),
    );
}
} catch (e) {
  console.log("step failed:", String(e.message).split("\n")[0]);
} finally {
  if (logs.length) console.log("console:\n" + logs.slice(0, 30).join("\n"));
  await browser.close();
}
