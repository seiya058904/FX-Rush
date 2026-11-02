// FX Rush: boot, the loop, and the screens around a run.

import { W, H, STEP, MAX_FRAME, DEV } from "./config.js";
import { canvas, ctx, view } from "./engine/screen.js";
import { input, pointer, idleFor } from "./engine/input.js";
import { loadFonts, drawText } from "./engine/text.js";
import { initAudio, sfx, toggleMute, playMusic, setVolume, audioSettings, suspendAudio } from "./engine/audio.js";
import { preload, loadStats, makeFx, fxModule, beginFrame, endFrame, setCamera, image, frame, ALL_IDS, extraUsed } from "./engine/pfx.js";
import { Game } from "./game/game.js";
import { Director } from "./fx/director.js";
import { RAMPS } from "./fx/palettes.js";
import { drawHud, drawFloats, drawBanner, drawFlash, drawCards, cardRect } from "./render/hud.js";
import { drawTitle, drawPause, PAUSE_ITEMS, pauseRect, drawResults, resultsButton } from "./render/screens.js";
import { scene, drawBackground, shadowAt } from "./render/background.js";
import { drawRig, SKINS } from "./game/rig.js";
import { ActPlayer } from "./game/moves.js";
import { settings, saveSettings } from "./settings.js";
import { READY, poseAt } from "./engine/pfx.js";
import { M, FLOOR } from "./config.js";
import { FX } from "./fx/registry.gen.js";

const params = new URLSearchParams(location.search);
const TEST = { speed: Math.max(1, Math.min(8, +(params.get("speed") ?? 1))), god: params.has("god"), seed: +(params.get("seed") ?? 0) || null, auto: params.has("auto"), stage: +(params.get("stage") ?? 1), build: Object.fromEntries((params.get("build") ?? "").split(",").filter(Boolean).map((s) => [s.split(":")[0], +(s.split(":")[1] ?? 1)])) };

let state = "loading";
let game = null;
let pauseSel = 0;
let resultsT = 0;
let resultsSel = 0;
let fps = 60;
let quality = 2;
let showFps = settings.showFps;

// ---- what the first seconds need: the hero's blows, the first scene, hit feedback, UI
const CORE = [
  "melee/sword-slash", "melee/double-slash", "melee/heavy-cleave", "melee/thrust", "melee/spin-slash",
  "impacts/hit-spark", "impacts/crit-hit", "impacts/blunt-hit", "impacts/ground-slam", "impacts/heavy-landing", "impacts/hit-flash", "impacts/impact-frame",
  "critters/slime", "critters/bat", "critters/flying-skull", "spawn/poof", "spawn/dissolve-burn", "spawn/respawn-beam", "spawn/spawn-portal",
  "ui/damage-number", "ui/crit-number", "ui/level-up", "ui/combo-counter", "pickups/collect-burst",
  "transitions/slash-wipe", "transitions/pixel-dissolve", "fire/brazier", "fire/torch", "weather/fireflies", "weather/clouds",
  "ice/frost-nova", "fire/fire-ring", "lightning/lightning-strike", "holy/smite", "arcane/mana-burst", "melee/scythe-reap",
];

// ---- the title: the hero shows off in front of the logo
const title = { fx: new Director(), act: null, t: 0, next: 0.6, i: 0, x: 140 };
const SHOW = ["melee/sword-slash", "melee/spin-slash", "melee/double-slash", "melee/heavy-cleave", "melee/thrust"];
const SHOW_FX = [
  ["ice/frost-nova", RAMPS.frost, 0], ["fire/fire-ring", RAMPS.fire, 0], ["lightning/lightning-strike", RAMPS.volt, 70],
  ["holy/smite", RAMPS.holy, 70], ["arcane/mana-burst", RAMPS.arcane, 60],
];
function updateTitle(dt) {
  title.t += dt;
  title.next -= dt;
  if (title.next <= 0) {
    title.next = 1.5;
    const id = SHOW[title.i % SHOW.length], mod = fxModule(id);
    if (mod) title.act = new ActPlayer(mod, { id, rate: 1.2, from: -0.35, x: title.x, facing: 1, director: title.fx, fx: { palette: RAMPS.hero }, onStart: () => sfx("swing"), onHit: () => sfx("hit", { w: 0.6 }) });
    const [fid, pal, dx] = SHOW_FX[title.i % SHOW_FX.length];
    if (title.i % 2 === 1) title.fx.play(fid, { x: title.x + dx, y: 0, palette: pal, prio: 1, layer: "split", life: 2 });
    title.i++;
  }
  if (title.act) {
    title.act.update(dt);
    if (title.act.done) title.act = null;
  }
  title.fx.camX = 0;
  title.fx.update(dt, dt);
}
const IDLE = { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 };
function drawTitleScene(t) {
  const S = scene("title");
  setCamera(0);
  drawBackground(S, t * 12, t, 1 / 60, quality);
  shadowAt(title.act ? title.act.rootX : title.x, 0, 0, 10);
  beginFrame();
  title.fx.draw("ground");
  title.fx.draw("back");
  const pose = title.act ? title.act.pose : { ...IDLE, crouch: (Math.floor(t * 3) & 1) + 3 };
  drawRig(pose, title.act ? title.act.rootX : title.x, 0, false, SKINS.hero, { glow: title.act ? 1 : 0.2 });
  title.fx.draw("front");
  title.fx.draw("top");
  endFrame();
  ctx.putImageData(image, -M, -M);
}

// fireflies drifting over the ruins on the title
function titleAmbience() {
  title.fx.play("weather/fireflies", { x: 160, y: 170, screen: true, layer: "back", prio: 3, life: 1e9, every: 2, light: 0.8,
    palette: ["#04060e", "#0a2030", "#145060", "#2aa0a0", "#7af0d0", "#e0fff0"], grass: ["#0a1020", "#101a2e", "#182640"] });
}

// ---- boot
async function boot() {
  await loadFonts();
  const total = CORE.length;
  let done = 0;
  await Promise.all(CORE.map((id) => preload([id]).then(() => done++)));
  state = "title";
  titleAmbience();
  // the title assembles out of pixels
  title.fx.play("transitions/pixel-dissolve", { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" })?.inst.update(FX["transitions/pixel-dissolve"].duration * 0.5);
  if (TEST.auto) startRun();
  // the rest of the library streams in while the player is on the title
  setTimeout(() => preload(ALL_IDS), 1500);
  void total;
}

// every effect id that reached the screen in this page's life (all runs, the title too), for the tests
const usedEver = new Map();
const keepUsed = (d) => d && d.used.forEach((n, id) => usedEver.set(id, (usedEver.get(id) ?? 0) + n)) && d.used.clear();
function startRun() {
  initAudio();
  keepUsed(game?.fx);
  game = new Game();
  game.fx.quality = quality;
  game.start(TEST.seed ?? undefined, TEST);
  if (TEST.god) game.hero.god = true;
  state = "play";
  // the title is cut away by a blade
  game.fx.play("transitions/slash-wipe", { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" })?.inst.update(FX["transitions/slash-wipe"].duration * 0.5);
}

// ---- input routing per screen
function handleInput() {
  if (input.take("mute")) toggleMute();
  if (input.take("debug")) showFps = !showFps;
  const clicks = input.takeClicks();
  if (state === "title") {
    const any = clicks.length || input.take("attack") || input.take("confirm") || input.take("jump");
    if (any && loadStats().loaded >= CORE.length) {
      initAudio();
      sfx("select");
      startRun();
    }
    input.clear();
    return;
  }
  if (state === "play") {
    if (input.take("pause")) return pause();
    const g = game;
    if (g.cards) {
      const cs = g.cards;
      cs.hover = -1;
      for (let i = 0; i < cs.list.length; i++) {
        const [x, y, w, h] = cardRect(i);
        if (pointer.x >= x && pointer.x < x + w && pointer.y >= y && pointer.y < y + h) cs.hover = i;
      }
      for (const k of [1, 2, 3]) if (input.take("pick" + k)) g.chooseCard(k - 1);
      if (input.take("left")) cs.hover = Math.max(0, (cs.kb ?? 1) - 1), (cs.kb = cs.hover);
      if (input.take("right")) cs.hover = Math.min(cs.list.length - 1, (cs.kb ?? 1) + 1), (cs.kb = cs.hover);
      if (cs.kb !== undefined && cs.hover < 0) cs.hover = cs.kb;
      if (input.take("confirm") && cs.hover >= 0) g.chooseCard(cs.hover);
      for (const c of clicks)
        for (let i = 0; i < cs.list.length; i++) {
          const [x, y, w, h] = cardRect(i);
          if (c.x >= x && c.x < x + w && c.y >= y && c.y < y + h) g.chooseCard(i);
        }
      // idle play: the game picks after a few seconds
      if ((cs.auto || TEST.auto) && cs.chosen < 0 && cs.t > (TEST.auto ? 0.6 : 6)) g.chooseCard(bestCard(g));
      input.clear("attack");
      return;
    }
    let attack = input.take("attack");
    for (const c of clicks) {
      if (c.x > W - 22 && c.y < 46) return pause();
      attack = true;
    }
    if (attack) game.hero.click();
    return;
  }
  if (state === "pause") {
    if (input.take("pause")) return resume();
    if (input.take("jump") || input.take("left")) pauseSel = (pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
    if (input.take("down") || input.take("right")) pauseSel = (pauseSel + 1) % PAUSE_ITEMS.length;
    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      const [x, y, w, h] = pauseRect(i);
      if (pointer.moved && pointer.x >= x && pointer.x < x + w && pointer.y >= y - 1 && pointer.y < y + h) pauseSel = i;
    }
    pointer.moved = false;
    let act = input.take("confirm") || input.take("attack");
    for (const c of clicks) {
      for (let i = 0; i < PAUSE_ITEMS.length; i++) {
        const [x, y, w, h] = pauseRect(i);
        if (c.x >= x && c.x < x + w && c.y >= y - 1 && c.y < y + h) (pauseSel = i), (act = true);
      }
    }
    if (act) pauseAction(PAUSE_ITEMS[pauseSel].id);
    return;
  }
  if (state === "results") {
    if (input.take("left")) resultsSel = 0;
    if (input.take("right")) resultsSel = 1;
    for (let i = 0; i < 2; i++) {
      const [x, y, w, h] = resultsButton(i, resultsT);
      if (pointer.x >= x && pointer.x < x + w && pointer.y >= y && pointer.y < y + h) resultsSel = i;
    }
    let act = resultsT > 1 && (input.take("confirm") || input.take("attack"));
    for (const c of clicks)
      for (let i = 0; i < 2; i++) {
        const [x, y, w, h] = resultsButton(i, resultsT);
        if (resultsT > 0.6 && c.x >= x && c.x < x + w && c.y >= y && c.y < y + h) (resultsSel = i), (act = true);
      }
    if (act) {
      sfx("select");
      if (resultsSel === 0) outroThen("transitions/blinds", startRun);
      else outroThen("transitions/crt-off", toTitle);
    }
  }
}
function bestCard(g) {
  // prefer levelling what he has, then new skills, then stats
  let best = 0, bs = -1;
  g.cards.list.forEach((c, i) => {
    const s = (c.skill ? 2 : 0.5) + (c.lv ? 1 : 0) + Math.random() * 0.8;
    if (s > bs) (bs = s), (best = i);
  });
  return best;
}
function pause() {
  if (state !== "play" || game?.mode === "over") return;
  state = "pause";
  pauseSel = 0;
  sfx("ui");
  suspendAudio(false);
}
function resume() {
  state = "play";
  sfx("ui");
  last = performance.now();
}
// a closing screen transition over the current run, then the next screen once it has covered it
let outro = null;
function outroThen(id, fn) {
  if (outro || !game) return fn();
  const h = game.fx.play(id, { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" });
  const info = FX[id];
  outro = { t: h ? info.duration * 0.46 : 0, fn };
}
function toTitle() {
  state = "title";
  keepUsed(game?.fx);
  game = null;
  title.fx.reset();
  titleAmbience();
  playMusic("title");
}
function pauseAction(id) {
  sfx("card");
  switch (id) {
    case "resume":
      return resume();
    case "restart":
      return outroThen("transitions/blinds", startRun);
    case "title":
      return outroThen("transitions/crt-off", toTitle);
    case "shake":
      settings.shake = settings.shake >= 1 ? 0.5 : settings.shake > 0 ? 0 : 1;
      break;
    case "flashes":
      settings.flashes = !settings.flashes;
      break;
    case "autoPick":
      settings.autoPick = !settings.autoPick;
      break;
    case "quality":
      settings.quality = { auto: "high", high: "mid", mid: "low", low: "auto" }[settings.quality];
      applyQuality();
      break;
    case "music":
      setVolume("music", audioSettings.music >= 1 ? 0 : Math.round((audioSettings.music + 0.2) * 10) / 10);
      break;
    case "sfx":
      setVolume("sfx", audioSettings.sfx >= 1 ? 0 : Math.round((audioSettings.sfx + 0.2) * 10) / 10);
      break;
    case "mute":
      toggleMute();
      break;
  }
  saveSettings();
}
function applyQuality() {
  if (settings.quality !== "auto") quality = { high: 2, mid: 1, low: 0 }[settings.quality];
  if (game) game.fx.quality = quality;
  title.fx.quality = quality;
}
applyQuality();

// focus lost or tab hidden: pause the run and the sound
input.onSystem((why) => {
  if (state === "play" && game && !game.result) pause();
  if (why === "hidden") suspendAudio(true);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    suspendAudio(false);
    last = performance.now();
  }
});

// ---- the loop
let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, slowFrames = 0, fastFrames = 0, frameMs = 16;
let loopErrors = 0;
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  try {
    step(now);
  } catch (e) {
    if (loopErrors++ < 5) console.error("frame error", e);
  }
}
function step(now) {
  let rdt = (now - last) / 1000;
  last = now;
  if (rdt <= 0) return;
  fpsAcc += rdt;
  fpsN++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  rdt = Math.min(rdt, MAX_FRAME);
  const t0 = performance.now();
  handleInput();
  if (outro) {
    outro.t -= rdt;
    if (game) game.fx.update(0, rdt);
    if (outro.t <= 0) {
      const f = outro.fn;
      outro = null;
      f();
    }
  }
  if (state === "loading" || state === "title") {
    updateTitle(rdt);
    drawTitleScene(title.t);
    const st = loadStats();
    drawTitle(ctx, title.t, state === "loading" ? 0 : Math.min(1, st.loaded / CORE.length));
  } else if (game) {
    if (state === "play") {
      // fixed steps for the game, so hits, cooldowns and physics don't depend on the frame rate
      acc += rdt * TEST.speed;
      let n = 0;
      while (acc >= STEP && n < 4 * TEST.speed) {
        game.lastRdt = STEP;
        game.update(STEP);
        acc -= STEP;
        n++;
      }
      if (n >= 4 * TEST.speed) acc = 0;
      if (game.mode === "over" && state === "play") {
        state = "results";
        resultsT = 0;
        resultsSel = 0;
      }
    } else if (state === "results") {
      resultsT += rdt;
      game.update(rdt);
    }
    game.draw(ctx);
    drawFloats(ctx, game);
    drawFlash(ctx, game);
    drawHud(ctx, game, rdt);
    drawBanner(ctx, game);
    drawCards(ctx, game);
    if (state === "pause") drawPause(ctx, pauseSel, fps);
    if (state === "results") drawResults(ctx, game, resultsT, resultsSel);
  }
  if (showFps) {
    drawText(ctx, `${fps}fps ${frameMs.toFixed(1)}ms q${quality} fx${game?.fx.count ?? title.fx.count} e${game?.enemies.length ?? 0}`, 4, H - 26, { font: "mini", color: "#a0ffa0", outline: "#000" });
  }
  // automatic quality: drop non-essential detail when frames run long, bring it back when they don't
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
  if (settings.quality === "auto" && state === "play" && game && game.stageT > 3 && !game.cards) {
    if (frameMs > 11 || fps < 50) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (frameMs < 7 && fps >= 58) fastFrames++;
    else fastFrames = 0;
    if (slowFrames > 90 && quality > 0) {
      quality--;
      slowFrames = 0;
      if (game) game.fx.quality = quality;
    } else if (fastFrames > 300 && quality < 2) {
      quality++;
      fastFrames = 0;
      if (game) game.fx.quality = quality;
    }
  }
}
requestAnimationFrame(frameLoop);
boot();

// ---- hooks for automated play-testing (also handy in the console)
window.__fxrush = {
  get state() {
    return state;
  },
  get game() {
    return game;
  },
  get fps() {
    return fps;
  },
  get frameMs() {
    return frameMs;
  },
  get quality() {
    return quality;
  },
  start: (seed) => {
    TEST.seed = seed ?? null;
    startRun();
  },
  used: () => (game ? Object.fromEntries(game.fx.used) : {}),
  usedAll() {
    keepUsed(game?.fx);
    keepUsed(title.fx);
    const all = new Map(usedEver);
    extraUsed.forEach((n, id) => all.set(id, (all.get(id) ?? 0) + n));
    return Object.fromEntries(all);
  },
  pauseAction,
  /** QA: drive rare branches directly. */
  test: {
    spawn: (type, dx, hpMul) => game?.testSpawn(type, dx, hpMul),
    kill: (e) => e && game && e.hp > 0 && (e.hp = 1) && game.enemies.includes(e) && import("./game/combat.js").then((m) => m.damage(game, e, 99999, { crit: true })),
    lowHp: () => game && (game.hero.hp = game.hero.maxHp * 0.2),
    die: () => { if (!game) return; game.hero.god = false; game.hero.iframes = 0; game.hero.invuln = 0; game.hero.hurt(99999, game.hero.x + 10); },
    god: (on) => game && (game.hero.god = !!on),
  },
  resultsAction(i) {
    if (state !== "results") return;
    resultsSel = i;
    if (i === 0) outroThen("transitions/blinds", startRun);
    else outroThen("transitions/crt-off", toTitle);
  },
  loadStats,
  pause,
  resume,
  setGod(on) {
    if (game) game.hero.god = !!on;
  },
};
void view; void canvas; void DEV; void makeFx; void frame; void poseAt; void FLOOR; void idleFor;
