// Monsters. Critters (PixelFX's slimes, bats, skulls, ghosts...) are recolored per scene and driven by small
// AIs; knights and elites are PixelFX skeletons in dark skins performing PixelFX melee acts, so every enemy
// attack has a real wind-up the player can read. Hurtboxes are measured from the effects' own silhouettes.

import { RAMPS } from "../fx/palettes.js";
import { critterBank, drawCritter, critterActor, rigActor } from "./sprites.js";
import { drawRig, SKINS } from "./rig.js";
import { ATTACKS, ActPlayer } from "./moves.js";
import { READY, fxModule, poseAt, hex } from "../engine/pfx.js";
import { sfx } from "../engine/audio.js";

const LAVA_SLIME = ["#140406", "#3a0a0c", "#7a1a10", "#c03a14", "#f2701f", "#ffb84a", "#fff0b0"];
const FROST_SLIME = ["#06101e", "#0e2a48", "#1a4e7a", "#3488b8", "#6cc4ec", "#b8ecff", "#f0fbff"];
const VOID_SLIME = ["#0c0418", "#240a40", "#461470", "#7a24a8", "#c048e0", "#f090ff", "#ffe0ff"];

/**
 * Enemy types. kind: critter | rig. ai: hopper | flyer | diver | walker | shooter | crawler | drifter.
 * box: hurtbox [x0, y0, x1, y1] around the origin. cy: where hits and status effects center (above origin).
 */
export const TYPES = {
  // ---- Ember Forge
  slime: { kind: "critter", fx: "critters/slime", opts: { palette: LAVA_SLIME, hop: 22 }, ai: "hopper", hp: 16, speed: 46, box: [-13, -21, 13, 0], cy: 11, dmg: 7, xp: 1, weight: 1, air: [0.92, 1.46], deathFx: "spawn/poof", deathPal: RAMPS.ember },
  skull: { kind: "critter", fx: "critters/flying-skull", opts: { hover: 0, floor: false }, ai: "diver", hp: 20, speed: 40, box: [-11, -13, 11, 10], cy: 0, hover: 44, dmg: 9, xp: 2, weight: 0.8, deathFx: "spawn/dissolve-burn", deathPal: RAMPS.fire },
  bat: { kind: "critter", fx: "critters/bat", opts: { palette: ["#06040a", "#120c1a", "#221830", "#382848", "#5a4068", "#8a6a90", "#c8a8c8"], eyes: ["#8a1020", "#ff3b30", "#ffb04a", "#fff0c0"] }, ai: "flyer", hp: 9, speed: 70, box: [-11, -8, 11, 8], cy: 0, hover: 54, dmg: 6, xp: 1, weight: 0.6, deathFx: "spawn/poof", deathPal: RAMPS.ember },
  toad: { kind: "critter", fx: "critters/frog", opts: { palette: ["#140806", "#3a140c", "#6a2410", "#a84418", "#e07a2a", "#ffb860", "#fff0c0"], belly: ["#3a2a1a", "#8a6a3a", "#d8b878"] }, ai: "hopper", hp: 22, speed: 40, box: [-14, -18, 14, 0], cy: 9, dmg: 8, xp: 2, weight: 1.1, air: [1.05, 1.6], deathFx: "spawn/poof", deathPal: RAMPS.ember },
  serpent: { kind: "critter", fx: "critters/snake", opts: { palette: ["#0e0606", "#2a0e0a", "#4e1a10", "#7e2c14", "#c04a1a", "#ff8a3a", "#ffd090"], belly: ["#3a1a0a", "#9a5a2a", "#f0b060"] }, ai: "crawler", hp: 26, speed: 62, box: [-30, -12, 30, 0], cy: 6, dmg: 8, xp: 2, weight: 1.2, deathFx: "spawn/poof", deathPal: RAMPS.ember },
  knight: { kind: "rig", skin: "ash", weapon: "sword", attack: "eSlash", ai: "walker", hp: 40, speed: 38, box: [-8, -36, 8, 0], cy: 20, dmg: 11, xp: 3, weight: 1.4, reach: 44, deathFx: "spawn/soul-rise", deathPal: RAMPS.ember },
  brute: { kind: "rig", skin: "brute", weapon: "hammer", attack: "eHammer", alt: "eUpper", ai: "walker", hp: 420, speed: 30, box: [-9, -37, 9, 0], cy: 20, dmg: 18, xp: 20, weight: 4, reach: 58, elite: true, aura: "status/rage", deathFx: "spawn/dissolve-burn", deathPal: RAMPS.fire },
  // ---- Frozen Ruins
  ghost: { kind: "critter", fx: "critters/ghost", opts: { hover: 0, palette: ["#0a1020", "#16264a", "#2a4a7e", "#5a86bc", "#9cc4ec", "#d8f0ff", "#ffffff"] }, ai: "flyer", hp: 30, speed: 44, box: [-13, -28, 13, 6], cy: -10, hover: 30, dmg: 10, xp: 2, weight: 0.8, deathFx: "spawn/soul-rise", deathPal: RAMPS.frost },
  wisp: { kind: "critter", fx: "critters/wisp", opts: { hover: 0 }, ai: "shooter", hp: 26, speed: 46, box: [-10, -22, 10, 4], cy: -8, hover: 50, dmg: 9, xp: 2, weight: 0.6, bolt: "ice/ice-lance", boltPal: RAMPS.danger, deathFx: "spawn/poof", deathPal: RAMPS.frost },
  crow: { kind: "critter", fx: "critters/bird", opts: { palette: ["#06080e", "#10162a", "#1e2a48", "#34466e", "#5a72a0", "#9ab4dc", "#e6f2ff"], breast: ["#1a2440", "#3a6aa0", "#7ac0f0", "#c8f0ff"] }, ai: "diver", hp: 22, speed: 64, box: [-11, -9, 11, 9], cy: 0, hover: 60, dmg: 9, xp: 2, weight: 0.6, deathFx: "spawn/poof", deathPal: RAMPS.frost },
  fslime: { kind: "critter", fx: "critters/slime", opts: { palette: FROST_SLIME, hop: 20 }, ai: "hopper", hp: 34, speed: 44, box: [-13, -21, 13, 0], cy: 11, dmg: 10, xp: 2, weight: 1, air: [0.92, 1.46], deathFx: "ice/ice-shatter", deathPal: RAMPS.frost },
  fish: { kind: "critter", fx: "critters/fish-school", opts: { palette: ["#060c1a", "#0e1e3a", "#183a64", "#2a6494", "#5aa0c8", "#a8dcf0", "#f0ffff"], stripe: ["#1a2a5a", "#5a7ad8", "#a8c0ff"] }, ai: "drifter", hp: 60, speed: 40, box: [-36, -22, 28, 14], cy: -4, hover: 46, dmg: 10, xp: 4, weight: 1.6, deathFx: "water/splash", deathPal: RAMPS.frost },
  lancer: { kind: "rig", skin: "frost", weapon: "spear", attack: "eThrust", alt: "eSweep", ai: "walker", hp: 70, speed: 40, box: [-8, -36, 8, 0], cy: 20, dmg: 13, xp: 4, weight: 1.4, reach: 62, deathFx: "spawn/shatter-death", deathPal: RAMPS.frost },
  warden: { kind: "rig", skin: "frost", weapon: "greatsword", attack: "eSlash", alt: "eThrust", ai: "walker", hp: 900, speed: 32, box: [-9, -37, 9, 0], cy: 20, dmg: 22, xp: 30, weight: 4, reach: 52, elite: true, aura: "holy/divine-shield", auraPal: RAMPS.frost, deathFx: "spawn/shatter-death", deathPal: RAMPS.frost },
  // ---- Neon Void
  eye: { kind: "critter", fx: "critters/eyeball", opts: { hover: 0, iris: ["#3a0a4a", "#a020c0", "#ff5af0", "#ffd0ff"] }, ai: "shooter", hp: 40, speed: 42, box: [-12, -14, 12, 8], cy: -3, hover: 56, dmg: 12, xp: 3, weight: 0.8, bolt: "projectiles/laser-bolt", boltPal: RAMPS.dangerVoid, deathFx: "spawn/disintegrate", deathPal: RAMPS.void },
  moth: { kind: "critter", fx: "critters/butterfly", opts: { palette: ["#0a0414", "#1e0a3a", "#3a1470", "#6a28b0", "#b04ae0", "#f09cff", "#ffffff"], spots: ["#1a0420", "#c81e8a", "#ff6ad8", "#ffe0f8"] }, ai: "flyer", hp: 26, speed: 72, box: [-13, -9, 13, 9], cy: 0, hover: 50, dmg: 10, xp: 2, weight: 0.5, deathFx: "spawn/disintegrate", deathPal: RAMPS.neon },
  jelly: { kind: "critter", fx: "critters/jellyfish", opts: {}, ai: "shooter", hp: 50, speed: 34, box: [-14, -26, 14, 4], cy: -11, hover: 64, dmg: 12, xp: 3, weight: 0.9, bolt: "projectiles/plasma-shot", boltPal: RAMPS.dangerVoid, deathFx: "explosions/plasma-explosion", deathPal: RAMPS.void },
  vslime: { kind: "critter", fx: "critters/slime", opts: { palette: VOID_SLIME, hop: 26 }, ai: "hopper", hp: 52, speed: 50, box: [-13, -21, 13, 0], cy: 11, dmg: 12, xp: 2, weight: 1, air: [0.92, 1.46], deathFx: "spawn/poof", deathPal: RAMPS.void },
  reaper: { kind: "rig", skin: "reaper", weapon: "scythe", attack: "eScythe", alt: "eFlurry", ai: "walker", hp: 110, speed: 44, box: [-8, -36, 8, 0], cy: 20, dmg: 15, xp: 5, weight: 1.4, reach: 56, deathFx: "spawn/disintegrate", deathPal: RAMPS.void },
  gunner: { kind: "rig", skin: "gunner", weapon: "pistol", attack: null, ai: "gunner", hp: 80, speed: 36, box: [-8, -36, 8, 0], cy: 20, dmg: 10, xp: 4, weight: 1.3, reach: 140, deathFx: "spawn/disintegrate", deathPal: RAMPS.cyber },
  trooper: { kind: "rig", skin: "gunner", weapon: "launcher", attack: null, ai: "trooper", hp: 1300, speed: 30, box: [-9, -37, 9, 0], cy: 20, dmg: 24, xp: 40, weight: 4, reach: 160, elite: true, aura: "scifi/force-field", auraPal: RAMPS.dangerVoid, deathFx: "explosions/plasma-explosion", deathPal: RAMPS.void },
};

let uid = 1;
const GUARDS = {
  sword: { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 },
  hammer: { ...READY, weapon: "hammer", two: true, fx: 12, fy: -20, sa: -1.2 },
  spear: { ...READY, weapon: "spear", two: true, fx: 13, fy: -22, sa: -0.25 },
  greatsword: { ...READY, weapon: "greatsword", two: true, fx: 11, fy: -21, sa: -1 },
  scythe: { ...READY, weapon: "scythe", two: true, fx: 12, fy: -22, sa: -1.3 },
  pistol: { ...READY, weapon: "pistol", fx: 16, fy: -26, sa: 0, bx: 8, by: -22 },
  launcher: { ...READY, weapon: "launcher", two: true, fx: 10, fy: -27, sa: 0, crouch: 4 },
};
const walkTrack = (G) => [
  [0, { ...G, crouch: 2, ffx: 7, ffy: -3, fbx: -6, fby: -6 }],
  [0.17, { ...G, crouch: 1, ffx: 1, ffy: -4, fbx: 1, fby: -9 }],
  [0.34, { ...G, crouch: 2, ffx: -6, ffy: -6, fbx: 7, fby: -3 }],
  [0.51, { ...G, crouch: 1, ffx: 1, ffy: -9, fbx: 1, fby: -4 }],
  [0.68, { ...G, crouch: 2, ffx: 7, ffy: -3, fbx: -6, fby: -6 }],
];
const WALKS = Object.fromEntries(Object.entries(GUARDS).map(([k, g]) => [k, walkTrack(g)]));

export class Enemy {
  constructor(game, typeId, x, y, opts = {}) {
    const T = TYPES[typeId];
    this.game = game;
    this.id = uid++;
    this.typeId = typeId;
    this.T = T;
    this.x = x;
    this.y = y ?? (T.hover ? -T.hover : 0);
    this.vx = 0;
    this.vy = 0;
    this.facing = -1;
    const hpMul = opts.hpMul ?? 1;
    this.maxHp = Math.round(T.hp * hpMul);
    this.hp = this.maxHp;
    this.dmg = T.dmg * (opts.dmgMul ?? 1);
    this.box = T.box;
    this.w = (T.box[2] - T.box[0]) / 2;
    this.h = -T.box[1];
    this.cy = T.cy;
    this.weight = T.weight;
    this.elite = !!T.elite;
    this.t = Math.random() * 3;
    this.aiT = 0.6 + Math.random() * 0.8;
    this.state = "move";
    this.flash = 0;
    this.squash = 0;
    this.hurtT = 0;
    this.touchCd = 0.6;
    this.status = {};
    this.statusFx = new Map();
    this.dead = false;
    this.removed = false;
    this.spawning = opts.spawnDelay ?? 0;
    this.act = null;
    // flyers each keep their own height, so a flock reads as a flock and never as a wall
    this.hover = T.hover ? T.hover + (Math.random() - 0.5) * 30 : 0;
    this.phase = Math.random() * 6.28;
    this.bank = T.kind === "critter" ? critterBank(typeId, T.fx, T.opts) : null;
    this.skin = T.kind === "rig" ? SKINS[T.skin] : null;
    this.guard = T.kind === "rig" ? GUARDS[T.weapon] : null;
    this.attackT = 0;
    this.diveT = 0;
    this.lastHitBy = null;
    this.killedBy = null;
    this.aura = null;
  }

  get actorInfo() {
    return this.bank ? critterActor(this.bank, 0) : rigActor(this.skin);
  }
  get centerY() {
    return this.y - this.cy;
  }
  hitbox() {
    const b = this.box;
    return [this.x + b[0], this.y + b[1], this.x + b[2], this.y + b[3]];
  }
  /** Status helpers. */
  slowK() {
    const s = this.status;
    if (s.frozen > 0 || s.stunned > 0 || s.petrified > 0 || s.sleep > 0) return 0;
    let k = 1;
    if (s.slowed > 0) k *= 0.45;
    if (s.rooted > 0) k *= 0;
    return k;
  }

  update(dt) {
    const g = this.game, hero = g.hero;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 9);
    this.squash = Math.max(0, this.squash - dt * 6);
    this.touchCd = Math.max(0, this.touchCd - dt);
    if (this.spawning > 0) {
      this.spawning -= dt;
      return;
    }
    for (const k in this.status) if (this.status[k] > 0) this.status[k] -= dt;
    if (this.dead) {
      this.updateDeath(dt);
      return;
    }
    const sk = this.slowK();
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.physics(dt, true);
      return;
    }
    if (sk === 0) {
      // frozen / stunned / asleep: drift to a halt
      this.vx *= Math.pow(0.02, dt);
      this.physics(dt, true);
      return;
    }
    const tdt = dt * sk;
    if (this.status.confused > 0) this.facing = Math.sin(this.t * 3) > 0 ? 1 : -1;
    const dx = hero.x - this.x;
    if (!this.act && this.status.confused <= 0) this.facing = dx >= 0 ? 1 : -1;
    else if (!this.act && !(this.status.confused > 0)) this.facing = dx >= 0 ? 1 : -1;
    this.aiT -= tdt;
    const T = this.T;
    const charmed = this.status.charmed > 0;
    switch (T.ai) {
      case "hopper": {
        const ph = (this.t % this.bankDur()) ;
        const [a0, a1] = T.air;
        if (ph >= a0 && ph <= a1) this.vx = (charmed ? -1 : 1) * Math.sign(dx) * T.speed * 1.7;
        else this.vx *= Math.pow(0.001, tdt);
        break;
      }
      case "crawler": {
        if (this.state === "lunge") {
          if (this.aiT <= 0) {
            this.state = "move";
            this.aiT = 1.6 + Math.random();
          }
        } else {
          this.vx += (Math.sign(dx) * T.speed - this.vx) * Math.min(1, tdt * 3);
          if (Math.abs(dx) < 70 && this.aiT <= 0) {
            this.state = "lunge";
            this.vx = Math.sign(dx) * T.speed * 2.6;
            this.aiT = 0.45;
          }
        }
        break;
      }
      case "flyer":
      case "drifter": {
        const wantX = hero.x - Math.sign(dx || 1) * (T.ai === "drifter" ? 30 : 8), wantY = -this.hover + Math.sin(this.t * 2 + this.phase) * 8;
        this.vx += (Math.sign(wantX - this.x) * T.speed - this.vx) * Math.min(1, tdt * 2);
        this.vy += ((wantY - this.y) * 2 - this.vy) * Math.min(1, tdt * 3);
        break;
      }
      case "diver": {
        if (this.state === "windup") {
          this.vx *= Math.pow(0.01, tdt);
          this.vy *= Math.pow(0.01, tdt);
          if (this.aiT <= 0) {
            this.state = "dive";
            const ty = hero.y - 18, d = Math.hypot(dx, ty - this.y) || 1, sp = T.speed * 3.4;
            this.vx = (dx / d) * sp;
            this.vy = ((ty - this.y) / d) * sp;
            this.aiT = 0.7;
            sfx("whoosh", { pan: g.pan(this.x) });
          }
        } else if (this.state === "dive") {
          if (this.aiT <= 0 || this.y > -8) {
            this.state = "move";
            this.aiT = 1.8 + Math.random() * 1.5;
            this.vy = -80;
          }
        } else {
          const wantX = hero.x - Math.sign(dx || 1) * 50, wantY = -this.hover + Math.sin(this.t * 2.2 + this.phase) * 10;
          this.vx += (Math.sign(wantX - this.x) * T.speed - this.vx) * Math.min(1, tdt * 2);
          this.vy += ((wantY - this.y) * 2 - this.vy) * Math.min(1, tdt * 3);
          if (this.aiT <= 0 && Math.abs(dx) < 110) {
            this.state = "windup";
            this.aiT = 0.45;
            this.flash = 0.5;
          }
        }
        break;
      }
      case "shooter": {
        const range = 96, wantX = hero.x - Math.sign(dx || 1) * range, wantY = -this.hover + Math.sin(this.t * 1.7 + this.phase) * 9;
        if (this.state === "charge") {
          this.vx *= Math.pow(0.02, tdt);
          if (this.aiT <= 0) {
            this.state = "move";
            this.aiT = 2.4 + Math.random() * 1.6;
            g.enemyShoot(this);
          }
        } else {
          this.vx += (Math.sign(wantX - this.x) * T.speed * (Math.abs(wantX - this.x) > 12 ? 1 : 0) - this.vx) * Math.min(1, tdt * 2);
          if (this.aiT <= 0 && Math.abs(dx) < 190) {
            this.state = "charge";
            this.aiT = 0.75;
            g.enemyCharge(this);
          }
        }
        this.vy += ((wantY - this.y) * 2 - this.vy) * Math.min(1, tdt * 3);
        break;
      }
      case "walker":
      case "gunner":
      case "trooper": {
        if (this.act) {
          this.act.update(tdt);
          this.x = this.act.rootX;
          if (this.act.done) {
            this.act = null;
            this.aiT = (this.elite ? 0.9 : 1.3) + Math.random() * 0.8;
          }
          break;
        }
        const reach = T.reach;
        const ranged = T.ai !== "walker";
        if (Math.abs(dx) > reach - 6 || (ranged && Math.abs(dx) < 50)) {
          const dir = ranged && Math.abs(dx) < 50 ? -Math.sign(dx) : Math.sign(dx);
          this.vx += (dir * T.speed - this.vx) * Math.min(1, tdt * 4);
        } else this.vx *= Math.pow(0.001, tdt);
        if (Math.abs(dx) <= reach && this.aiT <= 0 && hero.y > -40) {
          if (ranged) g.enemyGun(this);
          else this.startAttack(Math.random() < 0.35 && T.alt ? T.alt : T.attack);
          this.aiT = 99;
        }
        break;
      }
    }
    if (charmed) this.vx *= -0.5;
    this.physics(tdt, false);
    // contact damage
    if (!charmed && this.touchCd <= 0 && T.ai !== "walker" && T.ai !== "gunner" && T.ai !== "trooper") {
      const [x0, y0, x1, y1] = this.hitbox();
      if (hero.x + 7 > x0 && hero.x - 7 < x1 && hero.y > y0 - 4 && hero.y - 34 < y1) {
        const strong = this.state === "dive" || this.state === "lunge";
        if (hero.hurt(this.dmg * (strong ? 1.3 : 1), this.x, { push: 130 })) this.touchCd = 1.1;
        else this.touchCd = 0.4;
        if (strong) {
          this.state = "move";
          this.vx = -this.vx * 0.5;
          this.vy = -120;
          this.aiT = 1.5;
        }
      }
    }
  }
  bankDur() {
    return this.bank?.mod?.meta.duration ?? 1.8;
  }
  physics(dt, stunned) {
    const flying = this.hover > 0;
    if (!flying || (stunned && this.status.frozen > 0)) {
      if (this.y < 0 || this.vy < 0) {
        this.vy += 900 * dt;
        this.y += this.vy * dt;
        if (this.y >= 0) {
          this.y = 0;
          this.vy = 0;
        }
      }
      if (flying && this.status.frozen > 0 && this.y < 0) {
        // frozen flyers drop to the floor
      }
    } else {
      this.y += this.vy * dt;
      if (stunned) this.vy *= Math.pow(0.05, dt);
      this.y = Math.min(this.y, -6);
    }
    this.x += this.vx * dt;
    if (stunned) this.vx *= Math.pow(0.03, dt);
    this.x = this.game.clampX(this.x, true);
  }
  startAttack(name) {
    const a = ATTACKS[name], mod = a && fxModule(a.fx);
    if (!mod) {
      this.aiT = 0.5;
      return;
    }
    const g = this.game;
    this.attackName = name;
    this.act = new ActPlayer(mod, {
      id: a.fx, rate: a.rate * (this.elite ? 1.05 : 1), from: a.from, x: this.x, facing: this.facing, director: g.fx,
      fx: { palette: g.theme.danger, light: 0.9 }, prio: 1,
      onStart: () => sfx(a.sfx, { w: a.weight, pan: g.pan(this.x) }),
      onHit: (hit) => g.enemyMeleeHit(this, a, hit),
    });
    if (this.elite || Math.random() < 0.3) g.telegraph(this, a);
    if (this.elite) {
      const t1 = (mod.act?.hits?.[0]?.t ?? 0) - (a.from ?? 0), f = this.facing, [x0, , x1] = a.box;
      g.danger(this.x + (f > 0 ? x0 : -x1), this.x + (f > 0 ? x1 : -x0), t1 / (a.rate * 1.05), 0.25);
    }
  }
  /** Interrupt: a heavy blow or a freeze cancels the enemy's attack. */
  interrupt() {
    if (this.act && !this.elite) {
      this.act = null;
      this.aiT = 0.6;
    }
    if (this.state === "windup" || this.state === "charge") {
      this.state = "move";
      this.aiT = 0.8;
    }
  }
  updateDeath(dt) {
    this.deathT += dt;
    this.vy += 700 * dt;
    this.x += this.vx * dt;
    this.y = Math.min(0, this.y + this.vy * dt);
    this.vx *= Math.pow(0.05, dt);
    if (this.deathT > this.deathLen) this.removed = true;
  }

  // ---- drawing
  pose() {
    if (this.act) return this.act.pose;
    const G = this.guard;
    if (this.hurtT > 0) return { ...G, lean: -4, crouch: 3, hx: -1 };
    if (Math.abs(this.vx) > 8) return poseAt(WALKS[this.T.weapon], this.t % 0.68);
    return { ...G, crouch: (Math.floor(this.t * 3) & 1) + 2 };
  }
  draw() {
    if (this.spawning > 0 || this.removed) return;
    const s = this.status;
    const hidden = this.statusHidesBody;
    if (hidden) return;
    let tint = null;
    if (s.frozen > 0) tint = [ICE, 0.5];
    else if (s.petrified > 0) tint = [STONE, 0.7];
    else if (s.burning > 0) tint = [BURN, 0.25 + 0.1 * Math.sin(this.t * 20)];
    else if (s.poisoned > 0) tint = [POISON, 0.3];
    else if (s.cursed > 0) tint = [CURSE, 0.3];
    else if (s.shocked > 0) tint = Math.floor(this.t * 24) & 1 ? [SHOCK, 0.6] : null;
    const flash = this.flash > 0.45 ? 1 : 0;
    const k = this.squash, flip = this.facing < 0;
    const alpha = this.dead ? Math.max(0, 1 - this.deathT / this.deathLen) : 1;
    if (this.bank) {
      const sx = 1 + 0.28 * k, sy = 1 - 0.22 * k;
      drawCritter(this.bank, this.t * (this.slowK() || 0.0001) + this.phase, this.x + (this.hurtT > 0 ? (Math.floor(this.t * 40) & 1 ? 1 : -1) : 0), this.y, {
        flip, sx, sy, flash, tint, alpha, pivotY: this.box[3],
      });
    } else {
      const pose = s.frozen > 0 && this.frozenPose ? this.frozenPose : this.pose();
      if (s.frozen > 0 && !this.frozenPose) this.frozenPose = pose;
      if (!(s.frozen > 0)) this.frozenPose = null;
      drawRig(pose, this.x + (this.hurtT > 0 ? (Math.floor(this.t * 40) & 1 ? 1 : -1) : 0), this.y, flip, this.skin, {
        flash, tint, alpha, glow: this.act ? 0.5 : 0, rim: this.elite ? RIM : 0,
      });
    }
  }
}
const ICE = hex("#9ee6ff") >>> 0, STONE = hex("#8a8a96") >>> 0, BURN = hex("#2a0a04") >>> 0, POISON = hex("#7ad040") >>> 0, CURSE = hex("#6a2aa0") >>> 0, SHOCK = hex("#d8f4ff") >>> 0;
const RIM = hex("#3a0a10") >>> 0;
