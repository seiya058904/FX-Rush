// Skills: twelve mechanics that each change what the fight looks like, cast automatically in rotation, plus a
// few plain stat cards. Every level adds something you can see (another wave, a second meteor, a new layer of
// effect), and they feed each other: frozen monsters shatter under fire, poison spreads on death, kills explode
// and the explosions kill again. All visuals are PixelFX effects; damage lands on each effect's own hit frame.

import { RAMPS } from "../fx/palettes.js";
import { damage, damageRadius, damageBox, impactAt } from "./combat.js";
import { afflict } from "./status.js";
import { Projectile } from "./projectiles.js";
import { sfx } from "../engine/audio.js";

const A = (g) => g.hero.stats.atk;

export const SKILLS = {
  blade: {
    name: "剑气斩", icon: "blade", color: "#ffc65a", max: 5,
    desc: ["普攻斩出 1 道飞行剑气", "剑气 +1 道，附带流血", "剑气向身后也斩出一道", "剑气穿透 +2，伤害提升", "每第 3 刀斩出巨型死神镰刃"],
    onAttack(g, lv, atk) {
      const h = g.hero, f = h.facing, dmg = A(g) * (0.55 + lv * 0.12);
      const wave = (dir, dy, id, delay, big) =>
        g.later(delay, () => {
          const p = new Projectile(g, {
            x: h.x + dir * 22, y: -24 + dy, vx: dir * (big ? 150 : 270), vy: 0, fx: id, fxOpts: { palette: big ? RAMPS.void : RAMPS.hero, light: 1, layer: "front" },
            fxDx: -dir * 26, fxDy: 24 - dy, r: big ? 22 : 12, life: big ? 0.9 : 0.42, pierce: big ? 99 : lv >= 4 ? 3 : 1, dmg: big ? dmg * 3 : dmg,
            el: "melee", speed: big ? 0.9 : 0.75, push: big ? 160 : 70, src: "blade",
            onHit: (g2, e) => {
              damage(g2, e, big ? dmg * 3 : dmg, { el: "melee", dir, push: big ? 160 : 70, stop: 0.02, src: "blade", quiet: true });
              if (lv >= 2) afflict(g2, e, "bleeding", 3, { power: 0.12 });
            },
          });
          g.projectiles.push(p);
        });
      wave(f, 0, "melee/sword-slash", 0, false);
      if (lv >= 2) wave(f, -16, "melee/double-slash", 0.06, false);
      if (lv >= 3) wave(-f, -6, "melee/sword-slash", 0.03, false);
      if (lv >= 5 && (g.hero.swings = (g.hero.swings ?? 0) + 1) % 3 === 0) {
        wave(f, -4, "melee/scythe-reap", 0.08, true);
        sfx("whoosh", { pan: g.pan(h.x) });
      }
    },
  },
  chain: {
    name: "连锁闪电", icon: "chain", color: "#7cc8ff", max: 5,
    desc: ["每 2.8 秒放出弹跳 4 次的闪电", "弹跳 +1，目标感电", "冷却缩短，命中眩晕", "弹跳 +2，伤害提升", "召唤球形闪电环绕电击"],
    cd: [2.8, 2.5, 2.1, 1.8, 1.6],
    cast(g, lv) {
      const h = g.hero, hops = 3 + lv + (lv >= 4 ? 1 : 0), dmg = A(g) * (0.75 + lv * 0.12);
      if (lv >= 3 && (this.casts = (this.casts ?? 0) + 1) % 3 === 0 && g.nearestEnemy(h.x, h.y - 20, 150)) {
        // every third cast: PixelFX's chain lightning volley straight ahead, through three points
        const f = h.facing, x0 = h.x;
        g.fx.play("lightning/chain-lightning", { x: x0, y: 0, flip: f < 0, palette: RAMPS.electric, prio: 1, layer: "split", life: 1.6 });
        [58, 104, 150].forEach((d, i) =>
          g.later(0.05 + i * 0.09, () => {
            const hit = damageRadius(g, x0 + f * d, -22, 26, dmg * 1.3, { el: "shock", stop: 0.02, quiet: i > 0, src: "chain" });
            for (const m of hit) afflict(g, m, "shocked", 1.2);
          }),
        );
        sfx("zap", { pan: g.pan(h.x) });
        return true;
      }
      const first = g.nearestEnemy(h.x, h.y - 24, 170);
      if (!first) return false;
      const hx = h.x + h.facing * 12, hy = h.y - 26, pts = [[0, 0]], seen = new Set();
      let cur = first;
      const chain = [];
      while (cur && chain.length < hops) {
        chain.push(cur);
        seen.add(cur.id);
        pts.push([(cur.x - hx), cur.y - cur.cy - hy]);
        cur = g.nearestEnemy(cur.x, cur.y - cur.cy, 95, seen);
      }
      g.fx.play("fxrush/chain-bolt", { x: hx, y: hy, pts, palette: RAMPS.electric, prio: 1, layer: "top", hop: 0.04 });
      chain.forEach((e, i) =>
        g.later(i * 0.04, () => {
          damage(g, e, dmg, { el: "shock", stop: i === 0 ? 0.05 : 0.01, push: 40, quiet: i > 0, src: "chain" });
          if (lv >= 2) afflict(g, e, "shocked", 1.2);
          if (lv >= 3) afflict(g, e, "stunned", 0.6);
        }),
      );
      sfx("zap", { pan: g.pan(first.x) });
      return true;
    },
    passive(g, lv) {
      if (lv >= 5 && !g.fx.has("ball-lightning")) {
        const h = g.hero, orb = { x: h.x, y: -40, facing: 1 };
        g.orbs.push(orb);
        g.fx.play("lightning/ball-lightning", { follow: orb, layer: "front", prio: 1, tag: "ball-lightning", life: 99, palette: RAMPS.electric, light: 0.7 });
        orb.update = (dt, t) => {
          orb.x = h.x + Math.cos(t * 2.4) * 34;
          orb.y = h.y - 30 + Math.sin(t * 2.4) * 10;
          if ((orb.zap = (orb.zap ?? 0.8) - dt) <= 0) {
            orb.zap = 0.8;
            const e = g.nearestEnemy(orb.x, orb.y, 70);
            if (e) {
              g.fx.play("fxrush/chain-bolt", { x: orb.x, y: orb.y, pts: [[0, 0], [e.x - orb.x, e.y - e.cy - orb.y]], palette: RAMPS.electric, prio: 2, layer: "top" });
              damage(g, e, A(g) * 0.6, { el: "shock", stop: 0.01, quiet: true, src: "chain" });
            }
          }
        };
      }
    },
  },
  inferno: {
    name: "烈焰爆破", icon: "inferno", color: "#ff8a2a", max: 5,
    desc: ["击杀时 35% 几率爆炸，可连锁传染", "爆炸更大并点燃敌人", "每 6 秒释放环形火焰新星", "火柱从地底喷发", "召唤横扫战场的火焰龙卷"],
    cd: [99, 99, 6, 5.5, 5],
    onKill(g, lv, e) {
      if (g.rng() > 0.25 + lv * 0.1 || (g.blastBudget ?? 0) <= 0) return;
      g.blastBudget--;
      const x = e.x, y = e.y - e.cy, r = 30 + lv * 5;
      g.later(0.05, () => {
        g.fx.play("explosions/small-explosion", { x, y: Math.min(0, y + 14), palette: RAMPS.fire, prio: 1, life: 1, size: 0.4 + lv * 0.05, light: 0.9, layer: "back" });
        damageRadius(g, x, y, r, A(g) * (0.9 + lv * 0.15), { el: "fire", push: 150, lift: 90, stop: 0.03, shake: 1.5, quiet: true, src: "inferno" });
        if (lv >= 2) for (const m of g.enemies) if (!m.dead && Math.abs(m.x - x) < r + 10) afflict(g, m, "burning", 2.5, { power: 0.2 });
        sfx("explode", { w: 0.4, pan: g.pan(x) });
      });
    },
    cast(g, lv) {
      if (lv < 3) return false;
      const h = g.hero;
      if (!g.nearestEnemy(h.x, h.y, 100)) return false;
      g.fx.play("fire/fire-ring", { x: h.x, y: 0, palette: RAMPS.fire, prio: 1, layer: "split", light: 0.9, life: 2 });
      g.later(0.34, () => damageRadius(g, h.x, -10, 55, A(g) * 1.2, { el: "fire", push: 160, stop: 0.04, shake: 2, src: "inferno" }));
      g.later(0.55, () => damageRadius(g, h.x, -10, 92, A(g) * 0.9, { el: "fire", push: 120, stop: 0.02, quiet: true, src: "inferno" }));
      sfx("fire", { w: 0.8, pan: g.pan(h.x) });
      if (lv >= 4) {
        for (const e of g.pickEnemies(lv >= 5 ? 3 : 2)) {
          g.fx.play("fire/flame-pillar", { x: e.x, y: 0, palette: RAMPS.fire, prio: 1, life: 2.2, light: 0.8, height: 110, layer: "split" });
          g.later(0.55, () => damageRadius(g, e.x, -30, 22, A(g) * 1.8, { el: "fire", lift: 260, stop: 0.04, src: "inferno" }));
        }
      }
      if (lv >= 5) {
        const dir = h.facing, tor = { x: h.x + dir * 20, y: 0, facing: dir };
        g.fx.play("fire/fire-tornado", { follow: tor, palette: RAMPS.fire, prio: 1, life: 2.6, light: 0.7, layer: "split" });
        g.timers.push({ t: 2.6, tick: 0, update(dt) {
          tor.x += dir * 90 * dt;
          if ((this.tick -= dt) <= 0) {
            this.tick = 0.25;
            damageRadius(g, tor.x, -30, 26, A(g) * 0.5, { el: "fire", lift: 120, stop: 0.01, quiet: true, src: "inferno" });
          }
        } });
      }
      return true;
    },
  },
  frost: {
    name: "寒冰新星", icon: "frost", color: "#9bdcff", max: 5,
    desc: ["每 6 秒冰霜新星冻结周围敌人", "冻结更久，命中附带减速", "冰刺沿地面向前爆发", "冷却缩短，新星范围扩大", "召唤暴雪漩涡吞噬敌群"],
    cd: [6, 5.4, 4.8, 4, 3.6],
    cast(g, lv) {
      const h = g.hero;
      if (!g.nearestEnemy(h.x, h.y, 110)) return false;
      g.fx.play("ice/frost-nova", { x: h.x, y: 0, palette: RAMPS.frost, prio: 1, layer: "split", life: 2.2, light: 0.9, speed: 1.2 });
      sfx("ice", { pan: g.pan(h.x) });
      g.later(0.35, () => {
        const hit = damageRadius(g, h.x, -14, 64 + lv * 8, A(g) * (0.8 + lv * 0.15), { el: "ice", push: 60, stop: 0.06, shake: 2, src: "frost" });
        for (const e of hit) afflict(g, e, "frozen", 1.6 + lv * 0.25);
        sfx("shatter", { pan: g.pan(h.x) });
      });
      if (lv >= 3) {
        const f = h.facing, x0 = h.x + f * 8;
        g.fx.play("ice/ice-spikes", { x: x0, y: 0, flip: f < 0, palette: RAMPS.frost, prio: 1, life: 1.8, light: 0.8, layer: "split" });
        for (let i = 0; i < 6; i++)
          g.later(0.06 + i * 0.07, () => {
            const cx = x0 + f * (14 + i * 28);
            damageBox(g, cx - 16, -40, cx + 16, 2, A(g) * 0.7, { el: "ice", lift: 140, stop: 0.01, quiet: i > 0, src: "frost" });
          });
      }
      if (lv >= 5) {
        const c = g.clusterPoint(140);
        if (c) {
          const vor = { x: c.x, y: 0 };
          g.fx.play("ice/blizzard-vortex", { follow: vor, palette: RAMPS.frost, prio: 1, life: 2.6, layer: "split", light: 0.8 });
          g.timers.push({ t: 2.6, tick: 0, update(dt) {
            for (const e of g.enemies) if (!e.dead && !e.boss && Math.abs(e.x - vor.x) < 80) e.vx += Math.sign(vor.x - e.x) * 260 * dt;
            if ((this.tick -= dt) <= 0) {
              this.tick = 0.3;
              const hit = damageRadius(g, vor.x, -30, 40, A(g) * 0.45, { el: "ice", stop: 0, quiet: true, src: "frost" });
              for (const e of hit) afflict(g, e, "slowed", 1.5);
            }
          } });
        }
      }
      return true;
    },
    onHit(g, lv, e, dmg, info) {
      if (lv >= 2 && info.el === "melee") afflict(g, e, "slowed", 1.2);
    },
  },
  missile: {
    name: "追踪弹幕", icon: "missile", color: "#c684ff", max: 5,
    desc: ["每 2.2 秒发射 2 枚追踪奥术弹", "弹数 +1，命中可致混乱", "弹数 +1，末弹引发法力爆裂", "奥术宝珠环绕护身", "每 3 次施放召唤流星雨"],
    cd: [2.2, 2, 1.8, 1.7, 1.5],
    cast(g, lv) {
      const h = g.hero, n = [2, 3, 4, 4, 5][lv - 1], dmg = A(g) * (0.65 + lv * 0.1);
      if (!g.nearestEnemy(h.x, h.y, 220)) return false;
      this.n = (this.n ?? 0) + 1;
      if (lv >= 4 && this.n % 2 === 0) {
        // a heavy aimed bolt that weaves onto the toughest target
        const tgt = g.strongestEnemy(200);
        if (tgt) {
          g.fx.play("projectiles/magic-missile", { x: h.x, y: 0, flip: tgt.x < h.x, reach: Math.max(40, Math.min(200, Math.abs(tgt.x - h.x))), palette: RAMPS.arcane, prio: 1, life: 1.8 });
          g.later(0.82, () => {
            damageRadius(g, tgt.x, tgt.y - tgt.cy, 30, dmg * 3, { el: "arcane", stop: 0.06, shake: 2, src: "missile" });
            sfx("magic");
          });
          return true;
        }
      }
      if (lv >= 3 && this.n % 3 === 0) {
        const f = h.facing, x0 = h.x;
        g.fx.play("arcane/arcane-missiles", { x: x0, y: 0, flip: f < 0, palette: RAMPS.arcane, prio: 1, layer: "split", life: 1.8 });
        [0.77, 0.85, 0.95, 1.08, 1.2].forEach((t, i) => g.later(t, () => damageRadius(g, x0 + f * 152, -24, 30, dmg * 0.9, { el: "arcane", stop: i === 4 ? 0.05 : 0.01, quiet: i < 4, src: "missile" })));
        return true;
      }
      for (let i = 0; i < n; i++) {
        g.later(i * 0.07, () => {
          const tgt = g.nearestEnemy(h.x, h.y - 20, 240, null, i);
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (h.facing < 0 ? -0.3 : 0.3);
          const last = i === n - 1;
          const p = new Projectile(g, {
            x: h.x, y: h.y - 30, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, fx: "projectiles/plasma-shot", rotate: true,
            fxOpts: { palette: RAMPS.arcane, size: 4, light: 0.9 }, homing: tgt, turn: 7, r: 6, life: 2.2, dmg, el: "arcane", src: "missile",
            onHit: (g2, e) => {
              damage(g2, e, dmg, { el: "arcane", push: 70, stop: 0.025, quiet: !last, src: "missile" });
              if (lv >= 2 && g2.rng() < 0.25) afflict(g2, e, "confused", 2);
              if (lv >= 3 && last) {
                g2.fx.play("arcane/mana-burst", { x: e.x, y: e.y - e.cy, center: true, palette: RAMPS.arcane, prio: 1, life: 1, speed: 1.5, light: 0.7, layer: "back" });
                damageRadius(g2, e.x, e.y - e.cy, 36, dmg, { el: "arcane", stop: 0.02, quiet: true, src: "missile" });
              }
            },
          });
          g.projectiles.push(p);
          sfx("missile", { pan: g.pan(h.x) });
        });
      }
      if (lv >= 5 && (this.casts = (this.casts ?? 0) + 1) % 3 === 0) {
        const c = g.clusterPoint(160);
        if (c) {
          g.fx.play("arcane/star-fall", { x: c.x, y: 0, palette: RAMPS.arcane, prio: 1, life: 2.2, light: 0.9, layer: "split" });
          for (let k = 0; k < 5; k++) g.later(0.35 + k * 0.2, () => damageRadius(g, c.x + (g.rng() - 0.5) * 70, -14, 28, dmg * 0.9, { el: "arcane", stop: 0.02, quiet: k > 0, src: "missile" }));
        }
      }
      return true;
    },
    passive(g, lv) {
      if (lv >= 4 && !g.fx.has("arcane-orb")) {
        const h = g.hero, orb = { x: h.x, y: -30 };
        g.orbs.push(orb);
        g.fx.play("arcane/arcane-orb", { follow: orb, layer: "front", prio: 1, tag: "arcane-orb", life: 99, palette: RAMPS.arcane, light: 0.6 });
        orb.update = (dt, t) => {
          orb.x = h.x + Math.cos(-t * 3) * 42;
          orb.y = h.y - 22 + Math.sin(-t * 3) * 14 + 20;
          if ((orb.cd = (orb.cd ?? 0) - dt) <= 0) {
            const hit = damageRadius(g, orb.x, orb.y - 22, 12, A(g) * 0.5, { el: "arcane", stop: 0, quiet: true, push: 80, src: "missile" });
            if (hit.length) orb.cd = 0.35;
          }
        };
      }
    },
  },
  vortex: {
    name: "黑洞牵引", icon: "vortex", color: "#a970e0", max: 5,
    desc: ["每 10 秒生成黑洞吸聚敌人", "黑洞持续更久，被吸者受诅咒", "坍缩伤害提升", "冷却缩短，吸力更强", "坍缩后引发暗影大爆炸"],
    cd: [10, 9, 8, 7, 6],
    cast(g, lv) {
      const c = g.clusterPoint(170);
      if (!c) return false;
      const h = g.hero, hole = { x: c.x, y: -34 }, dur = 1.8 + lv * 0.2;
      // a void orb flies out and opens into the hole
      const orb = new Projectile(g, { x: h.x, y: -30, vx: (c.x - h.x) / 0.35, vy: 0, fx: "shadow/void-orb", fxOpts: { palette: RAMPS.void, light: 0.6 }, center: true, r: 1, life: 0.35, hostile: false, onHit: () => {} });
      orb.update0 = orb.update;
      g.projectiles.push(orb);
      sfx("vortex", { pan: g.pan(c.x) });
      g.later(0.35, () => {
        g.fx.play("shadow/black-hole", { x: hole.x, y: hole.y, center: true, palette: RAMPS.void, prio: 1, life: dur, light: 0.8, layer: "back" });
        g.timers.push({ t: dur, tick: 0, update(dt) {
          for (const e of g.enemies) {
            if (e.dead || e.boss) continue;
            const dx = hole.x - e.x;
            if (Math.abs(dx) < 110) {
              e.vx += Math.sign(dx) * (260 + lv * 40) * dt / e.weight;
              if (lv >= 2) afflict(g, e, "cursed", 2);
            }
          }
          if ((this.tick -= dt) <= 0) {
            this.tick = 0.25;
            damageRadius(g, hole.x, hole.y, 30, A(g) * 0.3, { el: "shadow", stop: 0, quiet: true, noSpark: true, src: "vortex" });
          }
        } });
        g.later(dur - 0.6, () => {
          g.fx.play("explosions/implosion", { x: hole.x, y: hole.y, center: true, palette: RAMPS.void, prio: 1, life: 1.4, light: 0.9 });
          g.later(0.95, () => {
            damageRadius(g, hole.x, hole.y, 70, A(g) * (2.2 + lv * 0.4), { el: "shadow", lift: 200, push: 200, stop: 0.08, shake: 3, src: "vortex" });
            sfx("explode", { w: 0.7, pan: g.pan(hole.x) });
            if (lv >= 5) {
              g.fx.play("shadow/dark-explosion", { x: hole.x, y: 0, palette: RAMPS.void, prio: 1, life: 2.2, light: 0.9 });
              g.later(0.52, () => damageRadius(g, hole.x, -40, 90, A(g) * 2.5, { el: "shadow", lift: 260, stop: 0.08, shake: 3.5, src: "vortex" }));
            }
          });
        });
      });
      return true;
    },
  },
  aegis: {
    name: "圣盾反击", icon: "aegis", color: "#ffd84a", max: 5,
    desc: ["圣盾抵挡一次伤害并震退周围敌人", "充能加快，反击伤害提升", "格挡时回复生命", "反弹敌方飞弹", "反击时降下 3 道圣光审判"],
    recharge: [9, 8, 7, 6, 5],
    passive(g, lv) {
      const h = g.hero;
      g.aegisT = (g.aegisT ?? 0) - g.frameDt;
      if (!g.aegisReady && g.aegisT <= 0) {
        g.aegisReady = true;
        g.aegisFx = g.fx.play("holy/divine-shield", { x: h.x, y: h.y, follow: h, palette: RAMPS.holy, layer: "split", prio: 1, life: 99, light: 0.45, radius: 23 });
        sfx("shield");
      }
    },
    absorb(g, lv, dmg, fromX) {
      if (!g.aegisReady) return false;
      const h = g.hero;
      g.aegisReady = false;
      g.aegisT = this.recharge[lv - 1];
      g.aegisFx?.stop();
      const dir = Math.sign(fromX - h.x) || h.facing;
      g.fx.play("impacts/shield-block", { x: h.x, y: h.y, flip: dir < 0, palette: RAMPS.holy, prio: 0, layer: "split" });
      g.fx.play("holy/sunburst", { x: h.x, y: h.y - 22, center: true, palette: RAMPS.holy, prio: 1, life: 0.7, layer: "back", light: 0.8 });
      g.fx.play("holy/feather-burst", { x: h.x, y: h.y - 24, center: true, prio: 2, life: 1.6, layer: "front" });
      damageRadius(g, h.x, h.y - 20, 70 + lv * 6, A(g) * (1.2 + lv * 0.3), { el: "holy", push: 260, lift: 80, stop: 0.08, shake: 2.5, src: "aegis" });
      g.hitStop(0.1);
      sfx("shield");
      if (lv >= 3) h.heal(6 + lv);
      if (lv >= 5) for (const e of g.pickEnemies(3)) g.skills.smite(e, 1.6);
      h.iframes = 0.5;
      return true;
    },
  },
  meteor: {
    name: "陨石天降", icon: "meteor", color: "#ff5a3a", max: 5,
    desc: ["每 11 秒陨石砸向敌群", "陨石点燃落点", "一次召唤两颗陨石", "冷却缩短，范围扩大", "每 3 次施放引发毁灭巨爆"],
    cd: [11, 10, 9, 7.5, 7],
    cast(g, lv) {
      const n = lv >= 3 ? 2 : 1;
      const targets = [g.clusterPoint(170), g.clusterPoint(170, 50)].filter(Boolean).slice(0, n);
      if (!targets.length) return false;
      const big = lv >= 5 && (this.casts = (this.casts ?? 0) + 1) % 3 === 0;
      targets.forEach((c, i) =>
        g.later(i * 0.35, () => {
          g.fx.play("arcane/rune-circle", { x: c.x, y: 0, palette: RAMPS.danger, prio: 1, life: 0.9, layer: "ground", light: 0.6 });
          g.later(0.25, () => {
            g.fx.play("fire/meteor", { x: c.x, y: 0, palette: RAMPS.fire, prio: 0, life: 2.4, light: 1, layer: "split" });
            sfx("whoosh", { pan: g.pan(c.x) });
            g.later(0.62, () => {
              damageRadius(g, c.x, -12, 46 + lv * 6, A(g) * (2.6 + lv * 0.4), { el: "fire", lift: 220, push: 200, stop: 0.09, shake: 3.5, heavy: true, src: "meteor" });
              if (lv >= 2) for (const e of g.enemies) if (!e.dead && Math.abs(e.x - c.x) < 60) afflict(g, e, "burning", 3, { power: 0.25 });
              sfx("explode", { w: 0.9, pan: g.pan(c.x) });
              if (big && i === 0) {
                g.fx.play("explosions/big-explosion", { x: c.x, y: 0, palette: RAMPS.fire, prio: 0, life: 3, light: 1 });
                g.later(0.1, () => damageRadius(g, c.x, -40, 130, A(g) * 4, { el: "fire", lift: 300, stop: 0.14, shake: 4, src: "meteor" }));
                sfx("bigboom", { pan: g.pan(c.x) });
              }
            });
          });
        }),
      );
      return true;
    },
  },
  thunder: {
    name: "雷霆天罚", icon: "thunder", color: "#ffe03c", max: 5,
    desc: ["每 7 秒天雷劈中敌人并眩晕", "同时劈中 2 个目标", "落雷时英雄周身炸响雷鸣", "同时劈中 3 个目标", "雷暴云随行，持续降下落雷"],
    cd: [7, 6.5, 6, 5.5, 5],
    cast(g, lv) {
      const n = [1, 2, 2, 3, 3][lv - 1];
      const list = g.pickEnemies(n, true);
      if (!list.length) return false;
      for (const e of list) {
        const x = e.x;
        g.fx.play("lightning/lightning-strike", { x, y: 0, palette: RAMPS.volt, prio: 0, life: 1.6, light: 1, layer: "split" });
        g.later(0.76, () => {
          const hit = damageRadius(g, x, -16, 28, A(g) * (2 + lv * 0.35), { el: "shock", lift: 120, stop: 0.07, shake: 3, src: "thunder" });
          for (const m of hit) afflict(g, m, "stunned", 1.1);
          sfx("thunder", { pan: g.pan(x) });
          g.flashScreen(0.18, "#e8f4ff");
        });
      }
      if (lv >= 3) {
        const h = g.hero;
        g.later(0.7, () => {
          g.fx.play("lightning/thunderclap", { x: h.x, y: h.y, palette: RAMPS.volt, prio: 1, life: 1.4, layer: "split" });
          g.later(0.12, () => damageRadius(g, h.x, -20, 80, A(g) * 1.1, { el: "shock", push: 220, stop: 0.04, quiet: true, src: "thunder" }));
        });
      }
      return true;
    },
    passive(g, lv) {
      if (lv >= 5 && !g.fx.has("storm-cloud")) {
        const h = g.hero, cloud = { x: h.x, y: -96 };
        g.orbs.push(cloud);
        g.fx.play("lightning/storm-cloud", { follow: cloud, tag: "storm-cloud", life: 99, layer: "back", prio: 1, light: 0.6, palette: RAMPS.volt });
        cloud.update = (dt) => {
          cloud.x += (h.x - cloud.x) * Math.min(1, dt * 2);
          if ((cloud.cd = (cloud.cd ?? 1.2) - dt) <= 0) {
            cloud.cd = 1.2;
            const e = g.nearestEnemy(cloud.x, -20, 120);
            if (e) {
              g.fx.play("fxrush/chain-bolt", { x: cloud.x, y: -80, pts: [[0, 0], [e.x - cloud.x, e.y - e.cy + 80]], palette: RAMPS.volt, prio: 2, layer: "top" });
              damage(g, e, A(g) * 1.2, { el: "shock", stop: 0.02, src: "thunder" });
              sfx("zap", { pan: g.pan(e.x) });
            }
          }
        };
      }
    },
  },
  holy: {
    name: "圣光审判", icon: "holy", color: "#fff09a", max: 5,
    desc: ["每 8 秒圣光重锤砸向最强敌人", "审判魅惑周围敌人", "降下持续灼烧的光柱", "冷却缩短，击杀回复生命", "获得光环与祝福：暴击大幅提升"],
    cd: [8, 7.5, 7, 6, 5.5],
    cast(g, lv) {
      const e = g.strongestEnemy(180);
      if (!e) return false;
      g.skills.smite(e, 2.6 + lv * 0.4, lv >= 2);
      if (lv >= 3) {
        const c = g.clusterPoint(160) ?? e;
        g.fx.play("holy/holy-pillar", { x: c.x, y: 0, palette: RAMPS.holy, prio: 1, life: 2.4, light: 0.9, layer: "split" });
        g.later(0.66, () => {
          g.timers.push({ t: 1.4, tick: 0, update(dt) {
            if ((this.tick -= dt) <= 0) {
              this.tick = 0.2;
              damageBox(g, c.x - 20, -150, c.x + 20, 2, A(g) * 0.5, { el: "holy", stop: 0, quiet: true, noSpark: true, src: "holy" });
            }
          } });
          sfx("holy", { pan: g.pan(c.x) });
        });
      }
      return true;
    },
    onKill(g, lv, e) {
      if (lv >= 4 && e.lastHitBy === "holy") g.hero.heal(2, true);
    },
    passive(g, lv) {
      if (lv >= 5 && !g.fx.has("halo")) {
        const h = g.hero;
        g.fx.play("holy/halo", { follow: h, x: h.x, y: h.y, tag: "halo", life: 99, layer: "split", prio: 1, light: 0.7 });
        g.fx.play("holy/blessing", { follow: h, x: h.x, y: h.y, tag: "blessing", life: 99, layer: "back", prio: 2, light: 0.5 });
        h.stats.crit += 0.15;
      }
    },
  },
  earth: {
    name: "大地之怒", icon: "earth", color: "#b88a52", max: 5,
    desc: ["每 6 秒荆棘破土，定身敌人", "荆棘更多，伤害提升", "石刺贯穿最强敌人并石化", "藤鞭横扫前方", "引发全屏地震"],
    cd: [6, 5.5, 5, 4.5, 4],
    cast(g, lv) {
      const h = g.hero, f = h.facing;
      if (!g.nearestEnemy(h.x, h.y, 150)) return false;
      const x0 = h.x + f * 10, count = 5 + lv;
      if (lv >= 2) g.fx.play("nature/leaf-storm", { x: h.x, y: h.y, follow: h, actor: g.heroActor(), palette: RAMPS.earth, prio: 2, layer: "split", life: 1.2 });
      g.fx.play("nature/thorns", { x: x0, y: 0, flip: f < 0, palette: RAMPS.earth, count, prio: 1, life: 2, layer: "split" });
      for (let i = 0; i < count; i++)
        g.later(0.11 + i * 0.05, () => {
          const cx = x0 + f * (16 + i * 20);
          const hit = damageBox(g, cx - 12, -34, cx + 12, 2, A(g) * (0.7 + lv * 0.12), { el: "earth", lift: 160, stop: 0.015, quiet: i > 0, src: "earth" });
          for (const e of hit) afflict(g, e, "rooted", 1.6);
        });
      sfx("earth", { pan: g.pan(h.x) });
      if (lv >= 3) {
        const e = g.strongestEnemy(170);
        if (e) {
          g.fx.play("nature/earth-spike", { x: e.x, y: 0, palette: RAMPS.stone, prio: 1, life: 2, layer: "split" });
          g.later(0.34, () => {
            damage(g, e, A(g) * 3, { el: "earth", lift: 300, heavy: true, stop: 0.08, shake: 2.5, src: "earth" });
            if (!e.dead) afflict(g, e, "petrified", 2.5);
          });
        }
      }
      if (lv >= 4) {
        g.fx.play("nature/vine-whip", { x: h.x - f * 4, y: 0, flip: f < 0, prio: 1, life: 1.3, layer: "split" });
        g.later(0.36, () => damageBox(g, h.x + (f > 0 ? 0 : -150), -60, h.x + (f > 0 ? 150 : 0), 2, A(g) * 1.3, { el: "earth", push: 260, stop: 0.05, src: "earth" }));
      }
      if (lv >= 5 && (this.casts = (this.casts ?? 0) + 1) % 2 === 0) {
        g.fx.play("nature/quake", { x: g.camX + 160, y: 0, palette: RAMPS.earth, prio: 1, life: 2.4, layer: "ground" });
        for (const t of [0.06, 0.5, 0.92])
          g.later(t, () => {
            for (const e of g.enemies) if (!e.dead && e.y > -12 && Math.abs(e.x - g.camX - 160) < 170) damage(g, e, A(g) * 0.9, { el: "earth", lift: 180, stop: 0, quiet: true, noSpark: true, src: "earth" });
            g.shake(3, 0.3);
            sfx("earth");
          });
      }
      return true;
    },
  },
  plague: {
    name: "剧毒瘟疫", icon: "plague", color: "#a8e04a", max: 5,
    desc: ["每 5 秒在敌群中释放毒云", "中毒者死亡时酸液四溅传染", "死亡处留下剧毒沼泽", "毒素伤害翻倍", "孢子菇爆发，毒雾笼罩全场"],
    cd: [5, 4.6, 4.2, 3.8, 3.4],
    cast(g, lv) {
      const c = g.clusterPoint(170);
      if (!c) return false;
      g.fx.play("nature/poison-cloud", { x: c.x, y: 0, palette: RAMPS.poison, prio: 1, life: 3, layer: "back", light: 0.6 });
      g.timers.push({ t: 3, tick: 0, update(dt) {
        if ((this.tick -= dt) <= 0) {
          this.tick = 0.5;
          for (const e of g.enemies) if (!e.dead && Math.abs(e.x - c.x) < 70 && e.y > -50) afflict(g, e, "poisoned", 3, { power: lv >= 4 ? 0.36 : 0.18 });
        }
      } });
      sfx("poison", { pan: g.pan(c.x) });
      if (lv >= 5 && (this.casts = (this.casts ?? 0) + 1) % 2 === 0) {
        const s = g.clusterPoint(170, 40) ?? c;
        g.fx.play("nature/spore-burst", { x: s.x, y: 0, prio: 1, life: 2.6, layer: "split" });
        g.later(0.8, () => {
          const hit = damageRadius(g, s.x, -30, 80, A(g) * 1.5, { el: "poison", push: 120, stop: 0.04, src: "plague" });
          for (const e of hit) afflict(g, e, "poisoned", 4, { power: 0.4 });
        });
      }
      return true;
    },
    onKill(g, lv, e) {
      if (!(e.status.poisoned > 0)) return;
      if (lv >= 2) {
        g.fx.play("nature/acid-splash", { x: e.x, y: 0, palette: RAMPS.poison, prio: 2, life: 1.6 });
        g.later(0.3, () => {
          for (const m of g.enemies) if (!m.dead && Math.abs(m.x - e.x) < 46) afflict(g, m, "poisoned", 3, { power: 0.22 });
        });
      }
      if (lv >= 3 && g.rng() < 0.4) {
        const x = e.x;
        g.fx.play("nature/toxic-puddle", { x, y: 0, palette: RAMPS.poison, prio: 2, life: 3, layer: "ground", light: 0.5 });
        g.timers.push({ t: 3, tick: 0, update(dt) {
          if ((this.tick -= dt) <= 0) {
            this.tick = 0.5;
            for (const m of g.enemies) if (!m.dead && Math.abs(m.x - x) < 24 && m.y > -8) afflict(g, m, "poisoned", 2, { power: 0.2 });
          }
        } });
      }
    },
  },
};

export const STAT_CARDS = {
  fury: { name: "狂怒", icon: "fury", color: "#ff6a5a", max: 5, desc: ["攻击速度 +15%"], apply: (g) => { g.hero.stats.atkSpeed += 0.15; g.heroBuffFx("status/haste", RAMPS.blood, 1.4); } },
  edge: { name: "锋锐", icon: "edge", color: "#fff27a", max: 5, desc: ["暴击率 +8%，暴击伤害 +30%"], apply: (g) => { g.hero.stats.crit += 0.08; g.hero.stats.critMul += 0.3; g.heroBuffFx("status/rage", RAMPS.crit, 1.2); } },
  vigor: { name: "活力", icon: "vigor", color: "#7ee88a", max: 5, desc: ["生命上限 +25 并回满生命"], apply: (g) => { g.hero.maxHp += 25; g.hero.heal(999); g.heroBuffFx("holy/heal", RAMPS.heal, 1.9); } },
  vamp: { name: "嗜血", icon: "vamp", color: "#ff3050", max: 3, desc: ["普攻吸血 +2%，伤害 +10%"], apply: (g) => { g.hero.stats.lifesteal += 0.02; g.hero.stats.atk *= 1.1; g.heroBuffFx("shadow/life-steal", RAMPS.blood, 2); } },
  greed: { name: "贪婪", icon: "greed", color: "#36d0a8", max: 3, desc: ["拾取范围 +60%，经验 +15%"], apply: (g) => { g.hero.stats.magnet *= 1.6; g.xpMul += 0.15; g.heroBuffFx("pickups/collect-burst", RAMPS.xp, 1.3); } },
  might: { name: "力量", icon: "might", color: "#ffae35", max: 5, desc: ["全部伤害 +18%"], apply: (g) => { g.hero.stats.atk *= 1.18; g.heroBuffFx("status/rage", RAMPS.fire, 1.2); } },
};

export class SkillSystem {
  constructor(g) {
    this.g = g;
    this.lv = {};
    this.timers = {};
    this.gap = 0;
    this.order = [];
    this.statLv = {};
  }
  level(id) {
    return this.lv[id] ?? 0;
  }
  add(id) {
    const s = SKILLS[id];
    if (s) {
      this.lv[id] = Math.min(s.max, (this.lv[id] ?? 0) + 1);
      if (!this.order.includes(id)) this.order.push(id);
      if (s.cd) this.timers[id] = Math.min(this.timers[id] ?? 0.8, 0.8);
      if (id === "aegis" && this.lv[id] === 1) this.g.aegisT = 0.5;
      return;
    }
    const c = STAT_CARDS[id];
    if (c) {
      this.statLv[id] = (this.statLv[id] ?? 0) + 1;
      c.apply(this.g);
    }
  }
  update(dt) {
    const g = this.g;
    this.gap -= dt;
    g.frameDt = dt;
    for (const id of this.order) {
      const s = SKILLS[id], lv = this.lv[id];
      s.passive?.(g, lv);
      if (!s.cd) continue;
      this.timers[id] = (this.timers[id] ?? 0) - dt;
      if (this.timers[id] <= 0 && this.gap <= 0 && !g.hero.dead) {
        const ok = s.cast?.(g, lv);
        if (ok) {
          this.timers[id] = s.cd[lv - 1];
          this.gap = 0.3;
          g.lastCast = { id, t: g.time };
        } else this.timers[id] = 0.3;
      }
    }
  }
  /** 0..1 of the cooldown left, for the HUD. */
  cooldown(id) {
    const s = SKILLS[id];
    if (id === "aegis") return this.g.aegisReady ? 0 : Math.max(0, (this.g.aegisT ?? 0) / s.recharge[this.lv[id] - 1]);
    if (!s.cd) return 0;
    if (id === "inferno" && this.lv[id] < 3) return 0;
    return Math.max(0, Math.min(1, (this.timers[id] ?? 0) / s.cd[this.lv[id] - 1]));
  }
  onAttack(atk) {
    for (const id of this.order) SKILLS[id].onAttack?.(this.g, this.lv[id], atk);
  }
  onHit(e, dmg, info) {
    for (const id of this.order) SKILLS[id].onHit?.(this.g, this.lv[id], e, dmg, info);
    // synergy: fire or a heavy blow on a frozen monster shatters the ice for a burst of extra damage
    if (e.status.frozen > 0 && (info.el === "fire" || info.crit) && !e.dead && !info.dot) {
      e.status.frozen = 0;
      this.g.fx.play("ice/ice-shatter", { x: e.x, y: e.y, palette: RAMPS.frost, prio: 1, life: 1.4, light: 0.8 });
      this.g.later(0, () => damageRadius(this.g, e.x, e.y - e.cy, 30, this.g.hero.stats.atk * 1.5, { el: "ice", stop: 0.04, quiet: true, src: "shatter" }));
      sfx("shatter", { pan: this.g.pan(e.x) });
    }
  }
  onKill(e, el) {
    for (const id of this.order) SKILLS[id].onKill?.(this.g, this.lv[id], e, el);
  }
  onHeroHurt(dmg, fromX) {
    const lv = this.lv.aegis;
    return lv ? SKILLS.aegis.absorb(this.g, lv, dmg, fromX) : false;
  }
  /** Holy smite on one monster (used by the holy skill and the shield's top level). */
  smite(e, mult, charm = false) {
    const g = this.g, x = e.x;
    g.fx.play("holy/smite", { x, y: 0, palette: RAMPS.holy, prio: 0, life: 1.8, light: 1, layer: "split" });
    g.later(0.54, () => {
      if (!e.dead) damage(g, e, g.hero.stats.atk * mult, { el: "holy", lift: 160, heavy: true, stop: 0.08, shake: 3, src: "holy" });
      const hit = damageRadius(g, x, -16, 34, g.hero.stats.atk * mult * 0.4, { el: "holy", stop: 0, quiet: true, noSpark: true, src: "holy" });
      if (charm) for (const m of hit) afflict(g, m, "charmed", 2.4);
      sfx("holy", { pan: g.pan(x) });
      g.flashScreen(0.12, "#fff6d0");
    });
  }
}

export { impactAt };
