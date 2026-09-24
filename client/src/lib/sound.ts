/**
 * Tiny WebAudio blips — no asset downloads, no licences, and they can be
 * muted with one switch. Everything is synthesised on the fly.
 */

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem('fakeartist.muted') === '1';
} catch {
  /* ignore */
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem('fakeartist.muted', value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, gain = 0.14, type: OscillatorType = 'triangle'): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  env.gain.setValueAtTime(0.0001, ac.currentTime + start);
  env.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(env).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

/** A short burst of filtered noise — the scratch of a felt tip on paper. */
function scratch(duration = 0.12, gain = 0.05): void {
  const ac = audio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  const env = ac.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(ac.destination);
  src.start();
}

export const sfx = {
  tap: () => tone(520, 0, 0.07, 0.07, 'square'),
  select: () => tone(760, 0, 0.09, 0.08),
  stroke: () => scratch(),
  commit: () => {
    scratch(0.08, 0.04);
    tone(660, 0.02, 0.1, 0.08);
  },
  deal: () => tone(320, 0, 0.06, 0.05, 'square'),
  flip: () => {
    tone(440, 0, 0.08, 0.08);
    tone(660, 0.06, 0.12, 0.08);
  },
  turn: () => {
    tone(659, 0, 0.1);
    tone(880, 0.08, 0.14);
  },
  tick: () => tone(880, 0, 0.06, 0.06, 'sine'),
  go: () => {
    tone(523, 0, 0.1, 0.12);
    tone(784, 0.07, 0.1, 0.12);
    tone(1047, 0.14, 0.22, 0.12);
  },
  vote: () => tone(990, 0, 0.08, 0.08, 'sine'),
  chip: () => tone(1050, 0, 0.08, 0.09, 'sine'),
  stamp: () => {
    tone(140, 0, 0.18, 0.2, 'square');
    tone(90, 0.02, 0.2, 0.15, 'sine');
  },
  drumroll: () => {
    for (let i = 0; i < 10; i++) tone(180 + (i % 2) * 20, i * 0.06, 0.05, 0.05, 'square');
  },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.3, 0.13));
  },
  lose: () => {
    [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.25, 0.1));
  },
  chat: () => tone(990, 0, 0.07, 0.05, 'sine'),
  error: () => tone(160, 0, 0.16, 0.1, 'sawtooth'),
};
