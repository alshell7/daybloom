/**
 * 05 Free time that respects your day. A day laid out as a timeline: calendar meetings drop
 * in (striped: they come from a calendar), Waqt weaves the salah times in, then a light runs
 * along the day and the free gaps between them open up. A task from the backlog flies into one.
 */
import { Color, Layer } from "framefields";
import { caption, cursor, type Key, dust, glow, icon, id, keys, merge, type Node, popIn, roundRect, scene, textWidth } from "../lib/kit.js";
import { C, CAT, f, H, SANS, W } from "../theme.js";
import type { IconName } from "../lib/icons.data.js";

export const FREE_SEC = 6.9;

const X0 = 150;
const X1 = 1770;
const T0 = 10;
const T1 = 18.5;
const PX = (X1 - X0) / (T1 - T0);
const Y = 590;
const BH = 150;
const tx = (h: number, m = 0) => X0 + (h + m / 60 - T0) * PX;

type Kind = "meeting" | "salah" | "mine";
interface Item {
	kind: Kind;
	from: [number, number];
	to: [number, number];
	title: string;
	icon: IconName;
	color: string;
	sub?: string;
}

const ITEMS: Item[] = [
	{ kind: "meeting", from: [10, 0], to: [10, 50], title: "Sync", icon: "video", color: CAT.people.dark },
	{ kind: "mine", from: [10, 55], to: [11, 58], title: "Draft", icon: "laptop", color: CAT.focus.dark },
	{ kind: "salah", from: [12, 2], to: [12, 25], title: "Dhuhr", sub: "12:02", icon: "mihrab", color: CAT.care.dark },
	{ kind: "meeting", from: [13, 30], to: [14, 30], title: "Review", icon: "users", color: CAT.people.dark },
	{ kind: "salah", from: [16, 14], to: [16, 37], title: "Asr", sub: "4:14", icon: "mihrab", color: CAT.care.dark },
	{ kind: "salah", from: [17, 51], to: [18, 14], title: "Maghrib", sub: "5:51", icon: "mihrab", color: CAT.care.dark },
];

const GAPS: { from: [number, number]; to: [number, number]; label: string }[] = [
	{ from: [12, 25], to: [13, 30], label: "1h 5m free" },
	{ from: [14, 30], to: [16, 14], label: "1h 44m free" },
	{ from: [16, 37], to: [17, 51], label: "1h 14m free" },
];

/** Diagonal stripes over a w×h box: "this comes from a calendar". */
function stripes(w: number, h: number): Node {
	let d = "";
	for (let x = -h; x < w + h; x += 22) d += `M${x} ${h}L${x + h} 0`;
	return Layer.shape("path", { id: id("stripes"), position: "absolute", x: 0, y: 0, width: w, height: h, d, fillType: "none", strokeColor: "rgba(255,255,255,0.22)", strokeWidth: 7 } as never);
}

function block(it: Item, at: number): Node[] {
	const x = tx(...it.from);
	const w = tx(...it.to) - x - 6;
	const ink = "#151c2a";
	const small = it.kind === "salah";
	const children: Node[] = [];
	if (it.kind === "meeting") children.push(stripes(w, BH));
	const isz = 40;
	children.push(icon(it.icon, { x: small ? w / 2 - isz / 2 : 20, y: BH / 2 - isz / 2, size: isz, color: ink, stroke: 2.2 }));
	if (!small) {
		children.push(Layer.text(it.title, { id: id("blk-t"), position: "absolute", x: 70, y: 0, width: w - 72, height: BH, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: ink } as never));
	}
	const yIn = small ? Y : Y - 120;
	const out: Node[] = [
		Layer.box({ id: id(`blk-${it.kind}`), position: "absolute", x, y: Y, width: w, height: BH, borderRadius: 22, background: it.color, overflow: "hidden", children } as never).animate(
			small ? popIn(at, f(0.55), 0.3, 2) : merge(keys("y", [[0, yIn], [at, yIn], [at + f(0.7), Y, "back.out(1.5)"]]), keys("opacity", [[0, 0], [at, 0], [at + f(0.2), 1]])),
		),
	];
	if (small) {
		// Salah names sit under the timeline, with their times.
		out.push(
			Layer.text(it.title, { id: id("salah-t"), position: "absolute", x: x + w / 2 - 110, y: Y + BH + 18, width: 220, height: 38, align: "center", fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: CAT.care.dark } as never).animate(
				keys("opacity", [[0, 0], [at + f(0.2), 0], [at + f(0.5), 1]]),
			),
			Layer.text(it.sub ?? "", { id: id("salah-s"), position: "absolute", x: x + w / 2 - 110, y: Y + BH + 56, width: 220, height: 34, align: "center", fontFamily: SANS, fontWeight: 400, fontSize: 24, fill: C.ink3 } as never).animate(
				keys("opacity", [[0, 0], [at + f(0.3), 0], [at + f(0.6), 1], ...(it.title === "Asr" ? ([[f(5.3), 1], [f(5.4), 0]] as Key[]) : [])]),
			),
		);
	}
	return out;
}

function gap(g: (typeof GAPS)[number], at: number): Node[] {
	const x = tx(...g.from) + 8;
	const w = tx(...g.to) - x - 14;
	const tw = textWidth(g.label, 26, 400);
	const fits = tw + 24 < w;
	return [
		Layer.shape("path", {
			id: id("gap"),
			position: "absolute",
			x,
			y: Y + 6,
			width: w,
			height: BH - 12,
			d: roundRect(1.5, 1.5, w - 3, BH - 15, 20),
			fill: Color.alpha(C.lume, 0.06),
			strokeColor: Color.alpha(C.ink, 0.5),
			strokeWidth: 2.5,
			strokeDashArray: [10, 9],
		} as never).animate(keys("opacity", [[0, 0], [at, 0], [at + f(0.35), 1, "power2.out"]]), keys("scaleX", [[0, 0.6], [at, 0.6], [at + f(0.5), 1, "expo.out"]])),
		Layer.text(fits ? g.label : g.label.replace(" free", ""), {
			id: id("gap-t"),
			position: "absolute",
			x,
			y: Y + BH / 2 - 18,
			width: w,
			height: 36,
			align: "center",
			fontFamily: SANS,
			fontWeight: 400,
			fontSize: 26,
			fill: C.ink2,
		} as never).animate(keys("opacity", [[0, 0], [at + f(0.25), 0], [at + f(0.55), 1, "power2.out"]])),
	];
}

export function freeScene(): Node {
	const ruler: Node[] = [];
	for (let h = T0; h <= T1; h++) {
		const x = tx(h);
		const label = h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;
		if (h > T1) break;
		const at = f(0.2) + (h - T0) * 2;
		ruler.push(
			Layer.box({ id: id("tick"), position: "absolute", x: x - 1, y: Y - 34, width: 2, height: 16, background: C.lineStrong } as never).animate(keys("opacity", [[0, 0], [at, 0], [at + f(0.3), 1]])),
		);
		ruler.push(
				Layer.text(label, { id: id("hr"), position: "absolute", x: x - 60, y: Y - 80, width: 120, height: 34, align: "center", fontFamily: SANS, fontWeight: 400, fontSize: 24, fill: C.ink3 } as never).animate(
					keys("opacity", [[0, 0], [at, 0], [at + f(0.3), 1]]),
				),
			);
	}
	// The timeline's rail.
	ruler.push(Layer.box({ id: "free-rail", position: "absolute", x: X0, y: Y + BH / 2 - 2, width: X1 - X0, height: 4, borderRadius: 2, background: C.line } as never));

	const starts: Record<Kind, number> = { meeting: f(0.5), salah: f(1.25), mine: f(0.85) };
	const blocks = ITEMS.flatMap((it) => block(it, starts[it.kind] + ITEMS.filter((o) => o.kind === it.kind).indexOf(it) * f(0.16)));

	// A light runs along the day and the free gaps open behind it.
	const scanAt = f(2.1);
	const scanLen = f(1.4);
	const scan = Layer.box({
		id: "free-scan",
		position: "absolute",
		x: X0,
		y: Y - 30,
		width: 6,
		height: BH + 60,
		borderRadius: 3,
		background: `linear-gradient(180deg, ${Color.alpha(C.lume, 0)} 0%, ${C.lume} 50%, ${Color.alpha(C.lume, 0)} 100%)`,
	} as never).animate(keys("x", [[0, X0 - 20], [scanAt, X0 - 20], [scanAt + scanLen, X1 + 20, "sine.inOut"]]), keys("opacity", [[0, 0], [scanAt, 0], [scanAt + f(0.1), 1], [scanAt + scanLen - f(0.1), 1], [scanAt + scanLen, 0]]));
	const land = f(4.4);
	const gaps = GAPS.flatMap((g, i) => {
		const nodes = gap(g, scanAt + Math.round(((tx(...g.from) - X0) / (X1 - X0)) * scanLen));
		// The task lands in the 3pm gap, so that gap gives way to what's left of it.
		if (i === 1) for (const n of nodes) n.animate(keys("opacity", [[land - f(0.2), 1], [land, 0, "power2.in"]]));
		return nodes;
	});
	gaps.push(...gap({ from: [15, 30], to: [16, 14], label: "44m free" }, land + f(0.1)));

	// A task from the backlog: a card that flies up into the gap and becomes a block.
	const bx = tx(14, 45);
	const bw = tx(15, 30) - bx - 6;
	const cw = 470;
	const ch = 100;
	const cx = 960 - cw / 2;
	const cy = Y + BH + 150;
	const lift = f(3.5);
	const task = Layer.box({
		id: "free-task",
		position: "absolute",
		x: cx,
		y: cy,
		width: cw,
		height: ch,
		borderRadius: 22,
		background: C.raised,
		borderColor: C.lineStrong,
		borderWidth: 1.5,
		overflow: "hidden",
		children: [
			Layer.box({ id: "free-task-fill", position: "absolute", x: 0, y: 0, width: 1200, height: 400, background: CAT.learn.dark } as never).animate(keys("opacity", [[0, 0], [lift + f(0.25), 0], [land - f(0.15), 1, "power2.inOut"]])),
			Layer.box({
				id: "free-task-card",
				position: "absolute",
				x: 0,
				y: 0,
				width: cw,
				height: ch,
				children: [
					Layer.shape("circle", { id: id("card-dot"), position: "absolute", x: 28, y: ch / 2 - 10, width: 20, height: 20, fill: CAT.learn.dark } as never),
					Layer.text("Call the bank · 45m", { id: id("card-t"), position: "absolute", x: 64, y: 0, width: cw - 80, height: ch, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 30, fill: C.ink } as never),
				],
			} as never).animate(keys("opacity", [[0, 1], [lift + f(0.15), 1], [lift + f(0.4), 0, "power2.in"]])),
			icon("phone", { x: bw / 2 - 20, y: BH / 2 - 20, size: 40, color: "#151c2a", stroke: 2.2 }).animate(keys("opacity", [[0, 0], [land - f(0.15), 0], [land + f(0.1), 1]])),
		],
	} as never).animate(
		keys("x", [[0, cx], [lift, cx], [land, bx, "power3.inOut"]]),
		keys("y", [[0, cy + 60], [f(2.8), cy + 60], [f(3.2), cy, "expo.out"], [lift, cy], [land - f(0.2), Y - 36, "power2.inOut"], [land, Y, "back.out(2)"]]),
		keys("width", [[0, cw], [lift, cw], [land, bw, "power3.inOut"]]),
		keys("height", [[0, ch], [lift, ch], [land, BH, "power3.inOut"]]),
		keys("opacity", [[0, 0], [f(2.8), 0], [f(3.1), 1, "power2.out"]]),
	);
	const taskLabel = [
		Layer.text("Call the bank", { id: "free-task-l", position: "absolute", x: bx + bw / 2 - 150, y: Y + BH + 18, width: 300, height: 38, align: "center", fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: CAT.learn.dark } as never).animate(keys("opacity", [[0, 0], [land, 0], [land + f(0.3), 1]])),
	];
	const leftAt = land + f(0.05);
	const flash = Layer.shape("path", { id: "free-flash", position: "absolute", x: bx - 8, y: Y - 8, width: bw + 16, height: BH + 16, d: roundRect(1.5, 1.5, bw + 13, BH + 13, 28), fillType: "none", strokeColor: CAT.learn.dark, strokeWidth: 3 } as never).animate(
		keys("opacity", [[0, 0], [leftAt, 0], [leftAt + f(0.05), 0.9], [leftAt + f(0.7), 0, "power2.out"]]),
		keys("scale", [[0, 1], [leftAt, 1], [leftAt + f(0.7), 1.25, "expo.out"]]),
	);

	// Salah is tapped right in the timeline: the pointer taps Asr and it is marked prayed.
	const asr = ITEMS.find((it) => it.title === "Asr")!;
	const ax = tx(...asr.from);
	const aw = tx(...asr.to) - ax - 6;
	const tap = f(5.25);
	const pointer = cursor({
		x: [[0, 1500], [f(4.6), 1500], [tap - f(0.05), ax + aw / 2 - 4, "power3.inOut"], [tap + f(0.5), ax + aw / 2 + 40, "power2.inOut"]],
		y: [[0, 1000], [f(4.6), 1000], [tap - f(0.05), Y + BH / 2 + 10, "power3.inOut"], [tap + f(0.5), Y + BH + 140, "power2.inOut"]],
		opacity: [[0, 0], [f(4.6), 0], [f(4.8), 1], [tap + f(0.4), 1], [tap + f(0.6), 0]],
		presses: [tap],
		dark: false,
	});
	const prayed = [
		Layer.shape("circle", { id: "free-prayed", position: "absolute", x: ax + aw / 2 - 22, y: Y - 22, width: 44, height: 44, fill: C.lume, strokeColor: C.ground, strokeWidth: 4 } as never).animate(popIn(tap + f(0.05), f(0.45), 0.2, 2.6)),
		icon("check", { x: ax + aw / 2 - 12, y: Y - 12, size: 24, color: "#0d121c", stroke: 3.2 }).animate(popIn(tap + f(0.1), f(0.45), 0.2, 2.6)),
		Layer.shape("path", { id: "free-prayed-ring", position: "absolute", x: ax - 8, y: Y - 8, width: aw + 16, height: BH + 16, d: roundRect(1.5, 1.5, aw + 13, BH + 13, 26), fillType: "none", strokeColor: C.lume, strokeWidth: 3 } as never).animate(
			keys("opacity", [[0, 0], [tap, 0], [tap + f(0.05), 1], [tap + f(0.8), 0, "power2.out"]]),
			keys("scale", [[0, 1], [tap, 1], [tap + f(0.8), 1.35, "expo.out"]]),
		),
		Layer.text("Prayed", { id: "free-prayed-t", position: "absolute", x: ax + aw / 2 - 110, y: Y + BH + 56, width: 220, height: 34, align: "center", fontFamily: SANS, fontWeight: 500, fontSize: 24, fill: C.lume } as never).animate(
			keys("opacity", [[0, 0], [tap + f(0.1), 0], [tap + f(0.35), 1]]),
		),
	];

	return scene("free", C.ground, [
		Layer.box({ id: "free-bg", position: "absolute", x: 0, y: 0, width: W, height: H, background: "radial-gradient(circle at 50% 60%, #172036 0%, #0f1524 50%, #080b12 100%)" } as never),
		glow({ x: 1100, y: 700, r: 640, color: CAT.care.dark, opacity: 0.1, drift: 50, seed: 31 }),
		dust({ seed: 13, opacity: 0.16 }),
		...ruler,
		...gaps,
		...blocks,
		scan,
		task,
		...taskLabel,
		flash,
		...prayed,
		pointer,
		...caption({
			title: "Free time that respects your day.",
			sub: "Meetings and prayers stay put. Waqt weaves salah\ninto your plans, and Daybloom finds the gaps.",
			x: X0,
			y: 200,
			width: 1600,
			at: f(0.35),
			out: f(FREE_SEC - 0.6),
			size: 72,
			subSize: 36,
		}),
	]);
}

export const freeCues = () => [
	{ at: 0.5, sfx: "tick" as const, gain: 0.5 },
	{ at: 0.66, sfx: "tick" as const, gain: 0.5 },
	{ at: 1.25, sfx: "pluck" as const, gain: 0.45 },
	{ at: 2.1, sfx: "whoosh-soft" as const, gain: 0.6 },
	{ at: 3.5, sfx: "whoosh-soft" as const, gain: 0.5 },
	{ at: 4.35, sfx: "pluck" as const, gain: 0.6 },
	{ at: 5.25, sfx: "tick" as const, gain: 0.7 },
	{ at: 5.3, sfx: "chime" as const, gain: 0.35 },
];
