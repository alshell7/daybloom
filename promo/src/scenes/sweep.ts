/**
 * 02 Plan by sweeping. On a light dial a pointer presses on the free bezel and drags round:
 * a dashed ghost follows, snapping every five minutes while a dark pill counts the length.
 * Let go and the block blooms into colour with its icon.
 */
import { Color, Layer } from "framefields";
import { at12, dial, flat, Geo, R, SAMPLE_DAY } from "../lib/dial.js";
import { caption, glow, icon, type Key, keys, merge, type Node, pill, scene } from "../lib/kit.js";
import { C, CAT, f, GLACIER_FINISH, H } from "../theme.js";

export const SWEEP_SEC = 7.0;

const S = 900;
const X0 = 170;
const Y0 = (H - S) / 2;

/** A pointer arrow, tip at (0, 0). */
const ARROW = "M0 0L0 34L9 26L15 40L21 37L15 24L27 24Z";

export function sweepScene(): Node {
	const g = new Geo(S);
	const F = GLACIER_FINISH;
	// The day, without the walk that is about to be planned.
	const parts = dial({ size: S, finish: F, arcs: SAMPLE_DAY, readout: { time: "10:42am", big: "38m", title: "Draft the proposal", sub: "then Lunch & water", progress: 0.4 } });

	// ── The sweep: from 4:00 to 4:45, in 5-minute detents ──
	const a0 = at12(16, 0);
	const press = f(1.2);
	const step = f(0.21);
	const detents = 9; // 45 minutes
	const release = press + f(0.35) + detents * step + f(0.25);
	const ghostD = (a1: number) => g.block(a0, a1);
	const ghostKeys: Key[] = [[0, ghostD(a0 + 0.6)], [press + f(0.3), ghostD(a0 + 0.6)]];
	const cursorX: Key[] = [];
	const cursorY: Key[] = [];
	const pillText: Key[] = [[0, "5m"]];
	const pillX: Key[] = [];
	const pillY: Key[] = [];
	const pos = (a: number) => g.p(450, a);
	const [sx, sy] = pos(a0);
	cursorX.push([0, sx + 260], [f(0.2), sx + 260], [press, sx, "power3.inOut"]);
	cursorY.push([0, sy + 180], [f(0.2), sy + 180], [press, sy, "power3.inOut"]);
	for (let i = 1; i <= detents; i++) {
		const t = press + f(0.3) + i * step;
		const a = a0 + i * 2.5;
		ghostKeys.push([t - Math.round(step * 0.45), ghostD(a - 2.5)], [t, ghostD(a), "back.out(2)"]);
		const [cx, cy] = pos(a + 0.6);
		cursorX.push([t, cx, "sine.inOut"]);
		cursorY.push([t, cy, "sine.inOut"]);
		pillText.push([t, `${i * 5}m`, "hold"]);
		const [px, py] = g.p(560, a + 1);
		pillX.push([t, px - 64, "sine.inOut"]);
		pillY.push([t, py - 30, "sine.inOut"]);
	}
	const a1 = a0 + detents * 2.5;
	const [ex, ey] = pos(a1 + 0.6);
	cursorX.push([release + f(0.6), ex + 120, "power2.inOut"]);
	cursorY.push([release + f(0.6), ey + 90, "power2.inOut"]);

	const ghost = Layer.shape("path", {
		id: "sweep-ghost",
		position: "absolute",
		x: 0,
		y: 0,
		width: S,
		height: S,
		d: ghostKeys[0][1],
		fill: Color.alpha(C.nightInk, 0.16),
		strokeColor: Color.alpha(C.nightInk, 0.55),
		strokeWidth: 3,
		strokeDashArray: [9, 8],
	} as never).animate(keys("d", ghostKeys), keys("opacity", [[0, 0], [press, 0], [press + f(0.15), 1], [release, 1], [release + f(0.25), 0]]));

	// ── Let go: the block blooms in Move orange ──
	const color = CAT.move.light;
	const over = g.block(a0, a1, R.bezelIn - 6, R.bezelOut + 22);
	const block = Layer.shape("path", { id: "sweep-block", position: "absolute", x: 0, y: 0, width: S, height: S, d: ghostD(a1), fill: color } as never).animate(
		keys("d", [[0, ghostD(a1)], [release, ghostD(a1)], [release + f(0.22), over, "power2.out"], [release + f(0.75), ghostD(a1), "back.out(1.6)"]]),
		keys("opacity", [[0, 0], [release, 0], [release + f(0.08), 1]]),
	);
	const [ix, iy] = g.p(425, (a0 + a1) / 2);
	const isz = 40 * g.k;
	const ic = icon("footprints", { x: ix - isz / 2, y: iy - isz / 2, size: isz, color: "#ffffff", stroke: 2.1 }).animate(
		merge(keys("scale", [[0, 0.2], [release + f(0.2), 0.2], [release + f(0.6), 1, "back.out(2.4)"]]), keys("opacity", [[0, 0], [release + f(0.2), 0], [release + f(0.3), 1]])),
	);
	// A ring of light rushing out of the new block.
	const ring = Layer.shape("path", { id: "sweep-ring", position: "absolute", x: 0, y: 0, width: S, height: S, d: g.block(a0, a1, R.bezelIn, R.bezelOut), fill: Color.alpha(color, 0.35) } as never).animate(
		keys("d", [[0, g.block(a0, a1, R.bezelIn, R.bezelOut)], [release, g.block(a0, a1, R.bezelIn, R.bezelOut)], [release + f(0.8), g.block(a0 - 3, a1 + 3, R.bezelOut + 4, R.bezelOut + 60), "expo.out"]]),
		keys("opacity", [[0, 0], [release, 0], [release + f(0.06), 1], [release + f(0.8), 0, "power2.in"]]),
	);

	// The pill that counts the length, and a label once it lands.
	const durPill = pill({ text: "5m", x: 0, y: 0, size: 26, bg: C.nightInk, color: C.paper, width: 128, h: 56, align: "center", textKeys: pillText }).animate(
		keys("x", pillX.length ? [[0, pillX[0][1]], ...pillX] : [[0, 0]]),
		keys("y", pillY.length ? [[0, pillY[0][1]], ...pillY] : [[0, 0]]),
		keys("opacity", [[0, 0], [press + f(0.3), 0], [press + f(0.45), 1], [release + f(0.1), 1], [release + f(0.35), 0]]),
	);
	const cursor = Layer.shape("path", {
		id: "sweep-cursor",
		position: "absolute",
		x: 0,
		y: 0,
		width: 32,
		height: 44,
		d: ARROW,
		fill: C.nightInk,
		strokeColor: "#ffffff",
		strokeWidth: 2.5,
		strokeLineJoin: "round",
	} as never).animate(
		keys("x", cursorX),
		keys("y", cursorY),
		keys("opacity", [[0, 0], [f(0.2), 0], [f(0.5), 1], [release + f(0.5), 1], [release + f(0.9), 0]]),
		keys("scale", [[0, 1], [press - f(0.06), 1], [press, 0.86, "power2.out"], [release, 0.86], [release + f(0.12), 1, "back.out(2)"]]),
	);

	const dialBox = Layer.box({
		id: "sweep-dial",
		position: "absolute",
		x: X0,
		y: Y0,
		width: S,
		height: S,
		overflow: "visible",
		// The pointer and the length pill ride with the dial, so they stay on the ghost as it moves.
		children: [...parts.aura, ...parts.bezel, ring, ...parts.arcs.flat(), ghost, block, ic, ...parts.face, ...parts.readout, ...parts.hand, durPill, cursor],
	} as never).animate(
		// A slow push, for life.
		keys("scale", [[0, 1.07], [f(SWEEP_SEC), 0.99, "sine.inOut"]]),
		keys("x", [[0, X0 - 20], [f(SWEEP_SEC), X0 + 30, "sine.inOut"]]),
	);

	return scene("sweep", C.fog, [
		Layer.box({ id: "sweep-bg", position: "absolute", x: 0, y: 0, width: 1920, height: H, background: "radial-gradient(circle at 30% 50%, #ffffff 0%, #f1f3f7 40%, #e4e8ee 100%)" } as never),
		glow({ x: X0 + S / 2 + 220, y: Y0 + S / 2 + 160, r: 520, color: CAT.move.light, opacity: 0.12, drift: 30, seed: 4 }),
		// The dial's case shadow on the desk.
		Layer.shape("circle", { id: "sweep-shadow", position: "absolute", x: X0 + 20, y: Y0 + 46, width: S - 40, height: S - 40, fill: "radial-gradient(circle, rgba(21,28,42,0.20) 0%, rgba(21,28,42,0.10) 55%, rgba(21,28,42,0) 72%)" } as never),
		dialBox,
		...caption({
			title: "Plan by sweeping\nthe dial.",
			sub: "Press, drag and let go.\nYour block blooms into place.",
			x: 1180,
			y: 330,
			width: 700,
			at: f(0.5),
			out: f(SWEEP_SEC - 0.6),
			dark: false,
			size: 80,
			subSize: 38,
		}),
	]);
}

export const sweepCues = (): { at: number; sfx: "tick" | "pluck" | "whoosh-soft" }[] => {
	const press = 1.2;
	const out: { at: number; sfx: "tick" | "pluck" | "whoosh-soft" }[] = [];
	for (let i = 1; i <= 9; i++) out.push({ at: press + 0.3 + i * 0.21, sfx: "tick" });
	out.push({ at: press + 0.35 + 9 * 0.21 + 0.25, sfx: "pluck" });
	return out;
};
