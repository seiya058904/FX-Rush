// Measures how loud each sound is in the game's own effects bus, through tools/audition.html.
// Needs a running dev server and local Chrome, like tools/e2e.mjs.
//   node tools/sfx-measure.mjs synth     write the synth voices' levels to tools/sfx-levels.json
//   node tools/sfx-measure.mjs samples   compare the built samples, as the game plays them, against those levels
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEVELS = join(ROOT, "tools/sfx-levels.json");
const URL_BASE = process.env.FX_URL ?? "http://localhost:5173";
const mode = process.argv[2] ?? "synth";

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${URL_BASE}/tools/audition.html`);
await page.waitForFunction(() => window.__lab?.ready);
await page.evaluate(() => window.__lab.start());

if (mode === "synth") {
  const names = await page.evaluate(() => window.__lab.names());
  const out = {};
  for (const name of names) {
    const takes = [];
    for (let i = 0; i < 2; i++) takes.push(await page.evaluate((n) => window.__lab.measureSynth(n), name));
    out[name] = +(takes.reduce((a, b) => a + b) / takes.length).toFixed(1);
    console.log(name.padEnd(9), out[name]);
  }
  writeFileSync(LEVELS, JSON.stringify(out, null, 1) + "\n");
} else {
  const levels = JSON.parse(readFileSync(LEVELS, "utf8"));
  const names = await page.evaluate(() => window.__lab.waitForGameSamples());
  let worst = 0;
  for (const name of names) {
    const takes = [];
    for (let i = 0; i < 4; i++) takes.push(await page.evaluate((n) => window.__lab.measureGame(n), name));
    const got = takes.reduce((a, b) => a + b) / takes.length, diff = got - levels[name];
    worst = Math.max(worst, Math.abs(diff));
    console.log(name.padEnd(9), `synth ${levels[name].toFixed(1)}  sample ${got.toFixed(1)}  diff ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} dB`);
  }
  console.log(`${names.length} sounds, largest difference ${worst.toFixed(1)} dB`);
}
if (errors.length) console.log("page errors:", errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
