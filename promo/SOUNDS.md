# Soundtrack candidates (freesound.org)

## Chosen

**#3, "Calm Background Music" by MrCatfishing** (https://freesound.org/people/MrCatfishing/sounds/788347/,
CC0 1.0 — no credit needed; credited here anyway). The film uses its public 128 kbps HQ preview (the
original download needs a freesound sign-in). The file is git-ignored; fetch it again with:

```bash
curl -L -o assets/audio/788347__mrcatfishing__calm-background-music-hq.mp3 https://cdn.freesound.org/previews/788/788347_16890479-hq.mp3
```

It plays once (1:27 is longer than the film), fading in over 1.2 s and out over the last 3 s, at
volume 0.8 in `src/theme.ts`. To use the original instead, download it signed in, put it in
`assets/audio/` and change `MUSIC.src`.

Before a track was chosen, the film used a **placeholder** made on this computer
(`npm run audio` writes `assets/audio/placeholder-pad.wav`: soft D–Bm–G–A chords at 80 BPM,
about −20 LUFS in the mix); point `MUSIC.src` back at it to hear it again. The candidates
that were considered:

All three candidates are **CC0 1.0** (no attribution required; a credit is still kind).
Nobody has listened to them yet: the notes come from each sound's page (description, tags,
comments). Play the previews first.

| # | Track | Author | Length | File | License |
|---|---|---|---|---|---|
| 1 | Perspire (Loop) – background music with echo pedal guitar and piano | JapanYoshiTheGamer | 1:00.000 (seamless loop) | WAV, 44.1 kHz, 16-bit, stereo, 10.1 MB | CC0 1.0 |
| 2 | calm_happy_rpgTownBackground.mp3 | SciCodeDev | 1:22.325 | MP3 320 kbps, 44.1 kHz, stereo, 3.1 MB | CC0 1.0 |
| 3 | Calm Background Music | MrCatfishing | 1:26.939 | MP3 170 kbps, 48 kHz, stereo, 1.8 MB | CC0 1.0 |

### 1. Perspire (Loop) — first choice

- Page: https://freesound.org/people/JapanYoshiTheGamer/sounds/713517/
- Preview: https://cdn.freesound.org/previews/713/713517_2901280-lq.mp3 (the `-hq.mp3` sibling is likely, not checked)
- Download (login): https://freesound.org/people/JapanYoshiTheGamer/sounds/713517/download/
- Served as: `713517__japanyoshithegamer__perspire-loop-corporate-style-background-music-with-echo-pedal-guitar-and-piano.wav`
- Character: echo-pedal guitar and piano, 120 BPM, tagged chill and relaxing; made by the author
  as a seamless one-minute loop for presentations and product trailers. 891 downloads, 37 ratings.
- Watch for: 120 BPM may feel a little brisk for "calm". It is exactly 60 s, so the film loops it
  once with a soft crossfade (`loopSec: 60`, below).

### 2. calm_happy_rpgTownBackground.mp3

- Page: https://freesound.org/people/SciCodeDev/sounds/442911/
- Preview: https://cdn.freesound.org/previews/442/442911_3556771-lq.mp3
- Download (login): https://freesound.org/people/SciCodeDev/sounds/442911/download/
- Served as: `442911__scicodedev__calm_happy_rpgtownbackground.mp3`
- Character: calm, happy, a 30 s theme played three times; the most downloaded (8,791, 145 ratings).
- Watch for: may sound like a video game rather than a product; lossy MP3. Long enough on its own.

### 3. Calm Background Music

- Page: https://freesound.org/people/MrCatfishing/sounds/788347/
- Preview: https://cdn.freesound.org/previews/788/788347_16890479-lq.mp3
- Download (login): https://freesound.org/people/MrCatfishing/sounds/788347/download/
- Served as: `788347__mrcatfishing__calm-background-music.mp3`
- Character: short, simple, nylon guitar and piano, "rounded"; the warmest of the three.
- Watch for: low bitrate (one comment says "very mp3"). Long enough on its own.

**Alternates:** Destructo20, "Gentle, Subtle guitar background noise…"
(https://freesound.org/people/Destructo20/sounds/780545/, 1:11, WAV 24-bit, 17.9 MB, CC0; the author
calls it "more of a soundcheck", a build-up near 0:42) and Bertsz, "Calm background Music"
(https://freesound.org/people/Bertsz/sounds/671900/, 1:47, MP3, 2.4 MB, CC0; tagged "suspense", trim it).
Rejected: two CC-BY ambient pieces described as "somber"/sad, tracks under 45 s, a 2006 MIDI-style
file, and one with birdsong.

## Optional sound effects (CC0 1.0)

The film already has synthesized whooshes, ticks and chimes (`scripts/make-audio.ts`), and its
alarm is Daybloom's own "Dawn" tone, rendered by the app's synthesizer. If you prefer recorded ones:

- Whoosh: xkeril, "Whoosh stereo light (transition)", 2.3 s, WAV 48 kHz, 434 KB —
  https://freesound.org/people/xkeril/sounds/701104/ (served as `701104__xkeril__whoosh-stereo-light-transition.wav`)
- Chime: Divinux, "ambientBell.wav", 20 s (trim the tail), WAV 44.1 kHz, 3.4 MB —
  https://freesound.org/people/Divinux/sounds/198416/

## Swap in the chosen track

1. Download the file from its page and put it in `promo/assets/audio/` (that folder's audio files
   are not committed).
2. In `src/theme.ts`, change the one `src` line of `MUSIC` to the file:

   ```ts
   	src: path.join(PROMO, "assets/audio/713517__japanyoshithegamer__perspire-loop-corporate-style-background-music-with-echo-pedal-guitar-and-piano.wav"),
   ```

   For Perspire (an exact 60 s loop) also add `loopSec: 60,` so the film lays it end to end with
   a soft crossfade. Tracks longer than the film (74.5 s) need nothing more: they fade in and out.
   Start `volume` near 0.6 and listen in `npm run preview`.
3. Run `npm run render`. The QA report at the end prints the loudness; aim for about −16 to −18 LUFS.

For a CC-BY track, add its credit line to the video description (freesound shows the exact text).
