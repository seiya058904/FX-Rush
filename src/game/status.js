// Status effects on monsters: the rule (what it does) and the look (a PixelFX status effect wrapped round the
// monster's own silhouette via its `actor`). Visuals are budgeted: the nearest few afflicted monsters get the
// full effect, the rest get a tint, so a screen of 30 burning slimes stays readable and fast.

import { RAMPS } from "../fx/palettes.js";
import { damage } from "./combat.js";

// name -> [effect id, palette, hides the body (the effect redraws it), one-shot]
export const LOOK = {
  frozen: ["status/frozen", null, true],
  burning: ["status/burning", null, false],
  poisoned: ["status/poisoned", null, false],
  shocked: ["lightning/electrified", null, false],
  stunned: ["status/stunned", null, false],
  slowed: ["status/slowed", null, false],
  cursed: ["status/cursed", null, false],
  bleeding: ["status/bleeding", null, false],
  rooted: ["nature/root-snare", null, false, true],
  charmed: ["status/charmed", null, false],
  confused: ["status/confused", null, false],
  sleep: ["status/sleep", null, false],
  petrified: ["status/petrified", null, true, true],
  rage: ["status/rage", null, false],
  haste: ["status/haste", null, false],
};
const DOT = { burning: ["fire", 0.22], poisoned: ["poison", 0.18], bleeding: ["melee", 0.16] };
const MAX_VISUAL = [4, 7, 10];

/** Afflict a monster. o: { power (DoT per tick as hero-attack multiple), src }. */
export function afflict(g, e, name, dur, o = {}) {
  if (e.dead || e.spawning > 0) return;
  if (e.boss && ["frozen", "stunned", "sleep", "petrified", "charmed", "confused", "rooted"].includes(name)) dur *= 0.25;
  else if (e.elite && ["frozen", "stunned", "sleep", "petrified", "charmed"].includes(name)) dur *= 0.5;
  const was = e.status[name] ?? 0;
  e.status[name] = Math.max(was, dur);
  if (DOT[name]) {
    e.dot ??= {};
    e.dot[name] = Math.max(e.dot[name] ?? 0, o.power ?? DOT[name][1]);
    e.dotT ??= 0.5;
  }
  if (name === "frozen" || name === "stunned" || name === "sleep" || name === "petrified") e.interrupt?.();
  showStatus(g, e, name);
}

function showStatus(g, e, name) {
  const look = LOOK[name];
  if (!look || e.statusFx.has(name)) return;
  // budget: count afflicted monsters with a visible effect
  let n = 0;
  for (const m of g.enemies) n += m.statusFx.size ? 1 : 0;
  const cap = MAX_VISUAL[g.fx.quality];
  if (n >= cap && !e.elite && !e.boss && !look[2]) return;
  const ai = e.actorInfo;
  if (!ai) return;
  const [id, pal, hides, once] = look;
  const h = g.fx.play(id, {
    x: e.x + ai.footX * (e.facing < 0 ? -1 : 1), y: e.y + ai.footY, flip: e.facing < 0, actor: ai.actor, palette: pal ?? undefined,
    follow: e, dx: ai.footX, dy: ai.footY, layer: "split", prio: e.elite || e.boss ? 1 : 2, life: once ? 3.6 : 99, light: 0.8,
  });
  if (!h) return;
  h.mirror = true;
  e.statusFx.set(name, h);
  if (hides) e.statusHidesBody = true;
}

/** Tick statuses: damage over time, end visuals that ran out. */
export function updateStatus(g, e, dt) {
  if (e.dead) return;
  if (e.dot && (e.dotT -= dt) <= 0) {
    e.dotT = 0.5;
    for (const [name, k] of Object.entries(e.dot)) {
      if (!(e.status[name] > 0)) {
        delete e.dot[name];
        continue;
      }
      damage(g, e, g.hero.stats.atk * k, { el: DOT[name][0], noSpark: true, quiet: true, stop: 0, noCrit: true, dot: true });
      if (e.dead) return;
    }
  }
  for (const [name, h] of e.statusFx) {
    if (!(e.status[name] > 0) || !h.alive) {
      h.stop();
      e.statusFx.delete(name);
      if (LOOK[name]?.[2]) e.statusHidesBody = [...e.statusFx.keys()].some((k) => LOOK[k]?.[2]);
    }
  }
}

export { RAMPS };
