// One color language for the whole game. The world is deep indigo, coal and cold grey; energy is gem-bright.
// Rules: the hero's own strikes burn white-gold into crimson; each skill keeps its element's ramp; anything
// hostile (enemy bolts, boss telegraphs) leans hot pink / blood red so it reads as danger in every scene.
// Ramps run dark to bright, the way PixelFX's `palette` option wants them.

import { PAL } from "pixelfx";

export { PAL };

export const RAMPS = {
  // the hero's sword: white-hot edge, gold body, crimson tail
  hero: ["#1a0610", "#4a0e1e", "#8e1a2a", "#d4362e", "#ff7a3a", "#ffc65a", "#fff2b0", "#ffffff"],
  heroAlt: ["#10061a", "#2a0e3a", "#5a1a6a", "#a8306e", "#ff5a7a", "#ffb08a", "#fff0d0", "#ffffff"],
  crit: ["#1a0a04", "#5a1e08", "#b8420c", "#ff7a1a", "#ffc23a", "#fff27a", "#ffffff", "#ffffff"],
  fire: PAL.fire,
  ember: PAL.ember,
  lava: PAL.lava,
  ice: PAL.ice,
  frost: ["#0a1430", "#14305c", "#1f5a94", "#3a8cc8", "#6cc4ec", "#b4ecff", "#e8faff", "#ffffff"],
  volt: PAL.volt,
  electric: PAL.electric,
  arcane: PAL.arcane,
  holy: PAL.holy,
  heal: PAL.heal,
  shadow: PAL.shadow,
  void: ["#07020e", "#160626", "#2c0a4a", "#4c1478", "#7a24b0", "#b04ae0", "#e09cff", "#ffffff"],
  neon: PAL.neon,
  cyber: PAL.cyber,
  poison: PAL.poison,
  earth: PAL.earth,
  stone: PAL.stone,
  gold: PAL.gold,
  blood: PAL.blood,
  // hostile
  danger: ["#14020a", "#3a0618", "#6e0a2a", "#b8143e", "#ff2d5a", "#ff7a9a", "#ffd0dc", "#ffffff"],
  dangerHot: ["#1a0404", "#4a0808", "#8a120c", "#d02a10", "#ff5a1a", "#ffa04a", "#ffe0a0", "#ffffff"],
  dangerCold: ["#060a1e", "#101e4a", "#1c3a80", "#3a62c0", "#7a9cff", "#c0d0ff", "#f0f4ff", "#ffffff"],
  dangerVoid: ["#0c0214", "#2a0638", "#58106a", "#9a1a9e", "#ff2dd0", "#ff8af0", "#ffe0fa", "#ffffff"],
  xp: ["#04121a", "#0a2e3a", "#0e5a62", "#18948a", "#36d0a8", "#8affd0", "#e0fff0", "#ffffff"],
};

/** Per-scene accents: the same effect reads as belonging to the scene it's played in. */
export const THEME = {
  ember: { danger: RAMPS.dangerHot, accent: RAMPS.fire, ambient: RAMPS.ember, enemyBolt: RAMPS.dangerHot },
  frost: { danger: RAMPS.dangerCold, accent: RAMPS.frost, ambient: RAMPS.ice, enemyBolt: RAMPS.danger },
  void: { danger: RAMPS.dangerVoid, accent: RAMPS.void, ambient: RAMPS.neon, enemyBolt: RAMPS.dangerVoid },
};
