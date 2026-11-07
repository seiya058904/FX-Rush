# FX Rush — project notes for Claude

Browser pixel auto-battler on the vendored PixelFX library. Status and the current / next iteration plan live in
[docs/ROADMAP.md](docs/ROADMAP.md) — read it first and update it when an iteration ends.

## Commands

- `npm ci` — install (Node 20.19+ / 22.12+; `node_modules/` is not committed).
- `npm run dev` — game at http://localhost:5173, FX Lab at `/fxlab.html`.
- `npm test` — skill regression tests on the real game modules (also runs in CI).
- `npm run build && npm run test:browser` — fast interaction, touch, settings and production loading regressions.
  Uses installed Chrome locally; CI installs Playwright Chromium. No screenshots or reports are written into the repo.
- `npm run smoke` — headless self-test of all PixelFX effects (must stay 244 pass).
- `npm run audit` — regenerates `docs/COVERAGE.md`; wired-in-code count must stay 242/244 (see the exclusions below).
- `npm run e2e` — needs a running dev server and local Chrome; writes `docs/screenshots/`. Sessions can be picked
  with arguments (see the header of `tools/e2e.mjs`); `--out DIR` redirects screenshots and the runtime report.
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
- Keep every upstream effect in use, except the two the owner excluded as too big and distracting:
  `ui/crit-number` and `explosions/cartoon-pow` (FX Lab only; do not bring them back into play). When removing an
  effect from one role, make sure it still has another, and keep its role text in `src/fx/usage.js` accurate.
- Controls: two modes (`settings.mode`, Tab / title strip / pause menu). **auto** (default): the hero does
  everything, the player only picks level-up cards; clicks do nothing. **manual**: A/D move, Space jump, click =
  attack toward the clicked side; no auto walk, target or attack. Skills, ultimates and combo variety are automatic
  in both. Do not add attack hotkeys.
- Variety: hero blows come from shuffle bags (`src/game/hero.js` `COMBO`, all 12 melee acts); ultimates from a
  shuffle bag over all 12 moves; skills fire longest-waiting first. Don't reintroduce plain random picks.
- Readability over spectacle: damage numbers are small and merged; world effect light is scaled by `FX_LIGHT` in
  `src/fx/director.js`; big bursts stay out of the fight (the ultimates are
  the one place for a show: slow motion, dimmed scene, letterbox, name plate); nothing bright should
  sit on top of the fighters for long.
- Sound: recorded samples come from Freesound; the rest, and the music, stay synthesized in `src/engine/audio.js`,
  which also keeps every synth voice as the fallback for a sample that has not loaded. The owner chooses by ear in
  `tools/audition.html` (dev server): one pick means only that one works, several mean all of them work, none means
  keep the synth. A browser tab's unsaved view can be stale, so read the owner's choices from the owner's own tab.
  Change sounds through `tools/sfx-picks.json` and `npm run sfx -- build` (needs ffmpeg and `FREESOUND_API_KEY` in the
  git-ignored `.env.local`); never edit `src/engine/sfx-manifest.js` or `public/audio/CREDITS.md` by hand. Only CC0 and
  CC BY sounds; every file must stay credited. `public/audio` stays under 1.5 MB.
- README is in English.
