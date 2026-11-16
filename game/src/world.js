// Ember Yard: an original dusk freight yard, 64 x 48 m, built from boxes and cylinders.
// Two bomb sites (A: the north warehouse, B: the south container stack), three lanes
// (A lane north, Mid through the yard office, B lane south), attacker spawn west, defender
// spawn east. Every solid is a collider for players and bots and a surface a bullet stops on.
// Plain geometry only, no models and no textures: the palette and the low sun do the work.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Extra material tints, all inside the yard's dusk palette: rust, teal paint, olive drab,
// concrete and dark steel. Ground sand comes from the palette's muted tone.
const TINTS = {
  sand: 0x8a6f4d,
  rust: 0x8f4a22,
  rustDark: 0x6e3519,
  teal: 0x2e5f5a,
  olive: 0x5a5a34,
  concrete: 0x7a7168,
  steel: 0x3a3f45,
  dark: 0x241c15,
  hazard: 0xd8a020,
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const [name, hex] of Object.entries(TINTS)) {
    materials[name] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, metalness: 0.08 });
  }
  materials.rust.metalness = 0.35;
  materials.rust.roughness = 0.7;
  materials.steel.metalness = 0.6;
  materials.steel.roughness = 0.45;
  materials.teal.metalness = 0.3;
  materials.teal.roughness = 0.65;

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cyl(rt, rb, h, x, y, z, mat, seg = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: one big sand slab, plus a darker apron under each site.
  box(66, 0.4, 50, 0, -0.2, 0, 'sand', false);
  box(20, 0.06, 16, 19, 0.03, -15, 'concrete', false);
  box(20, 0.06, 16, 19, 0.03, 15, 'concrete', false);

  // Outer walls, 5 m high, with two gated gaps the lanes run through on the west side.
  box(0.6, 5, 50, -32, 2.5, 0, 'concrete');
  box(0.6, 5, 50, 32, 2.5, 0, 'concrete');
  box(66, 5, 0.6, 0, 2.5, -25, 'concrete');
  box(66, 5, 0.6, 0, 2.5, 25, 'concrete');

  // --- Site A: the north warehouse (x 12..28, z -22..-9) ---
  // Warehouse shell: back wall, side walls, roof beams, open front facing mid.
  box(16, 5, 0.6, 20, 2.5, -22, 'steel');
  box(0.6, 5, 13, 28, 2.5, -15.5, 'steel');
  box(14, 0.5, 12, 20, 5.2, -16, 'dark', false);
  box(1.2, 4.4, 1.2, 13, 2.2, -21, 'steel');
  box(1.2, 4.4, 1.2, 27, 2.2, -21, 'steel');
  // Crates and a forklift pallet stack inside A.
  box(2.4, 1.2, 2.4, 16, 0.6, -18, 'rust');
  box(2.4, 1.2, 2.4, 16, 1.8, -18, 'rustDark');
  box(1.6, 0.8, 1.6, 23, 0.4, -13, 'olive');
  box(3.2, 1.0, 1.2, 20, 0.5, -11.5, 'teal');
  box(1.2, 2.2, 1.2, 25.5, 1.1, -19, 'rust');
  // Hazard stripe marking the plant zone floor.
  box(5, 0.08, 5, 20, 0.08, -16.5, 'hazard', false);

  // East-mid container: breaks the 32 m sightline between the two sites, so neither
  // site can be shot from the other one. Wide enough that a diagonal cannot slip past it.
  box(4.0, 2.6, 4.0, 20, 1.3, 0, 'rust');
  box(4.0, 1.3, 2.0, 20, 3.25, 0, 'rustDark');

  // --- Site B: the south container stack (x 12..28, z 9..22) ---
  box(6.2, 2.6, 2.6, 20, 1.3, 21, 'rust');       // ground container, long axis x
  box(6.2, 2.6, 2.6, 20, 3.9, 21, 'teal');       // stacked on top
  box(2.6, 2.6, 6.2, 26.5, 1.3, 15, 'olive');    // standing container
  box(2.6, 2.6, 2.6, 14.5, 1.3, 19.5, 'rustDark');
  box(1.6, 0.8, 1.6, 16, 0.4, 12.5, 'teal');
  box(3.0, 1.0, 1.4, 22, 0.5, 12, 'rust');
  box(5, 0.08, 5, 19, 0.08, 16.5, 'hazard', false);
  // Silo at the back of B.
  cyl(2.2, 2.2, 7, 29, 3.5, 11, 'steel', 16);

  // --- Mid: the yard office and the watchtower ---
  box(6, 3.4, 4, -2, 1.7, -6, 'concrete');       // yard office, north of mid
  box(6.4, 0.3, 4.4, -2, 3.55, -6, 'dark', false);
  box(1.0, 3.4, 3.0, 4.5, 1.7, -6, 'rust');      // office side container
  cyl(1.6, 1.9, 6.5, 2, 3.25, 7, 'steel', 10);   // watchtower legs + cabin
  box(3.4, 2.2, 3.4, 2, 7.6, 7, 'teal');
  box(3.8, 0.25, 3.8, 2, 8.8, 7, 'dark', false);

  // --- Lane cover: crates, pallets and low walls that make the sightlines ---
  // A lane (north)
  box(2.2, 1.1, 1.4, -14, 0.55, -17, 'rust');
  box(2.2, 1.1, 1.4, -6, 0.55, -14, 'olive');
  box(1.4, 1.1, 2.2, 2, 0.55, -18, 'teal');
  box(4.0, 1.0, 1.0, 8, 0.5, -12, 'concrete');
  box(1.2, 1.8, 1.2, -20, 0.9, -10, 'rustDark');
  // B lane (south)
  box(2.2, 1.1, 1.4, -14, 0.55, 17, 'teal');
  box(2.2, 1.1, 1.4, -6, 0.55, 14, 'rust');
  box(1.4, 1.1, 2.2, 2, 0.55, 18, 'olive');
  box(4.0, 1.0, 1.0, 8, 0.5, 12, 'concrete');
  box(1.2, 1.8, 1.2, -20, 0.9, 10, 'rustDark');
  // Mid lane
  box(1.8, 1.0, 1.8, -12, 0.5, 0, 'rust');
  box(1.8, 1.0, 1.8, -12, 1.5, 0, 'rustDark');
  box(3.4, 1.1, 1.2, -6, 0.55, 3.5, 'olive');
  box(2.0, 1.1, 1.2, 8, 0.55, -2, 'teal');
  box(1.2, 2.4, 1.2, 12, 1.2, 3, 'rust');
  // Spawn cover, west and east — kept clear of the lane-entry waypoints.
  box(2.0, 1.2, 3.0, -22, 0.6, -6, 'olive');
  box(2.0, 1.2, 3.0, -22, 0.6, 6, 'rust');
  box(2.0, 1.2, 3.0, 22, 0.6, -6, 'teal');
  box(2.0, 1.2, 3.0, 22, 0.6, 6, 'rustDark');

  // Site marker poles: a tall amber beacon over each site so the map reads at a glance.
  for (const [sx, sz] of [[20, -16.5], [19, 16.5]]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0xff9a2e, emissive: 0xcc6a00, emissiveIntensity: 0.9, roughness: 0.5 }),
    );
    pole.position.set(sx, 3, sz);
    group.add(pole);
    const lamp = new THREE.PointLight(0xff9a2e, 12, 14, 1.8);
    lamp.position.set(sx, 6.2, sz);
    scene.add(lamp);
  }

  // Light: a low amber sun from the west, a cool violet fill from the east, dusk sky.
  scene.background = new THREE.Color(0x4a3550);
  scene.fog = new THREE.Fog(0x4a3550, 30, 95);
  const sky = new THREE.HemisphereLight(0x9a8bc8, 0x4a3423, 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffb36b, 3.4);
  sun.position.set(-30, 18, -12);
  sun.target.position.set(8, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x7a86c8, 0.9);
  fill.position.set(24, 12, 18);
  scene.add(fill);

  // --- Navigation: waypoint graph the bots walk. Nodes are open ground; edges are walks
  // a bot can take without crossing a wall. Coordinates are (x, z) on the yard floor.
  // Edges are computed, not hand-listed: two nodes link when they are close and the
  // straight walk between them stays clear of every collider, so a moved crate can
  // never strand a bot on a route through a wall.
  const WAYPOINTS = [
    [-28, 0], [-24, -6], [-24, 6], [-20, -12], [-20, 12], [-16, 0], [-11, -18], [-11, 18],
    [-10, -8], [-10, 8], [-6, -11], [-6, 11], [-6, 0], [-2, -2], [-2, 6], [2, -11], [2, 11],
    [2, 0], [6, -6], [6, 6], [8, -14], [8, 14], [10, 0], [12, -8], [12, 8],
    [13, -15], [12, 17], [16, -11], [16, 11], [20, -16], [20, 16], [24, -13], [24, 13],
    [24, -19], [24, 19], [28, 0], [26, -6], [26, 6], [14, -4], [14, 4],
  ];
  const LINK_DIST = 12.5;
  const adjacency = WAYPOINTS.map(() => []);
  function segmentClear(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    for (let s = 0; s <= steps; s++) {
      const x = ax + (dx * s) / steps;
      const z = az + (dz * s) / steps;
      for (const c of colliders) {
        if (x > c.min.x - 0.35 && x < c.max.x + 0.35 && 0.9 > c.min.y && 0.9 < c.max.y &&
            z > c.min.z - 0.35 && z < c.max.z + 0.35) return false;
      }
    }
    return true;
  }
  for (let i = 0; i < WAYPOINTS.length; i++) {
    for (let j = i + 1; j < WAYPOINTS.length; j++) {
      const dx = WAYPOINTS[j][0] - WAYPOINTS[i][0];
      const dz = WAYPOINTS[j][1] - WAYPOINTS[i][1];
      if (Math.hypot(dx, dz) > LINK_DIST) continue;
      if (!segmentClear(WAYPOINTS[i][0], WAYPOINTS[i][1], WAYPOINTS[j][0], WAYPOINTS[j][1])) continue;
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
  }

  function nearestWaypoint(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const dx = WAYPOINTS[i][0] - x;
      const dz = WAYPOINTS[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Breadth-first route between waypoints; returns an array of waypoint indices.
  function route(from, to) {
    if (from === to) return [to];
    const prev = new Array(WAYPOINTS.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) { node = prev[node]; path.unshift(node); }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  return {
    colliders,
    shootables,
    group,
    waypoints: WAYPOINTS,
    adjacency,
    nearestWaypoint,
    route,
    bounds: { minX: -31, maxX: 31, minZ: -24, maxZ: 24 },
    sites: {
      A: { x: 20, z: -16.5, half: 4.5, label: 'A' },
      B: { x: 19, z: 16.5, half: 4.5, label: 'B' },
    },
    spawns: {
      attack: [[-28, -3], [-28, 0], [-28, 3], [-26, -6], [-26, 6]],
      defend: [[28, -3], [28, 0], [28, 3], [26, -6], [26, 6]],
    },
  };
}
