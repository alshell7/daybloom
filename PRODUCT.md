# Product

<!-- impeccable:product-schema 1 -->

> Facts below come from the owner's written brief (2026-10-19). Lines marked *(inferred)* were not confirmed in an interview — the session ran under a no-pause directive — and should be confirmed or corrected.

## Platform

web

(Rendered inside a native desktop shell — Tauri v2 — on macOS and Windows. The design language is the product's own, not macOS- or Windows-native chrome.)

## Stack

delegated: Tauri v2 (Rust shell, system webview) + Svelte 5 + TypeScript + Vite. Chosen because the brief demands "super lightweight" cross-platform with a widget-like presence on macOS and Windows; Tauri ships ~5–10 MB binaries with transparent, frameless, always-on-top/always-on-bottom windows on both OSes. Flutter (≈4–6× larger, weaker transparent-window story) and Qt (ruled out by the owner as heavy with poor UX) were rejected.

## Users

People with neurodivergence — ADHD, autism, dyscalculia, executive-function differences — who experience time blindness: "later" and "in 40 minutes" do not feel different, transitions between activities are hard, and lists of times do not translate into a felt sense of the day. They use a computer for most of the day *(inferred)* and want time made visible at a glance without opening an app.

## Product Purpose

Make time visible. A circular, sectograph-style dial shows the day's plans as arcs around a clock face, so how much time remains — in the current block, before the next thing, in the day — is read as area and angle, not computed from numbers. A Structured-style linear timeline lets the user plan and tick off the same blocks. Success is daily, voluntary return: people keep the widget on their desktop because it lowers anxiety, not because it nags.

## Positioning

The combination of Sectograph (time as arcs on a dial) and Structured (a friendly linear day planner) in a single lightweight desktop app with a living desktop widget, designed first for neurodivergent time perception. Planning happens *on the dial itself* (sweep to paint a block of time), not only in forms.

## Operating Context

- A small dial sitting on the desktop (macOS and Windows) all day, glanced at between tasks; the full app opened to plan the day or tick things off.
- Recurring routines (meds, meals, standups, school run) repeat daily/weekly.
- Future: events pulled from multiple Google Calendar accounts (work + personal) alongside local tasks.

## Capabilities and Constraints

- Circular dial modes (presets): 12-hour sectograph, 24-hour day ring, single-block countdown (time-timer style), focus/pomodoro cycles *(preset list inferred)*.
- Tasks: title, icon, color, start, duration, notes, subtasks, completion; recurring rules with per-occurrence completion and skips.
- Desktop widget: frameless, transparent, can float on top or sit on the desktop.
- Transition support: gentle heads-up before a block ends and when the next begins *(inferred from ND needs)*.
- Calendar integration is architected now and finished later; multiple Google accounts must be supported.
- Must stay light: no heavy runtime, no large animation assets.

## Brand Commitments

- Owner-named references: Sectograph (Android), Structured (Android), Rive-style motion graphics.
- "Beautiful minimalistic, powerful, helpful" — UI/UX is the key differentiator; should be loved from day one.
- Working name **Daybloom** *(inferred — not chosen by the owner)*.

## Evidence on Hand

None. No users, testimonials, metrics, or brand assets exist yet. Do not fabricate any. Sample tasks in the app are synthetic onboarding content.

## Product Principles

1. **Time is a shape.** Every number on screen has an angle, arc, or area that says the same thing faster.
2. **Gentle, never guilty.** Missed blocks become movable, not red. No streak-shaming.
3. **Glanceable first.** The widget answers "what now, how long left, what next" in under a second.
4. **Delight that lasts.** Motion and sound reward real progress (finishing a block), and stay satisfying on the hundredth day.
5. **Light as air.** Small binary, low idle CPU, no motion when nothing changes.

## Accessibility & Inclusion

- Honors `prefers-reduced-motion` with a calm alternative, plus an in-app motion setting.
- Sound is opt-in and mutable; never a startle.
- High-contrast, colorblind-safe category palette (color never the only signal — every block also has an icon and label).
- Optional dyslexia-friendly reading settings *(inferred)*.
- Full keyboard operation of the planner.
