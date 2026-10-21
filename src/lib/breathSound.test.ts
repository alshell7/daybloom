// The breathing guide's sounds rendered offline and measured: exact length, level (peak, RMS),
// no clipping, a gentle start, silence at the end, where the energy sits (the in-breath brighter
// than the warm out-breath), little in the harsh highs or the rumble, and every breath a little
// different. Set BREATH_WAV_DIR to also write each sound, and whole rounds of box and calm
// breathing, as WAV files to listen to (BREATH_REPORT prints the numbers).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BREATH_LEVEL, cueAudio, renderBreath, renderChime, type BreathCue, type BreathVoice } from './breathSound';

const SR = 48000;
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-12));

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
}

/** Welch power spectrum of a stretch of signal (Hann windows, half overlap). */
function spectrum(x: Float32Array, from = 0, to = x.length, n = 4096) {
  const p = new Float64Array(n / 2);
  const win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let s = from; s + n <= to; s += n / 2) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    for (let k = 0; k < n / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k];
  }
  return { p, df: SR / n };
}

function bands(x: Float32Array, from?: number, to?: number) {
  const { p, df } = spectrum(x, from, to);
  let total = 0;
  let high = 0;
  let low = 0;
  let centroid = 0;
  p.forEach((v, k) => {
    const f = k * df;
    total += v;
    centroid += v * f;
    if (f > 4000) high += v;
    if (f < 150) low += v;
  });
  return { centroid: centroid / total, high: high / total, low: low / total };
}

function measure(ch: Float32Array[]) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  let bad = 0;
  for (const c of ch) {
    for (let i = 0; i < c.length; i++) {
      if (!Number.isFinite(c[i])) bad++;
      peak = Math.max(peak, Math.abs(c[i]));
      sum += c[i] * c[i];
    }
    n += c.length;
  }
  return { peak, rms: Math.sqrt(sum / n), bad };
}

/** The level over time: RMS in 50 ms windows. */
function envelope(x: Float32Array, win = Math.round(SR * 0.05)) {
  const out: number[] = [];
  for (let s = 0; s + win <= x.length; s += win) {
    let sum = 0;
    for (let i = s; i < s + win; i++) sum += x[i] * x[i];
    out.push(Math.sqrt(sum / win));
  }
  return out;
}

function wav(path: string, ch: Float32Array[]) {
  const n = ch[0].length;
  const buf = Buffer.alloc(44 + n * ch.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch.length, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * ch.length * 2, 28);
  buf.writeUInt16LE(ch.length * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch.length * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i])) * 32767), 44 + (i * ch.length + c) * 2);
  writeFileSync(path, buf);
}

/** A whole guide's sound, as it plays: each phase's cue at the phase's start. */
function sequence(phases: [BreathCue, number][], rounds: number, voice: BreathVoice) {
  const cycle = phases.reduce((a, [, s]) => a + s, 0);
  const len = Math.round((cycle * rounds + 3) * SR);
  const out = [new Float32Array(len), new Float32Array(len)];
  let t = 0.5;
  for (let r = 0; r < rounds; r++) {
    for (const [cue, s] of phases) {
      const a = cueAudio(cue, voice, s, SR, 1000 + r * 4 + phases.findIndex(([c]) => c === cue));
      if (a) {
        const at = Math.round(t * SR);
        a.forEach((c, i) => {
          for (let j = 0; j < c.length && at + j < len; j++) out[i][at + j] += c[j];
        });
      }
      t += s;
    }
  }
  return out;
}

const report = (line: string) => process.env.BREATH_REPORT && console.log(line);

describe('breath sounds', () => {
  for (const kind of ['in', 'out'] as const) {
    for (const secs of [3, 4, 6]) {
      it(`${kind}-breath, ${secs} s: length, level, a gentle start, a quiet end`, () => {
        const t0 = performance.now();
        const ch = renderBreath(kind, secs, SR, 7);
        const ms = performance.now() - t0;
        expect(ch).toHaveLength(2);
        const n = Math.round(secs * SR);
        // Exactly the phase, plus a short room tail.
        expect(ch[0].length).toBeGreaterThanOrEqual(n);
        expect(ch[0].length).toBeLessThanOrEqual(n + Math.round(0.1 * SR));
        const m = measure(ch);
        expect(m.bad).toBe(0);
        // Soft: peaks ≥ 10 dB below full scale, matched loudness.
        expect(m.peak).toBeLessThanOrEqual(BREATH_LEVEL[kind].peak + 1e-6);
        expect(db(m.rms)).toBeGreaterThan(-31);
        expect(db(m.rms)).toBeLessThan(-24);
        const env = envelope(ch[0]);
        const top = Math.max(...env);
        // A gentle start: the first 100 ms is far below the breath's body (no puff or click)…
        expect(env[0]).toBeLessThan(top * (kind === 'in' ? 0.05 : 0.2));
        expect(env[1]).toBeLessThan(top * (kind === 'in' ? 0.12 : 0.45));
        // …and it has faded to nothing by the end of its phase.
        let tail = 0;
        for (let i = n - Math.round(0.02 * SR); i < ch[0].length; i++) tail = Math.max(tail, Math.abs(ch[0][i]), Math.abs(ch[1][i]));
        expect(tail).toBeLessThan(m.peak * 0.02);
        // The in-breath swells to its fullest past the middle; the out-breath early, then falls away.
        const at = env.indexOf(top) / env.length;
        if (kind === 'in') expect(at).toBeGreaterThan(0.35);
        else expect(at).toBeLessThan(0.4);
        const b = bands(ch[0]);
        report(
          `${kind.padEnd(3)} ${secs}s  peak ${db(m.peak).toFixed(1)} dBFS  rms ${db(m.rms).toFixed(1)} dBFS  centroid ${b.centroid.toFixed(0)} Hz  >4k ${(b.high * 100).toFixed(1)}%  <150 ${(b.low * 100).toFixed(1)}%  peak at ${(at * 100).toFixed(0)}%  render ${ms.toFixed(0)} ms`,
        );
        // Air, not hiss, not rumble.
        expect(b.high).toBeLessThan(kind === 'in' ? 0.12 : 0.06);
        expect(b.low).toBeLessThan(0.05);
        expect(ms).toBeLessThan(400);
      });
    }
  }

  it('the in-breath brightens as it fills; the out-breath is warmer and darkens as it ends', () => {
    const inn = renderBreath('in', 4, SR, 3)[0];
    const out = renderBreath('out', 4, SR, 3)[0];
    const n = 4 * SR;
    const early = bands(inn, Math.round(n * 0.1), Math.round(n * 0.4)).centroid;
    const late = bands(inn, Math.round(n * 0.55), Math.round(n * 0.85)).centroid;
    expect(late).toBeGreaterThan(early * 1.15);
    const oEarly = bands(out, Math.round(n * 0.08), Math.round(n * 0.4)).centroid;
    const oLate = bands(out, Math.round(n * 0.55), Math.round(n * 0.9)).centroid;
    expect(oLate).toBeLessThan(oEarly);
    expect(bands(out).centroid).toBeLessThan(bands(inn).centroid);
  });

  it('every breath is a little different, and the same seed is the same breath', () => {
    const a = renderBreath('out', 4, SR, 1)[0];
    const b = renderBreath('out', 4, SR, 2)[0];
    const ea = envelope(a);
    const eb = envelope(b);
    let diff = 0;
    for (let i = 0; i < ea.length; i++) diff += Math.abs(ea[i] - eb[i]);
    expect(diff / ea.reduce((s, v) => s + v, 0)).toBeGreaterThan(0.04);
    expect(renderBreath('out', 4, SR, 1)).toBe(renderBreath('out', 4, SR, 1));
  });

  for (const cue of ['in', 'hold', 'out', 'rest'] as const) {
    it(`tone for ${cue}: soft attack, low level, rings out`, () => {
      const ch = renderChime(cue, SR);
      const m = measure(ch);
      expect(m.bad).toBe(0);
      expect(m.peak).toBeLessThanOrEqual(0.17);
      // The attack takes ~35 ms: no hard tick.
      let first = 0;
      for (let i = 0; i < Math.round(0.004 * SR); i++) first = Math.max(first, Math.abs(ch[0][i]));
      expect(first).toBeLessThan(m.peak * 0.15);
      expect(Math.abs(ch[0][ch[0].length - 1])).toBeLessThan(1e-4);
      const b = bands(ch[0]);
      expect(b.high).toBeLessThan(0.01);
      report(`tone ${cue.padEnd(4)} peak ${db(m.peak).toFixed(1)} dBFS  rms ${db(m.rms).toFixed(1)} dBFS  centroid ${b.centroid.toFixed(0)} Hz  ${(ch[0].length / SR).toFixed(1)} s`);
    });
  }

  it('hold and rest are silent with the breath voice', () => {
    expect(cueAudio('hold', 'breath', 4, SR)).toBeNull();
    expect(cueAudio('rest', 'breath', 4, SR)).toBeNull();
    expect(cueAudio('in', 'breath', 4, SR)).not.toBeNull();
  });

  it('writes WAV files to listen to (BREATH_WAV_DIR)', () => {
    const dir = process.env.BREATH_WAV_DIR;
    if (!dir) return;
    for (const s of [4, 6]) {
      wav(join(dir, `breath-in-${s}s.wav`), renderBreath('in', s, SR, 11));
      wav(join(dir, `breath-out-${s}s.wav`), renderBreath('out', s, SR, 11));
    }
    for (const c of ['in', 'hold', 'out', 'rest'] as const) wav(join(dir, `tone-${c}.wav`), renderChime(c, SR));
    const box: [BreathCue, number][] = [
      ['in', 4],
      ['hold', 4],
      ['out', 4],
      ['rest', 4],
    ];
    const calm: [BreathCue, number][] = [
      ['in', 4],
      ['hold', 4],
      ['out', 6],
      ['rest', 2],
    ];
    const box4 = sequence(box, 4, 'breath');
    report(`box minute  peak ${db(measure(box4).peak).toFixed(1)} dBFS  rms ${db(measure(box4).rms).toFixed(1)} dBFS (with the silences)`);
    wav(join(dir, 'box-4s-breath-4-rounds.wav'), box4);
    wav(join(dir, 'calm-breath-2-rounds.wav'), sequence(calm, 2, 'breath'));
    wav(join(dir, 'box-4s-tones-2-rounds.wav'), sequence(box, 2, 'tones'));
  });
});
