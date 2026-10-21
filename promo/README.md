# Daybloom promo

A 74.5-second, 1920×1080 promo film for Daybloom, made in code with
[Framefields](https://framefields.dev) (WebGPU compositing, 3D and motion graphics in TypeScript).
It uses the app's real screenshots (`../docs/media`), icon (`../assets/brand`) and Lucide icons,
and draws the dial, Alef's eyes and every chart as vectors from the app's own geometry.

This folder is its own project: its packages never touch the app's `package.json`.

## Set up

```bash
cd promo
npm install          # approves only skia-canvas's install script (see "allowScripts")
npm run audio        # writes the placeholder soundtrack and the effects to assets/audio/
```

## Look, then render

```bash
npm run preview                  # live player on localhost, with sound (open the printed URL)
npm run scene -- alef 1.5 3.3    # one scene alone, at scene seconds → out/dev/
npm run grid -- board            # a contact sheet of one scene → out/dev/grid-board.png
npm run frames -- 3.7 40 70      # moments of the whole film (seconds) → out/frames/
npm run stills                   # the six key frames → out/frames/0*.png
npm run render                   # the film at 30 fps → out/daybloom-promo.mp4 (about 2.5 min on an M1)
npm run render:60                # the same at 60 fps, the delivered cut (about 5 min)
npm run square                   # a 1080×1080 social cut of the render (ffmpeg)
```

Every timing is in seconds, so the frame rate is free (`PROMO_FPS`). `out/` is not committed;
nor are the generated WAVs.

## Swap the soundtrack

The music is one line: `MUSIC.src` in `src/theme.ts`. `SOUNDS.md` lists three CC0 tracks on
freesound.org, how to download one and the exact line to change. Effects are placed at their cues
by `src/audio.ts` (each scene lists its own `cues`), so they move when a scene moves.

## The film

| # | Scene | File | Seconds |
|---|---|---|---|
| 1 | A dial assembles itself in space; its blocks open as a flower and fly out to the bezel; the hand sweeps to now; "Time you can see." | `scenes/open.ts` | 11.1 |
| 2 | Plan by sweeping the dial: a dashed ghost snaps every 5 minutes, then blooms into a block | `scenes/sweep.ts` | 7.0 |
| 3 | Real screenshots on floating 3D panels: the planner, the desktop widget, focus, themes | `scenes/panels.ts` | 12.6 |
| 4 | Meet Alef: eyes wake, follow the pointer, smile; "Let's start with just two minutes."; one AI setup | `scenes/alef.ts` | 9.2 |
| 5 | Free time around meetings and salah (Waqt); salah is tapped as prayed; a backlog task lands | `scenes/freetime.ts` | 6.9 |
| 6 | World clock: day-and-night rings for three cities on a 24-hour dial | `scenes/world.ts` | 6.2 |
| 7 | Board cards glide into columns and flow into Gantt bars; then a month of tiny dials | `scenes/board.ts` | 9.0 |
| 8 | An alarm blooms, with the app's seven gentle tones | `scenes/alarm.ts` | 5.4 |
| 9 | A 30-day Trash, and private by default | `scenes/trust.ts` | 5.3 |
| 10 | The icon turns in as a 3D tile inside a ring of the day's arcs; name, line, where to get it | `scenes/end.ts` | 8.2 |

Scenes overlap by their transitions (iris, zoom, whip, slide, push, fade), so the film is shorter
than the sum.

## Notes for editing

- `src/theme.ts` holds every colour (from DESIGN.md), size, font and asset path.
- `src/lib/dial.ts` draws the dial from DESIGN.md's radii; `src/lib/alef.ts` animates the eyes;
  `src/lib/kit.ts` has the type moves, glows, light sweeps and pills.
- Icons come from the app's icon table: add a name to `scripts/gen-icons.ts` and run `npm run icons`.
- 3D layers (anything under a camera) draw over the 2D pass, so they fade out before a transition.
- A shape draws only inside its own box: give paths that reach outside the dial a bigger box.
- Filled paths take one outline each: draw rings as strokes, or as separate thirds.
- Fonts: Lexend from `@expo-google-fonts/lexend` (OFL), registered in `theme.ts`.
