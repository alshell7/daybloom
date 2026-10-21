/**
 * 07 Board and Gantt. The day's blocks glide in as cards into the Board's columns (Later,
 * Today, Now, Done), the view switch slides over, and every card flows into a bar on the Gantt:
 * one row per kind of block, laid along the hours, with the now-line through them.
 */
import { Color, Layer } from "framefields";
import type { IconName } from "../lib/icons.data.js";
import { caption, glow, icon, id, type Key, keys, type Node, scene, soft, roundRect } from "../lib/kit.js";
import { C, CAT, type Category, f, H, SANS, W } from "../theme.js";

export const BOARD_SEC = 9.0;
/** When the Gantt gives way to the month. */
const MONTH_AT = 5.6;

const COLS = ["Later", "Today", "Now", "Done"] as const;
const CW = 400;
const CH = 104;
const COL_X = (i: number) => 130 + i * 430;
const CARD_Y0 = 540;
const GAP = 18;

const ROWS: Category[] = ["focus", "care", "routine", "move"];
const ROW_NAME: Record<string, string> = { focus: "Focus", care: "Care", routine: "Routine", move: "Move" };
const GX0 = 400;
const GX1 = 1790;
const T0 = 8;
const T1 = 20;
const gx = (h: number, m = 0) => GX0 + ((h + m / 60 - T0) / (T1 - T0)) * (GX1 - GX0);
const ROW_Y = (r: number) => 500 + r * 108;
const BAR_H = 60;

interface CardDef {
	title: string;
	meta: string;
	icon: IconName;
	cat: Category;
	col: number;
	/** Gantt time, or null for a Later card (not timed: it leaves). */
	at: [number, number, number, number] | null;
	done?: boolean;
	live?: boolean;
}

const CARDS: CardDef[] = [
	{ title: "Call the bank", meta: "Later · 45m", icon: "phone", cat: "learn", col: 0, at: null },
	{ title: "Groceries", meta: "Later · 30m", icon: "leaf", cat: "routine", col: 0, at: [17, 0, 17, 40] },
	{ title: "Lunch & water", meta: "12:30pm · 40m", icon: "utensils", cat: "care", col: 1, at: [12, 30, 13, 10] },
	{ title: "Walk outside", meta: "1:20pm · 30m", icon: "footprints", cat: "move", col: 1, at: [13, 20, 13, 50] },
	{ title: "Gym", meta: "7:15pm · 40m", icon: "dumbbell", cat: "move", col: 1, at: [19, 15, 19, 55] },
	{ title: "Draft the proposal", meta: "40m left", icon: "laptop", cat: "focus", col: 2, at: [9, 50, 11, 20], live: true },
	{ title: "Morning meds", meta: "Done · 8:00am", icon: "pill", cat: "care", col: 3, at: [8, 0, 8, 15], done: true },
	{ title: "Plan the day", meta: "Done · 8:30am", icon: "check", cat: "routine", col: 3, at: [8, 30, 8, 50], done: true },
];

export function boardScene(): Node {
	const nodes: Node[] = [];
	const shadows: Node[] = [];
	const inAt = f(0.55);
	const morph = f(3.2);
	const morphLen = f(0.9);
	const perCol = [0, 0, 0, 0];

	CARDS.forEach((c, i) => {
		const color = CAT[c.cat].light;
		const slot = perCol[c.col]++;
		const bx = COL_X(c.col);
		const by = CARD_Y0 + slot * (CH + GAP);
		const t = inAt + i * f(0.09);
		const m0 = morph + i * f(0.045);
		const m1 = m0 + morphLen;
		const row = ROWS.indexOf(c.cat);
		const timed = c.at !== null && row >= 0;
		const gxs = timed ? gx(c.at![0], c.at![1]) : bx;
		const gw = timed ? Math.max(26, gx(c.at![2], c.at![3]) - gxs) : CW;
		const gy = timed ? ROW_Y(row) : by;
		const ease = "power3.inOut";
		const enter = (base: number): Key[] => [[0, base + 380], [t, base + 380], [t + f(0.8), base, "expo.out"]];
		const leave = (base: number, to: number): Key[] => [[m0, base], [m1, to, ease]];
		// Card body: white on the board, a coloured bar on the Gantt.
		const bodyKeys = [
			keys("x", [...enter(bx), ...leave(bx, gxs)]),
			keys("y", [[0, by], [m0, by], [m1, gy + (timed ? 0 : 40), ease]]),
			keys("width", [[0, CW], [m0, CW], [m1, gw, ease]]),
			keys("height", [[0, CH], [m0, CH], [m1, timed ? BAR_H : CH, ease]]),
			keys("rotateY", [[0, -38], [t, -38], [t + f(0.9), 0, "expo.out"]]),
			keys("opacity", [[0, 0], [t, 0], [t + f(0.3), 1], ...(timed ? [] : ([[m0, 1], [m0 + f(0.4), 0]] as Key[]))]),
		];
		shadows.push(
			soft({ d: roundRect(0, 0, CW - 30, CH - 20, 20), x: bx + 15, y: by + 18, w: CW - 30, h: CH - 20, fill: "#151c2a", blur: 14, opacity: 0.12 }).animate(
				keys("opacity", [[0, 0], [t + f(0.3), 0], [t + f(0.7), 0.12], [m0, 0.12], [m0 + f(0.3), 0]]),
			),
		);
		nodes.push(
			Layer.box({ id: id("card"), position: "absolute", x: bx, y: by, width: CW, height: CH, borderRadius: 20, background: c.done ? "#f7faf8" : "#ffffff", borderColor: "rgba(21,28,42,0.08)", borderWidth: 1.5, perspective: 900 } as never).animate(...bodyKeys),
			Layer.box({ id: id("bar"), position: "absolute", x: bx, y: by, width: CW, height: CH, borderRadius: 16, background: c.done ? Color.mix(color, "#ffffff", 0.45) : color } as never).animate(
				...bodyKeys.slice(0, 5),
				keys("opacity", timed ? [[0, 0], [m0 + f(0.15), 0], [m1 - f(0.15), 1, "power2.inOut"]] : [[0, 0]]),
			),
		);
		// Its category stripe, icon tile and words.
		const fade = (a: number): Key[] => [[0, 0], [t + f(0.1), 0], [t + f(0.4), a], [m0, a], [m0 + f(0.25), 0]];
		nodes.push(
			Layer.box({ id: id("stripe"), position: "absolute", x: bx + 14, y: by + 18, width: 6, height: CH - 36, borderRadius: 3, background: color } as never).animate(
				keys("x", [...enter(bx + 14)]),
				keys("opacity", fade(1)),
			),
			Layer.box({ id: id("tile"), position: "absolute", x: bx + 36, y: by + 24, width: 56, height: 56, borderRadius: 16, background: Color.alpha(color, 0.16) } as never).animate(keys("x", enter(bx + 36)), keys("opacity", fade(1))),
		);
		nodes.push(icon(c.icon, { x: bx + 50, y: by + 38, size: 28, color, stroke: 2.2 }).animate(keys("x", enter(bx + 50)), keys("opacity", fade(1))));
		// The title travels: inside the card on the board, beside its bar on the Gantt.
		const tx0 = bx + 110;
		const ty0 = by + 18;
		const tx1 = timed ? gxs + gw + 14 : tx0;
		const ty1 = timed ? gy + BAR_H / 2 - 18 : ty0;
		nodes.push(
			Layer.text(c.title, { id: id("title"), position: "absolute", x: tx0, y: ty0, width: 420, height: 38, fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: c.done ? C.slateInk : C.nightInk } as never).animate(
				keys("x", [...enter(tx0), [m0, tx0], [m1, tx1, ease]]),
				keys("y", [[0, ty0], [m0, ty0], [m1, ty1, ease]]),
				keys("fontSize", [[0, 28], [m0, 28], [m1, 25, ease]]),
				keys("opacity", [[0, 0], [t + f(0.1), 0], [t + f(0.4), 1], ...(timed ? [] : ([[m0, 1], [m0 + f(0.3), 0]] as Key[]))]),
			),
			Layer.text(c.meta, { id: id("meta"), position: "absolute", x: tx0, y: by + 58, width: 280, height: 32, fontFamily: SANS, fontWeight: 400, fontSize: 22, fill: c.live ? CAT.focus.light : C.pencil } as never).animate(keys("x", enter(tx0)), keys("opacity", fade(1))),
		);
		if (c.done) {
			nodes.push(
				Layer.shape("circle", { id: id("done"), position: "absolute", x: bx + CW - 56, y: by + CH / 2 - 17, width: 34, height: 34, fill: C.lumeLight } as never).animate(keys("x", enter(bx + CW - 56)), keys("opacity", fade(1))),
				icon("check", { x: bx + CW - 49, y: by + CH / 2 - 10, size: 20, color: "#ffffff", stroke: 3 }).animate(keys("x", enter(bx + CW - 49)), keys("opacity", fade(1))),
			);
		}
		if (c.live) {
			// The live card breathes a ring in its colour.
			nodes.push(
				Layer.box({ id: id("live"), position: "absolute", x: bx - 5, y: by - 5, width: CW + 10, height: CH + 10, borderRadius: 24, borderColor: color, borderWidth: 3 } as never).animate(
					keys("x", enter(bx - 5)),
					keys("opacity", [[0, 0], [t + f(0.6), 0], [t + f(1.0), 0.9], [t + f(1.8), 0.35, "sine.inOut"], [m0 - f(0.4), 0.9, "sine.inOut"], [m0, 0]]),
				),
			);
		}
	});

	// Board headers.
	const headers = COLS.map((name, i) =>
		Layer.text(name, { id: id("col"), position: "absolute", x: COL_X(i) + 8, y: 470, width: CW, height: 44, fontFamily: SANS, fontWeight: 500, fontSize: 32, fill: C.slateInk } as never).animate(
			keys("opacity", [[0, 0], [f(0.35) + i * f(0.08), 0], [f(0.7) + i * f(0.08), 1], [morph, 1], [morph + f(0.3), 0]]),
		),
	);
	const headerCounts = COLS.map((_, i) =>
		Layer.text(String(CARDS.filter((c) => c.col === i).length), { id: id("cnt"), position: "absolute", x: COL_X(i) + CW - 40, y: 470, width: 32, height: 44, align: "end", fontFamily: SANS, fontWeight: 400, fontSize: 28, fill: C.pencil } as never).animate(
			keys("opacity", [[0, 0], [f(0.5) + i * f(0.08), 0], [f(0.85) + i * f(0.08), 1], [morph, 1], [morph + f(0.3), 0]]),
		),
	);

	// Gantt axis, grid, row labels and the now-line.
	const ganttIn = (d = 0): Key[] => [[0, 0], [morph + f(0.3) + d, 0], [morph + f(0.8) + d, 1, "power2.out"]];
	const axis: Node[] = [];
	for (let h = T0; h <= T1; h += 2) {
		const x = gx(h);
		const label = h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;
		axis.push(
			Layer.text(label, { id: id("ax"), position: "absolute", x: x - 60, y: 432, width: 120, height: 32, align: "center", fontFamily: SANS, fontWeight: 400, fontSize: 24, fill: C.pencil } as never).animate(keys("opacity", ganttIn((h - T0) * 0.6))),
			Layer.box({ id: id("grid"), position: "absolute", x: x - 1, y: 476, width: 2, height: ROWS.length * 108, background: "rgba(21,28,42,0.07)" } as never).animate(keys("opacity", ganttIn((h - T0) * 0.6))),
		);
	}
	ROWS.forEach((r, i) => {
		axis.push(
			Layer.shape("circle", { id: id("rdot"), position: "absolute", x: 140, y: ROW_Y(i) + BAR_H / 2 - 9, width: 18, height: 18, fill: CAT[r].light } as never).animate(keys("opacity", ganttIn(i * 2))),
			Layer.text(ROW_NAME[r], { id: id("rname"), position: "absolute", x: 172, y: ROW_Y(i) + BAR_H / 2 - 20, width: 200, height: 40, fontFamily: SANS, fontWeight: 500, fontSize: 28, fill: C.slateInk } as never).animate(keys("opacity", ganttIn(i * 2))),
		);
	});
	const nowX = gx(10, 40);
	const nowLine = [
		Layer.box({ id: "gantt-now", position: "absolute", x: nowX - 1.5, y: 476, width: 3, height: ROWS.length * 108, borderRadius: 2, background: C.signalLight } as never).animate(
			keys("height", [[0, 0], [morph + morphLen + f(0.3), 0], [morph + morphLen + f(0.9), ROWS.length * 108, "expo.out"]]),
			keys("opacity", [[0, 0], [morph + morphLen + f(0.3), 0], [morph + morphLen + f(0.35), 1]]),
		),
		Layer.box({ id: "gantt-now-pill", position: "absolute", x: nowX - 60, y: 476 + ROWS.length * 108 + 10, width: 120, height: 40, borderRadius: 20, background: C.signalLight, children: [
			Layer.text("10:40am", { id: "gantt-now-t", position: "absolute", x: 0, y: 0, width: 120, height: 40, align: "center", verticalAlign: "middle", fontFamily: SANS, fontWeight: 600, fontSize: 21, fill: "#ffffff" } as never),
		] } as never).animate(keys("opacity", [[0, 0], [morph + morphLen + f(0.3), 0], [morph + morphLen + f(0.5), 1]])),
	];

	// The view switch, top right: the thumb slides from Board to Gantt.
	const SW_X = 1440;
	const SW_Y = 176;
	const sw = [
		Layer.box({ id: "sw-track", position: "absolute", x: SW_X, y: SW_Y, width: 340, height: 68, borderRadius: 34, background: C.pressed } as never),
		Layer.box({ id: "sw-thumb", position: "absolute", x: SW_X + 4, y: SW_Y + 4, width: 166, height: 60, borderRadius: 30, background: "#ffffff" } as never).animate(keys("x", [[0, SW_X + 4], [morph - f(0.35), SW_X + 4], [morph + f(0.1), SW_X + 170, "expo.out"]])),
		icon("kanban", { x: SW_X + 26, y: SW_Y + 20, size: 28, color: C.nightInk }),
		Layer.text("Board", { id: "sw-b", position: "absolute", x: SW_X + 62, y: SW_Y, width: 100, height: 68, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 26, fill: C.nightInk } as never),
		icon("chart-gantt", { x: SW_X + 192, y: SW_Y + 20, size: 28, color: C.nightInk }),
		Layer.text("Gantt", { id: "sw-g", position: "absolute", x: SW_X + 228, y: SW_Y, width: 100, height: 68, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 26, fill: C.nightInk } as never),
	].map((n) => n.animate(keys("opacity", [[0, 0], [f(0.3), 0], [f(0.6), 1]])));

	// The Board and the Gantt, as one group that steps back when the month arrives.
	const m2 = f(MONTH_AT);
	const views = Layer.box({
		id: "board-views",
		position: "absolute",
		x: 0,
		y: 0,
		width: W,
		height: H,
		children: [...axis, ...headers, ...headerCounts, ...shadows, ...nodes, ...nowLine, ...sw],
	} as never).animate(
		keys("opacity", [[0, 1], [m2, 1], [m2 + f(0.4), 0, "power2.in"]]),
		keys("scale", [[0, 1], [m2, 1], [m2 + f(0.5), 0.94, "power2.in"]]),
	);

	return scene("board", C.fog, [
		Layer.box({ id: "board-bg", position: "absolute", x: 0, y: 0, width: W, height: H, background: "radial-gradient(circle at 50% 40%, #ffffff 0%, #f1f3f7 50%, #e3e7ee 100%)" } as never),
		glow({ x: 1500, y: 800, r: 560, color: CAT.focus.light, opacity: 0.08, drift: 30, seed: 51 }),
		views,
		...monthView(m2 + f(0.25)),
		...caption({ title: "Board and Gantt views.", sub: "Your timeline as cards in columns, or as bars across the day.", x: 130, y: 150, width: 1250, at: f(0.3), out: m2 - f(0.2), dark: false, size: 68, subSize: 34 }),
		...caption({ title: "A month of tiny dials.", sub: "Each day is a little dial, as full as that day is planned.", x: 130, y: 150, width: 1500, at: m2 + f(0.3), out: f(BOARD_SEC - 0.6), dark: false, size: 68, subSize: 34 }),
	]);
}

/** October, Monday first: each day a small ring in the colours of its blocks. */
function monthView(at: number): Node[] {
	const out: Node[] = [];
	const CELL_W = 150;
	const CELL_H = 112;
	const GX = (W - CELL_W * 7) / 2;
	const GY = 400;
	const R0 = 33;
	const STROKE = 9;
	const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	days.forEach((d, i) =>
		out.push(
			Layer.text(d, { id: id("wd"), position: "absolute", x: GX + i * CELL_W, y: GY - 58, width: CELL_W, height: 34, align: "center", fontFamily: SANS, fontWeight: 500, fontSize: 24, fill: C.pencil } as never).animate(keys("opacity", [[0, 0], [at, 0], [at + f(0.4), 1]])),
		),
	);
	const palette: Category[] = ["focus", "care", "routine", "people", "rest", "learn", "move"];
	let seed = 7;
	const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
	const arcPath = (cx: number, cy: number, a0: number, a1: number) => {
		const p = (a: number) => [cx + R0 * Math.sin((a * Math.PI) / 180), cy - R0 * Math.cos((a * Math.PI) / 180)];
		const [x0, y0] = p(a0);
		const [x1, y1] = p(a1);
		return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R0} ${R0} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
	};
	for (let i = 0; i < 35; i++) {
		const col = i % 7;
		const row = Math.floor(i / 7);
		const date = i < 3 ? 28 + i : i - 2; // Sep 28–30, then October; Nov 1 last.
		const inMonth = i >= 3 && i < 34;
		const label = i === 34 ? "1" : String(date);
		const cx = GX + col * CELL_W + CELL_W / 2;
		const cy = GY + row * CELL_H + CELL_H / 2 - 8;
		const today = inMonth && date === 21;
		const past = inMonth && date < 21;
		const t = at + Math.round((col + row) * f(0.05));
		const children: Node[] = [];
		if (today) children.push(Layer.box({ id: id("today"), position: "absolute", x: cx - 50, y: cy - 50, width: 100, height: 100, borderRadius: 26, background: C.nightInk } as never));
		// The track, then the day's blocks.
		children.push(Layer.shape("path", { id: id("track"), position: "absolute", x: 0, y: 0, width: W, height: H, d: `${arcPath(cx, cy, 0, 180)}${arcPath(cx, cy, 180, 359.9).replace("M", "L")}`, fillType: "none", strokeColor: today ? "rgba(255,255,255,0.14)" : "rgba(21,28,42,0.08)", strokeWidth: STROKE } as never));
		const weekend = col >= 5;
		const n = !inMonth ? 1 : weekend ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
		let a = 20 + rnd() * 40;
		const fill = inMonth ? (weekend ? 0.25 + rnd() * 0.2 : 0.45 + rnd() * 0.35) : 0.3;
		const each = (fill * 360) / n;
		const done = past && rnd() < 0.55;
		for (let k = 0; k < n; k++) {
			const len = each * (0.6 + rnd() * 0.5);
			const cat = palette[Math.floor(rnd() * palette.length)];
			const color = today ? CAT[cat].dark : CAT[cat].light;
			children.push(
				Layer.shape("path", { id: id("darc"), position: "absolute", x: 0, y: 0, width: W, height: H, d: arcPath(cx, cy, a, a + len), fillType: "none", strokeColor: color, strokeWidth: STROKE, strokeLineCap: "round", opacity: inMonth ? 1 : 0.35 } as never).animate(
					keys("trimEnd", [[0, 0], [t, 0], [t + f(0.6), 1, "power2.out"]]),
				),
			);
			a += len + 12 + rnd() * 18;
		}
		if (done) {
			// A day with everything done glows softly in lume.
			children.unshift(Layer.shape("circle", { id: id("glow"), position: "absolute", x: cx - R0 - 14, y: cy - R0 - 14, width: 2 * R0 + 28, height: 2 * R0 + 28, fill: `radial-gradient(circle, ${Color.alpha(C.lumeLight, 0)} 52%, ${Color.alpha(C.lumeLight, 0.35)} 62%, ${Color.alpha(C.lumeLight, 0)} 76%)` } as never));
		}
		children.push(
			Layer.text(label, { id: id("dnum"), position: "absolute", x: cx - 40, y: cy - 16, width: 80, height: 32, align: "center", verticalAlign: "middle", fontFamily: SANS, fontWeight: today ? 600 : 400, fontSize: 24, fill: today ? C.signal : inMonth ? C.nightInk : C.pencil } as never),
		);
		out.push(
			Layer.box({ id: id("day"), position: "absolute", x: 0, y: 0, width: W, height: H, children } as never).animate(
				keys("opacity", [[0, 0], [t, 0], [t + f(0.3), inMonth ? 1 : 0.55]]),
			),
		);
	}
	return out;
}

export const boardCues = () => [
	...CARDS.map((_, i) => ({ at: 0.55 + i * 0.09, sfx: "tick" as const, gain: 0.35 })),
	{ at: 2.85, sfx: "whoosh-soft" as const, gain: 0.6 },
	{ at: MONTH_AT - 0.1, sfx: "whoosh-soft" as const, gain: 0.5 },
	{ at: 4.4, sfx: "pluck" as const, gain: 0.4 },
];
