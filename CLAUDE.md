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

## Browsers

- Hands-on checks (feel, visuals, brightness, layout — anything judged by looking at the game): use the
  **ego-browser** skill (Ego, the owner's everyday Chromium browser) on the running dev server, and take screenshots
  there.
- Batch regression (`npm run e2e`, `tools/shot.mjs`, `tools/profile.mjs`): keep Playwright with the installed Chrome
  (`channel: "chrome"`), so runs stay repeatable and match CI.
- Ego is not needed to *play*; the game runs in any modern browser.

## Rules

- PixelFX under `third_party/pixelfx/` is vendored unmodified; do not edit it. Adapt in `src/engine/pfx.js` / `src/fx/`.
- Keep every upstream effect in use (244/244). When removing an effect from one role, make sure it still has another,
  and keep its role text in `src/fx/usage.js` accurate.
- Controls: two modes (`settings.mode`, Tab / title strip / pause menu). **auto** (default): the hero does
  everything, the player only picks level-up cards; clicks do nothing. **manual**: A/D move, Space jump, click =
  attack toward the clicked side; no auto walk, target or attack. Skills, ultimates and combo variety are automatic
  in both. Do not add attack hotkeys.
- Variety: hero blows come from shuffle bags (`src/game/hero.js` `COMBO`, all 12 melee acts); ultimates from a
  shuffle bag over all 12 moves; skills fire longest-waiting first. Don't reintroduce plain random picks.
- Readability over spectacle: damage numbers are small and merged; world effect light is scaled by `FX_LIGHT` in
  `src/fx/director.js`; the crit starburst only presents the best hit on the results screen; nothing bright should
  sit on top of the fighters for long.
- README is in English.
