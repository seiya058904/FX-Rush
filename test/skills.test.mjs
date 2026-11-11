// Regressions for the skills: passive instances and what they add to the hero (AG-FX-01), the "every 3 casts" star fall
// (AG-FX-02), and per-run skill counters (AG-FX-03). Run with `npm test`.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { load, close, seedRandom } from "./harness.mjs";

const { Game } = await load("/src/game/game.js");
const { SKILLS, STAT_CARDS, MAX_SKILLS } = await load("/src/game/skills.js");
const { damage } = await load("/src/game/combat.js");
const { updateStatus } = await load("/src/game/status.js");
const { Projectile } = await load("/src/game/projectiles.js");
const { Pickup } = await load("/src/game/pickups.js");
const { frame, clearFrame, setCamera } = await load("/src/engine/pfx.js");
const { STEP } = await load("/src/config.js");
const { preload, isLoaded } = await load("/src/engine/pfx.js");
after(close);

const BASE_CRIT = 0.08;
// the level each passive starts at, how many world entities it owns, its effect tags, what it adds to crit
const PASSIVES = [
  { id: "chain", from: 5, orbs: 1, tags: ["ball-lightning"], crit: 0 },
  { id: "missile", from: 4, orbs: 1, tags: ["arcane-orb"], crit: 0 },
  { id: "thunder", from: 5, orbs: 1, tags: ["storm-cloud"], crit: 0 },
  { id: "holy", from: 5, orbs: 0, tags: ["halo", "blessing"], crit: 0.15 },
];
const PASSIVE_FX = ["lightning/ball-lightning", "arcane/arcane-orb", "lightning/storm-cloud", "holy/halo", "holy/blessing"];

function newRun(build = {}, seed = 11) {
  const g = new Game();
  seedRandom(seed);
  g.stageEffects = () => []; // nothing loads in the background: the tests decide what is loaded and when
  g.start(seed, { build });
  g.hero.god = true;
  return g;
}
function step(g, frames = 1) {
  for (let i = 0; i < frames; i++) {
    g.pendingLevels = 0;
    g.cards = null;
    g.update(STEP);
  }
}
const live = (g, tag) => g.fx.list.filter((h) => h.tag === tag && h.alive && !h.stopping);
const spy = (g) => {
  const asked = [], play = g.fx.play;
  g.fx.play = function (id, o) {
    asked.push(id);
    return play.call(this, id, o);
  };
  return asked;
};
function exactlyOne(g, p, label) {
  assert.equal(g.orbs.length, p.orbs, `${label}: ${p.id} world entities`);
  assert.ok(Math.abs(g.hero.stats.crit - BASE_CRIT - p.crit) < 1e-9, `${label}: ${p.id} crit is ${g.hero.stats.crit}`);
}
const atTop = (p) => newRun({ [p.id]: p.from });

// keep first: it needs effect modules that nothing has loaded yet
test("AG-FX-01 resource arriving late: one instance while waiting, the effect attaches when it arrives", async () => {
  for (const id of PASSIVE_FX) assert.equal(isLoaded(id), false, `${id} must not be loaded yet`);
  const runs = PASSIVES.map((p) => [p, atTop(p)]);
  for (const [p, g] of runs) {
    step(g, 20);
    exactlyOne(g, p, "before the effect loaded");
    for (const tag of p.tags) assert.equal(live(g, tag).length, 0);
  }
  await preload(PASSIVE_FX);
  for (const [p, g] of runs) {
    step(g, 20);
    exactlyOne(g, p, "after the effect loaded");
    for (const tag of p.tags) assert.equal(live(g, tag).length, 1, `${tag} attached once`);
  }
});

test("AG-FX-01 every level of every passive: the right count, same-scene updates add nothing", async () => {
  await preload(PASSIVE_FX);
  for (const p of PASSIVES) {
    const g = newRun();
    for (let lv = 1; lv <= SKILLS[p.id].max; lv++) {
      g.skills.add(p.id);
      step(g, 30);
      const on = lv >= p.from;
      exactlyOne(g, { ...p, orbs: on ? p.orbs : 0, crit: on ? p.crit : 0 }, `level ${lv}`);
      for (const tag of p.tags) assert.equal(live(g, tag).length, on ? 1 : 0, `${tag} at level ${lv}`);
    }
  }
});

test("AG-FX-01 effect lifetime runs out: the effect is rebuilt on the same instance, nothing is added", async () => {
  await preload(PASSIVE_FX);
  for (const p of PASSIVES) {
    const g = atTop(p);
    step(g, 5);
    const orb = g.orbs[0];
    for (let round = 0; round < 3; round++) {
      for (const tag of p.tags) for (const h of live(g, tag)) h.age = h.life + 1;
      step(g, 40);
      exactlyOne(g, p, `after lifetime ${round}`);
      assert.equal(g.orbs[0], orb, "same logical instance");
      for (const tag of p.tags) {
        assert.equal(live(g, tag).length, 1, `${tag} rebuilt once`);
        if (orb) assert.equal(live(g, tag)[0].follow, orb, `${tag} rides the instance`);
      }
    }
  }
});

test("AG-FX-01 budget refuses the effect: one instance while refused, the effect returns when there is room", async () => {
  await preload([...PASSIVE_FX, "fire/torch"]);
  for (const p of PASSIVES) {
    const g = newRun();
    for (let i = 0; i < 70; i++) g.fx.play("fire/torch", { prio: 0, life: 1e6, maxSame: 1e9, x: g.hero.x });
    for (let lv = 0; lv < p.from; lv++) g.skills.add(p.id);
    step(g, 30);
    exactlyOne(g, p, "effect refused");
    for (const tag of p.tags) assert.equal(live(g, tag).length, 0, `${tag} refused by the budget`);
    for (const h of g.fx.list) if (h.id === "fire/torch") h.alive = false;
    step(g, 10);
    exactlyOne(g, p, "room again");
    for (const tag of p.tags) assert.equal(live(g, tag).length, 1, `${tag} after room`);
  }
});

test("AG-FX-01 scene change: the entity is rebuilt once, crit does not stack", async () => {
  await preload(PASSIVE_FX);
  for (const p of PASSIVES) {
    const g = atTop(p);
    step(g, 10);
    for (let scene = 1; scene <= 2; scene++) {
      g.nextStage();
      assert.equal(g.orbs.length, 0, "the old scene's entities are gone");
      step(g, 20);
      exactlyOne(g, p, `scene ${scene}`);
      for (const tag of p.tags) {
        assert.equal(live(g, tag).length, 1, `${tag} in scene ${scene}`);
        if (p.orbs) assert.equal(live(g, tag)[0].follow, g.orbs[0], `${tag} rides the new entity`);
      }
    }
  }
});

test("AG-FX-01 holy's crit is one contribution beside other sources, and a new run starts clean", async () => {
  await preload(PASSIVE_FX);
  const g = newRun({ holy: 5 });
  step(g, 3);
  STAT_CARDS.edge.apply(g);
  g.nextStage();
  step(g, 3);
  assert.ok(Math.abs(g.hero.stats.crit - (BASE_CRIT + 0.15 + 0.08)) < 1e-9, `crit ${g.hero.stats.crit}`);
  const again = newRun({ holy: 5 });
  step(again, 3);
  assert.ok(Math.abs(again.hero.stats.crit - (BASE_CRIT + 0.15)) < 1e-9, `new run crit ${again.hero.stats.crit}`);
});

function withTarget(build) {
  const g = newRun(build);
  for (const dx of [20, 30, 40, -20]) g.testSpawn("slime", dx, 1e4);
  return g;
}
const starFallsAt = (g, lv, casts) => {
  const asked = spy(g), out = [];
  for (let i = 1; i <= casts; i++) {
    asked.length = 0;
    assert.equal(SKILLS.missile.cast(g, lv), true);
    if (asked.includes("arcane/star-fall")) out.push(i);
  }
  return out;
};

test("AG-FX-02 star fall on casts 3, 6, 9, whichever branch the cast took", () => {
  assert.deepEqual(starFallsAt(withTarget({}), 5, 9), [3, 6, 9]);
});

test("AG-FX-02 a cast with no target does not count", () => {
  const g = withTarget({});
  const asked = spy(g), enemies = g.enemies;
  const cast = (want) => assert.equal(SKILLS.missile.cast(g, 5), want);
  cast(true);
  cast(true);
  g.enemies = [];
  cast(false);
  cast(false);
  g.enemies = enemies;
  assert.equal(asked.includes("arcane/star-fall"), false);
  cast(true);
  assert.equal(asked.includes("arcane/star-fall"), true);
});

test("AG-FX-02 star fall only from level 5, counted from there", () => {
  const g = withTarget({});
  assert.deepEqual(starFallsAt(g, 4, 6), []);
  assert.deepEqual(starFallsAt(g, 5, 3), [3]);
});

test("AG-FX-03 the shared skill table holds no per-run counters", () => {
  const g = withTarget({});
  for (const id of ["missile", "chain", "meteor", "earth", "plague"]) for (let i = 0; i < 4; i++) SKILLS[id].cast(g, 5);
  for (const id of Object.keys(SKILLS)) for (const k of ["n", "casts"]) assert.equal(SKILLS[id][k], undefined, `SKILLS.${id}.${k}`);
});

test("AG-FX-03 a new run casts the same sequence as the one before it", () => {
  const firstCasts = () => {
    const g = withTarget({});
    const asked = spy(g), out = [];
    for (let i = 0; i < 7; i++) {
      asked.length = 0;
      SKILLS.missile.cast(g, 5);
      out.push(asked.filter((id) => id === "projectiles/magic-missile" || id.startsWith("arcane/")).join("+") || "volley");
    }
    return out;
  };
  assert.deepEqual(firstCasts(), firstCasts());
});

test("AG-FX-03 two whole runs with the same build and seed play the same casts", async () => {
  const ids = ["chain", "missile", "meteor", "earth", "plague"];
  const fight = () => {
    const g = withTarget(Object.fromEntries(ids.map((id) => [id, 5])));
    const seen = [], play = g.fx.play;
    g.fx.play = function (id, o) {
      if (/^(arcane|lightning\/chain|projectiles\/magic|nature\/(quake|spore)|explosions\/big)/.test(id)) seen.push(`${g.time.toFixed(2)} ${id}`);
      return play.call(this, id, o);
    };
    step(g, 40 * 60);
    return seen;
  };
  await preload(PASSIVE_FX);
  const a = fight(), b = fight();
  assert.ok(a.length > 20, `only ${a.length} casts seen`);
  assert.deepEqual(a, b);
});

test("burning ticks preserve freeze; direct fire and direct critical hits still shatter", () => {
  for (const kind of ["burning", "bleeding", "poisoned", "fire", "crit"]) {
    const g = newRun(), e = g.testSpawn("slime", 20, 100), asked = spy(g);
    e.spawning = 0; e.status.frozen = 2;
    if (["burning", "bleeding", "poisoned"].includes(kind)) {
      e.status[kind] = 3; e.dot = { [kind]: 0.2 }; e.dotT = 0;
      updateStatus(g, e, STEP);
      assert.equal(e.status.frozen, 2, `${kind} must not consume freeze`);
      assert.equal(asked.includes("ice/ice-shatter"), false);
    } else {
      damage(g, e, 2, { el: kind === "fire" ? "fire" : "melee", crit: kind === "crit", noCrit: true });
      assert.equal(e.status.frozen, 0);
      assert.equal(asked.includes("ice/ice-shatter"), true);
    }
  }
});

test("six skill slots still allow upgrades and stats; results retain an independent full build", () => {
  const ids = Object.keys(SKILLS).slice(0, MAX_SKILLS), g = newRun();
  g.level = 10;
  for (const id of ids) g.skills.add(id);
  g.skills.add("might");
  for (let i = 0; i < 30; i++) {
    assert.ok(g.offerCards().every((c) => !c.skill || ids.includes(c.id)), "no seventh skill");
  }
  g.skills.add(ids[0]);
  assert.equal(g.skills.order.length, MAX_SKILLS);
  g.end(false);
  assert.equal(g.result.skills[ids[0]], 2);
  assert.deepEqual(g.result.statLv, { might: 1 });
  g.skills.add("might"); g.skills.add(ids[0]);
  assert.equal(g.result.statLv.might, 1, "result is a snapshot");
  assert.equal(g.result.skills[ids[0]], 2);
  assert.deepEqual(newRun().skills.statLv, {}, "new run is empty");
});

test("hostile projectile fallback draws only without a live visual and does not change collisions", async () => {
  await preload(["fire/fireball"]);
  const g = newRun(), h = g.hero;
  setCamera(g.camX);
  const shot = new Projectile(g, { x: h.x + 60, y: -18, vx: -120, vy: 0, fx: "fire/fireball", hostile: true, dmg: 9 });
  const pixels = () => { clearFrame(frame); shot.drawFallback(); return frame.color.some((c) => c !== 0); };
  assert.ok(shot.handle?.alive);
  assert.equal(pixels(), false, "normal visual has no duplicate fallback");
  shot.handle.stop();
  assert.equal(pixels(), true, "a retired visual cannot hide a live shot");
  shot.handle = null;
  assert.equal(pixels(), true, "a missing visual still has a marker");
  shot.hostile = false;
  assert.equal(pixels(), false, "friendly shots are unchanged");
  shot.hostile = true;
  h.god = false; h.invuln = 0; h.iframes = 0;
  const before = h.hp;
  for (let i = 0; i < 120 && !shot.dead; i++) shot.update(STEP);
  assert.equal(h.hp, before - 9);
  assert.equal(shot.dead, true);
  assert.equal(pixels(), false, "ended shots do not leave a marker");
});

test("greed credits small XP pickups without losing the bonus or multiplying drops twice", () => {
  for (const count of [0, 1, 2, 3]) {
    const g = newRun();
    g.xpNext = 1000;
    for (let i = 0; i < count; i++) g.skills.add("greed");
    for (let i = 0; i < 20; i++) {
      const e = g.testSpawn("slime", 0);
      g.onKill(e, "melee");
      const xp = g.pickups.filter((p) => p.kind === "xp" && !p.dead);
      assert.equal(xp.length, 1, "bonus does not add more visual motes");
      xp.forEach((p) => p.collect());
    }
    assert.equal(g.xp, 20 + count * 3);
  }
});

test("XP bonus applies once to gems and orbs, at collection, and handles multiple levels", () => {
  for (const [kind, value] of [["gem", 20], ["orb", 6]]) {
    const g = newRun();
    g.xpNext = 1000;
    const p = new Pickup(g, kind, g.hero.x, 0, { value });
    g.skills.add("greed");
    for (let i = 0; i < 20; i++) g.collect({ ...p, value });
    assert.equal(g.xp, value * 23, `${kind} retains fractional bonuses`);
  }
  const g = newRun();
  g.skills.add("greed");
  g.gainXp(20);
  assert.equal(g.level, 4, "23 XP crosses the 4, 7 and 10 XP thresholds");
  assert.equal(g.xp, 2);
  assert.equal(g.pendingLevels, 3);
});

test("elite chests keep their 20 base XP and forward that reward through opening", () => {
  for (const type of ["brute", "warden", "trooper"]) {
    const g = newRun(), e = g.testSpawn(type, 0);
    g.skills.add("greed");
    g.xpNext = 1000;
    g.onKill(e, "melee");
    const chest = g.pickups.find((p) => p.kind === "chest");
    assert.equal(chest.value, 20);
    chest.collect();
    // Advance the opening callback alone, so auto-loot cannot collect the gem before it is inspected.
    g.timers.filter((t) => t.once).forEach((t) => t.fn());
    const gem = g.pickups.find((p) => p.kind === "gem");
    assert.equal(gem.value, 20);
    gem.collect();
    assert.equal(g.xp, 23);
  }
});

// Keep real update ordering, timers and hero behavior, without unrelated spawns or scenery work.
function quietRun() {
  const g = newRun();
  g.updateStage = () => {};
  g.updateDecor = () => {};
  g.fx.update = () => {};
  g.hero.introT = 0;
  return g;
}
function advance(g, seconds) { step(g, Math.ceil(seconds / STEP)); }
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);

test("slow and star expiration order cannot change permanent attack speed", () => {
  for (const starFirst of [true, false]) {
    const g = quietRun();
    if (starFirst) { g.starPower(7); advance(g, 6); g.slowHero(3); advance(g, 3.1); }
    else { g.slowHero(2); g.starPower(7); advance(g, 7.1); }
    near(g.hero.stats.atkSpeed, 1, "permanent speed");
    near(g.hero.attackSpeed, 1, "effective speed after both effects end");
    near(g.hero.moveSpeed, 86, "movement recovered");
  }
});

test("fury acquired during slow and star remains exactly one permanent upgrade", async () => {
  await preload(["melee/sword-slash"]);
  const g = quietRun(), h = g.hero;
  g.slowHero(3); g.starPower(7); g.skills.add("fury");
  near(h.stats.atkSpeed, 1.15, "permanent fury");
  near(h.attackSpeed, 1.4, "slow applies to permanent plus star speed");
  near(h.moveSpeed, 43, "slow movement");
  h.begin("slash");
  const slowRate = h.act.rate;
  h.act = null;
  advance(g, 7.1);
  near(h.attackSpeed, 1.15, "fury remains after both effects end");
  h.begin("slash");
  near(slowRate / h.act.rate, 1.4 / 1.15, "actual melee playback uses effective speed");
});

test("a second star refreshes one shared duration for speed, invulnerability and RUSH", () => {
  const g = quietRun(), h = g.hero;
  h.god = false; h.invuln = 0;
  g.starPower(7); advance(g, 3); g.starPower(7); advance(g, 4.1);
  near(h.attackSpeed, 1.6, "stars do not stack attack speed");
  assert.ok(g.rushMode > 2.8 && g.rushMode < 3);
  assert.equal(h.hurt(10, h.x + 20), false, "first star's old deadline cannot end protection");
  const rush = g.rushV; g.rush(10);
  assert.equal(g.rushV, rush, "RUSH is still suppressed during the refreshed star");
  advance(g, 3);
  near(h.attackSpeed, 1, "star expires once");
  assert.equal(g.rushMode, 0);
  g.rush(10); assert.equal(g.rushV, rush + 10);
  assert.equal(h.hurt(10, h.x + 20), true, "protection expires with the other star benefits");
});

test("star protection coexists with other invulnerability and hostile projectile behavior", () => {
  const g = quietRun(), h = g.hero;
  h.god = false; h.invuln = 5;
  g.starPower(1); advance(g, 1.1);
  assert.equal(h.hurt(10, h.x + 20), false, "a short star cannot shorten existing protection");
  h.invuln = 0;
  g.starPower(7);
  const shot = new Projectile(g, { x: h.x, y: -18, vx: 0, vy: 0, hostile: true, dmg: 9, life: 20 });
  shot.update(STEP);
  assert.equal(shot.dead, false, "shots still pass through a star-protected hero");
  assert.equal(h.hp, h.maxHp);
  advance(g, 7.1);
  shot.update(STEP);
  assert.equal(shot.dead, true);
  assert.equal(h.hp, h.maxHp - 9);
});

test("buff clocks freeze during card choices, survive a scene change, and reset with a new run", () => {
  const g = quietRun();
  g.starPower(7); g.slowHero(3); advance(g, 1);
  const star = g.rushMode, slow = g.hero.slowT;
  g.openCards();
  for (let i = 0; i < 120; i++) g.update(STEP);
  near(g.rushMode, star, "card choice freezes star time");
  near(g.hero.slowT, slow, "card choice freezes slow time");
  g.cards = null;
  g.nextStage();
  near(g.rushMode, star, "scene change preserves the remaining star");
  advance(g, 6.2);
  near(g.hero.attackSpeed, 1, "effects expire after the scene change");
  g.start(11);
  near(g.hero.attackSpeed, 1, "new run starts without effects");
  assert.equal(g.rushMode, 0);
  assert.equal(g.hero.slowT, 0);
});

test("fractional XP survives scene changes but never leaks into the next run", () => {
  const g = newRun();
  g.skills.add("greed");
  g.xpNext = 1000;
  g.gainXp(1);
  g.nextStage();
  for (let i = 0; i < 19; i++) g.gainXp(1);
  assert.equal(g.xp, 23);
  g.gainXp(1);
  g.start(11);
  g.skills.add("greed"); g.xpNext = 1000;
  for (let i = 0; i < 6; i++) g.gainXp(1);
  assert.equal(g.xp, 6, "new run must not inherit the previous fractional bonus");
});
