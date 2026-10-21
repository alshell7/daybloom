/**
 * The soundtrack and the sound effects, on the film's clock.
 *
 * Music: MUSIC in theme.ts (one line to swap in the chosen track). Effects: small WAVs made by
 * scripts/make-audio.ts, each placed with Layer.audio at the frame of its cue. Cues live with
 * their scenes (SceneDef.cues), in scene-local seconds, so they move when a scene moves.
 */
import path from "node:path";
import { Effect, Layer } from "framefields";
import { f, FPS, MUSIC, SFX_DIR } from "./theme.js";

export type Sfx = "whoosh" | "whoosh-soft" | "tick" | "pluck" | "chime" | "pop" | "alarm" | "swell" | "blink";

export interface Cue {
	/** Scene-local seconds. */
	at: number;
	sfx: Sfx;
	gain?: number;
}

/** Length of each effect file in seconds (make-audio.ts writes them at these lengths). */
export const SFX_SEC: Record<Sfx, number> = {
	whoosh: 1.1,
	"whoosh-soft": 1.0,
	tick: 0.5,
	pluck: 1.6,
	chime: 3.2,
	pop: 0.5,
	alarm: 3.6,
	swell: 4.0,
	blink: 0.35,
};

export const sfxFile = (s: Sfx) => path.join(SFX_DIR, `sfx-${s}.wav`);

// biome-ignore lint/suspicious/noExplicitAny: audio layers are plain specs.
type AudioNode = any;

export function soundtrack(tl: { starts: number[]; total: number }, scenes: { cues?: Cue[] }[]): AudioNode[] {
	const out: AudioNode[] = [];
	const total = tl.total;
	// Music: one track, or a short loop laid end to end with a soft crossfade.
	const loop = MUSIC.loopSec ? f(MUSIC.loopSec) : 0;
	const xf = f(1.5);
	if (!loop || loop >= total) {
		out.push(
			Layer.audio(MUSIC.src, { id: "music", startFrame: 0, durationFrames: total, volume: MUSIC.volume } as never).apply(
				Effect.audioFade({ fadeInDuration: 1.2, fadeOutDuration: 3.0, fadeInCurve: "scurve", fadeOutCurve: "scurve" }),
			),
		);
	} else {
		let i = 0;
		for (let s = 0; s < total; s += loop - xf, i++) {
			const len = Math.min(loop, total - s);
			const last = s + len >= total;
			out.push(
				Layer.audio(MUSIC.src, { id: `music-${i}`, startFrame: s, durationFrames: len, volume: MUSIC.volume } as never).apply(
					Effect.audioFade({ fadeInDuration: i === 0 ? 1.2 : xf / FPS, fadeOutDuration: last ? 3.0 : xf / FPS, fadeInCurve: "scurve", fadeOutCurve: "scurve" }),
				),
			);
		}
	}
	// Effects at their cues.
	let n = 0;
	scenes.forEach((s, i) => {
		for (const c of s.cues ?? []) {
			const start = tl.starts[i] + f(c.at);
			const len = Math.min(f(SFX_SEC[c.sfx]), Math.max(1, total - start));
			if (start < 0 || start >= total) continue;
			out.push(Layer.audio(sfxFile(c.sfx), { id: `sfx-${n++}-${c.sfx}`, startFrame: start, durationFrames: len, volume: c.gain ?? 1 } as never));
		}
	});
	return out;
}
