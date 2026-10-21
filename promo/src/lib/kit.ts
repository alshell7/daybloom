/**
 * Shared building blocks: keyframe shorthands, the full-frame scene shell, the headline and
 * subline type moves, soft glows, dust, pills, icons and the light sweep.
 */
import { Color, FontManager, Layer, LayerAnimation, TextAnimator } from "framefields";
import { C, EASE, f, fontFace, H, SANS, W } from "../theme.js";
import { ICON_PATHS, type IconName } from "./icons.data.js";
import { transformPath } from "./path.js";

// biome-ignore lint/suspicious/noExplicitAny: layout nodes are plain specs here.
export type Node = any;
export type Key = [number, number | string, string?];

export const keys = (prop: string, list: Key[]) => LayerAnimation.keys(prop as never, list as never);
export const merge = (...a: LayerAnimation[]) => LayerAnimation.merge(...a);

let uid = 0;
export const id = (p: string) => `${p}-${(uid++).toString(36)}`;

/** A full-frame, absolutely placed box. */
export function full(options: Record<string, unknown> = {}): Node {
	return Layer.box({ id: id("full"), position: "absolute", x: 0, y: 0, width: W, height: H, ...options } as never);
}

/** A scene root: full frame, its own background, children keyed from the scene's frame 0. */
export function scene(name: string, background: string, children: Node[], extra: Record<string, unknown> = {}): Node {
	return full({ id: `scene-${name}`, background, overflow: "hidden", children, ...extra });
}

/** Opacity in at `a` (over `len` frames), and out at `b` when given. */
export function fade(a: number, len = f(0.5), b?: number, outLen = f(0.4)) {
	const k: Key[] = [[0, 0], [a, 0], [a + len, 1, "power2.out"]];
	if (b !== undefined) k.push([b, 1], [b + outLen, 0, "power2.in"]);
	return keys("opacity", k);
}

// ── Type ─────────────────────────────────────────────────────────────────────

export interface LineOptions {
	text: string;
	x: number;
	y: number;
	width?: number;
	size: number;
	color: string;
	weight?: number;
	align?: "start" | "center" | "end";
	/** Scene-local frame the reveal starts. */
	at: number;
	/** Scene-local frame the line starts to leave (omit to hold). */
	out?: number;
	/** Frames the reveal takes to cross the line. */
	sweep?: number;
	letterSpacing?: number;
	lineHeight?: number;
	/** "char" rises letter by letter (headlines); "word" blurs in word by word (sublines). */
	unit?: "char" | "word";
}

/**
 * The signature type move: letters rise out of a soft blur one after another and settle; on
 * exit the line lifts a little and fades. Lexend at 500 for headlines, 300–400 for the rest.
 */
export function line(o: LineOptions): Node {
	const lh = o.lineHeight ?? Math.round(o.size * 1.22);
	const width = o.width ?? W;
	const sweep = o.sweep ?? f(o.unit === "word" ? 0.9 : 0.8);
	const anim = LayerAnimation.create().kineticSweep(-1, 1, o.at, o.at + sweep, "power2.inOut");
	if (o.out !== undefined) {
		anim
			.keys("y", [[o.out, o.y], [o.out + f(0.45), o.y - o.size * 0.3, EASE.in]] as never)
			.fadeOut(o.out, o.out + f(0.45), "power2.in");
	}
	const animator =
		o.unit === "word"
			? TextAnimator.waveRise({ unit: "word", y: o.size * 0.5, rotationX: 0, opacity: 0, blur: 12, easing: "expo.in" })
			: TextAnimator.waveRise({ y: o.size * 0.55, rotationX: 0, opacity: 0, blur: 10, easing: "expo.in" });
	return Layer.text(o.text, {
		id: id("line"),
		position: "absolute",
		x: o.x,
		y: o.y,
		width,
		fontFamily: SANS,
		fontWeight: o.weight ?? 500,
		fontSize: o.size,
		lineHeight: lh,
		fill: o.color,
		align: o.align ?? "start",
		letterSpacing: o.letterSpacing ?? -o.size * 0.015,
		animators: [animator],
	} as never).animate(anim);
}

/** A headline over a subline, the film's caption pair. */
export function caption(o: {
	title: string;
	sub?: string;
	x: number;
	y: number;
	width: number;
	at: number;
	out?: number;
	dark?: boolean;
	align?: "start" | "center" | "end";
	size?: number;
	subSize?: number;
	gap?: number;
}): Node[] {
	const size = o.size ?? 84;
	const subSize = o.subSize ?? 38;
	const ink = o.dark === false ? C.nightInk : C.ink;
	const ink2 = o.dark === false ? C.slateInk : C.ink2;
	const titleLines = o.title.split("\n").length;
	const out: Node[] = [
		line({ text: o.title, x: o.x, y: o.y, width: o.width, size, color: ink, weight: 400, align: o.align, at: o.at, out: o.out }),
	];
	if (o.sub) {
		out.push(
			line({
				text: o.sub,
				x: o.x,
				y: o.y + titleLines * Math.round(size * 1.22) + (o.gap ?? 22),
				width: o.width,
				size: subSize,
				color: ink2,
				weight: 300,
				align: o.align,
				at: o.at + f(0.35),
				out: o.out === undefined ? undefined : o.out + f(0.06),
				unit: "word",
				letterSpacing: 0,
				lineHeight: Math.round(subSize * 1.4),
			}),
		);
	}
	return out;
}

// ── Light and atmosphere ─────────────────────────────────────────────────────

/** A soft round glow (radial gradient to clear), drifting slowly. */
export function glow(o: { x: number; y: number; r: number; color: string; opacity?: number; drift?: number; seed?: number }): Node {
	const d = o.drift ?? 40;
	return Layer.shape("circle", {
		id: id("glow"),
		position: "absolute",
		x: o.x - o.r,
		y: o.y - o.r,
		width: o.r * 2,
		height: o.r * 2,
		fill: `radial-gradient(circle, ${Color.alpha(o.color, 0.9)} 0%, ${Color.alpha(o.color, 0.35)} 38%, ${Color.alpha(o.color, 0)} 70%)`,
		opacity: o.opacity ?? 0.5,
	} as never).animate(
		LayerAnimation.create()
			.wiggle("x" as never, { frequency: 0.12, amplitude: d, seed: o.seed ?? 1 } as never)
			.wiggle("y" as never, { frequency: 0.1, amplitude: d * 0.7, seed: (o.seed ?? 1) + 7 } as never),
	);
}

/** Slow, soft bokeh dust for depth. */
export function dust(o: { seed?: number; color?: string; count?: number; opacity?: number } = {}): Node {
	const color = o.color ?? "#c9d6ff";
	return Layer.particles({
		id: id("dust"),
		width: W,
		height: H,
		max: o.count ?? 260,
		seed: o.seed ?? 3,
		emitter: { shape: "rect", x: 0, y: 0, width: W, height: H, rate: (o.count ?? 260) / 9 },
		lifetime: [7, 11],
		speed: [4, 18],
		direction: -90,
		spread: 360,
		noise: { strength: 14, scale: 420, speed: 0.08 },
		size: [7, 2],
		sizeJitter: 0.85,
		fade: [0.35, 0.4],
		shape: "soft",
		blend: "add",
		color: [Color.alpha(color, (o.opacity ?? 0.22) * 0.6), Color.alpha(color, o.opacity ?? 0.22)],
		prewarm: 10,
	} as never);
}

/**
 * A diagonal band of light that crosses a `w`×`h` box once, from frame `at` over `len`.
 * Put it inside a clipping box (overflow hidden) over the thing it lights.
 */
export function sweep(o: { w: number; h: number; at: number; len?: number; strength?: number; band?: number }): Node {
	const band = o.band ?? Math.max(o.w, o.h) * 0.42;
	const a = Math.min(1, o.strength ?? 0.32);
	const len = o.len ?? f(1.1);
	return Layer.box({
		id: id("sweep"),
		position: "absolute",
		x: -band * 2,
		y: -o.h * 0.5,
		width: band,
		height: o.h * 2,
		rotation: 18,
		background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${a * 0.45}) 35%, rgba(255,255,255,${a}) 50%, rgba(255,255,255,${a * 0.45}) 65%, rgba(255,255,255,0) 100%)`,
		opacity: 1,
	} as never).animate(keys("x", [[0, -band * 2], [o.at, -band * 2], [o.at + len, o.w + band, "power2.inOut"]]));
}

// ── Bits of UI ───────────────────────────────────────────────────────────────

/** A Lucide icon as one stroked path, `size` px square, at (x, y) top-left. */
export function icon(name: IconName, o: { x: number; y: number; size: number; color: string; stroke?: number; id?: string }): Node {
	const s = o.size / 24;
	return Layer.shape("path", {
		id: o.id ?? id(`icon-${name}`),
		position: "absolute",
		x: o.x,
		y: o.y,
		width: o.size,
		height: o.size,
		d: transformPath(ICON_PATHS[name], s),
		fillType: "none",
		strokeColor: o.color,
		strokeWidth: (o.stroke ?? 2) * s,
		strokeLineCap: "round",
		strokeLineJoin: "round",
	} as never);
}

/** A pill with a label (and an optional leading dot), sized from the font. */
export function pill(o: {
	text: string;
	x: number;
	y: number;
	size?: number;
	bg: string;
	color: string;
	weight?: number;
	padX?: number;
	h?: number;
	width?: number;
	border?: string;
	dot?: string;
	id?: string;
	/** The label's text over time, [frame, text] (e.g. a counter). */
	textKeys?: Key[];
	align?: "start" | "center";
}): Node {
	const size = o.size ?? 26;
	const h = o.h ?? Math.round(size * 2);
	const padX = o.padX ?? Math.round(size * 0.85);
	const dotW = o.dot ? Math.round(size * 0.42) : 0;
	const gap = o.dot ? Math.round(size * 0.45) : 0;
	const textW = Math.ceil(textWidth(o.text, size, o.weight ?? 500)) + 2;
	const w = o.width ?? padX * 2 + dotW + gap + textW;
	const children: Node[] = [];
	if (o.dot) {
		children.push(
			Layer.shape("circle", {
				id: id("pill-dot"),
				position: "absolute",
				x: padX,
				y: h / 2 - dotW / 2,
				width: dotW,
				height: dotW,
				fill: o.dot,
			} as never),
		);
	}
	const label = Layer.text(o.text, {
		id: id("pill-text"),
		position: "absolute",
		x: o.align === "center" ? 0 : padX + dotW + gap,
		y: 0,
		width: o.align === "center" ? w : w - (padX + dotW + gap),
		height: h,
		align: o.align === "center" ? "center" : "start",
		verticalAlign: "middle",
		fontFamily: SANS,
		fontWeight: o.weight ?? 500,
		fontSize: size,
		fill: o.color,
	} as never);
	if (o.textKeys && o.textKeys.length > 1) {
		// Text can't be keyframed to new words, so each value is its own label, shown in turn.
		o.textKeys.forEach(([at, t], i) => {
			const next = o.textKeys![i + 1]?.[0];
			const k: Key[] = [[0, i === 0 ? 1 : 0]];
			if (i > 0) k.push([Number(at) - 1, 0, "hold"], [Number(at), 1, "hold"]);
			if (next !== undefined) k.push([Number(next) - 1, 1, "hold"], [Number(next), 0, "hold"]);
			children.push(
				Layer.text(String(t), {
					id: id("pill-text"),
					position: "absolute",
					x: o.align === "center" ? 0 : padX + dotW + gap,
					y: 0,
					width: o.align === "center" ? w : w - (padX + dotW + gap),
					height: h,
					align: o.align === "center" ? "center" : "start",
					verticalAlign: "middle",
					fontFamily: SANS,
					fontWeight: o.weight ?? 500,
					fontSize: size,
					fill: o.color,
				} as never).animate(keys("opacity", k)),
			);
		});
	} else children.push(label);
	return Layer.box({
		id: o.id ?? id("pill"),
		position: "absolute",
		x: o.x,
		y: o.y,
		width: w,
		height: h,
		borderRadius: h / 2,
		background: o.bg,
		borderColor: o.border,
		borderWidth: o.border ? 1.5 : 0,
		children,
	} as never);
}

export function textWidth(text: string, size: number, weight = 500): number {
	return FontManager.measure(text, { fontFamily: fontFace(weight), fontSize: size }).width;
}

/** Pop in with a springy overshoot at `at`. */
export function popIn(at: number, len = f(0.55), from = 0.4, over = 1.7) {
	return merge(
		keys("scale", [[0, from], [at, from], [at + len, 1, `back.out(${over})`]]),
		keys("opacity", [[0, 0], [at, 0], [at + f(0.18), 1, "power1.out"]]),
	);
}

// ── Soft shapes (SVG with a Gaussian blur, as an image layer) ────────────────

const svgUri = (svg: string) =>
	`data:image/svg+xml;base64,${typeof Buffer !== "undefined" ? Buffer.from(svg).toString("base64") : btoa(unescape(encodeURIComponent(svg)))}`;

/**
 * Any SVG path, blurred: soft glows, auras and contact shadows. `d` is in the layer's own
 * px (w×h); `pad` px of room is added round it so the blur is never clipped.
 */
export function soft(o: {
	d: string;
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
	blur: number;
	opacity?: number;
	pad?: number;
	id?: string;
}): Node {
	const pad = o.pad ?? Math.ceil(o.blur * 3);
	const W2 = o.w + pad * 2;
	const H2 = o.h + pad * 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${o.blur}"/></filter></defs><g transform="translate(${pad} ${pad})"><path d="${o.d}" fill="${o.fill}" filter="url(#b)"/></g></svg>`;
	return Layer.svg(svgUri(svg), {
		id: o.id ?? id("soft"),
		position: "absolute",
		x: o.x - pad,
		y: o.y - pad,
		width: W2,
		height: H2,
		opacity: o.opacity ?? 1,
	} as never);
}

/** A rounded-rect path (px). */
export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
	const q = Math.min(r, w / 2, h / 2);
	return `M${x + q} ${y}H${x + w - q}A${q} ${q} 0 0 1 ${x + w} ${y + q}V${y + h - q}A${q} ${q} 0 0 1 ${x + w - q} ${y + h}H${x + q}A${q} ${q} 0 0 1 ${x} ${y + h - q}V${y + q}A${q} ${q} 0 0 1 ${x + q} ${y}Z`;
}

/** A soft contact shadow under a card (w×h at x, y), offset down. */
export function cardShadow(o: { x: number; y: number; w: number; h: number; r?: number; dy?: number; blur?: number; opacity?: number; color?: string }): Node {
	const dy = o.dy ?? Math.round(o.h * 0.06);
	const inset = Math.round(o.w * 0.04);
	return soft({
		d: roundRect(0, 0, o.w - inset * 2, o.h - inset, o.r ?? 24),
		x: o.x + inset,
		y: o.y + dy + inset,
		w: o.w - inset * 2,
		h: o.h - inset,
		fill: o.color ?? "#000000",
		blur: o.blur ?? Math.round(Math.min(o.w, o.h) * 0.07),
		opacity: o.opacity ?? 0.5,
	});
}

/** The camera distance at which a plane at z = 0 shows at 1:1 (vertical field of view 50°). */
export const CAM_1TO1 = H / 2 / Math.tan((25 * Math.PI) / 180);

/** A pointer arrow (tip at its top-left), moved by keyframes and pressed at `presses`. */
export function cursor(o: { x: Key[]; y: Key[]; opacity: Key[]; presses?: number[]; dark?: boolean; id?: string }): Node {
	const S = 1.35;
	const scale: Key[] = [[0, S]];
	for (const p of o.presses ?? []) scale.push([p - f(0.08), S], [p, S * 0.84, "power2.out"], [p + f(0.16), S, "back.out(2)"]);
	return Layer.shape("path", {
		id: o.id ?? id("cursor"),
		position: "absolute",
		x: 0,
		y: 0,
		width: 32,
		height: 44,
		anchorX: 0,
		anchorY: 0,
		d: "M2 2L2 36L11 28L17 42L23 39L17 26L29 26Z",
		fill: o.dark === false ? "#ffffff" : C.nightInk,
		strokeColor: o.dark === false ? C.nightInk : "#ffffff",
		strokeWidth: 2.5,
		strokeLineJoin: "round",
	} as never).animate(keys("x", o.x), keys("y", o.y), keys("opacity", o.opacity), keys("scale", scale));
}
