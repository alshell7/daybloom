// Daybloom's alarm tones, ported from the app (src/lib/alarm.ts): each tone is a short phrase
// synthesised in plain JS (bells and bars from sine partials, plucked strings by Karplus–Strong,
// soft beeps and slow swells), warmed by a gentle low-pass and a small room. No audio files.
// This module loads only when a visitor asks to hear a tone.

export interface AlarmTone {
  id: string;
  name: string;
  /** One line for Settings. */
  hint: string;
  /** Seconds before the phrase repeats. */
  period: number;
  voice: Voice;
  /** [seconds into the phrase, note name or Hz, gain (default 1), length scale (default 1)]. */
  notes: [at: number, pitch: string | number, gain?: number, len?: number][];
  /** Room reverb, 0..1. */
  wet: number;
  /** Low-pass corner (Hz) that keeps the highs soft. */
  lowpass: number;
}

type Voice = 'bell' | 'bar' | 'marimba' | 'pluck' | 'box' | 'beep' | 'swell';

export const DEFAULT_TONE = 'dawn';
/** How long a gentle start takes to reach full volume. */
export const GENTLE_SECONDS = 40;

export const ALARM_TONES: AlarmTone[] = [
  {
    id: 'dawn',
    name: 'Dawn',
    hint: 'A soft bell that climbs, like light coming up',
    period: 3.4,
    voice: 'bell',
    notes: [[0, 'C5', 0.9], [0.36, 'E5', 0.85], [0.72, 'G5', 0.8], [1.08, 'C6', 0.62, 1.5]],
    wet: 0.34,
    lowpass: 3600,
  },
  {
    id: 'meadow',
    name: 'Meadow',
    hint: 'A bright little marimba tune',
    period: 2.6,
    voice: 'marimba',
    notes: [[0, 'E5'], [0.18, 'G5', 0.9], [0.36, 'A5', 0.9], [0.54, 'C6', 0.75], [0.9, 'A5', 0.85], [1.08, 'G5', 0.85], [1.26, 'E5', 0.9], [1.62, 'G5', 0.95, 1.8]],
    wet: 0.22,
    lowpass: 3800,
  },
  {
    id: 'harp',
    name: 'Harp',
    hint: 'Plucked strings rolling up, again and again',
    period: 2.6,
    voice: 'pluck',
    notes: [[0, 'G4'], [0.13, 'B4', 0.95], [0.26, 'D5', 0.9], [0.39, 'G5', 0.85], [0.52, 'B5', 0.75, 1.3], [1.04, 'D5', 0.7], [1.17, 'G5', 0.7, 1.3]],
    wet: 0.3,
    lowpass: 3400,
  },
  {
    id: 'chimes',
    name: 'Chimes',
    hint: 'Slow wind chimes in a quiet garden',
    period: 3.6,
    voice: 'bar',
    notes: [[0, 'A5', 0.9], [0.44, 'E5', 0.85], [0.78, 'G5', 0.8], [1.36, 'D5', 0.85, 1.2], [1.9, 'B4', 0.6, 1.3]],
    wet: 0.4,
    lowpass: 3200,
  },
  {
    id: 'bedside',
    name: 'Bedside',
    hint: 'Four soft beeps, like a bedside clock',
    period: 1.8,
    voice: 'beep',
    notes: [[0, 'G5'], [0.2, 'G5'], [0.4, 'G5'], [0.6, 'G5']],
    wet: 0.12,
    lowpass: 3000,
  },
  {
    id: 'musicbox',
    name: 'Music box',
    hint: 'A tiny lullaby, wound up and playing',
    period: 3.0,
    voice: 'box',
    notes: [[0, 'E5'], [0.3, 'G5', 0.9], [0.6, 'C6', 0.75], [0.9, 'B5', 0.75], [1.2, 'G5', 0.85], [1.5, 'A5', 0.8], [1.8, 'G5', 0.9, 1.6]],
    wet: 0.3,
    lowpass: 3400,
  },
  {
    id: 'tide',
    name: 'Tide',
    hint: 'Warm, slow swells that rise and fall',
    period: 5.2,
    voice: 'swell',
    notes: [[0, 'A4', 0.8], [0, 'E5', 0.55], [0.12, 'C#5', 0.45], [2.6, 'F#4', 0.75], [2.6, 'C#5', 0.55], [2.72, 'A4', 0.45]],
    wet: 0.36,
    lowpass: 2600,
  },
];

export function toneById(id: string | null | undefined): AlarmTone {
  return ALARM_TONES.find((t) => t.id === id) ?? ALARM_TONES.find((t) => t.id === DEFAULT_TONE)!;
}

/** The volume slider, curved so the middle is clearly audible and the top is full. */
export const alarmGain = (v: number) => Math.min(1, Math.max(0, v)) ** 1.5;

// ── Rendering (pure) ──────────────────────────────────────────────────────────

const NOTE = /^([A-G])(#|b)?(-?\d)$/;
/** "A4" → 440, "C#5" → 554.37; numbers pass through. */
export function hz(p: string | number): number {
  if (typeof p === 'number') return p;
  const m = NOTE.exec(p);
  if (!m) throw new Error(`bad note ${p}`);
  const semi = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1] as 'C'] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((semi + (Number(m[3]) - 4) * 12) / 12);
}

/** Sine partials: [ratio to the fundamental, gain, decay scale]. */
const PARTIALS: Record<'bell' | 'bar' | 'marimba' | 'box', [number, number, number][]> = {
  // Warm, nearly harmonic bell: sweet rather than clangy.
  bell: [[1, 1, 1], [2, 0.3, 0.55], [3, 0.09, 0.32], [4.07, 0.035, 0.2]],
  // A free bar (tubular chime): the classic inharmonic overtones, kept low.
  bar: [[1, 1, 1], [2.756, 0.2, 0.42], [5.404, 0.05, 0.18]],
  // Marimba: a strong fundamental and its tuned fourth harmonic, short.
  marimba: [[1, 1, 1], [3.93, 0.11, 0.22], [9.2, 0.012, 0.08]],
  // Music-box tine: fundamental, a whisper of octave and a quick high shimmer.
  box: [[1, 1, 1], [2, 0.09, 0.38], [5.9, 0.025, 0.1]],
};
/** Attack (s) and decay time constant (s) per voice. */
const SHAPE: Record<Voice, { attack: number; tau: number }> = {
  bell: { attack: 0.006, tau: 0.62 },
  bar: { attack: 0.004, tau: 0.85 },
  marimba: { attack: 0.003, tau: 0.2 },
  box: { attack: 0.002, tau: 0.34 },
  pluck: { attack: 0, tau: 2.8 },
  beep: { attack: 0.008, tau: 0.11 },
  swell: { attack: 0.9, tau: 1.1 },
};

/** A small seeded random, so plucks sound (and test) the same every time. */
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

/** Adds one note at `start` samples; with `wrap`, samples past the end continue at the start. */
function addNote(out: Float32Array, sr: number, voice: Voice, start: number, f: number, g: number, len: number, wrap: boolean, rand: () => number) {
  const N = out.length;
  const put = (i: number, v: number) => {
    const j = start + i;
    if (j < N) out[j] += v;
    else if (wrap) out[j % N] += v;
  };
  const { attack, tau } = SHAPE[voice];
  const TWO_PI = 2 * Math.PI;

  if (voice === 'pluck') {
    // Karplus–Strong: a soft noise burst circulating in a delay line one period long; the
    // two-tap average darkens it a little on every pass, like a nylon string.
    const decay = tau * len;
    const D = sr / f - 0.5;
    const total = Math.ceil(sr * decay * 2.2);
    const y = new Float32Array(total);
    const rho = 0.001 ** (1 / (f * decay));
    const burst = Math.round(sr / f);
    let lp = 0;
    let mean = 0;
    const ex = new Float32Array(burst);
    for (let i = 0; i < burst; i++) {
      lp += 0.16 * (rand() * 2 - 1 - lp);
      ex[i] = lp;
      mean += lp / burst;
    }
    const at = (p: number) => {
      if (p < 0) return 0;
      const i = Math.floor(p);
      const fr = p - i;
      return y[i] * (1 - fr) + (i + 1 < total ? y[i + 1] : 0) * fr;
    };
    for (let n = 0; n < total; n++) {
      const fb = n >= D + 1 ? rho * 0.5 * (at(n - D) + at(n - D - 1)) : 0;
      y[n] = (n < burst ? (ex[n] - mean) * 2.4 : 0) + fb;
      const fadeIn = n < 24 ? n / 24 : 1;
      put(n, y[n] * g * fadeIn);
    }
    return;
  }

  if (voice === 'beep') {
    // A rounded beep: soft edges, a little sag, two quiet harmonics for warmth.
    const dur = 0.11 * len;
    const rel = 0.03;
    const total = Math.ceil(sr * (dur + rel));
    for (let n = 0; n < total; n++) {
      const t = n / sr;
      const edge = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : t > dur ? Math.max(0, 0.5 + 0.5 * Math.cos((Math.PI * (t - dur)) / rel)) : 1;
      const env = edge * Math.exp(-t / 0.5);
      const ph = TWO_PI * f * t;
      put(n, g * env * (Math.sin(ph) + 0.1 * Math.sin(2 * ph) + 0.035 * Math.sin(3 * ph)));
    }
    return;
  }

  if (voice === 'swell') {
    // A slow pad: two copies a few cents apart (a gentle chorus), harmonics falling off fast.
    const a = attack * len;
    const tl = tau * len;
    const total = Math.ceil(sr * (a + tl * Math.log(1e3)));
    const det = 2 ** (4 / 1200);
    for (let n = 0; n < total; n++) {
      const t = n / sr;
      const env = t < a ? 0.5 - 0.5 * Math.cos((Math.PI * t) / a) : Math.exp(-(t - a) / tl);
      const p1 = TWO_PI * f * t;
      const p2 = TWO_PI * f * det * t;
      const s = Math.sin(p1) + Math.sin(p2) + 0.22 * (Math.sin(2 * p1) + Math.sin(2 * p2)) + 0.06 * Math.sin(3 * p1);
      put(n, g * env * s * 0.5);
    }
    return;
  }

  // Struck voices: sine partials, each with its own exponential decay.
  for (const [ratio, pg, pd] of PARTIALS[voice]) {
    const pf = f * ratio;
    if (pf > sr * 0.45) continue;
    const tl = tau * len * pd;
    const amp = g * pg;
    const total = Math.ceil(sr * (attack + tl * Math.log(Math.max(2, amp / 1e-4))));
    const w = (TWO_PI * pf) / sr;
    for (let n = 0; n < total; n++) {
      const t = n / sr;
      const env = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : Math.exp(-(t - attack) / tl);
      put(n, amp * env * Math.sin(w * n));
    }
  }
}

/** A small stereo room (Freeverb's combs and all-passes, scaled to the sample rate). */
function room(x: Float32Array, sr: number, wet: number): [Float32Array, Float32Array] {
  const k = sr / 44100;
  const combs = [1116, 1188, 1277, 1356];
  const alls = [556, 441];
  const fb = 0.8;
  const damp = 0.3;
  const chan = (spread: number) => {
    const out = new Float32Array(x.length);
    for (const c of combs) {
      const d = Math.round((c + spread) * k);
      const buf = new Float32Array(d);
      let i = 0;
      let store = 0;
      for (let n = 0; n < x.length; n++) {
        const o = buf[i];
        store = o * (1 - damp) + store * damp;
        buf[i] = x[n] * 0.25 + store * fb;
        out[n] += o;
        if (++i >= d) i = 0;
      }
    }
    for (const a of alls) {
      const d = Math.round((a + spread) * k);
      const buf = new Float32Array(d);
      let i = 0;
      for (let n = 0; n < out.length; n++) {
        const b = buf[i];
        const v = out[n];
        buf[i] = v + b * 0.5;
        out[n] = b - v;
        if (++i >= d) i = 0;
      }
    }
    for (let n = 0; n < out.length; n++) out[n] = x[n] * (1 - wet * 0.35) + out[n] * wet * 0.42;
    return out;
  };
  return [chan(0), chan(23)];
}

/** Two gentle poles of low-pass and a high-pass at 90 Hz (no rumble, no DC). */
function tone(x: Float32Array, sr: number, lowpass: number) {
  const a = Math.exp((-2 * Math.PI * lowpass) / sr);
  const r = Math.exp((-2 * Math.PI * 90) / sr);
  let l1 = 0;
  let l2 = 0;
  let px = 0;
  let hy = 0;
  for (let n = 0; n < x.length; n++) {
    l1 += (1 - a) * (x[n] - l1);
    l2 += (1 - a) * (l1 - l2);
    hy = l2 - px + r * hy;
    px = l2;
    x[n] = hy;
  }
}

/** Loudness the tones are matched to: RMS ≈ −19 dBFS, never above −4.5 dBFS at full volume. */
const TARGET_RMS = 0.11;
const TARGET_PEAK = 0.6;

function postProcess(dry: Float32Array, sr: number, t: AlarmTone) {
  tone(dry, sr, t.lowpass);
  return room(dry, sr, t.wet);
}

function dryPhrase(t: AlarmTone, sr: number, length: number, reps: number, wrap: boolean): Float32Array {
  const out = new Float32Array(length);
  const P = Math.round(t.period * sr);
  t.notes.forEach(([at, p, g = 1, len = 1], i) => {
    for (let r = 0; r < reps; r++) addNote(out, sr, t.voice, Math.round(at * sr) + r * P, hz(p), g, len, wrap, rng(0x5eed + i * 977 + r * 31));
  });
  return out;
}

const cache = new Map<string, Float32Array[]>();
const norms = new Map<string, number>();

/** The phrase before loudness matching. */
function raw(t: AlarmTone, sr: number, mode: 'loop' | 'once', reps: number): Float32Array[] {
  const P = Math.round(t.period * sr);
  if (mode === 'loop') {
    // Three laps through the filters and the room, keep the last: by then it is periodic.
    const one = dryPhrase(t, sr, P, 1, true);
    const three = new Float32Array(P * 3);
    for (let k = 0; k < 3; k++) three.set(one, k * P);
    return postProcess(three, sr, t).map((c) => c.slice(2 * P, 3 * P));
  }
  const chans = postProcess(dryPhrase(t, sr, reps * P + Math.round(sr * 2.4), reps, false), sr, t);
  const fade = Math.round(sr * 0.25);
  for (const c of chans) for (let i = 0; i < fade; i++) c[c.length - 1 - i] *= i / fade;
  return chans;
}

/**
 * A tone's audio, as channels at `sr`. `loop`: exactly one period that repeats seamlessly
 * (tails and the room's echo wrap round). `once`: `reps` phrases plus their ringing tail, for
 * previews. Both get the gain that matches the loop to the target loudness.
 */
export function renderTone(id: string, sr: number, mode: 'loop' | 'once' = 'loop', reps = 2): Float32Array[] {
  const t = toneById(id);
  const key = `${t.id}:${mode}:${reps}:${sr}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const chans = raw(t, sr, mode, reps);
  const nk = `${t.id}:${sr}`;
  let g = norms.get(nk);
  if (g === undefined) {
    g = normFor(mode === 'loop' ? chans : raw(t, sr, 'loop', 1));
    norms.set(nk, g);
  }
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
  // Keep only the few most recent (a preview is a few MB): light on memory, quick to replay.
  cache.set(key, chans);
  for (const k of cache.keys()) if (cache.size > 3) cache.delete(k);
  return chans;
}

function normFor(chans: Float32Array[]): number {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const c of chans) {
    for (let i = 0; i < c.length; i++) {
      const v = Math.abs(c[i]);
      if (v > peak) peak = v;
      sum += c[i] * c[i];
    }
    n += c.length;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  return Math.min(TARGET_RMS / Math.max(rms, 1e-9), TARGET_PEAK / Math.max(peak, 1e-9));
}

// ── Playing (a preview only, on this page) ─────────────────────────────────────

let ctx: AudioContext | null = null;
let preview: { src: AudioBufferSourceNode; gain: GainNode; done?: () => void } | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext({ latencyHint: 'playback' });
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  return ctx;
}

function buffer(c: AudioContext, id: string): AudioBuffer {
  const chans = renderTone(id, c.sampleRate, 'once', 1);
  const b = c.createBuffer(chans.length, chans[0].length, c.sampleRate);
  chans.forEach((ch, i) => b.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
  return b;
}

/** Play a tone once through, softly. Returns how long it lasts, in seconds. */
export function previewTone(id: string, volume: number, onend?: () => void): number {
  stopPreview();
  const c = context();
  if (!c) return 0;
  const src = c.createBufferSource();
  src.buffer = buffer(c, toneById(id).id);
  const gain = c.createGain();
  const g = Math.max(0.0005, alarmGain(volume));
  // A gentle start, like the app's: the first moment is quiet.
  gain.gain.setValueAtTime(g * 0.35, c.currentTime);
  gain.gain.linearRampToValueAtTime(g, c.currentTime + 0.8);
  src.connect(gain).connect(c.destination);
  const me: { src: AudioBufferSourceNode; gain: GainNode; done?: () => void } = { src, gain, done: onend };
  preview = me;
  src.onended = () => {
    if (preview === me) preview = null;
    me.done?.();
    me.done = undefined;
    if (!preview) void c.suspend().catch(() => {});
  };
  src.start();
  return src.buffer.duration;
}

export function stopPreview() {
  const p = preview;
  if (!p || !ctx) return;
  preview = null;
  try {
    const now = ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(p.gain.gain.value, now);
    p.gain.gain.linearRampToValueAtTime(0, now + 0.12);
    p.src.stop(now + 0.15);
  } catch {
    /* already stopped */
  }
  p.done?.();
  p.done = undefined;
}
