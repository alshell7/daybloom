# Third-party code in the website

The website in `site/` adapts a few interface components from public libraries. Each one was
read from its official source, copied into `site/src/components/ui/`, and changed to suit
Daybloom's design and performance rules. Each file has a header comment that names its source
and lists the changes. This page lists every component, its source and its licence.

## Magic UI

- Licence: MIT. Copyright (c) Magic UI.
- Repository: <https://github.com/magicuidesign/magicui>
- Source: the official registry at `https://magicui.design/r/<name>.json`

| Component | Site file | Main changes |
|---|---|---|
| Animated Theme Toggler | `ui/theme-toggle.tsx`, and the swatch reveal in `sections/Themes.tsx` | Drives `data-theme`, uses the app's 650 ms circle reveal, no transition under reduced motion |
| Animated Beam | `ui/animated-beam.tsx` | Runs a few times when visible, then rests (no endless loop) |
| Bento Grid | the card grid in `sections/Features.tsx` | The layout pattern only; every card holds a live demo |
| Blur Fade | `hooks/useReveal.ts` and the `[data-reveal]` rules in `styles.css` | The same entrance, done with one IntersectionObserver and CSS; content is visible without script |
| Confetti | `ui/confetti.ts` | A function that loads `canvas-confetti` on the first burst, in the block colours |
| Dock | `ui/dock.tsx`, `DockNav.tsx` | Section links with labels, a signal dot for the current section |
| Magic Card | `ui/magic-card.tsx` | Pointer position in CSS variables, no theme library |
| Marquee | `ui/marquee.tsx` | Pauses off screen, still under reduced motion |
| Number Ticker | `ui/number-ticker.tsx` | The real value is in the HTML; can count down |
| Orbiting Circles | `ui/orbiting-circles.tsx` | Dashed track like the dial, pauses off screen |
| Shimmer Button | `ui/shimmer-button.tsx` | A link, ink or soft tone; the light moves only on hover or focus |
| Text Reveal | `ui/text-reveal.tsx` | Shorter run; faint words drawn as generated content |
| Typing Animation | `ui/typing-animation.tsx` | First phrase present before script runs; reports each phrase |

## Aceternity UI

- Licence: Aceternity UI licence (<https://ui.aceternity.com/licence>). Author: Manu Arora.
  It allows the components in end products such as websites. It does not allow you to
  redistribute the items or their source files as stock, or on a marketplace.
- Source: the official registry at `https://ui.aceternity.com/registry/<name>.json`

| Component | Site file | Main changes |
|---|---|---|
| Compare | `ui/compare.tsx` | A range input for keyboards and screen readers, no sparkle canvas, one peek instead of autoplay |
| Container Scroll Animation | `ui/container-scroll.tsx` | No device frame, gentler tilt, flat under reduced motion |
| Timeline | `ui/timeline.tsx` | The fill grows with `scaleY`, blue to lume |

Note: the Daybloom repository is public, so these adapted files can be read there as part of
the website's source. Check that this is acceptable for you under the Aceternity licence.

## React Bits

- Licence: MIT + Commons Clause. Copyright (c) 2026 David Haz.
  Use is allowed as part of an application, website or product. Selling, sublicensing or
  redistributing the components themselves is not allowed.
- Repository: <https://github.com/DavidHDev/react-bits> (`src/ts-tailwind/`)

| Component | Site file | Main changes |
|---|---|---|
| Click Spark | `ui/click-spark.tsx` | Called only on real progress (a finished block); one fixed canvas; off under reduced motion |
| Magnet | `ui/magnet.tsx` | One element, fine pointers only, off under reduced motion |

## 21st.dev (Fumadocs)

- Component: `fuma-nama/accordion` on 21st.dev. The 21st.dev registry needs a sign-in, so the
  code was read from the author's repository.
- Licence: MIT. Copyright (c) 2023 Fuma.
- Repository: <https://github.com/fuma-nama/fumadocs> (`packages/radix-ui/src/components/accordion.tsx`)
- Site file: `ui/accordion.tsx`. Changed to native `<details name>` instead of Radix, so the
  answers stay in the HTML; keeps the open-from-link and copy-link features.

## Other

| What | Where | Licence |
|---|---|---|
| GitHub mark (Octicons `mark-github`) | `ui/github-mark.tsx` | MIT, GitHub |
| Lucide icons (`lucide-react`) | everywhere | ISC |
| Lexend (`@fontsource-variable/lexend`) | the type | SIL Open Font License 1.1 |
| canvas-confetti | `ui/confetti.ts` | ISC |
| motion | animation | MIT |
| React, React DOM | the page | MIT |
| Tailwind CSS, Vite, clsx | build and styles | MIT |

## Daybloom's own code

These parts come from the Daybloom app in this repository, not from a third party: the dial
geometry and drawing (`lib/geometry.ts`, `components/dial/`), Alef's eyes and feelings
(`lib/alef/`, `components/alef/`), the alarm tones (`lib/tones.ts`), the sun model and the world
clock (`lib/sky.ts`), the themes and dial finishes (`lib/themes.ts`), the city list
(`data/zones.json`, from the Waqt place list), the mihrab icon (`lib/mihrab.tsx`), and the
screenshots in `public/media` (from `docs/media`, converted by `scripts/optimize-media.mjs`).
