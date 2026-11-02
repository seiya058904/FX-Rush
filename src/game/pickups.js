// Loot: experience motes (drawn light-weight, dozens at once), and PixelFX pickups for the rarer things —
// gems, hearts, coins, potions, crystal shards, power stars, keys and chests — each with its collect effect.

import { frame } from "../engine/pfx.js";
import { addLight } from "./rig.js";
import { RAMPS } from "../fx/palettes.js";
import { sfx } from "../engine/audio.js";
import { hex } from "../engine/pfx.js";

const XP_C = [hex("#e0fff0") >>> 0, hex("#5ae8c0") >>> 0, hex("#18948a") >>> 0];
const XP_L = hex("#36d0a8") >>> 0;

// kind -> [effect id, palette, height of its center above the pickup's point]
const LOOK = {
  gem: ["pickups/gem-spin", null, 8],
  heart: ["pickups/heart-pickup", null, 8],
  coin: ["pickups/coin-spin", null, 6],
  potion: ["pickups/potion", null, 9],
  shard: ["pickups/crystal-shard", null, 10],
  star: ["pickups/power-star", null, 12],
  key: ["pickups/key-glint", null, 9],
  orb: ["pickups/xp-orb", RAMPS.xp, 6],
  chest: ["pickups/chest-open", null, 0],
};

export class Pickup {
  constructor(g, kind, x, y, o = {}) {
    Object.assign(this, { g, kind, x, y, vx: o.vx ?? (Math.random() - 0.5) * 80, vy: o.vy ?? -120 - Math.random() * 80, value: o.value ?? 1, age: 0, dead: false, magnet: false, grounded: false });
    const look = LOOK[kind];
    if (look) {
      const chest = kind === "chest";
      this.handle = g.fx.play(look[0], { x, y, follow: this, dy: -look[2], center: !chest, prio: kind === "orb" ? 2 : 1, layer: chest ? "back" : "front", life: 99, palette: look[1] ?? undefined, light: 0.8 });
      // a chest waits, shut, until the hero walks into it
      if (chest && this.handle) this.handle.speed = 0;
    }
    if (kind === "key" || kind === "star") this.beam = g.fx.play("pickups/loot-beam", { x, y: 0, follow: this, prio: 1, layer: "back", life: 99, light: 0.7 });
  }
  update(dt) {
    const g = this.g, h = g.hero;
    this.age += dt;
    const dx = h.x - this.x, dy = h.y - 18 - this.y, d = Math.hypot(dx, dy);
    const auto = g.vacuum || (this.kind === "xp" && this.age > 7);
    if (!this.magnet && this.age > 0.35 && (d < h.stats.magnet * (this.kind === "xp" ? 1 : 0.8) || auto) && this.kind !== "key") this.magnet = true;
    // the boss's key finds its way to him: an idle hero still clears the scene
    if (this.kind === "key" && (d < 22 || this.age > 1.6) && this.age > 0.8) this.magnet = true;
    if (this.kind === "chest") {
      this.magnet = false;
      if (this.grounded && Math.abs(dx) < 18 && this.age > 0.7) return this.collect();
    }
    if (this.magnet) {
      const sp = 140 + this.age * 60 + (auto ? 200 : 0);
      this.vx += ((dx / (d || 1)) * sp - this.vx) * Math.min(1, dt * 8);
      this.vy += ((dy / (d || 1)) * sp - this.vy) * Math.min(1, dt * 8);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (d < 10) this.collect();
      return;
    }
    if (!this.grounded) {
      this.vy += 600 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= -2) {
        this.y = -2;
        if (this.vy > 60) this.vy *= -0.4;
        else {
          this.vy = 0;
          this.grounded = true;
        }
        this.vx *= 0.6;
      }
    } else {
      this.y = -2 - Math.abs(Math.sin(this.age * 3)) * (this.kind === "xp" ? 1 : 0);
    }
    if (this.age > 30 && this.kind === "xp") this.collect();
  }
  collect() {
    if (this.dead) return;
    this.dead = true;
    if (this.kind === "chest" && this.handle) {
      this.handle.speed = 1;
      this.handle.follow = null;
      this.handle.life = 3.6;
      this.g.collect(this);
      return;
    }
    this.handle?.stop();
    this.beam?.stop();
    this.g.collect(this);
  }
  draw() {
    if (this.kind !== "xp" || this.dead) return;
    const C = frame.color, L = frame.light, W = frame.w, H = frame.h;
    const px = Math.round(this.x) - frame.ox, py = Math.round(this.y) - frame.oy;
    const big = this.value > 2;
    const pts = big ? [[0, -1, 0], [-1, 0, 1], [0, 0, 0], [1, 0, 1], [0, 1, 2], [-1, -1, 1], [1, 1, 2]] : [[0, -1, 1], [-1, 0, 1], [0, 0, 0], [1, 0, 2], [0, 1, 2]];
    for (const [ox, oy, k] of pts) {
      const x = px + ox, y = py + oy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      C[y * W + x] = XP_C[k];
      addLight(L, y * W + x, XP_L, 0.35);
    }
    // a faint trail when it flies to him
    if (this.magnet) {
      const tx = px - Math.round(this.vx * 0.02), ty = py - Math.round(this.vy * 0.02);
      if (tx >= 0 && ty >= 0 && tx < W && ty < H) addLight(L, ty * W + tx, XP_L, 0.5);
    }
  }
}

export function collectFx(g, p) {
  const h = g.hero;
  switch (p.kind) {
    case "xp":
      g.gainXp(p.value);
      g.xpChain = (g.time - (g.xpLast ?? 0) < 0.4 ? (g.xpChain ?? 0) + 1 : 0);
      g.xpLast = g.time;
      sfx("xp", { pitch: 1 + Math.min(12, g.xpChain) * 0.06 });
      break;
    case "orb":
    case "gem":
      g.gainXp(p.value);
      g.fx.play("pickups/collect-burst", { x: h.x, y: h.y, palette: RAMPS.xp, prio: 1, light: 0.9 });
      sfx("magic", { pitch: 1.5 });
      break;
    case "heart":
      h.heal(20);
      g.fx.play("holy/heal", { x: h.x, y: h.y, follow: h, prio: 1, layer: "split", speed: 1.3 });
      sfx("heal");
      break;
    case "coin":
      g.coins += p.value;
      g.fx.play("ui/coin-collect", { x: h.x, y: h.y, prio: 2, count: Math.min(10, p.value + 2), light: 0.8, layer: "top", speed: 1.3 });
      sfx("coin");
      break;
    case "potion":
      g.rush(30);
      g.fx.play("pickups/collect-burst", { x: h.x, y: h.y, palette: RAMPS.arcane, prio: 1 });
      g.floatText("RUSH +30%", h.x, h.y - 50, "rush");
      sfx("magic");
      break;
    case "shard":
      g.rush(20);
      g.fx.play("pickups/collect-burst", { x: h.x, y: h.y, palette: RAMPS.gold, prio: 1 });
      sfx("magic", { pitch: 1.3 });
      break;
    case "star":
      g.starPower(7);
      sfx("levelup");
      break;
    case "chest":
      g.openChest(p.x);
      break;
    case "key":
      g.onKey();
      break;
  }
}
