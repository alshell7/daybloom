/**
 * 06 A world clock on the dial. A 24-hour dial (noon at the top) grows a thin ring outside the
 * bezel for each of three cities, painted with that city's day, twilight and night, a sun at
 * its noon and a moon at its midnight. The dial turns a little in space so the rings float.
 */
import { Color, Layer } from "framefields";
import { type Arc, at24, dial, Geo, R } from "../lib/dial.js";
import { caption, dust, glow, icon, id, keys, merge, type Node, scene } from "../lib/kit.js";
import { C, CAT, f, H, INK_FINISH, SANS, W } from "../theme.js";
import type { IconName } from "../lib/icons.data.js";

export const WORLD_SEC = 6.2;

const S = 780;
const X0 = 220;
const Y0 = (H - S) / 2 + 10;
/** The dial's box is larger than the dial: in 3D a box draws only inside its bounds. */
const PAD = 150;

/** The sample day on the 24-hour face. */
const DAY24: Arc[] = [
	{ cat: "focus", a0: at24(9, 50), a1: at24(11, 20), icon: "laptop", now: true },
	{ cat: "care", a0: at24(12, 30), a1: at24(13, 10), icon: "utensils" },
	{ cat: "move", a0: at24(13, 20), a1: at24(13, 50), icon: "footprints" },
	{ cat: "focus", a0: at24(14, 15), a1: at24(15, 0), icon: "mail" },
	{ cat: "people", a0: at24(18, 0), a1: at24(18, 50), icon: "phone" },
	{ cat: "move", a0: at24(19, 15), a1: at24(20, 5), icon: "dumbbell" },
	{ cat: "rest", a0: at24(22, 30), a1: at24(23, 59), icon: "moon" },
];

/** Home is Hyderabad at 10:40am; three compare cities. */
const CITIES: { name: string; offset: number; time: string; note: string; icon: IconName }[] = [
	{ name: "London", offset: -4.5, time: "6:10am", note: "4h 30m behind", icon: "sunrise" },
	{ name: "New York", offset: -9.5, time: "1:10am", note: "9h 30m behind", icon: "moon" },
	{ name: "Tokyo", offset: 3.5, time: "2:10pm", note: "3h 30m ahead", icon: "sun" },
];

const SKY = {
	day: Color.mix("#86b8ee", INK_FINISH.face, 0.12),
	dusk: Color.mix("#f29a6a", INK_FINISH.face, 0.06),
	twilight: Color.mix("#6c5cb8", INK_FINISH.face, 0.18),
	night: Color.mix("#343c8c", INK_FINISH.face, 0.32),
	sun: "#ffcb57",
	moon: "#dfe6ff",
};

/** Dial angle where a city's local hour `hc` falls, for a city `off` hours from home. */
const angleOf = (hc: number, off: number) => (((((hc - off - 12) % 24) + 24) % 24) * 15) % 360;

function ringFill(off: number): string {
	// Stops at absolute angles (gradients take at most 8 stops: six for the sky, two to close the turn).
	const sky: [number, string][] = [
		[5, SKY.night],
		[6.1, SKY.dusk],
		[7.3, SKY.day],
		[16.7, SKY.day],
		[17.9, SKY.dusk],
		[19, SKY.night],
	];
	const stops = sky.map(([hc, c]) => [angleOf(hc, off), c] as [number, string]).sort((a, b) => a[0] - b[0]);
	// The colour at 0°: between the last stop and the first, across the top of the dial.
	const [la, lc] = stops[stops.length - 1];
	const [fa, fc] = stops[0];
	const span = fa + 360 - la;
	const t = span > 0 ? (360 - la) / span : 0;
	const top = Color.mix(lc, fc, t);
	const list = [`${top} 0deg`, ...stops.map(([a, c]) => `${c} ${a.toFixed(1)}deg`), `${top} 360deg`];
	return `conic-gradient(${list.join(", ")})`;
}

export function worldScene(): Node {
	const g = new Geo(S);
	const parts = dial({ size: S, finish: INK_FINISH, arcs: DAY24, now: at24(10, 40), numerals: "24h", readout: { big: "10:40", title: "Hyderabad", sub: "Monday morning" } });
	const radii: [number, number][] = [
		[484, 510],
		[517, 543],
		[550, 576],
	];
	const rings: Node[] = [];
	// Paths draw only inside their own box, so the rings (past the case edge) get a bigger one.
	const BIG = Math.round(S * 1.24);
	const gb = new Geo(BIG);
	const sc = S / BIG;
	const off = (S - BIG) / 2;
	CITIES.forEach((c, i) => {
		const [r0, r1] = radii[i];
		const at = f(0.6) + i * f(0.32);
		const pop = merge(
			keys("opacity", [[0, 0], [at, 0], [at + f(0.3), 1, "power2.out"]]),
			keys("scale", [[0, 0.92], [at, 0.92], [at + f(0.8), 1, "back.out(1.6)"]]),
			keys("rotation", [[0, -50], [at, -50], [at + f(1.0), 0, "expo.out"]]),
		);
		const mid = (r0 + r1) / 2;
		const sz = (r1 - r0) * g.k * 0.95;
		const [sx, sy] = g.p(mid, angleOf(12, c.offset));
		const [mx, my] = g.p(mid, angleOf(0, c.offset));
		rings.push(
			Layer.box({
				id: id(`ring-${i}`),
				position: "absolute",
				x: 0,
				y: 0,
				width: S,
				height: S,
				overflow: "visible",
				children: [
					...gb.ringThirds(r0 * sc, r1 * sc).map((d) => Layer.shape("path", { id: id("ring"), position: "absolute", x: off, y: off, width: BIG, height: BIG, d, fill: ringFill(c.offset) } as never)),
					Layer.shape("circle", { id: id("sun"), position: "absolute", x: sx - sz / 2, y: sy - sz / 2, width: sz, height: sz, fill: SKY.sun } as never),
					Layer.shape("circle", { id: id("moon"), position: "absolute", x: mx - sz / 2, y: my - sz / 2, width: sz, height: sz, fill: SKY.moon } as never),
					Layer.shape("circle", { id: id("moon-cut"), position: "absolute", x: mx - sz / 2 + sz * 0.3, y: my - sz / 2 - sz * 0.12, width: sz * 0.85, height: sz * 0.85, fill: SKY.night } as never),
				],
			} as never).animate(pop),
		);
	});
	// The now-hand's arrow reads across every ring: a hairline through them.
	const nowA = at24(10, 40);
	const reach = Layer.shape("path", { id: "world-reach", position: "absolute", x: off, y: off, width: BIG, height: BIG, d: gb.ticks([nowA], R.bezelOut * sc, 580 * sc), fillType: "none", strokeColor: INK_FINISH.signal, strokeWidth: 3, strokeLineCap: "round" } as never).animate(
		keys("opacity", [[0, 0], [f(1.7), 0], [f(2.1), 1]]),
	);

	const dialBox = Layer.box({
		id: "world-dial",
		position: "absolute",
		x: X0 - PAD,
		y: Y0 - PAD,
		width: S + PAD * 2,
		height: S + PAD * 2,
		overflow: "visible",
		perspective: 1800,
		children: [
			Layer.box({
				id: "world-dial-in",
				position: "absolute",
				x: PAD,
				y: PAD,
				width: S,
				height: S,
				overflow: "visible",
				children: [...parts.aura, ...parts.bezel, ...parts.arcs.flat(), ...parts.face, ...parts.readout, ...rings, reach, ...parts.hand],
			} as never),
		],
	} as never).animate(
		keys("rotateY", [[0, 16], [f(WORLD_SEC), 4, "sine.inOut"]]),
		keys("rotateX", [[0, 6], [f(WORLD_SEC), 0, "sine.inOut"]]),
		keys("scale", [[0, 0.98], [f(WORLD_SEC), 1.03, "sine.inOut"]]),
	);

	// The city list, each row in its ring's order.
	const LX = 1180;
	const rows = CITIES.map((c, i) => {
		const y = 560 + i * 118;
		const at = f(0.9) + i * f(0.32);
		return Layer.box({
			id: id("city"),
			position: "absolute",
			x: LX,
			y,
			width: 640,
			height: 96,
			children: [
				Layer.box({ id: id("city-sw"), position: "absolute", x: 0, y: 22, width: 52, height: 52, borderRadius: 26, background: c.icon === "moon" ? SKY.night : c.icon === "sunrise" ? SKY.dusk : SKY.day } as never),
				icon(c.icon, { x: 12, y: 34, size: 28, color: c.icon === "moon" ? SKY.moon : "#151c2a", stroke: 2.2 }),
				Layer.text(c.name, { id: id("city-n"), position: "absolute", x: 80, y: 6, width: 300, height: 46, fontFamily: SANS, fontWeight: 500, fontSize: 36, fill: C.ink } as never),
				Layer.text(c.note, { id: id("city-o"), position: "absolute", x: 80, y: 54, width: 320, height: 34, fontFamily: SANS, fontWeight: 300, fontSize: 26, fill: C.ink3 } as never),
				Layer.text(c.time, { id: id("city-t"), position: "absolute", x: 360, y: 10, width: 260, height: 60, align: "end", fontFamily: SANS, fontWeight: 300, fontSize: 48, fill: C.ink } as never),
			],
		} as never).animate(
			keys("opacity", [[0, 0], [at, 0], [at + f(0.4), 1, "power2.out"], [f(WORLD_SEC - 0.6), 1], [f(WORLD_SEC - 0.25), 0]]),
			keys("x", [[0, LX + 60], [at, LX + 60], [at + f(0.7), LX, "expo.out"]]),
		);
	});

	return scene("world", C.ground, [
		Layer.box({ id: "world-bg", position: "absolute", x: 0, y: 0, width: W, height: H, background: "radial-gradient(circle at 32% 52%, #1b2542 0%, #0f1524 46%, #080b12 100%)" } as never),
		glow({ x: X0 + S / 2, y: Y0 + S / 2, r: 700, color: CAT.rest.dark, opacity: 0.12, drift: 40, seed: 41 }),
		glow({ x: 1500, y: 300, r: 500, color: "#86b8ee", opacity: 0.08, drift: 40, seed: 42 }),
		dust({ seed: 17, opacity: 0.18 }),
		dialBox,
		...rows,
		...caption({
			title: "Your people,\naround the world.",
			sub: "Day and night rings for up to three cities.",
			x: LX,
			y: 200,
			width: 720,
			at: f(0.3),
			out: f(WORLD_SEC - 0.6),
			size: 72,
			subSize: 34,
		}),
	]);
}

export const worldCues = () => [0, 1, 2].map((i) => ({ at: 0.6 + i * 0.32, sfx: "pluck" as const, gain: 0.45 }));
