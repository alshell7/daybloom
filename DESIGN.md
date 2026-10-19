---
name: Daybloom
description: A sectograph-style visual day timer. Your day drawn as bezel inserts on a watch dial, for people who feel time differently.
colors:
  ground: "#eceff3"
  surface: "#f7f8fa"
  raised: "#ffffff"
  sunken: "#e2e6ec"
  line: "rgb(21 28 42 / 0.09)"
  line-strong: "rgb(21 28 42 / 0.16)"
  ink: "#151c2a"
  ink-2: "#485365"
  ink-3: "#5f6a7b"
  ink-inverse: "#f7f8fa"
  signal: "#f2551d"
  lume: "#2fae7b"
  focus-ring: "#3d6fe3"
  danger: "#c4372b"
  ground-dark: "#0d121c"
  surface-dark: "#131a27"
  raised-dark: "#1a2232"
  sunken-dark: "#0a0e16"
  line-dark: "rgb(233 237 243 / 0.08)"
  line-strong-dark: "rgb(233 237 243 / 0.15)"
  ink-dark: "#e9edf3"
  ink-2-dark: "#b0b9c7"
  ink-3-dark: "#8f9aab"
  signal-dark: "#ff7440"
  lume-dark: "#8ef0c1"
  focus-ring-dark: "#7598ff"
  danger-dark: "#ff7a6b"
  category-focus: "#3D6FE3"
  category-focus-dark: "#7598FF"
  category-care: "#25976A"
  category-care-dark: "#4FD39A"
  category-routine: "#D99A06"
  category-routine-dark: "#FFC94A"
  category-people: "#DB4F94"
  category-people-dark: "#FF86BF"
  category-rest: "#8670E6"
  category-rest-dark: "#B4A2FF"
  category-learn: "#138FA6"
  category-learn-dark: "#4FD3E6"
  category-move: "#EA6A2A"
  category-move-dark: "#FF9B5E"
  glacier-face: "#F7F8FA"
  glacier-bezel: "#E3E8EE"
  glacier-track: "#8F9AAA"
  glacier-lume: "#3FBF8A"
  glacier-rim: "#CBD3DC"
  ink-finish-face: "#141B29"
  ink-finish-bezel: "#1D2637"
  ink-finish-track: "#5E6A7E"
  ink-finish-lume: "#8EF0C1"
  ink-finish-rim: "#2A3447"
typography:
  display:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "clamp(22px, 13cqi, 76px)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "\"tnum\""
  numeral:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "4cqi"
    fontWeight: 300
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\""
  arc-label:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "2.5cqi"
    fontWeight: 500
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    letterSpacing: "-0.01em"
  block-title:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Lexend Variable, Lexend, ui-rounded, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    fontFeature: "\"tnum\""
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-inverse}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 16px"
  button-soft:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 16px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 16px"
  button-quiet-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    size: "34px"
  icon-button-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-inverse}"
  field:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 12px"
  segmented:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "30px"
    padding: "0 12px"
  segmented-option-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "0 9px"
  quick-add:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "42px"
    padding: "0 8px 0 6px"
  rail-capsule:
    rounded: "{rounded.lg}"
    width: "40px"
  panel:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    width: "min(400px, calc(100vw - 24px))"
    padding: "0 24px 24px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.lg}"
    padding: "10px 10px 10px 18px"
  dial-tooltip:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  week-day-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.md}"
    width: "42px"
---

# Design System: Daybloom

## Overview

**Creative North Star: "The Dial on the Desk"**

Daybloom is one object sitting on a quiet desk. The object is a Bauhaus watch dial: Max-Bill-thin numerals, a minute track, and a bezel whose coloured inserts are the day's blocks. You plan by sweeping the bezel, not by filling in forms. Everything else (the top bar, the day rail, the inspector panel, the settings) is the desk it rests on. The desk is cool, low in contrast, and tonally layered so the dial is always the first thing you read. The system rejects the category default of a calendar grid with a clock pasted beside it. Time is drawn as angle and area, and every number on screen has a shape that says the same thing faster.

Colour is semantic before it is decorative. Seven category colours carry meaning on every surface. One signal colour means *now*. One lume colour means *finished*. Free time keeps the bare neutral of the bezel. The palette is calm on purpose. Its users experience time blindness and anxiety around transitions, so nothing is red, nothing flashes, and nothing loops except one slow breathing halo around the block you are in. Delight is spent on real progress: a block draws itself onto the bezel, a finished block glows with lume, and a capsule fills like a glass.

The world ships as ten whole-app themes (four light, six dark, including true black). Each theme pairs with one of nine dial finishes. The planner, the desktop widget and the dial always agree.

**Key Characteristics:**
- A 1000-unit SVG dial with fixed radii: bezel band, minute track, numeral ring and face, all drawn in the finish's colours.
- Seven-colour categorical palette, with a light value and a lifted dark value per category, chosen by the dial finish.
- Cool tonal desk (ground, surface, raised, sunken). Elevation is mostly tone, plus three soft shadows.
- Lexend Variable throughout. Weight 300 for dial lettering, 500 as the ceiling for chrome. Tabular numerals for every time.
- Pills and circles for controls, gently rounded rectangles for containers, annular sectors for time.
- Springs for arc geometry, ease-out tokens for chrome. Continuous motion is compositor-only and stops under Calm.

## Colors

A cool, near-monochrome desk carries a bright, evenly spaced seven-hue category palette plus two reserved state colours: signal for now, lume for done.

### Primary
The category palette is the system's main voice. Every block is painted in its category colour wherever it appears. Light values sit on light finishes. Lifted values sit on dark finishes, picked by the **dial finish's** darkness so the rail and the dial never disagree. The hues are spaced around the wheel and separated in lightness, so neighbours stay distinct for common colour-vision differences.
- **Focus Blue** (#3D6FE3 / dark #7598FF): deep work and screens. The default category.
- **Care Green** (#25976A / dark #4FD39A): meds, health, self-care.
- **Routine Amber** (#D99A06 / dark #FFC94A): home, meals, chores.
- **People Pink** (#DB4F94 / dark #FF86BF): calls, meetings, friends.
- **Rest Lilac** (#8670E6 / dark #B4A2FF): sleep, breaks, wind-down.
- **Learn Teal** (#138FA6 / dark #4FD3E6): reading, study, practice.
- **Move Orange** (#EA6A2A / dark #FF9B5E): walks, gym, movement.

Text and icons on a category fill are white or Night Ink, whichever contrasts better (a WCAG luminance test, biased toward white).

### Secondary
- **Signal Orange** (#f2551d / dark #ff7440): the now colour. It is used for the now-hand on the dial, the now-line, its time pill and pinging dot in the rail, today's numeral in the week strip, the current onboarding step, the text caret, and the landing ghost while a task is dragged onto the ring. Each theme and finish tunes its own signal. Salmon's signal is navy (#1F3C8C) because orange would vanish on salmon. Graphite, Forest and Slate use warm amber. Signal is never a call-to-action colour: the primary button is ink.

### Tertiary
- **Lume Green** (#2fae7b / dark #8ef0c1): finished time. It appears as the rim on done arcs, the inner ring on done capsules, the tally bar, the done dots in the week strip, the focus-round pips, and the day-complete sweep. On dark finishes, lume rims get a soft glow. The one watch-native exception is luminous hour indices, drawn in lume at 50% opacity on dark dials only.

### Neutral
- **Fog Desk** (#eceff3): the app ground behind everything.
- **Rail Paper** (#f7f8fa): the day rail and panel footers. It also serves as ink-inverse, the text colour on ink fills.
- **Lifted White** (#ffffff): raised things, such as the panel, the selected rail row, fields, the quick-add bar, the segmented thumb and tooltips.
- **Pressed Fog** (#e2e6ec): sunken fills, such as hover backgrounds, the segmented track, chips and soft buttons.
- **Night Ink** (#151c2a): primary text, the primary button, the selected week-day puck and toasts.
- **Slate Ink** (#485365): secondary text and quiet button labels.
- **Pencil Grey** (#5f6a7b): tertiary text, including times, meta, section headings, placeholders and free-time rows.
- **Hairline** (9% ink) and **Firm Hairline** (16% ink): dividers, field borders, scrollbars and dotted gap lines.
- **Focus Ring Blue** (#3d6fe3): keyboard focus and text selection, at 28% for selection.
- **Delete Red** (#c4372b): the text of destructive buttons and system error messages, such as a calendar account that failed to sync. It is never used for the state of the user's own time.
- **Dial finish neutrals**: each finish defines face, bezel, track, rim, ink, signal and lume. Glacier (light) and Ink (dark) are the default pairs for Fog and Midnight. The full nine-finish table lives in the sidecar.

### Named Rules
**The Category Is the Meaning Rule.** A block's colour is its category, on every surface: dial insert, rail capsule, quick-add icon tint, chip dot, category picker, the inspector's 4px accent stripe and the breathing aura. Never colour a block by status, priority or source.

**The Signal Means Now Rule.** Signal marks the present moment and the place you are acting on right now. It is never decoration, never a category, and never a button fill.

**The Lume Means Done Rule.** Lume is the reward colour. It is spent only on finished time, plus the watch-native luminous indices on dark dials.

**The Free Time Is Bare Rule.** Unplanned time is never painted. On the dial it is bare bezel, showing faint graduation dots (track colour at 45%). In the rail it is a dotted Firm Hairline with Pencil Grey "45m free" text. In the time-timer face it is a wedge of track mixed into the face, tipped with a 4° edge in the next block's colour.

## Typography

**Display Font:** Lexend Variable (with Lexend, ui-rounded, system-ui)
**Body Font:** Lexend Variable by default. Reading text switches to Atkinson Hyperlegible (400/700) when the user picks the reading option.
**Label/Mono Font:** none. Numerals use Lexend's tabular figures.

**Character:** Lexend's wide, open letterforms were drawn for reading fluency. At weight 300 on the dial they give the thin, technical lettering of a Max Bill watch. At 500 in the chrome they read as friendly and plain. Atkinson Hyperlegible is an accessibility option. It replaces only the reading font (`--font-read`): body text, block titles, the block-sheet title and the focus-mode title. Dial lettering, buttons and labels stay in Lexend.

### Hierarchy
- **Display** (300, clamp(22px, 13cqi, 76px), line-height 1, -0.035em, tabular): the countdown in the dial face. It scales with the dial through container-query units. The widget uses 17cqi at weight 400.
- **Numeral** (300, 40 units of the 1000-unit dial = 4cqi, -0.01em, tabular): hour, minute and day numerals around the face. The compact widget draws every third numeral at 64 units.
- **Arc Label** (500, min(lane thickness × 0.34, 25 units), +0.01em): block titles set on a path along the bezel insert.
- **Headline** (500, 22px, -0.01em): the block-sheet title input. The focus-mode title steps up to 30px with 1.15 line-height and -0.02em.
- **Title** (500, 17px, -0.01em): the top-bar day name, empty-state and coach titles. Focus-mode subtasks use 17px at weight 400.
- **Block Title** (500, 14.5px, 1.3): rail block titles, clamped to two lines.
- **Body** (400, 14.5px, 1.45): base text across the app, in the reading font.
- **Label** (500, 13px): buttons and section headings. Section headings use Pencil Grey in sentence case. Segmented options share the size at weight 400.
- **Caption** (400, 11.5px, tabular): rail times, block meta, chips, swatch names and gallery labels.

The face readout under the countdown uses the title at clamp(11px, 2.9cqi, 17px) weight 500, and the sub-line at clamp(10px, 2.3cqi, 14px) at 66% opacity.

### Named Rules
**The Tabular Time Rule.** Every time, duration, count and countdown uses tabular numerals: the `.tnum` utility or `font-variant-numeric: tabular-nums`. Digits never shift width as time passes, and changing digits roll like an odometer rather than reflow.

**The Thin Dial Rule.** Dial lettering is weight 300. Chrome is 400 to 500. Weight 600 is reserved for tiny 10.5–12px pill labels (the now-time pill and the toast action), where thin strokes would break up. There are no uppercase eyebrows or kickers. Hierarchy comes from size, weight and the ink ramp.

## Layout

The main window is a two-row grid: a 60px top bar, then the stage. The stage has two columns. The left column is the dial (minmax(0, 1fr)). The right column is the day rail (clamp(320px, 31vw, 420px)), separated by a single Hairline and set on Rail Paper. The dial box is `min(100%, 100vh − 230px, 660px)` wide (never under 240px). It is centred in its column with 16/32/24px padding. The reference switcher sits under it like a crown under a watch case. The top bar is a three-column grid: the day name on the left, the week strip centred, icon actions on the right. On macOS, 88px of left padding clears the traffic lights.

Spacing follows a 4-point scale (4 / 8 / 12 / 16 / 24 / 32 / 48). Rows within a group use 8–12px. Group separations use 16–24px. Focus mode opens with 48px gutters. Rail rows share one grid: 52px time column, 44px capsule column, a flexible body and an auto tools column. Gap rows reuse the same columns, so the dotted free-time line aligns with the capsules.

Two breakpoints change the layout:
- **980px**: the top bar wraps, and the week strip drops to a centred second row.
- **860px**: the stage becomes one scrolling column. The dial (min(100%, 54vh, 520px)) sits above, and the rail flows beneath it, divided by a top Hairline. The inspector panel becomes a bottom sheet (8px insets, max 78vh). Toasts centre at the bottom.

The desktop widget is a frameless, transparent window holding only the dial, with its case and a 7px padding. A small tools pill sits 13% above the bottom edge and fades up on hover.

### Named Rules
**The Dial First Rule.** Nothing covers the dial. The inspector panel slides in beside it as a non-modal inspector (fixed 64px from the top, 12px from the right), so the dial stays live. Toasts rise from the foot of the rail, 16px from the corner. Editing never dims the screen behind a scrim.

## Elevation & Depth

Depth is tonal first. Four desk tones step up from Pressed Fog (sunken) to Fog Desk (ground) to Rail Paper (surface) to Lifted White (raised), and most separation is tone plus a 9% hairline. Shadows are soft, two-layer, ink-tinted (pure black in dark themes) and come in exactly three steps. Light emission is a separate channel from elevation: lume glows (`0 0 5–10px lume`, and an SVG Gaussian glow on dark dials) belong to finished things and never imply height. The dial gets its sense of depth from a radial white wash on the face (50% on light finishes, 5% on dark ones). In the widget, a case rim also catches a 2px inner highlight.

### Shadow Vocabulary
- **Rest** (`--shadow-1`: `0 1px 2px rgb(21 28 42 / 0.06), 0 1px 1px rgb(21 28 42 / 0.04)`): the segmented thumb and the selected rail row. Pieces that sit on the desk.
- **Float** (`--shadow-2`: `0 2px 6px -1px rgb(21 28 42 / 0.08), 0 10px 24px -8px rgb(21 28 42 / 0.16)`): the dial hover tooltip, the drag time pill and focus mode's "next" pill. Small things hovering over content.
- **Lift** (`--shadow-3`: `0 6px 16px -4px rgb(21 28 42 / 0.12), 0 24px 56px -16px rgb(21 28 42 / 0.28)`): the inspector panel, toasts and a rail row while it is being dragged.
- **Case** (`0 1px 2px rgb(0 0 0 / 0.18), 0 10px 30px -8px rgb(0 0 0 / 0.35)`): the widget dial's case only.

### Named Rules
**The Tonal Desk Rule.** Reach for a tone step (sunken hover, raised selection) before a shadow. A shadow means the thing is held above the desk: selected, dragged, or a transient overlay.

**The Glow Is Not Elevation Rule.** Lume glow marks finished time, and nothing else may glow. The one exception is opt-in: the **screen-cue edge glow** is the breathing aura moved to the edge of the display, in the category colour of what is being timed, breathing faster only in the last five minutes and the last minute.

## Shapes

The master shape is the circle: the dial, its case, the check rings, the category dots, the seconds bead and the sun or moon on the 24-hour hand. Every control is a pill (999px): buttons, icon buttons, the segmented control and its thumb, chips, tooltips and toast actions. Containers are gently rounded rectangles: 10px for fields and small tiles, 14px for rail rows, the quick-add bar and week-day chips, and 20px for the inspector panel and toasts. The global focus outline has a 6px radius. Rail blocks are capsules (40px wide, fully rounded 20px ends) whose height is their duration. On the dial, time is an annular sector with a small arc-length gap at each end (3.5 units, 5 in compact), so neighbouring blocks read as separate bezel inserts. Nothing in the system has a sharp corner.

Two line patterns carry meaning. **Dashes** mean provisional or unclaimed: the sweep ghost (8/8), a missed block's outline (7/7), the drop ghost, the "add" circle and the empty Later-field border. **Hatching and stripes** mean the block comes from a calendar and is read-only: 45° white hatch at 22% on the dial, 135° stripes on the rail capsule.

## Components

### Buttons
Tactile, round, and quiet until needed.
- **Shape:** full pill (999px), 36px tall, 16px side padding, 13px Lexend 500.
- **Primary:** Night Ink fill with Rail Paper text. On hover the ink takes a 12% warm tint toward signal.
- **Soft:** Pressed Fog fill with Night Ink text. Used for "Today" and secondary actions.
- **Quiet:** transparent with Slate Ink text. Hover fills Pressed Fog and darkens the text to Night Ink.
- **Danger:** Delete Red text only, with a 10% red wash on hover.
- **Icon button:** 34px circle, Slate Ink glyph. Hover fills Pressed Fog. When pressed (a toggle, `aria-pressed`) it inverts to an ink fill.
- **Press:** every button scales on `:active` (0.97 for buttons, 0.92 for icon buttons, 0.88 for the check). Disabled is 50% opacity.

### Segmented control (the reference switcher)
A Pressed Fog pill track (3px padding, 2px gap). A Lifted White thumb with the Rest shadow glides between options by animating `clip-path: inset(... round 999px)` over 380ms ease-out. This keeps a true pill at every width and runs on the compositor. Options are 30px tall with 12px padding, in Slate Ink that turns Night Ink when pressed. The thumb only starts animating after its first measurement, so it never slides in on load.

### Chips
- **Preview / meta chip:** a 24px pill on Pressed Fog with an 11.5px Slate Ink label. A strong variant uses Night Ink at weight 500 and leads with an 8px category dot.
- **Category picker chip:** a 28px pill with a Hairline border and a 10px category dot. When selected it gets a 16% category wash, a category border and a dot that pops once.
- **Time-box chip:** a 30px pill with a Firm Hairline border. On hover it raises to Lifted White with a Pencil Grey border.

### Inputs / Fields
- **Style:** 38px tall, 10px radius, 1px Firm Hairline border on Lifted White. The text caret is signal.
- **Focus:** the border turns Focus Ring Blue, with a 3px ring of focus blue at 20%. It does not glow.
- **Quick add:** a 42px bar with a 14px radius. A 30px leading icon tile, tinted 18% in the guessed category, swaps its icon with a scale-in as you type. While active, the border and a 4px ring take that category's colour (60% and 14%). The placeholder rotates example phrases every 3.8s, only while the bar is empty and unfocused.
- **Switch:** a 38×22 track in Firm Hairline. The thumb is a white circle that squishes while pressed.

### Cards / Containers (the inspector panel)
- **Corner Style:** 20px.
- **Background:** Lifted White with a 1px Hairline border. The footer is on Rail Paper behind a Hairline divider.
- **Shadow Strategy:** Lift (`--shadow-3`).
- **Accent:** a 4px top stripe in the block's category colour.
- **Internal Padding:** 16/12/8/24px header and 24px content. The heading is a 13px Pencil Grey label, not a big title.
- **Motion:** flies in 40px from the right over 340ms (out: 30px over 200ms).

### Navigation (top bar and week strip)
The day name sits at 17px weight 500, followed by the date in Pencil Grey at 14.5px weight 400. The week strip is seven 42px chips (weekday caption over a 14.5px 500 numeral, with up to four 4px dots in the colours of that day's blocks). Done dots turn lume with a 5px glow. Today's numeral is signal. The selected day sits on a Night Ink puck (14px radius) that slides between chips on `transform` over 420ms. Chevrons and "Today" flank the strip, and icon buttons sit on the right.

### Toast
A Night Ink card with a 20px radius, 13px Rail Paper text and the Lift shadow. When there is an undo action, a 2px countdown bar drains along the bottom (`scaleX`). The toast rises 16px from the rail foot, never over the dial.

### Rail block (signature)
A Structured-style timeline row. The capsule is a coloured glass whose height is its duration: `clamp(48px, minutes × 1.15px, 170px)`.
- **Upcoming:** a solid category capsule with an 18px icon in white or Night Ink, whichever contrasts better.
- **Live:** the capsule becomes a glass, a soft tint (category at 20% over white, or over Midnight surface on dark finishes) with a 2px inner ring at 45%. Liquid in the full category colour rises from the bottom as time is spent. The level moves once a minute with a 0.9s ease-out on `transform`. On each minute, two scalloped gradient strips roll across the surface once (1.6s ×2 and 2.7s ×1, in opposite directions), then rest. They keep rolling only while the row is hovered. The meta line reads "25m left".
- **Done:** the liquid pours to the brim (1.3s), then fades. The capsule settles to the soft tint with a 2px inner lume ring, and the icon pops to a check. The title's strike-through draws left to right (0.5s). The check ring fills from the centre and its tick draws in.
- **Missed:** soft tint plus a 2px dashed outline at 50% of the category colour, never red. The first tool becomes an always-visible "slide into the next free gap".
- **From calendar:** 135° stripes, read-only.
- **Interaction:** drag the capsule to move it and its bottom edge to resize, snapping to 5 minutes with an audible detent. A dark time pill reports "10:15 → 11:30 · 1h 15m". Hover reveals three 28px tools that stagger in (0/30/60ms).

### The Dial (signature)
The dial is drawn in a fixed 1000×1000 viewBox centred at (500, 500). Angles run clockwise from 12 o'clock. The radii are system constants:

| Ring | Radius (units) |
|---|---|
| Case edge / hand marker | 497 / 492 |
| Bezel band (inserts) | 468 → 382 (86 units) |
| Bezel base disc | 476 |
| Face disc | 374 |
| Minute track | 366 → 354 minor, → 340 major |
| Numerals | 298 |
| Readout boundary | 252 |
| Time-timer wedge | 330 → 214 |

**References** set the span of one turn. **12 h** puts noon or midnight at the top, with one hour behind the hand and eleven ahead (60 ticks, major every 5). **24 h** puts noon at the top and shades night (96 ticks, major every 4). **Hour** is a time-timer that shows the next 60 minutes as a shrinking wedge. **Cycles** shows focus rounds on the same 60-minute face. On the 60-minute faces, anything behind the hand simply leaves the face, because that angle also means the coming hour.

**Bezel.** The bezel shows the finish's bezel colour. Elapsed time is a faint ink film (6% light, 10% dark). Sleep hours are a darker bezel tone, with a moon if the stretch is three hours or longer. Graduation dots at each numeral angle show through wherever the day is free. The minute track is a single hairline path in the track colour (3 units, 5 compact). On dark finishes only, the major indices are overdrawn in lume at 50%.

**Block states.**
- **Upcoming:** full category colour.
- **Elapsed part of the current block:** the colour mixed 55–60% into the bezel.
- **Done:** the fill mixed 50% (light) or 42% (dark) into the face. A 5-unit lume rim runs along the outer edge, glowing on dark finishes. The icon becomes a check, and a white band sweeps along the arc once (950ms).
- **Missed:** the fill mixed 68% into the bezel, with a 7/7 dashed outline.
- **Selected:** outer radius +10, a blurred 22% halo, and every other block dimmed to 40%. A 15-unit end knob resizes it, and scrolling over it adjusts it in 5-minute steps.
- **Hover:** outer radius +4. A tooltip pill outside the rim shows the title and times.
- **Becoming current:** rises 16 units for 420ms, then settles.

**Arc labels.** The icon is min(thickness × 0.5, 34) units (46 compact) and is shown only if the arc is longer than 1.5× the icon. The title follows the arc on a `textPath` after the icon. Labels keep 16 units clear past the hand: when the hand crosses an arc, the words sit on the stretch still ahead of it. The compact widget shows icons only.

**Now-hand.** A thick signal stroke (8 units, 12 compact) runs from just outside the major ticks (r 346) to just inside the bezel (r 378). It lives between the numeral ring and the bezel. Only a 2.5-unit hairline (4 compact) crosses the inserts. Outside the bezel, a signal arrowhead marks the rim. On 24 h, a 17-unit signal disc carrying a sun or moon rides the hand there instead. The hand steps once a minute (every 5s on the 60-minute faces) and eases 0.8s between stops by the shortest turn. A seconds bead in the track colour sits outside the SVG on an HTML layer and steps once a second.

**Sweep to plan.** Pressing on the bezel band and dragging paints a ghost: ink at 16% with a dashed 55% outline. A dark pill reports the duration, and the ghost snaps to 5 minutes with detents. A single click makes a 30-minute block. Dragging a Later task over the ring shows a signal-tinted landing ghost.

#### Named Rules
**The Lanes Only Where It Overlaps Rule.** The bezel splits into lanes only inside a cluster of blocks that actually overlap. Lanes are up to 3, with 5-unit gaps, outermost first. Every block outside a cluster keeps the full 86-unit band. Above two lanes, titles drop and icons carry the label.

**The Whole Word Rule.** Arc titles are fitted word by word into the room left after the icon. If fewer than three characters fit, no title is drawn and the icon stands alone. Never truncate with an ellipsis on the dial: a stub like "Lun…" reads worse than the icon.

**The Upright Label Rule.** Text reads clockwise from the start when it lands on the top half. When both the start and end of the words fall between 90° and 270°, the text runs counter-clockwise from the end, so it is never upside down. Its baseline moves from just inside the mid-radius (−0.36 em) to just outside (+0.36 em).

**The Hand Never Covers a Number Rule.** The thick part of the now-hand stays between the numerals and the bezel. Only a hairline crosses the inserts, so no numeral or label is ever hidden by the present.

**The Never-Red Rule.** A missed block fades toward the bezel and gets a dashed outline, and is offered a slide into the next free gap. Red is reserved for destructive actions and system errors, never for the user's time. There is no streak, no warning colour and no shaming state.

### Motion (applies to every component)
Motion rewards real progress and otherwise stays out of the way. The widget lives on the desktop all day, so idle cost is a design constraint.

- **Tokens:** `--ease-out` cubic-bezier(0.16, 1, 0.3, 1) is the default for everything. `--ease-in-out` (0.65, 0, 0.35, 1) is for the theme reveal and demos. `--ease-settle` (0.22, 1, 0.36, 1) is for things that land, such as the capsule scale, the check and the switch thumb. Durations are `--dur-1` 120ms (hover, press), `--dur-2` 220ms (state) and `--dur-3` 380ms (colour and settle).
- **Springs for arcs:** arc start, end and radii are Svelte springs (stiffness 0.14, damping 0.72), always taking the nearest turn. On first paint, arcs bloom clockwise, each drawing from zero sweep, staggered 120ms + 55ms per arc. Arcs added later draw on immediately.
- **One-shots:** the lume charge (950ms), the day-complete lume sweep (2.4s), the pour (1.3s), the theme change as a circular View Transition from the clicked swatch (650ms), the day change (the new day's dial turns in through 28° in the direction of travel and scales up from 0.94 over 560ms), odometer digits (420ms with 2px blur), the now-dot ping (twice per minute), and the readout title rising 8px.
- **Continuous:** only the aura, a conic halo in the current block's colour just outside the rim. It breathes on opacity, 0.12 to 0.70 over 8s (4s in, 4s out), and quickens to 4s during a heads-up before a transition. The user-started breathing guide (a soft disc in the face on a 16s cycle of 4s in, 4s hold, 6s out, 2s rest) runs only for its one minute.

#### Named Rules
**The Compositor-Only Loop Rule.** Anything that moves without the user touching it animates only `opacity` or `transform` on an HTML layer. That covers the aura, the seconds bead, the liquid level, the waves and the now-ping. Never loop an animation on SVG geometry, a mask or a gradient. SVG may animate only in one-shots that end: the bloom, the charge, the day sweep and the wedge's path transition.

**The One Loop Rule.** The breathing aura is the only always-on loop. Everything else either steps with the clock (the hand once a minute, the bead once a second, the liquid once a minute) or plays once. The liquid wave sloshes once per minute, then rests.

**The Calm Switch Rule.** `prefers-reduced-motion`, or the in-app Motion setting set to Calm, sets `data-motion="calm"`. That turns every loop off. The aura holds still at 35%, and the waves, pings, seconds bead, sparks and pour are removed. Springs jump to their targets, Svelte transitions get zero duration, view transitions are skipped, and `--dur-2` and `--dur-3` collapse to 1ms and 120ms.

## Do's and Don'ts

### Do:
- **Do** paint every block in its category colour on every surface. Pick the light or lifted dark value from the dial finish's darkness (`categoryColor(id, finish.dark)`).
- **Do** keep signal for now: the hand, the now-line, today's date, the caret and the drop target.
- **Do** keep lume for finished time, and for luminous hour indices on dark dials.
- **Do** leave free time bare: bezel graduation dots on the dial, a dotted Firm Hairline with "Nm free" in the rail.
- **Do** give every block an icon and a label as well as a colour. Colour is never the only signal.
- **Do** set every time, duration and count in tabular numerals.
- **Do** draw dial geometry from the fixed radii in `geometry.ts` (bezel 468→382, track 366→340, numerals 298). Do not invent new rings.
- **Do** animate arc geometry with springs (0.14 / 0.72) and chrome with the `--ease-*` and `--dur-*` tokens.
- **Do** pair every new theme with a dial finish in the single `THEMES` table, so the planner, the widget and the dial agree.
- **Do** gate every loop and every spatial transition behind `prefers-reduced-motion` and the Calm setting.

### Don't:
- **Don't** paint missed or overdue time red, or add any warning state. Missed blocks fade and dash.
- **Don't** truncate a dial label with an ellipsis. Show whole words or the icon alone.
- **Don't** let the now-hand's thick stroke cross the numerals or the bezel inserts. Only the hairline crosses.
- **Don't** split the bezel into lanes for blocks that do not overlap, and don't exceed three lanes.
- **Don't** loop an animation on SVG paths, masks or gradients. Don't add a second always-on loop beyond the breathing aura.
- **Don't** use signal as a button, link or emphasis colour. The primary action is ink.
- **Don't** cover the dial: no modal scrims for editing, and no toasts over the dial or its controls.
- **Don't** use uppercase eyebrows or kickers. Section headings are 13px weight 500 Pencil Grey in sentence case.
- **Don't** add hard or coloured shadows. Use the three soft ink shadows. Glow belongs to lume only.
