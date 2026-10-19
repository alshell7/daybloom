import { describe, expect, it } from 'vitest';
import { Resampler, VoiceActivity, concat, loudness } from './audio';

const sine = (rate: number, hz: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

/** Dominant frequency by zero crossings. */
function freq(x: Float32Array, rate: number) {
  let z = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) z++;
  return (z / 2) * (rate / x.length);
}

describe('Resampler', () => {
  it('48 kHz → 16 kHz keeps a 1 kHz tone and its level', () => {
    const r = new Resampler(48_000);
    const out = r.push(sine(48_000, 1000, 1));
    expect(out.length).toBeGreaterThan(15_950);
    expect(out.length).toBeLessThanOrEqual(16_000);
    const mid = out.slice(400, 15_000);
    expect(freq(mid, 16_000)).toBeCloseTo(1000, -1);
    expect(rms(mid)).toBeCloseTo(0.5 / Math.SQRT2, 1);
  });

  it('44.1 kHz (a fractional ratio) works and chunking changes nothing', () => {
    const x = sine(44_100, 440, 1);
    const whole = new Resampler(44_100).push(x);
    const r = new Resampler(44_100);
    const parts: Float32Array[] = [];
    for (let i = 0; i < x.length; i += 882) parts.push(r.push(x.subarray(i, i + 882)));
    const chunked = concat(parts);
    expect(chunked.length).toBe(whole.length);
    let maxDiff = 0;
    for (let i = 0; i < whole.length; i++) maxDiff = Math.max(maxDiff, Math.abs(whole[i] - chunked[i]));
    // Phase rounding can differ by one table step at a chunk edge: far below audibility.
    expect(maxDiff).toBeLessThan(5e-3);
    expect(freq(whole.slice(400), 16_000)).toBeCloseTo(440, -1);
  });

  it('removes content above the new Nyquist (no aliasing)', () => {
    const out = new Resampler(48_000).push(sine(48_000, 11_000, 0.5));
    expect(rms(out.slice(200))).toBeLessThan(0.01);
  });

  it('passes 16 kHz through untouched', () => {
    const x = sine(16_000, 300, 0.1);
    expect(Array.from(new Resampler(16_000).push(x))).toEqual(Array.from(x));
  });
});

describe('VoiceActivity', () => {
  it('learns the room, hears speech, then counts the quiet after it', () => {
    const vad = new VoiceActivity();
    for (let i = 0; i < 50; i++) expect(vad.push(0.003, 20).heard).toBe(false);
    let s = vad.push(0.08, 20);
    s = vad.push(0.08, 20);
    s = vad.push(0.08, 20);
    expect(s.speaking).toBe(true);
    for (let i = 0; i < 40; i++) s = vad.push(0.003, 20);
    expect(s.heard).toBe(true);
    expect(s.speaking).toBe(false);
    expect(s.quietMs).toBe(800);
  });

  it('a single click is not speech', () => {
    const vad = new VoiceActivity();
    for (let i = 0; i < 20; i++) vad.push(0.003, 20);
    expect(vad.push(0.3, 20).heard).toBe(false);
    expect(vad.push(0.003, 20).heard).toBe(false);
  });
});

describe('loudness', () => {
  it('maps silence to 0 and a shout to 1', () => {
    expect(loudness(0)).toBe(0);
    expect(loudness(1)).toBe(1);
    expect(loudness(0.05)).toBeGreaterThan(0.3);
    expect(loudness(0.05)).toBeLessThan(0.9);
  });
});
