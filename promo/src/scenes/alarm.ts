/**
 * 08 Alarms with gentle tones. An alarm card rises; its icon disc rings softly with ripples,
 * petals bloom out round it, and the tones you can pick line up beside it.
 */
import { Color, Layer } from "framefields";
import { Geo } from "../lib/dial.js";
import { caption, dust, glow, icon, id, type Key, keys, merge, type Node, popIn, scene, textWidth } from "../lib/kit.js";
import { C, CAT, f, H, SANS, W } from "../theme.js";

export const ALARM_SEC = 5.4;

const CX = 600;
const CY = 540;
/** The ringing disc sits high; the time and buttons below it. */
const DCY = 330;

export function alarmScene(): Node {
	const color = CAT.rest.dark;
	const rise = f(0.25);
	const ring = f(0.9);
	const disc = 210;
	const dx = CX - disc / 2;
	const dy = DCY - disc / 2;
	const dcx = CX;
	const dcy = DCY;

	// Petals blooming out round the disc as it starts to ring.
	const PS = 640;
	const pg = new Geo(PS);
	const petals = Array.from({ length: 10 }, (_, i) => {
		const a = i * 36 + 18;
		const tint = [CAT.rest.dark, CAT.people.dark, CAT.focus.dark, CAT.learn.dark, CAT.routine.dark][i % 5];
		const small = pg.petal(a, 170, 200, 14);
		const big = pg.petal(a, 185, 420, 66);
		const t = ring + i * f(0.03);
		return Layer.shape("path", { id: id("apetal"), position: "absolute", x: dcx - PS / 2, y: dcy - PS / 2, width: PS, height: PS, d: small, fill: Color.alpha(tint, 0.85) } as never).animate(
			keys("d", [[0, small], [t, small], [t + f(1.0), big, "back.out(1.3)"]]),
			keys("rotation", [[0, -30], [t, -30], [t + f(4), 14, "sine.out"]]),
			keys("opacity", [[0, 0], [t, 0], [t + f(0.2), 0.55], [t + f(2.4), 0.32, "sine.inOut"]]),
		);
	});

	// Ripples: soft rings leaving the disc, one after another.
	const ripples = [0, 1, 2, 3].map((i) => {
		const t = ring + f(0.15) + i * f(0.75);
		const r0 = disc / 2;
		return Layer.shape("circle", { id: id("ripple"), position: "absolute", x: dcx - r0, y: dcy - r0, width: disc, height: disc, fillType: "none", strokeColor: color, strokeWidth: 3 } as never).animate(
			keys("scale", [[0, 1], [t, 1], [t + f(1.6), 2.3, "power2.out"]]),
			keys("opacity", [[0, 0], [t, 0], [t + f(0.08), 0.8], [t + f(1.6), 0, "power1.in"]]),
		);
	});

	// The bell rocks, a little less each time.
	const rock: Key[] = [[0, 0], [ring, 0]];
	const amp = [16, -14, 11, -9, 6, -4, 2, 0];
	amp.forEach((a, i) => rock.push([ring + (i + 1) * f(0.12), a, "sine.inOut"]));
	rock.push([ring + f(2.2), 0], [ring + f(2.34), 10, "sine.inOut"], [ring + f(2.46), -8, "sine.inOut"], [ring + f(2.58), 5, "sine.inOut"], [ring + f(2.7), 0, "sine.inOut"]);

	const ty = 625;
	const cardNodes = [
		Layer.shape("circle", { id: "alarm-glow", position: "absolute", x: dcx - 260, y: dcy - 260, width: 520, height: 520, fill: `radial-gradient(circle, ${Color.alpha(color, 0.45)} 0%, ${Color.alpha(color, 0.12)} 40%, ${Color.alpha(color, 0)} 70%)` } as never),
		Layer.shape("circle", { id: "alarm-disc", position: "absolute", x: dx, y: dy, width: disc, height: disc, fill: color } as never),
		icon("alarm", { x: dcx - 56, y: dcy - 56, size: 112, color: "#151c2a", stroke: 2 }).animate(keys("rotation", rock)),
		Layer.text("7:00", { id: "alarm-time", position: "absolute", x: CX - 300, y: ty, width: 560, height: 140, align: "center", fontFamily: SANS, fontWeight: 300, fontSize: 132, letterSpacing: -4, fill: C.ink } as never),
		Layer.text("am", { id: "alarm-ap", position: "absolute", x: CX + 118, y: ty + 70, width: 80, height: 50, fontFamily: SANS, fontWeight: 400, fontSize: 40, fill: C.ink2 } as never),
		Layer.text("Wake up gently", { id: "alarm-title", position: "absolute", x: CX - 300, y: ty + 150, width: 600, height: 46, align: "center", fontFamily: SANS, fontWeight: 500, fontSize: 36, fill: C.ink } as never),
		Layer.box({ id: "alarm-stop", position: "absolute", x: CX - 240, y: ty + 230, width: 230, height: 74, borderRadius: 37, background: C.ink, children: [
			Layer.text("Stop", { id: id("stop-t"), position: "absolute", x: 0, y: 0, width: 230, height: 74, align: "center", verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 30, fill: C.ground } as never),
		] } as never),
		Layer.box({ id: "alarm-snooze", position: "absolute", x: CX + 10, y: ty + 230, width: 230, height: 74, borderRadius: 37, background: Color.alpha("#ffffff", 0.08), borderColor: C.lineStrong, borderWidth: 1.5, children: [
			Layer.text("Snooze", { id: id("snooze-t"), position: "absolute", x: 0, y: 0, width: 230, height: 74, align: "center", verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 30, fill: C.ink } as never),
		] } as never),
	];
	// The card rises with a little spring.
	const cardGroup = Layer.box({ id: "alarm-group", position: "absolute", x: 0, y: 0, width: W, height: H, children: [...petals, ...ripples, ...cardNodes] } as never).animate(
		merge(
			keys("y", [[0, 60], [rise, 60], [rise + f(0.7), 0, "back.out(1.6)"]]),
			keys("opacity", [[0, 0], [rise, 0], [rise + f(0.25), 1]]),
		),
	);

	// The tones you can pick (the app's own seven).
	const tones = ["Dawn", "Meadow", "Harp", "Chimes", "Bedside", "Music box", "Tide"];
	const TX = 1150;
	let x = TX;
	let y = 700;
	const chips: Node[] = [];
	tones.forEach((name, i) => {
		const w = Math.ceil(textWidth(name, 28, 500)) + 56 + (i === 0 ? 40 : 0);
		if (x + w > 1850) {
			x = TX;
			y += 82;
		}
		const at = f(1.4) + i * f(0.1);
		const sel = i === 0;
		chips.push(
			Layer.box({
				id: id("tone"),
				position: "absolute",
				x,
				y,
				width: w,
				height: 64,
				borderRadius: 32,
				background: sel ? color : Color.alpha("#ffffff", 0.07),
				borderColor: sel ? undefined : C.lineStrong,
				borderWidth: sel ? 0 : 1.5,
				children: [
					...(sel ? [icon("bell-ring", { x: 22, y: 18, size: 28, color: "#151c2a", stroke: 2.1 })] : []),
					Layer.text(name, { id: id("tone-t"), position: "absolute", x: sel ? 62 : 28, y: 0, width: w, height: 64, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: sel ? "#151c2a" : C.ink } as never),
				],
			} as never).animate(popIn(at, f(0.45), 0.6, 1.9), keys("opacity", [[f(ALARM_SEC - 0.6), 1], [f(ALARM_SEC - 0.3), 0]])),
		);
		x += w + 14;
	});

	return scene("alarm", C.ground, [
		Layer.box({ id: "alarm-bg", position: "absolute", x: 0, y: 0, width: W, height: H, background: "radial-gradient(circle at 32% 50%, #221f3d 0%, #121628 45%, #080b12 100%)" } as never),
		glow({ x: CX, y: CY - 100, r: 700, color, opacity: 0.16, drift: 40, seed: 61 }),
		dust({ seed: 19, opacity: 0.16 }),
		cardGroup,
		...caption({ title: "Alarms with\ngentle tones.", sub: "A soft chime that starts quiet\nand grows. Never a startle.", x: TX, y: 300, width: 720, at: f(0.4), out: f(ALARM_SEC - 0.6), size: 76, subSize: 36 }),
		...chips,
	]);
}

export const alarmCues = () => [{ at: 0.9, sfx: "alarm" as const, gain: 0.85 }];
