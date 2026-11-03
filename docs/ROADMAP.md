# FX Rush roadmap

Living status and iteration plan. Update it at the end of each iteration so work can resume on any machine.

## Status (2026-11-03, after iteration 5; the live site still has iteration 4)

- Playable run: 3 scenes, 3 bosses, 12 auto-cast skills, ~7 minutes. Deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Sound: 24 sounds use Freesound samples, the rest and the music are synthesized (see iteration 5).
- PixelFX (vendored at `third_party/pixelfx/`, see `UPSTREAM.md`): **244 / 244** effects load and pass the headless self-test; 242 are wired into play (2 excluded by choice, see iteration 4) (`docs/COVERAGE.md`, `npm run audit`). All 12 `moves/*` ultimates, the `melee/*` acts and the skeleton rig are in use.
- Already automatic: targeting and walking, the melee chain, every skill, ultimates (fire when RUSH is full), level-up picks (after 6 s).

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
- [ ] push and deploy to GitHub Pages, on the owner's word

## Resuming on another machine

Copy the folder as-is (or clone). Needs Node 20.19+ and, for `npm run e2e` / `tools/shot.mjs`, an installed Google
Chrome. If `npm run dev` fails after a copy (different CPU architecture), run `npm ci`. Claude's private memory and
chat history are not in the folder: this file and `CLAUDE.md` are the hand-off.

## Next iterations (proposed, in priority order)

1. Real combos: more upstream melee acts (uppercut launch -> air follow-up, dash pierce) chained by the AI.
2. Meta progression: coins unlock starting skills / talents between runs.
3. Mobile: automatic quality tier on first frames; readability options (colour-blind palette, numbers on/off).
