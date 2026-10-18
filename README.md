# Daybloom

A visual day planner and timer for brains that see time differently.
Your day is a watch dial: every block is a coloured insert on the bezel, the orange
hand is *now*, and how much time is left reads as angle and area — not arithmetic.
Think **Sectograph** (time as arcs on a clock) + **Structured** (a friendly day
timeline), made for the desktop, with a living widget on your wallpaper.

Built for ADHD, autism and anyone with time blindness: transitions are signposted,
missed blocks are never red, and finishing something makes it glow.

## What it does

| | |
|---|---|
| **Sweep to plan** | Press on the ring and drag around it to paint a block. The bezel clicks every 5 minutes. Tap a block, drag its knob to resize, drag its body to move, or scroll over it like a watch crown. |
| **Four dial references** | **12 h** (next 12 hours on a clock face) · **24 h** (the whole day, noon on top, night shaded, a sun/moon rides the hand) · **Hour** (the next hour as a shrinking wedge — Time-Timer style) · **Cycles** (focus rounds with breaks). Arcs spring to their new places when you switch; the dial turns as you change days. |
| **Day rail** | Structured-style timeline: capsule height = duration, **drag a block up/down to move it, drag its bottom edge to resize** (5-minute detents, live times, the dial follows), free gaps you can fill, a live now-line, an *Anytime* tray and a *Later* inbox. |
| **Quick add in plain words** | “gym 5pm 45m”, “meds every day 8am”, “call mom tomorrow 6pm”, “standup weekdays 9:30 15m”, “return parcel later” — a live preview shows what it understood, the icon and colour are guessed from the words. |
| **Liquid time** | The running block's capsule fills like a liquid timer and sloshes as the level rises; finishing pours it to the brim, draws the strike-through and floats a “+45m” score. |
| **Themes** | Ten whole-app presets — Fog, Linen, Mist, Sage (light) and Midnight, **Black (true #000 / OLED)**, Graphite, Forest, Plum, Cocoa (dark) — each paired with a dial finish; one tap flips light/dark with a circular reveal. |
| **Time zones** | One click on the globe chip: search any city, see its live time, and the whole day re-reads in that zone (DST-correct). Routines keep their wall-clock times; calendar events stay true instants. |
| **Recurring blocks** | Daily, weekdays, weekly on chosen days, every N days/weeks/months/years, ending never / on a date / after N times. Edit "every time" or "just this day"; skip a single day. |
| **Transitions** | A breathing heads-up on the arc before a block ends, a soft chime and notification when the next begins, nudges before start, and *Focus mode* — one thing on screen, the next a glance away. |
| **Gentle, never guilty** | A missed block turns dotted, with one-tap *move to the next free gap*. No streaks to lose. |
| **Finished time glows** | Ticking a block sends a band of light along its arc and leaves a lume rim — on dark dials it glows. Finish the whole day and the bezel sweeps. |
| **Desktop widget** | A frameless, transparent dial on macOS and Windows. Float on top or sit on the desktop. Drag to move, double-click to open the planner. On macOS the menu bar shows the countdown. |
| **Calendars** | Multiple Google accounts at once (work + personal), plus any ICS/webcal link. Events are read-only and hatched on the dial. See [docs/calendar.md](docs/calendar.md). |
| **Breathing** | The block under the hand breathes — a soft halo in its colour at the pace of slow breathing (faster in the last minutes); a one-minute guided breath is one click away. |
| **Comfort** | Nine dial finishes, Calm motion, opt-in synthesised sounds, Lexend or Atkinson Hyperlegible, 12/24h, full keyboard control. |
| **Small touches** | Typing "lunch" turns a block green with a fork and knife; drag a Later item onto the ring to schedule it; hover an arc for its name and times; a daily tally counts what's done and how much time it was worth. |

Keyboard: `N` new block · `←`/`→` days · `T` today · `1`–`4` dials · `F` focus · `W` widget · `Space` done · `Delete` remove · `,` settings · `Esc` close.

## Why this stack

**Tauri v2 + Svelte 5 + TypeScript.** The brief asked for something "super lightweight,
cross-platform, widget-like" with UI as the differentiator.

- Tauri uses the system webview (WKWebView / WebView2), so the app bundle is ~6.5 MB
  (vs. ~100 MB Electron, ~25–40 MB Flutter desktop).
- Measured on an Apple-silicon Mac with the planner *and* the widget open and a block running
  (all motion on): **~4% total CPU at idle, ~1% with Calm motion**; physical footprint ≈ 31 MB app +
  34 MB widget webview + ~100 MB planner webview. The widget's webview only exists while it is shown,
  and a hidden planner ticks every 5 s instead of every second.
- Every looping animation is compositor-only (opacity/transform on HTML layers — never SVG or
  masks), the hands and seconds are placed from the wall clock each tick (they cannot drift or run fast),
  and the rest repaints at most once a minute.
- Real transparent, frameless, always-on-top / always-on-bottom windows on both macOS and Windows.
- Svelte compiles away; the whole UI is ~200 KB of JS (68 KB gzipped). Motion uses Svelte
  springs and CSS — no animation runtime to ship. The seconds bead and breathing guide
  are compositor-driven CSS, so the widget repaints once a minute when nothing changes.
- All sounds are synthesised with WebAudio; there are no audio assets.

## Run it

```bash
npm install
npm run dev          # the UI in a browser at http://localhost:1420 (no Rust needed)
npm run tauri dev    # the desktop app with tray + widget (needs Rust: https://rustup.rs)
npm run tauri build  # release bundles (.app/.dmg on macOS, .msi/.exe on Windows)
npm test             # engine, recurrence and calendar tests
npm run check        # svelte-check / TypeScript
```

Dev helpers: `?view=widget` renders the widget in a browser tab, `?at=10:40` previews
the UI at another time of day.

Windows builds need the WebView2 runtime (bundled installer handles it) and are built on Windows
(`npm run tauri build`). Linux works too but is untested.

## Layout

```
src/
  lib/engine/        pure time logic: dates, recurrence (RRULE subset), blocks, lanes, now/next, gaps
  lib/dial/          the dial: geometry, Dial, DialArc (springs), Readout, Rolling digits
  lib/stores/        Svelte 5 rune stores, persisted per window and synced across windows
  lib/calendar/      calendar providers (Google multi-account, ICS) + sync service
  lib/platform.ts    the only seam to the native shell (commands + events contract)
  lib/scheduler…     heads-ups, chimes, notifications, menu-bar text
  components/        rail, inspector, settings, focus mode, sparks, toast, coach
  views/             MainView (planner) and WidgetView (desktop dial)
src-tauri/           Rust shell: windows, tray, widget layers, keychain, OAuth loopback
```

## Roadmap

- Calendar write-back (turn a block into a Google event), per-calendar colours on the dial.
- Native macOS WidgetKit / Windows 11 widget board companions (read the same state file).
- iOS/Android via Tauri mobile, sharing the engine and dial.
- Optional Rive-authored mascot moments (the motion system is already spring-driven and can host a `.riv` runtime).
- Energy levels per block, "body doubling" share link, and a weekly glow review.
