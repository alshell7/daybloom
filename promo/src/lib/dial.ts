/**
 * The Daybloom dial, drawn the way the app draws it (DESIGN.md, "The Dial"): a 1000-unit dial
 * with fixed radii (bezel 468→382, face 374, minute track 366→340, numerals 298), category arcs
 * as annular sectors with a small gap at each end, the now-hand and the face readout.
 *
 * Everything is scaled into a `size` px box. The parts come back in groups so a scene can lay
 * them flat in one box (2D) or put each on its own plane in space (the cold open).
 */
import { Color, Layer } from "framefields";
import { type Category, catColor, f, type Finish, SANS } from "../theme.js";
import type { IconName } from "./icons.data.js";
import { icon, id, keys, merge, type Node, soft } from "./kit.js";

export const R = {
	caseEdge: 497,
	bezelOut: 468,
	bezelIn: 382,
	bezelBase: 476,
	face: 374,
	trackOut: 366,
	trackMinor: 354,
	trackMajor: 340,
	numerals: 298,
	readout: 252,
} as const;

/** Clock angle (deg, clockwise from 12) for a time of day on the 12-hour face. */
export const at12 = (h: number, m = 0) => (((h % 12) + m / 60) * 30) % 360;
/** Clock angle on the 24-hour face (noon at the top). */
export const at24 = (h: number, m = 0) => ((((h - 12 + 24) % 24) + m / 60) * 15) % 360;

export class Geo {
	readonly k: number;
	readonly c: number;
	constructor(readonly size: number) {
		this.k = size / 1000;
		this.c = size / 2;
	}
	/** Dial units at angle `a` → px in the box. */
	p(r: number, a: number): [number, number] {
		const t = (a * Math.PI) / 180;
		return [this.c + r * this.k * Math.sin(t), this.c - r * this.k * Math.cos(t)];
	}
	private n(v: number) {
		return Math.round(v * 100) / 100;
	}
	/** An annular sector from a0 to a1 (deg, a1 > a0), r0..r1 units. */
	sector(a0: number, a1: number, r0: number, r1: number): string {
		const sweep = Math.max(0.05, a1 - a0);
		const e = a0 + sweep;
		const large = sweep > 180 ? 1 : 0;
		const [x0, y0] = this.p(r1, a0);
		const [x1, y1] = this.p(r1, e);
		const [x2, y2] = this.p(r0, e);
		const [x3, y3] = this.p(r0, a0);
		const R1 = this.n(r1 * this.k);
		const R0 = this.n(r0 * this.k);
		return `M${this.n(x0)} ${this.n(y0)}A${R1} ${R1} 0 ${large} 1 ${this.n(x1)} ${this.n(y1)}L${this.n(x2)} ${this.n(y2)}A${R0} ${R0} 0 ${large} 0 ${this.n(x3)} ${this.n(y3)}Z`;
	}
	/** A block's sector with the small arc-length gap at each end (3.5 units). */
	block(a0: number, a1: number, r0: number = R.bezelIn, r1: number = R.bezelOut, gap = 3.5): string {
		const g = (gap / r1) * (180 / Math.PI);
		return this.sector(a0 + g, a1 - g, r0, r1);
	}
	/** A full circle of radius r units, clockwise. */
	circle(r: number, cw = true): string {
		const R0 = this.n(r * this.k);
		const c = this.c;
		const s = cw ? 1 : 0;
		return `M${this.n(c)} ${this.n(c - R0)}A${R0} ${R0} 0 1 ${s} ${this.n(c)} ${this.n(c + R0)}A${R0} ${R0} 0 1 ${s} ${this.n(c)} ${this.n(c - R0)}Z`;
	}
	/** An annulus r0..r1 as one path with a hole (for SVG, which fills holes properly). */
	ring(r0: number, r1: number): string {
		return `${this.circle(r1, true)}${this.circle(r0, false)}`;
	}
	/** An annulus as three separate thirds: filled shapes take one outline each. */
	ringThirds(r0: number, r1: number): string[] {
		return [this.sector(-0.3, 120.3, r0, r1), this.sector(119.7, 240.3, r0, r1), this.sector(239.7, 360.3, r0, r1)];
	}
	/** Radial strokes at each angle, from r0 to r1 units, as one path. */
	ticks(angles: number[], r0: number, r1: number): string {
		return angles
			.map((a) => {
				const [x0, y0] = this.p(r0, a);
				const [x1, y1] = this.p(r1, a);
				return `M${this.n(x0)} ${this.n(y0)}L${this.n(x1)} ${this.n(y1)}`;
			})
			.join("");
	}
	/** A pointed petal along angle a, from r0 to r1 units, w units wide. */
	petal(a: number, r0: number, r1: number, w: number): string {
		const [x0, y0] = this.p(r0, a);
		const [x1, y1] = this.p(r1, a);
		const mid = (r0 + r1) / 2;
		const dw = (w / mid) * (180 / Math.PI);
		const [lx, ly] = this.p(mid, a - dw);
		const [rx, ry] = this.p(mid, a + dw);
		return `M${this.n(x0)} ${this.n(y0)}Q${this.n(lx)} ${this.n(ly)} ${this.n(x1)} ${this.n(y1)}Q${this.n(rx)} ${this.n(ry)} ${this.n(x0)} ${this.n(y0)}Z`;
	}
}

export interface Arc {
	cat: Category;
	a0: number;
	a1: number;
	icon: IconName;
	/** The block the hand is in: its elapsed part steps back into the bezel. */
	now?: boolean;
}

/** The sample day from the app's screenshots, on the 12-hour face at 10:40am. */
export const SAMPLE_DAY: Arc[] = [
	{ cat: "focus", a0: at12(9, 50), a1: at12(11, 20), icon: "laptop", now: true },
	{ cat: "care", a0: at12(12, 30), a1: at12(13, 10), icon: "utensils" },
	{ cat: "move", a0: at12(13, 20), a1: at12(13, 50), icon: "footprints" },
	{ cat: "focus", a0: at12(14, 15), a1: at12(14, 50), icon: "mail" },
	{ cat: "learn", a0: at12(15, 5), a1: at12(15, 40), icon: "languages" },
	{ cat: "people", a0: at12(18, 20), a1: at12(18, 50), icon: "phone" },
	{ cat: "move", a0: at12(19, 15), a1: at12(19, 55), icon: "dumbbell" },
	{ cat: "learn", a0: at12(20, 50), a1: at12(21, 25), icon: "book-open" },
];
export const SAMPLE_NOW = at12(10, 40);

/** White or Night Ink on a fill, whichever reads better (biased toward white). */
export function onFill(fill: string): string {
	return Color.contrast("#ffffff", fill) * 1.25 >= Color.contrast("#151c2a", fill) ? "#ffffff" : "#151c2a";
}

export interface BloomOptions {
	/** Frame the first arc starts to bloom. */
	at: number;
	/** Frames between arcs. */
	stagger?: number;
	/** Frame a flower of petals opens in the middle of the face first (then they fly out). */
	flower?: number;
	/** Frames each bloom takes. */
	len?: number;
}

const shape = (d: string, extra: Record<string, unknown>): Node =>
	Layer.shape("path", { id: id("dial"), position: "absolute", x: 0, y: 0, d, ...extra } as never);

export interface DialParts {
	/** Bezel base disc and the bare graduation dots. */
	bezel: Node[];
	/** Face disc, minute track and numerals. */
	face: Node[];
	/** One group per arc: the sector and its icon. */
	arcs: Node[][];
	/** The aura of the current block, just outside the rim. */
	aura: Node[];
	/** The now-hand. */
	hand: Node[];
	/** The countdown ring and the readout in the face. */
	readout: Node[];
}

export interface DialOptions {
	size: number;
	finish: Finish;
	arcs?: Arc[];
	/** Hand angle (deg). */
	now?: number;
	bloom?: BloomOptions;
	/** Numeral set: hours on a 12 h face, or 0..55 minutes. */
	numerals?: "12h" | "24h" | "none";
	/** Readout in the face; omit for a bare face (e.g. Alef's screen). */
	readout?: { time?: string; big: string; title?: string; titleIcon?: IconName; sub?: string; progress?: number; bigKeys?: [number, string][] };
	/** Frame the readout and hand appear (with the bloom). */
	readoutAt?: number;
}

export function dial(o: DialOptions): DialParts {
	const g = new Geo(o.size);
	const F = o.finish;
	const S = o.size;
	const box = { width: S, height: S };
	const arcs = o.arcs ?? [];
	const now = o.now ?? SAMPLE_NOW;

	// ── Bezel ────────────────────────────────────────────────────────────
	const bezel: Node[] = [
		shape(g.circle(R.bezelBase), { ...box, fill: F.bezel }),
		// A faint rim line at the case edge.
		shape(g.circle(R.bezelBase - 0.75), { ...box, fillType: "none", strokeColor: Color.alpha(F.dark ? "#ffffff" : "#151c2a", F.dark ? 0.06 : 0.07), strokeWidth: 1.5 * g.k }),
	];
	// Graduation dots show where the day is free.
	const free = (a: number) => !arcs.some((b) => a >= b.a0 - 2 && a <= b.a1 + 2);
	const dotAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].filter(free);
	for (const a of dotAngles) {
		const [x, y] = g.p(425, a);
		const r = 5 * g.k;
		bezel.push(
			Layer.shape("circle", { id: id("dot"), position: "absolute", x: x - r, y: y - r, width: r * 2, height: r * 2, fill: Color.alpha(F.track, 0.45) } as never),
		);
	}
	// Elapsed time on the bezel: a faint ink film from the hand back one hour.
	bezel.push(shape(g.sector(now - 30, now, R.bezelIn, R.bezelOut), { ...box, fill: Color.alpha(F.dark ? "#ffffff" : "#151c2a", F.dark ? 0.05 : 0.04) }));

	// ── Face ─────────────────────────────────────────────────────────────
	const faceWash = F.dark
		? `radial-gradient(circle at 50% 38%, ${Color.alpha("#ffffff", 0.05)} 0%, ${Color.alpha("#ffffff", 0)} 60%)`
		: `radial-gradient(circle at 50% 38%, ${Color.alpha("#ffffff", 0.7)} 0%, ${Color.alpha("#ffffff", 0)} 62%)`;
	const face: Node[] = [
		shape(g.circle(R.face), { ...box, fill: F.face }),
		shape(g.circle(R.face), { ...box, fill: faceWash }),
	];
	const minor: number[] = [];
	const major: number[] = [];
	for (let i = 0; i < 60; i++) (i % 5 === 0 ? major : minor).push(i * 6);
	face.push(
		shape(g.ticks(minor, R.trackMinor, R.trackOut), { ...box, fillType: "none", strokeColor: F.track, strokeWidth: 3 * g.k, strokeLineCap: "round" }),
		shape(g.ticks(major, R.trackMajor, R.trackOut), {
			...box,
			fillType: "none",
			strokeColor: F.dark ? Color.alpha(F.lume, 0.55) : F.track,
			strokeWidth: 5 * g.k,
			strokeLineCap: "round",
		}),
	);
	if (o.numerals !== "none") {
		const labels = o.numerals === "24h" ? ["12", "", "", "18", "", "", "0", "", "", "6", "", ""] : ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
		const fs = 46 * g.k;
		labels.forEach((t, i) => {
			if (!t) return;
			const [x, y] = g.p(R.numerals, i * 30);
			const bw = fs * 2.4;
			face.push(
				Layer.text(t, {
					id: id("num"),
					position: "absolute",
					x: x - bw / 2,
					y: y - fs * 0.62,
					width: bw,
					height: fs * 1.24,
					align: "center",
					verticalAlign: "middle",
					fontFamily: SANS,
					fontWeight: 300,
					fontSize: fs,
					lineHeight: fs * 1.24,
					fill: F.ink,
				} as never),
			);
		});
	}

	// ── Arcs ─────────────────────────────────────────────────────────────
	const bloom = o.bloom;
	const arcGroups: Node[][] = arcs.map((b, i) => {
		const color = catColor(b.cat, F);
		const t0 = bloom ? bloom.at + i * (bloom.stagger ?? f(0.16)) : 0;
		const len = bloom?.len ?? f(0.9);
		const layers: Node[] = [];
		const sectors: { d: string; a0: number; a1: number; fill: string }[] = [];
		if (b.now && now > b.a0 && now < b.a1) {
			sectors.push({ d: g.block(b.a0, now, R.bezelIn, R.bezelOut), a0: b.a0, a1: now, fill: Color.mix(color, F.bezel, 0.55) });
			sectors.push({ d: g.block(now, b.a1, R.bezelIn, R.bezelOut), a0: now, a1: b.a1, fill: color });
		} else {
			sectors.push({ d: g.block(b.a0, b.a1), a0: b.a0, a1: b.a1, fill: color });
		}
		for (const s of sectors) {
			const node = shape(s.d, { ...box, fill: s.fill });
			if (bloom) {
				const mid = (s.a0 + s.a1) / 2;
				const over = g.block(s.a0, s.a1, R.bezelIn - 4, R.bezelOut + 16);
				if (bloom.flower !== undefined) {
					// First a flower in the middle of the face; then each petal flies out to its block.
					const fl = bloom.flower;
					const petal = g.petal(mid, 34, 212, 34);
					const landed = g.petal(mid, 392, 458, 24);
					node.animate(
						keys("scale", [[0, 0], [fl, 0], [fl + f(0.8), 1, "back.out(1.4)"]]),
						keys("rotation", [[0, -70], [fl, -70], [fl + f(0.9), 0, "expo.out"]]),
						keys("opacity", [[0, 0], [fl, 0], [fl + f(0.2), 1, "power1.out"]]),
						keys("d", [
							[0, petal],
							[t0, petal],
							[t0 + Math.round(len * 0.42), landed, "power2.in"],
							[t0 + Math.round(len * 0.72), over, "expo.out"],
							[t0 + len, s.d, "power2.inOut"],
						]),
					);
				} else {
					const petal = g.petal(mid, 400, 452, 20);
					node.animate(
						keys("d", [
							[0, petal],
							[t0, petal],
							[t0 + Math.round(len * 0.62), over, "power3.out"],
							[t0 + len, s.d, "power2.inOut"],
						]),
						keys("opacity", [[0, 0], [t0, 0], [t0 + f(0.16), 1, "power1.out"]]),
					);
				}
			}
			layers.push(node);
		}
		// The icon sits mid-arc, on the part still ahead of the hand.
		const ia0 = b.now && now > b.a0 && now < b.a1 ? now : b.a0;
		const mid = (ia0 + b.a1) / 2;
		const isz = 40 * g.k;
		const [ix, iy] = g.p(425, mid);
		const ic = icon(b.icon, { x: ix - isz / 2, y: iy - isz / 2, size: isz, color: onFill(color), stroke: 2.1 });
		if (bloom) {
			const ia = t0 + Math.round(len * 0.75);
			ic.animate(
				merge(
					keys("scale", [[0, 0.2], [ia, 0.2], [ia + f(0.45), 1, "back.out(2.2)"]]),
					keys("opacity", [[0, 0], [ia, 0], [ia + f(0.15), 1]]),
				),
			);
		}
		layers.push(ic);
		return layers;
	});

	// ── Aura: a soft glow of the current block just outside the rim ─────
	const aura: Node[] = [];
	const cur = arcs.find((b) => b.now);
	if (cur) {
		aura.push(
			soft({ d: g.sector(cur.a0 - 3, cur.a1 + 1, 430, 545), x: 0, y: 0, w: S, h: S, fill: catColor(cur.cat, F), blur: 30 * g.k, opacity: F.dark ? 0.6 : 0.5 }),
		);
	}

	// ── Hand ─────────────────────────────────────────────────────────────
	const hand: Node[] = [];
	{
		const thick = shape(g.ticks([now], 346, 378), { ...box, fillType: "none", strokeColor: F.signal, strokeWidth: 8 * g.k, strokeLineCap: "round" });
		const hair = shape(g.ticks([now], 378, R.bezelOut + 6), { ...box, fillType: "none", strokeColor: F.signal, strokeWidth: 2.5 * g.k, strokeLineCap: "round" });
		const t = (now * Math.PI) / 180;
		const [tx, ty] = g.p(480, now);
		const ox = Math.cos(t);
		const oy = Math.sin(t);
		const wd = 11 * g.k;
		const [bx, by] = g.p(480 + 22, now);
		const tri = `M${tx} ${ty}L${bx + ox * wd} ${by + oy * wd}L${bx - ox * wd} ${by - oy * wd}Z`;
		const arrow = shape(tri, { ...box, fill: F.signal });
		hand.push(thick, hair, arrow);
	}

	// ── Readout ──────────────────────────────────────────────────────────
	const readout: Node[] = [];
	if (o.readout) {
		const ro = o.readout;
		const ink = F.ink;
		// The readout boundary and the countdown ring of the current block.
		readout.push(shape(g.circle(R.readout), { ...box, fillType: "none", strokeColor: Color.alpha(F.track, F.dark ? 0.3 : 0.25), strokeWidth: 2.4 * g.k }));
		if (cur && ro.progress !== undefined) {
			const color = catColor(cur.cat, F);
			const end = 360 * ro.progress;
			readout.push(shape(g.sector(0, end, 236, 262), { ...box, fill: color }));
			const [ex, ey] = g.p(249, end);
			const dr = 17 * g.k;
			readout.push(
				Layer.shape("circle", {
					id: id("prog-dot"),
					position: "absolute",
					x: ex - dr,
					y: ey - dr,
					width: dr * 2,
					height: dr * 2,
					fill: color,
					strokeColor: F.face,
					strokeWidth: 5 * g.k,
				} as never),
			);
		}
		const cx = S / 2;
		const k = g.k;
		if (ro.time) {
			const fs = 34 * k;
			const w = 190 * k;
			readout.push(
				Layer.box({
					id: id("time-pill"),
					position: "absolute",
					x: cx - w / 2,
					y: S / 2 - 165 * k,
					width: w,
					height: 58 * k,
					borderRadius: 29 * k,
					background: F.dark ? Color.alpha("#ffffff", 0.07) : Color.alpha("#151c2a", 0.06),
					children: [
						Layer.text(ro.time, {
							id: id("time"),
							position: "absolute",
							x: 0,
							y: 0,
							width: w,
							height: 58 * k,
							align: "center",
							verticalAlign: "middle",
							fontFamily: SANS,
							fontWeight: 400,
							fontSize: fs,
							fill: ink,
						} as never),
					],
				} as never),
			);
		}
		const bigSize = 150 * k;
		const bigY = S / 2 - 96 * k;
		const bigOf = (t: string) =>
			Layer.text(t, {
				id: id("big"),
				position: "absolute",
				x: 0,
				y: bigY,
				width: S,
				height: bigSize * 1.15,
				align: "center",
				verticalAlign: "middle",
				fontFamily: SANS,
				fontWeight: 300,
				fontSize: bigSize,
				letterSpacing: -bigSize * 0.035,
				fill: ink,
			} as never);
		const seq = ro.bigKeys ?? [];
		if (seq.length > 1) {
			// The countdown rolls like an odometer: the old value lifts away, the new one rises in.
			const roll = bigSize * 0.32;
			seq.forEach(([at, t], i) => {
				const next = seq[i + 1]?.[0];
				const node = bigOf(String(t));
				const op: [number, number, string?][] = [[0, i === 0 ? 1 : 0]];
				const y: [number, number, string?][] = [[0, i === 0 ? bigY : bigY + roll]];
				if (i > 0) {
					op.push([at, 0], [at + f(0.08), 0], [at + f(0.45), 1, "power2.out"]);
					y.push([at, bigY + roll], [at + f(0.42), bigY, "expo.out"]);
				}
				if (next !== undefined) {
					op.push([next, 1], [next + f(0.18), 0, "power2.in"]);
					y.push([next, bigY], [next + f(0.42), bigY - roll, "expo.out"]);
				}
				readout.push(node.animate(keys("opacity", op), keys("y", y)));
			});
		} else readout.push(bigOf(ro.big));
		if (ro.title) {
			const ts = 36 * k;
			readout.push(
				Layer.text(ro.title, {
					id: id("title"),
					position: "absolute",
					x: 0,
					y: S / 2 + 82 * k,
					width: S,
					height: ts * 1.3,
					align: "center",
					verticalAlign: "middle",
					fontFamily: SANS,
					fontWeight: 500,
					fontSize: ts,
					fill: ink,
				} as never),
			);
		}
		if (ro.sub) {
			const ss = 27 * k;
			readout.push(
				Layer.text(ro.sub, {
					id: id("sub"),
					position: "absolute",
					x: 0,
					y: S / 2 + 130 * k,
					width: S,
					height: ss * 1.3,
					align: "center",
					verticalAlign: "middle",
					fontFamily: SANS,
					fontWeight: 400,
					fontSize: ss,
					fill: F.ink2,
					opacity: 0.85,
				} as never),
			);
		}
	}
	return { bezel, face, arcs: arcGroups, aura, hand, readout };
}

/** All parts, flat, in drawing order. */
export function flat(p: DialParts): Node[] {
	return [...p.aura, ...p.bezel, ...p.arcs.flat(), ...p.face, ...p.readout, ...p.hand];
}


/**
 * A band of light crossing a disc of radius `r` units (a watch crystal catching the light),
 * drawn as shapes cut to the disc so it needs no mask: three nested bands fake a soft edge.
 */
export function glint(size: number, o: { r?: number; at: number; len: number; tilt?: number; strength?: number; width?: number }): Node[] {
	const g = new Geo(size);
	const R0 = (o.r ?? R.face) * g.k;
	const tilt = ((o.tilt ?? 24) * Math.PI) / 180;
	const nx = Math.cos(tilt);
	const ny = Math.sin(tilt);
	const tx = -ny;
	const ty = nx;
	const c = g.c;
	const n2 = (v: number) => Math.round(v * 100) / 100;
	const band = (u: number, w: number): string => {
		const lim = R0 * 0.999;
		const u1 = Math.max(-lim, Math.min(lim, u - w / 2));
		const u2 = Math.max(-lim, Math.min(lim, u + w / 2));
		const h1 = Math.sqrt(Math.max(0, R0 * R0 - u1 * u1));
		const h2 = Math.sqrt(Math.max(0, R0 * R0 - u2 * u2));
		const P = (u: number, t: number): [number, number] => [c + nx * u + tx * t, c + ny * u + ty * t];
		const [a1x, a1y] = P(u1, -h1);
		const [b1x, b1y] = P(u1, h1);
		const [b2x, b2y] = P(u2, h2);
		const [a2x, a2y] = P(u2, -h2);
		const R1 = n2(R0);
		return `M${n2(a1x)} ${n2(a1y)}L${n2(b1x)} ${n2(b1y)}A${R1} ${R1} 0 0 0 ${n2(b2x)} ${n2(b2y)}L${n2(a2x)} ${n2(a2y)}A${R1} ${R1} 0 0 0 ${n2(a1x)} ${n2(a1y)}Z`;
	};
	const w0 = (o.width ?? 0.34) * R0;
	const a = o.strength ?? 0.12;
	const steps = Math.max(8, Math.round(o.len / 2));
	return [
		[w0 * 2.4, a * 0.16],
		[w0 * 1.75, a * 0.2],
		[w0 * 1.15, a * 0.24],
		[w0 * 0.7, a * 0.28],
		[w0 * 0.32, a * 0.34],
	].map(([w, alpha]) => {
		const k: [number, string, string?][] = [[0, band(-R0 - w, w)], [o.at, band(-R0 - w, w)]];
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			k.push([o.at + Math.round(o.len * t), band(-R0 - w + e * (2 * R0 + 2 * w), w)]);
		}
		return Layer.shape("path", {
			id: id("glint"),
			position: "absolute",
			x: 0,
			y: 0,
			width: size,
			height: size,
			d: k[0][1],
			fill: Color.alpha("#ffffff", alpha),
		} as never).animate(keys("d", k), keys("opacity", [[0, 0], [o.at, 0], [o.at + 1, 1], [o.at + o.len - 1, 1], [o.at + o.len, 0]]));
	});
}
