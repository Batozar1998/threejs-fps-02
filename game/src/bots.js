// Bots: five a side, with roles, routes, vision, hearing and nerves. Attackers push a lane
// toward their site and plant the spike; defenders hold a site angle, rotate on noise, and
// defuse once the spike is down. A bot sees only what is in front of it with a clear line of
// sight, hears loud shots, and shoots in bursts whose error shrinks the longer it aims.
// Vision and hearing are staggered per bot so the checks stay cheap.
import * as THREE from 'three';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.7;
const EYE_HEIGHT = 1.55;
const VIEW_DIST = 34;
const VIEW_HALF_ANGLE = 1.05; // ~120 degree field of view
const REACT_MIN = 0.5;
const REACT_MAX = 1.1;
const PLANT_TIME = 3.5;
const DEFUSE_TIME = 5.0;

const FRIENDLY_NAMES = ['Rook', 'Havoc', 'Sable', 'Wren'];
const ENEMY_NAMES = ['Ash', 'Blaze', 'Cinder', 'Ember', 'Flint'];

// Hold spots: [waypoint index, yaw facing] for defenders, per site. Site A is the north
// warehouse (waypoints 25/29/33/27); site B is the south container stack (26/30/34/28).
const HOLD_A = [[25, 1.8], [29, 2.4], [33, 1.2], [27, 2.2]];
const HOLD_B = [[26, 1.0], [30, 1.57], [34, 0.6], [28, 0.8]];

function makeBody(scene, teamColor, name) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.75, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241c15, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), torsoMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.58;
  head.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.32), torsoMat);
  band.position.y = 1.68;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), darkMat);
  legL.position.set(-0.13, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
  gun.position.set(0.18, 1.18, -0.32);
  group.add(torso, head, band, legL, legR, gun);
  group.userData.head = head;
  group.userData.torso = torso;
  scene.add(group);
  return group;
}

export function createBots(scene, world, effects, audio, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const fromVec = new THREE.Vector3();
  const toVec = new THREE.Vector3();
  const dirVec = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();

  const bots = [];

  function hasLOS(from, to) {
    dirVec.subVectors(to, from);
    const dist = dirVec.length();
    if (dist < 0.01) return true;
    dirVec.multiplyScalar(1 / dist);
    raycaster.set(from, dirVec);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  function collide(x, z, height = BOT_HEIGHT) {
    for (const c of world.colliders) {
      if (x + BOT_RADIUS > c.min.x && x - BOT_RADIUS < c.max.x &&
          0 + height > c.min.y && 0 < c.max.y &&
          z + BOT_RADIUS > c.min.z && z - BOT_RADIUS < c.max.z) return true;
    }
    return false;
  }

  function moveBot(bot, dt) {
    const speed = bot.crouching ? 2.2 : bot.running ? 5.0 : 3.4;
    const dx = bot.moveX;
    const dz = bot.moveZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const nx = bot.pos.x + (dx / len) * speed * dt;
    if (!collide(nx, bot.pos.z)) bot.pos.x = nx;
    const nz = bot.pos.z + (dz / len) * speed * dt;
    if (!collide(bot.pos.x, nz)) bot.pos.z = nz;
    bot.pos.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, bot.pos.x));
    bot.pos.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ, bot.pos.z));
  }

  function makeBot(team, name, index) {
    const color = team === 'attack' ? 0x3a7bd5 : 0xd53a2e;
    const mesh = makeBody(scene, color, name);
    return {
      team, name, index, mesh,
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0, hp: 100, alive: true, armor: false,
      weapon: team === 'attack' ? (index % 3 === 0 ? 'smg' : 'rifle') : (index % 4 === 0 ? 'smg' : 'rifle'),
      role: team === 'attack' ? 'push' : 'hold',
      site: team === 'attack' ? (index < 2 ? 'A' : 'B') : (index < 2 ? 'A' : index < 4 ? 'B' : 'mid'),
      path: [], pathCursor: 0, holdSpot: null, holdYaw: 0,
      target: null, aimTime: 0, reactLeft: 0, burstLeft: 0, burstGap: 0,
      moveX: 0, moveZ: 0, running: false, crouching: false,
      visionTimer: Math.random() * 0.15, thinkTimer: Math.random() * 0.3,
      investigate: null, plantLeft: 0, defuseLeft: 0, hasSpike: false,
      walkPhase: Math.random() * Math.PI * 2, deadTimer: 0, lastSeen: null,
      idleTime: 0, holdStill: false, fetchingSpike: false, rotateDest: -1,
      stuckTimer: 0, stuckCount: 0, lastX: 0, lastZ: 0,
    };
  }

  for (let i = 0; i < 4; i++) bots.push(makeBot('attack', FRIENDLY_NAMES[i], i));
  for (let i = 0; i < 5; i++) bots.push(makeBot('defend', ENEMY_NAMES[i], i));

  function setPath(bot, destWp) {
    const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
    bot.path = world.route(from, destWp);
    bot.pathCursor = 0;
  }

  function siteWaypoint(site) {
    return site === 'A' ? 29 : 30; // 29 is (20,-16) on site A; 30 is (20,16) on site B
  }

  function resetRound(roundNumber, random) {
    const attackSite = random() < 0.5 ? 'A' : 'B';
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.armor = bot.team === 'attack' ? roundNumber > 1 : true;
      bot.armorHp = bot.armor ? 50 : 0; // a vest absorbs half of each hit until it breaks
      bot.weapon = bot.team === 'attack'
        ? (roundNumber > 2 && bot.index % 3 === 0 ? 'rifle' : bot.index % 3 === 0 ? 'smg' : 'rifle')
        : (bot.index === 4 ? 'smg' : 'rifle');
      bot.target = null;
      bot.aimTime = 0;
      bot.burstLeft = 0;
      bot.plantLeft = 0;
      bot.defuseLeft = 0;
      bot.investigate = null;
      bot.deadTimer = 0;
      bot.rotateDest = -1;
      bot.mesh.visible = true;
      bot.mesh.rotation.set(0, 0, 0);
      bot.mesh.position.y = 0;
      const spawns = bot.team === 'attack' ? world.spawns.attack : world.spawns.defend;
      const [sx, sz] = spawns[bot.index % spawns.length];
      bot.pos.set(sx, 0, sz);
      bot.yaw = bot.team === 'attack' ? -Math.PI / 2 : Math.PI / 2;
      bot.hasSpike = false;
      if (bot.team === 'attack') {
        // Three push the called site, one fakes the other — a split squad feeds one by one.
        bot.site = bot.index < 3 ? attackSite : (attackSite === 'A' ? 'B' : 'A');
        bot.role = 'push';
        setPath(bot, siteWaypoint(bot.site));
      } else {
        bot.site = bot.index < 2 ? 'A' : bot.index < 4 ? 'B' : 'mid';
        const holds = bot.site === 'A' ? HOLD_A : bot.site === 'B' ? HOLD_B : [[17, 1.57], [18, 2.2]];
        const [wp, yaw] = holds[bot.index % holds.length];
        bot.holdSpot = wp;
        bot.holdYaw = yaw;
        bot.role = 'hold';
        setPath(bot, wp);
      }
    }
    // The spike rides with the first attacker; if the player carries it instead, main.js clears this.
    bots[0].hasSpike = true;
  }

  function visibleEnemies(bot) {
    // Returns the closest visible enemy: the player (attack side) or an opposing bot.
    let best = null;
    let bestD = Infinity;
    const eye = tmpVec.set(bot.pos.x, EYE_HEIGHT, bot.pos.z);
    const consider = (pos, kind, ref) => {
      const dx = pos.x - bot.pos.x;
      const dz = pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > VIEW_DIST || d >= bestD) return;
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > VIEW_HALF_ANGLE) return;
      toVec.set(pos.x, 1.35, pos.z);
      if (!hasLOS(eye, toVec)) return;
      best = { kind, ref, pos, dist: d };
      bestD = d;
    };
    if (bot.team === 'defend' && hooks.playerAlive()) consider(hooks.playerPos(), 'player', null);
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider(other.pos, 'bot', other);
    }
    return best;
  }

  function shootAt(bot, target, dt) {
    // Burst fire with an error that shrinks while the bot keeps its aim on the target.
    bot.aimTime += dt;
    bot.burstGap -= dt;
    if (bot.burstLeft <= 0) {
      if (bot.burstGap <= 0) {
        bot.burstLeft = 3 + Math.floor(Math.random() * 4);
        bot.burstGap = 0.5 + Math.random() * 0.7;
      }
      return;
    }
    if (bot.burstGap > 0.12) return; // pause inside the burst
    bot.burstGap = 0.1;
    bot.burstLeft -= 1;
    const dist = target.dist;
    const spread = 0.028 + dist * 0.0016 - Math.min(0.02, bot.aimTime * 0.012);
    const aimErr = Math.max(0.004, spread);
    const muzzle = fromVec.set(bot.pos.x, 1.35, bot.pos.z);
    const aimPoint = toVec.set(
      target.pos.x + (Math.random() - 0.5) * aimErr * dist * 2,
      1.15 + Math.random() * 0.45,
      target.pos.z + (Math.random() - 0.5) * aimErr * dist * 2,
    );
    effects.tracer(muzzle, aimPoint, 0xff8a5a);
    audio.shot(bot.weapon, true);
    hooks.noise(bot.pos.x, bot.pos.z, 18);
    // A shot lands when the aim error is small against the target's size at this range.
    const hitChance = Math.max(0.12, Math.min(0.45, 0.42 - dist * 0.006 + bot.aimTime * 0.04));
    if (Math.random() > hitChance) {
      // Miss: kick up dust where the round lands, a metre past the target.
      effects.impact(new THREE.Vector3(target.pos.x, 0.1, target.pos.z), new THREE.Vector3(0, 1, 0));
      return;
    }
    const headshot = Math.random() < 0.14;
    const dmg = Math.round((bot.weapon === 'smg' ? 20 : 26) * (headshot ? 2 : 1) * (1 - Math.min(0.4, dist / 120)));
    if (target.kind === 'player') hooks.damagePlayer(dmg, bot.pos, headshot, bot.name);
    else hooks.damageBot(target.ref, dmg, headshot, bot);
  }

  function stepBot(bot, dt, game) {
    if (!bot.alive) {
      bot.deadTimer += dt;
      if (bot.deadTimer > 0.4) bot.mesh.rotation.x = -Math.PI / 2 * Math.min(1, (bot.deadTimer - 0.4) * 3);
      return;
    }
    bot.visionTimer -= dt;
    bot.thinkTimer -= dt;

    // --- Vision: re-scan on a stagger so nine bots do not raycast every frame. ---
    if (bot.visionTimer <= 0) {
      bot.visionTimer = 0.15 + Math.random() * 0.05;
      const seen = visibleEnemies(bot);
      if (seen) {
        if (!bot.target) bot.reactLeft = REACT_MIN + Math.random() * (REACT_MAX - REACT_MIN);
        bot.target = seen;
        bot.lastSeen = { x: seen.pos.x, z: seen.pos.z };
        bot.aimTime = bot.target ? bot.aimTime : 0;
      } else if (bot.target) {
        bot.target = null;
        bot.aimTime = 0;
      }
    }

    // --- Hearing: a loud noise nearby becomes a place to check. ---
    if (game.noise && bot.team === 'defend' && bot.role === 'hold') {
      const d = Math.hypot(game.noise.x - bot.pos.x, game.noise.z - bot.pos.z);
      if (d < 16 && Math.random() < 0.5) {
        bot.investigate = { x: game.noise.x, z: game.noise.z };
        bot.role = 'investigate';
      }
    }

    // --- Bomb logic: plant, guard, defuse. ---
    if (game.bomb.status === 'planted') {
      if (bot.team === 'defend') {
        if (bot.defuseLeft > 0) {
          bot.defuseLeft -= dt;
          bot.moveX = 0; bot.moveZ = 0;
          hooks.onDefuseTick(bot.defuseLeft / DEFUSE_TIME);
          if (bot.defuseLeft <= 0) { hooks.onDefused(bot); return; }
        } else {
          const bd = Math.hypot(game.bomb.x - bot.pos.x, game.bomb.z - bot.pos.z);
          if (bd < 2.4 && !bot.target) {
            bot.defuseLeft = DEFUSE_TIME;
            audio.defuseBeep();
          } else if (!bot.target) {
            // Route once and keep walking it: rebuilding the route every tick would
            // reset the waypoint cursor and the bot would never arrive.
            const dest = world.nearestWaypoint(game.bomb.x, game.bomb.z);
            if (bot.rotateDest !== dest || bot.pathCursor >= bot.path.length) {
              bot.rotateDest = dest;
              setPath(bot, dest);
            }
            bot.role = 'rotate';
          }
        }
      } else if (!bot.target && Math.random() < 0.002) {
        // Attackers drift toward the planted spike to guard it.
        const dest = world.nearestWaypoint(game.bomb.x, game.bomb.z);
        if (bot.rotateDest !== dest || bot.pathCursor >= bot.path.length) {
          bot.rotateDest = dest;
          setPath(bot, dest);
        }
        bot.role = 'guard';
      }
    } else if (bot.hasSpike && bot.team === 'attack') {
      const site = world.sites[bot.site];
      const sd = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (sd < site.half && !bot.target) {
        bot.plantLeft += dt;
        bot.holdStill = true;
        bot.moveX = 0; bot.moveZ = 0;
        if (Math.floor(bot.plantLeft * 2) !== Math.floor((bot.plantLeft - dt) * 2)) audio.plantBeep();
        hooks.onPlantTick(bot.plantLeft / PLANT_TIME);
        if (bot.plantLeft >= PLANT_TIME) {
          bot.hasSpike = false;
          bot.holdStill = false;
          hooks.onPlanted(site, bot);
          return;
        }
      } else {
        bot.plantLeft = Math.max(0, bot.plantLeft - dt * 2);
        bot.holdStill = false;
      }
    } else {
      bot.holdStill = false;
    }

    // --- Idle attackers keep pushing: a squad that stops at a quiet site rotates to
    // the other one instead of waiting out the clock. ---
    if (!bot.target && bot.team === 'attack' && !bot.holdStill && bot.pathCursor >= bot.path.length) {
      bot.idleTime += dt;
      if (bot.idleTime > 8) {
        bot.idleTime = 0;
        bot.site = bot.site === 'A' ? 'B' : 'A';
        setPath(bot, siteWaypoint(bot.site));
      }
    } else if (bot.target || bot.pathCursor < bot.path.length) {
      bot.idleTime = 0;
    }

    // --- Combat: face the target, stop, and shoot once the reaction time has passed. ---
    if (bot.holdStill) {
      bot.moveX = 0;
      bot.moveZ = 0;
    } else if (bot.target) {
      const dx = bot.target.pos.x - bot.pos.x;
      const dz = bot.target.pos.z - bot.pos.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.moveX = 0;
      bot.moveZ = 0;
      bot.running = false;
      if (bot.reactLeft > 0) bot.reactLeft -= dt;
      else shootAt(bot, bot.target, dt);
      moveBot(bot, dt);
    } else if (bot.investigate) {
      // Walk to the noise, look around, then return to the hold spot.
      const dx = bot.investigate.x - bot.pos.x;
      const dz = bot.investigate.z - bot.pos.z;
      if (Math.hypot(dx, dz) < 1.5) {
        bot.investigate = null;
        bot.role = 'hold';
        setPath(bot, bot.holdSpot);
      } else {
        bot.moveX = dx; bot.moveZ = dz;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.running = false;
        moveBot(bot, dt);
      }
    } else if (bot.path.length && bot.pathCursor < bot.path.length) {
      // Follow the waypoint route; stop at the last node and face the hold yaw.
      const wp = world.waypoints[bot.path[bot.pathCursor]];
      const dx = wp[0] - bot.pos.x;
      const dz = wp[1] - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        bot.pathCursor += 1;
        if (bot.pathCursor >= bot.path.length && bot.role === 'hold') {
          bot.yaw += (bot.holdYaw - bot.yaw) * Math.min(1, dt * 4);
          bot.moveX = 0; bot.moveZ = 0;
        }
      } else {
        bot.moveX = dx; bot.moveZ = dz;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.running = bot.role === 'push';
        moveBot(bot, dt);
      }
    } else {
      bot.moveX = 0; bot.moveZ = 0;
      if (bot.role === 'hold') bot.yaw += (bot.holdYaw - bot.yaw) * Math.min(1, dt * 4);
    }

    // --- Stuck watch: a bot that wants to move but makes no progress for two seconds
    // skips the waypoint it cannot reach, instead of leaning on a wall all round. ---
    bot.stuckTimer += dt;
    if (bot.stuckTimer >= 1) {
      bot.stuckTimer = 0;
      const moved = Math.hypot(bot.pos.x - bot.lastX, bot.pos.z - bot.lastZ);
      const wantsMove = Math.hypot(bot.moveX, bot.moveZ) > 0.1;
      if (wantsMove && moved < 0.3) {
        bot.stuckCount += 1;
        if (bot.stuckCount >= 2) {
          bot.stuckCount = 0;
          bot.pathCursor += 1;
        }
      } else {
        bot.stuckCount = 0;
      }
      bot.lastX = bot.pos.x;
      bot.lastZ = bot.pos.z;
    }

    // --- Pose the mesh: position, facing, a walk bob and a crouch when holding an angle. ---
    bot.mesh.position.set(bot.pos.x, 0, bot.pos.z);
    bot.mesh.rotation.y = bot.yaw;
    const moving = Math.hypot(bot.moveX, bot.moveZ) > 0.1;
    if (moving) {
      bot.walkPhase += dt * 9;
      bot.mesh.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.05;
    }
    bot.mesh.scale.y = bot.crouching ? 0.78 : 1;
  }

  function step(dt, game) {
    for (const bot of bots) stepBot(bot, dt, game);
    game.noise = null; // noise lasts one tick: a bot either heard it or it is gone.
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.alive && bot.team === team) n++;
    return n;
  }

  function damage(bot, dmg, headshot) {
    if (!bot.alive) return false;
    if (bot.armorHp > 0) {
      const absorbed = Math.min(bot.armorHp, Math.ceil(dmg / 2));
      bot.armorHp -= absorbed;
      dmg -= absorbed;
    }
    bot.hp -= dmg;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.deadTimer = 0;
      bot.target = null;
      if (bot.hasSpike) {
        bot.hasSpike = false;
        hooks.onSpikeDropped(bot.pos.x, bot.pos.z);
      }
      return true;
    }
    // Being shot at snaps the bot's attention to its attacker.
    bot.reactLeft = Math.min(bot.reactLeft, 0.15);
    return false;
  }

  // Hitboxes for the player's ray: a head sphere and a body box per living bot.
  function hitboxes() {
    const list = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      list.push({ bot, part: 'head', center: new THREE.Vector3(bot.pos.x, 1.58, bot.pos.z), radius: 0.24 });
      list.push({ bot, part: 'body', center: new THREE.Vector3(bot.pos.x, 1.0, bot.pos.z), radius: 0.55, halfH: 0.75 });
    }
    return list;
  }

  return {
    bots, step, resetRound, damage, hitboxes, aliveCount, hasLOS,
    routeTo(bot, x, z) { setPath(bot, world.nearestWaypoint(x, z)); },
    spikeCarrier() { return bots.find((b) => b.hasSpike && b.alive); },
    giveSpike(bot) { for (const b of bots) b.hasSpike = false; if (bot) bot.hasSpike = true; },
  };
}
