/**
 * 03 The app, in space. Real screenshots float on panels at different depths; the camera
 * glides from one to the next while a light crosses each one, and small pieces of the app
 * drift past in front for parallax. Four beats: the planner, the widget, focus, themes.
 */
import { CameraAnimation, Layer, Layer3D } from "framefields";
import { CAM_1TO1, caption, dust, full, glow, id, keys, type Node, roundRect, scene, soft, sweep } from "../lib/kit.js";
import { C, CAT, f, H, media } from "../theme.js";

export const PANELS_SEC = 12.6;
export const BEAT = 3.05;
const FIRST = 0.35;

interface Shot {
	src: string;
	/** Source image size, and the crop inside it (px). */
	img: [number, number];
	crop?: [number, number, number, number];
	/** Width on screen at 1:1 (px). */
	w: number;
	radius: number;
	/** Where it floats in the world, and how it turns. */
	x: number;
	y: number;
	z: number;
	ry: number;
	rx?: number;
}

const SHOTS: Shot[] = [
	{ src: media("hero-light.png"), img: [1600, 1105], crop: [72, 72, 1456, 960], w: 1120, radius: 26, x: 1400, y: 560, z: 0, ry: -16 },
	{ src: media("desktop-widget.png"), img: [1600, 1000], w: 1120, radius: 26, x: 3500, y: 470, z: 260, ry: 14, rx: -4 },
	{ src: media("focus.png"), img: [1600, 1000], w: 1120, radius: 26, x: 5600, y: 590, z: -120, ry: -12, rx: 3 },
	{ src: media("themes.png"), img: [1600, 800], w: 1160, radius: 26, x: 7700, y: 520, z: 160, ry: 13 },
];

const COPY: [string, string][] = [
	["Your day\nat a glance.", "The dial and your timeline,\nside by side."],
	["Lives on\nyour desktop.", "A small widget shows\nwhat's now and what's next."],
	["Focus,\ngently.", "Focus sessions, and soft cues\nat the edge of your screen."],
	["Make it\nyours.", "Ten themes and nine\ndial finishes."],
];

/** Panel size for a shot. */
function size(s: Shot): [number, number] {
	const [cw, ch] = s.crop ? [s.crop[2], s.crop[3]] : s.img;
	return [s.w, Math.round((s.w * ch) / cw)];
}

/** 3D layers draw over the 2D pass: they fade in after the transition in, and out before the one out. */
const inOut = () => keys("opacity", [[0, 0], [f(0.45), 0], [f(0.9), 1, "power2.out"], [f(PANELS_SEC - 0.95), 1], [f(PANELS_SEC - 0.5), 0, "power2.in"]]);

function panel(s: Shot, i: number, lightAt: number): Node[] {
	const [w, h] = size(s);
	const k = s.w / (s.crop ? s.crop[2] : s.img[0]);
	const ox = s.crop ? -s.crop[0] * k : 0;
	const oy = s.crop ? -s.crop[1] * k : 0;
	const shadowPad = 120;
	return [
		// Its soft shadow, a little behind and below.
		Layer3D.plane({
			id: `panel-shadow-${i}`,
			width: w + shadowPad * 2,
			height: h + shadowPad * 2,
			x: s.x - w / 2 - shadowPad,
			y: s.y - h / 2 - shadowPad + 46,
			z: s.z + 70,
			rotateY: s.ry,
			rotateX: s.rx ?? 0,
			background: "transparent",
			material: "unlit",
			children: [soft({ d: roundRect(0, 0, w * 0.94, h * 0.94, s.radius), x: shadowPad + w * 0.03, y: shadowPad + h * 0.03, w: w * 0.94, h: h * 0.94, fill: "#000000", blur: 38, opacity: 0.55, pad: 0 })],
		} as never).animate(inOut()),
		Layer3D.plane({
			id: `panel-${i}`,
			width: w,
			height: h,
			x: s.x - w / 2,
			y: s.y - h / 2,
			z: s.z,
			rotateY: s.ry,
			rotateX: s.rx ?? 0,
			borderRadius: s.radius,
			background: "#0d121c",
			material: "unlit",
			children: [
				Layer.image(s.src, { id: id("shot"), position: "absolute", x: ox, y: oy, width: s.img[0] * k, height: s.img[1] * k, fit: "fill" } as never),
				// A hairline rim so it reads as glass and metal, not paper.
				Layer.box({ id: id("rim"), position: "absolute", x: 0, y: 0, width: w, height: h, borderRadius: s.radius, borderColor: "rgba(255,255,255,0.16)", borderWidth: 1.5 } as never),
				sweep({ w, h, at: lightAt, len: f(1.25), strength: 0.2 }),
			],
		} as never).animate(inOut()),
	];
}

/** A small piece of the app drifting in front of a panel. */
function chip(o: { src: string; img: [number, number]; w: number; x: number; y: number; z: number; ry: number; radius: number; at: number }): Node {
	const h = Math.round((o.w * o.img[1]) / o.img[0]);
	return Layer3D.plane({
		id: id("chip"),
		width: o.w,
		height: h,
		x: o.x - o.w / 2,
		y: o.y - h / 2,
		z: o.z,
		rotateY: o.ry,
		borderRadius: o.radius,
		background: "#ffffff",
		material: "unlit",
		children: [Layer.image(o.src, { id: id("chip-img"), position: "absolute", x: 0, y: 0, width: o.w, height: h, fit: "fill" } as never)],
	} as never).animate(
		keys("opacity", [[0, 0], [o.at, 0], [o.at + f(0.5), 1, "power2.out"], [f(PANELS_SEC - 0.95), 1], [f(PANELS_SEC - 0.5), 0, "power2.in"]]),
		keys("y", [[0, o.y - h / 2 + 90], [o.at, o.y - h / 2 + 90], [o.at + f(1.2), o.y - h / 2, "expo.out"], [o.at + f(4), o.y - h / 2 - 30, "sine.inOut"]]),
	);
}

export function panelsScene(): Node {
	const beats = SHOTS.map((_, i) => f(FIRST + i * BEAT));
	const travel = f(0.95);
	// Camera: hold on each panel (aimed so it sits right of centre), then glide to the next.
	const offset = 340;
	const tx: [number, number, string?][] = [[0, SHOTS[0].x - offset - 260]];
	const az: [number, number, string?][] = [[0, -16]];
	const el: [number, number, string?][] = [[0, 6]];
	const rad: [number, number, string?][] = [[0, CAM_1TO1 * 1.25]];
	const ty: [number, number, string?][] = [[0, SHOTS[0].y]];
	SHOTS.forEach((s, i) => {
		const at = beats[i];
		const end = i + 1 < SHOTS.length ? beats[i + 1] - travel : f(PANELS_SEC);
		const swing = i % 2 === 0 ? -1 : 1;
		tx.push([at + (i === 0 ? f(0.6) : 0), s.x - offset, "power3.inOut"], [end, s.x - offset + 40, "sine.inOut"]);
		ty.push([at + (i === 0 ? f(0.6) : 0), s.y, "power3.inOut"], [end, s.y - 10, "sine.inOut"]);
		az.push([at + (i === 0 ? f(0.6) : 0), swing * 7, "power3.inOut"], [end, swing * 3, "sine.inOut"]);
		el.push([at + (i === 0 ? f(0.6) : 0), 3, "power3.inOut"], [end, 1, "sine.inOut"]);
		rad.push([at + (i === 0 ? f(0.6) : 0), CAM_1TO1 * 1.08, "power3.inOut"], [end, CAM_1TO1 * 1.0, "sine.inOut"]);
	});
	const cam = CameraAnimation.camera()
		.keys("targetX", tx as never)
		.keys("targetY", ty as never)
		.keys("orbitAzimuth", az as never)
		.keys("orbitElevation", el as never)
		.keys("orbitRadius", rad as never);

	const world = full({
		id: "panels-world",
		transformStyle: "preserve-3d",
		children: [
			...SHOTS.flatMap((s, i) => panel(s, i, beats[i] + f(i === 0 ? 0.9 : 0.5))),
			chip({ src: media("quick-add.png"), img: [790, 272], w: 520, x: SHOTS[0].x - 420, y: SHOTS[0].y + 360, z: -260, ry: -10, radius: 18, at: beats[0] + f(0.9) }),
			chip({ src: media("hover.png"), img: [900, 900], w: 260, x: SHOTS[2].x + 170, y: SHOTS[2].y - 330, z: -300, ry: -8, radius: 150, at: beats[2] + f(0.4) }),
		],
	});

	const captions = COPY.flatMap(([title, sub], i) =>
		caption({
			title,
			sub,
			x: 110,
			y: 340,
			width: 900,
			at: beats[i] + f(i === 0 ? 0.6 : 0.25),
			out: i + 1 < COPY.length ? beats[i + 1] - f(0.45) : f(PANELS_SEC - 0.55),
			size: 72,
			subSize: 36,
		}),
	);

	return scene("panels", C.ground, [
		full({ id: "panels-bg", background: "radial-gradient(circle at 62% 50%, #1a2440 0%, #0f1524 48%, #080b12 100%)" }),
		glow({ x: 1300, y: 420, r: 700, color: CAT.focus.dark, opacity: 0.14, drift: 80, seed: 11 }),
		glow({ x: 1650, y: 900, r: 520, color: CAT.rest.dark, opacity: 0.1, drift: 60, seed: 12 }),
		dust({ seed: 9, opacity: 0.2 }),
		Layer.camera({ id: "panels-cam", targetX: SHOTS[0].x, targetY: H / 2, targetZ: 0, animation: cam } as never),
		world,
		// A soft scrim behind the words, so they read over any panel edge.
		Layer.box({ id: "panels-scrim", position: "absolute", x: 0, y: 0, width: 900, height: H, background: "linear-gradient(90deg, rgba(8,11,18,0.75) 0%, rgba(8,11,18,0.45) 55%, rgba(8,11,18,0) 100%)" } as never),
		...captions,
	]);
}

export const panelsCues = () => [0, 1, 2, 3].map((i) => ({ at: FIRST + i * BEAT - (i === 0 ? -0.2 : 0.95), sfx: "whoosh-soft" as const, gain: 0.8 }));

