# FX Rush roadmap

Living status and iteration plan. Update it at the end of each iteration so work can resume on any machine.

## Current status (2026-11-11, iteration 8 local changes)

- Playable run: 3 scenes, 3 bosses, 12 auto-cast skills, ~7 minutes. Deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Sound: 24 sounds use Freesound samples, the rest and the music are synthesized (see iteration 5).
- PixelFX (vendored at `third_party/pixelfx/`, see `UPSTREAM.md`): **244 / 244** effects load, draw within bounds and finish/stop; 242 are wired into play (2 excluded by choice, see iteration 4) (`docs/COVERAGE.md`, `npm run audit`). All 12 `moves/*` ultimates, the `melee/*` acts and the skeleton rig are in use. Latest frame-cost warnings are recorded under iteration 8.
- Already automatic: targeting and walking, the melee chain, every skill, ultimates (fire when RUSH is full), level-up picks (after 6 s).
- Iteration 6: input boundaries, immediate settings, essential-resource readiness/reload, and touch menus/portrait choices.
  Published to GitHub Pages on 2026-11-07; deployment record linked below.
- Iteration 7: readable run builds, touch results, dialog focus, DoT/shatter correctness and hostile projectile fallbacks.
  Published on 2026-11-11. CI, Pages deployment and live asset verification passed; closeout recorded below.
- Iteration 8: fractional XP bonuses, consistent chest rewards and descriptions, and temporary buffs that preserve
  permanent upgrades. Implemented locally; not committed, pushed or deployed.

## Iteration 2 — one-button attack, calmer screen (done, deployed)

Player feedback: the extra attack keys (J/K/X/Z) were confusing; the screen was too bright mainly because of damage
numbers and what sits behind them (crit starbursts, white death smoke) stacking over the fighters.

**A. One attack input.** Clicking / tapping anywhere is the only attack input; the J/K/X/Z attack keys are removed.
Movement (A/D, arrows) and jump (Space/W/Up, swipe up) stay. A click no longer starts a separate move: it adds
*tempo* (faster cadence, earlier recovery cancel, faster RUSH gain). The hero picks attacks from the situation:
enemies on both sides -> spin; target a step away in front -> thrust lunge; elites / bosses / crowds -> chain ends in
cleave; otherwise slash -> cross -> cleave.

**B. Calmer screen.** Normal hits use small pixel numbers only, merged per enemy over a short window, at most 6 on
screen. The big `ui/crit-number` starburst is reserved for rare moments (boss crits). Death smoke is grey, shorter
and dimmer. POW!/BAM! is rarer. Impact light and scene light are lowered. 244/244 coverage is kept.

**C. Tests and docs.** e2e: rapid clicks raise tempo; movement and jump still tested; full idle run still clears.
README controls, screenshots and `src/fx/usage.js` roles updated.

### Progress (tick as done; resume from the first open box)

- [x] 0. `CLAUDE.md` + this roadmap
- [x] A. attack hotkeys removed; tempo clicks; situational attack choice (`src/game/hero.js` `startAuto`)
- [x] B. damage numbers / death smoke / POW / light toned down
- [x] C. e2e updated (manual key test isolated from level-ups/RUSH/knockback); README controls; usage roles
- [x] full `npm run e2e` pass (10/10) + screenshots refreshed
- [x] smoke + audit 244/244, build, diff review, local commit
- [x] pushed with iteration 4

## Iteration 3 — auto / manual modes, full move rotation, calmer light (done, deployed)

Playtest feedback on iteration 2: default should be fully hands-off (watch and pick cards; clicks do nothing); a
switchable manual mode (A/D, jump, click = attack toward the clicked side; no auto walk/target/attack). Skills,
ultimates and combos stay automatic in both. The crit starburst is still too loud; the whole screen should be calmer.
Use every upstream move and avoid repeats.

- [x] A. `settings.mode` auto/manual; title + pause toggle; tempo removed; manual hero control
- [x] B. 7 more hero melee acts (weapon conjuring); shuffle-bag combo opener -> link -> finisher; all 12 ultimates
      in a shuffle bag; skills fire longest-waiting first
- [x] C. crit starburst only on the results screen; global effect light x0.7; scene light 0.7; flash cap 0.3; POW only
      for the 100 combo
- [x] D. e2e 10/10 (manual mode, move variety; per-session time limit), docs, smoke/audit 244/244, build, local commit
- [x] owner playtest in Ego; pushed with iteration 4

## Iteration 4 — no big bursts, trimmed effects, ultimate shows (done, deployed)

Owner feedback: the crit starburst must not appear at all; trim effects that are too bright / big / dominant; every
ultimate should be a show (slow motion, a clear presentation); otherwise keep the screen normal, not flashy.

- [x] `ui/crit-number` and `explosions/cartoon-pow` removed from play (FX Lab only) — coverage now 242/244 by choice
- [x] crit star only on elites/bosses; smaller ground crack on heavy blows; smaller inferno blasts; shorter effect tails
- [x] ultimate cinematic: slow motion, darkened scene, letterbox, coloured name plate (`drawCinema`), last-hit payoff
- [x] e2e 10/10, audit (wired 242/244), build, local commit
- [x] owner playtest; pushed and deployed to GitHub Pages (2026-11-03 closeout)

## Iteration 5 — sound upgrade with Freesound samples

Owner request: replace only the sounds that clearly sound bad; music stays. Sounds are picked by the owner's ear, since
the tools can only measure level, attack and spectrum.

- [x] pipeline: `tools/sfx.mjs` (search, measure, render, credits), `tools/sfx-recipes.mjs`, `tools/sfx-picks.json`
- [x] runtime: samples with shuffle-bag variants and synth fallback in `src/engine/audio.js`; onset alignment
- [x] audition page `tools/audition.html`; levels from `tools/sfx-measure.mjs` (`tools/sfx-levels.json`)
- [x] owner rounds 1 and 2: 24 sounds replaced (30 files), including xp and card; crit, heavy, whoosh, missile, spawn,
      rush, chest, magic and the other chiptune cues keep the synth
- [x] heavy impact no longer plays on the hammer's wind-up (`hitSfx`, plain `swing` at the start)
- [x] credits, LICENSE, README
- [x] e2e 10/10 on the final sounds; one earlier run had a 600 s hang in build-s3-16 and a level measurement had one
      page crash, neither reproduced nor explained (e2e now fails a session at once if its page crashes)
- [x] owner playtest of a whole run: sounds approved (2026-11-03); local commit
- [x] push and Pages deployment complete (confirmed by the 2026-11-07 Pages run for `6734d46`)

## Iteration 6 — reliable controls, loading recovery and touch usability

- [x] Screen changes discard queued presses and clicks without dropping held movement or combat's attack buffer.
      Stationary pointers no longer overwrite keyboard card/result selection; focus loss releases inputs.
- [x] Pause works during card selection. Auto-pick settings apply immediately; re-enabling grants six new seconds.
- [x] Disabling flashes suppresses new and already-running black/white impact frames as well as ordinary screen flashes.
      The default presentation still uses the effect; the two excluded effects remain excluded.
- [x] Readiness checks the required melee/critter IDs. Optional first-screen effects load concurrently; essential failure
      or a long wait shows a reload action. Other loaded modules cannot substitute for a missing core module.
- [x] Touch pause/menu controls use screen pixels, with settings on a separate page. Portrait choices sit below the
      320×180 fight and scroll on short screens. Touch hints match the current mode; the attack cue is manual-only.
- [x] E2E requires a three-stage idle victory and fails build sessions that time out; `--out DIR` supports external artifacts.
      Seven focused browser checks cover the new behavior; CI runs them against dev modules and the production build.
- [x] Verification: 12/12 unit tests; 7/7 browser checks, including a real touch drag on the short portrait layout;
      production idle victory, all six build sessions and rare branches passed. A touch-capable desktop routing issue
      found by the full suite was fixed; manual/outro/mobile then passed 3/3 with the final input routing.
      Independent smoke: **244 pass, 0 warn, 0 fail** (the earlier concurrent run had timing warnings only).
      Build and registry check passed; wired coverage stays **242/244**. Ego desktop/portrait/landscape review completed;
      physical phone validation remains separate from browser emulation. No dependencies or vendored effects changed.
- [x] Pushed and deployed: [successful Pages run for `6734d46`](https://github.com/seiya058904/FX-Rush/actions/runs/42343609636)
      (2026-11-07; historical publishing status reconciled during iteration 7 closeout).

## Iteration 7 — understand the build, readable results and combat reliability

- [x] Level-up choices show the six-skill capacity. Pause and results open the same readable build view with names,
      levels, acquired upgrade descriptions and stat-card counts. Results snapshot both kinds of cards.
- [x] Touch results use native controls and keep the celebration visible in portrait. Small portrait panels scroll;
      rotating preserves the result. Desktop retains the pixel results screen with a build entry.
- [x] Native dialogs contain Tab/Shift+Tab focus, keep the background canvas inert, and restore focus on return.
      Escape steps back from build/settings; fast repeated result-navigation keys are consumed before confirmation.
- [x] Damage forwards its DoT flag: burning ticks no longer consume freeze or trigger shatter; direct fire and direct
      critical hits still do. No damage coefficients changed.
- [x] Hostile projectiles draw a small high-contrast directional marker when their effect is absent or retired.
      Normal effects, collision rules, lifetimes and friendly projectiles are unchanged.
- [x] Verification: 15/15 unit tests, 10/10 focused browser checks, production build and UI detector pass.
      E2E passed the idle victory, six builds, rare branches, transition guards and mobile session. The manual session
      was interrupted by a registry-generated dev reload; its isolated rerun passed, including focus-loss pause.
      Independent effect self-test: **244 pass, 0 warn, 0 fail**; registry loads 244/244, wired coverage stays **242/244**.
      Ego desktop build/pause and portrait/landscape results reviewed, including a short portrait build panel;
      physical phone validation remains separate. No dependencies or vendored effects changed.
- [x] Release closeout (2026-11-11): game changes `a1c8cb8` and browser-test timing fix `3afc2b0` pushed to `main`.
      CI exposed keys sent before a native menu rendered; checks now wait for the controls and assert initial focus.
      Touch drag tests hold the finger still before lifting so inertia cannot consume the next tap. Chromium passed
      all 10 checks; the two affected checks also passed in installed Chrome. These changes only affect tests.
      [Final CI and Pages run](https://github.com/seiya058904/FX-Rush/actions/runs/43004628285) passed: 15/15 unit tests,
      10/10 browser checks, 244 effect passes with no warnings/failures, registry, audit and production build.
      The live entry and all six linked JS/CSS assets returned HTTP 200; all six asset SHA-256 hashes matched the local build.

## Iteration 8 — reliable growth and temporary buffs (local)

- [x] Greed applies once when XP is collected, carrying hundredths between pickups and levels. Twenty 1-XP drops
      now credit 20 / 23 / 26 / 29 XP with zero / one / two / three Greed cards, without adding visual pickups.
      The remainder survives scene changes and resets with a new run.
- [x] Elite chests keep their existing 20 base XP. Their reward value reaches the gem, Greed applies at collection,
      and the toast says `20 BASE XP`. Aegis level 4 describes its actual 7-to-6-second recharge and stronger counter.
- [x] Permanent speed stats stay separate from slows and star power. Effective movement/attack speed is composed
      at use, so either expiry order and Fury acquired mid-effect preserve the intended permanent upgrade.
      Repeated stars refresh one duration for speed, protection and the existing star/RUSH behavior; other sources
      of invulnerability retain their own duration. Card choices freeze the buff clocks; a new run clears them.
- [x] Verification: 24/24 unit tests (nine new regressions failed before the fix), 10/10 browser checks and production
      build passed. Production E2E passed idle victory, rare branches and manual controls (3/3): three stages,
      621 kills, level 19, all 12 melee acts and all 12 ultimates. This uses accelerated test play/auto-picks and is
      not a normal-duration or win-rate measurement; the six forced builds were not rerun for this focused change.
      Ego reviewed the chest toast, desktop Aegis choice and 390px portrait choice. Registry loads 244/244 and
      wired coverage stays 242/244. No dependencies or vendored effects changed.
- Effect self-test: **215 pass, 29 frame-cost warnings, 0 failures** across all 244 effects. An isolated three-effect
  rerun cleared the earth-stomp warning but retained nuke/storm timing warnings (9.587 / 8.787 ms per frame).
  CPU load sampled after that rerun was 76%; the smoke tool and its PixelFX inputs are unchanged. Drawing, bounds
  and lifecycle checks passed, but a warning-free timing result was not established in this run. No thresholds changed.
- Publishing remains separate: these changes have not been committed, pushed or deployed.

## Resuming on another machine

Copy the folder as-is (or clone). Needs Node 20.19+ and, for `npm run e2e` / `tools/shot.mjs`, an installed Google
Chrome. If `npm run dev` fails after a copy (different CPU architecture), run `npm ci`. Claude's private memory and
chat history are not in the folder: this file and `CLAUDE.md` are the hand-off.

## Next iterations (proposed, in priority order)

1. Real combos: more upstream melee acts (uppercut launch -> air follow-up, dash pierce) chained by the AI.
2. Meta progression: coins unlock starting skills / talents between runs.
3. Mobile: automatic quality tier on first frames; readability options (colour-blind palette, numbers on/off).
