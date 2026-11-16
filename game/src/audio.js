// Sound, synthesized with WebAudio: no audio files, no network. A gunshot is filtered
// noise plus a low thump; the rest are short oscillators and noise bursts. Everything is
// created lazily on the first user gesture, so the page never asks for audio it cannot have.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise(dur, freq, gain, type = 'lowpass', when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(id, distant = false) {
      const scale = distant ? 0.35 : 1;
      if (id === 'sniper') { noise(0.22, 900, 0.5 * scale); tone(140, 0.18, 0.5 * scale, 'sine', 55); }
      else if (id === 'shotgun') { noise(0.18, 700, 0.55 * scale); tone(110, 0.15, 0.5 * scale, 'sine', 45); }
      else if (id === 'smg') { noise(0.09, 1400, 0.32 * scale); tone(190, 0.07, 0.25 * scale, 'square', 90); }
      else if (id === 'sidearm') { noise(0.1, 1100, 0.4 * scale); tone(160, 0.09, 0.3 * scale, 'sine', 70); }
      else { noise(0.13, 1000, 0.45 * scale); tone(150, 0.11, 0.35 * scale, 'sine', 60); }
    },
    dryClick() { tone(1800, 0.03, 0.12, 'square'); },
    reload() { tone(900, 0.04, 0.15, 'square'); tone(650, 0.04, 0.15, 'square', 0, 0.35); tone(1100, 0.05, 0.18, 'square', 0, 0.7); },
    hit() { tone(2400, 0.05, 0.2, 'sine'); },
    headshot() { tone(3200, 0.06, 0.22, 'sine'); tone(2400, 0.06, 0.15, 'sine', 0, 0.05); },
    kill() { tone(520, 0.12, 0.2, 'triangle', 780); },
    hurt() { noise(0.12, 400, 0.3); tone(120, 0.12, 0.3, 'sine', 70); },
    explosion() { noise(0.9, 300, 0.8); tone(60, 0.8, 0.7, 'sine', 28); noise(0.4, 1200, 0.3, 'highpass'); },
    plantBeep() { tone(1200, 0.08, 0.18, 'square'); },
    plantDone() { tone(880, 0.15, 0.2, 'sine'); tone(1320, 0.25, 0.2, 'sine', 0, 0.15); },
    defuseBeep() { tone(1600, 0.06, 0.15, 'square'); },
    roundWin() { tone(523, 0.14, 0.22, 'triangle'); tone(659, 0.14, 0.22, 'triangle', 0, 0.14); tone(784, 0.3, 0.25, 'triangle', 0, 0.28); },
    roundLose() { tone(392, 0.16, 0.22, 'triangle'); tone(330, 0.16, 0.22, 'triangle', 0, 0.16); tone(262, 0.35, 0.25, 'triangle', 0, 0.32); },
    buy() { tone(980, 0.06, 0.16, 'square'); tone(1240, 0.08, 0.16, 'square', 0, 0.06); },
    denied() { tone(220, 0.12, 0.2, 'square'); },
    step() { noise(0.05, 500, 0.05); },
  };
}
