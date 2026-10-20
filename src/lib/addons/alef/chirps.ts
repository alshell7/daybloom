// Alef's voice without words, synthesised with WebAudio (no files). Like Cozmo's — a person's
// voice, sampled, pitched and processed into a little robot — it is a voice first: a warm
// glottal tone around 250–450 Hz shaped by three gliding vowel formants (oo, ee, ah, a closed-
// mouth hum), with a scoop at the start, vibrato, a little pitch jitter and a breath of air,
// then coloured like a small robot's speaker: a tinny presence and a touch of digital grit.
// Feelings are short utterances ("hee-hee!", "ooh?", "aww…", a gruff little "hrrm"); every
// one varies a little each time, so it never sounds canned. `babble` speaks a sentence in
// Alef's gibberish, following its vowels and its tune.

import { audioOut } from '../../sound';
import type { ChirpId } from './behaviors';

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u' | 'm';

/** Formants (F1, F2, F3 in Hz) for a small voice, and how strong each is. */
const FORMANTS: Record<Vowel, { f: [number, number, number]; g: [number, number, number] }> = {
  a: { f: [980, 1620, 3200], g: [1, 0.62, 0.22] },
  e: { f: [620, 2350, 3300], g: [1, 0.55, 0.22] },
  i: { f: [400, 2900, 3800], g: [1, 0.5, 0.25] },
  o: { f: [640, 1100, 3000], g: [1, 0.45, 0.14] },
  u: { f: [430, 960, 2900], g: [1, 0.32, 0.1] },
  m: { f: [330, 1300, 2700], g: [1, 0.1, 0.03] },
};

export interface Syl {
  /** Vowel at the start and the end (it glides between them). */
  v0: Vowel;
  v1?: Vowel;
  /** Pitch contour (Hz, before the voice's pitch), spread evenly over the syllable. */
  p: number[];
  dur: number;
  /** Pause after it (s). */
  gap: number;
  gain?: number;
  /** Vibrato depth (fraction of pitch) and rate. */
  vib?: number;
  vibHz?: number;
  /** Air in the voice (0..1): sighs, yawns, whispers. */
  breath?: number;
  /** A cute growl (amplitude flutter). */
  growl?: number;
}

const S = (v0: Vowel, v1: Vowel | undefined, p: number[], dur: number, gap = 0.05, o: Partial<Syl> = {}): Syl => ({ v0, v1, p, dur, gap, ...o });

export const PATTERNS: Record<ChirpId, Syl[]> = {
  happy: [S('u', 'i', [560, 700, 760], 0.13, 0.04), S('e', 'i', [720, 920, 980, 940], 0.2, 0)],
  excited: [S('a', 'e', [600, 700], 0.08, 0.03), S('a', 'e', [680, 800], 0.08, 0.03), S('a', 'i', [760, 980, 1080, 1040], 0.24, 0, { vib: 0.02 })],
  fanfare: [S('a', 'a', [620, 640], 0.1, 0.035), S('a', 'a', [780, 800], 0.1, 0.035), S('a', 'a', [930, 950], 0.1, 0.035), S('a', 'o', [1180, 1260, 1240, 1180], 0.42, 0, { vib: 0.025 })],
  proud: [S('m', 'm', [470, 520], 0.12, 0.05), S('m', 'o', [520, 680, 640], 0.26, 0, { vib: 0.015 })],
  amazed: [S('o', 'u', [480, 760, 1020, 980, 820], 0.55, 0, { vib: 0.02 })],
  afraid: [S('i', 'i', [920, 980, 900], 0.14, 0.05, { vib: 0.05, vibHz: 9 }), S('i', 'e', [960, 1020, 860], 0.2, 0, { vib: 0.06, vibHz: 9 })],
  angry: [S('a', 'o', [260, 300, 250], 0.2, 0.04, { growl: 0.6, gain: 0.85 }), S('o', 'u', [280, 320, 240], 0.28, 0, { growl: 0.7, gain: 0.85 })],
  disgust: [S('e', 'a', [520, 470, 360], 0.34, 0, { breath: 0.35 })],
  startle: [S('i', 'i', [820, 1380, 1300], 0.12, 0)],
  hurry: [S('a', 'e', [640, 680], 0.06, 0.025), S('e', 'a', [680, 700], 0.06, 0.025), S('a', 'e', [700, 740], 0.06, 0.025), S('e', 'a', [740, 800], 0.08, 0)],
  whirr: [S('m', 'm', [470, 520, 480], 0.2, 0.04), S('m', 'u', [480, 560, 520], 0.24, 0)],
  hmm: [S('m', 'm', [420, 410, 470], 0.32, 0, { vib: 0.012 })],
  curious: [S('o', 'u', [560, 540], 0.1, 0.06), S('u', 'i', [600, 760, 900], 0.2, 0)],
  content: [S('m', 'o', [520, 560, 500, 470], 0.36, 0, { vib: 0.012, gain: 0.8 })],
  glad: [S('a', 'a', [560, 620], 0.12, 0.05), S('a', 'e', [680, 760, 720], 0.18, 0)],
  sigh: [S('a', 'm', [560, 500, 380, 340], 0.6, 0, { breath: 0.6, gain: 0.7 })],
  grumble: [S('m', 'm', [330, 300], 0.14, 0.04, { growl: 0.3, gain: 0.75 }), S('m', 'm', [320, 280, 260], 0.2, 0, { growl: 0.3, gain: 0.75 })],
  sad: [S('a', 'u', [640, 600, 500, 430], 0.5, 0, { vib: 0.025, vibHz: 5 })],
  blink: [],
  peek: [S('o', 'u', [600, 700], 0.1, 0, { gain: 0.6 })],
  yawn: [S('a', 'o', [620, 520, 420], 0.55, 0.02, { breath: 0.45, gain: 0.75 }), S('o', 'm', [420, 360, 330], 0.4, 0, { breath: 0.3, gain: 0.6 })],
  snore: [S('m', 'm', [180, 200, 190], 0.5, 0.35, { breath: 0.7, gain: 0.45 }), S('m', 'u', [200, 170], 0.5, 0, { breath: 0.7, gain: 0.4 })],
  delight: [S('o', 'u', [600, 820, 1000, 960], 0.3, 0, { vib: 0.018 })],
  pleased: [S('m', 'm', [520, 560], 0.1, 0.04, { gain: 0.8 }), S('m', 'e', [620, 700, 680], 0.16, 0, { gain: 0.8 })],
  love: [S('a', 'u', [560, 640, 700, 640], 0.48, 0, { vib: 0.03, vibHz: 5.5 })],
  confused: [S('e', 'e', [560, 600, 700], 0.16, 0.08), S('u', 'e', [620, 560, 760], 0.22, 0, { vib: 0.02 })],
  aww: [S('a', 'u', [700, 640, 520, 470], 0.5, 0, { vib: 0.02 })],
  frustrated: [S('m', 'a', [380, 460, 520], 0.22, 0.03, { growl: 0.4 }), S('a', 'm', [500, 420], 0.18, 0, { growl: 0.3 })],
  whimper: [S('m', 'i', [720, 800, 700], 0.22, 0.08, { vib: 0.05, vibHz: 7 }), S('i', 'u', [700, 560, 480], 0.32, 0, { vib: 0.05, vibHz: 7 })],
  // Pet sounds
  purr: [S('m', 'm', [430, 410, 420, 400], 0.5, 0.04, { growl: 0.5, gain: 0.55, vib: 0.004 }), S('m', 'o', [420, 440, 400], 0.6, 0, { growl: 0.45, gain: 0.5, vib: 0.004 })],
  giggle: [S('i', 'i', [760, 860], 0.07, 0.045), S('i', 'i', [820, 920], 0.07, 0.045), S('i', 'e', [800, 900], 0.07, 0.045), S('e', 'i', [760, 880, 820], 0.12, 0)],
  squeak: [S('i', 'i', [900, 1340, 1240], 0.14, 0, { gain: 0.85 })],
  hiccup: [S('i', 'u', [780, 1120, 760], 0.08, 0, { gain: 0.8 })],
  sneeze: [S('a', 'a', [600, 690], 0.2, 0.12, { breath: 0.3 }), S('a', 'e', [690, 820], 0.2, 0.08, { breath: 0.35 }), S('u', 'u', [940, 620, 520], 0.16, 0, { breath: 0.9 })],
  stretch: [S('m', 'm', [480, 560, 610], 0.42, 0.05, { vib: 0.02 }), S('a', 'o', [650, 540, 450], 0.46, 0, { breath: 0.3 })],
  hum: [S('m', 'm', [520, 560], 0.24, 0.06, { gain: 0.6 }), S('m', 'm', [600, 640], 0.24, 0.06, { gain: 0.6 }), S('m', 'o', [560, 500], 0.32, 0, { gain: 0.55, vib: 0.015 })],
  dance: [S('a', 'a', [620, 630], 0.12, 0.04), S('i', 'i', [740, 750], 0.12, 0.04), S('a', 'a', [830, 840], 0.12, 0.04), S('i', 'i', [990, 1000], 0.12, 0.04), S('a', 'o', [1240, 1260, 1180], 0.32, 0, { vib: 0.03 })],
  welcome: [S('o', 'o', [620, 830], 0.13, 0.07), S('a', 'i', [760, 950], 0.12, 0.04), S('a', 'i', [830, 1050, 990], 0.22, 0)],
  peekaboo: [S('u', 'u', [500, 780, 720], 0.2, 0)],
  none: [],
};

/** Where Alef's voice sits, relative to the written patterns. */
const VOICE_BASE = 0.56;

export interface VoiceOpts {
  /** 1 = Alef's own pitch; 0.8..1.4. */
  pitch?: number;
  /** 0..1 (on top of the app's volume). */
  volume?: number;
  /** Where to play (tests render offline); the app's sound output otherwise. */
  out?: { ctx: BaseAudioContext; master: AudioNode } | null;
}

let glottal: PeriodicWave | null = null;
let glottalCtx: BaseAudioContext | null = null;
/** A soft, warm buzz: harmonics falling off gently, like a small voice box. */
function glottalWave(ctx: BaseAudioContext): PeriodicWave {
  if (glottal && glottalCtx === ctx) return glottal;
  const n = 40;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = 1 / Math.pow(k, 1.35);
  glottal = ctx.createPeriodicWave(re, im);
  glottalCtx = ctx;
  return glottal;
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** A pitch contour, smoothed into a curve WebAudio can follow (with a small scoop up at the start). */
export function contour(p: number[], pitch: number, steps = 24): Float32Array {
  const pts = p.length === 1 ? [p[0], p[0]] : p;
  const out = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (pts.length - 1);
    const a = Math.floor(t);
    const b = Math.min(pts.length - 1, a + 1);
    const f = t - a;
    const e = f * f * (3 - 2 * f);
    let hz = (pts[a] + (pts[b] - pts[a]) * e) * pitch;
    if (i < 3) hz *= 0.9 + i * 0.035;
    out[i] = Math.max(105, hz);
  }
  return out;
}

let gritCache: Float32Array<ArrayBuffer> | null = null;
/** A coarse staircase: the gentle "digital" edge of a small robot's voice chip. */
function gritCurve(): Float32Array<ArrayBuffer> {
  if (gritCache) return gritCache;
  const n = 1024;
  const steps = 22;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(Math.tanh(x * 1.6) * steps) / steps;
  }
  gritCache = c;
  return c;
}

/** A take: the same utterance, never quite the same twice (pitch, timing and colour vary a little). */
export function vary(syls: Syl[], rnd: () => number = Math.random): Syl[] {
  const shift = 0.94 + rnd() * 0.12;
  const pace = 0.92 + rnd() * 0.16;
  return syls.map((y) => ({
    ...y,
    p: y.p.map((f) => f * shift * (0.985 + rnd() * 0.03)),
    dur: y.dur * pace,
    gap: y.gap * pace,
    vib: (y.vib ?? 0.012) * (0.8 + rnd() * 0.4),
  }));
}

/** Play syllables; returns when each one starts (s, from now) and the total length (s). */
export function play(syls: Syl[], o: VoiceOpts = {}): { starts: number[]; total: number } {
  const out = o.out ?? audioOut();
  if (!out || !syls.length) return { starts: [], total: 0 };
  const { ctx, master } = out;
  // The patterns are written an octave-ish high; Alef's voice sits lower, like a small boy-robot.
  const pitch = Math.max(0.6, Math.min(1.6, o.pitch ?? 1)) * VOICE_BASE;
  const bus = ctx.createGain();
  bus.gain.value = Math.max(0, Math.min(1, o.volume ?? 0.8)) * 0.55;
  // A small robot's speaker: no deep bass, a tinny presence, a soft top, a touch of digital
  // grit mixed in, and a very short, quiet echo, like a small room.
  const low = ctx.createBiquadFilter();
  low.type = 'highpass';
  low.frequency.value = 170;
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2500;
  presence.Q.value = 1.1;
  presence.gain.value = 5;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 6800;
  tone.Q.value = 0.5;
  const grit = ctx.createWaveShaper();
  grit.curve = gritCurve();
  const gritGain = ctx.createGain();
  gritGain.gain.value = 0.16;
  const clean = ctx.createGain();
  clean.gain.value = 0.9;
  bus.connect(low).connect(presence);
  presence.connect(clean).connect(tone);
  presence.connect(grit).connect(gritGain).connect(tone);
  const room = ctx.createDelay(0.1);
  room.delayTime.value = 0.027;
  const roomGain = ctx.createGain();
  roomGain.gain.value = 0.16;
  // Even loudness whichever vowel lands on a harmonic: a gentle compressor.
  const even = ctx.createDynamicsCompressor();
  even.threshold.value = -22;
  even.knee.value = 14;
  even.ratio.value = 5;
  even.attack.value = 0.004;
  even.release.value = 0.12;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.5;
  tone.connect(even).connect(makeup).connect(master);
  makeup.connect(room).connect(roomGain).connect(master);

  let t = ctx.currentTime + 0.02;
  const t0 = t;
  const starts: number[] = [];
  const formantScale = 1 + ((o.pitch ?? 1) - 1) * 0.5;
  for (const y of syls) {
    starts.push(t - t0);
    const end = t + y.dur;
    // Source: a soft buzz following the pitch contour, with vibrato after the onset.
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(glottalWave(ctx));
    osc.frequency.setValueCurveAtTime(contour(y.p, pitch), t, y.dur);
    const vib = y.vib ?? 0.012;
    if (vib > 0 && y.dur > 0.12) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = y.vibHz ?? 6;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(vib * y.p[0] * pitch, t + Math.min(0.12, y.dur / 2));
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end + 0.05);
    }
    // A little irregularity, as in any living voice.
    const jit = ctx.createOscillator();
    const jg = ctx.createGain();
    jit.type = 'triangle';
    jit.frequency.value = 9 + Math.random() * 5;
    jg.gain.value = y.p[0] * pitch * 0.007;
    jit.connect(jg).connect(osc.frequency);
    jit.start(t);
    jit.stop(end + 0.05);
    // The envelope: a soft start, a little swell, a gentle fall.
    const env = ctx.createGain();
    const peak = (y.gain ?? 1) * 0.9;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.03, y.dur / 3));
    env.gain.setValueAtTime(peak, t + y.dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    if (y.growl) {
      const fl = ctx.createOscillator();
      const fg = ctx.createGain();
      fl.frequency.value = 27;
      fg.gain.value = peak * y.growl * 0.5;
      fl.connect(fg).connect(env.gain);
      fl.start(t);
      fl.stop(end + 0.05);
    }
    // Three formants, gliding from one vowel to the next.
    const v0 = FORMANTS[y.v0];
    const v1 = FORMANTS[y.v1 ?? y.v0];
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(v0.f[k] * formantScale, t);
      bp.frequency.linearRampToValueAtTime(v1.f[k] * formantScale, end);
      bp.Q.value = [4.2, 7, 9][k];
      const g = ctx.createGain();
      g.gain.setValueAtTime(v0.g[k] * [3, 3.8, 4.2][k], t);
      g.gain.linearRampToValueAtTime(v1.g[k] * [3, 3.8, 4.2][k], end);
      osc.connect(bp).connect(g).connect(env);
    }
    // A little body under the formants.
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 900;
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0.18;
    osc.connect(body).connect(bodyG).connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(end + 0.08);
    // Air: breathy sounds get more of it; every syllable gets a whisper.
    const air = y.breath ?? 0.06;
    if (air > 0) {
      const n = ctx.createBufferSource();
      n.buffer = noise(ctx);
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 2600 * formantScale;
      nf.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(air * 0.5, t + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
      n.connect(nf).connect(ng).connect(bus);
      n.start(t, Math.random() * 0.5);
      n.stop(end + 0.06);
    }
    t = end + y.gap;
  }
  if (!o.out)
    setTimeout(() => {
      bus.disconnect();
      roomGain.disconnect();
    }, (t - ctx.currentTime + 0.6) * 1000);
  return { starts, total: t - t0 };
}

export function chirp(id: ChirpId, o: VoiceOpts = {}) {
  return play(vary(PATTERNS[id] ?? []), o);
}

const VOWEL_OF: Record<string, Vowel> = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'i' };

/**
 * A sentence in Alef's gibberish: one syllable per vowel group of each word, sung on the
 * sentence's tune — it drifts down as a statement goes on, a question lifts at the end, an
 * exclamation sits higher and lands. Pure (returns syllables to play).
 */
export function babbleSyllables(text: string, seed = 1): Syl[] {
  let r = seed || 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const words = text.replace(/https?:\/\/\S+/g, 'link').split(/\s+/).filter(Boolean).slice(0, 26);
  const end = /\?\s*$/.test(text) ? 'ask' : /!\s*$/.test(text) ? 'lift' : 'settle';
  const lift = end === 'lift' ? 1.12 : 1;
  const sylls: { v: Vowel; next: Vowel; wordEnd: boolean; pause: number }[] = [];
  for (const w of words) {
    const groups = w.toLowerCase().match(/[aeiouy]+/g) ?? ['m'];
    const n = Math.min(3, groups.length);
    for (let k = 0; k < n; k++) {
      const g = groups[k];
      const v = g === 'm' ? 'm' : (VOWEL_OF[g[0]] ?? 'a');
      const next = g.length > 1 ? (VOWEL_OF[g[g.length - 1]] ?? v) : v;
      sylls.push({ v, next, wordEnd: k === n - 1, pause: k === n - 1 && /[,.;:]$/.test(w) ? 0.16 : 0 });
    }
  }
  const N = sylls.length;
  return sylls.map((s, i) => {
    const pos = N > 1 ? i / (N - 1) : 0;
    const base = 560 * lift * (1.06 - pos * 0.16) * (0.92 + rnd() * 0.16);
    const last = i === N - 1;
    let p = [base, base * (1.02 + rnd() * 0.06), base * (0.96 + rnd() * 0.06)];
    if (last && end === 'ask') p = [base * 0.95, base * 1.1, base * 1.42];
    if (last && end === 'lift') p = [base * 1.05, base * 1.18, base * 0.92];
    if (last && end === 'settle') p = [base, base * 0.9, base * 0.76];
    const dur = 0.085 + rnd() * 0.05 + (last ? 0.09 : 0);
    return S(s.v, s.next, p, dur, (s.wordEnd ? 0.06 + rnd() * 0.03 : 0.02) + s.pause, { gain: 0.72 + rnd() * 0.18, vib: last ? 0.018 : 0.006 });
  });
}

export function babble(text: string, o: VoiceOpts = {}) {
  return play(babbleSyllables(text, text.length * 31 + 7), o);
}
