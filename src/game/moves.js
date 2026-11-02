// Attacks are PixelFX acts performed by game characters. An ActPlayer plays an effect's act track (poses with
// wind-up before t = 0, hits, recovery) at a chosen rate: it moves the character by the act's own footwork
// (root motion), starts the effect on the act's t = 0 at the act's origin, and calls onHit on the exact act
// time of every hit, which is where the game deals damage, freezes, shakes and plays the impact sound. The
// effect is updated at the same rate, so the slash, the damage and the sound are on one frame.

import { poseAt, STAND, fxModule } from "../engine/pfx.js";

/**
 * Hero and enemy attack definitions. box: [x0, y0, x1, y1] relative to the act origin, facing right.
 * from: where in the act to start (later than its first key = a shorter wind-up), cancel: act time after which
 * the next attack may interrupt the recovery. dmg: multiplier per hit. stop: hit-stop per hit (overrides the act's),
 * push: knockback px/s, lift: upward launch px/s, shake: screen shake px, weight: sound/feel weight 0..1.
 */
export const ATTACKS = {
  // the hero's auto chain
  slash: { fx: "melee/sword-slash", from: -0.3, cancel: 0.22, rate: 1.55, box: [-4, -50, 54, 4], dmg: 1, stop: 0.05, push: 120, shake: 1, weight: 0.4, palette: "hero", sfx: "swing" },
  cross: { fx: "melee/double-slash", from: -0.18, cancel: 0.3, rate: 1.55, box: [-2, -50, 58, 4], dmg: 0.75, stop: 0.04, push: 90, shake: 1, weight: 0.45, palette: "hero", sfx: "swing" },
  cleave: { fx: "melee/heavy-cleave", from: -0.3, cancel: 0.62, rate: 1.45, box: [-8, -56, 70, 6], dmg: 2.4, stop: 0.11, push: 240, lift: 60, shake: 3, weight: 1, palette: "crit", sfx: "swing", heavy: true },
  // clicks
  thrust: { fx: "melee/thrust", from: -0.12, cancel: 0.16, rate: 1.9, box: [-6, -40, 70, 2], dmg: 1.35, stop: 0.06, push: 170, shake: 1.5, weight: 0.6, palette: "heroAlt", sfx: "swing" },
  spin: { fx: "melee/spin-slash", from: -0.14, cancel: 0.3, rate: 1.7, box: [-56, -50, 56, 4], dmg: 1.2, stop: 0.07, push: 160, shake: 2, weight: 0.7, palette: "heroAlt", sfx: "swing", both: true },
  // enemy attacks (played in the enemy's colors)
  eSlash: { fx: "melee/sword-slash", from: -0.55, cancel: 0.86, rate: 0.9, box: [0, -46, 46, 4], dmg: 1, stop: 0.06, push: 140, shake: 1.5, weight: 0.5, sfx: "swing" },
  eClaw: { fx: "melee/claw-swipe", from: -0.46, cancel: 0.5, rate: 0.95, box: [0, -44, 40, 4], dmg: 1, stop: 0.05, push: 120, shake: 1.5, weight: 0.5, sfx: "swing" },
  eHammer: { fx: "melee/hammer-smash", from: -0.72, cancel: 1.2, rate: 0.85, box: [0, -50, 70, 6], dmg: 1.6, stop: 0.1, push: 260, shake: 3, weight: 1, sfx: "heavy" },
  eUpper: { fx: "melee/uppercut", from: -0.42, cancel: 0.7, rate: 0.95, box: [0, -50, 40, 4], dmg: 1.2, stop: 0.07, push: 120, lift: 200, shake: 2, weight: 0.7, sfx: "swing" },
  eThrust: { fx: "melee/thrust", from: -0.46, cancel: 0.6, rate: 0.9, box: [0, -40, 72, 2], dmg: 1.1, stop: 0.06, push: 180, shake: 1.5, weight: 0.6, sfx: "swing" },
  eSweep: { fx: "melee/spear-sweep", from: -0.56, cancel: 0.8, rate: 0.9, box: [-20, -24, 76, 4], dmg: 1.1, stop: 0.07, push: 150, shake: 2, weight: 0.6, sfx: "swing" },
  eScythe: { fx: "melee/scythe-reap", from: -0.56, cancel: 0.9, rate: 0.85, box: [-10, -56, 70, 4], dmg: 1.4, stop: 0.08, push: 200, shake: 2.5, weight: 0.8, sfx: "whoosh" },
  eFlurry: { fx: "melee/dagger-flurry", from: -0.4, cancel: 0.6, rate: 0.9, box: [0, -44, 44, 4], dmg: 0.35, stop: 0.02, push: 50, shake: 0.8, weight: 0.3, sfx: "swing" },
  eWhip: { fx: "melee/whip-crack", from: -0.46, cancel: 0.7, rate: 0.9, box: [10, -34, 84, 0], dmg: 1.1, stop: 0.06, push: 140, shake: 1.5, weight: 0.6, sfx: "whoosh" },
};

export class ActPlayer {
  /**
   * mod: the effect module (must be loaded). opts: { rate, from, to, x (character's feet now), facing, onHit(hit, i),
   * onStart(), fx: options for the effect, director (to start it), layer, prio }.
   */
  constructor(mod, opts) {
    const a = mod.act ?? {}, meta = mod.meta;
    this.mod = mod;
    this.track = a.poses ?? [[0, STAND]];
    this.hits = (a.hits ?? []).slice().sort((p, q) => p.t - q.t);
    this.dust = a.dust ?? [];
    this.rate = opts.rate ?? 1;
    const first = this.track[0][0], last = this.track[this.track.length - 1][0];
    this.t = Math.max(first, opts.from ?? first);
    this.to = opts.to ?? (meta.loop ? meta.duration : Math.max(last, meta.duration * 0.5));
    this.facing = opts.facing ?? 1;
    // the act's origin, chosen so the character doesn't jump when the act starts mid-way through its footwork
    const p0 = poseAt(this.track, this.t);
    this.ox = (opts.x ?? 0) - (p0.x ?? 0) * this.facing;
    this.oy = opts.y ?? 0;
    this.nh = 0;
    while (this.nh < this.hits.length && this.hits[this.nh].t < this.t) this.nh++;
    this.opts = opts;
    this.handle = null;
    this.started = false;
    this.done = false;
  }
  get pose() {
    return poseAt(this.track, this.t);
  }
  /** Where the character's feet should be now (root motion). */
  get rootX() {
    return this.ox + (this.pose.x ?? 0) * this.facing;
  }
  get rootY() {
    return this.oy + (this.pose.y ?? 0);
  }
  update(dt) {
    if (this.done) return;
    const t0 = this.t;
    this.t += dt * this.rate;
    if (!this.started && this.t >= 0) {
      this.started = true;
      const d = this.opts.director, fxo = this.opts.fx ?? {};
      if (d && this.opts.effect !== false && this.opts.id)
        this.handle = d.play(this.opts.id, {
          x: this.ox, y: this.oy, flip: this.facing < 0, speed: this.rate, layer: this.opts.layer ?? "split", prio: this.opts.prio ?? 0, ...fxo,
        });
      // the effect should already be this far in if the act started past 0
      if (this.handle && this.t > 0) this.handle.inst.update(this.t);
      this.opts.onStart?.(this);
    }
    for (; this.nh < this.hits.length && this.hits[this.nh].t <= this.t; this.nh++) this.opts.onHit?.(this.hits[this.nh], this.nh, this);
    if (this.t >= this.to) this.done = true;
    void t0;
  }
  /** Cut it short (the effect keeps playing out; only the body moves on). */
  end() {
    this.done = true;
  }
}

/** Is the effect needed by this attack loaded? */
export const attackReady = (name) => !!fxModule(ATTACKS[name].fx);
