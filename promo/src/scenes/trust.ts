/**
 * 09 Peace of mind. Two cards float in: a 30-day Trash (a block drops into the bin and comes
 * back), and Private by default (it runs on your computer).
 */
import { Color, Layer } from "framefields";
import type { IconName } from "../lib/icons.data.js";
import { dust, glow, icon, id, keys, type Node, popIn, roundRect, scene, soft, textWidth } from "../lib/kit.js";
import { C, CAT, f, H, SANS, W } from "../theme.js";

export const TRUST_SEC = 5.3;

const CWD = 760;
const CHT = 640;

function card(o: { x: number; at: number; tilt: number; tint: string; ic: IconName; title: string; sub: string; extra: Node[] }): Node {
	const y = (H - CHT) / 2 + 20;
	const inner = [
		soft({ d: roundRect(0, 0, CWD - 60, CHT - 40, 40), x: 30, y: 56, w: CWD - 60, h: CHT - 40, fill: "#000000", blur: 40, opacity: 0.5 }),
		Layer.box({
			id: id("trust-card"),
			position: "absolute",
			x: 0,
			y: 0,
			width: CWD,
			height: CHT,
			borderRadius: 40,
			background: `linear-gradient(160deg, ${Color.mix(o.tint, C.raised, 0.86)} 0%, ${C.raised} 55%, ${C.surface} 100%)`,
			borderColor: C.lineStrong,
			borderWidth: 1.5,
		} as never),
		Layer.box({ id: id("trust-tile"), position: "absolute", x: 56, y: 56, width: 112, height: 112, borderRadius: 32, background: Color.alpha(o.tint, 0.18) } as never),
		icon(o.ic, { x: 80, y: 80, size: 64, color: o.tint, stroke: 2 }),
		Layer.text(o.title, { id: id("trust-t"), position: "absolute", x: 56, y: 200, width: CWD - 100, height: 72, fontFamily: SANS, fontWeight: 500, fontSize: 56, letterSpacing: -0.8, fill: C.ink } as never),
		Layer.text(o.sub, { id: id("trust-s"), position: "absolute", x: 56, y: 286, width: CWD - 100, height: 110, fontFamily: SANS, fontWeight: 300, fontSize: 34, lineHeight: 50, fill: C.ink2 } as never),
		...o.extra,
	];
	return Layer.box({ id: id("trust"), position: "absolute", x: o.x, y, width: CWD, height: CHT, perspective: 1600, children: inner } as never).animate(
		keys("y", [[0, y + 120], [o.at, y + 120], [o.at + f(0.9), y, "expo.out"], [f(TRUST_SEC), y - 16, "sine.inOut"]]),
		keys("rotateY", [[0, o.tilt * 2.2], [o.at, o.tilt * 2.2], [o.at + f(1.1), o.tilt, "expo.out"], [f(TRUST_SEC), o.tilt * 0.4, "sine.inOut"]]),
		keys("opacity", [[0, 0], [o.at, 0], [o.at + f(0.3), 1]]),
	);
}

export function trustScene(): Node {
	// Card one: a block drops into the bin, then comes back.
	const drop = f(1.5);
	const back = f(2.7);
	const binX = 630;
	const binY = 450;
	const pillW = 300;
	const pill = Layer.box({
		id: "trust-pill",
		position: "absolute",
		x: 56,
		y: 470,
		width: pillW,
		height: 76,
		borderRadius: 24,
		background: CAT.people.dark,
		children: [
			icon("phone", { x: 22, y: 20, size: 36, color: "#151c2a", stroke: 2.2 }),
			Layer.text("Call Mum · 6pm", { id: id("pill-t"), position: "absolute", x: 72, y: 0, width: 230, height: 76, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: "#151c2a" } as never),
		],
	} as never).animate(
		keys("x", [[0, 56], [drop, 56], [drop + f(0.55), binX - 20, "power2.in"], [back, binX - 20], [back + f(0.7), 56, "back.out(1.4)"]]),
		keys("y", [[0, 470], [drop, 470], [drop + f(0.3), 420, "power2.out"], [drop + f(0.55), binY + 30, "power2.in"], [back, binY + 30], [back + f(0.35), 400, "power2.out"], [back + f(0.7), 470, "back.out(1.6)"]]),
		keys("scale", [[0, 1], [drop, 1], [drop + f(0.55), 0.25, "power2.in"], [back, 0.25], [back + f(0.5), 1, "back.out(1.6)"]]),
		keys("opacity", [[0, 1], [drop + f(0.45), 1], [drop + f(0.55), 0], [back, 0], [back + f(0.1), 1]]),
	);
	const bin = icon("trash", { x: binX, y: binY, size: 96, color: C.ink2, stroke: 1.8 }).animate(
		keys("scale", [[0, 1], [drop + f(0.5), 1], [drop + f(0.62), 1.14, "power2.out"], [drop + f(0.9), 1, "back.out(2)"], [back - f(0.05), 1], [back + f(0.1), 1.12], [back + f(0.4), 1, "back.out(2)"]]),
	);
	const restored = Layer.box({ id: "trust-restored", position: "absolute", x: 374, y: 480, width: 230, height: 56, borderRadius: 28, background: Color.alpha(C.lume, 0.16), children: [
		icon("undo", { x: 20, y: 14, size: 28, color: C.lume, stroke: 2.2 }),
		Layer.text("Restored", { id: id("rest-t"), position: "absolute", x: 60, y: 0, width: 160, height: 56, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 26, fill: C.lume } as never),
	] } as never).animate(popIn(back + f(0.6), f(0.45), 0.6, 2));

	// Card two: what keeps it private.
	const facts = ["Works offline", "Data on your computer", "You choose what connects"];
	let fx = 56;
	let fy = 440;
	const chips: Node[] = facts.map((t, i) => {
		const w = Math.ceil(textWidth(t, 26, 500)) + 50;
		if (fx + w > CWD - 40) {
			fx = 56;
			fy += 76;
		}
		const node = Layer.box({ id: id("fact"), position: "absolute", x: fx, y: fy, width: w, height: 60, borderRadius: 30, background: Color.alpha(C.lume, 0.12), borderColor: Color.alpha(C.lume, 0.35), borderWidth: 1.5, children: [
			Layer.text(t, { id: id("fact-t"), position: "absolute", x: 0, y: 0, width: w, height: 60, align: "center", verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 26, fill: C.ink } as never),
		] } as never).animate(popIn(f(1.6) + i * f(0.15), f(0.45), 0.6, 1.9));
		fx += w + 14;
		return node;
	});

	return scene("trust", C.ground, [
		Layer.box({ id: "trust-bg", position: "absolute", x: 0, y: 0, width: W, height: H, background: "radial-gradient(circle at 50% 50%, #1a2238 0%, #0f1524 50%, #080b12 100%)" } as never),
		glow({ x: 560, y: 520, r: 560, color: CAT.people.dark, opacity: 0.1, drift: 40, seed: 71 }),
		glow({ x: 1380, y: 560, r: 560, color: CAT.care.dark, opacity: 0.1, drift: 40, seed: 72 }),
		dust({ seed: 23, opacity: 0.16 }),
		card({ x: 160, at: f(0.15), tilt: 9, tint: CAT.routine.dark, ic: "trash", title: "A 30-day Trash.", sub: "Removed something by mistake?\nBring it back for 30 days.", extra: [bin, pill, restored] }),
		card({ x: 1000, at: f(0.4), tilt: -9, tint: CAT.care.dark, ic: "shield", title: "Private by default.", sub: "Daybloom runs on your computer.\nYour plans stay with you.", extra: chips }),
	]);
}

export const trustCues = () => [
	{ at: 2.0, sfx: "pop" as const, gain: 0.6 },
	{ at: 2.75, sfx: "pluck" as const, gain: 0.5 },
];

