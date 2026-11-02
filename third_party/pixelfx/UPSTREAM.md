# PixelFX (vendored)

| | |
|---|---|
| Upstream | https://github.com/patch-gg/pixelfx |
| Pinned commit | `a84159688af3ca37a4be05a0d422b94451b2e24e` (2026-10-31, "pixelfx 0.3.0: give the effects a body that performs them") |
| Version | 0.3.0 |
| License | MIT (see `LICENSE`), attributions in `NOTICE.md` (Hugo Duprez / Sprite Fusion, Hollow Crown) |
| Effects | 244 effect files in 21 categories (`src/fx/<category>/<name>.js`) + 20 `_lib.js` helpers |

## What is copied

| Path | Why |
|---|---|
| `src/core/` | The runtime: `createFrame`, `createFx`, `createAct`, `composite`, painter, particles, rig, fonts. |
| `src/fx/` | All 244 effects, the 20 shared `_lib.js` helpers, the generated `index.js` and `categories.js`. |
| `tools/` | Upstream tools (`list`, `render`, `check`, `act`, `sheets`, ...) used for visual checks and exports. |
| `skills/pixelfx/SKILL.md` | The upstream Claude Code skill, read in-project. |
| `docs/AUTHORING.md`, `docs/CATALOG.md` | The effect contract and the generated catalog. |
| `LICENSE`, `NOTICE.md`, `README.md`, `package.json` | Attribution, upstream docs; `package.json` keeps `"type": "module"` so the tools run. |

## What is deliberately NOT copied

| Path | Why |
|---|---|
| `gallery/fonts/PatchPixel-Regular.woff2` (and the gallery) | The Patch Pixel font is **not** MIT ("© 2026 Patch. All rights reserved."). It must not be redistributed. The gallery is not needed by the game. |
| `docs/readme/*.gif` | 12 MB of README demo animations; not needed. |
| `.github/`, `.claude-plugin/`, `package-lock.json` | Upstream CI / plugin marketplace metadata / gallery build lockfile. |

## Modifications

None. Every vendored file is byte-identical to the pinned commit. FX Rush adapts effects only from the
outside (`src/fx/` in the game: options, palettes, placement, timing, budgets), so the vendored tree can be
re-synced by copying the same paths from a newer commit and re-running `npm run registry && npm run audit`.

## Tool outputs

`records/` and `sheets/` (contact sheets, GIFs, sprite sheets written by `tools/*.mjs`) are git-ignored.
