/**
 * 10 The end card. The day's arcs bloom into a wide ring of light, the app icon turns in out
 * of space as a solid tile and settles, a light crosses it, and the name, the line and where
 * to get it rise in underneath.
 */
import { CameraAnimation, Color, Layer, Layer3D, Lighting } from "framefields";
import { dial, SAMPLE_DAY } from "../lib/dial.js";
import { CAM_1TO1, dust, full, glow, icon, keys, line, merge, type Node, scene, sweep, textWidth } from "../lib/kit.js";
import { C, CAT, f, H, ICON_PNG, INK_FINISH, SANS, W } from "../theme.js";

export const END_SEC = 8.2;

const CX = W / 2;
const IY = 345;
const TILE = 360;

export function endScene(): Node {
	// The day's arcs bloom out from behind the icon into a ring round it, like a bezel.
	const RS = 660;
	const ring = dial({ size: RS, finish: INK_FINISH, arcs: SAMPLE_DAY, bloom: { flower: f(1.0), at: f(1.5), stagger: f(0.09), len: f(1.0) } });
	const halo = Layer.box({
		id: "end-halo",
		position: "absolute",
		x: CX - RS / 2,
		y: IY - RS / 2,
		width: RS,
		height: RS,
		overflow: "visible",
		children: ring.arcs.flat(),
	} as never).animate(keys("rotation", [[0, -20], [f(END_SEC), 12, "sine.out"]]));

	// The icon: the artwork on the front of a solid rounded tile, turning in.
	const k = TILE / 824;
	const front = Layer3D.plane({
		id: "end-icon",
		width: TILE,
		height: TILE,
		x: 0,
		y: 0,
		z: -24,
		borderRadius: 185 * k,
		background: "transparent",
		material: "unlit",
		children: [
			Layer.image(ICON_PNG, { id: "end-icon-img", position: "absolute", x: -100 * k, y: -100 * k, width: 1024 * k, height: 1024 * k, fit: "fill" } as never),
			sweep({ w: TILE, h: TILE, at: f(2.2), len: f(1.2), strength: 0.28 }),
		],
	} as never);
	const body = Layer3D.roundedBox({
		id: "end-tile",
		width: TILE * 0.985,
		height: TILE * 0.985,
		depth: 46,
		radius: 185 * k,
		segments: 10,
		color: "#1c2640",
		roughness: 0.3,
		metallic: 0.25,
	});
	const turn = [
		keys("rotateY", [[0, -62], [f(0.5), -62], [f(2.0), 0, "back.out(1.15)"], [f(4.5), 7, "sine.inOut"], [f(END_SEC), -4, "sine.inOut"]]),
		keys("rotateX", [[0, 24], [f(0.5), 24], [f(2.0), 0, "back.out(1.2)"], [f(5.5), -4, "sine.inOut"], [f(END_SEC), 2, "sine.inOut"]]),
		keys("z", [[0, 900], [f(0.5), 900], [f(2.0), 0, "expo.out"]]),
		keys("opacity", [[0, 0], [f(0.5), 0], [f(0.9), 1]]),
	];
	// Inside a 3D group, children sit relative to the group's centre.
	const iconGroup = Layer.box({
		id: "end-icon-group",
		position: "absolute",
		x: CX,
		y: IY,
		z: 0,
		width: TILE,
		height: TILE,
		is3D: true,
		transformStyle: "preserve-3d",
		background: "transparent",
		children: [body, front],
	} as never).animate(...turn);

	// Words.
	const title = line({ text: "Daybloom", x: 0, y: 668, width: W, size: 116, color: C.ink, weight: 500, align: "center", at: f(1.7), sweep: f(0.9), letterSpacing: -3 });
	const tag = line({ text: "See your day. Feel the time.", x: 0, y: 820, width: W, size: 40, color: C.ink2, weight: 300, align: "center", at: f(2.3), unit: "word", letterSpacing: 0 });
	const free = line({ text: "Free for macOS and Windows", x: 0, y: 886, width: W, size: 34, color: C.ink, weight: 500, align: "center", at: f(2.8), unit: "word", letterSpacing: 0 });
	const url = "github.com/alshell7/daybloom";
	const uw = Math.ceil(textWidth(url, 30, 500)) + 110;
	const urlPill = Layer.box({
		id: "end-url",
		position: "absolute",
		x: CX - uw / 2,
		y: 950,
		width: uw,
		height: 68,
		borderRadius: 34,
		background: Color.alpha("#ffffff", 0.08),
		borderColor: C.lineStrong,
		borderWidth: 1.5,
		children: [
			icon("globe", { x: 26, y: 19, size: 30, color: C.lume, stroke: 2 }),
			Layer.text(url, { id: "end-url-t", position: "absolute", x: 70, y: 0, width: uw - 80, height: 68, verticalAlign: "middle", fontFamily: SANS, fontWeight: 500, fontSize: 30, fill: C.ink } as never),
		],
	} as never).animate(
		merge(
			keys("opacity", [[0, 0], [f(3.3), 0], [f(3.7), 1, "power2.out"]]),
			keys("y", [[0, 980], [f(3.3), 980], [f(4.0), 950, "expo.out"]]),
		),
	);

	return scene("end", C.ground, [
		Layer.box({ id: "end-bg", position: "absolute", x: 0, y: 0, width: W, height: H, background: "radial-gradient(circle at 50% 36%, #1c2744 0%, #0f1524 46%, #070a11 100%)" } as never),
		glow({ x: CX, y: IY, r: 620, color: CAT.focus.dark, opacity: 0.2, drift: 30, seed: 81 }),
		glow({ x: CX + 420, y: IY + 260, r: 460, color: CAT.care.dark, opacity: 0.08, drift: 40, seed: 82 }),
		glow({ x: CX - 420, y: IY + 220, r: 460, color: CAT.routine.dark, opacity: 0.07, drift: 40, seed: 83 }),
		dust({ seed: 29, opacity: 0.24 }),
		halo,
		Layer.camera({ id: "end-cam", targetX: CX, targetY: H / 2, targetZ: 0, animation: CameraAnimation.camera().keys("orbitAzimuth", [[0, 0], [f(END_SEC), 0]] as never).keys("orbitElevation", [[0, 0], [f(END_SEC), 0]] as never).keys("orbitRadius", [[0, CAM_1TO1], [f(END_SEC), CAM_1TO1]] as never) } as never),
		...(Lighting.studio({ target: [CX, IY, 0], exposure: 0.2, bloom: true } as never) as Node[]),
		iconGroup,
		title,
		tag,
		free,
		urlPill,
		// Fade to the night at the very end.
		full({ id: "end-fade", background: "#05070b" }).animate(keys("opacity", [[0, 0], [f(END_SEC - 0.9), 0], [f(END_SEC), 1, "power1.in"]])),
	]);
}

export const endCues = () => [
	{ at: 0.2, sfx: "swell" as const, gain: 0.7 },
	{ at: 1.9, sfx: "chime" as const, gain: 0.55 },
];

