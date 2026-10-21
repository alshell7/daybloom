/**
 * Alef's eyes as vector shapes, animated like the app animates them (eyes.ts): each eye is a
 * rounded rectangle that springs between poses with a little overshoot, squashes as it moves,
 * blinks, and turns into a happy arch when Alef smiles (the lower lid rising as a round cheek).
 * The right eye follows the left a beat later.
 */
import { Color, Layer } from "framefields";
import { f } from "../theme.js";
import { id, type Key, keys, type Node } from "./kit.js";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One eye's outline, centred in a (w+2m)×(h+2m) box. `smile` 0..1 lifts the lower edge into a
 * round arch. Always the same commands (M + 8 C + Z) so any two poses morph cleanly.
 */
export function eyePath(w: number, h: number, smile = 0, m = 0): string {
	const r = Math.min(w, h) * 0.3;
	const x0 = m, y0 = m, x1 = m + w, y1 = m + h;
	const k = 0.5523 * r;
	const s = smile;
	const L = (a: number, b: number) => a + (b - a) * s;
	const P = (ax: number, ay: number, bx: number, by: number) => `${r2(L(ax, bx))} ${r2(L(ay, by))}`;
	const p = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
	// Happy: the lower lid rises as a round cheek and cuts a ∩ arch out of the eye.
	const foot = y1 - 0.12 * h;
	const cheek = foot - 0.62 * h * 1.3;
	return [
		`M${p(x0 + r, y0)}`,
		`C${p(x0 + r + (w - 2 * r) / 3, y0)} ${p(x1 - r - (w - 2 * r) / 3, y0)} ${p(x1 - r, y0)}`,
		`C${p(x1 - r + k, y0)} ${p(x1, y0 + r - k)} ${p(x1, y0 + r)}`,
		`C${p(x1, y0 + r + (h - 2 * r) / 3)} ${p(x1, y1 - r - (h - 2 * r) / 3)} ${p(x1, y1 - r)}`,
		`C${P(x1, y1 - r + k, x1, y1 - r * 0.8)} ${P(x1 - r + k, y1, x1, foot - 0.02 * h)} ${P(x1 - r, y1, x1, foot)}`,
		`C${P(x1 - r - (w - 2 * r) / 3, y1, x1 - 0.1 * w, cheek)} ${P(x0 + r + (w - 2 * r) / 3, y1, x0 + 0.1 * w, cheek)} ${P(x0 + r, y1, x0, foot)}`,
		`C${P(x0 + r - k, y1, x0, foot - 0.02 * h)} ${P(x0, y1 - r + k, x0, y1 - r * 0.8)} ${p(x0, y1 - r)}`,
		`C${p(x0, y1 - r - (h - 2 * r) / 3)} ${p(x0, y0 + r + (h - 2 * r) / 3)} ${p(x0, y0 + r)}`,
		`C${p(x0, y0 + r - k)} ${p(x0 + r - k, y0)} ${p(x0 + r, y0)}`,
		"Z",
	].join("");
}

export interface EyePose {
	/** Frame the pose is reached (springs in over the frames before). */
	at: number;
	/** Gaze offset (px) and height squash. */
	x?: number;
	y?: number;
	smile?: number;
	/** Openness 0..1 (a blink is 0.08). */
	open?: number;
	/** Ease into the pose. */
	ease?: string;
}

export interface EyesOptions {
	cx: number;
	cy: number;
	w: number;
	h: number;
	gap: number;
	color: string;
	shadow?: string;
	poses: EyePose[];
	/** Frames a blink takes, at each of these frames. */
	blinks?: number[];
	/** Little squashes while talking: [from, to] frames. */
	talk?: [number, number][];
}

/** Both eyes, with every pose, blink and syllable keyed. */
export function eyes(o: EyesOptions): Node[] {
	const m = Math.round(o.h * 0.25);
	const bw = o.w + 2 * m;
	const bh = o.h + 2 * m;
	const out: Node[] = [];
	for (const side of [-1, 1] as const) {
		const lag = side === 1 ? 2 : 0;
		const baseX = o.cx + side * o.gap - bw / 2;
		const baseY = o.cy - bh / 2;
		const xs: Key[] = [[0, baseX]];
		const ys: Key[] = [[0, baseY]];
		const ds: Key[] = [[0, eyePath(o.w, o.h, 0, m)]];
		const open0 = o.poses[0]?.at === 0 && o.poses[0].open !== undefined ? o.poses[0].open : 1;
		const sy: Key[] = [[0, open0]];
		const sx: Key[] = [[0, 1]];
		let lastOpen = open0;
		let lastSmile = 0;
		for (const p of o.poses) {
			const at = p.at + lag;
			const ease = p.ease ?? "back.out(1.7)";
			if (p.x !== undefined) {
				xs.push([at, baseX + p.x, ease]);
				// The eye on the side you look toward grows a little (perspective).
				const near = 1 + side * Math.sign(p.x) * Math.min(0.08, Math.abs(p.x) / 400);
				sx.push([at, near, ease]);
			}
			if (p.y !== undefined) ys.push([at, baseY + p.y, ease]);
			if (p.smile !== undefined && p.smile !== lastSmile) {
				ds.push([at - f(0.22), eyePath(o.w, o.h, lastSmile, m)], [at, eyePath(o.w, o.h, p.smile, m), "back.out(1.4)"]);
				lastSmile = p.smile;
			}
			if (p.open !== undefined && p.open !== lastOpen) {
				sy.push([at, p.open, ease]);
				lastOpen = p.open;
			}
		}
		for (const b of o.blinks ?? []) {
			const t = b + lag;
			sy.push([t, lastOpen], [t + f(0.08), 0.08, "power2.in"], [t + f(0.16), lastOpen * 1.06, "power2.out"], [t + f(0.28), lastOpen, "sine.inOut"]);
		}
		for (const [a, z] of o.talk ?? []) {
			for (let t = a; t < z; t += f(0.2)) sy.push([t + lag, lastOpen * 0.9, "sine.inOut"], [t + lag + f(0.1), lastOpen, "sine.inOut"]);
		}
		sy.sort((p, q) => p[0] - q[0]);
		const anim = [keys("x", xs), keys("y", ys), keys("d", ds), keys("scaleY", sy), keys("scaleX", sx)];
		if (o.shadow) {
			// A soft drop shadow under each eye: two offset copies fake the blur.
			for (const [dy, a] of [[o.h * 0.05, 0.16], [o.h * 0.09, 0.08]] as const) {
				out.push(
					Layer.shape("path", { id: id("eye-shadow"), position: "absolute", x: baseX, y: baseY + dy, width: bw, height: bh, d: ds[0][1], fill: Color.alpha(o.shadow, a) } as never).animate(
						keys("x", xs),
						keys("y", ys.map(([t, v, e]) => [t, Number(v) + dy, e] as Key)),
						keys("d", ds),
						keys("scaleY", sy),
						keys("scaleX", sx),
					),
				);
			}
		}
		out.push(
			Layer.shape("path", {
				id: id(`eye${side}`),
				position: "absolute",
				x: baseX,
				y: baseY,
				width: bw,
				height: bh,
				d: ds[0][1],
				fill: o.color,
			} as never).animate(...anim),
		);
	}
	return out;
}

/** A four-point sparkle (✦) at (x, y), popping in at `at`. */
export function sparkle(x: number, y: number, r: number, color: string, at: number): Node {
	const q = r * 0.22;
	const d = `M${r} 0C${r + q} ${r - q} ${r + q} ${r - q} ${2 * r} ${r}C${r + q} ${r + q} ${r + q} ${r + q} ${r} ${2 * r}C${r - q} ${r + q} ${r - q} ${r + q} 0 ${r}C${r - q} ${r - q} ${r - q} ${r - q} ${r} 0Z`;
	return Layer.shape("path", { id: id("sparkle"), position: "absolute", x: x - r, y: y - r, width: 2 * r, height: 2 * r, d, fill: color } as never).animate(
		keys("scale", [[0, 0], [at, 0], [at + f(0.35), 1.15, "back.out(2.5)"], [at + f(0.6), 1, "sine.out"], [at + f(1.6), 0.9], [at + f(2.0), 0, "power2.in"]]),
		keys("rotation", [[0, -40], [at, -40], [at + f(2), 30, "sine.out"]]),
		keys("opacity", [[0, 0], [at, 0], [at + f(0.1), 1], [at + f(1.7), 1], [at + f(2.0), 0]]),
	);
}

export const eyeInk = "#1E3553";
