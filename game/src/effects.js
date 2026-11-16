// Transient effects: tracers, impact sparks, muzzle smoke and explosions. One fixed pool
// per effect, reused every round, so the hot loop never allocates. Each effect is a mesh or
// a line whose life ticks down in step(); nothing here touches game state.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 40;
const MAX_RINGS = 4;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < MAX_TRACERS; i++) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 });
    const line = new THREE.Line(tracerGeo.clone(), mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  for (let i = 0; i < MAX_SPARKS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, vel: new THREE.Vector3(), life: 0 });
  }
  let sparkCursor = 0;

  const rings = [];
  for (let i = 0; i < MAX_RINGS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    rings.push({ mesh, life: 0 });
  }
  let ringCursor = 0;

  const boomLight = new THREE.PointLight(0xff7a1e, 0, 30, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  function tracer(from, to, color = 0xffc46b) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }

  function impact(point, normal) {
    for (let i = 0; i < 5; i++) {
      const s = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      s.mesh.position.copy(point);
      s.vel.set(
        normal.x * 2 + (Math.random() - 0.5) * 3,
        normal.y * 2 + Math.random() * 2.5,
        normal.z * 2 + (Math.random() - 0.5) * 3,
      );
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.life = 0.3 + Math.random() * 0.2;
    }
  }

  function explosion(point) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % MAX_RINGS;
    r.mesh.position.set(point.x, 0.15, point.z);
    r.mesh.scale.setScalar(1);
    r.mesh.material.opacity = 0.9;
    r.mesh.visible = true;
    r.life = 0.6;
    boomLight.position.set(point.x, 2.5, point.z);
    boomLight.intensity = 220;
    boomLife = 0.5;
    for (let i = 0; i < 14; i++) {
      const s = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      s.mesh.position.set(point.x, point.y + 0.4, point.z);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      s.vel.set(Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp);
      s.mesh.material.color.setHex(0xff7a1e);
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.life = 0.5 + Math.random() * 0.4;
    }
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.material.opacity = Math.max(0, s.life * 2);
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const r of rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const grow = 1 + (0.6 - r.life) * 22;
      r.mesh.scale.setScalar(grow);
      r.mesh.material.opacity = Math.max(0, r.life / 0.6) * 0.9;
      if (r.life <= 0) r.mesh.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      boomLight.intensity = Math.max(0, boomLife / 0.5) * 220;
    }
  }

  return { tracer, impact, explosion, step };
}
