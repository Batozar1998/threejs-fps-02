// The spike: one objective both teams play around. The carrier plants it on a site
// (3.5 s, standing still in the zone); once planted it ticks down 40 s to detonation, and a
// defender standing on it for 5 s defuses it. Elimination also ends the round. This module
// owns only the spike's state; main.js owns the round that reads it.
export const SPIKE_TIME = 40;

export function createBomb() {
  const state = {
    status: 'carried', // carried | dropped | planted | exploded | defused
    site: null,
    x: 0, z: 0,
    timer: SPIKE_TIME,
    plantProgress: 0,
    defuseProgress: 0,
  };

  return {
    state,
    reset() {
      state.status = 'carried';
      state.site = null;
      state.timer = SPIKE_TIME;
      state.plantProgress = 0;
      state.defuseProgress = 0;
    },
    drop(x, z) {
      if (state.status !== 'carried') return;
      state.status = 'dropped';
      state.x = x;
      state.z = z;
    },
    pickup() {
      if (state.status !== 'dropped') return false;
      state.status = 'carried';
      return true;
    },
    plant(site) {
      state.status = 'planted';
      state.site = site.label;
      state.x = site.x;
      state.z = site.z;
      state.timer = SPIKE_TIME;
    },
    step(dt) {
      if (state.status === 'planted') state.timer -= dt;
    },
    explode() { state.status = 'exploded'; },
    defuse() { state.status = 'defused'; },
  };
}
