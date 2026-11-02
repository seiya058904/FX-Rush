// The three bosses. Their bodies are hand-built pixel art drawn every frame with PixelFX's painter (shaded rock,
// faceted ice, a living eye), big enough to own the screen at 1x; their attacks are PixelFX effects with clear
// tells: a raised fist and a red sigil before a slam, a scanner locking on before the beam, a dark pool opening
// before the hands. Each has a second phase below half health.

import { painterFor, frame, hex, mix, noise2, createFrame, clearFrame, fxModule } from "../engine/pfx.js";
import { RAMPS } from "../fx/palettes.js";
import { damage, damageRadius } from "./combat.js";
import { Enemy } from "./enemies.js";
import { Projectile } from "./projectiles.js";
import { afflict } from "./status.js";
import { sfx } from "../engine/audio.js";
import { rigActor } from "./sprites.js";
import { SKINS } from "./rig.js";

const C = (h) => hex(h) >>> 0;
const lerp = (a, b, t) => a + (b - a) * t;

class Boss {
  constructor(g, x, o) {
    this.g = g;
    this.x = x;
    this.y = o.hoverY ?? 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = -1;
    this.maxHp = o.hp;
    this.hp = o.hp;
    this.dmg = o.dmg;
    this.box = o.box;
    this.w = (o.box[2] - o.box[0]) / 2;
    this.h = -o.box[1];
    this.cy = o.cy;
    this.weight = 99;
    this.boss = true;
    this.elite = true;
    this.title = o.title;
    this.T = { xp: 0, deathFx: null, hp: o.hp };
    this.status = {};
    this.statusFx = new Map();
    this.flash = 0;
    this.squash = 0;
    this.hurtT = 0;
    this.spawning = o.intro ?? 2.2;
    this.introLen = this.spawning;
    this.t = 0;
    this.dead = false;
    this.removed = false;
    this.hover = 0;
    this.phase2 = false;
    this.state = "idle";
    this.stateT = 1.2;
    this.attackIx = 0;
    this.id = -1;
    this.dying = 0;
    this.hpShown = o.hp;
  }
  get actorInfo() {
    return null;
  }
  hitbox() {
    const b = this.box;
    return [this.x + b[0], this.y + b[1], this.x + b[2], this.y + b[3]];
  }
  interrupt() {}
  onHit() {
    if (!this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.enterPhase2?.();
      this.g.banner = { title: "狂暴化", sub: "PHASE 2", t: 0, dur: 1.4, small: true, danger: true };
      sfx("roar");
      this.g.shake(3, 0.5);
    }
  }
  update(dt) {
    const g = this.g;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.squash = Math.max(0, this.squash - dt * 6);
    this.hpShown += (this.hp - this.hpShown) * Math.min(1, dt * 4);
    for (const k in this.status) if (this.status[k] > 0) this.status[k] -= dt;
    if (this.spawning > 0) {
      this.spawning -= dt;
      this.intro?.(dt, 1 - this.spawning / this.introLen);
      return;
    }
    if (this.dead) {
      this.dying += dt;
      this.deathUpdate?.(dt);
      if (this.dying > 2.4) this.removed = true;
      return;
    }
    this.facing = g.hero.x >= this.x ? 1 : -1;
    const slow = this.status.stunned > 0 || this.status.frozen > 0 ? 0.35 : 1;
    this.stateT -= dt * slow * (this.phase2 ? 1.3 : 1);
    if (this.stateT <= 0) this.nextAttack();
    this.think?.(dt * slow);
  }
  /** Hurt the hero if he's inside a world box. */
  hurtBox(x0, y0, x1, y1, mult = 1, o = {}) {
    const h = this.g.hero;
    if (h.x + 7 > x0 && h.x - 7 < x1 && h.y - 34 < y1 && h.y > y0) return h.hurt(this.dmg * mult, o.fromX ?? this.x, { push: o.push ?? 160, lift: o.lift ?? 0 });
    return false;
  }
  die() {
    this.dead = true;
    this.dying = 0;
    for (const hh of this.handles ?? []) hh?.stop?.();
    this.onDie?.();
  }
  /** A red sigil on the floor: something will land here. */
  warnAt(x, t = 0.9, pal, r = 28) {
    this.g.danger(x - r, x + r, t, 0.3);
    this.g.fx.play("arcane/rune-circle", { x, y: 0, palette: pal ?? this.g.theme.danger, prio: 0, life: t, layer: "ground", light: 0.8 });
  }
}

// ---------------------------------------------------------------- shading helpers
function rock(p, cx, cy, rx, ry, pal, o = {}) {
  const { crack = 0, seed = 1, t = 0, flash = 0 } = o;
  p.shade(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, out) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d2 = dx * dx + dy * dy;
    if (d2 > 1) return;
    const d = Math.sqrt(d2), lit = -(dx * 0.75 + dy * 0.85);
    let c = d > 0.9 ? pal.ink : lit > 0.42 && d > 0.45 ? pal.hi : lit > 0.05 ? pal.base : lit < -0.45 ? pal.dark : pal.mid;
    if (crack > 0 && d < 0.86) {
      const n = noise2(x * 0.16 + seed * 7, y * 0.16, seed);
      if (Math.abs(n - 0.5) < 0.05) {
        const pulse = 0.65 + 0.35 * Math.sin(t * 3 + x * 0.1 + y * 0.07);
        c = pulse * crack > 0.8 ? pal.lavaH : pal.lava;
        out.l = pal.lavaL;
        out.k = 0.55 * crack * pulse;
      }
    }
    if (flash > 0) c = mix(c, C("#ffffff"), flash) >>> 0;
    return c;
  });
}
function limb(p, x0, y0, x1, y1, w0, w1, pal, o = {}) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, r = Math.max(w0, w1) / 2;
  p.shade(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (x, y, out) => {
    const u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2)), px = x0 + dx * u - x, py = y0 + dy * u - y;
    const rr = (w0 + (w1 - w0) * u) / 2, d = Math.hypot(px, py) / rr;
    if (d > 1) return;
    const side = (px * dy - py * dx) / Math.sqrt(L2) / rr; // -1..1 across the limb
    let c = d > 0.85 ? pal.ink : side > 0.35 ? pal.hi : side < -0.4 ? pal.dark : pal.base;
    if (o.crack && Math.abs(noise2(x * 0.2 + 3, y * 0.2, 5) - 0.5) < 0.05 && d < 0.8) {
      c = pal.lava;
      out.l = pal.lavaL;
      out.k = 0.5 * o.crack;
    }
    if (o.flash) c = mix(c, C("#ffffff"), o.flash) >>> 0;
    return c;
  });
}

// ================================================================ Cinder Colossus
const BASALT = { ink: C("#0a0508"), dark: C("#1c0f12"), mid: C("#2a171a"), base: C("#3a2024"), hi: C("#5a3434"), lava: C("#ff6a1a"), lavaH: C("#ffd060"), lavaL: C("#ff7a2a") };

class Colossus extends Boss {
  constructor(g, x) {
    super(g, x, { hp: 3200, dmg: 13, box: [-28, -78, 28, 0], cy: 44, title: "余烬巨像 · CINDER COLOSSUS", intro: 2.4 });
    this.arms = { f: [30, -20], b: [-28, -22] }; // fists (front, back), local, facing right
    this.target = { f: [30, -20], b: [-28, -22] };
    this.eye = 0;
    this.mouth = 0;
    this.lift = 40; // rises out of the floor during the intro
    this.order = ["slam", "breath", "boulder", "meteors", "slam", "pillars"];
  }
  intro(dt, u) {
    this.lift = 40 * (1 - u) ** 2;
    if (!this.introFx) {
      this.introFx = true;
      this.g.fx.play("spawn/summon-rise", { x: this.x, y: 0, prio: 0, layer: "split", speed: 1.5, life: 2.4 });
      this.g.fx.play("ui/countdown", { x: 160, y: 70, screen: true, from: 2, word: "FIGHT!", prio: 0, layer: "top", life: 2.4, speed: 1.15, palette: RAMPS.dangerHot });
    }
    if (Math.random() < 0.3) this.g.shake(1.5, 0.1);
  }
  nextAttack() {
    const name = this.order[this.attackIx++ % this.order.length];
    this[name]();
  }
  think(dt) {
    // fists move to their targets with a heavy ease; the body drifts toward the hero slowly
    for (const k of ["f", "b"]) {
      this.arms[k][0] += (this.target[k][0] - this.arms[k][0]) * Math.min(1, dt * (this.fast ? 22 : 7));
      this.arms[k][1] += (this.target[k][1] - this.arms[k][1]) * Math.min(1, dt * (this.fast ? 22 : 7));
    }
    if (this.state === "idle") {
      const dx = this.g.hero.x - this.x;
      if (Math.abs(dx) > 70) this.x += Math.sign(dx) * 14 * dt;
      this.target.f = [30, -20 + Math.sin(this.t * 2) * 3];
      this.target.b = [-28, -22 + Math.sin(this.t * 2 + 1) * 3];
    }
    this.eye = Math.max(0, this.eye - dt * 2);
    this.mouth = Math.max(0, this.mouth - dt * 2);
  }
  hold(t) {
    this.state = "attack";
    this.stateT = t;
  }
  done(after = 1.1) {
    this.later(after * 0.3, () => {
      this.state = "idle";
    });
    this.stateT = after + 0.9;
  }
  later(t, fn) {
    this.g.later(t, () => !this.dead && fn());
  }
  slam() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.fast = false;
    this.target.f = [18, -96];
    this.target.b = [-14, -92];
    this.eye = 1;
    sfx("warn");
    const hx = this.x + f * 42;
    this.warnAt(hx, 1);
    g.danger(hx - 150, hx + 150, 0.98, 0.45, "jump");
    this.later(0.85, () => {
      this.fast = true;
      this.target.f = [42, -8];
      this.target.b = [34, -10];
      this.later(0.08, () => {
        g.fx.play("impacts/ground-slam", { x: hx, y: 0, palette: RAMPS.fire, prio: 0, life: 2, reach: 140, light: 1 });
        g.fx.play("explosions/dirt-explosion", { x: hx, y: 0, prio: 1, life: 1.1, light: 0.8 });
        g.shake(4, 0.45);
        g.hitStop(0.08);
        sfx("bigboom", { pan: g.pan(hx) });
        this.hurtBox(hx - 30, -50, hx + 30, 4, 1.4, { lift: 160 });
        // the shock waves run out along the floor: jump them
        for (let i = 1; i <= 6; i++)
          this.later(i * 0.06, () => {
            for (const s of [-1, 1]) {
              const wx = hx + s * i * 22;
              this.hurtBox(wx - 10, -10, wx + 10, 4, 0.8, { fromX: hx });
            }
          });
        this.later(0.5, () => (this.fast = false));
        this.done(this.phase2 ? 0.9 : 1.4);
      });
    });
  }
  breath() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.eye = 1;
    this.mouth = 1;
    this.target.f = [26, -40];
    sfx("warn");
    const mx = this.x + f * 6, my = -68;
    g.danger(f > 0 ? mx : mx - 150, f > 0 ? mx + 150 : mx, 0.7, 1.5);
    g.fx.play("lightning/charge-up", { x: mx, y: my, center: true, palette: RAMPS.fire, prio: 1, life: 0.7, layer: "top", speed: 2.4 });
    this.later(0.7, () => {
      const h = g.fx.play("fire/fire-breath", { x: mx + f * 8, y: my, flip: f < 0, angle: f * 0.42, palette: RAMPS.fire, prio: 0, life: 1.5, layer: "front", light: 1 });
      sfx("fire", { w: 1, pan: g.pan(mx) });
      let n = 0;
      g.timers.push({ t: 1.5, tick: 0, update: (dt) => {
        this.mouth = 1;
        if ((this.tick = (this.tick ?? 0) - dt) <= 0) {
          this.tick = 0.25;
          const x0 = f > 0 ? mx + 10 : mx - 150, x1 = f > 0 ? mx + 150 : mx - 10;
          if (this.hurtBox(x0, -60, x1, 4, 0.45, { push: 90 })) n++;
          for (const e of g.enemies) if (!e.boss && !e.dead && e.x > x0 && e.x < x1) afflict(g, e, "burning", 2);
        }
      } });
      void h;
      this.done(this.phase2 ? 2 : 2.4);
    });
  }
  boulder() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.target.f = [-10, -84];
    this.later(0.5, () => {
      this.target.f = [38, -40];
      this.fast = true;
      const x0 = this.x + f * 12;
      g.fx.play("nature/boulder", { x: x0, y: 0, flip: f < 0, palette: RAMPS.lava, prio: 0, life: 2.2, light: 0.9, size: 13 });
      sfx("whoosh", { pan: g.pan(x0) });
      const land = x0 + f * 116;
      this.warnAt(land, 0.55);
      this.later(0.5, () => {
        this.hurtBox(land - 26, -40, land + 26, 4, 1.1, { fromX: land, lift: 140 });
        g.shake(3, 0.3);
        sfx("heavy", { pan: g.pan(land) });
        this.fast = false;
      });
      this.done(1.2);
    });
  }
  meteors() {
    const g = this.g;
    this.hold(9);
    this.target.f = [10, -100];
    this.target.b = [-8, -98];
    this.eye = 1;
    sfx("roar");
    const n = this.phase2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      this.later(0.4 + i * 0.35, () => {
        const x = g.hero.x + (g.rng() - 0.5) * 120;
        this.warnAt(x, 1);
        this.later(0.35, () => {
          g.fx.play("fire/meteor", { x, y: 0, palette: RAMPS.fire, prio: 0, life: 2.2, layer: "split", light: 1 });
          this.later(0.62, () => {
            this.hurtBox(x - 24, -40, x + 24, 4, 1, { fromX: x, lift: 120 });
            damageRadius(g, x, -16, 40, g.hero.stats.atk * 1.5, { el: "fire", quiet: true, stop: 0 });
            g.shake(2.5, 0.25);
            sfx("explode", { pan: g.pan(x) });
          });
        });
      });
    }
    this.done(0.6 + n * 0.35 + 1.4);
  }
  pillars() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.target.f = [36, -12];
    this.target.b = [30, -14];
    g.shake(2, 0.2);
    sfx("earth");
    for (let i = 0; i < 5; i++) {
      const x = this.x + f * (50 + i * 34);
      this.later(i * 0.22, () => {
        this.warnAt(x, 0.6);
        this.later(0.05, () => g.fx.play("fire/flame-pillar", { x, y: 0, palette: RAMPS.fire, prio: 0, life: 2, height: 120, light: 0.9, layer: "split" }));
        this.later(0.6, () => {
          this.hurtBox(x - 14, -120, x + 14, 4, 1, { fromX: x, lift: 200 });
          sfx("fire", { pan: g.pan(x) });
        });
      });
    }
    this.done(2.4);
  }
  enterPhase2() {
    const g = this.g;
    this.order = ["slam", "meteors", "breath", "pillars", "tornado", "slam", "boulder"];
    this.rageFx = g.fx.play("fire/fire-ring", { x: this.x, y: 0, palette: RAMPS.fire, prio: 0, life: 2.4, reach: 120 });
    this.later(0.35, () => this.hurtBox(this.x - 80, -30, this.x + 80, 4, 0.8, { lift: 160 }));
  }
  tornado() {
    const g = this.g, f = this.facing, tor = { x: this.x + f * 30, y: 0 };
    this.hold(9);
    this.eye = 1;
    g.fx.play("fire/fire-tornado", { follow: tor, palette: RAMPS.fire, prio: 0, life: 3.2, layer: "split", light: 0.9, height: 90 });
    sfx("fire", { w: 1 });
    g.timers.push({ t: 3.2, tick: 0, update(dt) {
      tor.x += f * 70 * dt;
      if ((this.tick -= dt) <= 0) {
        this.tick = 0.3;
        if (Math.abs(g.hero.x - tor.x) < 18 && g.hero.y > -60) g.hero.hurt(8, tor.x, { lift: 200, push: 60 });
      }
    } });
    this.done(1.6);
  }
  onDie() {
    const g = this.g;
    for (let i = 0; i < 5; i++)
      g.later(0.15 + i * 0.22, () => {
        const x = this.x + (g.rng() - 0.5) * 50, y = -10 - g.rng() * 60;
        g.fx.play("explosions/small-explosion", { x, y: Math.min(0, y + 20), palette: RAMPS.fire, prio: 0, life: 1.6, size: 0.8 });
        sfx("explode", { pan: g.pan(x) });
        g.shake(3, 0.2);
      });
    g.later(1.3, () => {
      g.fx.play("explosions/big-explosion", { x: this.x, y: 0, palette: RAMPS.fire, prio: 0, life: 3.4, light: 1 });
      sfx("bigboom");
      g.shake(4, 0.7);
      g.flashScreen(0.25, "#fff0c0");
    });
  }
  drawBody(p, t, fl) {
    const a = this.arms, lift = this.lift, bob = Math.round(Math.sin(t * 2) * 1.2) + lift;
    const crack = 0.7 + this.eye * 0.6 + (this.phase2 ? 0.4 : 0) + (this.dead ? this.dying : 0);
    const o = { crack, t, flash: fl };
    // back arm
    const sb = [-22, -58 + bob], eb = [lerp(sb[0], a.b[0], 0.5) - 6, lerp(sb[1], a.b[1], 0.5) + 2];
    limb(p, sb[0], sb[1], eb[0], eb[1], 16, 13, BASALT, { crack: crack * 0.6, flash: fl });
    limb(p, eb[0], eb[1], a.b[0], a.b[1] + bob, 13, 12, BASALT, { crack: crack * 0.6, flash: fl });
    rock(p, a.b[0], a.b[1] + bob, 10, 9, { ...BASALT, base: BASALT.mid }, { ...o, seed: 4 });
    // legs
    limb(p, -12, -26 + bob, -15, -2, 17, 15, BASALT, { crack: crack * 0.5, flash: fl });
    limb(p, 12, -26 + bob, 15, -2, 17, 15, BASALT, { crack: crack * 0.5, flash: fl });
    rock(p, -15, -3, 11, 4, BASALT, { flash: fl });
    rock(p, 16, -3, 11, 4, BASALT, { flash: fl });
    // torso
    rock(p, 0, -46 + bob, 28, 25, BASALT, { ...o, seed: 1 });
    rock(p, -21, -60 + bob, 12, 10, BASALT, { ...o, seed: 2 });
    rock(p, 22, -61 + bob, 13, 11, BASALT, { ...o, seed: 3 });
    // molten heart
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    p.circle(2, -46 + bob, 5 + pulse, (d) => (d < 0.4 ? C("#ffffff") : d < 0.75 ? C("#ffe27a") : C("#ff7a2a")));
    p.glow(2, -46 + bob, 26, C("#ff6a1a"), 0.5 + pulse * 0.3);
    // head and horns
    const hy = -76 + bob;
    p.poly([[-9, hy - 2], [-15, hy - 13], [-12, hy - 16], [-5, hy - 6]], (x, y) => (y < hy - 12 ? C("#d8c8a8") : C("#7a6a5a")));
    p.poly([[9, hy - 2], [17, hy - 14], [14, hy - 17], [5, hy - 6]], (x, y) => (y < hy - 12 ? C("#d8c8a8") : C("#8a7a6a")));
    rock(p, 1, hy, 11, 9, BASALT, { ...o, seed: 6 });
    // eyes and mouth
    const ec = this.eye > 0.3 ? C("#ffffff") : C("#ffd060");
    p.rect(3, hy - 2, 3, 1, ec);
    p.rect(8, hy - 2, 2, 1, ec);
    p.glow(6, hy - 2, 10 + this.eye * 8, C("#ff8a2a"), 0.7 + this.eye * 0.5);
    if (this.mouth > 0) {
      p.rect(3, hy + 3, 8, 2, C("#ffe27a"));
      p.glow(8, hy + 4, 14, C("#ff6a1a"), 0.8);
    }
    // front arm
    const sf = [22, -60 + bob], ef = [lerp(sf[0], a.f[0], 0.5) + 6, lerp(sf[1], a.f[1], 0.5) + 2];
    limb(p, sf[0], sf[1], ef[0], ef[1], 18, 15, BASALT, { crack, flash: fl });
    limb(p, ef[0], ef[1], a.f[0], a.f[1] + bob, 15, 14, BASALT, { crack, flash: fl });
    rock(p, a.f[0], a.f[1] + bob, 12, 11, BASALT, { ...o, seed: 5 });
    if (this.eye > 0.5 && this.state === "attack") p.glow(a.f[0], a.f[1] + bob, 18, C("#ff2a10"), 0.5);
  }
  draw() {
    if (this.removed) return;
    const p = painterFor(frame).place(this.x, this.y, this.facing < 0);
    const fl = this.flash > 0.5 ? 0.3 : this.dead ? Math.min(1, this.dying * 0.6) : 0;
    if (this.dead && this.dying > 1.35) return;
    this.drawBody(p, this.t, fl);
  }
}

// ================================================================ Glacier Warden
const ICE = { ink: C("#04081a"), dark: C("#1a3a6a"), mid: C("#2a5a94"), base: C("#4a8cc8"), hi: C("#a8e4ff"), white: C("#f0fbff") };

class Glacier extends Boss {
  constructor(g, x) {
    super(g, x, { hp: 4800, dmg: 14, box: [-26, -96, 26, -24], cy: 62, title: "冰川守望者 · GLACIER WARDEN", intro: 2.4, hoverY: 0 });
    this.hands = { f: [34, -50], b: [-34, -54] };
    this.target = { f: [34, -50], b: [-34, -54] };
    this.order = ["spikes", "icicles", "breath", "orb", "wave", "spikes", "jet"];
    this.glow = 0;
    this.y = 0;
    this.float = 0;
  }
  intro(dt, u) {
    if (!this.introFx) {
      this.introFx = true;
      this.g.fx.play("ice/freeze", { x: this.x, y: 0, actor: rigActor(SKINS.frost).actor, palette: RAMPS.frost, prio: 0, life: 2.4, speed: 1.6, layer: "split" });
      this.g.fx.play("ui/countdown", { x: 160, y: 70, screen: true, from: 2, word: "FIGHT!", prio: 0, layer: "top", life: 2.4, speed: 1.15, palette: RAMPS.frost });
      this.g.fx.play("weather/god-rays", { x: 160, y: 170, screen: true, layer: "back", prio: 1, life: 6, palette: ["#04060e", "#0a1830", "#14305a", "#2a5a8a", "#5a9ac8", "#a8dcf0", "#e8faff", "#ffffff"], light: 0.5 });
    }
    this.float = u;
  }
  later(t, fn) {
    this.g.later(t, () => !this.dead && fn());
  }
  hold(t) {
    this.state = "attack";
    this.stateT = t;
  }
  done(after = 1.2) {
    this.stateT = after + 0.9;
    this.later(after * 0.3, () => (this.state = "idle"));
  }
  nextAttack() {
    this[this.order[this.attackIx++ % this.order.length]]();
  }
  think(dt) {
    for (const k of ["f", "b"]) {
      this.hands[k][0] += (this.target[k][0] - this.hands[k][0]) * Math.min(1, dt * 6);
      this.hands[k][1] += (this.target[k][1] - this.hands[k][1]) * Math.min(1, dt * 6);
    }
    if (this.state === "idle") {
      const dx = this.g.hero.x - this.x;
      if (Math.abs(dx) > 80) this.x += Math.sign(dx) * 18 * dt;
      this.target.f = [34, -50 + Math.sin(this.t * 1.6) * 5];
      this.target.b = [-34, -54 + Math.sin(this.t * 1.6 + 2) * 5];
    }
    this.glow = Math.max(0, this.glow - dt * 1.5);
  }
  spikes() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.target.f = [30, -96];
    this.glow = 1;
    sfx("warn");
    this.later(0.6, () => {
      this.target.f = [40, -18];
      const x0 = this.x + f * 26;
      g.danger(x0, x0 + f * 180, 0.05, 0.5, "jump");
      g.fx.play("ice/ice-spikes", { x: x0, y: 0, flip: f < 0, palette: RAMPS.frost, prio: 0, life: 2, reach: 172, light: 0.9, layer: "split" });
      sfx("ice", { pan: g.pan(x0) });
      for (let i = 0; i < 7; i++) this.later(0.04 + i * 0.065, () => this.hurtBox(x0 + f * (i * 25) - 13, -40, x0 + f * (i * 25) + 13, 4, 0.9, { lift: 180 }));
      this.done(this.phase2 ? 1.2 : 1.6);
    });
  }
  icicles() {
    const g = this.g;
    this.hold(9);
    this.target.f = [20, -100];
    this.target.b = [-20, -100];
    this.glow = 1;
    const n = this.phase2 ? 7 : 5;
    for (let i = 0; i < n; i++)
      this.later(0.3 + i * 0.25, () => {
        const x = g.hero.x + (g.rng() - 0.5) * 140;
        this.warnAt(x, 0.9, RAMPS.dangerCold);
        this.later(0.15, () => g.fx.play("ice/icicle-fall", { x, y: 0, palette: RAMPS.frost, prio: 0, life: 2, layer: "split" }));
        this.later(0.9, () => {
          this.hurtBox(x - 12, -40, x + 12, 4, 0.8, { fromX: x });
          sfx("shatter", { pan: g.pan(x) });
        });
      });
    this.done(0.6 + n * 0.25 + 1);
  }
  breath() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.glow = 1;
    sfx("warn");
    const mx = this.x + f * 14, my = -66;
    g.danger(f > 0 ? mx : mx - 160, f > 0 ? mx + 160 : mx, 0.6, 1.6);
    this.later(0.6, () => {
      g.fx.play("ice/frost-breath", { x: mx, y: my, flip: f < 0, angle: f * 0.45, palette: RAMPS.frost, prio: 0, life: 1.6, layer: "front", light: 0.9 });
      sfx("ice", { pan: g.pan(mx) });
      g.timers.push({ t: 1.6, tick: 0, update: (dt) => {
        if ((this.tick = (this.tick ?? 0) - dt) <= 0) {
          this.tick = 0.3;
          const x0 = f > 0 ? mx + 10 : mx - 160, x1 = f > 0 ? mx + 160 : mx - 10;
          if (this.hurtBox(x0, -50, x1, 4, 0.4, { push: 60 })) g.slowHero(1.5);
        }
      } });
      this.done(2.4);
    });
  }
  orb() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.target.b = [10, -90];
    this.later(0.5, () => {
      const sx = this.x + f * 10, sy = -84, h = g.hero, tx = h.x, t = 0.9;
      const p = new Projectile(g, {
        x: sx, y: sy, vx: (tx - sx) / t, vy: (0 - sy) / t - (450 * t) / 2, gravity: 450, fx: "water/water-orb", fxOpts: { palette: RAMPS.frost, radius: 12, light: 0.8 }, center: true,
        hostile: true, dmg: this.dmg, r: 10, life: 3,
        onEnd: (gg, pr) => {
          gg.fx.play("water/splash", { x: pr.x, y: 0, prio: 0, life: 1.6, palette: RAMPS.frost });
          if (Math.abs(gg.hero.x - pr.x) < 36 && gg.hero.y > -30) gg.hero.hurt(this.dmg * 0.8, pr.x, { push: 160 });
          sfx("whoosh", { pan: gg.pan(pr.x) });
        },
      });
      g.projectiles.push(p);
      this.warnAt(tx, 0.9, RAMPS.dangerCold);
      this.done(1.4);
    });
  }
  wave() {
    const g = this.g, f = this.facing, x = g.hero.x - f * 10;
    this.hold(9);
    this.glow = 1;
    this.warnAt(x, 1.3, RAMPS.dangerCold);
    g.fx.play("water/wave-crash", { x: x - f * 40, y: 0, flip: f < 0, palette: RAMPS.frost, prio: 0, life: 3, light: 0.7 });
    sfx("whoosh");
    this.later(1.25, () => {
      this.hurtBox(x - 40, -60, x + 40, 4, 1, { fromX: this.x, push: 220 });
      sfx("explode", { w: 0.3, pan: g.pan(x) });
      g.shake(2, 0.3);
    });
    this.done(2.2);
  }
  jet() {
    const g = this.g, f = this.facing;
    this.hold(9);
    this.target.f = [40, -30];
    g.danger(f > 0 ? this.x : this.x - 160, f > 0 ? this.x + 160 : this.x, 0.5, 1.3);
    this.later(0.5, () => {
      const jx = this.x + f * 40, jy = -30;
      g.fx.play("water/water-jet", { x: jx, y: jy, flip: f < 0, palette: RAMPS.frost, prio: 0, life: 1.3, light: 0.8 });
      g.timers.push({ t: 1.3, tick: 0, update: (dt) => {
        if ((this.tick = (this.tick ?? 0) - dt) <= 0) {
          this.tick = 0.25;
          const x0 = f > 0 ? jx : jx - 118, x1 = f > 0 ? jx + 118 : jx;
          this.hurtBox(x0, -44, x1, -16, 0.4, { push: 260 });
        }
      } });
      sfx("whoosh", { pan: g.pan(jx) });
      this.done(1.8);
    });
  }
  enterPhase2() {
    const g = this.g;
    this.order = ["icicles", "spikes", "vortex", "breath", "wave", "orb", "jet"];
    this.blizzard = g.fx.play("weather/blizzard", { x: 160, y: 170, screen: true, layer: "front", prio: 1, life: 999, light: 0.5 });
    this.handles = [this.blizzard];
  }
  vortex() {
    const g = this.g, x = g.hero.x + (g.rng() - 0.5) * 60, v = { x, y: 0 };
    this.hold(9);
    g.fx.play("water/whirlpool", { x, y: 2, palette: RAMPS.frost, prio: 1, life: 3, layer: "ground", light: 0.6 });
    g.fx.play("ice/blizzard-vortex", { follow: v, palette: RAMPS.frost, prio: 0, life: 3, layer: "split", light: 0.8 });
    g.timers.push({ t: 3, tick: 0, update: (dt) => {
      const h = g.hero;
      if (Math.abs(h.x - v.x) < 90) h.vx += Math.sign(v.x - h.x) * 140 * dt;
      if ((this.vtick = (this.vtick ?? 0) - dt) <= 0) {
        this.vtick = 0.4;
        this.hurtBox(v.x - 14, -80, v.x + 14, 4, 0.35, { fromX: v.x, push: 40 });
      }
    } });
    this.done(2.4);
  }
  onDie() {
    const g = this.g;
    this.blizzard?.stop();
    for (let i = 0; i < 6; i++)
      g.later(0.1 + i * 0.18, () => {
        const x = this.x + (g.rng() - 0.5) * 50, y = -40 - g.rng() * 50;
        g.fx.play("ice/snowflake-burst", { x, y: y + 22, palette: RAMPS.frost, prio: 0, life: 1.6, count: 12 });
        sfx("shatter", { pan: g.pan(x) });
      });
    g.later(1.2, () => {
      g.fx.play("ice/ice-shatter", { x: this.x, y: -20, palette: RAMPS.frost, prio: 0, life: 2.4 });
      g.fx.play("explosions/plasma-explosion", { x: this.x, y: -10, palette: RAMPS.frost, accent: ["#ffffff", "#c8f0ff"], prio: 0, life: 2, light: 1 });
      sfx("bigboom");
      g.flashScreen(0.25, "#e8f8ff");
    });
  }
  crystal(p, cx, cy, s, fl, glow) {
    // a faceted crystal: left facets lit, right in shade, a bright ridge, a dark ink rim
    const top = [cx, cy - s * 1.5], L = [cx - s * 0.75, cy - s * 0.2], R = [cx + s * 0.75, cy - s * 0.2], bot = [cx, cy + s * 1.2], mid = [cx + s * 0.1, cy - s * 0.1];
    const f = (c) => (fl ? mix(c, C("#ffffff"), fl) >>> 0 : c);
    p.poly([top, L, mid], f(ICE.hi));
    p.poly([top, mid, R], f(ICE.base));
    p.poly([L, bot, mid], f(ICE.mid));
    p.poly([mid, bot, R], f(ICE.dark));
    p.line(top[0], top[1], mid[0], mid[1], f(ICE.white));
    p.polyline([top, L, bot, R, top], ICE.ink);
    p.glow(cx, cy, s * 1.8, C("#58b4ec"), 0.25 + glow * 0.4);
  }
  drawBody(p, t, fl) {
    const by = -62 + Math.sin(t * 1.4) * 3 + (1 - this.float) * 40;
    const glow = this.glow + (this.phase2 ? 0.5 : 0);
    // mist under it
    p.ellipse(0, -2, 26, 4, C("#9cc0e0"), 0.35);
    // back hand
    this.crystal(p, this.hands.b[0], this.hands.b[1] + by + 62, 8, fl * 0.6, glow * 0.5);
    // crown of icicles
    for (let i = -2; i <= 2; i++) {
      const x = i * 7, h = 14 + (2 - Math.abs(i)) * 7;
      p.poly([[x - 3, by - 26], [x + 3, by - 26], [x + Math.sign(i) * 2, by - 26 - h]], (xx) => (xx < x ? ICE.hi : ICE.mid));
    }
    // the body
    this.crystal(p, 0, by, 26, fl, glow);
    // inner core
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    p.circle(2, by + 2, 6 + pulse * 2, (d) => (d < 0.35 ? C("#ffffff") : d < 0.7 ? C("#b8ecff") : C("#58b4ec")));
    p.glow(2, by + 2, 34, C("#6cc4ec"), 0.45 + glow * 0.4 + pulse * 0.2);
    // eyes
    p.rect(5, by - 14, 4, 1, C("#ffffff"));
    p.rect(12, by - 14, 3, 1, C("#ffffff"));
    p.glow(9, by - 14, 10, C("#c8f8ff"), 0.6 + glow * 0.6);
    // front hand
    this.crystal(p, this.hands.f[0], this.hands.f[1] + by + 62, 10, fl, glow);
  }
  draw() {
    if (this.removed || (this.dead && this.dying > 1.25)) return;
    const p = painterFor(frame).place(this.x, 0, this.facing < 0);
    const fl = this.flash > 0.5 ? 0.3 : this.dead ? Math.min(1, this.dying * 0.7) : 0;
    this.drawBody(p, this.t, fl);
  }
}

// ================================================================ Void Oculus
class Oculus extends Boss {
  constructor(g, x) {
    super(g, x, { hp: 5400, dmg: 15, box: [-24, -96, 24, -46], cy: 70, title: "虚空之眼 · VOID OCULUS", intro: 2.6 });
    this.order = ["beam", "hands", "starfall", "tendrils", "beam", "hex", "summon"];
    this.look = 0;
    this.blink = 0;
    this.open = 0;
    this.ey = -70;
  }
  intro(dt, u) {
    const g = this.g;
    if (!this.introFx) {
      this.introFx = true;
      this.body = g.fx.play("shadow/void-orb", { x: this.x, y: this.ey, follow: this, dy: this.ey, center: true, palette: RAMPS.void, prio: 0, life: 999, layer: "back", light: 0.9 });
      g.fx.play("arcane/portal", { x: this.x, y: this.ey + 30, palette: RAMPS.void, prio: 0, life: 2.4, layer: "back" });
      g.fx.play("ui/countdown", { x: 160, y: 70, screen: true, from: 2, word: "FIGHT!", prio: 0, layer: "top", life: 2.4, speed: 1.15, palette: RAMPS.dangerVoid });
      this.handles = [this.body];
    }
    this.open = u;
  }
  later(t, fn) {
    this.g.later(t, () => !this.dead && fn());
  }
  hold(t) {
    this.state = "attack";
    this.stateT = t;
  }
  done(after = 1.2) {
    this.stateT = after + 0.9;
    this.later(after * 0.3, () => (this.state = "idle"));
  }
  nextAttack() {
    this[this.order[this.attackIx++ % this.order.length]]();
  }
  think(dt) {
    const h = this.g.hero;
    const want = Math.atan2(h.y - 20 - this.ey, h.x - this.x);
    this.look += (want - this.look) * Math.min(1, dt * 5);
    if (this.state === "idle") {
      const dx = h.x - this.x;
      if (Math.abs(dx) > 90) this.x += Math.sign(dx) * 20 * dt;
      this.ey = -70 + Math.sin(this.t * 1.3) * 6;
    }
    if ((this.blink -= dt) < -3.5) this.blink = 0.18;
  }
  beam() {
    const g = this.g, h = g.hero;
    this.hold(9);
    // the scanner locks on to him: that's the tell
    g.fx.play("scifi/scanner", { x: h.x, y: h.y, follow: h, actor: rigActor(SKINS.hero).actor, palette: RAMPS.dangerVoid, prio: 0, life: 1, layer: "split" });
    sfx("warn");
    g.danger(h.x - 22, h.x + 22, 0.95, 0.4);
    this.later(0.95, () => {
      const ang = Math.atan2(h.y - 18 - this.ey, h.x - this.x), f = Math.cos(ang) >= 0 ? 1 : -1;
      const beamAng = f > 0 ? ang : Math.PI - ang;
      g.fx.play("arcane/arcane-beam", { x: this.x, y: this.ey + 24, flip: f < 0, angle: f > 0 ? beamAng : -beamAng, palette: RAMPS.dangerVoid, prio: 0, life: 1.2, layer: "front", light: 1 });
      sfx("laser");
      g.timers.push({ t: 1.1, tick: 0, update: (dt) => {
        if ((this.btick = (this.btick ?? 0) - dt) <= 0) {
          this.btick = 0.2;
          // distance from the hero to the beam's line
          const dx = h.x - this.x, dy = h.y - 18 - this.ey, along = dx * Math.cos(ang) + dy * Math.sin(ang), perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
          if (along > 0 && perp < 12) {
            h.hurt(this.dmg * 0.5, this.x, { push: 120 });
            g.fx.play("scifi/glitch", { x: h.x, y: h.y, follow: h, actor: rigActor(SKINS.hero).actor, prio: 1, life: 0.6, layer: "split" });
          }
        }
      } });
      this.done(1.8);
    });
  }
  hands() {
    const g = this.g, h = g.hero;
    this.hold(9);
    const n = this.phase2 ? 3 : 2;
    for (let i = 0; i < n; i++)
      this.later(i * 0.45, () => {
        const x = h.x + (i ? (g.rng() - 0.5) * 80 : 0);
        g.danger(x - 32, x + 32, 0.62, 0.3);
        g.fx.play("shadow/grasping-hands", { x, y: 0, palette: RAMPS.void, prio: 0, life: 2.4, layer: "split", light: 0.8 });
        this.later(0.62, () => {
          if (this.hurtBox(x - 30, -40, x + 30, 4, 0.9, { fromX: x, lift: 120 })) g.slowHero(1);
          sfx("whoosh", { pan: g.pan(x) });
        });
      });
    this.done(n * 0.45 + 1.3);
  }
  tendrils() {
    const g = this.g, h = g.hero;
    this.hold(9);
    for (const s of [-1, 1]) {
      const x = h.x + s * 46;
      g.danger(x - 36, x + 36, 0.6, 0.4);
      g.fx.play("shadow/shadow-tendrils", { x, y: 0, palette: RAMPS.void, prio: 0, life: 2.6, layer: "split" });
      this.later(0.6, () => this.hurtBox(x - 34, -60, x + 34, 4, 0.8, { fromX: x, lift: 140 }));
    }
    sfx("whoosh");
    this.done(2);
  }
  starfall() {
    const g = this.g, x = g.hero.x;
    this.hold(9);
    this.blink = -1;
    g.fx.play("arcane/star-fall", { x, y: 0, palette: RAMPS.dangerVoid, prio: 0, life: 2.4, layer: "split", light: 0.9 });
    this.warnAt(x, 1.4, RAMPS.dangerVoid);
    for (let k = 0; k < 6; k++) this.later(0.45 + k * 0.18, () => this.hurtBox(x - 50, -30, x + 50, 4, 0.3, { fromX: x, push: 60 }));
    sfx("magic", { pitch: 0.5 });
    this.done(2.2);
  }
  hex() {
    const g = this.g, h = g.hero;
    this.hold(9);
    g.fx.play("shadow/hex-sigil", { x: h.x, y: h.y, palette: RAMPS.dangerVoid, prio: 0, life: 2, layer: "top" });
    sfx("warn");
    const hx0 = h.x;
    g.danger(hx0 - 60, hx0 + 60, 1.6, 0.2);
    this.later(1.6, () => {
      if (Math.abs(g.hero.x - hx0) < 60) {
        g.fx.play("shadow/curse", { x: h.x, y: h.y, follow: h, actor: rigActor(SKINS.hero).actor, palette: RAMPS.void, prio: 0, life: 2, layer: "split" });
        g.slowHero(3);
        h.hurt(this.dmg * 0.5, this.x, { push: 40 });
      }
    });
    this.done(2.2);
  }
  summon() {
    const g = this.g;
    this.hold(9);
    g.fx.play("shadow/soul-drain", { x: this.x, y: this.ey, center: true, palette: RAMPS.void, prio: 1, life: 2, layer: "back" });
    for (let i = 0; i < 3; i++) {
      const x = this.x + (i - 1) * 60;
      g.fx.play("arcane/portal", { x, y: -40, palette: RAMPS.void, prio: 1, life: 2, layer: "back" });
      this.later(0.6, () => g.enemies.push(new Enemy(g, i === 1 ? "eye" : "moth", x, -50, { hpMul: 1.5 })));
    }
    sfx("portal");
    this.done(2);
  }
  enterPhase2() {
    const g = this.g;
    this.order = ["beam", "hands", "hole", "starfall", "tendrils", "blast", "beam", "hex", "summon"];
    this.skulls = g.fx.play("shadow/necro-skulls", { x: this.x, y: this.ey, follow: this, dy: this.ey, center: true, palette: RAMPS.void, prio: 1, life: 999, layer: "split", light: 0.7 });
    this.storm = g.fx.play("weather/storm", { x: 160, y: 170, screen: true, layer: "back", prio: 1, life: 999, light: 0.6, palette: ["#05020a", "#140628", "#2a0e4a", "#5a2a8a", "#a85ad8", "#e0a0ff", "#ffffff"] });
    this.handles.push(this.skulls, this.storm);
  }
  hole() {
    const g = this.g, x = this.x;
    this.hold(9);
    g.fx.play("shadow/black-hole", { x, y: 20, palette: RAMPS.void, prio: 0, life: 3, layer: "back", light: 0.8 });
    g.fx.play("scifi/tractor-beam", { x: g.hero.x, y: 0, palette: RAMPS.dangerVoid, prio: 1, life: 3, layer: "back", light: 0.6 });
    g.timers.push({ t: 3, update: (dt) => {
      const h = g.hero;
      h.vx += Math.sign(x - h.x) * 120 * dt;
    } });
    sfx("vortex");
    this.done(2.6);
  }
  blast() {
    const g = this.g;
    this.hold(9);
    g.fx.play("shadow/dark-explosion", { x: this.x, y: 0, palette: RAMPS.void, prio: 0, life: 2.6, light: 1 });
    g.danger(this.x - 72, this.x + 72, 0.52, 0.3);
    this.later(0.52, () => {
      this.hurtBox(this.x - 70, -100, this.x + 70, 4, 1.2, { push: 260, lift: 160 });
      g.shake(3.5, 0.4);
      sfx("bigboom");
    });
    this.done(2);
  }
  onDie() {
    const g = this.g;
    for (const hh of this.handles ?? []) hh?.stop();
    g.later(0.2, () => g.fx.play("impacts/impact-frame", { x: Math.round(this.x - g.camX), y: 80, screen: true, layer: "screen", prio: 0, life: 0.3, lines: 64 }));
    g.later(1.1, () => {
      g.fx.play("explosions/nuke", { x: this.x, y: 0, prio: 0, life: 5, light: 1 });
      sfx("bigboom");
      g.shake(4, 1.2);
      g.flashScreen(0.4, "#ffffff");
    });
  }
  drawBody(p, t, fl) {
    const ey = this.ey, open = this.open * (this.blink > 0 ? 0.15 : 1);
    // tentacles
    for (let i = 0; i < 6; i++) {
      const bx = (i - 2.5) * 9, pts = [];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        pts.push([bx + Math.sin(t * 2 + i + u * 4) * 6 * u, ey + 22 + u * 42 + Math.sin(t * 3 + i) * 3 * u]);
      }
      for (let k = 1; k < pts.length; k++) p.beam(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 4 - (k / pts.length) * 3, k > 6 ? C("#ff3df0") : C("#1a0a2a"));
      p.glow(pts[8][0], pts[8][1], 6, C("#ff3df0"), 0.6);
    }
    // the eye
    const R = 22, ry = R * Math.max(0.08, open);
    p.ellipse(0, ey, R + 2, ry + 2, C("#0a0412"));
    const lx = Math.cos(this.look) * 7 * (this.facing < 0 ? -1 : 1), ly = Math.sin(this.look) * 4;
    p.ellipse(0, ey, R, ry, (d, ang) => {
      const lit = Math.sin(ang) < -0.2 && d > 0.7;
      const base = d > 0.92 ? C("#3a1050") : lit ? C("#f0d8ff") : d > 0.75 ? C("#b88ad8") : C("#e0c8f0");
      return fl ? mix(base, C("#ffffff"), fl) >>> 0 : base;
    });
    if (open > 0.3) {
      p.ellipse(lx, ey + ly, 11, Math.min(11, ry), (d, ang) => (d > 0.85 ? C("#2a0438") : d > 0.55 ? (Math.sin(ang * 6 + t) > 0 ? C("#ff3df0") : C("#c020c0")) : C("#3af0ff")));
      p.ellipse(lx, ey + ly, 2.5, Math.min(8, ry * 0.8), C("#05000a"));
      p.glow(lx, ey + ly, 26, C("#ff3df0"), 0.6 + (this.state === "attack" ? 0.4 : 0));
      p.dot(lx - 4, ey + ly - 4, C("#ffffff"));
      p.dot(lx - 3, ey + ly - 4, C("#ffffff"));
    }
    // veins
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      p.line(Math.cos(a) * R * 0.95, ey + Math.sin(a) * ry * 0.95, Math.cos(a) * R * 0.6, ey + Math.sin(a) * ry * 0.6, C("#a02060"));
    }
  }
  draw() {
    if (this.removed || (this.dead && this.dying > 1.2)) return;
    const p = painterFor(frame).place(this.x, 0, false);
    const fl = this.flash > 0.5 ? 0.3 : this.dead ? Math.min(1, this.dying) : 0;
    this.drawBody(p, this.t, fl);
  }
}

const BOSSES = { colossus: Colossus, glacier: Glacier, oculus: Oculus };
export function makeBoss(g, id, x) {
  return new BOSSES[id](g, x);
}
export { Boss, createFrame, clearFrame, fxModule, damage };
