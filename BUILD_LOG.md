# Build log — Ember Yard (threejs-fps-02)

Built 2026-11-16 by a Muse subagent for Batozar (@batozar1998, GitHub Batozar1998).
Competition closes Tue 2026-11-17 04:30 WIB. Prize $1,000 (1st $400, 2nd $200,
3rd $120, 4th–10th $40). 8,741 submissions at build time.

## Kit

Fresh kit fetched 2026-11-16 ~11:48 WIB from
`https://make.fun/c/threejs-fps-02/kit` (level 17; the old kits in
`~/workspace/make-fun/kit/` are level 8/9). Kit kept at
`~/workspace/make-fun/threejs-fps-02-kit/`. The kit's starter (a grey room, one
rifle, four targets) was the base; the game was rewritten into a full tactical FPS.
`vendor/makefun-threejs.ts` copied unchanged; three.js 0.187.0 vendored byte for
byte under `game/vendor/three/` as the gate requires.

## Environment

- Node v24.22.1 (requirement is 22.18+), Python 3.12.3.
- No system Chrome in PATH, and the Hatch-patched `/opt/meta-chromium/chrome`
  refuses to start (`Hatch WebGL domain policy is required for browser startup`).
  Playwright's Chromium download fails in this VM (egress). What worked:
  `~/workspace/make-fun/chrome-headless-shell-linux64/chrome-headless-shell`
  (Google Chrome for Testing 141) with `--enable-unsafe-swiftshader` — WebGL 2
  confirmed working (`WEBGL2-OK WebGL 2.0 (OpenGL ES 3.0 Chromium)`).
- Gotcha: port 8080 is already taken in this VM by a make.fun read-only frontend,
  so `shots.mjs`/`serve.ts` use port 8901 (smoke test 8902, bot tests 8903+).
  The first screenshot run captured that other service's page; fixed by the port change.

## What was built

See `README.md` for the game. Source is ~2,300 lines across 12 modules
(`game/src/`), plus `game/index.html` (HUD + CSS). Total dossier source text is
well under the 160 KiB cap.

## Testing (all headless, real renders — no fakes)

- `node --check` on every `game/src/*.js` file: all parse.
- Screenshots: `node shots.mjs` (Playwright + headless shell, 1280×720, JPEG
  q82) — 4 shots, each a real render of the game's own code via `?shot=` modes
  (`1-play` cover, `2-start`, `3-buy`, `4-end`). All ≤256 KiB, 1280×720.
  `window.__shotReady` gates each capture; shot mode freezes the frame.
- Interactive smoke test (`/tmp/pwtest/smoketest.mjs`, 10 checks, all PASS):
  menu → buy armour ($650 of $800) → round start → walk → fire 3 sidearm rounds
  (mag 12→9) → reload (12/33) → timer expiry ends the round (defenders win,
  loss +$1,900 → $2,050) → round 2 buy phase with the player alive at 100 HP.
  Note: headless SwiftShader renders at a few fps, so the test drives the sim
  with `window.__ember.advance(seconds)` (60 fixed steps = 1 s of game time);
  without it the sim lags real time (5 fixed steps per rendered frame cap).
- Bot war test: with the player idle, bots fight, kill, and a round ends by
  elimination (attackers wiped the defenders 5–0 in one run; defenders won the
  next on time after wiping the attackers).
- Objective tests (scripted via `__ember`): spike plant by a bot carrier on
  site A ✓; 40 s countdown → detonation → attackers win ✓; defenders rotating
  in and defusing (5 s) → defenders win ✓; dropped spike picked up by the
  nearest attacker bot ✓.
- Nav test: all 40 waypoints connected, no isolated nodes; routes spawn→A,
  spawn→B, spawn→mid, defender→A all resolve.

## Bugs found by testing and fixed

1. `game.bomb` was undefined in the bots module (`game.bomb.planted`) — crashed
   the play/end shots. Fixed by sharing `bomb.state` on the game object.
2. Money displayed as `$$800` (HTML `$` + JS `$`). Fixed in `hud.setMoney`.
3. Killfeed overlapped the defender roster; moved it down.
4. Muzzle flash plane + light blew out the right half of the play shot; shrunk
   the plane (0.26→0.16, opacity 0.9→0.55) and the light (18→6).
5. Player died during the staged play/end captures (bots shot him while the
   scene settled), which also overwrote the ROUND WON banner with YOU ARE DOWN.
   Shot mode is now god-mode (`damagePlayer` returns early when `?shot=`).
6. Bots got stuck at spawn: waypoint 1 (-24,-6) sat inside the spawn-cover box,
   so attackers leaned on the box forever. Moved the cover boxes to x=±22 and
   added a stuck-watch (skip an unreachable waypoint after 2 s without progress).
7. `siteWaypoint` and the defender hold spots used the wrong waypoint indices
   (A and B swapped; holds pointed at mid). Fixed to 29 (A) / 30 (B) and the
   correct hold waypoints; hold yaws corrected (site B defenders were facing
   the south wall).
8. The hand-listed edge graph disconnected the west side (two lane entries
   blocked by crates). Replaced with edges computed at load: link nodes within
   12.5 m whose straight walk stays clear of colliders.
9. Six waypoints sat inside crates (e.g. (-14,-17), (16,-18)). Moved to open
   ground; nav test confirms zero isolated nodes.
10. A 32 m sightline down the east edge let site B snipe site A (and spawn).
    Added a wide east-mid container and cut bot view distance 46→34 m.
11. Defuse never happened: the rotate branch rebuilt the bot's route every tick,
    resetting its waypoint cursor, so defenders never arrived. Routes are now
    set once per destination (`rotateDest` guard).
12. Bot lethality tuned twice (reaction 0.35–0.85 s → 0.5–1.1 s, hit chance cap
    0.75 → 0.45, rifle damage 34 → 26, armour now actually absorbs half damage
    until it breaks) so bot wars last longer than ~10 s; attackers now push 3+1
    instead of 2+2.

## Known limits

- Screenshots were taken headless with SwiftShader; colours/lighting are as the
  software renderer shows them. Worth one look in real Chrome before submitting.
- The defuse path was verified with scripted bot positions; a natural defuse in
  unscripted play (player plants, defenders rotate and defuse while the player
  defends) was not observed end-to-end — the code path is the same one the
  scripted test exercised.
- `main.ts` / `makefun check` / `bundle` status is in the handoff report, not here.
