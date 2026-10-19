// Audio helpers for voice input: a streaming resampler to Whistle's 16 kHz, and a small
// energy-based voice-activity detector. Pure functions and classes, no DOM, so they test fast.

export const SPEECH_RATE = 16_000;

/**
 * Streaming windowed-sinc resampler (Blackman window). Handles any input rate, including
 * fractional ratios like 44.1 kHz → 16 kHz, and keeps its history between chunks so there
 * are no clicks at chunk boundaries. The low-pass sits just under the output's Nyquist.
 */
export class Resampler {
  readonly ratio: number;
  #taps: number;
  /** PHASES rows of 2·taps coefficients, each row normalised to unit DC gain. */
  #table: Float32Array;
  #history: Float32Array;
  /** Position of the next output sample, in input samples, relative to the history start. */
  #pos: number;
  static readonly PHASES = 128;

  constructor(
    readonly from: number,
    readonly to = SPEECH_RATE,
    halfTaps = 16,
  ) {
    if (!(from > 0) || !(to > 0)) throw new Error('sample rates must be positive');
    this.ratio = from / to;
    this.#taps = halfTaps;
    this.#history = new Float32Array(halfTaps * 2);
    this.#pos = halfTaps;
    // Normalised cutoff (cycles per input sample); 0.45 of the output rate leaves a guard band.
    const fc = Math.min(0.5, (0.45 * to) / from);
    const width = halfTaps * 2;
    const P = Resampler.PHASES;
    this.#table = new Float32Array(P * width);
    for (let ph = 0; ph < P; ph++) {
      const frac = ph / P;
      let norm = 0;
      for (let j = 0; j < width; j++) {
        const x = j - halfTaps + 1 - frac;
        const a = 2 * Math.PI * fc * x;
        const sinc = x === 0 ? 1 : Math.sin(a) / a;
        const t = (x + halfTaps) / width;
        const w = t <= 0 || t >= 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * t) + 0.08 * Math.cos(4 * Math.PI * t);
        const c = sinc * w;
        this.#table[ph * width + j] = c;
        norm += c;
      }
      for (let j = 0; j < width; j++) this.#table[ph * width + j] /= norm || 1;
    }
  }

  /** Resamples one chunk; returns the output samples it completed. */
  push(input: Float32Array): Float32Array {
    if (this.from === this.to) return input.slice();
    const h = this.#taps;
    const width = h * 2;
    const P = Resampler.PHASES;
    const table = this.#table;
    const buf = new Float32Array(this.#history.length + input.length);
    buf.set(this.#history);
    buf.set(input, this.#history.length);
    const room = Math.max(0, Math.ceil((buf.length - h - this.#pos) / this.ratio));
    const out = new Float32Array(room);
    let n = 0;
    while (this.#pos + h < buf.length) {
      const centre = Math.floor(this.#pos);
      const ph = Math.min(P - 1, Math.round((this.#pos - centre) * P));
      const row = ph * width;
      const base = centre - h + 1;
      let acc = 0;
      for (let j = 0; j < width; j++) acc += buf[base + j] * table[row + j];
      out[n++] = acc;
      this.#pos += this.ratio;
    }
    // Keep the last 2h samples as history and rebase the position onto it.
    const keep = Math.min(buf.length, width);
    const drop = buf.length - keep;
    this.#history = buf.slice(drop);
    this.#pos -= drop;
    return n === out.length ? out : out.slice(0, n);
  }
}

export interface VadState {
  speaking: boolean;
  /** Any speech heard since the start. */
  heard: boolean;
  /** Milliseconds of quiet since the last speech. */
  quietMs: number;
}

/**
 * Energy VAD with an adaptive noise floor: speech is a frame clearly above the floor. Good
 * enough to end hands-free listening after a pause; Whistle itself decides what was said.
 */
export class VoiceActivity {
  #floor = 0.004;
  #speaking = false;
  #heard = false;
  #quietMs = 0;
  #speechMs = 0;

  constructor(
    /** Frames needed above the threshold before it counts as speech. */
    readonly attackMs = 60,
  ) {}

  /** Feed one frame's RMS and its duration; returns the state after it. */
  push(rms: number, ms: number): VadState {
    const threshold = Math.max(0.012, this.#floor * 3.2);
    if (rms > threshold) {
      this.#speechMs += ms;
      if (this.#speechMs >= this.attackMs) {
        this.#speaking = true;
        this.#heard = true;
      }
      this.#quietMs = 0;
    } else {
      this.#speechMs = 0;
      if (this.#speaking || this.#heard) this.#quietMs += ms;
      this.#speaking = false;
      // The floor follows quiet frames quickly downwards and slowly upwards.
      const k = rms < this.#floor ? 0.2 : 0.01;
      this.#floor += (rms - this.#floor) * k;
    }
    return { speaking: this.#speaking, heard: this.#heard, quietMs: this.#quietMs };
  }

  get floor() {
    return this.#floor;
  }
}

/** 0..1 loudness for drawing: a soft log curve over the speech range. */
export function loudness(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 58) / 46));
}

/** Joins consecutive Float32Arrays. */
export function concat(parts: Float32Array[]): Float32Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
