/**
 * The Daybloom promo: scenes back to back on one clock, the soundtrack and the sound effects
 * timed to the cuts, and a light film finish over everything.
 *
 * film.ts only builds (no rendering, no writes): render.ts, the preview and tests share it.
 */
import { Composition, FilmGrain, Layer, Transition, Vignette } from "framefields";
import { type Cue, soundtrack } from "./audio.js";
import { openCues, openScene, OPEN_SEC } from "./scenes/open.js";
import { SWEEP_SEC, sweepCues, sweepScene } from "./scenes/sweep.js";
import { PANELS_SEC, panelsCues, panelsScene } from "./scenes/panels.js";
import { ALEF_SEC, alefCues, alefScene } from "./scenes/alef.js";
import { FREE_SEC, freeCues, freeScene } from "./scenes/freetime.js";
import { WORLD_SEC, worldCues, worldScene } from "./scenes/world.js";
import { BOARD_SEC, boardCues, boardScene } from "./scenes/board.js";
import { ALARM_SEC, alarmCues, alarmScene } from "./scenes/alarm.js";
import { TRUST_SEC, trustCues, trustScene } from "./scenes/trust.js";
import { END_SEC, endCues, endScene } from "./scenes/end.js";
import { C, f, FPS, H, registerFonts, resolveFonts, W } from "./theme.js";

// biome-ignore lint/suspicious/noExplicitAny: scene builders return plain layout specs.
type SceneBuild = () => any;

export interface SceneDef {
	name: string;
	/** Seconds on screen, including the transition into it. */
	sec: number;
	build: SceneBuild;
	transition?: ReturnType<typeof Transition.crossfade>;
	/** A soft whoosh under a moving transition into this scene. */
	whoosh?: boolean;
	/** Frames of overlap with the scene before (must match the transition). */
	overlap?: number;
	/** Sound effects, in scene-local seconds. */
	cues?: Cue[];
}

export const SCENES: SceneDef[] = [
	{ name: "open", sec: OPEN_SEC, build: openScene, cues: openCues() },
	{ name: "sweep", whoosh: true, sec: SWEEP_SEC, build: sweepScene, transition: Transition.iris(f(0.9), { at: [0.33, 0.5] }), overlap: f(0.9), cues: sweepCues() },
	{ name: "panels", whoosh: true, sec: PANELS_SEC, build: panelsScene, transition: Transition.zoom(f(0.7)), overlap: f(0.7), cues: panelsCues() },
	{ name: "alef", whoosh: true, sec: ALEF_SEC, build: alefScene, transition: Transition.whip("left", f(0.6)), overlap: f(0.6), cues: alefCues() },
	{ name: "free", whoosh: true, sec: FREE_SEC, build: freeScene, transition: Transition.slide("up", f(0.7)), overlap: f(0.7), cues: freeCues() },
	{ name: "world", whoosh: true, sec: WORLD_SEC, build: worldScene, transition: Transition.push("left", f(0.7)), overlap: f(0.7), cues: worldCues() },
	{ name: "board", whoosh: true, sec: BOARD_SEC, build: boardScene, transition: Transition.slide("left", f(0.7)), overlap: f(0.7), cues: boardCues() },
	{ name: "alarm", sec: ALARM_SEC, build: alarmScene, transition: Transition.fadeThrough(f(0.6)), overlap: f(0.6), cues: alarmCues() },
	{ name: "trust", whoosh: true, sec: TRUST_SEC, build: trustScene, transition: Transition.push("up", f(0.7)), overlap: f(0.7), cues: trustCues() },
	{ name: "end", sec: END_SEC, build: endScene, transition: Transition.crossfade(f(0.8)), overlap: f(0.8), cues: endCues() },
];

/** Where each scene starts on the film clock (frames), and the film's length. */
export function timeline(list: SceneDef[] = SCENES) {
	const starts: number[] = [];
	let t = 0;
	list.forEach((s, i) => {
		if (i > 0) t -= s.overlap ?? 0;
		starts.push(t);
		t += f(s.sec);
	});
	return { starts, total: t };
}

export async function buildFilm(options: { only?: string; sound?: boolean } = {}): Promise<Composition> {
	await registerFonts();
	const list = options.only ? SCENES.filter((s) => s.name === options.only) : SCENES;
	if (!list.length) throw new Error(`no scene named "${options.only}"`);
	const seq = Layer.sequence(
		list.map((s, i) => ({ scene: s.build(), duration: f(s.sec), transition: i > 0 ? s.transition : undefined })),
		{ width: W, height: H, id: "film" },
	);
	const total = seq.totalFrames;
	const film = new Composition({
		width: W,
		height: H,
		fps: FPS,
		durationMs: (total / FPS) * 1000,
		backgroundColor: C.ground,
	});
	resolveFonts(seq);
	film.add(seq);
	if (options.sound !== false && !options.only) {
		const withWhoosh = list.map((s) => ({ cues: [...(s.whoosh ? [{ at: 0, sfx: "whoosh" as const, gain: 0.5 }] : []), ...(s.cues ?? [])] }));
		for (const a of soundtrack(timeline(list), withWhoosh)) film.addAudio(a);
	}
	film.apply(new Vignette({ strength: 0.22, radius: 0.92, softness: 0.7 }));
	film.apply(new FilmGrain({ strength: 0.025, size: 1.1, monochrome: true, animated: true }));
	return film;
}
