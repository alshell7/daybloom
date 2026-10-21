/**
 * SVG path helpers: parse any path (relative commands, shorthands, packed arc flags) and write
 * it back as absolute M/L/C/Q/A/Z commands, scaled and moved. Icons are drawn on a 24-unit grid
 * and dial geometry in 1000 units; both are scaled into each layer's own pixel box here.
 */

type Cmd = { c: string; v: number[] };

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function tokenize(d: string): Cmd[] {
	const out: Cmd[] = [];
	let i = 0;
	let cmd = "";
	const num = () => {
		const m = /^[\s,]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(d.slice(i));
		if (!m) return null;
		i += m[0].length;
		return Number(m[1]);
	};
	const flag = () => {
		const m = /^[\s,]*([01])/.exec(d.slice(i));
		if (!m) return null;
		i += m[0].length;
		return Number(m[1]);
	};
	while (i < d.length) {
		const ch = d[i];
		if (/[\s,]/.test(ch)) {
			i++;
			continue;
		}
		if (/[a-zA-Z]/.test(ch)) {
			cmd = ch;
			i++;
			if (cmd.toUpperCase() === "Z") {
				out.push({ c: cmd, v: [] });
				continue;
			}
		}
		const n = ARGS[cmd.toUpperCase()];
		if (n === undefined) throw new Error(`bad path command "${cmd}" in ${d}`);
		const v: number[] = [];
		for (let k = 0; k < n; k++) {
			const isFlag = cmd.toUpperCase() === "A" && (k === 3 || k === 4);
			const x = isFlag ? flag() : num();
			if (x === null) throw new Error(`bad path data near "${d.slice(i, i + 12)}" in ${d}`);
			v.push(x);
		}
		out.push({ c: cmd, v });
		// Extra coordinate pairs after M are implicit L.
		if (cmd === "M") cmd = "L";
		else if (cmd === "m") cmd = "l";
	}
	return out;
}

/** The path as absolute commands only (M L C Q A Z), shorthands expanded. */
function absolute(d: string): Cmd[] {
	const out: Cmd[] = [];
	let x = 0, y = 0, sx = 0, sy = 0;
	let lastC: [number, number] | null = null;
	let lastQ: [number, number] | null = null;
	for (const { c, v } of tokenize(d)) {
		const rel = c === c.toLowerCase();
		const C = c.toUpperCase();
		const ox = rel ? x : 0, oy = rel ? y : 0;
		let nextC: [number, number] | null = null;
		let nextQ: [number, number] | null = null;
		switch (C) {
			case "M":
				x = v[0] + ox; y = v[1] + oy; sx = x; sy = y;
				out.push({ c: "M", v: [x, y] });
				break;
			case "L":
				x = v[0] + ox; y = v[1] + oy;
				out.push({ c: "L", v: [x, y] });
				break;
			case "H":
				x = v[0] + (rel ? x : 0);
				out.push({ c: "L", v: [x, y] });
				break;
			case "V":
				y = v[0] + (rel ? y : 0);
				out.push({ c: "L", v: [x, y] });
				break;
			case "C": {
				const p = [v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy, v[4] + ox, v[5] + oy];
				out.push({ c: "C", v: p });
				nextC = [p[2], p[3]];
				x = p[4]; y = p[5];
				break;
			}
			case "S": {
				const r: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
				const p = [r[0], r[1], v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy];
				out.push({ c: "C", v: p });
				nextC = [p[2], p[3]];
				x = p[4]; y = p[5];
				break;
			}
			case "Q": {
				const p = [v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy];
				out.push({ c: "Q", v: p });
				nextQ = [p[0], p[1]];
				x = p[2]; y = p[3];
				break;
			}
			case "T": {
				const r: [number, number] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
				const p = [r[0], r[1], v[0] + ox, v[1] + oy];
				out.push({ c: "Q", v: p });
				nextQ = r;
				x = p[2]; y = p[3];
				break;
			}
			case "A": {
				const ex = v[5] + ox, ey = v[6] + oy;
				out.push({ c: "A", v: [v[0], v[1], v[2], v[3], v[4], ex, ey] });
				x = ex; y = ey;
				break;
			}
			case "Z":
				out.push({ c: "Z", v: [] });
				x = sx; y = sy;
				break;
		}
		lastC = nextC;
		lastQ = nextQ;
	}
	return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** `d` scaled by `s` and moved by (dx, dy), as absolute commands. */
export function transformPath(d: string, s: number, dx = 0, dy = 0): string {
	return absolute(d)
		.map(({ c, v }) => {
			if (c === "Z") return "Z";
			if (c === "A") {
				const [rx, ry, rot, la, sw, x, y] = v;
				return `A${r3(rx * s)} ${r3(ry * s)} ${rot} ${la} ${sw} ${r3(x * s + dx)} ${r3(y * s + dy)}`;
			}
			const p: number[] = [];
			for (let i = 0; i < v.length; i += 2) p.push(r3(v[i] * s + dx), r3(v[i + 1] * s + dy));
			return c + p.join(" ");
		})
		.join("");
}
