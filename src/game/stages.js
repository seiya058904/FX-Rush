// The three scenes. Each one ramps a crowd up over ~100 s (density and mix change with time), drops elites on
// cue, stages one or two scripted set pieces, then brings its boss. Decor and weather are PixelFX loops placed
// in the world; random events pull other effects in (a storm, a geyser, a supply drop) so runs differ.

import { RAMPS, PAL } from "../fx/palettes.js";

export const STAGES = [
  {
    id: "ember",
    name: "余烬熔炉",
    sub: "EMBER FORGE",
    music: "ember",
    theme: "ember",
    length: 80,
    boss: "colossus",
    // [time, alive target]
    density: [[0, 8], [20, 11], [45, 13], [70, 15], [96, 16]],
    // weighted mix over time: [from time, { type: weight }]
    mix: [
      [0, { slime: 6, bat: 3 }],
      [14, { slime: 5, bat: 3, skull: 1, knight: 1 }],
      [40, { slime: 4, bat: 3, skull: 2, knight: 2, toad: 2, ghoul: 2 }],
      [65, { slime: 3, bat: 2, skull: 2, knight: 3, toad: 2, serpent: 2, ghoul: 2 }],
    ],
    elites: [[32, "brute"], [66, "brute"]],
    events: [[22, "barrels"], [40, "cannons"], [52, "meteorShower"], [72, "barrels"]],
    decor: [
      { id: "fire/brazier", every: 320, off: 40, y: 0, layer: "back", light: 0.8, prio: 3 },
      { id: "fire/torch", every: 220, off: 150, y: -64, layer: "back", light: 0.7, prio: 3 },
      { id: "fire/campfire", every: 640, off: 420, y: 0, layer: "back", light: 0.6, prio: 3 },
      { id: "fire/candle", every: 540, off: 250, y: -6, layer: "back", light: 0.6, prio: 3, cull: true },
    ],
    // ash drifting down from the forge's chimneys (PixelFX's falling leaves, recolored)
    weather: [{ id: "weather/falling-leaves", opts: { palette: ["#0a0606", "#1e1414", "#3a2a28", "#5a4644", "#8a7068", "#b8a090", "#e0d0c0"], reds: ["#3a0a06", "#8a2a10", "#ff7a2a"], golds: ["#4a2a0a", "#c8781a", "#ffd060"] }, layer: "back", light: 0.5, quality: 2 }],
    transitionIn: "transitions/slash-wipe",
  },
  {
    id: "frost",
    name: "冰封遗迹",
    sub: "FROZEN RUINS",
    music: "frost",
    theme: "frost",
    length: 88,
    boss: "glacier",
    density: [[0, 9], [25, 12], [55, 15], [85, 18], [104, 18]],
    mix: [
      [0, { fslime: 4, ghost: 3, crow: 2 }],
      [12, { fslime: 3, ghost: 3, crow: 3, lancer: 2, wisp: 1 }],
      [30, { fslime: 3, ghost: 3, crow: 2, lancer: 2, wisp: 2, archer: 2 }],
      [50, { fslime: 3, ghost: 3, crow: 2, lancer: 3, wisp: 2, fish: 1, archer: 2, witch: 2 }],
      [76, { fslime: 2, ghost: 3, crow: 3, lancer: 3, wisp: 3, fish: 2, archer: 2, witch: 2 }],
    ],
    elites: [[36, "warden"], [72, "warden"]],
    events: [[20, "geyser"], [42, "fountain"], [54, "icicles"], [64, "tornado"], [80, "geyser"]],
    decor: [
      { id: "ice/ice-crystal", every: 170, y: -6, layer: "back", light: 0.6, prio: 3 },
      { id: "fire/spirit-flame", every: 230, off: 90, y: -46, layer: "back", light: 0.8, prio: 3 },
      { id: "water/drip", every: 140, off: 40, y: -10, layer: "back", light: 0.5, prio: 3, opts: { height: 58 } },
      { id: "water/waterfall", every: 520, off: 300, y: 0, layer: "back", light: 0.5, prio: 3, opts: { palette: ["#06101e", "#0e2a48", "#1a4e7a", "#3488b8", "#6cc4ec", "#b8ecff", "#f0fbff", "#ffffff"] } },
      { id: "water/bubbles", every: 460, off: 120, y: 0, layer: "back", light: 0.5, prio: 3, opts: { palette: ["#06101e", "#0e2a48", "#1a4e7a", "#3488b8", "#6cc4ec", "#b8ecff", "#f0fbff"] } },
      { id: "water/ripples", every: 330, off: 210, y: 6, layer: "ground", light: 0.4, prio: 3 },
    ],
    weather: [
      { id: "weather/snow", opts: {}, layer: "back", light: 0.6 },
      { id: "weather/fog", opts: { palette: ["#0a1020", "#142038", "#1e3050", "#30486e", "#4a6890", "#7a98c0", "#b8d0f0"] }, layer: "front", light: 0.4, quality: 2 },
    ],
    transitionIn: "transitions/shatter-wipe",
  },
  {
    id: "void",
    name: "霓虹虚空",
    sub: "NEON VOID",
    music: "void",
    theme: "void",
    length: 96,
    boss: "oculus",
    density: [[0, 10], [25, 13], [55, 16], [85, 19], [112, 20]],
    mix: [
      [0, { vslime: 4, moth: 3, eye: 2 }],
      [12, { vslime: 3, moth: 3, eye: 2, reaper: 2, jelly: 1 }],
      [40, { vslime: 3, moth: 3, eye: 3, reaper: 3, jelly: 2, gunner: 2 }],
      [72, { vslime: 2, moth: 3, eye: 3, reaper: 3, jelly: 2, gunner: 3 }],
    ],
    elites: [[34, "trooper"], [76, "trooper"]],
    events: [[20, "lasers"], [44, "rain"], [60, "tesla"], [86, "lasers"]],
    decor: [
      { id: "scifi/energy-core", every: 240, off: 40, y: -60, layer: "back", light: 0.7, prio: 3 },
      { id: "lightning/plasma-ball", every: 300, off: 170, y: 0, layer: "back", light: 0.7, prio: 3 },
      { id: "scifi/hologram", every: 360, off: 100, y: 0, layer: "back", light: 0.6, prio: 3 },
      { id: "lightning/spark-arc", every: 420, off: 260, y: 0, layer: "back", light: 0.6, prio: 3, opts: { palette: RAMPS.neon, sparks: PAL.neon.slice(4) } },
      { id: "arcane/rune-circle", every: 380, off: 330, y: 2, layer: "ground", light: 0.5, prio: 3, opts: { palette: RAMPS.neon } },
      { id: "shadow/shadow-flames", every: 280, off: 210, y: 0, layer: "back", light: 0.6, prio: 3 },
      { id: "scifi/teleporter-pad", every: 500, off: 80, y: 0, layer: "ground", light: 0.5, prio: 3, opts: { palette: RAMPS.neon } },
    ],
    weather: [
      { id: "weather/shooting-stars", opts: { palette: ["#0a0414", "#2a0a3a", "#6a1a7a", "#c03aa0", "#ff7ad0", "#ffd0f0", "#ffffff"], sky: ["#05020a", "#0a0414", "#120624"] }, layer: "back", light: 0.6, quality: 1 },
    ],
    transitionIn: "transitions/glitch-wipe",
  },
];

/** Linear lookup on [[t, v], ...]. */
export function along(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [t0, v0] = table[i], [t1, v1] = table[i + 1];
    if (t < t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return table[table.length - 1][1];
}
export function mixAt(stage, t) {
  let m = stage.mix[0][1];
  for (const [t0, mm] of stage.mix) if (t >= t0) m = mm;
  return m;
}
