// Every sound in FX Rush is synthesised here with Web Audio: no sample files, nothing to license. Hits are
// layered (a click for the contact, a body thump, a crunch, and for crits a bright metallic ring) and fire on
// the same frame the damage lands. A per-sound voice limit keeps a 30-kill explosion chain loud, not clipped.
// The music is a small step sequencer: one loop per scene and a harder one for bosses.

let ac = null, master, sfxBus, musicBus, comp, noiseBuf, delay, delayGain;
const settings = { master: 0.8, sfx: 0.9, music: 0.45, muted: false };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("fxrush.audio") ?? "{}"));
} catch {}
const save = () => {
  try {
    localStorage.setItem("fxrush.audio", JSON.stringify(settings));
  } catch {}
};

export function initAudio() {
  if (ac) {
    if (ac.state === "suspended") ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC({ latencyHint: "interactive" });
  master = ac.createGain();
  comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.18;
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  delay = ac.createDelay(1);
  delay.delayTime.value = 0.36;
  const fb = ac.createGain();
  fb.gain.value = 0.32;
  delayGain = ac.createGain();
  delayGain.gain.value = 0.22;
  delay.connect(fb).connect(delay);
  delay.connect(delayGain).connect(musicBus);
  sfxBus.connect(comp);
  musicBus.connect(comp);
  comp.connect(master).connect(ac.destination);
  const n = ac.sampleRate;
  noiseBuf = ac.createBuffer(1, n, n);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
}
export function applyVolumes() {
  if (!ac) return;
  master.gain.value = settings.muted ? 0 : settings.master;
  sfxBus.gain.value = settings.sfx;
  musicBus.gain.value = settings.music * 0.55;
}
export const audioSettings = settings;
export function setVolume(kind, v) {
  settings[kind] = Math.max(0, Math.min(1, v));
  applyVolumes();
  save();
}
export function toggleMute() {
  settings.muted = !settings.muted;
  applyVolumes();
  save();
  return settings.muted;
}
export const audioTime = () => (ac ? ac.currentTime : 0);
export function suspendAudio(on) {
  if (!ac) return;
  if (on && ac.state === "running") ac.suspend();
  if (!on && ac.state === "suspended") ac.resume();
}

// ---- building blocks
function env(g, t, a, peak, d, sustain = 0) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
}
function osc(type, f0, f1, t, dur, peak, dest, attack = 0.003) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, attack, peak, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return o;
}
function noise(t, dur, peak, dest, { type = "bandpass", f0 = 2000, f1 = f0, q = 1, attack = 0.002, rate = 1 } = {}) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  s.playbackRate.value = rate;
  s.loop = true;
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  f.Q.value = q;
  env(g, t, attack, peak, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.8);
  s.stop(t + attack + dur + 0.05);
  return s;
}
let shaperCurve = null;
function crunch(dest, amount = 18) {
  const ws = ac.createWaveShaper();
  if (!shaperCurve) {
    shaperCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shaperCurve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
  }
  ws.curve = shaperCurve;
  ws.connect(dest);
  return ws;
}
function bus(vol, pan = 0) {
  const g = ac.createGain();
  g.gain.value = vol;
  if (pan && ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(sfxBus);
  } else g.connect(sfxBus);
  return g;
}

// ---- voice limits: how many of each can sound at once, and how close together
const LIMIT = {
  swing: [4, 0.03], hit: [6, 0.018], crit: [3, 0.04], heavy: [3, 0.05], kill: [5, 0.025], explode: [4, 0.05], bigboom: [2, 0.15],
  zap: [4, 0.04], thunder: [2, 0.12], ice: [4, 0.04], shatter: [3, 0.05], fire: [3, 0.06], magic: [4, 0.04], missile: [4, 0.04],
  xp: [6, 0.022], coin: [4, 0.03], heal: [2, 0.1], levelup: [1, 0.3], card: [2, 0.05], select: [1, 0.1], hurt: [2, 0.12], warn: [2, 0.25],
  roar: [1, 0.6], portal: [3, 0.1], shield: [2, 0.1], vortex: [2, 0.2], rush: [1, 0.3], jump: [2, 0.08], land: [2, 0.08],
  combo: [2, 0.1], shoot: [4, 0.04], ui: [2, 0.04], step: [2, 0.12], spawn: [3, 0.08], stage: [1, 0.5], victory: [1, 1], defeat: [1, 1],
  chest: [1, 0.3], boom3: [2, 0.2], whoosh: [3, 0.05], laser: [3, 0.06], poison: [3, 0.08], earth: [3, 0.07], holy: [3, 0.08],
};
const voices = {}, lastAt = {};
function gate(name, dur) {
  if (!ac || settings.muted) return false;
  const [max, gap] = LIMIT[name] ?? [4, 0.03], now = ac.currentTime;
  if ((voices[name] ?? 0) >= max || now - (lastAt[name] ?? -1) < gap) return false;
  voices[name] = (voices[name] ?? 0) + 1;
  lastAt[name] = now;
  setTimeout(() => (voices[name] = Math.max(0, (voices[name] ?? 1) - 1)), dur * 1000 + 30);
  return true;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// ---- the sounds. `w` is weight 0..1+ (how heavy the blow is), `pan` -1..1 from screen position.
const SOUNDS = {
  swing(t, { w = 0.5, pan = 0 } = {}) {
    const o = bus(0.5 + w * 0.3, pan);
    noise(t, 0.07 + w * 0.06, 0.55, o, { type: "bandpass", f0: 3200 + w * 600, f1: 700, q: 1.4, attack: 0.012 });
    noise(t + 0.01, 0.05, 0.25, o, { type: "highpass", f0: 5000, f1: 3000, q: 0.7, attack: 0.01 });
    return 0.2;
  },
  hit(t, { w = 0.5, pan = 0, pitch = 1 } = {}) {
    const o = bus(0.75, pan), c = crunch(o, 14);
    noise(t, 0.025, 0.9, o, { type: "highpass", f0: 2600 * pitch, q: 0.8, attack: 0.001 });
    osc("sine", 190 * pitch, 55, t, 0.09 + w * 0.06, 0.9, o, 0.001);
    osc("square", 110 * pitch, 45, t, 0.05 + w * 0.04, 0.22, c, 0.001);
    noise(t + 0.004, 0.06 + w * 0.05, 0.4, o, { type: "lowpass", f0: 1400, f1: 300, q: 0.9 });
    return 0.2;
  },
  crit(t, { pan = 0 } = {}) {
    const o = bus(0.8, pan), c = crunch(o, 22);
    noise(t, 0.03, 1, o, { type: "highpass", f0: 3500, q: 0.7, attack: 0.001 });
    osc("sine", 240, 50, t, 0.16, 1, o, 0.001);
    osc("square", 140, 40, t, 0.09, 0.3, c, 0.001);
    osc("sine", 1870, 1820, t + 0.005, 0.32, 0.18, o, 0.002);
    osc("sine", 2493, 2480, t + 0.005, 0.26, 0.12, o, 0.002);
    noise(t + 0.01, 0.18, 0.35, o, { type: "bandpass", f0: 6500, f1: 4000, q: 2 });
    return 0.35;
  },
  heavy(t, { pan = 0 } = {}) {
    const o = bus(0.9, pan), c = crunch(o, 20);
    noise(t, 0.035, 1, o, { type: "highpass", f0: 1800, q: 0.7, attack: 0.001 });
    osc("sine", 150, 38, t, 0.32, 1, o, 0.001);
    osc("sawtooth", 80, 30, t, 0.18, 0.35, c, 0.001);
    noise(t + 0.01, 0.4, 0.5, o, { type: "lowpass", f0: 900, f1: 120, q: 1 });
    return 0.45;
  },
  kill(t, { pan = 0, pitch = 1 } = {}) {
    const o = bus(0.45, pan);
    osc("triangle", 520 * pitch, 140 * pitch, t, 0.09, 0.5, o);
    noise(t, 0.12, 0.35, o, { type: "bandpass", f0: 1600, f1: 500, q: 1.2 });
    return 0.15;
  },
  explode(t, { w = 0.6, pan = 0 } = {}) {
    const o = bus(0.85, pan), c = crunch(o, 30);
    noise(t, 0.02, 1, o, { type: "highpass", f0: 1500, attack: 0.001 });
    noise(t, 0.5 + w * 0.5, 0.95, c, { type: "lowpass", f0: 2400, f1: 140, q: 0.7, attack: 0.004 });
    osc("sine", 95, 28, t, 0.45 + w * 0.3, 1, o, 0.002);
    for (let i = 0; i < 5; i++) noise(t + 0.06 + Math.random() * 0.35, 0.03, 0.25, o, { type: "highpass", f0: 3000, attack: 0.001 });
    return 1;
  },
  bigboom(t, { pan = 0 } = {}) {
    const o = bus(1, pan), c = crunch(o, 40);
    noise(t, 0.03, 1, o, { type: "highpass", f0: 900, attack: 0.001 });
    noise(t, 1.6, 1, c, { type: "lowpass", f0: 1800, f1: 60, q: 0.8, attack: 0.005 });
    osc("sine", 70, 22, t, 1.3, 1, o, 0.003);
    osc("sawtooth", 50, 25, t, 0.7, 0.3, c, 0.003);
    for (let i = 0; i < 10; i++) noise(t + 0.1 + Math.random() * 1, 0.04, 0.22, o, { type: "highpass", f0: 2500, attack: 0.001 });
    return 1.8;
  },
  zap(t, { pan = 0 } = {}) {
    const o = bus(0.4, pan), c = crunch(o, 12);
    const s = ac.createOscillator(), g = ac.createGain();
    s.type = "sawtooth";
    for (let i = 0; i < 9; i++) s.frequency.setValueAtTime(rnd(300, 2400), t + i * 0.022);
    env(g, t, 0.002, 0.5, 0.2);
    s.connect(g).connect(c);
    s.start(t);
    s.stop(t + 0.25);
    noise(t, 0.18, 0.6, o, { type: "highpass", f0: 4000, f1: 2500, q: 0.8 });
    return 0.25;
  },
  thunder(t, { pan = 0 } = {}) {
    const o = bus(0.95, pan), c = crunch(o, 25);
    noise(t, 0.06, 1, o, { type: "highpass", f0: 2000, attack: 0.001 });
    noise(t + 0.02, 0.12, 0.9, c, { type: "bandpass", f0: 3000, f1: 600, q: 0.6 });
    noise(t + 0.05, 1.4, 0.7, o, { type: "lowpass", f0: 600, f1: 60, q: 1 });
    osc("sine", 60, 30, t, 0.8, 0.7, o);
    return 1.5;
  },
  ice(t, { pan = 0 } = {}) {
    const o = bus(0.38, pan);
    for (let i = 0; i < 4; i++) osc("sine", rnd(2200, 4200), rnd(2000, 4000), t + i * 0.025, 0.18 + Math.random() * 0.2, 0.25, o, 0.001);
    noise(t, 0.3, 0.35, o, { type: "highpass", f0: 6000, f1: 9000, q: 0.5, attack: 0.01 });
    return 0.5;
  },
  shatter(t, { pan = 0 } = {}) {
    const o = bus(0.6, pan);
    noise(t, 0.05, 1, o, { type: "highpass", f0: 3000, attack: 0.001 });
    for (let i = 0; i < 7; i++) {
      const tt = t + Math.random() * 0.15;
      osc("triangle", rnd(1800, 5200), rnd(1500, 4000), tt, 0.08 + Math.random() * 0.15, 0.22, o, 0.001);
    }
    osc("sine", 160, 60, t, 0.15, 0.6, o);
    return 0.4;
  },
  fire(t, { pan = 0, w = 0.5 } = {}) {
    const o = bus(0.55, pan);
    noise(t, 0.35 + w * 0.3, 0.7, o, { type: "lowpass", f0: 600, f1: 2200, q: 0.8, attack: 0.04 });
    for (let i = 0; i < 6; i++) noise(t + Math.random() * 0.4, 0.02, 0.3, o, { type: "highpass", f0: 2500, attack: 0.001 });
    return 0.7;
  },
  magic(t, { pan = 0, pitch = 1 } = {}) {
    const o = bus(0.3, pan);
    [0, 4, 7, 12].forEach((s, i) => osc("sine", 660 * pitch * 2 ** (s / 12), 660 * pitch * 2 ** (s / 12), t + i * 0.03, 0.18, 0.35, o, 0.004));
    noise(t, 0.25, 0.25, o, { type: "bandpass", f0: 5000, f1: 8000, q: 3 });
    return 0.35;
  },
  missile(t, { pan = 0 } = {}) {
    const o = bus(0.28, pan);
    osc("square", 900, 300, t, 0.12, 0.3, o);
    noise(t, 0.12, 0.3, o, { type: "bandpass", f0: 3000, f1: 1200, q: 2 });
    return 0.15;
  },
  laser(t, { pan = 0 } = {}) {
    const o = bus(0.3, pan);
    osc("sawtooth", 1600, 200, t, 0.18, 0.4, o);
    osc("square", 800, 120, t, 0.16, 0.2, o);
    return 0.2;
  },
  shoot(t, { pan = 0 } = {}) {
    const o = bus(0.45, pan), c = crunch(o, 20);
    noise(t, 0.08, 1, c, { type: "lowpass", f0: 5000, f1: 600, q: 0.8, attack: 0.001 });
    osc("sine", 300, 60, t, 0.07, 0.6, o, 0.001);
    return 0.12;
  },
  poison(t, { pan = 0 } = {}) {
    const o = bus(0.35, pan);
    for (let i = 0; i < 5; i++) osc("sine", rnd(180, 420), rnd(500, 900), t + i * 0.05, 0.08, 0.3, o, 0.01);
    noise(t, 0.3, 0.25, o, { type: "bandpass", f0: 900, f1: 500, q: 4 });
    return 0.4;
  },
  earth(t, { pan = 0 } = {}) {
    const o = bus(0.7, pan), c = crunch(o, 15);
    noise(t, 0.4, 0.9, c, { type: "lowpass", f0: 700, f1: 90, q: 1 });
    osc("sine", 90, 35, t, 0.35, 0.8, o);
    for (let i = 0; i < 6; i++) noise(t + Math.random() * 0.3, 0.03, 0.3, o, { type: "bandpass", f0: 1500, q: 2 });
    return 0.5;
  },
  holy(t, { pan = 0 } = {}) {
    const o = bus(0.38, pan);
    [0, 7, 12, 16, 19].forEach((s, i) => osc("triangle", 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), t + i * 0.02, 0.5, 0.18, o, 0.01));
    noise(t, 0.4, 0.3, o, { type: "highpass", f0: 7000, q: 0.5, attack: 0.05 });
    return 0.6;
  },
  xp(t, { pitch = 1 } = {}) {
    const o = bus(0.22);
    osc("square", 1046 * pitch, 1568 * pitch, t, 0.06, 0.35, o, 0.001);
    return 0.08;
  },
  coin(t) {
    const o = bus(0.25);
    osc("square", 1318, 1318, t, 0.05, 0.3, o, 0.001);
    osc("square", 1976, 1976, t + 0.05, 0.16, 0.3, o, 0.001);
    return 0.25;
  },
  heal(t) {
    const o = bus(0.3);
    [0, 4, 7, 11, 14].forEach((s, i) => osc("sine", 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), t + i * 0.05, 0.3, 0.3, o, 0.01));
    return 0.6;
  },
  levelup(t) {
    const o = bus(0.4);
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => {
      osc("triangle", 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), t + i * 0.055, 0.35, 0.4, o, 0.004);
      osc("square", 784 * 2 ** (s / 12), 784 * 2 ** (s / 12), t + i * 0.055, 0.12, 0.08, o, 0.002);
    });
    noise(t + 0.3, 0.5, 0.3, o, { type: "highpass", f0: 6000, q: 0.5, attack: 0.05 });
    return 1;
  },
  card(t) {
    const o = bus(0.25);
    osc("square", 660, 990, t, 0.05, 0.3, o, 0.001);
    return 0.08;
  },
  select(t) {
    const o = bus(0.4);
    osc("square", 523, 523, t, 0.06, 0.3, o, 0.001);
    osc("square", 784, 784, t + 0.06, 0.06, 0.3, o, 0.001);
    osc("square", 1046, 1046, t + 0.12, 0.22, 0.3, o, 0.001);
    return 0.4;
  },
  hurt(t) {
    const o = bus(0.7), c = crunch(o, 30);
    osc("sawtooth", 220, 70, t, 0.22, 0.6, c, 0.001);
    noise(t, 0.15, 0.6, o, { type: "lowpass", f0: 2000, f1: 300 });
    return 0.3;
  },
  warn(t) {
    const o = bus(0.3);
    osc("square", 880, 880, t, 0.07, 0.35, o, 0.001);
    osc("square", 660, 660, t + 0.1, 0.1, 0.35, o, 0.001);
    return 0.25;
  },
  roar(t) {
    const o = bus(0.9), c = crunch(o, 40);
    const s = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    s.type = "sawtooth";
    s.frequency.setValueAtTime(90, t);
    s.frequency.exponentialRampToValueAtTime(48, t + 1.3);
    lfo.frequency.value = 18;
    lg.gain.value = 14;
    lfo.connect(lg).connect(s.frequency);
    env(g, t, 0.08, 0.7, 1.3);
    s.connect(g).connect(c);
    s.start(t);
    lfo.start(t);
    s.stop(t + 1.5);
    lfo.stop(t + 1.5);
    noise(t, 1.2, 0.6, o, { type: "lowpass", f0: 900, f1: 200, q: 3, attack: 0.08 });
    return 1.5;
  },
  portal(t) {
    const o = bus(0.3);
    noise(t, 0.6, 0.5, o, { type: "bandpass", f0: 400, f1: 2400, q: 6, attack: 0.15 });
    osc("sine", 200, 600, t, 0.5, 0.25, o, 0.1);
    return 0.7;
  },
  spawn(t) {
    const o = bus(0.25);
    noise(t, 0.3, 0.5, o, { type: "bandpass", f0: 2000, f1: 300, q: 4, attack: 0.05 });
    return 0.35;
  },
  shield(t) {
    const o = bus(0.5);
    osc("triangle", 1200, 1150, t, 0.4, 0.4, o, 0.001);
    osc("sine", 300, 280, t, 0.4, 0.4, o, 0.01);
    noise(t, 0.05, 0.6, o, { type: "highpass", f0: 4000 });
    return 0.45;
  },
  vortex(t) {
    const o = bus(0.6);
    const s = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    s.type = "sawtooth";
    s.frequency.setValueAtTime(220, t);
    s.frequency.exponentialRampToValueAtTime(40, t + 1.2);
    f.type = "lowpass";
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(150, t + 1.2);
    f.Q.value = 9;
    env(g, t, 0.1, 0.5, 1.2);
    s.connect(f).connect(g).connect(o);
    s.start(t);
    s.stop(t + 1.4);
    return 1.4;
  },
  rush(t) {
    const o = bus(0.7);
    noise(t, 0.45, 0.7, o, { type: "bandpass", f0: 300, f1: 6000, q: 2, attack: 0.3 });
    osc("sawtooth", 110, 880, t, 0.45, 0.25, o, 0.3);
    return 0.8;
  },
  whoosh(t, { pan = 0 } = {}) {
    const o = bus(0.4, pan);
    noise(t, 0.25, 0.6, o, { type: "bandpass", f0: 600, f1: 2500, q: 1.5, attack: 0.08 });
    return 0.3;
  },
  jump(t) {
    const o = bus(0.25);
    osc("square", 300, 600, t, 0.08, 0.2, o, 0.002);
    noise(t, 0.08, 0.2, o, { type: "highpass", f0: 3000 });
    return 0.1;
  },
  land(t) {
    const o = bus(0.4);
    osc("sine", 140, 50, t, 0.1, 0.6, o, 0.001);
    noise(t, 0.12, 0.3, o, { type: "lowpass", f0: 900, f1: 200 });
    return 0.15;
  },
  combo(t, { pitch = 1 } = {}) {
    const o = bus(0.35);
    [0, 7, 12].forEach((s, i) => osc("square", 523 * pitch * 2 ** (s / 12), 523 * pitch * 2 ** (s / 12), t + i * 0.045, 0.12, 0.25, o, 0.001));
    return 0.3;
  },
  ui(t) {
    const o = bus(0.18);
    osc("square", 1200, 1200, t, 0.02, 0.25, o, 0.001);
    return 0.04;
  },
  chest(t) {
    const o = bus(0.4);
    noise(t, 0.12, 0.5, o, { type: "bandpass", f0: 900, q: 3 });
    [0, 4, 7, 12, 16].forEach((s, i) => osc("triangle", 784 * 2 ** (s / 12), 784 * 2 ** (s / 12), t + 0.15 + i * 0.05, 0.3, 0.3, o, 0.004));
    return 0.6;
  },
  stage(t) {
    const o = bus(0.45);
    [0, 3, 7, 10, 12, 15].forEach((s, i) => osc("sawtooth", 220 * 2 ** (s / 12), 220 * 2 ** (s / 12), t + i * 0.07, 0.4, 0.18, o, 0.01));
    return 0.9;
  },
  victory(t) {
    const o = bus(0.45);
    const seq = [0, 4, 7, 12, 7, 12, 16, 19, 24];
    seq.forEach((s, i) => osc("square", 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), t + i * 0.11, 0.25, 0.22, o, 0.004));
    osc("triangle", 196, 196, t + 0.99, 1.2, 0.4, o, 0.02);
    return 2.2;
  },
  defeat(t) {
    const o = bus(0.45);
    [12, 10, 7, 3, 0].forEach((s, i) => osc("triangle", 220 * 2 ** (s / 12), 220 * 2 ** (s / 12), t + i * 0.16, 0.4, 0.3, o, 0.01));
    return 1.4;
  },
};

/** Play a named sound now (or `delay` seconds from now). */
export function sfx(name, opts = {}, delaySec = 0) {
  if (!ac || ac.state !== "running") return;
  const f = SOUNDS[name];
  if (!f) return;
  if (!gate(name, 0.4)) return;
  try {
    f(ac.currentTime + 0.002 + delaySec, opts);
  } catch (e) {
    console.warn("sfx", name, e);
  }
}

// ---- music: a tiny step sequencer
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const SONGS = {
  // [bpm, root midi, scale steps, bass pattern (scale degrees, -1 rest), arp pattern, drums: kick, snare, hat (16 steps)]
  ember: { bpm: 126, root: 38, scale: [0, 2, 3, 5, 7, 8, 10], bass: [0, 0, -1, 0, 0, -1, 3, -1, 0, 0, -1, 0, 5, -1, 4, -1], prog: [0, 5, 3, 4], arp: [0, 2, 4, 7, 4, 2, 0, 2], lead: "square", kick: "x...x...x...x..x", snare: "....x.......x...", hat: "..x...x...x...xx", pad: 0.05 },
  frost: { bpm: 112, root: 45, scale: [0, 2, 3, 5, 7, 9, 10], bass: [0, -1, -1, 0, -1, -1, 4, -1, 0, -1, -1, 0, 3, -1, -1, -1], prog: [0, 3, 5, 4], arp: [0, 4, 7, 9, 11, 9, 7, 4], lead: "triangle", kick: "x.......x.....x.", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", pad: 0.07 },
  void: { bpm: 134, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], bass: [0, 0, 7, 0, 0, 7, 0, 5, 0, 0, 7, 0, 3, 3, 5, 4], prog: [0, 1, 5, 4], arp: [0, 7, 3, 7, 10, 7, 3, 7], lead: "sawtooth", kick: "x...x...x...x...", snare: "....x.......x..x", hat: "xxx.xxx.xxx.xxxx", pad: 0.05 },
  boss: { bpm: 150, root: 38, scale: [0, 1, 3, 5, 7, 8, 11], bass: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 5, 5, 4, 4], prog: [0, 0, 5, 6], arp: [0, 4, 7, 4, 0, 4, 7, 11], lead: "square", kick: "x.x.x...x.x.x.x.", snare: "....x.......x.xx", hat: "xxxxxxxxxxxxxxxx", pad: 0.04 },
  title: { bpm: 96, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], bass: [0, -1, -1, -1, -1, -1, -1, -1, 5, -1, -1, -1, 3, -1, -1, -1], prog: [0, 5, 3, 4], arp: [0, 2, 4, 7, 9, 7, 4, 2], lead: "triangle", kick: "x...............", snare: "................", hat: "....x.......x...", pad: 0.08 },
};
let song = null, nextStep = 0, step = 0, timer = 0, songGain = null, intensity = 1;
function deg(s, d, oct = 0) {
  const L = s.scale.length, o = Math.floor(d / L), i = ((d % L) + L) % L;
  return s.root + s.scale[i] + 12 * (o + oct);
}
function schedule() {
  if (!ac || !song) return;
  const s = SONGS[song], spb = 60 / s.bpm / 4;
  while (nextStep < ac.currentTime + 0.14) {
    const t = nextStep, i = step % 16, bar = Math.floor(step / 16), chord = s.prog[bar % s.prog.length];
    const out = songGain;
    if (s.kick[i] === "x") {
      osc("sine", 150, 42, t, 0.22, 0.85, out, 0.001);
      noise(t, 0.015, 0.25, out, { type: "highpass", f0: 3000, attack: 0.001 });
    }
    if (s.snare[i] === "x") {
      noise(t, 0.14, 0.42, out, { type: "bandpass", f0: 1900, q: 0.8, attack: 0.001 });
      osc("triangle", 210, 160, t, 0.08, 0.3, out, 0.001);
    }
    if (s.hat[i] === "x" && intensity > 0.3) noise(t, i % 4 === 2 ? 0.07 : 0.025, 0.14, out, { type: "highpass", f0: 8000, attack: 0.001 });
    const b = s.bass[i];
    if (b >= 0) {
      const f = NOTE(deg(s, b + chord, -1));
      const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = f;
      fl.type = "lowpass";
      fl.frequency.setValueAtTime(900, t);
      fl.frequency.exponentialRampToValueAtTime(180, t + spb * 1.8);
      fl.Q.value = 4;
      env(g, t, 0.004, 0.42, spb * 1.8);
      o.connect(fl).connect(g).connect(out);
      o.start(t);
      o.stop(t + spb * 2);
    }
    if (i % 2 === 0 && intensity > 0.5) {
      const a = s.arp[(i / 2) % s.arp.length];
      const f = NOTE(deg(s, a + chord, 1));
      const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
      o.type = s.lead;
      o.frequency.value = f;
      fl.type = "lowpass";
      fl.frequency.value = s.lead === "sawtooth" ? 2400 : 3200;
      env(g, t, 0.003, 0.09, spb * 1.6);
      o.connect(fl).connect(g);
      g.connect(out);
      g.connect(delay);
      o.start(t);
      o.stop(t + spb * 2);
    }
    if (i === 0) {
      // a soft pad on each bar
      for (const d of [0, 2, 4]) {
        const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
        o.type = "sawtooth";
        o.frequency.value = NOTE(deg(s, d + chord, 0));
        o.detune.value = rnd(-8, 8);
        fl.type = "lowpass";
        fl.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(s.pad, t + spb * 4);
        g.gain.linearRampToValueAtTime(0.0001, t + spb * 16);
        o.connect(fl).connect(g).connect(out);
        o.start(t);
        o.stop(t + spb * 16 + 0.05);
      }
    }
    nextStep += spb;
    step++;
  }
}
export function playMusic(name) {
  if (!ac || song === name) return;
  stopMusic(0.6);
  song = name;
  songGain = ac.createGain();
  songGain.gain.setValueAtTime(0.0001, ac.currentTime);
  songGain.gain.linearRampToValueAtTime(0.5, ac.currentTime + 1.2);
  songGain.connect(musicBus);
  step = 0;
  nextStep = ac.currentTime + 0.1;
  clearInterval(timer);
  timer = setInterval(schedule, 25);
}
export function stopMusic(fade = 0.5) {
  if (!ac || !songGain) return;
  const g = songGain;
  g.gain.cancelScheduledValues(ac.currentTime);
  g.gain.setValueAtTime(g.gain.value, ac.currentTime);
  g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + fade);
  setTimeout(() => g.disconnect(), fade * 1000 + 300);
  song = null;
  clearInterval(timer);
}
export function musicIntensity(v) {
  intensity = v;
}
