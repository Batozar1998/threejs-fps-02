# Ember Yard — a three.js tactical FPS

[![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Batozar1998/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Batozar1998/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made famous —
built for the [make.fun bounty](https://make.fun/bounty/threejs-fps-02). Original map,
art, sounds and names; nothing copied from any commercial game.

## The game

**Ember Yard** is a dusk freight yard: two bomb sites (A, the north warehouse; B, the
south container stack), three lanes, and a low amber sun. You play for **Vanguard**
(blue), attacking with four bot teammates against five **Cinder** bots (red).

- **Rounds:** first to 7 (max 13). A round is won by eliminating the enemy squad, by
  detonating the planted spike, or — for the defenders — by running the 100-second clock
  out or defusing the spike.
- **The spike:** you carry it. Hold **E** inside a site to plant (3.5 s); once planted
  it detonates in 40 s unless a defender stands on it for 5 s to defuse. If you fall,
  a teammate picks it up and carries on.
- **Economy:** $800 to start, +$300 per elimination, +$300 for planting, +$3,250 for a
  round win, +$1,900 (plus a loss-streak bonus) for a loss. Spend it in the buy phase.
- **Arsenal:** P9 Sidearm, Jackal-9 SMG, Breacher-12 shotgun, Vandal-7 rifle,
  Longshot-50 sniper, Spark frag grenade, plated vest. Each gun has its own damage,
  range falloff, magazine, fire rate, recoil and spread.
- **Gunplay:** hitscan against head/body hitboxes (headshots deal double), recoil and
  spread that punish firing on the move, ADS with right-click, crouching, acceleration
  and collision with the map — stopping to aim pays.
- **Bots:** follow a computed waypoint graph through the lanes, hold site angles, react
  to what they see and hear, rotate on noise, guard a planted spike, and defuse.
- **HUD:** health and armour, ammunition, round timer, score, team rosters, killfeed,
  minimap (teammates always, enemies only while freshly seen), dynamic crosshair,
  hitmarkers, spike status.

## Play

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open the page in desktop Chrome, click **Click to play**, and fight. No build step,
no network request: `game/` is static ES modules plus vendored three.js 0.187.0.

Controls: **WASD** move · **Mouse** look · **Click** fire · **Right-click** aim ·
**R** reload · **Ctrl** crouch · **Shift** walk · **Space** jump · **1–5** weapons ·
**G** frag · **B** buy · **E** plant / pick up the spike.

## Layout

- `game/index.html` — the page and the whole HUD
- `game/src/main.js` — boot, fixed 60 Hz simulation, match flow, shooting, grenades
- `game/src/world.js` — the Ember Yard map, colliders, computed nav graph, sites
- `game/src/bots.js` — bot AI: roles, routes, vision, hearing, bursts, plant/defuse
- `game/src/weapons.js` — the armoury and the view models
- `game/src/player.js` — movement physics and collision
- `game/src/bomb.js` — the spike's state machine
- `game/src/audio.js` — synthesized WebAudio sounds (no audio files)
- `game/src/effects.js` — tracers, impact sparks, explosions (pooled, no per-frame allocation)
- `game/src/hud.js` — the DOM HUD, buy menu, minimap
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/palette.js` — the look plan in one place
- `game/vendor/three/` — three.js 0.187.0, byte for byte from npm, as the kit requires
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
- `screenshots/` — real renders of the game's own code (see `shots.json`, `shots.mjs`)
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to `/output` and
  writes `/output/dossier.json`
- `BUILD_LOG.md` — how it was built, tested, and what was fixed along the way

## License

MIT — see `LICENSE`.
