/**
 * The film's tokens: canvas, clock, brand colours (from DESIGN.md), fonts, media and sound.
 * Every size, colour and asset path the scenes use comes from here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FontManager } from "framefields";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROMO = path.resolve(HERE, "..");
export const REPO = path.resolve(PROMO, "..");
export const OUT = path.join(PROMO, "out");

// ── Canvas and clock ─────────────────────────────────────────────────────────

export const W = 1920;
export const H = 1080;
/** Frames per second. Scenes are timed in seconds, so this can change freely. */
export const FPS = Number((typeof process !== "undefined" && process.env?.PROMO_FPS) || 30);
/** Seconds → frames (whole frames: keyframes must be integers). */
export const f = (sec: number) => Math.round(sec * FPS);

// ── Sound ────────────────────────────────────────────────────────────────────
// The soundtrack is one line: point MUSIC at the chosen freesound file (see SOUNDS.md).
// `loopSec` repeats a short loop with a soft crossfade; leave it out for a long track.

export const MUSIC: { src: string; volume: number; loopSec?: number } = {
	// "Calm Background Music" by MrCatfishing (freesound 788347, CC0 1.0), its 128 kbps HQ
	// preview. 0.8 sits it about 2 dB under its own level, so the effects stay clear.
	src: path.join(PROMO, "assets/audio/788347__mrcatfishing__calm-background-music-hq.mp3"),
	volume: 0.8,
};
export const SFX_DIR = path.join(PROMO, "assets/audio");

// ── Media (the app's own screenshots and icon) ───────────────────────────────

export const media = (name: string) => path.join(REPO, "docs/media", name);
export const ICON_PNG = path.join(REPO, "assets/brand/icon-1024.png");

// ── Colour (DESIGN.md) ───────────────────────────────────────────────────────

export const C = {
	// Night desk (dark themes)
	night: "#0b1019",
	ground: "#0d121c",
	surface: "#131a27",
	raised: "#1a2232",
	sunken: "#0a0e16",
	ink: "#e9edf3",
	ink2: "#b0b9c7",
	ink3: "#8f9aab",
	line: "rgba(233, 237, 243, 0.08)",
	lineStrong: "rgba(233, 237, 243, 0.15)",
	signal: "#ff7440",
	lume: "#8ef0c1",
	// Fog desk (light themes)
	fog: "#eceff3",
	paper: "#f7f8fa",
	white: "#ffffff",
	pressed: "#e2e6ec",
	nightInk: "#151c2a",
	slateInk: "#485365",
	pencil: "#5f6a7b",
	signalLight: "#f2551d",
	lumeLight: "#2fae7b",
} as const;

/** The seven categories: light value, lifted dark value. */
export const CAT = {
	focus: { light: "#3D6FE3", dark: "#7598FF" },
	care: { light: "#25976A", dark: "#4FD39A" },
	routine: { light: "#D99A06", dark: "#FFC94A" },
	people: { light: "#DB4F94", dark: "#FF86BF" },
	rest: { light: "#8670E6", dark: "#B4A2FF" },
	learn: { light: "#138FA6", dark: "#4FD3E6" },
	move: { light: "#EA6A2A", dark: "#FF9B5E" },
} as const;
export type Category = keyof typeof CAT;

/** Dial finishes: Ink (dark) and Glacier (light), the defaults for Midnight and Fog. */
export interface Finish {
	dark: boolean;
	face: string;
	bezel: string;
	track: string;
	lume: string;
	rim: string;
	ink: string;
	ink2: string;
	signal: string;
}
export const INK_FINISH: Finish = {
	dark: true,
	face: "#141B29",
	bezel: "#1D2637",
	track: "#5E6A7E",
	lume: "#8EF0C1",
	rim: "#2A3447",
	ink: "#e9edf3",
	ink2: "#b0b9c7",
	signal: "#ff7440",
};
export const GLACIER_FINISH: Finish = {
	dark: false,
	face: "#F7F8FA",
	bezel: "#E3E8EE",
	track: "#8F9AAA",
	lume: "#3FBF8A",
	rim: "#CBD3DC",
	ink: "#151c2a",
	ink2: "#485365",
	signal: "#f2551d",
};

export const catColor = (c: Category, finish: Finish) => (finish.dark ? CAT[c].dark : CAT[c].light);

// ── Type ─────────────────────────────────────────────────────────────────────

export const SANS = "Lexend";
const LEXEND = path.join(PROMO, "node_modules/@expo-google-fonts/lexend");
const WEIGHTS: [number, string][] = [
	[300, "300Light/Lexend_300Light.ttf"],
	[400, "400Regular/Lexend_400Regular.ttf"],
	[500, "500Medium/Lexend_500Medium.ttf"],
	[600, "600SemiBold/Lexend_600SemiBold.ttf"],
];
export const FONT_FILES = WEIGHTS.map(([, file]) => path.join(LEXEND, file));

/**
 * One family per weight ("Lexend 300" …): faces of one family registered under several weights
 * do not resolve reliably, so each file is its own family and `fontFace` picks it.
 */
export const fontFace = (weight: number | string | undefined) => {
	const w = Number(weight ?? 400);
	const best = WEIGHTS.map(([x]) => x).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
	return `${SANS} ${best}`;
};

let fontsReady = false;
export async function registerFonts(): Promise<void> {
	if (fontsReady) return;
	for (const [weight, file] of WEIGHTS) {
		await FontManager.register({ family: `${SANS} ${weight}`, source: path.join(LEXEND, file) });
	}
	fontsReady = true;
}

/** Points every text node at its weight's family (walks the layout tree in place). */
// biome-ignore lint/suspicious/noExplicitAny: layout specs are plain objects.
export function resolveFonts(node: any, seen = new Set<unknown>()): void {
	if (!node || typeof node !== "object" || seen.has(node)) return;
	seen.add(node);
	if (node.fontFamily === SANS) {
		node.fontFamily = fontFace(node.fontWeight);
		delete node.fontWeight;
	}
	for (const v of Object.values(node)) {
		if (Array.isArray(v)) for (const c of v) resolveFonts(c, seen);
		else if (v && typeof v === "object") resolveFonts(v, seen);
	}
}

/** Text sizes. Headlines are large and calm; nothing on screen is smaller than 26 px. */
export const TYPE = {
	hero: 132,
	headline: 84,
	sub: 38,
	label: 30,
	small: 26,
} as const;

/** Ease vocabulary (DESIGN.md: ease-out for everything, settle for landings). */
export const EASE = {
	out: "expo.out",
	settle: "power3.out",
	inOut: "power2.inOut",
	in: "power2.in",
	spring: "back.out(1.6)",
	soft: "sine.inOut",
} as const;
