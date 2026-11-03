// One run of FX Rush: three scenes, their crowds, elites and bosses, the hero, his skills and the rush meter.
// The game owns time: hit-stops (budgeted so a flood of hits never stalls it), slow motion for big moments,
// screen shake (capped, with a reduce option), and the order everything is drawn in around PixelFX's frame.

import { Director } from "../fx/director.js";
import { RAMPS, THEME } from "../fx/palettes.js";
import { FX } from "../fx/registry.gen.js";
import { beginFrame, endFrame, setCamera, image, fxModule, preload, Rng, frame } from "../engine/pfx.js";
import { W, H, M, FLOOR } from "../config.js";
import { Hero, Bag } from "./hero.js";
import { Enemy, TYPES } from "./enemies.js";
import { ATTACKS, ActPlayer } from "./moves.js";
import { damage, damageBox, damageRadius, kill } from "./combat.js";
import { SkillSystem, SKILLS, STAT_CARDS } from "./skills.js";
import { updateStatus, afflict } from "./status.js";
import { Projectile, updateProjectiles } from "./projectiles.js";
import { Pickup, collectFx } from "./pickups.js";
import { STAGES, along, mixAt } from "./stages.js";
import { makeBoss } from "./boss.js";
import { scene, drawBackground, drawForeground, shadowAt, resetSky } from "../render/background.js";
import { sfx, playMusic, musicIntensity } from "../engine/audio.js";
import { settings } from "../settings.js";
import { rigActor, clearBanks } from "./sprites.js";
import { SKINS } from "./rig.js";

// ultimates: PixelFX moves performed by the hero when the rush meter fills.
// zone per hit: [kind, a, b, damage multiple] — "front": box from the hero to a px ahead; "at": radius b around the act's target; "around": radius around the hero
export const MOVES = {
  "moves/sword-combo": { name: "SWORD COMBO", hits: [["front", 70, 0, 2], ["front", 74, 0, 1.4], ["front", 74, 0, 1.4], ["front", 90, 0, 4]], to: 2.3, rate: 1.2 },
  "moves/dash-strike": { name: "DASH STRIKE", hits: [["front", -190, 0, 5.5]], to: 1.4, rate: 1.1 },
  "moves/earth-stomp": { name: "EARTH STOMP", hits: [["around", 0, 60, 1.2], ["at", 0, 46, 5]], to: 1.4, rate: 1.15 },
  "moves/fireball-throw": { name: "FIREBALL", hits: [["at", 0, 64, 6]], to: 2.1, rate: 1.15 },
  "moves/ground-pound": { name: "GROUND POUND", hits: [["at", 0, 92, 5], ["at", 0, 130, 1.2]], to: 1.7, rate: 1.1 },
  "moves/holy-smite": { name: "HOLY SMITE", hits: [["at", 0, 56, 6]], to: 1.3, rate: 1.1 },
  "moves/ice-lance-throw": { name: "ICE LANCE", hits: [["at", 0, 56, 5, "ice"]], to: 1.8, rate: 1.15 },
  "moves/lightning-call": { name: "LIGHTNING", hits: [["at", 0, 56, 4, "shock"], ["at", 0, 60, 1.5, "shock"], ["at", 0, 60, 1.5, "shock"]], to: 1.6, rate: 1.1 },
  "moves/meteor-call": { name: "METEOR CALL", hits: [["around", 0, 40, 0.5], ["at", 0, 90, 7, "fire"]], to: 2.6, rate: 1.25 },
  "moves/pistol-shots": { name: "GUNSLINGER", hits: [["line", 0, 0, 2.6], ["line", 0, 0, 2.6], ["line", 0, 0, 3.5]], to: 1.3, rate: 1.1 },
  "moves/rocket-launcher": { name: "ROCKET", hits: [["none"], ["at", 0, 86, 7, "fire"]], to: 1.8, rate: 1.2 },
  "moves/arrow-shot": { name: "PIERCING ARROW", hits: [["line", 0, 0, 5, "melee", true]], to: 1.2, rate: 1.15 },
};
// every ultimate can come up anywhere; each scene deals its own six first, then the rest, from a shuffle bag
const MOVE_POOL = {
  ember: ["moves/sword-combo", "moves/fireball-throw", "moves/ground-pound", "moves/earth-stomp", "moves/meteor-call", "moves/dash-strike"],
  frost: ["moves/ice-lance-throw", "moves/arrow-shot", "moves/holy-smite", "moves/sword-combo", "moves/dash-strike", "moves/lightning-call"],
  void: ["moves/pistol-shots", "moves/rocket-launcher", "moves/lightning-call", "moves/dash-strike", "moves/meteor-call", "moves/holy-smite"],
};
const ALL_MOVES = Object.keys(MOVES);

// fast early levels (the fight changes shape within seconds), then a steady climb
const XP_EARLY = [0, 4, 7, 10, 14, 18, 23, 28];
const XP_CURVE = (lv) => (lv < XP_EARLY.length ? XP_EARLY[lv] : Math.round(10 + lv * 3.4 + lv * lv * 0.42));

class Combo {
  constructor(g) {
    this.g = g;
    this.n = 0;
    this.t = 0;
    this.best = 0;
    this.pop = 0;
  }
  hit() {
    this.n++;
    this.t = 2.6;
    this.pop = 1;
    this.best = Math.max(this.best, this.n);
    const m = [10, 25, 50, 100, 150, 200, 300, 500].find((v) => v === this.n);
    if (m) this.g.comboMilestone(m);
  }
  update(dt) {
    this.pop = Math.max(0, this.pop - dt * 5);
    if (this.n && (this.t -= dt) <= 0) this.n = 0;
  }
}

export class Game {
  constructor() {
    this.fx = new Director();
    this.mode = "idle";
  }

  // ------------------------------------------------------------------ setup
  start(seed = (Date.now() & 0xffff) + 1, test = {}) {
    this.seed = seed;
    this.R = new Rng(seed);
    this.fx.reset();
    this.fx.seed = seed;
    this.time = 0;
    this.realTime = 0;
    this.hero = new Hero(this);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.timers = [];
    this.dangers = [];
    this.orbs = [];
    this.floats = [];
    this.skills = new SkillSystem(this);
    this.combo = new Combo(this);
    this.level = 1;
    this.xp = 0;
    this.xpNext = XP_CURVE(1);
    this.xpMul = 1;
    this.pendingLevels = 0;
    this.cards = null;
    this.rushV = 0;
    this.rushMode = 0;
    this.coins = 0;
    this.stopT = 0;
    this.stopLog = [];
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.slow = null;
    this.screenFlash = null;
    this.camX = 0;
    this.stageIndex = (test.stage ?? 1) - 2;
    this.stats = { kills: 0, damage: 0, ultimates: 0, startedAt: performance.now(), stageTimes: [], bossTimes: [], elites: 0 };
    this.revived = false;
    this.aegisReady = false;
    this.aegisT = 0;
    this.blastBudget = 6;
    this.mode = "play";
    this.result = null;
    this.events = [];
    this.decorAt = new Map();
    this.weatherFx = [];
    this.boss = null;
    this.banner = null;
    this.nextStage();
    for (const [id, n] of Object.entries(test.build ?? {})) for (let i = 0; i < n; i++) this.skills.add(id);
  }

  nextStage() {
    this.stageIndex++;
    const st = STAGES[this.stageIndex];
    this.stage = st;
    this.theme = THEME[st.theme];
    this.scene = scene(st.theme);
    resetSky();
    if (this.stageIndex > 0) clearBanks();
    this.stageT = 0;
    this.stageStart = this.time;
    this.spawnT = 0.4;
    this.portalT = 3;
    this.elitesLeft = st.elites.slice();
    this.eventsLeft = st.events.slice();
    this.phase = "intro";
    this.phaseT = 0;
    this.advance = false;
    this.vacuum = false;
    this.bossDefeated = false;
    this.warped = false;
    this.bloomUsed = false;
    if (this.hero) this.hero.hidden = false;
    for (const h of this.weatherFx) h.stop();
    for (const h of this.decorAt.values()) h?.stop();
    this.decorAt.clear();
    this.weatherFx = [];
    // place the hero at the start of a fresh stretch of world
    const base = this.stageIndex * 4000;
    this.hero.x = base + 60;
    this.hero.y = 0;
    this.hero.vx = 0;
    this.camX = base;
    this.minX = base + 8;
    this.enemies = [];
    this.projectiles = [];
    this.pickups.forEach((p) => p.handle?.stop());
    this.pickups = [];
    this.orbs = [];
    for (const k of ["ball-lightning", "arcane-orb", "storm-cloud", "halo", "blessing"]) this.fx.stopTag(k);
    playMusic(st.music);
    // the hero arrives in a beam of light
    this.fx.play(this.stageIndex === 2 ? "scifi/warp-in" : "spawn/respawn-beam", {
      x: this.hero.x, y: 0, palette: this.stageIndex === 1 ? RAMPS.frost : this.stageIndex === 2 ? RAMPS.cyber : RAMPS.holy, prio: 0, layer: "split", speed: 1.6, life: 1.6,
    });
    this.hero.invuln = 1.2;
    this.hero.introT = 0.9;
    sfx("portal");
    this.banner = { title: st.name, sub: `STAGE ${this.stageIndex + 1}  ·  ${st.sub}`, t: 0, dur: 2.6 };
    if (this.stageIndex > 0) this.transitionOut(st.transitionIn);
    // preload this stage's and the next stage's effects in the background
    preload(this.stageEffects(this.stageIndex));
    if (this.stageIndex < 2) setTimeout(() => preload(this.stageEffects(this.stageIndex + 1)), 4000);
  }

  stageEffects(i) {
    const st = STAGES[i], ids = new Set();
    for (const [, mx] of st.mix) for (const t of Object.keys(mx)) {
      const T = TYPES[t];
      if (T.fx) ids.add(T.fx);
      if (T.deathFx) ids.add(T.deathFx);
      if (T.bolt) ids.add(T.bolt);
      if (T.attack) ids.add(ATTACKS[T.attack].fx);
      if (T.alt) ids.add(ATTACKS[T.alt].fx);
    }
    for (const [, t] of st.elites) {
      const T = TYPES[t];
      if (T.aura) ids.add(T.aura);
      if (T.attack) ids.add(ATTACKS[T.attack].fx);
      if (T.alt) ids.add(ATTACKS[T.alt].fx);
    }
    for (const d of st.decor) ids.add(d.id);
    for (const w of st.weather) ids.add(w.id);
    for (const m of ALL_MOVES) ids.add(m);
    if (this.scene?.skyFx) ids.add(this.scene.skyFx.id);
    return [...ids].filter((id) => FX[id]);
  }

  transitionOut(id) {
    // a screen transition that starts covered and opens on the new scene
    const h = this.fx.play(id, { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" });
    if (h) {
      const info = FX[id];
      h.inst.update(info.duration * 0.5);
      h.speed = 1.2;
    }
  }

  // ------------------------------------------------------------------ helpers used everywhere
  rng() {
    return this.R.next();
  }
  pan(x) {
    return Math.max(-0.8, Math.min(0.8, (x - this.camX - W / 2) / (W / 2)));
  }
  clampX(x, enemy = false) {
    let lo = this.minX, hi = Infinity;
    if (this.arena) (lo = this.arena[0]), (hi = this.arena[1]);
    if (enemy) (lo -= 60), (hi += 60);
    return Math.max(lo, Math.min(hi, x));
  }
  later(t, fn) {
    this.timers.push({ t, fn, once: true });
  }
  /**
   * Announce a hit that is coming: the zone [x0, x1] on the floor is dangerous `t` seconds from now (for `dur`).
   * kind "area": step out of it; kind "jump": a shock wave along the floor, jump it. The hero's AI reads these.
   */
  danger(x0, x1, t, dur = 0.25, kind = "area") {
    this.dangers.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), at: this.time + t, until: this.time + t + dur, kind });
  }
  nearestEnemy(x, y, r = 200, exclude = null, skip = 0) {
    const list = [];
    for (const e of this.enemies) {
      if (e.dead || e.spawning > 0 || (exclude && exclude.has(e.id))) continue;
      const d = Math.hypot(e.x - x, e.y - e.cy - y);
      if (d <= r + e.w) list.push([d, e]);
    }
    list.sort((a, b) => a[0] - b[0]);
    return list.length ? list[Math.min(skip, list.length - 1)][1] : null;
  }
  strongestEnemy(r = 200) {
    let best = null;
    for (const e of this.enemies) if (!e.dead && e.spawning <= 0 && Math.abs(e.x - this.hero.x) < r && (!best || e.hp > best.hp)) best = e;
    return best;
  }
  /** The x where the most monsters stand within a window (for area spells). offset: avoid that spot by this much. */
  clusterPoint(r = 170, avoid = 0) {
    let best = null, bn = 0;
    const h = this.hero;
    for (const e of this.enemies) {
      if (e.dead || e.spawning > 0 || Math.abs(e.x - h.x) > r) continue;
      if (avoid && this._lastCluster && Math.abs(e.x - this._lastCluster) < avoid) continue;
      let n = 0;
      for (const m of this.enemies) if (!m.dead && Math.abs(m.x - e.x) < 46) n += m.boss ? 3 : m.elite ? 2 : 1;
      if (n > bn) (bn = n), (best = e);
    }
    if (best) this._lastCluster = best.x;
    return best ? { x: best.x, y: best.y, e: best } : null;
  }
  pickEnemies(n, onScreen = false) {
    const list = this.enemies.filter((e) => !e.dead && e.spawning <= 0 && Math.abs(e.x - this.hero.x) < (onScreen ? 170 : 200));
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    list.sort((a, b) => (b.boss ? 2 : b.elite ? 1 : 0) - (a.boss ? 2 : a.elite ? 1 : 0));
    return list.slice(0, n);
  }
  hitStop(t) {
    if (t <= 0) return;
    // budget: no more than ~22% of the last second spent frozen
    const now = this.realTime;
    this.stopLog = this.stopLog.filter((s) => now - s[0] < 1);
    const used = this.stopLog.reduce((a, s) => a + s[1], 0);
    const k = used > 0.22 ? 0.15 : used > 0.12 ? 0.5 : 1;
    t *= k;
    if (t < 0.008) return;
    this.stopLog.push([now, t]);
    this.stopT = Math.max(this.stopT, t);
  }
  shake(amp, dur = 0.2) {
    if (!amp) return;
    amp *= settings.shake;
    if (amp > this.shakeAmp * (this.shakeT / (this.shakeDur || 1))) {
      this.shakeAmp = Math.min(4, amp);
      this.shakeT = dur;
      this.shakeDur = dur;
    }
  }
  flashScreen(t, color = "#ffffff") {
    if (!settings.flashes) return;
    this.screenFlash = { t, dur: t, color };
  }
  slowMo(t, scale) {
    this.slow = { t, scale };
  }
  rush(n) {
    if (this.rushMode > 0 || this.hero.moveOverride) return;
    this.rushV = Math.min(100, this.rushV + n);
  }
  floatText(text, x, y, kind = "info") {
    this.floats.push({ text, x, y, t: 0, kind });
  }
  damageNumber(dmg, x, y, crit, el, e) {
    // small pixel numbers, merged per enemy, so a flurry reads as one rising total instead of a pile of bursts.
    // (PixelFX's big crit starburst stays out of the fight: it presents the best hit on the results screen.)
    if (dmg > (this.stats.bestHit ?? 0)) this.stats.bestHit = dmg;
    const kind = crit ? "crit" : "dmg";
    const m = e && this.floats.find((f) => f.src === e && f.t < 0.3 && (f.kind === "dmg" || f.kind === "crit"));
    if (m) {
      m.n += dmg;
      m.text = String(m.n);
      if (crit) m.kind = "crit";
      m.t = Math.min(m.t, 0.12);
      return;
    }
    // stack fresh numbers upward when they start near one another
    const near = this.floats.filter((f) => (f.kind === "dmg" || f.kind === "crit") && f.t < 0.4 && Math.abs(f.x - x) < 14).length;
    this.floats.push({ text: String(dmg), n: dmg, src: e, x: x + (this.rng() - 0.5) * 6, y: y - near * 7, t: 0, kind, el });
    const nums = this.floats.filter((f) => f.kind === "dmg" || f.kind === "crit");
    if (nums.length > 6) this.floats.splice(this.floats.indexOf(nums[0]), 1);
  }
  /** Slow the hero (frost breath, curses): half speed, and PixelFX's slowed clock behind his head. */
  slowHero(t) {
    const h = this.hero;
    if (h.slowT > 0) {
      h.slowT = Math.max(h.slowT, t);
      return;
    }
    h.slowT = t;
    h.baseSpeed = h.stats.speed;
    h.stats.speed *= 0.5;
    h.stats.atkSpeed *= 0.8;
    this.fx.play("status/slowed", { x: h.x, y: h.y, follow: h, actor: rigActor(SKINS.hero).actor, prio: 1, layer: "split", life: t });
    this.timers.push({ t: 99, update: (dt) => {
      if ((h.slowT -= dt) <= 0) {
        h.stats.speed = h.baseSpeed;
        h.stats.atkSpeed /= 0.8;
        h.slowT = 0;
        return true;
      }
    } });
  }
  /** QA hook: a monster of a given type right next to the hero (used by the end-to-end branch tests). */
  testSpawn(type, dx = 40, hpMul = 1) {
    const T = TYPES[type];
    const e = new Enemy(this, type, this.hero.x + dx, T.hover ? -T.hover : 0, { hpMul });
    this.enemies.push(e);
    if (T.jet) this.fx.play("scifi/jetpack", { follow: e, x: e.x, y: e.y, dy: -2, center: true, palette: RAMPS.neon, prio: 1, layer: "back", life: 999, light: 0.8 });
    return e;
  }
  heroActor() {
    return rigActor(SKINS.hero).actor;
  }
  heroBuffFx(id, pal, life) {
    const h = this.hero;
    this.fx.play(id, { x: h.x, y: h.y, follow: h, palette: pal, life, prio: 1, layer: "split" });
  }
  telegraph(e, a) {
    const ai = e.actorInfo;
    this.fx.play("ui/exclamation", { x: e.x, y: e.y, follow: e, actor: ai?.actor, palette: this.theme.danger, prio: 1, layer: "top", life: 0.9 });
    sfx("warn");
  }

  // ------------------------------------------------------------------ the hero's blows
  heroHit(a, hit, i, act) {
    const h = this.hero, f = act.facing, ox = act.ox;
    const [x0, y0, x1, y1] = a.box;
    const bx0 = f > 0 ? ox + x0 : ox - x1, bx1 = f > 0 ? ox + x1 : ox - x0;
    const mult = a.dmg * (h.stats.atkMul ?? 1);
    const hit2 = damageBox(this, bx0, h.y + y0, bx1, h.y + y1, h.stats.atk * mult, {
      el: "melee", dir: f, push: a.push, lift: a.lift, stop: a.stop, shake: a.shake, weight: a.weight, heavy: a.heavy,
    });
    if (i === 0) this.skills.onAttack(a);
    // a blade through an enemy shot knocks it out of the air
    for (const p of this.projectiles) {
      if (!p.hostile || p.dead || p.x < bx0 || p.x > bx1 || p.y < h.y + y0 || p.y > h.y + y1) continue;
      p.end(false);
      this.fx.play("impacts/parry", { x: p.x, y: 0, height: Math.max(4, -p.y), flip: f < 0, palette: RAMPS.hero, prio: 0, layer: "top", life: 0.9 });
      this.hitStop(0.05);
      sfx("shield", { pan: this.pan(p.x) });
    }
    if (!hit2.length) return;
    if (a.heavy) {
      this.fx.play("impacts/ground-slam", { x: ox + f * 46, y: 0, flip: f < 0, palette: RAMPS.hero, prio: 1, life: 1, light: 0.8, layer: "ground", speed: 1.4 });
      this.shake(3, 0.25);
    }
  }
  enemyMeleeHit(e, a, hit) {
    const h = this.hero, f = e.act?.facing ?? e.facing, ox = e.act?.ox ?? e.x;
    const [x0, y0, x1, y1] = a.box;
    const bx0 = f > 0 ? ox + x0 : ox - x1, bx1 = f > 0 ? ox + x1 : ox - x0;
    if (h.x + 7 > bx0 && h.x - 7 < bx1 && h.y - 34 < y1 && h.y > y0) {
      if (h.hurt(e.dmg * a.dmg, e.x, { push: a.push * 0.7, lift: a.lift ? a.lift * 0.6 : 0 })) {
        this.hitStop(a.stop * 0.8);
        this.shake(a.shake, 0.2);
      }
    }
  }
  enemyCharge(e) {
    this.fx.play("arcane/spell-charge", { x: e.x, y: e.y - e.cy, follow: e, dy: -e.cy, center: true, palette: this.theme.danger, prio: 1, life: 0.75, layer: "top", light: 0.8 });
  }
  enemyShoot(e) {
    const h = this.hero, T = e.T, sx = e.x, sy = e.y - e.cy;
    const dx = h.x - sx, dy = h.y - 18 - sy, d = Math.hypot(dx, dy) || 1, sp = 120;
    const p = new Projectile(this, {
      x: sx, y: sy, vx: (dx / d) * sp, vy: (dy / d) * sp, fx: T.bolt, rotate: true, fxOpts: { palette: T.boltPal ?? this.theme.enemyBolt, light: 0.8 },
      hostile: true, dmg: e.dmg, r: 5, life: 3, floorY: 4,
      onEnd: (g, pr, impact) => impact && g.fx.play("impacts/bullet-impact", { x: pr.x, y: 0, height: Math.max(2, -pr.y), flip: pr.vx > 0, palette: this.theme.danger, prio: 2, life: 0.8 }),
    });
    this.projectiles.push(p);
    sfx(T.bolt.includes("laser") ? "laser" : "magic", { pan: this.pan(sx), pitch: 0.7 });
  }
  enemyGun(e) {
    // a gunner: a muzzle flash, then a tracer across the floor; the trooper fires a rocket
    const h = this.hero, f = e.facing, mx = e.x + f * 22, my = -26;
    if (e.T.ai === "archer") {
      this.telegraph(e);
      this.later(0.5, () => {
        if (e.dead) return;
        const ff = e.facing;
        const p = new Projectile(this, {
          x: e.x + ff * 14, y: -24, vx: ff * 230, vy: -24, gravity: 50, fx: "projectiles/arrow", rotate: true, fxOpts: { light: 0.4 }, hostile: true, dmg: e.dmg, r: 4, life: 2,
          onEnd: (g, pr, imp) => imp && g.fx.play("impacts/bullet-impact", { x: pr.x, y: 0, height: Math.max(2, -pr.y), flip: pr.vx > 0, prio: 2, life: 0.6 }),
        });
        this.projectiles.push(p);
        sfx("whoosh", { pan: this.pan(e.x) });
        e.aiT = 2 + this.rng();
      });
      return;
    }
    if (this.gunnerEscape(e)) return;
    if (e.T.ai === "trooper" && (e.shots = (e.shots ?? 0) + 1) % 2 === 0) {
      // a homing missile arcs over and comes down where he stood
      const tx = h.x;
      this.danger(tx - 34, tx + 34, 1.15, 0.3);
      this.fx.play("arcane/rune-circle", { x: tx, y: 0, palette: this.theme.danger, prio: 1, life: 1.2, layer: "ground" });
      this.fx.play("projectiles/homing-missile", { x: tx, y: 0, flip: e.x > tx, prio: 0, life: 2.4, light: 0.8 });
      this.later(1.15, () => {
        if (Math.abs(this.hero.x - tx) < 34 && this.hero.y > -30) this.hero.hurt(e.dmg * 0.7, tx, { lift: 140 });
        damageRadius(this, tx, -10, 34, h.stats.atk * 1.5, { el: "fire", quiet: true, stop: 0 });
        sfx("explode", { pan: this.pan(tx) });
      });
      sfx("missile");
      e.aiT = 2.8;
      return;
    }
    if (e.T.ai === "trooper") {
      this.fx.play("projectiles/muzzle-shotgun", { x: mx, y: 0, height: 26, flip: f < 0, prio: 1, life: 1.2 });
      const p = new Projectile(this, {
        x: mx, y: my, vx: f * 150, vy: 0, fx: "projectiles/rocket", fxOpts: { light: 0.8 }, hostile: true, dmg: e.dmg, r: 7, life: 2.5,
        onEnd: (g, pr) => {
          g.fx.play("explosions/grenade", { x: pr.x, y: 0, prio: 1, life: 1.6, light: 0.9 });
          if (Math.abs(g.hero.x - pr.x) < 40 && g.hero.y > -30) g.hero.hurt(e.dmg * 0.6, pr.x, { push: 160, lift: 120 });
          sfx("explode", { pan: g.pan(pr.x) });
        },
      });
      this.projectiles.push(p);
      sfx("shoot");
      e.aiT = 2.6;
      return;
    }
    let n = 0;
    const fire = () => {
      if (e.dead) return;
      this.fx.play(n % 2 ? "projectiles/muzzle-pistol" : "projectiles/muzzle-smg", { x: e.x + e.facing * 22, y: 0, height: 26, flip: e.facing < 0, prio: 1, life: 0.6, light: 0.8 });
      const p = new Projectile(this, {
        x: e.x + e.facing * 24, y: -26, vx: e.facing * 300, vy: 0, fx: "projectiles/bullet-tracer", fxOpts: { palette: this.theme.danger, light: 0.7 }, hostile: true, dmg: e.dmg, r: 4, life: 1.2,
        onEnd: (g, pr, imp) => imp && g.fx.play("impacts/ricochet", { x: pr.x, y: 0, flip: pr.vx < 0, prio: 2, life: 0.8 }),
      });
      this.projectiles.push(p);
      sfx("shoot", { pan: this.pan(e.x) });
      if (++n < 3) this.later(0.18, fire);
      else e.aiT = 1.8 + this.rng();
    };
    this.telegraph(e);
    this.later(0.45, fire);
  }

  // ------------------------------------------------------------------ deaths, loot, levels
  onKill(e, el) {
    this.stats.kills++;
    this.rush(e.elite ? 12 : 1.4);
    this.skills.onKill(e, el);
    // loot
    const T = e.T;
    const xp = Math.max(1, Math.round(T.xp * this.xpMul));
    if (e.elite) {
      this.stats.elites++;
      this.pickups.push(new Pickup(this, "chest", e.x, e.y - 20, { value: xp, vy: -160, vx: 0 }));
      this.fx.play("spawn/coin-drop", { x: e.x, y: 0, prio: 1, coins: 9, life: 2 });
      this.coins += 9;
      this.fx.play("explosions/firework-burst", { x: e.x, y: 0, prio: 2, life: 2.2, light: 0.6, palette: this.theme.accent });
      this.slowMo(0.5, 0.35);
      this.shake(3, 0.3);
      sfx("explode", { w: 0.9 });
      this.fx.play("ui/achievement", { x: 160, y: 44, screen: true, title: "ELITE DOWN", text: `+${xp} XP`, prio: 1, layer: "top", life: 2.2 });
    } else {
      for (let i = 0; i < xp; i++) this.pickups.push(new Pickup(this, "xp", e.x, e.y - e.cy, { value: 1 }));
      const r = this.rng();
      if (r < 0.03) this.pickups.push(new Pickup(this, "heart", e.x, e.y - e.cy));
      else if (r < 0.034) this.pickups.push(new Pickup(this, "shard", e.x, e.y - e.cy));
      else if (r < 0.04) this.pickups.push(new Pickup(this, "coin", e.x, e.y - e.cy, { value: 3 }));
      else if (r < 0.043) this.pickups.push(new Pickup(this, "orb", e.x, e.y - e.cy, { value: 6 }));
    }
  }
  collect(p) {
    collectFx(this, p);
  }
  /** An elite's chest bursts open: experience, a heart, and a potion or a power star spill out. */
  openChest(x) {
    sfx("chest");
    this.later(1.2, () => {
      this.pickups.push(new Pickup(this, "gem", x, -20, { value: 20, vy: -220 }));
      this.pickups.push(new Pickup(this, "heart", x + 10, -20, { vy: -240 }));
      this.pickups.push(new Pickup(this, this.rng() < 0.5 ? "potion" : "star", x - 10, -20, { vy: -260 }));
      for (let i = 0; i < 3; i++) this.pickups.push(new Pickup(this, "coin", x, -20, { value: 2 }));
      this.shake(1.5, 0.2);
    });
  }
  /** Combo 150: the clock face springs open and every monster on screen falls asleep. */
  timeStop() {
    const h = this.hero;
    this.fx.play("arcane/time-stop", { x: h.x, y: 0, palette: RAMPS.arcane, prio: 0, life: 2.6, layer: "split" });
    this.banner = { title: "TIME STOP", sub: "时间静止 · 全场沉睡", t: 0, dur: 1.6, small: true };
    sfx("magic", { pitch: 0.6 });
    this.later(0.35, () => {
      for (const e of this.enemies) if (!e.dead && Math.abs(e.x - this.camX - 160) < 190) afflict(this, e, "sleep", 3.2);
    });
  }
  enemyFlame(e) {
    const f = e.facing, x = e.x + f * 14;
    this.telegraph(e);
    this.danger(f > 0 ? x : x - 120, f > 0 ? x + 120 : x, 0.45, 1.2);
    this.later(0.45, () => {
      if (e.dead) return;
      this.fx.play("fire/flamethrower", { x, y: -24, flip: f < 0, palette: this.theme.danger, prio: 0, life: 1.2, light: 0.9 });
      sfx("fire", { w: 1, pan: this.pan(x) });
      this.timers.push({ t: 1.2, tick: 0, update: (dt) => {
        if ((this.flameTick = (this.flameTick ?? 0) - dt) <= 0) {
          this.flameTick = 0.25;
          const h = this.hero, x0 = f > 0 ? x : x - 112, x1 = f > 0 ? x + 112 : x;
          if (h.x > x0 && h.x < x1 && h.y > -44) h.hurt(e.dmg * 0.4, e.x, { push: 90 });
        }
      } });
    });
    this.later(1.8, () => (e.aiT = 0.8));
  }
  /** A gunner with the hero on top of him smoke-bombs away and blinks back in further off. */
  gunnerEscape(e) {
    const h = this.hero;
    if (e.T.ai !== "gunner" || Math.abs(h.x - e.x) >= 46 || (e.escapeT ?? 0) > this.time || e.dead) return false;
    e.escapeT = this.time + 6;
    const ai = e.actorInfo;
    this.fx.play("explosions/smoke-bomb", { x: e.x, y: 0, prio: 1, life: 1.8 });
    this.fx.play("arcane/blink-out", { x: e.x, y: 0, actor: ai.actor, palette: RAMPS.neon, prio: 1, life: 1.2, speed: 1.6, layer: "split" });
    e.spawning = 0.9;
    e.x = this.clampX(e.x + (e.x > h.x ? 1 : -1) * 120, true);
    this.later(0.9, () => !e.dead && this.fx.play("arcane/blink-in", { x: e.x, y: 0, actor: ai.actor, palette: RAMPS.neon, prio: 2, life: 1.2, speed: 1.8, layer: "split" }));
    e.aiT = 1.5;
    return true;
  }
  enemyDisc(e) {
    const f = e.facing;
    const p = new Projectile(this, {
      x: e.x + f * 14, y: -22, vx: f * 170, vy: 0, fx: "projectiles/energy-disc", fxOpts: { palette: this.theme.danger, light: 0.8 }, hostile: true, dmg: e.dmg * 0.8, r: 6, life: 2,
    });
    this.projectiles.push(p);
    sfx("laser", { pan: this.pan(e.x) });
  }
  gainXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = XP_CURVE(this.level);
      this.pendingLevels++;
    }
  }
  beginLevelUp() {
    this.pendingLevels--;
    const h = this.hero;
    this.fx.play("ui/level-up", { x: h.x, y: h.y, follow: h, prio: 0, layer: "split", life: 1.8, speed: 1.3, palette: RAMPS.gold });
    h.maxHp += 6;
    h.stats.armor = Math.min(0.35, h.stats.armor + 0.015);
    h.heal(h.maxHp * 0.1, true);
    sfx("levelup");
    this.slowMo(0.25, 0.3);
    this.later(0.25, () => this.openCards());
  }
  openCards() {
    const opts = this.offerCards();
    this.cards = { list: opts, t: 0, hover: -1, chosen: -1, auto: settings.autoPick };
  }
  offerCards() {
    const owned = this.skills.order;
    const pool = [];
    for (const [id, s] of Object.entries(SKILLS)) {
      const lv = this.skills.level(id);
      if (lv >= s.max) continue;
      if (!lv && owned.length >= 6) continue;
      pool.push({ id, w: lv ? 3.2 : 2, skill: true, lv });
    }
    for (const [id, s] of Object.entries(STAT_CARDS)) {
      const lv = this.skills.statLv[id] ?? 0;
      if (lv >= s.max) continue;
      pool.push({ id, w: this.level < 4 ? 0.3 : 1, skill: false, lv });
    }
    const pick = [];
    // the first level-ups always offer new skills: the fight should change shape right away
    const newOnly = this.level <= 3;
    while (pick.length < 3 && pool.length) {
      const cand = pool.filter((c) => !pick.includes(c) && (!newOnly || (c.skill && !c.lv) || pool.filter((x) => x.skill && !x.lv && !pick.includes(x)).length === 0));
      if (!cand.length) break;
      let r = this.rng() * cand.reduce((a, c) => a + c.w, 0);
      let c = cand[0];
      for (const x of cand) if ((r -= x.w) <= 0) {
        c = x;
        break;
      }
      pick.push(c);
    }
    return pick;
  }
  chooseCard(i) {
    const c = this.cards?.list[i];
    if (!c || this.cards.chosen >= 0) return;
    this.cards.chosen = i;
    this.cards.closeT = 0.28;
    this.skills.add(c.id);
    sfx("select");
    const h = this.hero;
    if (c.skill) {
      const s = SKILLS[c.id];
      this.fx.play("pickups/collect-burst", { x: h.x, y: h.y, prio: 0, layer: "top", palette: [s.color, s.color, "#ffffff"], light: 1 });
      this.floatText(`${s.name} Lv${this.skills.level(c.id)}`, h.x, h.y - 78, "skill");
    }
  }

  // ------------------------------------------------------------------ rush meter and ultimates
  tryUltimate() {
    const h = this.hero;
    if (this.rushV < 100 || h.busy || h.dead || !h.onGround || this.cards) return;
    const near = this.enemies.filter((e) => !e.dead && e.spawning <= 0 && Math.abs(e.x - h.x) < 160).length;
    if (near < (this.boss ? 1 : 3)) return;
    // the bag: this scene's six first (shuffled), then the other six, then round again; no move twice in a row
    if (!this.moveBag || this.moveBag.theme !== this.stage.theme) {
      const home = MOVE_POOL[this.stage.theme], rng = () => this.rng();
      this.moveBag = { theme: this.stage.theme, home: new Bag(home, rng), away: new Bag(ALL_MOVES.filter((m) => !home.includes(m)), rng), n: 0 };
    }
    const mb = this.moveBag;
    const id = (mb.n % 12 < 6 ? mb.home : mb.away).next();
    const mod = fxModule(id);
    if (!mod) return;
    mb.n++;
    this.stats.moves = (this.stats.moves ?? []).concat(id);
    const cfg = MOVES[id], tgt = h.target;
    if (tgt && !h.manual) h.facing = tgt.x >= h.x ? 1 : -1;
    this.rushV = 0;
    this.stats.ultimates++;
    const targetX = mod.act?.targets?.[0]?.x ?? mod.act?.target?.x ?? 100;
    const hits = (mod.act?.hits ?? []).slice().sort((a, b) => a.t - b.t);
    const player = new ActPlayer(mod, {
      id, rate: cfg.rate, x: h.x, facing: h.facing, director: this.fx, to: cfg.to, prio: 0,
      onHit: (hit, i, act) => {
        const z = cfg.hits[i];
        if (!z || z[0] === "none") return;
        const [kind, a, r, mult, el = "melee", pierce] = z, f = act.facing, atk = h.stats.atk * mult;
        const o = { el, push: 220, lift: 160, stop: Math.min(0.14, (hit.stop ?? 0.1) * 0.8), shake: 3, heavy: true, weight: 1 };
        if (kind === "front") {
          const reach = Math.abs(a);
          const x0 = a < 0 ? act.ox : h.x, x1 = (a < 0 ? act.ox : h.x) + f * reach;
          damageBox(this, Math.min(x0, x1) - 6, -60, Math.max(x0, x1) + 6, 4, atk, { ...o, dir: f });
        } else if (kind === "at") damageRadius(this, act.ox + f * targetX, -20, r, atk, o);
        else if (kind === "around") damageRadius(this, h.x, -20, r, atk, o);
        else if (kind === "line") {
          const x0 = h.x, x1 = h.x + f * 220;
          const list = this.enemies.filter((e) => !e.dead && e.spawning <= 0 && (e.x - x0) * f > 0 && (e.x - x0) * f < 220 && e.y > -60).sort((p, q) => (p.x - q.x) * f);
          for (const e of pierce ? list : list.slice(0, 2)) damage(this, e, atk, { ...o, dir: f });
          void x1;
        }
        if (el === "ice") for (const e of this.enemies) if (!e.dead && Math.abs(e.x - (act.ox + f * targetX)) < r + 20) afflict(this, e, "frozen", 2.2);
        if (el === "shock") for (const e of this.enemies) if (!e.dead && Math.abs(e.x - (act.ox + f * targetX)) < r + 20) afflict(this, e, "stunned", 1.2);
        sfx(i === cfg.hits.length - 1 ? "bigboom" : "heavy");
      },
    });
    h.perform(player);
    this.fx.play("impacts/impact-frame", { x: Math.round(h.x - this.camX), y: FLOOR - 24, screen: true, layer: "screen", prio: 0, life: 0.18, lines: 32 });
    this.slowMo(0.35, 0.25);
    this.banner = { title: "FX RUSH!", sub: cfg.name, t: 0, dur: 1.4, small: true };
    sfx("rush");
    this.hitStop(0.12);
  }
  starPower(t) {
    const h = this.hero;
    this.rushMode = t;
    h.invuln = t;
    h.stats.atkSpeed += 0.6;
    this.later(t, () => {
      h.stats.atkSpeed -= 0.6;
      this.rushMode = 0;
    });
    this.heroBuffFx("status/rage", RAMPS.gold, t);
    this.heroBuffFx("status/haste", RAMPS.gold, t);
    this.banner = { title: "STAR POWER", sub: "无敌 · 攻速暴涨", t: 0, dur: 1.6, small: true };
  }
  comboMilestone(n) {
    const h = this.hero;
    if (n >= 100) this.fx.play("ui/combo-counter", { x: 160, y: 40, screen: true, count: n, label: "COMBO", prio: 1, layer: "top", life: 1.3, palette: n >= 50 ? RAMPS.crit : RAMPS.gold });
    sfx("combo", { pitch: 1 + Math.min(1, n / 200) });
    this.rush(n >= 50 ? 10 : 5);
    if (n === 150 || n === 400) this.timeStop();
    if (n >= 100) this.fx.play("explosions/cartoon-pow", { x: h.x, y: h.y - 40, center: true, text: "WOW!", prio: 2, life: 0.9, palette: RAMPS.crit });
  }

  // ------------------------------------------------------------------ hero events
  onHeroHurt(dmg) {
    const h = this.hero;
    this.fx.play("impacts/hit-flash", { x: h.x, y: h.y, follow: h, flip: h.facing < 0, prio: 0, layer: "split", life: 0.5, palette: RAMPS.danger });
    this.damageNumberHero(dmg);
    this.shake(2.5, 0.25);
    this.hitStop(0.07);
    sfx("hurt");
    this.combo.n = Math.floor(this.combo.n * 0.5);
    if (dmg >= 14) this.fx.play("ui/heart-lost", { x: 14, y: 14, screen: true, prio: 1, layer: "top", life: 1.2 });
    this.flashScreen(0.1, "#ff2040");
  }
  damageNumberHero(dmg) {
    const h = this.hero;
    const hh = this.fx.play("ui/damage-number", { x: h.x, y: h.y - 40 + 30, text: `-${Math.round(dmg)}`, prio: 0, layer: "top", life: 0.9, speed: 1.2 });
    if (!hh) this.floats.push({ text: `-${Math.round(dmg)}`, x: h.x, y: h.y - 44, t: 0, kind: "hurt" });
  }
  onHeroDeath() {
    const h = this.hero;
    if (!this.revived) {
      // one second wind per run: light pours down and he stands back up
      this.revived = true;
      this.later(0.35, () => {
        h.dead = false;
        h.deadT = 0;
        h.hp = h.maxHp * 0.6;
        h.invuln = 2.5;
        this.fx.play("holy/resurrection", { x: h.x, y: h.y, follow: h, prio: 0, layer: "split", palette: RAMPS.holy, life: 2.6, speed: 1.4 });
        damageRadius(this, h.x, -20, 110, h.stats.atk * 3, { el: "holy", push: 300, lift: 200, stop: 0.1, shake: 3 });
        this.banner = { title: "SECOND WIND", sub: "圣光庇佑 · 复活", t: 0, dur: 1.8, small: true };
        sfx("heal");
      });
      this.slowMo(0.9, 0.3);
      return;
    }
    this.slowMo(1.5, 0.3);
    sfx("defeat");
    this.later(1.4, () => this.end(false));
  }
  end(won) {
    if (this.result) return;
    if (won) {
      // the celebration plays on behind the results
      this.fx.play("weather/cherry-blossoms", { x: 160, y: 170, screen: true, layer: "front", prio: 0, life: 999, every: 2, light: 0.6 });
      for (let i = 0; i < 4; i++) this.later(0.2 + i * 0.5, () => this.fx.play("ui/confetti", { x: this.camX + 60 + i * 66, y: 0, prio: 0, life: 3.4 }));
      for (let i = 0; i < 3; i++) this.later(0.6 + i * 0.9, () => this.fx.play("explosions/firework-rocket", { x: this.camX + 80 + i * 80, y: 0, prio: 1, life: 3.8 }));
    } else {
      this.fx.play("transitions/iris", { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" });
      // autumn leaves drift down over the defeat screen
      this.fx.play("weather/falling-leaves", { x: 160, y: 170, screen: true, layer: "front", prio: 0, life: 999, every: 2, light: 0.5 });
    }
    this.result = { won, gameTime: Math.round(this.time), time: (performance.now() - this.stats.startedAt) / 1000, kills: this.stats.kills, level: this.level, combo: this.combo.best, coins: this.coins, stage: this.stageIndex + 1, stageTimes: this.stats.stageTimes, bossTimes: this.stats.bossTimes, ultimates: this.stats.ultimates, bestHit: this.stats.bestHit ?? 0, skills: { ...this.skills.lv } };
    this.mode = "over";
  }

  // ------------------------------------------------------------------ bosses
  onBossHit(e, dmg) {
    this.boss?.onHit?.(dmg);
  }
  onBossDeath(e) {
    const b = this.boss;
    b?.die();
    this.arena = null;
    this.vacuum = true;
    this.fx.play("impacts/impact-frame", { x: Math.round(e.x - this.camX), y: Math.round(FLOOR + e.y - e.cy), screen: true, layer: "screen", prio: 0, life: 0.3, lines: 64 });
    this.slowMo(1.6, 0.2);
    this.hitStop(0.25);
    this.shake(4, 0.8);
    sfx("bigboom");
    this.musicDown = true;
    this.bossDefeated = true;
    this.stats.stageTimes.push(Math.round(this.time - (this.stageStart ?? 0)));
    this.stats.bossTimes.push(Math.round(this.time - (this.bossStart ?? 0)));
    // the key: walk into it to clear the scene
    this.later(1.4, () => this.pickups.push(new Pickup(this, "key", e.x, -30, { vy: -160, vx: 0 })));
  }
  onKey() {
    const last = this.stageIndex === STAGES.length - 1;
    this.fx.play("ui/quest-complete", { x: 160, y: 62, screen: true, text: last ? "VICTORY" : "STAGE CLEAR", prio: 0, layer: "top", life: 2.6 });
    this.fx.play("explosions/firework-rocket", { x: this.hero.x + 40, y: 0, prio: 1, life: 3, light: 0.7 });
    sfx(last ? "victory" : "stage");
    this.phase = "clear";
    this.phaseT = 0;
    for (const e of this.enemies) if (!e.dead) kill(this, e, { el: "holy" });
  }

  // ------------------------------------------------------------------ the scene's director
  updateStage(dt) {
    const st = this.stage, h = this.hero;
    this.phaseT += dt;
    if (this.phase === "intro") {
      if (this.phaseT > 0.9) this.phase = "fight";
      return;
    }
    if (this.phase === "clear") {
      // he beams out, then the next scene (or the end)
      this.advance = true;
      if (this.phaseT > 1.1 && !this.warped) {
        this.warped = true;
        const hh = this.hero;
        this.fx.play("scifi/warp-out", { x: hh.x, y: hh.y, actor: rigActor(SKINS.hero).actor, palette: [RAMPS.holy, RAMPS.frost, RAMPS.cyber][this.stageIndex], prio: 0, layer: "split", life: 2.6 });
        this.later(0.45, () => (hh.hidden = true));
        sfx("portal");
      }
      if (this.phaseT > 2.4 && !this.transitioning) {
        this.transitioning = true;
        const last = this.stageIndex === STAGES.length - 1;
        if (last) {
          this.fx.play("transitions/star-iris", { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" });
          this.later(1.2, () => this.end(true));
        } else {
          const id = ["transitions/burn-away", "transitions/diamond-wipe"][this.stageIndex];
          this.fx.play(id, { x: 0, y: 0, screen: true, layer: "screen", prio: 0, life: 9, color: "#07050b" });
          this.later(FX[id].duration * 0.48, () => {
            this.transitioning = false;
            this.nextStage();
          });
        }
      }
      return;
    }
    if (this.phase === "boss") return;
    this.stageT += dt;
    const T = this.stageT;
    // elites and set pieces on cue
    while (this.elitesLeft.length && T >= this.elitesLeft[0][0]) this.spawnElite(this.elitesLeft.shift()[1]);
    while (this.eventsLeft.length && T >= this.eventsLeft[0][0]) this.runEvent(this.eventsLeft.shift()[1]);
    // the crowd: keep the number alive near the target, in groups
    const alive = this.enemies.filter((e) => !e.dead).length;
    const target = Math.round(along(st.density, T));
    this.spawnT -= dt;
    if (alive < target && this.spawnT <= 0) {
      const n = Math.min(target - alive, 2 + Math.floor(this.rng() * 3));
      this.spawnGroup(n);
      this.spawnT = 0.7 + this.rng() * 0.9;
    }
    // move on when the screen is quiet
    const near = this.enemies.some((e) => !e.dead && Math.abs(e.x - h.x) < 150);
    this.advance = !near;
    if (T >= st.length && !this.enemies.some((e) => e.elite && !e.dead)) this.startBoss();
  }
  spawnGroup(n) {
    const st = this.stage, mix = mixAt(st, this.stageT), h = this.hero;
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    const pickType = () => {
      let r = this.rng() * total;
      for (const [t, w] of Object.entries(mix)) if ((r -= w) <= 0) return t;
      return Object.keys(mix)[0];
    };
    // most groups come from ahead; some from behind; now and then they come through a portal on screen
    this.portalT -= 1;
    const portal = this.portalT <= 0;
    if (portal) this.portalT = 3 + Math.floor(this.rng() * 3);
    const side = this.rng() < 0.72 ? 1 : -1;
    const px = portal ? h.x + side * (70 + this.rng() * 60) : side > 0 ? this.camX + W + 24 : this.camX - 24;
    if (portal) {
      const id = this.stageIndex === 2 ? "arcane/portal" : "spawn/spawn-portal";
      this.fx.play(id, { x: px, y: id === "arcane/portal" ? -20 : 0, palette: this.theme.danger, prio: 1, life: 2.2, layer: "back", light: 0.8 });
      sfx("spawn", { pan: this.pan(px) });
    }
    const type = pickType();
    for (let i = 0; i < n; i++) {
      const t = this.rng() < 0.7 ? type : pickType();
      const T = TYPES[t];
      const e = new Enemy(this, t, px + side * i * 14 + (this.rng() - 0.5) * 10, T.hover ? -T.hover - this.rng() * 16 : 0, {
        hpMul: 1 + this.stageT / 240, spawnDelay: portal ? 0.35 + i * 0.22 : 0,
      });
      this.enemies.push(e);
      if (portal && T.kind === "rig" && this.stageIndex === 2) {
        const ai = e.actorInfo;
        this.later(e.spawning, () => this.fx.play("scifi/warp-in", { x: e.x, y: 0, actor: ai.actor, prio: 2, layer: "split", speed: 2, life: 1.2, palette: RAMPS.neon }));
      } else if (portal && T.kind === "rig" && this.stageIndex === 1) {
        const ai = e.actorInfo;
        this.later(e.spawning, () => this.fx.play("arcane/blink-in", { x: e.x, y: 0, actor: ai.actor, prio: 2, layer: "split", speed: 1.8, palette: RAMPS.frost }));
      } else if (portal && t.includes("slime") && this.rng() < 0.5) {
        e.spawning += 0.9;
        this.fx.play("spawn/egg-hatch", { x: e.x, y: 0, prio: 2, layer: "split", speed: 2.4, life: 1.4, glow: this.theme.accent.slice(3, 7) });
      }
    }
  }
  spawnElite(type) {
    const h = this.hero, x = h.x + 110;
    this.fx.play("projectiles/flare", { x, y: 0, prio: 1, life: 2.4, light: 0.9 });
    const e = new Enemy(this, type, x, 0, { hpMul: 0.75 + this.stageIndex * 0.1, spawnDelay: 1.4 });
    this.enemies.push(e);
    this.fx.play("arcane/magic-circle-cast", { x, y: 0, palette: this.theme.danger, prio: 0, layer: "split", speed: 2, life: 2.4, light: 0.9 });
    this.later(1.3, () => {
      this.fx.play("impacts/ground-slam", { x, y: 0, palette: this.theme.danger, prio: 1, life: 1.2 });
      this.shake(3, 0.3);
      sfx("heavy");
      const T = TYPES[type];
      if (T.jet) this.fx.play("scifi/jetpack", { follow: e, x: e.x, y: e.y, dy: -2, center: true, palette: RAMPS.neon, prio: 1, layer: "back", life: 999, light: 0.8, tag: "jet" + e.id });
      if (T.aura) {
        const ai = e.actorInfo;
        e.aura = this.fx.play(T.aura, { x: e.x, y: e.y, follow: e, actor: ai.actor, palette: T.auraPal, prio: 1, layer: "split", life: 99, light: 0.7 });
      }
    });
    this.banner = { title: "精英来袭", sub: "ELITE INCOMING", t: 0, dur: 1.6, small: true, danger: true };
    sfx("warn");
  }
  runEvent(name) {
    const h = this.hero;
    const ev = {
      barrels: () => {
        // explosive barrels roll out of the forge; the hero's blows set them off
        for (let i = 0; i < 2; i++) {
          const x = h.x + 60 + i * 50;
          this.later(i * 0.4, () => {
            this.fx.play("explosions/barrel-explosion", { x, y: 0, prio: 1, life: 3, light: 0.9 });
            this.later(1.15, () => {
              damageRadius(this, x, -20, 64, h.stats.atk * 3, { el: "fire", lift: 240, push: 220, stop: 0.08, shake: 3.5 });
              sfx("explode", { w: 1, pan: this.pan(x) });
            });
          });
        }
        this.floatText("小心！炸药桶", h.x, -70, "warn");
      },
      cannons: () => {
        // the forge's cannons fire on the crowd from behind the hero
        for (let i = 0; i < 3; i++)
          this.later(i * 0.6, () => {
            const x = this.camX + 18 + i * 30;
            this.fx.play("projectiles/cannonball", { x, y: 0, height: 14, prio: 1, life: 2.6, light: 0.8 });
            sfx("explode", { w: 0.3, pan: -0.8 });
            this.later(0.32, () => {
              damageBox(this, x + 70, -40, x + 150, 4, h.stats.atk * 2.2, { el: "fire", lift: 220, push: 200, stop: 0.04, shake: 2 });
              sfx("heavy", { pan: this.pan(x + 100) });
            });
          });
        this.floatText("熔炉火炮支援！", h.x, -70, "info");
      },
      tornado: () => {
        const tor = { x: h.x + 150, y: 0 };
        this.fx.play("nature/tornado", { follow: tor, palette: RAMPS.frost, prio: 1, life: 4.4, layer: "split", light: 0.7 });
        this.timers.push({ t: 4.4, tick: 0, update: (dt) => {
          tor.x -= 70 * dt;
          if ((this.torTick = (this.torTick ?? 0) - dt) <= 0) {
            this.torTick = 0.25;
            for (const e of this.enemies) if (!e.dead && !e.boss && Math.abs(e.x - tor.x) < 26) damage(this, e, h.stats.atk * 0.8, { el: "ice", lift: 260, stop: 0, quiet: true, noSpark: true });
          }
        } });
        this.floatText("寒风龙卷席卷敌群", h.x, -70, "info");
        sfx("whoosh");
      },
      meteorShower: () => {
        for (let i = 0; i < 4; i++) {
          this.later(i * 0.5, () => {
            const x = h.x + (this.rng() - 0.3) * 220;
            this.fx.play("arcane/rune-circle", { x, y: 0, palette: RAMPS.danger, prio: 1, life: 1, layer: "ground" });
            this.later(0.4, () => {
              this.fx.play("fire/meteor", { x, y: 0, prio: 1, life: 2.2, layer: "split" });
              this.later(0.62, () => {
                damageRadius(this, x, -16, 50, h.stats.atk * 2.5, { el: "fire", lift: 200, stop: 0.05, shake: 3 });
                if (Math.abs(h.x - x) < 30) h.hurt(10, x, { push: 140 });
                sfx("explode", { pan: this.pan(x) });
              });
            });
          });
        }
        this.banner = { title: "陨石雨", sub: "METEOR SHOWER", t: 0, dur: 1.3, small: true, danger: true };
      },
      geyser: () => {
        const x = h.x + 70;
        this.fx.play("water/geyser", { x, y: 0, palette: ["#06101e", "#0e2a48", "#1a4e7a", "#3488b8", "#6cc4ec", "#b8ecff", "#f0fbff", "#ffffff"], prio: 1, life: 3.2 });
        this.later(1.15, () => {
          for (const e of this.enemies) if (!e.dead && Math.abs(e.x - x) < 34) damage(this, e, h.stats.atk * 2, { el: "ice", lift: 420, stop: 0.04 });
          sfx("whoosh", { pan: this.pan(x) });
          this.fx.play("water/splash", { x, y: 0, prio: 2, life: 1.6 });
        });
      },
      fountain: () => {
        const x = h.x + 40;
        this.fx.play("water/fountain", { x, y: 0, prio: 1, life: 6, layer: "back", light: 0.6 });
        this.fx.play("holy/heal-aoe", { x, y: 0, prio: 1, life: 2.6, palette: RAMPS.heal, layer: "ground" });
        this.later(1, () => {
          if (Math.abs(h.x - x) < 110) h.heal(25);
          sfx("heal");
        });
        this.floatText("治愈之泉", x, -60, "heal");
      },
      icicles: () => {
        for (let i = 0; i < 5; i++)
          this.later(i * 0.3, () => {
            const x = h.x + (this.rng() - 0.5) * 200;
            this.fx.play("ice/icicle-fall", { x, y: 0, prio: 1, life: 2, palette: RAMPS.frost });
            this.later(0.78, () => {
              damageRadius(this, x, -10, 24, h.stats.atk * 2, { el: "ice", stop: 0.03 });
              if (Math.abs(h.x - x) < 16 && h.y > -20) h.hurt(9, x);
              sfx("shatter", { pan: this.pan(x) });
            });
          });
      },
      lasers: () => {
        const x = h.x + 90;
        const grid = this.fx.play("scifi/laser-grid", { x, y: 0, prio: 1, life: 6, layer: "front", light: 0.7 });
        this.timers.push({ t: 6, tick: 0, update: (dt) => {
          for (const e of this.enemies) if (!e.dead && Math.abs(e.x - x) < 46 && e.y > -60) damage(this, e, h.stats.atk * 0.4 * dt * 6, { el: "shock", noSpark: true, quiet: true, stop: 0, noCrit: true });
        } });
        void grid;
        this.floatText("激光栅栏：把敌人逼进去！", h.x, -70, "info");
      },
      rain: () => {
        const r = this.fx.play("weather/rain", { x: 160, y: 170, screen: true, layer: "front", prio: 1, every: 2, life: 14, palette: ["#05020a", "#140628", "#2a0e4a", "#5a2a8a", "#a85ad8", "#e0a0ff", "#ffffff"], light: 0.6 });
        this.fx.play("water/rain-splash", { x: h.x + 30, y: 0, prio: 1, life: 14, layer: "ground" });
        void r;
        this.floatText("霓虹酸雨", h.x, -70, "info");
      },
      tesla: () => {
        const x = h.x + 80;
        this.fx.play("lightning/tesla-coil", { x, y: 0, prio: 1, life: 8, layer: "back", light: 0.8 });
        this.timers.push({ t: 8, tick: 0, update: (dt) => {
          if ((this.tick = (this.tick ?? 0) - dt) <= 0) {
            this.tick = 0.6;
            const e = this.nearestEnemy(x, -60, 90);
            if (e) {
              this.fx.play("fxrush/chain-bolt", { x, y: -62, pts: [[0, 0], [e.x - x, e.y - e.cy + 62]], prio: 2, layer: "top", palette: RAMPS.electric });
              damage(this, e, h.stats.atk * 1.2, { el: "shock", stop: 0.01, quiet: true });
              sfx("zap", { pan: this.pan(x) });
            }
          }
        } });
        this.floatText("特斯拉线圈为你作战", x, -80, "info");
      },
    }[name];
    ev?.();
  }
  startBoss() {
    this.phase = "boss";
    this.bossStart = this.time;
    const h = this.hero;
    const bx = h.x + 140;
    this.arena = [h.x - 140, h.x + 220];
    this.vacuum = true;
    this.later(1, () => (this.vacuum = false));
    // the crowd scatters
    for (const e of this.enemies) if (!e.dead && !e.elite) kill(this, e, { el: "shadow" });
    this.boss = makeBoss(this, this.stage.boss, bx);
    this.enemies.push(this.boss);
    this.banner = { title: "WARNING", sub: this.boss.title, t: 0, dur: 2.4, danger: true };
    sfx("roar");
    playMusic("boss");
  }

  // ------------------------------------------------------------------ decor and weather in the world
  updateDecor() {
    const st = this.stage, q = this.fx.quality;
    for (const d of st.decor) {
      const off = d.off ?? 0, first = Math.ceil((this.camX - 140 - off) / d.every), last = Math.floor((this.camX + W + 140 - off) / d.every);
      for (let k = first; k <= last; k++) {
        const x = k * d.every + off, key = `${d.id}@${x}`;
        if (this.decorAt.has(key)) continue;
        if (q === 0 && d.prio >= 3 && k % 2) continue;
        const h = this.fx.play(d.id, { x, y: d.y, layer: d.layer, prio: 2, light: d.light, life: 999, bake: true, ...(d.opts ?? {}) });
        this.decorAt.set(key, h);
      }
    }
    for (const [key, h] of this.decorAt) {
      const x = +key.split("@")[1];
      if (Math.abs(x - this.camX - W / 2) > W / 2 + 220) {
        h?.stop();
        this.decorAt.delete(key);
      }
    }
    if (!this.weatherFx.length && this.phase !== "intro") {
      for (const w of st.weather) {
        if ((w.quality ?? 0) > q) continue;
        const info = FX[w.id];
        const h = this.fx.play(w.id, { x: info.ox, y: info.oy, screen: true, layer: w.layer, prio: 3, life: 9999, light: w.light, every: 4, ...w.opts });
        if (h) this.weatherFx.push(h);
      }
    }
  }

  // ------------------------------------------------------------------ per frame
  update(rdt) {
    this.realTime += rdt;
    const h = this.hero;
    if (this.banner) {
      this.banner.t += rdt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    if (this.screenFlash && (this.screenFlash.t -= rdt) <= 0) this.screenFlash = null;
    for (const f of this.floats) f.t += rdt;
    this.floats = this.floats.filter((f) => f.t < 0.9);
    if (this.shakeT > 0) this.shakeT -= rdt;
    if (this.mode === "over") {
      // the celebration (confetti, fireworks) keeps going behind the results
      for (const t of this.timers) if (t.once && !t.done && (t.t -= rdt) <= 0) (t.done = true), t.fn();
      this.fx.camX = Math.round(this.camX);
      this.fx.update(rdt * 0.6, rdt);
      return;
    }
    // the card choice pauses the world (effects keep breathing at a crawl)
    if (this.cards) {
      this.cards.t += rdt;
      if (this.cards.chosen >= 0) {
        this.cards.closeT -= rdt;
        if (this.cards.closeT <= 0) this.cards = null;
      }
      this.fx.update(rdt * 0.08, rdt);
      return;
    }
    if (this.stopT > 0) {
      this.stopT -= rdt;
      this.fx.update(0, rdt);
      return;
    }
    let dt = rdt;
    if (this.slow) {
      dt *= this.slow.scale;
      if ((this.slow.t -= rdt) <= 0) this.slow = null;
    }
    this.time += dt;
    this.blastBudget = Math.min(8, this.blastBudget + dt * 5);

    // timers
    for (const t of this.timers) {
      if (t.done) continue;
      if (t.once) {
        if ((t.t -= dt) <= 0) {
          t.done = true;
          t.fn();
        }
      } else {
        if (t.update(dt) === true) t.done = true;
        if ((t.t -= dt) <= 0) t.done = true;
      }
    }
    this.timers = this.timers.filter((t) => !t.done);
    if (this.dangers.length) this.dangers = this.dangers.filter((d) => d.until > this.time);

    this.updateStage(dt);
    if (h.introT > 0) h.introT -= dt;
    else h.update(dt, this.enemies);
    this.skills.update(dt);
    for (const o of this.orbs) o.update?.(dt, this.time);
    if (this.pendingLevels > 0 && !h.moveOverride && !this.slow && this.phase !== "clear" && !h.dead) this.beginLevelUp();
    this.tryUltimate();
    // a mercy bloom: once per scene, when he's low, a healing flower sprouts beside him
    if (!this.bloomUsed && h.hp < h.maxHp * 0.35 && !h.dead && this.phase !== "intro") {
      this.bloomUsed = true;
      const bx = h.x + h.facing * 18;
      this.fx.play("nature/healing-bloom", { x: bx, y: 0, palette: RAMPS.heal, prio: 0, life: 2.6, layer: "split" });
      this.later(1.05, () => {
        if (Math.abs(this.hero.x - bx) < 90) this.hero.heal(35);
        sfx("heal");
      });
    }

    // monsters
    for (const e of this.enemies) {
      e.update(dt);
      updateStatus(this, e, dt);
    }
    this.separate();
    if (this.enemies.some((e) => e.removed)) this.enemies = this.enemies.filter((e) => !e.removed);
    updateProjectiles(this, dt);
    for (const p of this.pickups) p.update(dt);
    if (this.pickups.some((p) => p.dead)) this.pickups = this.pickups.filter((p) => !p.dead);
    this.combo.update(dt);
    musicIntensity(this.phase === "boss" ? 1 : 0.4 + Math.min(0.6, this.enemies.length / 25));

    // camera: lead in the direction he faces, locked inside a boss arena
    const want = h.x - W / 2 + h.facing * 26 + (this.advance ? 30 : 0);
    let cx = this.camX + (want - this.camX) * Math.min(1, dt * 4);
    if (this.arena) cx = Math.max(this.arena[0] - 20, Math.min(this.arena[1] - W + 20, cx));
    cx = Math.max(this.minX - 40, cx);
    this.camX = cx;
    this.fx.camX = Math.round(cx);
    this.updateDecor();
    this.fx.update(dt, rdt);
  }
  /** Monsters on the floor shoulder each other apart so a crowd reads as a crowd, not a stack. */
  separate() {
    const L = this.enemies;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || a.boss || a.spawning > 0) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead || b.boss || b.spawning > 0 || (a.hover > 0) !== (b.hover > 0)) continue;
        const dx = b.x - a.x, min = (a.w + b.w) * 0.7;
        if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 20) {
          const push = (min - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1);
          a.x -= push * 0.5;
          b.x += push * 0.5;
        }
      }
    }
  }

  draw(ctx) {
    const h = this.hero;
    const q = this.fx.quality;
    setCamera(this.camX);
    drawBackground(this.scene, this.camX, this.realTime, this.lastRdt ?? 1 / 60, q);
    // contact shadows on the floor
    shadowAt(h.x, this.camX, h.y, 10);
    for (const e of this.enemies) if (!e.dead && e.spawning <= 0) shadowAt(e.x, this.camX, e.y, e.w * 0.9);
    beginFrame();
    this.fx.draw("ground");
    this.fx.draw("back");
    for (const p of this.pickups) p.draw();
    // monsters behind, then the hero, flyers over the top
    for (const e of this.enemies) if (!e.hover && !e.boss) e.draw();
    this.boss?.draw();
    if (!(h.introT > 0) && !h.hidden) h.draw();
    for (const e of this.enemies) if (e.hover && !e.boss) e.draw();
    this.fx.draw("front");
    drawForeground(this.scene, this.camX, q);
    this.fx.draw("top");
    this.fx.draw("screen");
    endFrame(this.scene.lightK);
    const k = this.shakeT > 0 ? this.shakeAmp * (this.shakeT / this.shakeDur) : 0;
    const sx = Math.round(Math.sin(this.realTime * 83) * k), sy = Math.round(Math.cos(this.realTime * 67) * k * 0.7);
    ctx.putImageData(image, -M + sx, -M + sy);
    void frame;
  }
}
