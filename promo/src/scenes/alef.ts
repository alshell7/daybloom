/**
 * 04 Meet Alef. The middle of the dial becomes Alef's round screen. Its inked eyes wake with a
 * spring, glance round, blink and smile; sparkles pop; it offers to start with two minutes;
 * then it looks over at the AI services it can think with, all set up once in Settings.
 */
import { Color, Layer } from "framefields";
import { eyeInk, eyes, sparkle } from "../lib/alef.js";
import { dial, Geo, SAMPLE_DAY } from "../lib/dial.js";
import { caption, cursor, glow, icon, id, type Key, keys, merge, type Node, popIn, roundRect, scene, soft, textWidth } from "../lib/kit.js";
import { C, CAT, f, GLACIER_FINISH, H, SANS } from "../theme.js";

export const ALEF_SEC = 9.2;

const S = 980;
const X0 = 110;
const Y0 = (H - S) / 2;
const CX = X0 + S / 2;
const CY = Y0 + S / 2;

export function alefScene(): Node {
	const F = GLACIER_FINISH;
	const g = new Geo(S);
	const parts = dial({ size: S, finish: F, arcs: SAMPLE_DAY });

	// Alef's screen: the readout area, a touch brighter, with a glass ring.
	const screen = [
		Layer.shape("path", { id: "alef-screen", position: "absolute", x: 0, y: 0, width: S, height: S, d: g.circle(250), fill: "radial-gradient(circle at 50% 35%, #ffffff 0%, #f6f8fb 60%, #eef2f6 100%)" } as never),
		Layer.shape("path", { id: "alef-screen-ring", position: "absolute", x: 0, y: 0, width: S, height: S, d: g.circle(253), fillType: "none", strokeColor: Color.alpha("#8f9aaa", 0.35), strokeWidth: 6 * g.k } as never),
	];

	const eyeY = CY - 18;
	// The pointer wanders over, and Alef's eyes follow it across the screen; then it pets Alef.
	const path: [number, number, number][] = [
		[1.0, 1580, 900],
		[1.45, 1260, 730],
		[1.9, 1090, 230],
		[2.3, 760, 110],
		[2.65, CX + 30, eyeY - 120],
	];
	const pet = f(2.75);
	const pointer = cursor({
		x: [[0, path[0][1]], ...path.map(([t, x]) => [f(t), x, "sine.inOut"] as Key), [pet + f(0.25), CX + 70, "sine.inOut"], [f(3.6), CX + 260, "power2.in"]],
		y: [[0, path[0][2]], ...path.map(([t, , y]) => [f(t), y, "sine.inOut"] as Key), [pet + f(0.25), eyeY - 110, "sine.inOut"], [f(3.6), eyeY + 260, "power2.in"]],
		opacity: [[0, 0], [f(1.0), 0], [f(1.2), 1], [f(3.3), 1], [f(3.6), 0]],
		presses: [pet],
	});
	const clamp = (v: number) => Math.max(-1, Math.min(1, v));
	const gaze = path.map(([t, x, y]) => ({ at: f(t + 0.08), x: Math.round(34 * clamp((x - CX) / 650)), y: Math.round(22 * clamp((y - eyeY) / 450)), ease: "back.out(1.3)" }));
	const e = eyes({
		cx: CX,
		cy: eyeY,
		w: 112,
		h: 126,
		gap: 84,
		color: eyeInk,
		shadow: "#14202e",
		poses: [
			{ at: 0, open: 0.08 },
			{ at: f(0.9), open: 1, ease: "back.out(2.2)" },
			...gaze,
			{ at: pet + f(0.1), smile: 1, x: 0, y: -10, ease: "back.out(2)" },
			{ at: f(3.7), smile: 0, y: 0 },
			{ at: f(5.9), x: 34, y: 18, ease: "back.out(1.6)" },
			{ at: f(7.6), x: 10, y: 4, ease: "back.out(1.4)" },
			{ at: f(8.3), smile: 0.8, y: -6 },
		],
		blinks: [f(1.65), f(5.2), f(7.0), f(8.6)],
		talk: [[f(4.0), f(5.0)]],
	});

	// Sparkles round the face when it smiles.
	const amber = CAT.routine.light;
	const sparks = [
		sparkle(CX - 175, CY - 150, 20, amber, f(2.85)),
		sparkle(CX + 160, CY - 170, 13, amber, f(2.95)),
		sparkle(CX + 190, CY + 40, 16, amber, f(3.05)),
		sparkle(CX - 205, CY + 70, 11, amber, f(3.15)),
	];

	// A soft light round the screen that warms up as Alef wakes.
	const halo = soft({ d: g.ring(236, 300), x: X0, y: Y0, w: S, h: S, fill: F.lume, blur: 26, opacity: 0.5 }).animate(
		keys("opacity", [[0, 0], [f(0.8), 0], [f(1.6), 0.45, "power2.out"], [f(2.6), 0.8, "power2.out"], [f(4.4), 0.45, "sine.inOut"]]),
	);

	// The speech bubble: "Let's start with just two minutes."
	const say = "Let's start with\njust two minutes.";
	const bw = 540;
	const bh = 164;
	const bx = CX + 110;
	const by = Y0 + 30;
	const bubble = Layer.box({
		id: "alef-bubble",
		position: "absolute",
		x: bx,
		y: by,
		width: bw,
		height: bh + 26,
		anchorX: 0.1,
		anchorY: 1,
		children: [
			soft({ d: roundRect(0, 0, bw, bh, 34), x: 0, y: 14, w: bw, h: bh, fill: "#151c2a", blur: 18, opacity: 0.16 }),
			Layer.shape("path", { id: "alef-bubble-body", position: "absolute", x: 0, y: 0, width: bw, height: bh + 26, d: `${roundRect(0, 0, bw, bh, 34)}M60 ${bh - 2}L54 ${bh + 24}L92 ${bh - 2}Z`, fill: "#ffffff" } as never),
			Layer.text(say, { id: "alef-say", position: "absolute", x: 40, y: 26, width: bw - 80, height: bh - 52, fontFamily: SANS, fontWeight: 500, fontSize: 40, lineHeight: 54, fill: C.nightInk } as never),
		],
	} as never).animate(
		merge(
			keys("scale", [[0, 0.3], [f(3.8), 0.3], [f(4.25), 1, "back.out(1.8)"], [f(5.6), 1], [f(5.9), 0.6, "power2.in"]]),
			keys("opacity", [[0, 0], [f(3.8), 0], [f(3.95), 1], [f(5.6), 1], [f(5.9), 0, "power2.in"]]),
		),
	);
	// A small two-minute timer chip that drops in under the bubble.
	const timer = Layer.box({
		id: "alef-timer",
		position: "absolute",
		x: bx + 250,
		y: by + bh + 40,
		width: 190,
		height: 64,
		borderRadius: 32,
		background: CAT.care.light,
		children: [
			icon("timer", { x: 22, y: 16, size: 32, color: "#ffffff", stroke: 2.2 }),
			Layer.text("2 min", { id: id("timer-t"), position: "absolute", x: 64, y: 0, width: 110, height: 64, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 30, fill: "#ffffff" } as never),
		],
	} as never).animate(popIn(f(4.45), f(0.5), 0.5), keys("opacity", [[0, 0], [f(4.45), 0], [f(4.6), 1], [f(5.6), 1], [f(5.9), 0]]));

	// The AI services it can think with.
	const services = ["On this device", "OpenAI", "Anthropic", "Gemini", "OpenRouter", "Your own"];
	const chipX0 = 1210;
	let cx = chipX0;
	let cy = 690;
	const chips: Node[] = [];
	services.forEach((name, i) => {
		const w = Math.ceil(textWidth(name, 28, 500)) + 56 + (i === 0 ? 38 : 0);
		if (cx + w > 1850) {
			cx = chipX0;
			cy += 82;
		}
		const at = f(6.5) + i * f(0.12);
		const node = Layer.box({
			id: id("svc"),
			position: "absolute",
			x: cx,
			y: cy,
			width: w,
			height: 64,
			borderRadius: 32,
			background: i === 0 ? C.nightInk : "#ffffff",
			borderColor: i === 0 ? undefined : "rgba(21,28,42,0.12)",
			borderWidth: i === 0 ? 0 : 1.5,
			children: [
				...(i === 0 ? [icon("cpu", { x: 24, y: 18, size: 28, color: "#ffffff", stroke: 2 })] : []),
				Layer.text(name, { id: id("svc-t"), position: "absolute", x: i === 0 ? 62 : 28, y: 0, width: w, height: 64, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: i === 0 ? "#ffffff" : C.nightInk } as never),
			],
		} as never).animate(popIn(at, f(0.5), 0.6, 1.9), keys("opacity", [[0, 0], [at, 0], [at + f(0.12), 1], [f(ALEF_SEC - 0.6), 1], [f(ALEF_SEC - 0.3), 0]]));
		chips.push(node);
		cx += w + 16;
	});

	const dialBox = Layer.box({
		id: "alef-dial",
		position: "absolute",
		x: X0,
		y: Y0,
		width: S,
		height: S,
		overflow: "visible",
		children: [...parts.aura, ...parts.bezel, ...parts.arcs.flat(), ...parts.face, ...screen, ...parts.hand],
	} as never).animate(keys("scale", [[0, 1.04], [f(ALEF_SEC), 1, "sine.out"]]));

	return scene("alef", C.fog, [
		Layer.box({ id: "alef-bg", position: "absolute", x: 0, y: 0, width: 1920, height: H, background: "radial-gradient(circle at 32% 50%, #ffffff 0%, #f0f3f7 45%, #e2e7ee 100%)" } as never),
		glow({ x: CX, y: CY, r: 640, color: CAT.care.light, opacity: 0.1, drift: 20, seed: 21 }),
		Layer.shape("circle", { id: "alef-shadow", position: "absolute", x: X0 + 30, y: Y0 + 50, width: S - 60, height: S - 60, fill: "radial-gradient(circle, rgba(21,28,42,0.2) 0%, rgba(21,28,42,0.1) 55%, rgba(21,28,42,0) 72%)" } as never),
		dialBox,
		halo,
		...e,
		...sparks,
		bubble,
		timer,
		...caption({ title: "Meet Alef.", sub: "A small robot friend\nwho lives in your dial.\nIts eyes follow you, and\nit shows how it feels.", x: 1210, y: 300, width: 680, at: f(2.1), out: f(5.6), dark: false, size: 88, subSize: 38 }),
		...caption({ title: "Thinks with the AI\nyou choose.", sub: "One AI setup in Settings,\nfor every feature.", x: 1210, y: 300, width: 680, at: f(5.9), out: f(ALEF_SEC - 0.6), dark: false, size: 72, subSize: 36 }),
		...chips,
		pointer,
	]);
}

export const alefCues = () => [
	{ at: 0.9, sfx: "blink" as const, gain: 0.7 },
	{ at: 1.65, sfx: "blink" as const, gain: 0.5 },
	{ at: 2.75, sfx: "tick" as const, gain: 0.5 },
	{ at: 2.85, sfx: "chime" as const, gain: 0.7 },
	{ at: 3.85, sfx: "pop" as const, gain: 0.8 },
	{ at: 4.45, sfx: "tick" as const, gain: 0.8 },
	...[0, 1, 2, 3, 4, 5].map((i) => ({ at: 6.5 + i * 0.12, sfx: "tick" as const, gain: 0.45 })),
];
