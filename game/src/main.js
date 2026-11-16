// Ember Yard: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; rendering never writes game state. The match is Vanguard (the player plus
// four bots) attacking against five Cinder bots: plant the spike on A or B, or eliminate the
// defence. First to 7 rounds takes the yard.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE } from './weapon.js';
import { createBots } from './bots.js';
import { createBomb, SPIKE_TIME } from './bomb.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 15;
const WIN_ROUNDS = 7;
const MAX_ROUNDS = 13;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4a3550);
scene.fog = new THREE.Fog(0x4a3550, 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const bomb = createBomb();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

const body = player.state;
const direction = new THREE.Vector3();
const origin = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// One state object: the whole match lives here, and only the fixed step writes to it.
const game = {
  phase: 'menu', // menu | buy | round | roundEnd | matchEnd
  round: 1,
  scoreA: 0,
  scoreB: 0,
  money: 800,
  lossStreak: 0,
  roundTime: ROUND_TIME,
  buyTime: BUY_TIME,
  playerHp: 100,
  playerArmor: 0,
  playerAlive: true,
  owned: ['sidearm'],
  spikeCarrier: 'player', // 'player' | bot object | 'dropped' | 'planted'
  plantProgress: 0,
  noise: null,
  bomb: null, // set by main.js to bomb.state once the bomb module exists
  roundEndTimer: 0,
  roundEndText: '',
  finalPush: false,
  spikeReroute: 0,
  kills: 0,
  deaths: 0,
  spectate: null,
};

const grenades = [];
let frozen = false;
game.bomb = bomb.state; // bots read the spike through the shared game state
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let seenEnemies = new Map(); // bot -> seconds since last seen, for the minimap

const hooks = {
  playerAlive: () => game.playerAlive && game.phase === 'round',
  playerPos: () => body.position,
  damagePlayer(dmg, fromPos, headshot, name) {
    if (shot) return; // captures are staged: the player never dies mid-shot
    if (!game.playerAlive || game.phase !== 'round') return;
    let rest = dmg;
    if (game.playerArmor > 0) {
      const absorbed = Math.min(game.playerArmor, Math.ceil(rest / 2));
      game.playerArmor -= absorbed;
      rest -= absorbed;
    }
    game.playerHp -= rest;
    audio.hurt();
    hud.hurtFlash();
    if (game.playerHp <= 0) {
      game.playerHp = 0;
      game.playerAlive = false;
      game.deaths += 1;
      game.spectate = bots.bots.find((b) => b.team === 'attack' && b.alive) ?? null;
      hud.killfeed(name, 'YOU', headshot, 'defend');
      hud.banner('YOU ARE DOWN', 'Your squad fights on — next round you are back.', 3000);
      if (game.spikeCarrier === 'player') dropSpike(body.position.x, body.position.z);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  },
  damageBot(bot, dmg, headshot, attacker) {
    const killed = bots.damage(bot, dmg, headshot);
    if (killed) {
      hud.killfeed(attacker.name, bot.name, headshot, attacker.team);
      if (attacker.team === 'attack') {
        // A friendly bot's kill is shown, not paid: only the player's kills earn money.
      }
    }
    return killed;
  },
  noise(x, z, radius) {
    if (!game.noise) game.noise = { x, z, radius };
  },
  onPlantTick(frac) {
    hud.setSpike('planting', frac, 'SPIKE BEING PLANTED');
  },
  onPlanted(site, bot) {
    bomb.plant(site);
    game.spikeCarrier = 'planted';
    audio.plantDone();
    hud.banner('SPIKE PLANTED', `Cinder must defuse it — hold site ${site.label}.`, 3200);
    hud.killfeed(bot.name, 'SPIKE', false, 'attack');
  },
  onDefuseTick(frac) {
    hud.setSpike('defusing', frac, 'SPIKE BEING DEFUSED');
  },
  onDefused(bot) {
    bomb.defuse();
    endRound('defend', `${bot.name} defused the spike.`);
  },
  onSpikeDropped(x, z) {
    bomb.drop(x, z);
    game.spikeCarrier = 'dropped';
  },
};

const bots = createBots(scene, world, effects, audio, hooks);

// --- Spike handoff -----------------------------------------------------------
function dropSpike(x, z) {
  bomb.drop(x, z);
  game.spikeCarrier = 'dropped';
  hud.showPrompt('Spike dropped — a teammate can pick it up');
  setTimeout(() => hud.hidePrompt(), 2600);
}

function tryPickupSpike() {
  if (game.spikeCarrier !== 'dropped' || bomb.state.status !== 'dropped') return;
  const d = Math.hypot(bomb.state.x - body.position.x, bomb.state.z - body.position.z);
  if (d < 2 && game.playerAlive) {
    bomb.pickup();
    game.spikeCarrier = 'player';
    hud.hidePrompt();
    audio.buy();
  }
}

// --- Shooting ----------------------------------------------------------------
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

function shoot() {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    audio.dryClick();
    if (weapon.state.reserve > 0) weapon.reload();
    return;
  }
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.groundSpeed(), playerMoving());
  const pellets = def.pellets ?? 1;
  let anyHit = false;
  for (let p = 0; p < pellets; p++) {
    const dx = direction.x + (random() * 2 - 1) * spread;
    const dy = direction.y + (random() * 2 - 1) * spread;
    const dz = direction.z + (random() * 2 - 1) * spread;
    const len = Math.hypot(dx, dy, dz);
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;
    origin.copy(camera.position);
    raycaster.set(origin, tmpVec.set(nx, ny, nz));
    const wall = raycaster.intersectObjects(world.shootables, false)[0];
    const wallT = wall ? wall.distance : Infinity;
    // Nearest bot hitbox along the same ray.
    let bestT = Infinity;
    let bestBot = null;
    let bestHead = false;
    for (const hb of bots.hitboxes()) {
      const t = hb.part === 'head'
        ? raySphere(origin.x, origin.y, origin.z, nx, ny, nz, hb.center.x, hb.center.y, hb.center.z, hb.radius)
        : raySphere(origin.x, origin.y, origin.z, nx, ny, nz, hb.center.x, hb.center.y, hb.center.z, hb.radius);
      if (t < bestT) { bestT = t; bestBot = hb.bot; bestHead = hb.part === 'head'; }
    }
    const muzzle = tmpVec.set(camera.position.x + direction.x * 0.4, camera.position.y - 0.12, camera.position.z + direction.z * 0.4);
    if (bestBot && bestT < wallT) {
      const dist = bestT;
      const falloff = dist < def.falloff[0] ? 1 : Math.max(0.55, 1 - (dist - def.falloff[0]) / (def.falloff[1] - def.falloff[0]) * 0.45);
      const dmg = Math.round(def.damage * (bestHead ? def.headMult : 1) * falloff);
      const killed = bots.damage(bestBot, dmg, bestHead);
      const hitPoint = new THREE.Vector3(origin.x + nx * bestT, origin.y + ny * bestT, origin.z + nz * bestT);
      effects.tracer(muzzle, hitPoint, def.tracer);
      effects.impact(hitPoint, new THREE.Vector3(-nx, -ny, -nz));
      hud.hitMarker(killed, bestHead);
      if (bestHead) audio.headshot(); else audio.hit();
      if (killed) {
        game.kills += 1;
        game.money += 300;
        audio.kill();
        hud.killfeed('YOU', bestBot.name, bestHead, 'attack');
        seenEnemies.delete(bestBot);
      } else {
        seenEnemies.set(bestBot, 4);
      }
      anyHit = true;
    } else if (wall) {
      effects.tracer(muzzle, wall.point, def.tracer);
      effects.impact(wall.point, wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : new THREE.Vector3(0, 1, 0));
    } else {
      effects.tracer(muzzle, new THREE.Vector3(origin.x + nx * 60, origin.y + ny * 60, origin.z + nz * 60), def.tracer);
    }
  }
  weapon.pullTrigger();
  player.recoil(def.recoil * 0.55 + random() * 0.004, (random() * 2 - 1) * def.recoil * 0.3);
  audio.shot(def.id);
  hooks.noise(body.position.x, body.position.z, 22);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name, weapon.state.grenades);
  return anyHit;
}

function playerMoving() {
  const k = input.state.keys;
  return k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD');
}

// --- Grenades ----------------------------------------------------------------
function throwGrenade() {
  if (weapon.state.grenades <= 0 || game.phase !== 'round' || !game.playerAlive) return;
  weapon.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.5, metalness: 0.6 }),
  );
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: new THREE.Vector3(direction.x * 15, direction.y * 15 + 3.5, direction.z * 15),
    timer: 1.6,
  });
  audio.step();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, weapon.state.grenades);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.timer -= dt;
    g.vel.y -= 14 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    const p = g.mesh.position;
    if (p.y < 0.09) { p.y = 0.09; g.vel.y *= -0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    for (const c of world.colliders) {
      if (p.x > c.min.x - 0.1 && p.x < c.max.x + 0.1 && p.y > c.min.y - 0.1 && p.y < c.max.y + 0.1 &&
          p.z > c.min.z - 0.1 && p.z < c.max.z + 0.1) {
        g.vel.multiplyScalar(-0.4);
        p.y += 0.15;
      }
    }
    if (g.timer <= 0) {
      effects.explosion(p);
      audio.explosion();
      hooks.noise(p.x, p.z, 30);
      const blast = (pos, isPlayer) => {
        const d = Math.hypot(pos.x - p.x, pos.z - p.z) + Math.abs((pos.y ?? 1) - p.y) * 0.5;
        if (d > GRENADE.radius) return;
        const dmg = Math.round(GRENADE.damage * (1 - d / GRENADE.radius));
        if (isPlayer) hooks.damagePlayer(dmg, p, false, 'Spark Frag');
        return dmg;
      };
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const dmg = blast(bot.pos, false);
        if (dmg) {
          const killed = bots.damage(bot, dmg, false);
          if (killed && bot.team === 'defend') {
            game.kills += 1;
            game.money += 300;
            hud.killfeed('YOU', bot.name, false, 'attack');
          }
        }
      }
      blast(body.position, true);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

// --- Match flow ---------------------------------------------------------------
function startMatch() {
  game.scoreA = 0;
  game.scoreB = 0;
  game.round = 1;
  game.money = 800;
  game.lossStreak = 0;
  game.kills = 0;
  game.deaths = 0;
  game.owned = ['sidearm'];
  weapon.equip('sidearm');
  startBuyPhase();
}

function startBuyPhase() {
  game.phase = 'buy';
  game.buyTime = BUY_TIME;
  game.playerHp = 100;
  game.playerAlive = true;
  game.spectate = null;
  game.plantProgress = 0;
  game.finalPush = false;
  game.spikeReroute = 0;
  bomb.reset();
  bots.resetRound(game.round, random);
  bots.giveSpike(null); // the player carries the spike; a bot takes it only if the player falls
  game.spikeCarrier = 'player';
  const [sx, sz] = world.spawns.attack[0];
  player.reset(sx, sz, -Math.PI / 2);
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  weapon.refill();
  weapon.state.grenades = game.owned.includes('grenade') ? Math.min(2, 1 + (game.round > 3 ? 1 : 0)) : 0;
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, weapon.state.grenades);
  hud.setHealth(game.playerHp, game.playerArmor);
  hud.setMoney(game.money);
  hud.setScore(game.scoreA, game.scoreB, game.round);
  hud.setSpike('none', 0, '');
  hud.hideBanner();
  hud.showBuy(game.money, game.owned);
  hud.setBuyHint('Buy phase — spend, then press B or Enter to start the round.');
  syncCamera();
}

function startRound() {
  game.phase = 'round';
  game.roundTime = ROUND_TIME;
  hud.hideBuy();
  hud.banner(`ROUND ${game.round}`, game.spikeCarrier === 'player' ? 'You carry the spike — plant it on A or B.' : 'Plant the spike on A or B.', 2200);
}

function endRound(winner, reason) {
  if (game.phase !== 'round') return;
  game.phase = 'roundEnd';
  game.roundEndTimer = 4;
  game.roundEndText = reason;
  if (winner === 'attack') {
    game.scoreA += 1;
    game.money += 3250;
    game.lossStreak = 0;
    audio.roundWin();
    hud.banner('ROUND WON', reason, 3600);
  } else {
    game.scoreB += 1;
    game.lossStreak += 1;
    game.money += 1900 + Math.min(1000, (game.lossStreak - 1) * 500);
    audio.roundLose();
    hud.banner('ROUND LOST', reason, 3600);
  }
  hud.setScore(game.scoreA, game.scoreB, game.round);
  hud.setMoney(game.money);
  if (document.pointerLockElement) document.exitPointerLock();
}

function endMatch() {
  game.phase = 'matchEnd';
  const won = game.scoreA > game.scoreB;
  hud.showOverlay(won ? 'end' : 'lost',
    `Vanguard ${game.scoreA} — ${game.scoreB} Cinder. ${game.kills} eliminations, ${game.deaths} deaths. ${won ? 'The yard is yours.' : 'Cinder holds the yard.'}`);
  if (document.pointerLockElement) document.exitPointerLock();
}

function buy(item) {
  if (game.phase !== 'buy') return;
  if (item === 'armor') {
    if (game.money < 650 || game.playerArmor >= 50) { audio.denied(); return; }
    game.money -= 650;
    game.playerArmor = 50;
  } else if (item === 'grenade') {
    if (game.money < GRENADE.price || weapon.state.grenades >= 2) { audio.denied(); return; }
    game.money -= GRENADE.price;
    weapon.state.grenades += 1;
    if (!game.owned.includes('grenade')) game.owned.push('grenade');
  } else {
    const def = WEAPONS[item];
    if (!def || game.money < def.price || game.owned.includes(item)) { audio.denied(); return; }
    game.money -= def.price;
    game.owned.push(item);
    weapon.equip(item);
  }
  audio.buy();
  hud.setMoney(game.money);
  hud.setHealth(game.playerHp, game.playerArmor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, weapon.state.grenades);
  hud.showBuy(game.money, game.owned);
}

// --- Fixed-step simulation ------------------------------------------------------
function step(dt) {
  const keys = input.state.keys;
  if (game.phase === 'buy') {
    const lookBuy = input.takeLook();
    player.look(lookBuy.x, lookBuy.y);
    if (input.consumePressed('KeyB') || input.consumePressed('Enter')) startRound();
    if (input.consumePressed('Digit1')) buy('smg');
    if (input.consumePressed('Digit2')) buy('shotgun');
    if (input.consumePressed('Digit3')) buy('rifle');
    if (input.consumePressed('Digit4')) buy('sniper');
    if (input.consumePressed('Digit5')) buy('grenade');
    if (input.consumePressed('Digit6')) buy('armor');
    game.buyTime -= dt;
    if (game.buyTime <= 0) startRound();
    player.step(dt, keys, weapon.def().speed);
    weapon.step(dt, false);
  } else if (game.phase === 'round') {
    game.roundTime -= dt;
    const look0 = input.takeLook();
    if (game.playerAlive) player.look(look0.x, look0.y * (input.state.aiming ? 0.6 : 1));
    // Weapon switching and grenades.
    const slots = ['sidearm', 'smg', 'shotgun', 'rifle', 'sniper'];
    for (let i = 0; i < slots.length; i++) {
      if (input.consumePressed(`Digit${i + 1}`) && game.owned.includes(slots[i])) {
        weapon.equip(slots[i]);
        hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, weapon.state.grenades);
      }
    }
    if (input.consumePressed('KeyG')) throwGrenade();
    if (input.consumePressed('KeyR')) { weapon.reload(); audio.reload(); }
    if (input.consumePressed('KeyB')) { audio.denied(); }
    if (input.consumePressed('KeyE')) tryPickupSpike();

    if (game.playerAlive) {
      player.step(dt, keys, weapon.def().speed);
      // Firing: autos hold, semi-autos fire on the press edge.
      const def = weapon.def();
      const wantFire = input.state.firing && (def.auto || !prevFiring);
      if (wantFire && weapon.ready()) shoot();
      else if (wantFire && weapon.state.mag === 0 && weapon.state.reserve > 0) weapon.reload();
      prevFiring = input.state.firing;
      weapon.step(dt, input.state.aiming);

      // Planting: hold E inside a site while carrying the spike.
      if (game.spikeCarrier === 'player' && keys.has('KeyE')) {
        const site = inSite(body.position.x, body.position.z);
        if (site) {
          game.plantProgress += dt;
          hud.setSpike('planting', game.plantProgress / 3.5, 'PLANTING SPIKE — HOLD E');
          if (Math.floor(game.plantProgress * 2) !== Math.floor((game.plantProgress - dt) * 2)) audio.plantBeep();
          if (game.plantProgress >= 3.5) {
            bomb.plant(site);
            game.spikeCarrier = 'planted';
            game.plantProgress = 0;
            game.money += 300;
            audio.plantDone();
            hud.setMoney(game.money);
            hud.banner('SPIKE PLANTED', `Cinder must defuse it — hold site ${site.label}.`, 3200);
          }
        } else {
          game.plantProgress = Math.max(0, game.plantProgress - dt * 2);
        }
      } else {
        game.plantProgress = Math.max(0, game.plantProgress - dt * 2);
        if (game.spikeCarrier === 'player' && bomb.state.status !== 'planted') hud.setSpike('none', 0, '');
      }
      // Prompt to pick the spike up.
      if (game.spikeCarrier === 'dropped' && bomb.state.status === 'dropped') {
        const d = Math.hypot(bomb.state.x - body.position.x, bomb.state.z - body.position.z);
        if (d < 2) hud.showPrompt('Press <kbd>E</kbd> to pick up the spike');
        else hud.hidePrompt();
      }
    } else {
      // Dead: spectate the first living teammate.
      if (game.spectate && !game.spectate.alive) {
        game.spectate = bots.bots.find((b) => b.team === 'attack' && b.alive) ?? null;
      }
    }

    bots.step(dt, game);
    bomb.step(dt);
    stepGrenades(dt);
    effects.step(dt);

    // A dropped spike is picked up by the nearest living attacker bot, which is sent
    // to fetch it; the player can still grab it first by walking over it.
    if (game.spikeCarrier === 'dropped' && bomb.state.status === 'dropped') {
      game.spikeReroute -= dt;
      let fetcher = bots.bots.find((b) => b.fetchingSpike && b.alive && b.team === 'attack');
      if (!fetcher) {
        let best = null;
        let bestD = Infinity;
        for (const bot of bots.bots) {
          if (bot.team !== 'attack' || !bot.alive) continue;
          const d = Math.hypot(bomb.state.x - bot.pos.x, bomb.state.z - bot.pos.z);
          if (d < bestD) { bestD = d; best = bot; }
        }
        if (best) {
          best.fetchingSpike = true;
          fetcher = best;
          bots.routeTo(fetcher, bomb.state.x, bomb.state.z);
          game.spikeReroute = 2;
        }
      } else if (game.spikeReroute <= 0) {
        bots.routeTo(fetcher, bomb.state.x, bomb.state.z);
        game.spikeReroute = 2;
      }
      for (const bot of bots.bots) {
        if (bot.team !== 'attack' || !bot.alive) continue;
        if (Math.hypot(bomb.state.x - bot.pos.x, bomb.state.z - bot.pos.z) < 1.6) {
          bomb.pickup();
          bots.giveSpike(bot);
          game.spikeCarrier = bot;
          for (const b of bots.bots) b.fetchingSpike = false;
          hud.hidePrompt();
          break;
        }
      }
    }

    // Final push: with 30 s left and no plant, every living attacker converges on a site.
    if (!game.finalPush && game.roundTime <= 30 && bomb.state.status !== 'planted') {
      game.finalPush = true;
      const site = world.sites[game.spikeCarrier === 'player' ? (random() < 0.5 ? 'A' : 'B') : 'A'];
      for (const bot of bots.bots) {
        if (bot.team === 'attack' && bot.alive && !bot.target) bots.routeTo(bot, site.x, site.z);
      }
    }

    // Spike HUD.
    if (bomb.state.status === 'planted') {
      hud.setSpike('planted', bomb.state.timer / SPIKE_TIME, `SPIKE PLANTED — SITE ${bomb.state.site} — ${Math.ceil(bomb.state.timer)}s`);
    }

    // Round end checks.
    const attackersAlive = (game.playerAlive ? 1 : 0) + bots.aliveCount('attack');
    const defendersAlive = bots.aliveCount('defend');
    if (bomb.state.status === 'planted' && bomb.state.timer <= 0) {
      bomb.explode();
      effects.explosion(new THREE.Vector3(bomb.state.x, 0.5, bomb.state.z));
      audio.explosion();
      endRound('attack', 'The spike detonated.');
    } else if (defendersAlive === 0) {
      endRound('attack', 'Cinder squad eliminated.');
    } else if (attackersAlive === 0 && bomb.state.status !== 'planted') {
      endRound('defend', 'Vanguard squad eliminated.');
    } else if (game.roundTime <= 0 && bomb.state.status !== 'planted') {
      endRound('defend', 'Time expired — the spike was never planted.');
    }
  } else if (game.phase === 'roundEnd') {
    game.roundEndTimer -= dt;
    bots.step(dt, game);
    effects.step(dt);
    if (game.roundEndTimer <= 0) {
      if (game.scoreA >= WIN_ROUNDS || game.scoreB >= WIN_ROUNDS || game.round >= MAX_ROUNDS) {
        endMatch();
      } else {
        game.round += 1;
        startBuyPhase();
      }
    }
  }

  // Minimap memory decays.
  for (const [bot, t] of seenEnemies) {
    const left = t - dt;
    if (left <= 0) seenEnemies.delete(bot);
    else seenEnemies.set(bot, left);
  }
  syncCamera();
  updateHud();
}

function inSite(x, z) {
  for (const site of Object.values(world.sites)) {
    if (Math.abs(x - site.x) <= site.half && Math.abs(z - site.z) <= site.half) return site;
  }
  return null;
}

function updateHud() {
  hud.setHealth(game.playerHp, game.playerArmor);
  hud.setMoney(game.money);
  if (game.phase === 'buy') hud.setTimer(game.buyTime, 'buy');
  else if (game.phase === 'round') hud.setTimer(game.roundTime, 'round');
  else hud.setTimer(0, 'round');
  hud.setScore(game.scoreA, game.scoreB, game.round);
  const attackers = [{ name: 'YOU', hp: Math.ceil(game.playerHp), alive: game.playerAlive }]
    .concat(bots.bots.filter((b) => b.team === 'attack').map((b) => ({ name: b.name, hp: b.hp, alive: b.alive })));
  const defenders = bots.bots.filter((b) => b.team === 'defend').map((b) => ({ name: b.name, hp: b.hp, alive: b.alive }));
  hud.setTeams(attackers, defenders);
  const spreadPx = 4 + weapon.spread(player.groundSpeed(), playerMoving()) * 320;
  hud.setSpread(spreadPx);
  // Minimap: teammates always, enemies only while freshly seen.
  const dots = [{ x: body.position.x, z: body.position.z, color: '#3a7bd5', you: true }];
  for (const b of bots.bots) {
    if (!b.alive) continue;
    if (b.team === 'attack') dots.push({ x: b.pos.x, z: b.pos.z, color: '#3a7bd5' });
    else if (seenEnemies.has(b)) dots.push({ x: b.pos.x, z: b.pos.z, color: '#d53a2e' });
  }
  hud.drawMinimap(dots, Object.values(world.sites), world.bounds);
}

function syncCamera() {
  if (!game.playerAlive && game.spectate) {
    const b = game.spectate;
    camera.position.set(b.pos.x, 1.6, b.pos.z);
    camera.rotation.set(0, b.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (input.state.aiming && weapon.def().id === 'sniper') camera.fov = 74 - 34 * weapon.state.ads;
  else camera.fov = 74 - 6 * weapon.state.ads;
  camera.updateProjectionMatrix();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (game.phase === 'menu') startMatch();
  } else if ((game.phase === 'round' || game.phase === 'buy') && game.playerAlive) {
    hud.showOverlay('paused', '');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (game.phase === 'matchEnd') startMatch();
  audio.unlock();
  input.requestLock();
});
hud.onBuy((item) => buy(item));

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i++) step(FIXED_STEP);
  updateHud();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// --- Deterministic captures -----------------------------------------------------
// Each shot places the player, the bots and the HUD, runs a few seconds of simulation
// so poses, tracers and banners are real, then freezes the frame.
function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    // The menu: the yard at dusk from the attacker spawn, squad in view.
    bots.resetRound(1, random);
    bots.giveSpike(null);
    player.reset(-28, -3, -Math.PI / 2);
    game.phase = 'menu';
    game.round = 1;
    game.scoreA = 0;
    game.scoreB = 0;
    game.money = 800;
    settle(30);
    body.yaw = -Math.PI / 2 + 0.25;
    body.pitch = 0.06;
    hud.showOverlay('start', '');
  } else if (name === 'buy') {
    startMatch();
    settle(30);
    body.yaw = -Math.PI / 2;
    body.pitch = 0.01;
    hud.showBuy(2400, ['sidearm', 'smg']);
    game.money = 2400;
    hud.setMoney(2400);
  } else if (name === 'play') {
    // Mid-round on the A lane: two Cinder bots in the open, one Vanguard beside the player.
    startMatch();
    startRound();
    game.round = 4;
    game.scoreA = 2;
    game.scoreB = 1;
    game.money = 2400;
    game.playerHp = 78;
    weapon.equip('rifle');
    weapon.state.mag = 24;
    weapon.state.grenades = 1;
    const enemies = bots.bots.filter((b) => b.team === 'defend');
    const friendlies = bots.bots.filter((b) => b.team === 'attack');
    player.reset(-6, -8, -Math.PI / 2 + 0.5);
    body.yaw = Math.atan2(-(14 - body.position.x), -(-14 - body.position.z));
    enemies[0].pos.set(2, 0, -11); enemies[0].yaw = 2.6; enemies[0].path = [];
    enemies[1].pos.set(7, 0, -13); enemies[1].yaw = 2.4; enemies[1].path = [];
    enemies[2].pos.set(13, 0, -15); enemies[2].yaw = 2.8; enemies[2].path = [];
    friendlies[0].pos.set(-10, 0, -5); friendlies[0].yaw = -1.2; friendlies[0].path = [];
    friendlies[1].pos.set(-2, 0, -14); friendlies[1].yaw = -1.4; friendlies[1].path = [];
    game.roundTime = 72;
    hud.killfeed('Rook', 'Blaze', false, 'attack');
    hud.killfeed('YOU', 'Ash', true, 'attack');
    seenEnemies.set(enemies[0], 4);
    seenEnemies.set(enemies[1], 4);
    settle(150);
    // One real shot down the lane, frozen on the tracer.
    const aim = new THREE.Vector3(2, 1.3, -11);
    const dx = aim.x - body.position.x;
    const dy = aim.y - (body.position.y + body.eye);
    const dz = aim.z - body.position.z;
    body.yaw = Math.atan2(-dx, -dz);
    body.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    syncCamera();
    shoot();
    settle(2);
  } else {
    // Round end: the spike is down on A, the site is ours, the banner is up.
    startMatch();
    startRound();
    game.round = 5;
    game.scoreA = 3;
    game.scoreB = 1;
    game.money = 4100;
    game.playerHp = 64;
    weapon.equip('rifle');
    weapon.state.mag = 17;
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, weapon.state.grenades);
    const enemies = bots.bots.filter((b) => b.team === 'defend');
    enemies[0].alive = false; enemies[0].hp = 0; enemies[0].pos.set(18, 0, -14); enemies[0].deadTimer = 1;
    enemies[1].alive = false; enemies[1].hp = 0; enemies[1].pos.set(22, 0, -18); enemies[1].deadTimer = 1;
    player.reset(14, -12, -Math.PI / 2 + 0.6);
    body.yaw = Math.atan2(-(20 - body.position.x), -(-16 - body.position.z));
    bomb.plant(world.sites.A);
    game.spikeCarrier = 'planted';
    bomb.state.timer = 32;
    hud.banner('ROUND WON', 'Cinder squad eliminated — the spike is down on A.', 60000);
    hud.killfeed('YOU', 'Ember', true, 'attack');
    hud.killfeed('YOU', 'Cinder', false, 'attack');
    settle(90);
  }
  updateHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
updateHud();
// Debug handle for play-testing (read-only state for automated checks; not used by the game).
// advance() runs the fixed-step simulation synchronously, so a slow renderer cannot
// stretch a test: 60 steps is exactly one second of game time.
window.__ember = {
  game, bots, bomb, weapon, player, world,
  advance(seconds) {
    const n = Math.round(seconds / FIXED_STEP);
    for (let i = 0; i < n; i++) step(FIXED_STEP);
  },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
