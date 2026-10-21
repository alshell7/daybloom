/**
 * npm run render                   → out/daybloom-promo.mp4 (the whole film, with sound)
 * npm run stills                   → out/frames/*.png, the key frames for review
 * npm run frames -- 3.5 12 40      → out/frames/t003.50.png …, any moments of the film (seconds)
 * npm run scene -- open 1 3 5      → out/dev/open-t1.00.png …, one scene alone (scene seconds)
 * npm run grid -- open             → out/dev/grid-open.png, a contact sheet of one scene
 * npm run preview                  → a live player on localhost (picture and sound)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { HeadlessMediaRenderer, startPreview } from "framefields";
import { buildFilm, SCENES, timeline } from "./film.js";
import { FPS, OUT, REPO } from "./theme.js";

const [mode = "video", ...args] = process.argv.slice(2);
const pad = (t: number) => t.toFixed(2).padStart(6, "0");

/** The frames worth a look, for review without the video. */
export const STILLS: { name: string; scene: string; at: number }[] = [
	{ name: "01-dial-assembles-in-space", scene: "open", at: 2.5 },
	{ name: "02-arcs-bloom-like-petals", scene: "open", at: 3.75 },
	{ name: "03-screenshots-on-3d-panels", scene: "panels", at: 4.9 },
	{ name: "04-meet-alef", scene: "alef", at: 3.35 },
	{ name: "05-world-clock-rings", scene: "world", at: 3.0 },
	{ name: "06-end-card", scene: "end", at: 6.0 },
];

if (mode === "preview") {
	const session = await startPreview(
		{ entry: new URL("./film.ts", import.meta.url), export: "buildFilm" },
		{ title: "Daybloom promo", root: [REPO], open: args.includes("--open") } as never,
	);
	console.log(`Preview at ${session.url}`);
	await session.closed;
	process.exit(0);
}

const renderer = new HeadlessMediaRenderer();

if (mode === "scene") {
	const [name, ...times] = args;
	const film = await buildFilm({ only: name, sound: false });
	const dir = path.join(OUT, "dev");
	await fs.mkdir(dir, { recursive: true });
	for (const t of times.map(Number)) {
		const file = path.join(dir, `${name}-t${pad(t)}.png`);
		await fs.writeFile(file, await film.renderFrame({ frame: Math.round(t * FPS), renderer }));
		console.log(file);
	}
} else if (mode === "grid") {
	const [name, cols = "4", n = "12"] = args;
	const film = await buildFilm({ only: name, sound: false });
	const def = SCENES.find((s) => s.name === name)!;
	const count = Number(n);
	const frames = Array.from({ length: count }, (_, i) => Math.round((i * (def.sec * FPS - 1)) / (count - 1)));
	const dir = path.join(OUT, "dev");
	await fs.mkdir(dir, { recursive: true });
	const file = path.join(dir, `grid-${name}.png`);
	await fs.writeFile(file, await film.renderFrameGrid({ frames, columns: Number(cols), cellWidth: 480, showLabels: true }));
	console.log(file);
} else if (mode === "frames" || mode === "stills") {
	const film = await buildFilm({ sound: false });
	const dir = path.join(OUT, "frames");
	await fs.mkdir(dir, { recursive: true });
	const { starts } = timeline();
	const shots =
		mode === "stills"
			? STILLS.map((s) => ({ file: `${s.name}.png`, frame: starts[SCENES.findIndex((d) => d.name === s.scene)] + Math.round(s.at * FPS) }))
			: args.map(Number).map((t) => ({ file: `t${pad(t)}.png`, frame: Math.round(t * FPS) }));
	for (const s of shots) {
		const file = path.join(dir, s.file);
		await fs.writeFile(file, await film.renderFrame({ frame: s.frame, renderer }));
		console.log(file);
	}
} else {
	const film = await buildFilm();
	await fs.mkdir(OUT, { recursive: true });
	const started = Date.now();
	const result = await film.renderVideo({
		outputPath: path.join(OUT, "daybloom-promo.mp4"),
		quality: "high",
		qa: { targetLufs: -16 },
		onProgress: undefined,
	} as never);
	await result.cleanup?.().catch(() => {});
	console.log(`${result.filePath} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
	const qa = (result as never as { qa?: unknown }).qa;
	if (qa) {
		const { formatQaReport } = await import("framefields");
		console.log(formatQaReport(qa as never));
	}
}
process.exit(0);
