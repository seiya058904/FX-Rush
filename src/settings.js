// Player options, kept per browser. mode: "auto" (the hero fights by himself; the default) or "manual" (A/D, jump,
// click to attack). Screen shake can be reduced or turned off, flashes can be disabled, and the level-up choice can
// be left to the game (it picks after a short countdown) for fully idle play.

const DEFAULTS = { mode: "auto", shake: 1, flashes: true, autoPick: true, quality: "auto", showFps: false };
export const settings = { ...DEFAULTS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("fxrush.settings") ?? "{}"));
} catch {}
export function saveSettings() {
  try {
    localStorage.setItem("fxrush.settings", JSON.stringify(settings));
  } catch {}
}
