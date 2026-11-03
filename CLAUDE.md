# FX Rush — project notes for Claude

Browser pixel auto-battler on the vendored PixelFX library. Status and the current / next iteration plan live in
[docs/ROADMAP.md](docs/ROADMAP.md) — read it first and update it when an iteration ends.

## Commands

- `npm ci` — install (Node 20.19+ / 22.12+; `node_modules/` is not committed).
- `npm run dev` — game at http://localhost:5173, FX Lab at `/fxlab.html`.
- `npm run smoke` — headless self-test of all PixelFX effects (must stay 244 pass).
- `npm run audit` — regenerates `docs/COVERAGE.md`; wired-in-code count must stay 244/244.
- `npm run e2e` — needs a running dev server and local Chrome; writes `docs/screenshots/`. Sessions can be picked
  with arguments (see the header of `tools/e2e.mjs`).
- `npm run build` — static site in `dist/`.

## Rules

- PixelFX under `third_party/pixelfx/` is vendored unmodified; do not edit it. Adapt in `src/engine/pfx.js` / `src/fx/`.
- Keep every upstream effect in use (244/244). When removing an effect from one role, make sure it still has another,
  and keep its role text in `src/fx/usage.js` accurate.
- Controls: clicking / tapping is the only attack input (it adds tempo; the AI chooses the attack). Movement (A/D,
  arrows) and jump (Space/W/Up, swipe up) must stay. Do not add attack hotkeys.
- Readability over spectacle: damage numbers are small and merged; big full-screen-ish effects (crit starburst, nuke,
  transitions) are for rare moments only; nothing bright should sit on top of the fighters for long.
- README is in English.
