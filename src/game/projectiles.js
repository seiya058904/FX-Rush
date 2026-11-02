// Projectiles: a PixelFX effect whose position is the game's (PixelFX: "a projectile is just an effect whose x
// is a function of time"). The game moves it, steers homing ones, and tests the hit; the effect only draws.

import { damage } from "./combat.js";
import { sfx } from "../engine/audio.js";
import { FX } from "../fx/registry.gen.js";

let pid = 1;
export class Projectile {
  /**
   * o: { x, y, vx, vy, fx (effect id), fxOpts, hostile, dmg, r, life, pierce, el, homing (enemy), turn,
   * rotate (aim the effect along its velocity), onHit(g, target), onEnd(g, p), gravity, trailFx, speed (effect time scale) }
   */
  constructor(g, o) {
    Object.assign(this, { id: pid++, r: 6, life: 2, pierce: 0, el: "melee", turn: 0, gravity: 0, hostile: false, age: 0, dead: false, hits: new Set() }, o);
    this.g = g;
    if (o.center && FX[o.fx]) {
      this.fxDx = -FX[o.fx].fx * (this.vx < 0 && !o.rotate ? -1 : 1);
      this.fxDy = -FX[o.fx].fy;
    }
    this.handle = o.fx
      ? g.fx.play(o.fx, {
          x: this.x + (this.fxDx ?? 0), y: this.y + (this.fxDy ?? 0), flip: !o.rotate && this.vx < 0, angle: o.rotate ? this.aim() : 0, prio: o.prio ?? (this.hostile ? 0 : 1),
          layer: o.layer ?? "front", life: 99, speed: o.speed ?? 1, ...(o.fxOpts ?? {}),
        })
      : null;
  }
  aim() {
    const a = Math.atan2(this.vy, this.vx);
    return this.vx < 0 && !this.rotate ? 0 : a;
  }
  update(dt) {
    const g = this.g;
    this.age += dt;
    if (this.homing && !this.homing.dead) {
      const tx = this.homing.x, ty = this.homing.y - this.homing.cy;
      const want = Math.atan2(ty - this.y, tx - this.x), cur = Math.atan2(this.vy, this.vx), sp = Math.hypot(this.vx, this.vy);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const na = cur + Math.max(-this.turn * dt, Math.min(this.turn * dt, d));
      this.vx = Math.cos(na) * sp;
      this.vy = Math.sin(na) * sp;
    } else if (this.homing?.dead && !this.hostile) {
      this.homing = g.nearestEnemy(this.x, this.y, 200, this.hits);
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.handle) {
      this.handle.x = this.x + (this.fxDx ?? 0);
      this.handle.y = this.y + (this.fxDy ?? 0);
      if (this.rotate) this.handle.inst.options.angle = this.aim();
    }
    // floor
    if (this.y > (this.floorY ?? 2)) return this.end(true);
    if (this.age >= this.life || Math.abs(this.x - g.camX - 160) > 300) return this.end(false);
    if (this.hostile) {
      const h = g.hero;
      if (Math.abs(h.x - this.x) < this.r + 7 && this.y > h.y - 38 - this.r && this.y < h.y + this.r) {
        if (h.hurt(this.dmg, this.x - Math.sign(this.vx) * 10, { push: 110 })) {
          this.onHit?.(g, h);
          return this.end(true);
        } else if (h.invuln <= 0 && h.iframes <= 0) return this.end(true);
      }
      // the hero's blades and shields can swat hostile shots
      return;
    }
    for (const e of g.enemies) {
      if (e.dead || e.spawning > 0 || this.hits.has(e.id)) continue;
      const [a, b, c, d] = e.hitbox();
      if (this.x + this.r < a || this.x - this.r > c || this.y + this.r < b || this.y - this.r > d) continue;
      this.hits.add(e.id);
      if (this.onHit) this.onHit(g, e, this);
      else damage(g, e, this.dmg, { el: this.el, dir: Math.sign(this.vx) || 1, push: this.push ?? 60, stop: this.stop ?? 0.03, src: this.src });
      if (this.pierce-- <= 0) return this.end(true);
    }
  }
  end(impact) {
    if (this.dead) return;
    this.dead = true;
    if (this.handle) this.handle.stop();
    this.onEnd?.(this.g, this, impact);
  }
}

export function updateProjectiles(g, dt) {
  for (const p of g.projectiles) if (!p.dead) p.update(dt);
  if (g.projectiles.some((p) => p.dead)) g.projectiles = g.projectiles.filter((p) => !p.dead);
}

export { sfx };
