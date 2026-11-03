// Damage and its feedback, in one place so every source of damage feels the same way:
// contact frame (impact effect at the struck point, flash, squash) -> freeze (hit-stop by weight) -> reaction
// (knockback, launch, stagger, status) -> numbers -> follow-through (death effect, loot, combo, chain reactions).
// Four tiers read differently: normal hits, crits, area blasts, and finishers (boss kills).

import { sfx } from "../engine/audio.js";
import { RAMPS } from "../fx/palettes.js";

// dusky, never white: a kill pop must not turn into a bright cloud behind the numbers
const SMOKE_POP = ["#120c16", "#1e1622", "#2a1e2e", "#3a2e3c", "#4a3a48", "#5e4c5a", "#76626e"];
const ELEMENT_HIT = {
  melee: "impacts/hit-spark",
  fire: "impacts/hit-spark",
  ice: "ice/snowflake-burst",
  shock: "lightning/zap-hit",
  arcane: "impacts/hit-spark",
  holy: "impacts/hit-spark",
  shadow: "impacts/hit-spark",
  earth: "impacts/blunt-hit",
  poison: null,
  blast: null,
};
const ELEMENT_PAL = {
  melee: RAMPS.hero, fire: RAMPS.fire, ice: RAMPS.frost, shock: RAMPS.electric, arcane: RAMPS.arcane, holy: RAMPS.holy,
  shadow: RAMPS.void, earth: RAMPS.earth, poison: RAMPS.poison, blast: RAMPS.fire,
};

/**
 * Deal damage to an enemy. o: { el (element), dir (-1/1 push direction), push, lift, crit (force), stop (hit-stop),
 * shake, weight (0..1 sound weight), noSpark, quiet (no sound), heavy (interrupts), src (skill id), noCrit }.
 * Returns the damage dealt.
 */
export function damage(g, e, base, o = {}) {
  if (e.dead || e.spawning > 0 || e.invulnerable) return 0;
  const hero = g.hero, st = hero.stats;
  const el = o.el ?? "melee";
  let crit = !!o.crit;
  if (!crit && !o.noCrit) crit = g.rng() < st.crit + (e.status.frozen > 0 ? 0.25 : 0) + (g.rushMode ? 0.25 : 0);
  let dmg = base * (crit ? st.critMul : 1);
  if (e.status.cursed > 0) dmg *= 1.35;
  if (e.status.petrified > 0) dmg *= 1.25;
  dmg *= 0.9 + g.rng() * 0.2;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.lastHitBy = el;
  const dir = o.dir ?? (Math.sign(e.x - hero.x) || 1);
  const cx = e.x, cy = e.y - e.cy;

  // contact
  e.flash = 1;
  e.squash = crit ? 1 : 0.75;
  const resist = e.boss ? 0.08 : e.elite ? 0.25 : 1;
  if (o.push) e.vx = dir * (o.push / e.weight) * resist;
  if (o.lift && !e.boss) {
    e.vy = -(o.lift / e.weight) * resist;
    if (e.hover > 0) e.vy *= 0.5;
  }
  if (!e.boss) e.hurtT = Math.max(e.hurtT, (crit ? 0.22 : 0.14) * (e.elite ? 0.4 : 1));
  if (o.heavy || crit) e.interrupt?.();

  // impact effect at the struck point, aimed along the blow
  if (!o.noSpark) {
    const id = crit ? "impacts/crit-hit" : o.heavy ? "impacts/blunt-hit" : ELEMENT_HIT[el];
    if (id) impactAt(g, id, cx - dir * 4, cy, dir, { prio: crit ? 0 : 1, palette: crit ? RAMPS.crit : ELEMENT_PAL[el], light: crit ? 0.6 : 0.5, maxSame: crit ? 2 : 4 });
  }
  // freeze: heavier blows hold longer; a flood of small hits can't stall the game
  const stop = o.stop ?? (crit ? 0.085 : 0.035);
  g.hitStop(crit ? Math.max(stop, 0.08) : stop);
  if (o.shake ?? crit) g.shake(crit ? Math.max(2.2, o.shake ?? 0) : o.shake, crit ? 0.22 : 0.14);

  // sound on the same frame
  if (!o.quiet) {
    const pan = g.pan(cx);
    if (crit) sfx("crit", { pan });
    else sfx(o.heavy ? "heavy" : "hit", { w: o.weight ?? 0.5, pan, pitch: 0.9 + g.rng() * 0.25 });
  }

  // numbers
  if (!o.quiet || crit) g.damageNumber(dmg, cx, cy - 6, crit, el, e);
  g.combo.hit();
  g.rush(crit ? 0.9 : 0.35);
  g.stats.damage += dmg;
  if (hero.stats.lifesteal && el === "melee") hero.heal(dmg * hero.stats.lifesteal, true);

  // skills react to hits (bleed, chain, freeze...)
  g.skills.onHit(e, dmg, { el, crit, src: o.src });

  if (e.elite && !e.boss && e.hp > 0 && dmg >= e.maxHp * 0.06)
    g.fx.play("ui/health-bar-hit", { x: e.x, y: e.y - e.h - 12, center: true, from: Math.min(1, (e.hp + dmg) / e.maxHp), to: e.hp / e.maxHp, prio: 2, layer: "top", life: 1.3, maxSame: 1, speed: 1.4 });
  if (e.hp <= 0) kill(g, e, { el, dir, crit, overkill: -e.hp / e.maxHp });
  else if (e.boss) g.onBossHit?.(e, dmg);
  return dmg;
}

// impacts whose origin is the floor under the hit and whose `height` lifts the hit point (sparks bounce on the real floor)
const FLOOR_IMPACTS = new Set(["impacts/hit-spark", "impacts/crit-hit", "impacts/blunt-hit", "impacts/bullet-impact", "impacts/parry"]);
/** An impact effect at world point (x, y), aimed along dir. */
export function impactAt(g, id, x, y, dir, o = {}) {
  if (FLOOR_IMPACTS.has(id)) return g.fx.play(id, { x, y: 0, height: Math.max(3, -y), flip: dir < 0, layer: "top", ...o });
  if (id === "ice/snowflake-burst") return g.fx.play(id, { x, y, center: true, flip: dir < 0, layer: "top", life: 1.2, speed: 1.4, ...o });
  return g.fx.play(id, { x, y, flip: dir < 0, layer: "top", ...o });
}

/** An enemy dies: how it goes depends on what killed it. */
export function kill(g, e, { el = "melee", dir = 1, crit = false, overkill = 0 } = {}) {
  if (e.dead) return;
  e.dead = true;
  e.killedBy = el;
  e.deathT = 0;
  e.deathLen = 0.28;
  e.act = null;
  for (const h of e.statusFx.values()) h.stop();
  e.statusFx.clear();
  e.statusHidesBody = false;
  const T = e.T, cx = e.x, cy = e.y - e.cy;
  if (e.boss) return g.onBossDeath(e);
  // launch the body the way it was hit
  e.vx = dir * (140 + overkill * 120) / Math.max(0.6, e.weight * 0.6);
  e.vy = -120 - overkill * 80;
  e.flash = 1;
  const ai = e.actorInfo;
  const actorOpts = ai ? { actor: ai.actor } : {};
  const fy = e.y + (ai?.footY ?? 0), fx = e.x + (ai?.footX ?? 0) * (e.facing < 0 ? -1 : 1);
  // the death effect: frozen things shatter, burnt things crumble to ash, shocked things come apart in light
  let id = T.deathFx, pal = T.deathPal;
  if (e.elite) void 0;
  else if (e.status.frozen > 0 || el === "ice") (id = "spawn/shatter-death"), (pal = RAMPS.frost);
  else if (e.status.burning > 0 || el === "fire") (id = "spawn/dissolve-burn"), (pal = RAMPS.fire);
  else if (el === "shock") (id = "spawn/disintegrate"), (pal = RAMPS.electric);
  else if (el === "shadow") (id = "spawn/soul-rise"), (pal = RAMPS.void);
  else if (el === "holy") (id = "spawn/soul-rise"), (pal = RAMPS.holy);
  else if (e.status.petrified > 0 || el === "earth") (id = "spawn/poof"), (pal = RAMPS.stone);
  const body = ["spawn/shatter-death", "spawn/dissolve-burn", "spawn/disintegrate", "spawn/soul-rise"].includes(id);
  if (body && ai) {
    // the body itself performs the death: hide the sprite and let the effect draw it
    e.deathLen = 0.02;
    g.fx.play(id, { x: fx, y: fy, flip: e.facing < 0, palette: pal, ...actorOpts, prio: 2, layer: "split", life: 1.6, speed: 1.6 });
  } else {
    e.deathLen = 0.2;
    // a quick pop behind the living: the crowd and the hero stay readable through a chain of kills
    const poof = (id ?? "spawn/poof") === "spawn/poof";
    g.fx.play(id ?? "spawn/poof", { x: cx, y: cy, center: true, palette: poof ? SMOKE_POP : pal, prio: 2, life: poof ? 0.5 : 1.1, speed: poof ? 1.9 : 1.4, light: poof ? 0.3 : 0.6, layer: "back" });
  }
  // a big overkill crit gets a POW!, but only now and then
  if (crit && overkill > 1 && g.time - (g.lastPow ?? -9) > 2.5) {
    g.lastPow = g.time;
    g.fx.play("explosions/cartoon-pow", { x: cx, y: cy, center: true, prio: 2, life: 0.7, speed: 1.4, palette: RAMPS.crit, text: g.rng() < 0.5 ? "POW!" : "BAM!" });
  }
  sfx("kill", { pan: g.pan(cx), pitch: 0.8 + g.rng() * 0.5 });
  g.onKill(e, el);
}

/** Damage everything in a world box. Returns the enemies hit. */
export function damageBox(g, x0, y0, x1, y1, base, o = {}) {
  const hit = [];
  for (const e of g.enemies) {
    if (e.dead || e.spawning > 0) continue;
    const [a, b, c, d] = e.hitbox();
    if (c < x0 || a > x1 || d < y0 || b > y1) continue;
    hit.push(e);
  }
  // many targets: each extra one shortens its own freeze so a sweep through a crowd stays fluid
  const n = hit.length;
  hit.forEach((e, i) => damage(g, e, base, { ...o, stop: i === 0 ? o.stop : 0.01, quiet: o.quiet || i > 1, dir: o.dir ?? (Math.sign(e.x - (x0 + x1) / 2) || 1) }));
  if (n >= 3) g.shake(Math.min(3, 1 + n * 0.2), 0.16);
  return hit;
}

/** Damage everything within a radius of a point. */
export function damageRadius(g, x, y, r, base, o = {}) {
  const hit = [];
  for (const e of g.enemies) {
    if (e.dead || e.spawning > 0) continue;
    const dx = e.x - x, dy = e.y - e.cy - y;
    if (dx * dx + dy * dy > (r + e.w) * (r + e.w)) continue;
    hit.push(e);
  }
  hit.forEach((e, i) => damage(g, e, base, { ...o, stop: i === 0 ? o.stop : 0.008, quiet: o.quiet || i > 1, dir: Math.sign(e.x - x) || 1 }));
  return hit;
}
