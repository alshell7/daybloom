// Alef's voice without words: little electronic chirps and vocalisations, synthesised with
// WebAudio (no files). Each syllable is a gliding tone with a touch of FM shimmer and vibrato
// through a soft formant filter; feelings shape the melody (happy rises, sad falls, a question
// lifts at the end). `babble` turns a sentence into chirps with its rhythm, for "speaking".

import { audioOut } from '../../sound';
import type { ChirpId } from './behaviors';

export interface Syl {
  /** Start and end pitch (Hz, before the voice's pitch is applied). */
  f0: number;
  f1: number;
  dur: number;
  /** Pause after it (s). */
  gap: number;
  type?: OscillatorType;
  /** Vibrato depth (0..0.08 of the pitch). */
  vib?: number;
  gain?: number;
  /** A breath of noise (sigh, yawn, snore). */
  noise?: number;
}

const s = (f0: number, f1: number, dur: number, gap = 0.04, o: Partial<Syl> = {}): Syl => ({ f0, f1, dur, gap, ...o });

export const PATTERNS: Record<ChirpId, Syl[]> = {
  happy: [s(620, 820, 0.09), s(760, 980, 0.09), s(900, 1240, 0.13, 0)],
  excited: [s(600, 760, 0.06, 0.02), s(720, 900, 0.06, 0.02), s(860, 1080, 0.06, 0.02), s(1000, 1300, 0.07, 0.02), s(1250, 1500, 0.12, 0, { vib: 0.05 })],
  fanfare: [s(660, 660, 0.1, 0.03), s(830, 830, 0.1, 0.03), s(990, 990, 0.1, 0.03), s(1320, 1500, 0.32, 0, { vib: 0.06 })],
  proud: [s(500, 640, 0.12, 0.05), s(700, 860, 0.2, 0, { vib: 0.03 })],
  amazed: [s(500, 1300, 0.22, 0.06, { vib: 0.02 }), s(1200, 1100, 0.12, 0)],
  afraid: [s(900, 820, 0.06, 0.03, { vib: 0.07 }), s(860, 760, 0.06, 0.03, { vib: 0.07 }), s(800, 640, 0.12, 0, { vib: 0.08 })],
  angry: [s(230, 190, 0.1, 0.04, { type: 'square', gain: 0.5 }), s(240, 180, 0.1, 0.04, { type: 'square', gain: 0.5 }), s(260, 170, 0.16, 0, { type: 'square', gain: 0.55 })],
  disgust: [s(420, 300, 0.22, 0, { type: 'sawtooth', gain: 0.35, noise: 0.25 })],
  startle: [s(900, 1700, 0.07, 0)],
  hurry: [s(700, 740, 0.04, 0.02), s(720, 760, 0.04, 0.02), s(740, 780, 0.04, 0.02), s(760, 800, 0.04, 0.02), s(780, 860, 0.06, 0)],
  whirr: [s(500, 560, 0.08, 0.02, { vib: 0.04, gain: 0.5 }), s(560, 500, 0.08, 0.02, { vib: 0.04, gain: 0.5 }), s(500, 600, 0.1, 0, { vib: 0.04, gain: 0.5 })],
  hmm: [s(380, 420, 0.24, 0, { vib: 0.02, gain: 0.6 })],
  curious: [s(560, 600, 0.08, 0.05), s(620, 980, 0.16, 0)],
  content: [s(520, 600, 0.18, 0.06, { vib: 0.02, gain: 0.55 }), s(560, 520, 0.16, 0, { gain: 0.5 })],
  glad: [s(600, 760, 0.1, 0.04), s(740, 820, 0.14, 0)],
  sigh: [s(520, 360, 0.42, 0, { noise: 0.4, gain: 0.45 })],
  grumble: [s(300, 270, 0.12, 0.03, { type: 'sawtooth', gain: 0.3 }), s(290, 250, 0.16, 0, { type: 'sawtooth', gain: 0.3 })],
  sad: [s(640, 480, 0.3, 0.1, { vib: 0.04 }), s(500, 340, 0.4, 0, { vib: 0.05 })],
  blink: [],
  peek: [s(700, 760, 0.05, 0, { gain: 0.35 })],
  yawn: [s(560, 300, 0.7, 0, { noise: 0.35, vib: 0.02, gain: 0.5 })],
  snore: [s(160, 200, 0.6, 0.3, { noise: 0.5, gain: 0.25 }), s(200, 150, 0.6, 0, { noise: 0.5, gain: 0.2 })],
  delight: [s(700, 1100, 0.1, 0.03), s(1000, 1400, 0.16, 0, { vib: 0.04 })],
  pleased: [s(640, 780, 0.1, 0.03, { gain: 0.6 }), s(760, 820, 0.08, 0, { gain: 0.55 })],
  love: [s(520, 660, 0.18, 0.08, { vib: 0.05 }), s(600, 760, 0.26, 0, { vib: 0.05 })],
  confused: [s(600, 760, 0.1, 0.04), s(740, 620, 0.1, 0.04), s(640, 920, 0.16, 0)],
  aww: [s(620, 420, 0.4, 0, { vib: 0.03 })],
  frustrated: [s(420, 520, 0.08, 0.02, { type: 'sawtooth', gain: 0.3 }), s(520, 420, 0.08, 0.02, { type: 'sawtooth', gain: 0.3 }), s(460, 380, 0.14, 0, { type: 'sawtooth', gain: 0.3 })],
  whimper: [s(720, 560, 0.18, 0.08, { vib: 0.07 }), s(640, 460, 0.26, 0, { vib: 0.08 })],
  none: [],
};

export interface VoiceOpts {
  /** 1 = Alef's own pitch; 0.8..1.4. */
  pitch?: number;
  /** 0..1 (on top of the app's volume). */
  volume?: number;
}

/** Play syllables; returns when each one starts (s, from now) and the total length (s). */
export function play(syls: Syl[], o: VoiceOpts = {}): { starts: number[]; total: number } {
  const out = audioOut();
  if (!out || !syls.length) return { starts: [], total: 0 };
  const { ctx, master } = out;
  const pitch = Math.max(0.6, Math.min(1.6, o.pitch ?? 1));
  const vol = Math.max(0, Math.min(1, o.volume ?? 0.8)) * 0.16;
  const bus = ctx.createGain();
  bus.gain.value = vol;
  // A soft formant: a cute, rounded "oo-ee" colour rather than a raw beep.
  const formant = ctx.createBiquadFilter();
  formant.type = 'peaking';
  formant.frequency.value = 1800 * pitch;
  formant.Q.value = 1.1;
  formant.gain.value = 6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  bus.connect(formant).connect(lp).connect(master);

  let t = ctx.currentTime + 0.02;
  const t0 = t;
  const starts: number[] = [];
  for (const y of syls) {
    starts.push(t - t0);
    const f0 = y.f0 * pitch;
    const f1 = y.f1 * pitch;
    const g = ctx.createGain();
    const peak = y.gain ?? 0.8;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.012, y.dur / 4));
    g.gain.setValueAtTime(peak, t + y.dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + y.dur);
    g.connect(bus);
    const o1 = ctx.createOscillator();
    o1.type = y.type ?? 'triangle';
    o1.frequency.setValueAtTime(f0, t);
    o1.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + y.dur);
    // FM shimmer: a sine an octave up wobbles the pitch a little — the "electronic" part.
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.frequency.setValueAtTime(f0 * 2.01, t);
    mod.frequency.exponentialRampToValueAtTime(Math.max(40, f1 * 2.01), t + y.dur);
    modGain.gain.value = f0 * 0.18;
    mod.connect(modGain).connect(o1.frequency);
    if (y.vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 22;
      lg.gain.value = f0 * y.vib;
      lfo.connect(lg).connect(o1.frequency);
      lfo.start(t);
      lfo.stop(t + y.dur + 0.02);
    }
    o1.connect(g);
    o1.start(t);
    mod.start(t);
    o1.stop(t + y.dur + 0.02);
    mod.stop(t + y.dur + 0.02);
    if (y.noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * y.dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const n = ctx.createBufferSource();
      n.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.value = y.noise * 0.5;
      n.connect(bp).connect(ng).connect(bus);
      n.start(t);
    }
    t += y.dur + y.gap;
  }
  setTimeout(() => bus.disconnect(), (t - ctx.currentTime + 0.5) * 1000);
  return { starts, total: t - t0 };
}

export function chirp(id: ChirpId, o: VoiceOpts = {}) {
  return play(PATTERNS[id] ?? [], o);
}

/**
 * A sentence as chirps: one to three syllables a word, in its rhythm. A question rises at
 * the end, an exclamation lifts, a statement settles. Pure (returns syllables to play).
 */
export function babbleSyllables(text: string, seed = 1): Syl[] {
  let r = seed || 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const words = text.replace(/https?:\/\/\S+/g, 'link').split(/\s+/).filter(Boolean).slice(0, 28);
  const end = /\?\s*$/.test(text) ? 'ask' : /!\s*$/.test(text) ? 'lift' : 'settle';
  const out: Syl[] = [];
  words.forEach((w, wi) => {
    const n = Math.max(1, Math.min(3, Math.round(w.replace(/[^a-z0-9]/gi, '').length / 3.2)));
    for (let k = 0; k < n; k++) {
      const last = wi === words.length - 1 && k === n - 1;
      let f0 = 520 + rnd() * 260;
      let f1 = f0 * (0.92 + rnd() * 0.22);
      if (last && end === 'ask') f1 = f0 * 1.45;
      if (last && end === 'lift') f1 = f0 * 1.3;
      if (last && end === 'settle') f1 = f0 * 0.72;
      const dur = 0.06 + rnd() * 0.05 + (last ? 0.06 : 0);
      out.push(s(f0, f1, dur, k === n - 1 ? 0.07 + rnd() * 0.04 : 0.025, { gain: 0.55 + rnd() * 0.2 }));
    }
    // A breath at commas and full stops.
    if (/[,.;:]$/.test(w) && out.length) out[out.length - 1].gap += 0.12;
  });
  return out;
}

export function babble(text: string, o: VoiceOpts = {}) {
  return play(babbleSyllables(text, text.length * 31 + 7), o);
}
