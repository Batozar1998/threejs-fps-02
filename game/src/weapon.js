// The armoury: five guns and a grenade, each with its own numbers. Spread punishes moving
// and firing fast; recoil kicks the view model and the aim; damage falls off with range and
// doubles on a headshot. The weapon owns its magazine and view model; main.js owns the ray.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// name, price, damage (close), headshot multiplier, range falloff start/end, mag, reserve,
// fire gap (s), auto?, reload (s), spread still/moving, recoil, move speed multiplier.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', price: 0, damage: 34, headMult: 2.0, falloff: [12, 40],
    mag: 12, reserve: 36, gap: 0.16, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03,
    recoil: 0.014, speed: 1.0, tracer: 0xffd27a,
  },
  smg: {
    id: 'smg', name: 'Jackal-9 SMG', price: 1200, damage: 26, headMult: 2.0, falloff: [10, 30],
    mag: 28, reserve: 84, gap: 0.075, auto: true, reload: 1.7, spreadStill: 0.008, spreadMove: 0.042,
    recoil: 0.011, speed: 0.98, tracer: 0xffd27a,
  },
  rifle: {
    id: 'rifle', name: 'Vandal-7 Rifle', price: 2700, damage: 38, headMult: 2.0, falloff: [16, 55],
    mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028,
    recoil: 0.016, speed: 0.94, tracer: 0xffc46b,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', price: 1100, damage: 13, headMult: 1.6, falloff: [6, 18],
    mag: 6, reserve: 24, gap: 0.8, auto: false, reload: 2.4, spreadStill: 0.05, spreadMove: 0.07,
    recoil: 0.05, speed: 0.96, pellets: 8, tracer: 0xffb36b,
  },
  sniper: {
    id: 'sniper', name: 'Longshot-50', price: 4500, damage: 105, headMult: 2.5, falloff: [30, 90],
    mag: 5, reserve: 15, gap: 1.1, auto: false, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.05,
    recoil: 0.09, speed: 0.9, tracer: 0xffe9a8,
  },
};

export const GRENADE = { id: 'grenade', name: 'Spark Frag', price: 300, damage: 90, radius: 6.5 };

const MUZZLE_TIME = 0.06;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2118), roughness: 0.6, metalness: 0.4 });

  // One view model rebuilt per weapon: a receiver, barrel, stock and sight sized to the gun.
  const model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    id: 'sidearm', mag: 12, reserve: 36, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
    grenades: 0, ads: 0, equipped: 'sidearm',
  };

  function buildModel(def) {
    while (model.children.length) model.remove(model.children[0]);
    const len = def.id === 'sniper' ? 0.62 : def.id === 'shotgun' ? 0.5 : def.id === 'smg' ? 0.34 : 0.42;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len * 0.9), dark);
    barrel.position.set(0, 0.025, -len * 0.85);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, len / 2 + 0.06);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), dark);
    sight.position.set(0, 0.075, -len * 0.2);
    model.add(receiver, barrel, stock, sight);
    if (def.id === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, 0);
      model.add(scope);
    }
    if (def.id === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.22), grip);
      pump.position.set(0, -0.03, -len * 0.55);
      model.add(pump);
    }
  }
  buildModel(WEAPONS.sidearm);

  function equip(id) {
    const def = WEAPONS[id];
    if (!def || state.reloadLeft > 0) return false;
    state.id = id;
    state.equipped = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    buildModel(def);
    return true;
  }

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.ads += ((aiming ? 1 : 0) - state.ads) * Math.min(1, dt * 10);
    model.position.z = -0.42 + state.kick + state.ads * 0.1;
    model.position.x = 0.24 - state.ads * 0.24;
    model.position.y = -0.2 + state.ads * 0.045;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 6 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = WEAPONS[state.id];
      model.rotation.x = -0.55 * Math.sin(Math.PI * (1 - state.reloadLeft / def.reload));
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    def() { return WEAPONS[state.id]; },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() {
      const def = WEAPONS[state.id];
      state.cooldown = def.gap;
      state.flash = MUZZLE_TIME;
      state.kick = def.recoil * 3.2;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed, moving) {
      const def = WEAPONS[state.id];
      const base = def.spreadStill + (moving ? def.spreadMove * Math.min(1, speed / 5.2) : 0);
      return base * (1 - state.ads * 0.55);
    },
    refill() {
      const def = WEAPONS[state.id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
