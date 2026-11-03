// The hero: a PixelFX skeleton in ivory armour with a crimson scarf. Two modes (settings.mode):
// - auto (default): he finds the nearest monster, walks in, reads telegraphs and cuts on his own; the player only
//   watches and picks level-up cards.
// - manual: A/D walk, Space jumps, a click attacks toward the clicked side; nothing is targeted or walked for him.
// Either way his blows come from the same combo bags: opener -> link -> finisher, each drawn from a shuffle bag so
// all twelve PixelFX melee acts (and their conjured weapons) take turns without repeating. Every attack is a
// PixelFX act: its wind-up, its hit frames, its freeze.

import { READY, fxModule, poseAt } from "../engine/pfx.js";
import { ATTACKS, ActPlayer } from "./moves.js";
import { drawRig, drawGhost, SKINS, jointsOf, addLight } from "./rig.js";
import { input } from "../engine/input.js";
import { sfx } from "../engine/audio.js";
import { settings } from "../settings.js";
import { RAMPS } from "../fx/palettes.js";
import { frame, hex } from "../engine/pfx.js";

const GUARD = { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 };
const IDLE = [
  [0, { ...GUARD }],
  [0.6, { ...GUARD, crouch: 4, fy: -20, by: -20 }],
  [1.2, { ...GUARD }],
];
/** A shuffle bag: every item comes out once before any repeats, and never the same one twice in a row. */
export class Bag {
  constructor(items, rng) {
    this.items = items;
    this.rng = rng;
    this.left = [];
    this.last = null;
  }
  /** The next item; prefer: names to take first if any is still in the bag. */
  next(prefer) {
    if (!this.left.length) {
      const L = this.items.slice();
      for (let i = L.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [L[i], L[j]] = [L[j], L[i]];
      }
      if (L.length > 1 && L[0] === this.last) L.push(L.shift());
      this.left = L;
    }
    let i = prefer ? this.left.findIndex((n) => prefer.includes(n)) : -1;
    if (i < 0) i = 0;
    return (this.last = this.left.splice(i, 1)[0]);
  }
}
// combo roles: quick openers, links that move or launch, heavy finishers; lunges close a gap
const COMBO = {
  open: ["slash", "claw", "flurry", "thrust"],
  link: ["cross", "whip", "sweep", "uppercut"],
  finish: ["cleave", "hammer", "reap", "spin"],
  lunge: ["thrust", "whip", "sweep"],
};
const SLOW = new Set(["cleave", "hammer", "reap", "spin", "flurry"]);

const RUNP = { ...READY, weapon: "sword", fx: 13, fy: -23, sa: -1.9, bx: 4, by: -21, lean: 5 };
const RUN = [
  [0, { ...RUNP, crouch: 3, ffx: 10, ffy: -3, fbx: -9, fby: -7, bx: -2 }],
  [0.095, { ...RUNP, crouch: 1, ffx: 2, ffy: -4, fbx: 1, fby: -12, fy: -24 }],
  [0.19, { ...RUNP, crouch: 3, ffx: -8, ffy: -7, fbx: 10, fby: -3, bx: 8 }],
  [0.285, { ...RUNP, crouch: 1, ffx: 1, ffy: -12, fbx: 2, fby: -4, fy: -24 }],
  [0.38, { ...RUNP, crouch: 3, ffx: 10, ffy: -3, fbx: -9, fby: -7, bx: -2 }],
];
const JUMP = { ...GUARD, crouch: 0, lean: 2, ffx: 7, ffy: -13, fbx: -4, fby: -9, fx: 13, fy: -27, sa: -1.7, bx: 2, by: -27 };
const FALL = { ...GUARD, crouch: 0, lean: 1, ffx: 5, ffy: -7, fbx: -6, fby: -10, fx: 12, fy: -25, sa: -1.2, bx: 6, by: -28 };
const LAND = { ...GUARD, crouch: 8, lean: 4, ffx: 9, fbx: -9, fx: 14, fy: -15, sa: -0.3 };
const HURT = { ...GUARD, crouch: 3, lean: -5, hx: -1, fx: 4, fy: -27, sa: -2, bx: -2, by: -29 };
const KNEEL = { ...GUARD, crouch: 11, lean: 8, hy: 2, fx: 15, fy: -8, sa: 1.4, bx: 6, by: -14, ffx: 10, fbx: -9, toeB: true };

const SCARF = [hex("#ff6d86") >>> 0, hex("#d8283e") >>> 0, hex("#8e1430") >>> 0, hex("#4a0a1c") >>> 0];
const GHOST_C = hex("#ff8a5a") >>> 0;

export class Hero {
  constructor(game) {
    this.game = game;
    this.x = 40;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = true;
    this.maxHp = 100;
    this.hp = 100;
    this.iframes = 0;
    this.hurtT = 0;
    this.flash = 0;
    this.act = null;
    this.actName = null;
    this.chain = 0;
    this.chainT = 0;
    this.atkCd = 0;
    this.queued = 0; // manual mode: a click waiting for the current blow (-1 left, 1 right)
    this.queuedT = 0;
    this.spinCd = 0;
    this.lungeCd = 0;
    this.bags = null;
    this.moveCount = {}; // blows thrown per attack name (for the tests)
    this.animT = 0;
    this.landT = 0;
    this.airAttacked = false;
    this.dead = false;
    this.deadT = 0;
    this.invuln = 0;
    this.ghosts = [];
    this.ghostAcc = 0;
    this.glow = 0;
    this.scarf = Array.from({ length: 8 }, () => ({ x: 40, y: -30, px: 40, py: -30 }));
    this.stats = { atk: 10, atkSpeed: 1, crit: 0.08, critMul: 2.2, speed: 86, magnet: 34, armor: 0, regen: 0.8, lifesteal: 0 };
    this.lastPose = GUARD;
    this.moveOverride = null; // an ultimate (PixelFX move) in progress
    this.statusFx = new Map();
  }

  get busy() {
    return !!this.act || !!this.moveOverride;
  }

  get manual() {
    return settings.mode === "manual";
  }

  /** Manual mode: a click attacks toward the clicked side (held briefly if a blow is still landing). */
  click(worldX) {
    if (this.dead || !this.manual) return;
    this.queued = worldX < this.x ? -1 : 1;
    this.queuedT = 0.35;
  }

  update(dt, enemies) {
    const g = this.game;
    this.animT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.chainT = Math.max(0, this.chainT - dt);
    this.spinCd = Math.max(0, this.spinCd - dt);
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    this.queuedT = Math.max(0, this.queuedT - dt);
    if (this.queuedT <= 0) this.queued = 0;
    this.landT = Math.max(0, this.landT - dt);
    this.glow = Math.max(0, this.glow - dt * 3);
    if (this.chainT <= 0) this.chain = 0;
    if (this.stats.regen) this.heal(this.stats.regen * dt, true);

    if (this.dead) {
      this.deadT += dt;
      this.vx *= 0.9;
      this.physics(dt);
      return;
    }

    // ---- an ultimate owns the body
    if (this.moveOverride) {
      this.moveOverride.update(dt);
      this.x = g.clampX(this.moveOverride.rootX);
      this.y = Math.min(0, this.moveOverride.rootY);
      if (this.moveOverride.done) this.moveOverride = null;
      this.trail(dt, true);
      this.updateScarf(dt);
      return;
    }

    const manual = this.manual;

    // ---- the player's keys (manual mode only; in auto mode the hero is left to himself)
    let moveDir = 0;
    if (manual) {
      const L = input.held("left"), R = input.held("right");
      if (L !== R) moveDir = R ? 1 : -1;
      const free = !this.act || this.act.t < 0 || this.act.t >= ATTACKS[this.actName].cancel;
      if (input.take("jump") && this.onGround && free) {
        this.act = null;
        this.actName = null;
        this.vy = -285;
        this.onGround = false;
        this.airAttacked = false;
        sfx("jump");
        g.fx.play("impacts/heavy-landing", { x: this.x, y: 0, prio: 2, life: 0.45, speed: 1.6, light: 0.5, layer: "back" });
      }
    } else input.clear("jump");

    // ---- the target: skills and ultimates aim at it in both modes; only auto mode walks to it and cuts it
    const tgt = this.pickTarget(enemies);
    this.target = tgt;

    // ---- auto: read telegraphs, step out of marked zones, jump shock waves
    let evade = 0;
    if (!manual && g.dangers.length) {
      for (const d of g.dangers) {
        const tt = d.at - g.time;
        if (tt > 0.55 || g.time > d.until) continue;
        if (!(this.x > d.x0 - 9 && this.x < d.x1 + 9)) continue;
        if (d.kind === "jump") {
          if (tt < 0.22 && this.onGround && !this.act) {
            this.vy = -285;
            this.onGround = false;
            sfx("jump");
          }
        } else {
          const left = this.x - (d.x0 - 14), right = d.x1 + 14 - this.x;
          let dir = left < right ? -1 : 1;
          if (g.clampX(this.x + dir * 40) === this.x) dir = -dir;
          evade = dir;
        }
      }
      if (evade && this.act && this.act.t < 0) {
        this.act = null;
        this.actName = null;
      }
    }
    this.evading = evade;

    // a held direction takes over at once: cut the wind-up or the recovery (as soon as the last hit has landed),
    // never the blow itself
    if (moveDir && this.act && (this.act.t < 0 || this.act.t >= ATTACKS[this.actName].cancel || this.act.nh >= this.act.hits.length)) {
      this.act = null;
      this.actName = null;
    }

    // ---- attacks in progress: the next blow may cut the recovery short
    const wantNext = () => (manual ? this.queued !== 0 : tgt && this.atkCd <= 0 && (this.inReach(tgt) || this.inLunge(tgt)));
    if (this.act) {
      this.act.update(dt);
      this.x = g.clampX(this.act.rootX);
      if (this.onGround) this.y = Math.min(0, this.act.rootY);
      const a = ATTACKS[this.actName];
      if (this.act.done || (this.act.t >= a.cancel && wantNext())) {
        this.act = null;
        this.actName = null;
      }
    }

    // ---- start the next blow
    if (!this.act) {
      if (manual) {
        if (this.queued && (this.onGround || !this.airAttacked)) {
          this.facing = this.queued;
          this.queued = 0;
          this.queuedT = 0;
          this.startCombo(null, enemies);
        }
      } else if (!evade && tgt && this.atkCd <= 0 && (this.inReach(tgt) || this.inLunge(tgt))) {
        this.facing = tgt.x >= this.x ? 1 : -1;
        this.startCombo(tgt, enemies);
      }
    }

    // ---- walking
    if (!this.act) {
      let want = 0;
      if (manual) want = moveDir * this.stats.speed;
      else if (evade) {
        want = evade * this.stats.speed * 1.25;
        this.facing = evade;
      } else if (tgt) {
        const dx = tgt.x - this.x, standoff = 26 + (tgt.w ?? 8);
        if (Math.abs(dx) > standoff + 6) want = Math.sign(dx) * this.stats.speed;
        else if (Math.abs(dx) < standoff - 14 && this.onGround) want = -Math.sign(dx) * this.stats.speed * 0.5;
        if (want) this.facing = Math.sign(dx);
      } else if (g.advance) {
        want = this.stats.speed * 0.8;
        this.facing = 1;
      }
      if (moveDir) this.facing = moveDir;
      const accel = this.onGround ? 900 : 500;
      this.vx += Math.max(-accel * dt, Math.min(accel * dt, want - this.vx));
    } else {
      this.vx *= Math.pow(0.0005, dt);
    }

    this.physics(dt);
    this.trail(dt, this.act?.pose?.ghost);
    this.updateScarf(dt);
  }

  physics(dt) {
    const g = this.game;
    if (!this.onGround) {
      this.vy += 900 * dt;
      this.y += this.vy * dt;
      if (this.y >= 0) {
        if (this.vy > 200) {
          this.landT = 0.12;
          sfx("land");
          g.fx.play("impacts/heavy-landing", { x: this.x, y: 0, prio: 2, life: 0.6, light: 0.6, layer: "back" });
          g.shake(1, 0.1);
        }
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }
    if (!this.act || !this.onGround) this.x += this.vx * dt;
    this.x = g.clampX(this.x);
  }

  pickTarget(enemies) {
    let best = null, bd = 1e9;
    for (const e of enemies) {
      if (e.dead || e.spawning > 0 || e.untargetable) continue;
      const dx = e.x - this.x, ady = Math.abs(e.y + (e.cy ?? 10) - (this.y - 20));
      if (Math.abs(dx) > 240) continue;
      // prefer what's in front, then what's close; flyers far overhead count as further away
      const d = Math.abs(dx) + Math.max(0, ady - 30) * 1.5 + (Math.sign(dx) !== this.facing ? 18 : 0) - (e.boss ? 10 : 0);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  inReach(e) {
    const dx = Math.abs(e.x - this.x) - (e.w ?? 8), top = e.y - (e.h ?? 20);
    return dx < 40 && top < 10 && e.y > -70 + this.y;
  }

  /** A target a step beyond sword reach, on the ground ahead: worth a lunge. */
  inLunge(e) {
    if (!this.onGround || this.lungeCd > 0) return false;
    const dx = Math.abs(e.x - this.x) - (e.w ?? 8), top = e.y - (e.h ?? 20);
    return dx >= 30 && dx < 62 && top < 10 && e.y > -40;
  }

  /**
   * The next blow of the combo: opener -> link -> finisher, each from its own shuffle bag so every act takes its
   * turn. tgt (auto mode) lets the situation steer the pick: a lunge to close a gap, a spin when surrounded, an
   * uppercut for something in the air, a heavy finisher for elites and bosses.
   */
  startCombo(tgt, enemies) {
    if (!this.bags) this.bags = Object.fromEntries(Object.entries(COMBO).map(([k, v]) => [k, new Bag(v, () => this.game.rng())]));
    const f = this.facing;
    let front = 0, back = 0;
    for (const e of enemies) {
      if (e.dead || e.spawning > 0 || e.untargetable) continue;
      const dx = e.x - this.x, d = Math.abs(dx) - (e.w ?? 8);
      if (d > 34 || e.y < -60 + this.y) continue;
      if (Math.sign(dx) === f || dx === 0) front++;
      else back++;
    }
    let name;
    if (!this.onGround) {
      // in the air: a quick cut on the way down
      name = this.chain % 2 ? "cross" : "slash";
      this.chain = (this.chain + 1) % 3;
    } else if (front && back && this.spinCd <= 0) {
      name = "spin";
      this.spinCd = 1.6;
    } else if (tgt && !this.inReach(tgt)) {
      name = this.bags.lunge.next();
      this.lungeCd = 0.9;
    } else {
      const step = ["open", "link", "finish"][this.chain % 3];
      const high = tgt && tgt.y - (tgt.h ?? 20) < -34;
      const tough = tgt && (tgt.elite || tgt.boss || front >= 3);
      const prefer = step === "link" && high ? ["uppercut"] : step === "finish" && tough ? ["hammer", "cleave"] : null;
      name = this.bags[step].next(prefer);
      this.chain = (this.chain + 1) % 3;
    }
    this.chainT = 1.1;
    if (!this.begin(name)) return;
    this.moveCount[name] = (this.moveCount[name] ?? 0) + 1;
    this.atkCd = (SLOW.has(name) ? 0.3 : 0.1) / this.stats.atkSpeed;
  }
  begin(name) {
    const a = ATTACKS[name], mod = fxModule(a.fx);
    if (!mod) return false;
    const g = this.game, rate = a.rate * this.stats.atkSpeed;
    this.actName = name;
    this.act = new ActPlayer(mod, {
      id: a.fx, rate, from: a.from, x: this.x, y: 0, facing: this.facing, director: g.fx,
      fx: { palette: RAMPS[a.palette] ?? RAMPS.hero, light: 1 },
      onStart: () => {
        sfx(a.sfx, { w: a.weight, pan: g.pan(this.x) });
        this.glow = 1;
      },
      onHit: (hit, i, act) => g.heroHit(a, hit, i, act),
    });
    // a lunge closes the gap it was chosen for
    if (COMBO.lunge.includes(name) && this.onGround) this.vx = this.facing * 90;
    if (!this.onGround) this.airAttacked = true;
    return true;
  }

  /** Start a whole PixelFX move (an ultimate): the hero performs it, the game deals its damage. */
  perform(player) {
    this.act = null;
    this.actName = null;
    this.moveOverride = player;
    this.invuln = Math.max(this.invuln, (player.to - player.t) / player.rate + 0.3);
  }

  hurt(dmg, fromX, opts = {}) {
    if (this.dead || this.iframes > 0 || this.invuln > 0 || this.god) return false;
    const g = this.game;
    if (g.skills?.onHeroHurt?.(dmg, fromX)) return false; // a shield took it
    dmg = Math.max(1, dmg * (1 - this.stats.armor));
    this.hp -= dmg;
    this.iframes = 0.7;
    this.flash = 1;
    this.hurtT = 0.22;
    const dir = Math.sign(this.x - fromX) || 1;
    this.vx = dir * (opts.push ?? 120);
    if (opts.lift) {
      this.vy = -opts.lift;
      this.onGround = false;
    }
    if (this.act && !this.act.done && this.act.t < 0) {
      this.act = null;
      this.actName = null;
    }
    g.onHeroHurt(dmg, opts);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.act = null;
      g.onHeroDeath();
    }
    return true;
  }
  heal(n, quiet = false) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (!quiet && this.hp > before) this.game.floatText(`+${Math.round(this.hp - before)}`, this.x, this.y - 44, "heal");
  }

  // ---- drawing
  currentPose() {
    if (this.moveOverride) return this.moveOverride.pose;
    if (this.dead) return KNEEL;
    if (this.act) return this.act.pose;
    if (this.hurtT > 0) return HURT;
    if (!this.onGround) return this.vy < 0 ? JUMP : FALL;
    if (this.landT > 0) return LAND;
    if (Math.abs(this.vx) > 12) return poseAt(RUN, this.animT % 0.38);
    return poseAt(IDLE, this.animT % 1.2);
  }
  trail(dt, on) {
    this.ghostAcc += dt;
    if (on && this.ghostAcc >= 1 / 30) {
      this.ghostAcc = 0;
      this.ghosts.push({ pose: this.lastPose, x: this.x, y: this.y, f: this.facing < 0, age: 0 });
      if (this.ghosts.length > 6) this.ghosts.shift();
    }
    for (const g of this.ghosts) g.age += dt;
    while (this.ghosts.length && this.ghosts[0].age > 0.16) this.ghosts.shift();
  }
  updateScarf(dt) {
    const pose = this.lastPose ?? GUARD, j = jointsOf(pose).neck, f = this.facing;
    const ax = this.x + (j[0] - 1.5) * f, ay = this.y + j[1] + 1;
    const s = this.scarf;
    s[0].x = ax;
    s[0].y = ay;
    const wind = -f * 30 - this.vx * 0.6;
    for (let i = 1; i < s.length; i++) {
      const p = s[i], vx = (p.x - p.px) * 0.86, vy = (p.y - p.py) * 0.86;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + wind * dt * dt * 60 + Math.sin(this.animT * 9 + i) * 0.12;
      p.y += vy + 140 * dt * dt * 4 - 0.35 * Math.sin(this.animT * 7 + i * 0.7);
    }
    for (let k = 0; k < 3; k++)
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, L = 2.4;
        b.x = a.x + (dx / d) * L;
        b.y = a.y + (dy / d) * L;
        if (b.y > -1) b.y = -1;
      }
  }
  draw() {
    const pose = this.currentPose();
    this.lastPose = pose;
    const flip = this.facing < 0;
    for (const g of this.ghosts) drawGhost(g.pose, g.x, g.y, g.f, GHOST_C, 0.45 * (1 - g.age / 0.16));
    this.drawScarf();
    const blink = this.iframes > 0 && !this.dead && Math.floor(this.iframes * 20) % 2 === 0;
    const alpha = this.dead ? Math.max(0, 1 - Math.max(0, this.deadT - 1.2)) : blink ? 0.55 : 1;
    drawRig(pose, this.x, this.y, flip, SKINS.hero, {
      flash: this.flash > 0.5 ? 1 : 0,
      tint: this.flash > 0 && this.flash <= 0.5 ? [hex("#ff3050") >>> 0, 0.45] : this.invuln > 0 && this.moveOverride ? [hex("#ffd27a") >>> 0, 0.15] : null,
      alpha,
      glow: this.act ? 0.6 + this.glow * 0.6 : 0.15,
    });
  }
  drawScarf() {
    const s = this.scarf, C = frame.color, L = frame.light, W = frame.w, H = frame.h;
    const put = (x, y, c) => {
      const px = Math.round(x) - frame.ox, py = Math.round(y) - frame.oy;
      if (px < 0 || py < 0 || px >= W || py >= H) return -1;
      C[py * W + px] = c;
      return py * W + px;
    };
    for (let i = s.length - 1; i >= 1; i--) {
      const a = s[i - 1], b = s[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
        const tone = i < 3 ? 1 : i < 6 ? 1 : 2;
        put(x, y + 1, SCARF[3]);
        put(x, y, SCARF[tone]);
        if (i < 5) put(x, y - 1, SCARF[0]);
      }
    }
    // a faint warm light off the scarf tip when he moves fast
    const tip = s[s.length - 1], j = put(tip.x, tip.y, SCARF[2]);
    if (j >= 0 && Math.abs(this.vx) > 40) addLight(L, j, SCARF[0], 0.3);
  }
}
