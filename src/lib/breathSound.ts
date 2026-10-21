// The breathing guide's sounds, synthesised (no files) and rendered once per breath, in plain JS,
// into a buffer (like alarm.ts): the same renderer feeds the tests, so what is measured is what
// plays.
//  · Breath: the in-breath is air drawn through the nose: noise through the nose's soft
//    resonances that swells, brightens as the lungs fill and settles, with a hint of chest
//    underneath. The out-breath is a slow, relaxed breath through softly parted lips: a warm,
//    whispered "haaa" (noise through the formants of an open vowel) that falls away as the air
//    runs out, its colour closing a little at the end. Each is shaped to last its phase exactly,
//    and each breath differs a little (seeded), so a minute never sounds looped. Hold and rest
//    stay silent.
//  · Tones: soft chimes with a slow, bowl-like shimmer: rising as you breathe in, falling as you
//    breathe out, and a faint single note for hold and for rest.
// A small room around both. Played through the app's output and volume (sound.ts).

import { audioOut } from './sound';

export type BreathCue = 'in' | 'hold' | 'out' | 'rest';
export type BreathVoice = 'breath' | 'tones';

/** Seconds of room after a breath's own end (its reflections, far below the breath). */
const TAIL = 0.06;

// ── Rendering (pure) ──────────────────────────────────────────────────────────

/** A small seeded random, so every breath can differ and still test the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 at `a`, 1 at `b`, smooth at both ends. */
function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** An RBJ biquad (transposed direct form II) whose corner can move while it runs. */
class Biquad {
  #b0 = 1;
  #b1 = 0;
  #b2 = 0;
  #a1 = 0;
  #a2 = 0;
  #z1 = 0;
  #z2 = 0;
  constructor(
    readonly type: 'lp' | 'hp' | 'bp',
    readonly sr: number,
  ) {}
  set(f: number, q: number) {
    const w = (2 * Math.PI * Math.min(f, this.sr * 0.45)) / this.sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    let b0: number, b1: number, b2: number;
    if (this.type === 'lp') {
      b0 = (1 - cs) / 2;
      b1 = 1 - cs;
      b2 = b0;
    } else if (this.type === 'hp') {
      b0 = (1 + cs) / 2;
      b1 = -(1 + cs);
      b2 = b0;
    } else {
      // Band-pass with 0 dB at its centre.
      b0 = al;
      b1 = 0;
      b2 = -al;
    }
    this.#b0 = b0 / a0;
    this.#b1 = b1 / a0;
    this.#b2 = b2 / a0;
    this.#a1 = (-2 * cs) / a0;
    this.#a2 = (1 - al) / a0;
    return this;
  }
  run(x: number) {
    const y = this.#b0 * x + this.#z1;
    this.#z1 = this.#b1 * x - this.#a1 * y + this.#z2;
    this.#z2 = this.#b2 * x - this.#a2 * y;
    return y;
  }
}

/** Slow, uneven flutter in −1..1: the small wavers of real airflow. */
function flutter(rand: () => number) {
  const parts = [
    [0.9, 0.5],
    [2.1, 0.3],
    [4.3, 0.18],
    [7.7, 0.1],
  ].map(([f, a]) => [f * (0.8 + 0.4 * rand()), a, rand() * 2 * Math.PI]);
  const sum = parts.reduce((s, p) => s + p[1], 0);
  return (t: number) => parts.reduce((s, [f, a, ph]) => s + a * Math.sin(2 * Math.PI * f * t + ph), 0) / sum;
}

/** Control rate: corners and envelopes move every BLOCK samples (smooth, and cheap). */
const BLOCK = 32;

/**
 * Air drawn in through the nose, mono, exactly `n` samples. Its loudness follows the airflow
 * (turbulence grows faster than the flow), and its corner opens as the breath fills.
 */
function inhale(n: number, sr: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  // This breath's own shape: how soon it swells, how it settles, how bright and how big.
  const rise = 0.3 + 0.1 * rand();
  const settle = 0.2 + 0.08 * rand();
  const k = 0.94 + 0.12 * rand();
  const bright = 0.9 + 0.2 * rand();
  const wob = flutter(rand);
  const hp = new Biquad('hp', sr).set(240, 0.7);
  const lp = new Biquad('lp', sr);
  const lp2 = new Biquad('lp', sr);
  const nose1 = new Biquad('bp', sr);
  const nose2 = new Biquad('bp', sr);
  const chest = new Biquad('bp', sr).set(165 * k, 1.3);
  const soft = new Biquad('lp', sr).set(5200, 0.6);
  let amp = 0;
  let chestAmp = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    if (i % BLOCK === 0) {
      const u = i / n;
      const t = i / sr;
      // Airflow: eases in, fills, and settles to nothing exactly at the end.
      const flow = smooth(0, rise, u) * (1 - smooth(1 - settle, 1, u)) * (0.8 + 0.2 * u);
      amp = flow ** 1.45 * (1 + 0.07 * wob(t));
      chestAmp = flow ** 2;
      // Brightens as it fills: the whole sound opens up, and the whoosh's peak rises with the flow.
      b = smooth(0, 0.85, u) * bright;
      const fc = 1100 + 3500 * b;
      lp.set(fc, 0.62);
      lp2.set(fc * 1.25, 0.55);
      nose1.set((760 + 740 * b) * k, 1.4);
      nose2.set((2400 + 600 * b) * k, 1.9);
    }
    const w = rand() * 2 - 1;
    const x = hp.run(w);
    const res = nose1.run(x) * 1.05 + nose2.run(x) * (0.45 + 0.8 * b);
    const body = chest.run(w) * 0.9 * chestAmp;
    out[i] = soft.run(lp2.run(lp.run(x * 0.75 + res)) * amp) + body;
  }
  return out;
}

/**
 * A relaxed out-breath through softly parted lips, mono, exactly `n` samples: a whispered
 * "haaa", strongest soon after it starts and falling away like a sigh.
 */
function exhale(n: number, sr: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  const rise = 0.11 + 0.06 * rand();
  const fall = 0.42 + 0.1 * rand();
  const k = 0.95 + 0.1 * rand();
  const decay = 1.1 + 0.4 * rand();
  const wob = flutter(rand);
  const hp = new Biquad('hp', sr).set(110, 0.7);
  const f1 = new Biquad('bp', sr);
  const f2 = new Biquad('bp', sr);
  const f3 = new Biquad('bp', sr);
  const asp = new Biquad('lp', sr);
  const asp2 = new Biquad('lp', sr);
  const chest = new Biquad('bp', sr).set(140 * k, 1.2);
  const soft = new Biquad('lp', sr).set(4200, 0.6);
  let amp = 0;
  let chestAmp = 0;
  let top = 0;
  for (let i = 0; i < n; i++) {
    if (i % BLOCK === 0) {
      const u = i / n;
      const t = i / sr;
      // Strongest soon after it starts (the lungs let go), then a long, even fall to nothing.
      const flow = smooth(0, rise, u) * Math.exp(-decay * u) * (1 - smooth(1 - fall, 1, u) ** 0.9);
      amp = flow ** 1.3 * (1 + 0.06 * wob(t));
      chestAmp = flow ** 1.8;
      // The vowel relaxes and darkens a little as the air runs out.
      const c = 1 - 0.12 * u;
      f1.set(740 * k * c, 4.2);
      f2.set(1180 * k * c, 5);
      f3.set(2500 * k * (1 - 0.05 * u), 6);
      top = 0.6 - 0.35 * u;
      const fc = 2300 - 1200 * u;
      asp.set(fc, 0.6);
      asp2.set(fc * 1.25, 0.55);
    }
    const w = rand() * 2 - 1;
    const x = hp.run(w);
    const vowel = f1.run(x) * 2.2 + f2.run(x) * 1.5 + f3.run(x) * top;
    const air = asp2.run(asp.run(x));
    const body = chest.run(w) * 0.8 * chestAmp;
    out[i] = soft.run((vowel + air * 0.5) * amp) + body;
  }
  return out;
}

/** A small room: a few soft early reflections, a little different on each side. */
function space(dry: Float32Array, sr: number, len: number, wet = 1): [Float32Array, Float32Array] {
  const taps: [number, number][][] = [
    [
      [6.1, 0.2],
      [11.7, 0.15],
      [17.3, 0.11],
      [24.1, 0.08],
      [31.3, 0.05],
    ],
    [
      [7.4, 0.19],
      [13.2, 0.14],
      [19.6, 0.1],
      [26.5, 0.075],
      [29.4, 0.05],
    ],
  ];
  return taps.map((side) => {
    const out = new Float32Array(len);
    for (const [ms, g] of side) {
      const d = Math.round((ms / 1000) * sr);
      const gw = g * wet;
      for (let i = 0; i < dry.length && i + d < len; i++) out[i + d] += dry[i] * gw;
    }
    // The walls are soft: a one-pole low-pass on the reflections only.
    const a = Math.exp((-2 * Math.PI * 3000) / sr);
    let y = 0;
    for (let i = 0; i < len; i++) {
      y += (1 - a) * (out[i] - y);
      out[i] = y + (i < dry.length ? dry[i] * 0.92 : 0);
    }
    return out;
  }) as [Float32Array, Float32Array];
}

/** Scale to an RMS, never above a peak. */
function level(chans: Float32Array[], rms: number, peak: number) {
  let p = 0;
  let sum = 0;
  let cnt = 0;
  for (const c of chans) {
    for (let i = 0; i < c.length; i++) {
      const v = Math.abs(c[i]);
      if (v > p) p = v;
      sum += c[i] * c[i];
    }
    cnt += c.length;
  }
  const r = Math.sqrt(sum / Math.max(1, cnt));
  const g = Math.min(rms / Math.max(r, 1e-9), peak / Math.max(p, 1e-9));
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chans;
}

/**
 * Loudness, before the app's volume: soft, like someone breathing calmly beside you. The
 * out-breath sits a touch above the in-breath, as it does in life. Peaks stay ≥ 10 dB below full.
 */
export const BREATH_LEVEL = { in: { rms: 0.042, peak: 0.3 }, out: { rms: 0.05, peak: 0.3 } } as const;

const cache = new Map<string, Float32Array[]>();
function remember(key: string, make: () => Float32Array[]) {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const v = make();
  cache.set(key, v);
  for (const k of cache.keys()) if (cache.size > 6) cache.delete(k);
  return v;
}

/**
 * One breath, stereo, at `sr`: exactly `seconds` of breath (silent at both ends) plus a short
 * room tail. `seed` picks this breath's small differences.
 */
export function renderBreath(kind: 'in' | 'out', seconds: number, sr: number, seed = 1): Float32Array[] {
  return remember(`${kind}:${seconds}:${sr}:${seed}`, () => {
    const n = Math.round(seconds * sr);
    const rand = rng(0xb4ea7 ^ Math.imul(seed, 2654435761) ^ (kind === 'in' ? 0x11 : 0x77));
    const dry = kind === 'in' ? inhale(n, sr, rand) : exhale(n, sr, rand);
    const L = BREATH_LEVEL[kind];
    // Each breath a touch louder or softer than the last (±0.8 dB), like a person.
    const vary = 10 ** (((rand() * 2 - 1) * 0.8) / 20);
    return level(space(dry, sr, n + Math.round(TAIL * sr)), L.rms * vary, L.peak);
  });
}

/** [seconds in, Hz, gain, decay time constant (s)] for each cue's chime. */
const CHIMES: Record<BreathCue, [number, number, number, number][]> = {
  // G4, then D5 above it: a soft rise.
  in: [
    [0, 392, 1, 1.25],
    [0.17, 587.33, 0.42, 1.0],
  ],
  // A single, faint D5: at the top of the breath.
  hold: [[0, 587.33, 1, 0.6]],
  // A4, then D4 below it: a soft fall.
  out: [
    [0, 440, 0.38, 0.9],
    [0.17, 293.66, 1, 1.45],
  ],
  // A single, faint B3: at the bottom of the breath.
  rest: [[0, 246.94, 1, 0.7]],
};
/** Peak level of each cue's chime: the turns (hold, rest) are quieter than the breaths. */
const CHIME_PEAK: Record<BreathCue, number> = { in: 0.12, hold: 0.055, out: 0.12, rest: 0.06 };

/** A breathing cue's chime, stereo, at `sr`. */
export function renderChime(cue: BreathCue, sr: number): Float32Array[] {
  return remember(`chime:${cue}:${sr}`, () => {
    const notes = CHIMES[cue];
    const len = Math.ceil(sr * Math.max(...notes.map(([at, , , tau]) => at + tau * 4.6 + 0.05)));
    const dry = new Float32Array(len);
    const attack = 0.035;
    for (const [at, f, g, tau] of notes) {
      const s0 = Math.round(at * sr);
      // Near-harmonic and sweet; each partial doubled a hair apart, for a slow bowl-like shimmer.
      for (const [ratio, pg, pd] of [
        [1, 1, 1],
        [2, 0.16, 0.5],
        [3, 0.04, 0.3],
      ] as const) {
        const pf = f * ratio;
        const det = 1 + 0.0024 / ratio;
        const tl = tau * pd;
        const w1 = (2 * Math.PI * pf) / sr;
        const w2 = w1 * det;
        for (let i = 0; s0 + i < len; i++) {
          const t = i / sr;
          const env = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : Math.exp(-(t - attack) / tl);
          if (env < 1e-4 && t > attack) break;
          dry[s0 + i] += g * pg * env * 0.5 * (Math.sin(w1 * i) + Math.sin(w2 * i));
        }
      }
    }
    // Fade the last 0.3 s so it ends in true silence.
    const fade = Math.round(0.3 * sr);
    for (let i = 0; i < fade; i++) dry[len - 1 - i] *= i / fade;
    const chans = space(dry, sr, len, 1.4);
    let p = 0;
    for (const c of chans) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
    const g = CHIME_PEAK[cue] / Math.max(p, 1e-9);
    for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
    return chans;
  });
}

/** What a phase sounds like in a voice: a breath, a chime, or nothing. */
export function cueAudio(cue: BreathCue, voice: BreathVoice, seconds: number, sr: number, seed = 1): Float32Array[] | null {
  if (voice === 'tones') return renderChime(cue, sr);
  if (cue === 'in' || cue === 'out') return renderBreath(cue, seconds, sr, seed);
  return null;
}

// ── Playing ───────────────────────────────────────────────────────────────────

const live = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>();

/**
 * Play a phase's sound now, `offset` seconds into it (a late start joins where the breath is,
 * with a short fade-in so it never clicks), or at `when` seconds from now. No-op when sound is
 * off or the cue is silent.
 */
export function playCue(cue: BreathCue, voice: BreathVoice, seconds: number, o: { seed?: number; offset?: number; when?: number } = {}) {
  const out = audioOut();
  if (!out) return;
  const { ctx, master } = out;
  const chans = cueAudio(cue, voice, seconds, ctx.sampleRate, o.seed);
  if (!chans) return;
  const offset = Math.max(0, o.offset ?? 0);
  const dur = chans[0].length / ctx.sampleRate;
  if (offset > dur - 0.25) return;
  const buf = ctx.createBuffer(chans.length, chans[0].length, ctx.sampleRate);
  chans.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + Math.max(0, o.when ?? 0) + 0.005;
  if (offset > 0.02) {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + 0.12);
  }
  src.connect(gain).connect(master);
  src.start(t0, offset);
  const me = { src, gain };
  live.add(me);
  src.onended = () => {
    live.delete(me);
    src.disconnect();
    gain.disconnect();
  };
}

/** Fade out whatever the guide is playing (it was stopped, or started again). */
export function stopCues(fade = 0.35) {
  if (!live.size) return;
  const out = audioOut();
  for (const me of live) {
    try {
      if (out) {
        const now = out.ctx.currentTime;
        const g = me.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + fade);
        me.src.stop(now + fade + 0.05);
      } else me.src.stop();
    } catch {
      /* already stopped */
    }
  }
  live.clear();
}

/** Render a cue ahead of time, when the page is idle, so it starts without a hitch. */
export function warmCue(cue: BreathCue, voice: BreathVoice, seconds: number, seed = 1) {
  const out = audioOut();
  if (!out) return;
  const sr = out.ctx.sampleRate;
  const run = () => void cueAudio(cue, voice, seconds, sr, seed);
  const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 1500 });
  else setTimeout(run, 30);
}
