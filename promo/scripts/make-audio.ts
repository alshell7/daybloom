/**
 * Synthesizes the placeholder soundtrack and the small sound effects, offline, in plain JS:
 *
 *   assets/audio/placeholder-pad.wav   ~76 s of soft chords (a warm pad, a few slow plucks, a low
 *                                      root), D – Bm – G – A at 80 BPM, through a small room.
 *   assets/audio/sfx-*.wav             whooshes (framefields' own procedural whoosh, softened),
 *                                      detent ticks, plucks, a chime, Alef's blink, a pop, the end
 *                                      swell, and the alarm: Daybloom's real "Dawn" tone, rendered
 *                                      by the app's own synthesizer (src/lib/alarm.ts, read only).
 *
 * Nothing here is downloaded. Swap the music for a freesound track in theme.ts (MUSIC).
 *
 *   npm run audio
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodeStereoWav, renderSfx } from "framefields";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../assets/audio");
const SR = 48000;
fs.mkdirSync(OUT, { recursive: true });

type Stereo = [Float32Array, Float32Array];
const stereo = (sec: number): Stereo => [new Float32Array(Math.ceil(sec * SR)), new Float32Array(Math.ceil(sec * SR))];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** A tiny deterministic random. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** One-pole low-pass, in place. */
function lowpass(x: Float32Array, hz: number) {
	const a = Math.exp((-2 * Math.PI * hz) / SR);
	let y = 0;
	for (let i = 0; i < x.length; i++) {
		y = (1 - a) * x[i] + a * y;
		x[i] = y;
	}
}

/** A small Freeverb-style room (4 combs + 2 allpasses per side), mixed in place. */
function room(buf: Stereo, wet: number, size = 0.84, damp = 0.35) {
	const combs = [1557, 1617, 1491, 1422];
	const alls = [556, 441];
	buf.forEach((x, side) => {
		const dry = Float32Array.from(x);
		const out = new Float32Array(x.length);
		for (const c of combs) {
			const L = Math.round((c + side * 23) * (SR / 44100));
			const line = new Float32Array(L);
			let idx = 0;
			let f = 0;
			for (let i = 0; i < x.length; i++) {
				const o = line[idx];
				f = o * (1 - damp) + f * damp;
				line[idx] = dry[i] * 0.015 + f * size;
				out[i] += o;
				idx = (idx + 1) % L;
			}
		}
		for (const a of alls) {
			const L = Math.round((a + side * 23) * (SR / 44100));
			const line = new Float32Array(L);
			let idx = 0;
			for (let i = 0; i < x.length; i++) {
				const b = line[idx];
				const v = out[i];
				line[idx] = v + b * 0.5;
				out[i] = b - v;
				idx = (idx + 1) % L;
			}
		}
		for (let i = 0; i < x.length; i++) x[i] = dry[i] * (1 - wet * 0.5) + out[i] * wet * 3;
	});
}

function normalize(buf: Stereo, peakDb: number) {
	let peak = 0;
	for (const c of buf) for (const v of c) peak = Math.max(peak, Math.abs(v));
	const g = peak > 0 ? 10 ** (peakDb / 20) / peak : 1;
	for (const c of buf) for (let i = 0; i < c.length; i++) c[i] *= g;
}

function rms(buf: Stereo) {
	let s = 0;
	let n = 0;
	for (const c of buf) for (const v of c) (s += v * v), n++;
	return 20 * Math.log10(Math.sqrt(s / n) || 1e-9);
}

function write(name: string, buf: Stereo) {
	const file = path.join(OUT, name);
	fs.writeFileSync(file, encodeStereoWav(buf, { sampleRate: SR }));
	let peak = 0;
	for (const c of buf) for (const v of c) peak = Math.max(peak, Math.abs(v));
	console.log(`${name.padEnd(26)} ${(buf[0].length / SR).toFixed(2)} s  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS  rms ${rms(buf).toFixed(1)} dBFS`);
}

/** Add a voice: f(t) for t in seconds since the note start, panned. */
function add(buf: Stereo, at: number, len: number, pan: number, fn: (t: number) => number) {
	const s0 = Math.round(at * SR);
	const n = Math.round(len * SR);
	const l = Math.cos(((pan + 1) * Math.PI) / 4);
	const r = Math.sin(((pan + 1) * Math.PI) / 4);
	for (let i = 0; i < n; i++) {
		const k = s0 + i;
		if (k < 0 || k >= buf[0].length) continue;
		const v = fn(i / SR);
		buf[0][k] += v * l;
		buf[1][k] += v * r;
	}
}

/** A soft electric-piano pluck (two-operator FM with a decaying index). */
function pluck(buf: Stereo, at: number, hz: number, gain: number, pan = 0, decay = 1.6) {
	add(buf, at, decay * 3, pan, (t) => {
		const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
		const idx = 1.3 * Math.exp(-t / 0.35);
		return gain * env * Math.sin(2 * Math.PI * hz * t + idx * Math.sin(2 * Math.PI * hz * t));
	});
}

/** A soft bell (a few inharmonic partials). */
function bell(buf: Stereo, at: number, hz: number, gain: number, pan = 0, decay = 1.8) {
	const parts: [number, number, number][] = [
		[1, 1, 1],
		[2.0, 0.35, 0.6],
		[2.76, 0.18, 0.4],
		[5.4, 0.06, 0.2],
	];
	add(buf, at, decay * 3.5, pan, (t) => {
		let v = 0;
		for (const [m, a, d] of parts) v += a * Math.sin(2 * Math.PI * hz * m * t) * Math.exp(-t / (decay * d));
		return gain * Math.min(1, t / 0.003) * v;
	});
}

// ── The placeholder soundtrack ───────────────────────────────────────────────

function pad(): Stereo {
	const LEN = 77;
	const buf = stereo(LEN);
	const BPM = 80;
	const beat = 60 / BPM;
	const bar = beat * 4;
	// D – Bm – G – A(sus), two bars each, voiced warm and open.
	const chords: { root: number; notes: number[] }[] = [
		{ root: 38, notes: [50, 57, 61, 64, 66] }, // Dmaj9: D3 A3 C#4 E4 F#4
		{ root: 35, notes: [50, 54, 57, 61, 62] }, // Bm(add9)/D-ish: D3 F#3 A3 C#4 D4
		{ root: 43, notes: [50, 55, 59, 62, 66] }, // Gmaj7(9): D3 G3 B3 D4 F#4
		{ root: 45, notes: [52, 57, 59, 62, 64] }, // A6sus: E3 A3 B3 D4 E4
	];
	const chordLen = bar * 2;
	const n = Math.ceil(LEN / chordLen);
	for (let i = 0; i < n; i++) {
		const c = chords[i % chords.length];
		const at = i * chordLen;
		const len = chordLen + 2.6;
		// Pad voices: two slightly detuned sines per note, slow attack and release.
		c.notes.forEach((m, j) => {
			const hz = midi(m);
			const pan = (j / (c.notes.length - 1)) * 1.2 - 0.6;
			for (const det of [-1, 1]) {
				const h = hz * 2 ** ((det * 4) / 1200);
				add(buf, at, len, pan * det * 0.8, (t) => {
					const env = Math.min(1, t / 1.4) * Math.min(1, Math.max(0, (len - t) / 2.4));
					const breathe = 1 + 0.06 * Math.sin(2 * Math.PI * 0.18 * t + j);
					return 0.022 * env * breathe * (Math.sin(2 * Math.PI * h * t) + 0.16 * Math.sin(4 * Math.PI * h * t) + 0.05 * Math.sin(6 * Math.PI * h * t));
				});
			}
		});
		// A low root, very soft.
		add(buf, at, len, 0, (t) => {
			const env = Math.min(1, t / 2) * Math.min(1, Math.max(0, (len - t) / 2.4));
			return 0.05 * env * Math.sin(2 * Math.PI * midi(c.root) * t);
		});
		// A few slow plucks rising through the chord, on the beats.
		const arp = [c.notes[1] + 12, c.notes[3] + 12, c.notes[2] + 12, c.notes[4] + 12];
		const r = rng(100 + i);
		for (let b = 0; b < 8; b++) {
			if (b % 2 === 1 && r() < 0.5) continue;
			const note = arp[b % arp.length];
			pluck(buf, at + b * beat + (r() - 0.5) * 0.02, midi(note), 0.05 + r() * 0.015, (r() - 0.5) * 0.8, 1.4);
		}
	}
	for (const c of buf) lowpass(c, 5200);
	room(buf, 0.32);
	// Fade in and out.
	const fi = Math.round(2.0 * SR);
	const fo = Math.round(5.0 * SR);
	for (const c of buf) {
		for (let i = 0; i < fi; i++) c[i] *= (i / fi) ** 2;
		for (let i = 0; i < fo; i++) c[c.length - 1 - i] *= (i / fo) ** 1.5;
	}
	normalize(buf, -6);
	return buf;
}

// ── Effects ──────────────────────────────────────────────────────────────────

function whoosh(sec: number, vol: number, hz: number, seed: number): Stereo {
	const r = renderSfx({ type: "whoosh", atBar: 0, durationSec: sec, volume: vol }, { sampleRate: SR, secondsPerBar: 3, seed });
	const buf: Stereo = [new Float32Array(Math.ceil((sec + 0.4) * SR)), new Float32Array(Math.ceil((sec + 0.4) * SR))];
	buf[0].set(r.channels[0].subarray(0, buf[0].length));
	buf[1].set(r.channels[1].subarray(0, buf[1].length));
	for (const c of buf) {
		lowpass(c, hz);
		lowpass(c, hz * 1.5);
	}
	return buf;
}

function tick(): Stereo {
	const buf = stereo(0.5);
	// A soft wooden detent: a short pitched knock with a little body.
	add(buf, 0, 0.12, 0, (t) => 0.5 * Math.exp(-t / 0.012) * Math.sin(2 * Math.PI * 1250 * t) + 0.35 * Math.exp(-t / 0.03) * Math.sin(2 * Math.PI * 420 * t));
	for (const c of buf) lowpass(c, 4000);
	return buf;
}

function main() {
	write("placeholder-pad.wav", pad());

	const w = whoosh(1.0, 0.7, 2400, 7);
	normalize(w, -9);
	write("sfx-whoosh.wav", w);
	const ws = whoosh(0.85, 0.6, 1600, 11);
	normalize(ws, -12);
	write("sfx-whoosh-soft.wav", ws);

	const t = tick();
	normalize(t, -16);
	write("sfx-tick.wav", t);

	const p = stereo(1.6);
	pluck(p, 0, midi(74), 0.5, 0, 0.5);
	pluck(p, 0.0, midi(81), 0.2, 0.2, 0.4);
	room(p, 0.25);
	normalize(p, -12);
	write("sfx-pluck.wav", p);

	const ch = stereo(3.2);
	[74, 78, 81].forEach((m, i) => bell(ch, i * 0.11, midi(m), 0.4, (i - 1) * 0.4, 1.0));
	room(ch, 0.35);
	normalize(ch, -12);
	write("sfx-chime.wav", ch);

	// Alef's blink: a tiny, low "bip" in its own register (250–450 Hz).
	const bl = stereo(0.35);
	add(bl, 0, 0.12, 0, (t) => Math.exp(-t / 0.03) * Math.sin(2 * Math.PI * (380 - 900 * t) * t));
	for (const c of bl) lowpass(c, 2500);
	normalize(bl, -20);
	write("sfx-blink.wav", bl);

	// A soft bubble pop for the speech bubble (kept low: 300 → 450 Hz).
	const po = stereo(0.5);
	add(po, 0, 0.2, 0, (t) => Math.exp(-t / 0.045) * Math.sin(2 * Math.PI * (300 + 700 * t) * t));
	for (const c of po) lowpass(c, 3000);
	room(po, 0.2);
	normalize(po, -15);
	write("sfx-pop.wav", po);

	// The end swell: a soft riser, darkened, with a warm D chord blooming at its top.
	const sw = stereo(4.0);
	const rs = renderSfx({ type: "riser", atBar: 0, durationSec: 2.2, volume: 0.5 }, { sampleRate: SR, secondsPerBar: 3, seed: 5 });
	for (let k = 0; k < 2; k++) sw[k].set(rs.channels[k].subarray(0, Math.min(sw[k].length, rs.channels[k].length)));
	for (const c of sw) lowpass(c, 1800);
	[62, 66, 69, 74].forEach((m, i) => bell(sw, 1.9 + i * 0.05, midi(m), 0.16, (i - 1.5) * 0.4, 1.4));
	room(sw, 0.35);
	normalize(sw, -10);
	write("sfx-swell.wav", sw);

	return import(pathToFileURL(path.resolve(HERE, "../../src/lib/alarm.ts")).href)
		.then((m: { renderTone: (id: string, sr: number, mode: "once", reps: number) => Float32Array[] }) => {
			const ch2 = m.renderTone("dawn", SR, "once", 1);
			const len = Math.min(ch2[0].length, Math.round(3.6 * SR));
			const a: Stereo = [ch2[0].slice(0, len), (ch2[1] ?? ch2[0]).slice(0, len)];
			const fo = Math.round(0.6 * SR);
			for (const c of a) for (let i = 0; i < fo; i++) c[len - 1 - i] *= i / fo;
			normalize(a, -8);
			write("sfx-alarm.wav", a);
			console.log("  (sfx-alarm.wav is Daybloom's own Dawn tone)");
		})
		.catch((e: unknown) => {
			console.warn(`  could not render the app's Dawn tone (${String(e)}); using a soft bell instead`);
			const a = stereo(3.6);
			[62, 66, 69, 74].forEach((m, i) => bell(a, i * 0.32, midi(m), 0.35, (i - 1.5) * 0.3, 1.2));
			room(a, 0.3);
			normalize(a, -8);
			write("sfx-alarm.wav", a);
		});
}

await main();
