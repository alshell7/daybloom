// Alarm tones rendered offline and measured: level (peak, RMS), no clipping, a seamless loop,
// where the pitch sits and how little energy lives in the harsh highs. Set ALARM_WAV_DIR to
// also write each tone (two laps of the loop, and the preview) as a WAV file to listen to.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALARM_TONES, DEFAULT_TONE, alarmGain, hz, renderTone, toneById } from './alarm';

const SR = 44100;

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

/** Welch power spectrum of a signal (Hann windows, half overlap). */
function spectrum(x: Float32Array, n = 8192) {
  const p = new Float64Array(n / 2);
  const win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let s = 0; s + n <= x.length; s += n / 2) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    for (let k = 0; k < n / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k];
  }
  return { p, df: SR / n };
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
  const rms = Math.sqrt(sum / n);
  // Two laps of the left channel, so the analysis windows cross the loop point too.
  const two = new Float32Array(ch[0].length * 2);
  two.set(ch[0]);
  two.set(ch[0], ch[0].length);
  const { p, df } = spectrum(two);
  let total = 0;
  let high = 0;
  let low = 0;
  let centroid = 0;
  let best = 0;
  let f0 = 0;
  p.forEach((v, k) => {
    const f = k * df;
    total += v;
    centroid += v * f;
    if (f > 4000) high += v;
    if (f < 150) low += v;
    if (f > 150 && f < 2000 && v > best) {
      best = v;
      f0 = f;
    }
  });
  return { peak, rms, bad, high: high / total, low: low / total, centroid: centroid / total, f0, two };
}

const db = (v: number) => 20 * Math.log10(v);

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

describe('alarm tones', () => {
  it('has 6–8 tones with unique ids, and dawn is the default', () => {
    expect(ALARM_TONES.length).toBeGreaterThanOrEqual(6);
    expect(ALARM_TONES.length).toBeLessThanOrEqual(8);
    expect(new Set(ALARM_TONES.map((t) => t.id)).size).toBe(ALARM_TONES.length);
    expect(DEFAULT_TONE).toBe('dawn');
    expect(toneById('nope').id).toBe('dawn');
    expect(toneById(undefined).id).toBe('dawn');
  });

  it('reads note names', () => {
    expect(hz('A4')).toBeCloseTo(440, 6);
    expect(hz('C5')).toBeCloseTo(523.2511, 3);
    expect(hz('C#5')).toBeCloseTo(554.3653, 3);
    expect(hz(300)).toBe(300);
  });

  it('every note stays in a friendly register (no shrill fundamentals)', () => {
    for (const t of ALARM_TONES) for (const [, p] of t.notes) expect(hz(p), `${t.id} ${p}`).toBeGreaterThan(300), expect(hz(p), `${t.id} ${p}`).toBeLessThan(1100);
  });

  it('the volume curve is monotonic and full at the top', () => {
    expect(alarmGain(0)).toBe(0);
    expect(alarmGain(1)).toBe(1);
    expect(alarmGain(0.5)).toBeGreaterThan(alarmGain(0.3));
    expect(alarmGain(2)).toBe(1);
  });

  const report: string[] = [];
  for (const t of ALARM_TONES) {
    it(`${t.name}: level, loop, pitch and softness`, () => {
      const t0 = performance.now();
      const loop = renderTone(t.id, SR, 'loop');
      const ms = performance.now() - t0;
      expect(loop).toHaveLength(2);
      expect(loop[0].length).toBe(Math.round(t.period * SR));
      const m = measure(loop);
      report.push(`${t.name.padEnd(10)} peak ${db(m.peak).toFixed(1)} dBFS  rms ${db(m.rms).toFixed(1)} dBFS  f0 ${m.f0.toFixed(0)} Hz  centroid ${m.centroid.toFixed(0)} Hz  >4k ${(m.high * 100).toFixed(2)}%  <150 ${(m.low * 100).toFixed(2)}%  render ${ms.toFixed(0)} ms`);
      if (process.env.ALARM_REPORT) console.log(report.at(-1));
      expect(m.bad).toBe(0);
      // Matched loudness, never near clipping (at full volume).
      expect(m.peak).toBeLessThanOrEqual(0.601);
      expect(m.peak).toBeGreaterThan(0.25);
      expect(db(m.rms)).toBeGreaterThan(-27);
      expect(db(m.rms)).toBeLessThan(-18.5);
      // Seamless: the jump across the loop point is no bigger than the signal's own steps.
      for (const c of loop) {
        let maxStep = 0;
        for (let i = 1; i < c.length; i++) maxStep = Math.max(maxStep, Math.abs(c[i] - c[i - 1]));
        expect(Math.abs(c[0] - c[c.length - 1])).toBeLessThanOrEqual(maxStep + 1e-6);
      }
      // Pitch where a voice is warm, little energy in the harsh highs or the rumble.
      expect(m.f0).toBeGreaterThan(300);
      expect(m.f0).toBeLessThan(1100);
      expect(m.centroid).toBeLessThan(1500);
      expect(m.high).toBeLessThan(0.01);
      expect(m.low).toBeLessThan(0.02);
      // The preview has the same loudness and rings out to silence.
      const once = renderTone(t.id, SR, 'once');
      const mo = measure(once);
      expect(mo.peak).toBeLessThanOrEqual(0.62);
      expect(Math.abs(once[0][once[0].length - 1])).toBeLessThan(1e-3);
      expect(ms).toBeLessThan(1500);
      const dir = process.env.ALARM_WAV_DIR;
      if (dir) {
        const laps = loop.map((c) => {
          const o = new Float32Array(c.length * 3);
          for (let k = 0; k < 3; k++) o.set(c, k * c.length);
          return o;
        });
        wav(join(dir, `alarm-${t.id}-loop.wav`), laps);
        wav(join(dir, `alarm-${t.id}-preview.wav`), once);
      }
    });
  }

  it('renders the same every time (cached and deterministic)', () => {
    const a = renderTone('harp', 22050, 'loop');
    const b = renderTone('harp', 22050, 'loop');
    expect(a).toBe(b);
  });
});
