/**
 * 01 Open + "Time you can see". A dial assembles itself in space: the case rises out of the
 * dark, the bezel, the face and the numerals fly in on their own planes while the camera
 * swings round to face it, and the day's blocks bloom onto the bezel like petals. The hand
 * sweeps to now, the current block's aura glows and a light crosses the glass. Then the
 * camera drifts aside and the first line arrives.
 */
import { CameraAnimation, Layer, Layer3D, Lighting } from "framefields";
import { dial, glint, SAMPLE_DAY } from "../lib/dial.js";
import { CAM_1TO1, caption, dust, full, glow, id, keys, type Node, scene } from "../lib/kit.js";
import { C, CAT, f, H, INK_FINISH, W } from "../theme.js";

export const OPEN_SEC = 11.1;

const S = 860;
/** Planes are larger than the dial so the aura and the hand's arrow have room. */
const P = Math.round(S * 1.3);
const OFF = (P - S) / 2;
const CX = W / 2;
const CY = H / 2;

/** 3D layers draw over the 2D pass, so they leave before the next scene's transition. */
const outro = () => keys("opacity", [[f(OPEN_SEC - 1.0), 1], [f(OPEN_SEC - 0.5), 0, "power2.in"]]);

/** One flat layer of the dial in space, centred on the dial. */
function plane(name: string, children: Node[], z: number, anim: Node[] = []): Node {
	const p = Layer3D.plane({
		id: `open-${name}`,
		width: P,
		height: P,
		x: CX - P / 2,
		y: CY - P / 2,
		z,
		background: "transparent",
		material: "unlit",
		children: [Layer.box({ id: id(`open-${name}-in`), position: "absolute", x: OFF, y: OFF, width: S, height: S, overflow: "visible", children } as never)],
	} as never);
	return p.animate(...anim, outro());
}

/** Fly in along z (and turn), fading up. */
function flyIn(at: number, len: number, from: { z: number; z1?: number; rx?: number; ry?: number; rz?: number }) {
	const end = at + len;
	const a: Node[] = [
		keys("z", [[0, from.z], [at, from.z], [end, from.z1 ?? 0, "expo.out"]]),
		keys("opacity", [[0, 0], [at, 0], [at + Math.round(len * 0.35), 1, "power1.out"]]),
	];
	if (from.rx) a.push(keys("rotateX", [[0, from.rx], [at, from.rx], [end, 0, "expo.out"]]));
	if (from.ry) a.push(keys("rotateY", [[0, from.ry], [at, from.ry], [end, 0, "expo.out"]]));
	if (from.rz) a.push(keys("rotateZ", [[0, from.rz], [at, from.rz], [end, 0, "expo.out"]]));
	return a;
}

export function openScene(): Node {
	const parts = dial({
		size: S,
		finish: INK_FINISH,
		arcs: SAMPLE_DAY,
		// At 10 s a minute ticks by.
		readout: { time: "10:40am", big: "40m", title: "Draft the proposal", sub: "then Lunch & water", progress: 0.42, bigKeys: [[0, "40m"], [f(9.4), "39m"]] },
		bloom: { flower: f(2.35), at: f(3.35), stagger: f(0.13), len: f(0.95) },
	});

	// ── Camera: a low three-quarter swing in, then a drift aside for the title ──
	const settle = f(5.6);
	const cam = CameraAnimation.camera()
		.keys("orbitAzimuth", [[0, -58], [settle, 0, "power2.inOut"], [f(6.6), 0], [f(8.2), 14, "power2.inOut"], [f(OPEN_SEC), 19, "sine.out"]] as never)
		.keys("orbitElevation", [[0, 34], [settle, 0, "power2.inOut"], [f(6.6), 0], [f(8.2), 5, "power2.inOut"], [f(OPEN_SEC), 6, "sine.out"]] as never)
		.keys("orbitRadius", [[0, 2600], [settle, CAM_1TO1, "power3.inOut"], [f(6.6), CAM_1TO1], [f(8.2), CAM_1TO1 * 1.12, "power2.inOut"], [f(OPEN_SEC), CAM_1TO1 * 1.06, "sine.inOut"]] as never)
		.keys("targetX", [[0, CX], [f(6.6), CX], [f(8.2), CX + 430, "power2.inOut"], [f(OPEN_SEC), CX + 445, "sine.out"]] as never);

	// ── The hand sweeps round to now and lands with a little overshoot ──
	const handSpin = keys("rotateZ", [[0, -250], [f(4.1), -250], [f(5.3), 0, "back.out(1.25)"]]);
	const handFade = keys("opacity", [[0, 0], [f(4.1), 0], [f(4.35), 1]]);

	// ── Readout: rises in once the hand lands; at 10 s a minute ticks by ──
	const readFade = [
		keys("opacity", [[0, 0], [f(4.8), 0], [f(5.5), 1, "power2.out"]]),
		keys("scale", [[0, 0.92], [f(4.8), 0.92], [f(5.6), 1, "expo.out"]]),
	];

	// A light crossing the face, like a watch crystal catching it.
	const shine = glint(S, { at: f(5.8), len: f(1.5), strength: 0.36 });

	const auraIn = keys("opacity", [[0, 0], [f(5.0), 0], [f(6.0), 1, "power2.out"]]);

	const world = full({
		id: "open-world",
		transformStyle: "preserve-3d",
		children: [
			// The case: a satin-metal puck the dial sits in.
			Layer3D.cylinder({
				id: "open-case",
				radius: (497 / 1000) * S,
				height: 46,
				segments: 160,
				x: CX,
				y: CY,
				z: 26,
				rotateX: 90,
				color: INK_FINISH.rim,
				metallic: 0.7,
				roughness: 0.26,
			}).animate(
				keys("z", [[0, 900], [f(0.2), 900], [f(1.9), 26, "expo.out"]]),
				keys("opacity", [[0, 0], [f(0.2), 0], [f(0.8), 1]]),
				outro(),
			),
			plane("aura", parts.aura, 1, [auraIn]),
			plane("bezel", parts.bezel, 0, flyIn(f(0.55), f(1.6), { z: 640, rz: -70 })),
			...parts.arcs.map((a, i) => plane(`arc${i}`, a, -3 - i * 0.2, flyIn(f(2.35), f(1.0) + i * f(0.13), { z: -60 - i * 22, z1: -3 - i * 0.2 }))),
			plane("face", parts.face.slice(0, 4), -1, flyIn(f(1.0), f(1.6), { z: -460, z1: -1, rx: 38 })),
			plane("numerals", parts.face.slice(4), -2, flyIn(f(1.45), f(1.5), { z: -280, z1: -2, rz: 28 })),
			plane("readout", parts.readout, -5, readFade),
			plane("hand", parts.hand, -8, [handSpin, handFade]),
			plane("glass", shine, -10),
		],
	});

	return scene("open", C.ground, [
		full({ id: "open-bg", background: "radial-gradient(circle at 50% 46%, #1a2540 0%, #0f1524 42%, #090d16 100%)" }),
		glow({ x: CX - 120, y: CY - 60, r: 760, color: CAT.focus.dark, opacity: 0.16, drift: 60, seed: 3 }),
		glow({ x: CX + 520, y: CY + 260, r: 620, color: CAT.people.dark, opacity: 0.09, drift: 50, seed: 9 }),
		dust({ seed: 5, opacity: 0.22 }),
		Layer.camera({ id: "open-cam", targetX: CX, targetY: CY, targetZ: 0, animation: cam } as never),
		...(Lighting.studio({ target: [CX, CY, 0], exposure: 0.15, intensity: 1.1 } as never) as Node[]),
		world,
		...caption({
			title: "Time you can see.",
			sub: "Your day, drawn as arcs on a dial.",
			x: 1060,
			y: CY - 110,
			width: 800,
			at: f(7.4),
			out: f(OPEN_SEC - 0.6),
			size: 86,
			subSize: 40,
		}),
	]);
}

export const openCues = () => [
	{ at: 0.3, sfx: "whoosh-soft" as const, gain: 0.55 },
	{ at: 1.0, sfx: "whoosh-soft" as const, gain: 0.45 },
	{ at: 2.35, sfx: "chime" as const, gain: 0.35 },
	...Array.from({ length: 8 }, (_, i) => ({ at: 3.35 + i * 0.13 + 0.68, sfx: "tick" as const, gain: 0.4 })),
	{ at: 5.25, sfx: "pluck" as const, gain: 0.55 },
	{ at: 6.6, sfx: "whoosh-soft" as const, gain: 0.4 },
	{ at: 9.4, sfx: "tick" as const, gain: 0.35 },
];
