# Sky Ring Runner — Archipelago Air Rally

[![Bounty](https://img.shields.io/badge/bounty-%24500-brightgreen)](https://make.fun/c/best-flight-game-20261126-0057)
[![Competition](https://img.shields.io/badge/make.fun-best--flight--game--20261126--0057-blue)](https://make.fun/c/best-flight-game-20261126-0057)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A complete HTML5 flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/c/best-flight-game-20261126-0057) — $500, closes 28 Nov 2026 07:57 WIB.

Fly a red prop plane through sky rings over the fictional Coral Bay
archipelago. Five sorties with different goals: ring runs, supply crates,
storm clouds, a race against the sunset clock, and a grand tour at dusk.
Fuel, hull and the clock turn every sortie into decisions.

## Play

```sh
node serve.ts   # then open http://localhost:8080
```

- **Steer:** Arrow keys / WASD, or the mouse · **Throttle:** Shift / Ctrl
- **Boost:** Space (burns fuel) · **Pause:** P · **Restart:** R · **Mute:** M
- **Pick a sortie:** 1–5 on the title screen · **Start:** Enter or click

Fly through the gold rings (dead centre = PERFECT +50), grab green refuel
rings (+25 fuel) and wooden supply crates (+50), dodge dark storm clouds
(3 hits = down), and stay above 150 ft. Finish all rings to complete the
sortie and earn up to 3 stars.

## What is in here

- `game/` — the playable game as static files (no build step, no network
  requests, no libraries): `index.html` + `src/` modules.
  - `config.js` — tuning, mission definitions, sky palettes
  - `world.js` — the simulation (flight, rings, fuel, damage, scoring)
  - `terrain.js` — procedural archipelago (islands, runway, ridges, clouds)
  - `render.js` — chase-view canvas renderer, HUD, all screens
  - `input.js` — keyboard + mouse · `audio.js` — synthesised WebAudio SFX
  - `shots.js` — deterministic screenshot staging (`?shot=start|play|storm|end`)
  - `main.js` — boot + fixed-step game loop
- `screenshots/` — 4 real renders of the game's own code (cover first)
- `main.ts` — the entrypoint: copies `game/` + `screenshots/` to `/output`
  and writes `dossier.json` with the kit's vendored `vendor/makefun-game.ts`
- `PLAN.md` — concept, ATM notes, features, and test results

## Screenshots

1. `1-start.jpg` — title screen over a live sky
2. `2-play.jpg` — mid-sortie: HUD lit, ring ahead, streak ×9
3. `3-storm.jpg` — the Storm Front sortie
4. `4-end.jpg` — sortie complete, 3 stars

## License

MIT — see [LICENSE](LICENSE). All art and sound are original, drawn and
synthesised in code for this entry; no third-party assets.
