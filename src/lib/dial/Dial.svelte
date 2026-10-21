<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import HoverCard from './HoverCard.svelte';
  import RemainRing from './RemainRing.svelte';
  import { assignLanes } from '../engine/blocks';
  import { categoryColor, mix } from '../engine/categories';
  import BreathOrb from './BreathOrb.svelte';
  import { atMinutes, addDays, formatDuration, formatTime, isoOf, MINUTE } from '../engine/time';
  import type { Block, ISODate, Minutes } from '../engine/types';
  import Icon from '../Icon.svelte';
  import { PRESETS, type Finish, type PresetId } from '../presets';
  import { detent } from '../sound';
  import { angleOf, arcPath, C, laneRadii, MAX_LANES, nearestTurn, polar, R, radiusOf, sectorPath } from './geometry';
  import DialArc from './DialArc.svelte';
  import ZoneRings from './ZoneRings.svelte';
  import type { ScreenPalette } from '../addons/alef/palette';

  type Range = { startMs: number; endMs: number };

  let {
    presetId,
    finish,
    blocks,
    now,
    date,
    isToday,
    selectedKey = null,
    headsUpKey = null,
    compact = false,
    withCase = false,
    interactive = true,
    showSeconds = true,
    reduced = false,
    sleep = null,
    wedge = null,
    hideKey = null,
    dayCompleteAt = 0,
    label = 'Day dial',
    hour12 = false,
    onselect,
    oncreate,
    onadjust,
    ondroptask,
    breathing = false,
    breathStart = 0,
    prayers = [],
    prayerBloom = 0,
    lift = 0,
    screen = null,
    worldZones = [],
    children,
  }: {
    presetId: PresetId;
    finish: Finish;
    blocks: Block[];
    now: number;
    date: ISODate;
    isToday: boolean;
    selectedKey?: string | null;
    headsUpKey?: string | null;
    compact?: boolean;
    withCase?: boolean;
    interactive?: boolean;
    showSeconds?: boolean;
    reduced?: boolean;
    sleep?: { wake: Minutes; sleep: Minutes } | null;
    /** Time-timer wedge in the face (Timer / Chrono). */
    wedge?: (Range & { color: string; edgeColor?: string }) | null;
    /** A block already shown as the wedge — kept off the bezel to avoid saying it twice. */
    hideKey?: string | null;
    dayCompleteAt?: number;
    label?: string;
    hour12?: boolean;
    onselect?: (key: string | null) => void;
    oncreate?: (r: Range) => void;
    onadjust?: (key: string, r: Range) => void;
    /** A Later item dropped on the ring. */
    ondroptask?: (taskId: string, startMs: number) => void;
    /** Show the breathing guide in the face. */
    breathing?: boolean;
    /** When the breathing minute began (app clock), so the orb joins it in step. */
    breathStart?: number;
    /** Salah times (Waqt addon): each prayer's window, adhan and jamaat. */
    prayers?: { id: string; name: string; at: number; end: number; jamaat: number | null; current: boolean }[];
    /** Bumped at each adhan: the current prayer's band blooms once. */
    prayerBloom?: number;
    /** Alef's feelings: the blocks rise (+) or sink (−) a little, in a wave around the ring. */
    lift?: number;
    /** A face lives in the middle (Alef): the centre becomes its screen, in these colours. */
    screen?: { led: string; glow: number; palette: ScreenPalette } | null;
    /** World clock: up to two other zones, drawn as day/night rings outside the bezel. */
    worldZones?: string[];
    children?: Snippet;
  } = $props();

  /** The glass screen's radius: inside the numerals, under the time-left ring. */
  const screenR = $derived(compact ? 244 : 272);
  // On a black screen, the time-left ring reads as light on dark; in the dial's colours it stays.
  const sp = $derived(screen?.palette ?? null);
  const ringFinish = $derived(sp && sp.dark && !finish.dark ? { ...finish, track: 'rgba(170, 196, 228, 0.3)', face: sp.wellEdge, dark: true } : finish);

  /** Where an arc moves when the blocks rise or sink: along its middle, out or in. */
  function liftOf(a0: number, a1: number): string | null {
    if (!lift || reduced) return null;
    const [x, y] = polar(lift * (compact ? 1.6 : 1), (a0 + a1) / 2);
    return `translate(${(x - C).toFixed(1)}px, ${(y - C).toFixed(1)}px)`;
  }

  const preset = $derived(PRESETS[presetId]);
  const minuteNow = $derived(now - (now % MINUTE));
  const w = $derived(preset.window(minuteNow, date, isToday));
  const toDeg = (ms: number) => ((ms - w.originMs) / w.spanMs) * 360;

  // ---- live drag preview -------------------------------------------------
  let drag = $state<null | {
    mode: 'create' | 'resize' | 'move';
    key?: string;
    anchorMs: number;
    origStart: number;
    origEnd: number;
    lastDeg: number;
    acc: number;
    moved: boolean;
    preview: Range;
  }>(null);

  const visible = $derived.by(() => {
    const list = blocks
      .filter((b) => !b.floating && b.key !== hideKey && b.endMs > w.startMs && b.startMs < w.endMs)
      .map((b) => (drag && drag.mode !== 'create' && drag.key === b.key ? { ...b, ...drag.preview } : b))
      .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);
    return list;
  });

  const lanes = $derived(assignLanes(visible));
  // Only blocks that actually overlap share the bezel; everything else keeps full width.
  const clusterLanes = $derived.by(() => {
    const out = new Map<string, number>();
    let group: string[] = [];
    let groupEnd = -Infinity;
    let groupMax = 0;
    const close = () => group.forEach((k) => out.set(k, groupMax + 1));
    for (const b of visible) {
      if (b.startMs >= groupEnd) {
        close();
        group = [];
        groupMax = 0;
      }
      group.push(b.key);
      groupEnd = Math.max(groupEnd, b.endMs);
      groupMax = Math.max(groupMax, lanes.get(b.key) ?? 0);
    }
    close();
    return out;
  });

  const arcs = $derived(
    visible.filter((b) => !fineDial || b.endMs > handTime && !(b.done && (b.doneAt ?? b.endMs) <= handTime)).map((b) => {
      // On the 60-minute faces an angle behind the hand also means the coming hour, so
      // nothing is drawn there: past time simply leaves the face.
      const s = Math.max(b.startMs, w.startMs, fineDial ? handTime : -Infinity);
      // Finished early: only the time actually spent stays on the ring; the rest is free track.
      const end = b.done && b.doneAt && b.doneAt > b.startMs && b.doneAt < b.endMs ? Math.max(b.doneAt, b.startMs + MINUTE * 5) : b.endMs;
      const e = Math.min(end, w.endMs);
      const a0 = toDeg(s);
      const a1 = toDeg(e);
      // Hour-scale dials only need minute precision; that keeps idle repaint to once a minute.
      const t = handTime;
      const elapsedMs = isToday || presetId === 'timer60' || presetId === 'chrono' ? Math.min(Math.max(t - s, 0), e - s) : 0;
      return {
        block: b,
        a0,
        a1,
        elapsed: (elapsedMs / w.spanMs) * 360,
        lane: lanes.get(b.key) ?? 0,
        current: isToday && !b.done && b.startMs <= minuteNow && b.endMs > minuteNow,
        past: b.endMs <= minuteNow,
      };
    }),
  );

  // The time-eating ring: the block you're in (or the free time before the next one),
  // drawn in the face as a whole circle that shrinks. Hour / Cycles have their own wedge.
  const remain = $derived.by(() => {
    if (!isToday || fineDial || !blocks.length) return null;
    const live = blocks
      .filter((b) => !b.floating && !b.done && b.startMs <= now && b.endMs > now)
      .sort((a, b) => a.endMs - b.endMs)[0];
    if (live) return { id: live.key, start: live.startMs, end: live.endMs, color: live.color, free: false };
    const next = blocks.filter((b) => !b.floating && !b.done && b.startMs > now).sort((a, b) => a.startMs - b.startMs)[0];
    if (!next || next.startMs - now > 3 * 60 * MINUTE) return null;
    const prevEnd = Math.max(...blocks.filter((b) => !b.floating && b.endMs <= now).map((b) => b.endMs), next.startMs - 3 * 60 * MINUTE, now - 6 * 60 * MINUTE);
    return { id: `free:${next.key}`, start: Math.min(prevEnd, now), end: next.startMs, color: finish.track, free: true };
  });
  const ringR = $derived(compact ? { rIn: 196, rOut: 232 } : { rIn: 222, rOut: 262 });

  // More than three things at once: the extras gather into a "+N" badge on the rim.
  const overflow = $derived.by(() => {
    const extra = arcs.filter((a) => a.lane >= MAX_LANES).sort((a, b) => a.a0 - b.a0);
    const out: { angle: number; count: number; titles: string[] }[] = [];
    for (const a of extra) {
      const mid = (a.a0 + a.a1) / 2;
      const last = out.at(-1);
      if (last && Math.abs(last.angle - mid) < 10) {
        last.count++;
        last.titles.push(a.block.title);
      } else out.push({ angle: mid, count: 1, titles: [a.block.title] });
    }
    return out;
  });

  // Only the first paint staggers; arcs added later draw on immediately.
  let booting = $state(true);
  $effect(() => {
    const t = setTimeout(() => (booting = false), 900);
    return () => clearTimeout(t);
  });

  // ---- the now hand --------------------------------------------------------
  const showNow = $derived(isToday || presetId === 'timer60' || presetId === 'chrono');
  // Idle cost matters (the widget lives on the desktop all day): the hand steps once a
  // minute on hour-scale dials and every 5 s on the 60-minute faces, easing between stops.
  const fineDial = $derived(presetId === 'timer60' || presetId === 'chrono');
  const handTime = $derived(fineDial ? now - (now % 5000) : minuteNow);
  let handAngle = $state(0);
  $effect(() => {
    const target = toDeg(handTime);
    handAngle = nearestTurn(handAngle, target);
  });

  // ---- bezel shading ------------------------------------------------------
  const elapsedSector = $derived.by(() => {
    if (!showNow || fineDial) return '';
    const a0 = toDeg(w.startMs);
    const a1 = toDeg(Math.min(handTime, w.endMs));
    return a1 > a0 ? sectorPath(a0, a1, R.bezelIn, R.bezelOut) : '';
  });

  const sleepSectors = $derived.by(() => {
    if (!sleep || presetId === 'timer60' || presetId === 'chrono') return [] as { d: string; mid: number; long: boolean }[];
    const out: { d: string; mid: number; long: boolean }[] = [];
    for (const day of [addDays(isoOf(w.startMs), -1), isoOf(w.startMs), isoOf(w.endMs)]) {
      const s = atMinutes(day, sleep.sleep);
      const wake = sleep.wake <= sleep.sleep ? atMinutes(addDays(day, 1), sleep.wake) : atMinutes(day, sleep.wake);
      const a = Math.max(s, w.startMs);
      const b = Math.min(wake, w.endMs);
      if (b - a > 10 * MINUTE) out.push({ d: sectorPath(toDeg(a), toDeg(b), R.bezelIn, R.bezelOut), mid: (toDeg(a) + toDeg(b)) / 2, long: b - a >= 3 * 60 * MINUTE });
    }
    return out;
  });

  const wedgeArc = $derived.by(() => {
    if (!wedge) return null;
    const s = Math.max(now, wedge.startMs);
    const e = Math.min(wedge.endMs, s + w.spanMs - MINUTE);
    if (e <= s) return null;
    return {
      d: sectorPath(toDeg(s), toDeg(e), R.wedgeIn, R.wedgeOut),
      edge: wedge.edgeColor ? sectorPath(Math.max(toDeg(s), toDeg(e) - 4), toDeg(e), R.wedgeIn, R.wedgeOut) : '',
      edgeColor: wedge.edgeColor,
      end: toDeg(e),
      color: wedge.color,
    };
  });

  // ---- salah (Waqt addon): the current prayer's window as a soft band under the minute track,
  // a small mark at each adhan, a bead at jamaat. 60-minute faces show only the marks.
  const prayerColor = $derived(categoryColor('care', finish.dark));
  const prayerLayer = $derived.by(() => {
    if (!prayers.length) return null;
    const inWin = (t: number) => t >= w.startMs && t <= w.endMs;
    const longFace = w.spanMs > 2 * 3_600_000;
    const cur = prayers.find((p) => p.current);
    const band =
      cur && longFace && cur.end > w.startMs && cur.at < w.endMs
        ? sectorPath(toDeg(Math.max(cur.at, w.startMs)), toDeg(Math.min(cur.end, w.endMs)), R.trackMajor - 4, R.trackOut + 5)
        : '';
    const marks = prayers.filter((p) => inWin(p.at)).map((p) => ({ ...p, pt: polar((R.trackOut + R.trackMajor) / 2, toDeg(p.at)) }));
    const bead = cur?.jamaat && inWin(cur.jamaat) ? polar((R.trackOut + R.trackMajor) / 2, toDeg(cur.jamaat)) : null;
    return { band, marks, bead, cur };
  });

  // ---- minute track as one path (cheap to paint) ---------------------------
  const trackPath = $derived.by(() => {
    let d = '';
    for (let i = 0; i < preset.ticks; i++) {
      const a = (i * 360) / preset.ticks;
      const major = i % preset.majorEvery === 0;
      if (compact && !major) continue;
      const [x0, y0] = polar(R.trackOut, a);
      const [x1, y1] = polar(major ? R.trackMajor : R.trackMinor, a);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  });
  // Hour indices carry lume on dark dials.
  const majorPath = $derived.by(() => {
    let d = '';
    for (let i = 0; i < preset.ticks; i += preset.majorEvery) {
      const a = (i * 360) / preset.ticks;
      const [x0, y0] = polar(R.trackOut, a);
      const [x1, y1] = polar(R.trackMajor + 4, a);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  });
  const numerals = $derived(compact ? preset.numerals.filter((_, i) => i % 3 === 0) : preset.numerals);

  // ---- pointer interaction -------------------------------------------------
  let svg: SVGSVGElement;
  const STEP = 5 * MINUTE;
  const snapMs = (t: number) => Math.round(t / STEP) * STEP;
  let lastDetentSlot = 0;

  function local(e: PointerEvent | WheelEvent) {
    const m = svg.getScreenCTM();
    if (!m) return { x: C, y: C };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** Time under an angle, inside the visible window. */
  function timeAt(deg: number) {
    let t = w.originMs + (deg / 360) * w.spanMs;
    while (t < w.startMs) t += w.spanMs;
    while (t >= w.startMs + w.spanMs) t -= w.spanMs;
    return t;
  }

  function tickDetent(t: number) {
    const slot = Math.round(t / STEP);
    if (slot !== lastDetentSlot) {
      lastDetentSlot = slot;
      detent();
    }
  }

  function onDown(e: PointerEvent) {
    if (!interactive || e.button !== 0) return;
    const { x, y } = local(e);
    const r = radiusOf(x, y);
    if (r < R.bezelIn - 24 || r > R.case + 4) {
      if (r < R.readout) onselect?.(null);
      return;
    }
    const deg = angleOf(x, y);
    const t = snapMs(timeAt(deg));
    drag = { mode: 'create', anchorMs: t, origStart: t, origEnd: t, lastDeg: deg, acc: 0, moved: false, preview: { startMs: t, endMs: t } };
    lastDetentSlot = Math.round(t / STEP);
    svg.setPointerCapture(e.pointerId);
  }

  function onPick(e: PointerEvent, b: Block) {
    if (!interactive) return;
    if (selectedKey !== b.key || b.readOnly || !e.isTrusted) {
      onselect?.(b.key);
      return;
    }
    // Already selected: press-and-drag moves it.
    const { x, y } = local(e);
    const deg = angleOf(x, y);
    drag = { mode: 'move', key: b.key, anchorMs: b.startMs, origStart: b.startMs, origEnd: b.endMs, lastDeg: deg, acc: 0, moved: false, preview: { startMs: b.startMs, endMs: b.endMs } };
    lastDetentSlot = Math.round(b.startMs / STEP);
    svg.setPointerCapture(e.pointerId);
  }

  function onKnob(e: PointerEvent, b: Block) {
    e.stopPropagation();
    const { x, y } = local(e);
    drag = { mode: 'resize', key: b.key, anchorMs: b.endMs, origStart: b.startMs, origEnd: b.endMs, lastDeg: angleOf(x, y), acc: 0, moved: false, preview: { startMs: b.startMs, endMs: b.endMs } };
    lastDetentSlot = Math.round(b.endMs / STEP);
    svg.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    const { x, y } = local(e);
    const deg = angleOf(x, y);
    drag.acc += nearestTurn(drag.lastDeg, deg) - drag.lastDeg;
    drag.lastDeg = deg;
    if (Math.abs(drag.acc) > 1.2) drag.moved = true;
    const delta = (drag.acc / 360) * w.spanMs;
    const maxLen = w.spanMs - STEP;
    if (drag.mode === 'create') {
      const end = snapMs(drag.anchorMs + delta);
      const s = Math.min(drag.anchorMs, end);
      const en = Math.min(Math.max(drag.anchorMs, end), s + maxLen);
      drag.preview = { startMs: s, endMs: en };
      tickDetent(end);
    } else if (drag.mode === 'resize') {
      const end = Math.max(drag.origStart + STEP, Math.min(snapMs(drag.origEnd + delta), drag.origStart + maxLen));
      drag.preview = { startMs: drag.origStart, endMs: end };
      tickDetent(end);
    } else {
      const shift = snapMs(drag.origStart + delta) - drag.origStart;
      drag.preview = { startMs: drag.origStart + shift, endMs: drag.origEnd + shift };
      tickDetent(drag.preview.startMs);
    }
  }

  function onUp(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (d.mode === 'create') {
      if (!d.moved) oncreate?.({ startMs: d.anchorMs, endMs: d.anchorMs + 30 * MINUTE });
      else if (d.preview.endMs - d.preview.startMs >= STEP) oncreate?.(d.preview);
    } else if (d.moved && d.key) {
      onadjust?.(d.key, d.preview);
    }
  }

  // Drag a Later item onto the ring: a ghost shows where it will land.
  let drop = $state<null | { startMs: number; minutes: number }>(null);
  function onDragOver(e: DragEvent) {
    if (!ondroptask || !e.dataTransfer?.types.includes('application/x-daybloom-task')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { x, y } = local(e as unknown as PointerEvent);
    const minutes = Number(e.dataTransfer.types.find((t) => t.startsWith('application/x-daybloom-min-'))?.slice(27) ?? 30) || 30;
    const t = snapMs(timeAt(angleOf(x, y)));
    if (drop?.startMs !== t) {
      if (drop) detent();
      drop = { startMs: t, minutes };
    }
  }
  function onDrop(e: DragEvent) {
    const id = e.dataTransfer?.getData('application/x-daybloom-task');
    if (id && drop) {
      e.preventDefault();
      ondroptask?.(id, drop.startMs);
    }
    drop = null;
  }

  // The crown: scroll over a selected block to lengthen or shorten it.
  let wheelAcc = 0;
  function onWheel(e: WheelEvent) {
    if (!interactive || !selectedKey) return;
    const b = visible.find((v) => v.key === selectedKey);
    if (!b || b.readOnly) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    const end = Math.max(b.startMs + STEP, b.endMs + dir * STEP);
    detent();
    onadjust?.(b.key, { startMs: b.startMs, endMs: end });
  }

  const selectedArc = $derived(arcs.find((a) => a.block.key === selectedKey && !a.block.readOnly));

  // Hovering an arc shows its name and times in a small chip just outside the rim.
  let hovered = $state<Block | null>(null);
  // The card opens inward from the rim, so it always stays inside the dial's box.
  const tip = $derived.by(() => {
    if (!hovered || drag) return null;
    const a = arcs.find((x) => x.block.key === hovered!.key);
    if (!a) return null;
    const [x, y] = polar(R.bezelOut + 10, (a.a0 + a.a1) / 2);
    const px = x / 10;
    const py = y / 10;
    return {
      x: px,
      y: py,
      tx: px < 42 ? '0%' : px > 58 ? '-100%' : '-50%',
      ty: py < 42 ? '0%' : py > 58 ? '-100%' : '-50%',
      block: a.block,
    };
  });

  // The block under the hand breathes: a soft halo just outside the rim, in its colour.
  // An HTML layer animating opacity/transform only, so the compositor does all the work.
  const aura = $derived.by(() => {
    if (fineDial && wedge) return null;
    const a = arcs.find((x) => x.current);
    return a ? { a0: a.a0, sweep: Math.max(4, a.a1 - a.a0), color: a.block.color } : null;
  });

  // 24 h dial: a sun or a moon rides the hand.
  const night = $derived.by(() => {
    if (!sleep) return false;
    const m = Math.floor((handTime - atMinutes(isoOf(handTime), 0)) / MINUTE);
    return sleep.sleep > sleep.wake ? m >= sleep.sleep || m < sleep.wake : m >= sleep.sleep && m < sleep.wake;
  });
  const ghost = $derived(
    drag?.mode === 'create' && drag.moved && drag.preview.endMs > drag.preview.startMs
      ? { a0: toDeg(drag.preview.startMs), a1: toDeg(drag.preview.endMs), ms: drag.preview.endMs - drag.preview.startMs }
      : null,
  );
  const dragLabel = $derived.by(() => {
    if (!drag?.moved) return null;
    const p = drag.preview;
    const a = drag.mode === 'move' ? toDeg((p.startMs + p.endMs) / 2) : toDeg(p.endMs);
    return { text: formatDuration(p.endMs - p.startMs), at: polar(R.bezelIn - 44, a) };
  });

  // Seconds bead: placed from the wall clock on every tick (never a free-running CSS
  // animation, which can drift after sleep or throttling). The angle only ever grows,
  // so 59 → 0 steps forward instead of spinning back.
  // Seconds within the current minute only. (A forever-growing angle reached ~10¹⁰°, where the
  // compositor's float maths loses precision and the bead jittered and jumped back.) The bead
  // re-mounts at :00 so it never spins backwards from 354° to 0°.
  const secondsAngle = $derived(Math.floor((now % 60_000) / 1000) * 6);
  const minuteKey = $derived(Math.floor(now / 60_000));
</script>

<div class="dial-wrap" class:compact class:case={withCase} style:--face={finish.face} style:--ink={finish.ink} style:--signal={finish.signal}>
  {#if aura}
    <div
      class="aura"
      class:fast={headsUpKey != null}
      class:still={reduced}
      style:--a0={`${aura.a0}deg`}
      style:--sweep={`${aura.sweep}deg`}
      style:--c={aura.color}
      aria-hidden="true"
    ></div>
  {/if}
  <svg
    bind:this={svg}
    viewBox="0 0 1000 1000"
    class="dial"
    class:dragging={!!drag}
    role="group"
    aria-label={label}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    onwheel={onWheel}
    ondragover={onDragOver}
    ondragleave={() => (drop = null)}
    ondrop={onDrop}
  >
    <defs>
      <filter id="dial-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <radialGradient id="face-depth" cx="50%" cy="42%" r="62%">
        <stop offset="0%" stop-color="white" stop-opacity={finish.dark ? 0.05 : 0.5} />
        <stop offset="100%" stop-color="white" stop-opacity="0" />
      </radialGradient>
      {#if sp}
        <radialGradient id="alef-well" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color={sp.well} />
          <stop offset="100%" stop-color={sp.wellEdge} />
        </radialGradient>
        <linearGradient id="alef-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={sp.shadeTop} />
          <stop offset="55%" stop-color={sp.shadeTop} stop-opacity="0" />
          <stop offset="100%" stop-color={sp.shadeBottom} />
        </linearGradient>
        <linearGradient id="alef-sheen" x1="0" y1="0" x2="0.7" y2="0.9">
          <stop offset="0%" stop-color="white" stop-opacity="0.11" />
          <stop offset="45%" stop-color="white" stop-opacity="0.02" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </linearGradient>
      {/if}
    </defs>

    {#if withCase}
      <circle cx={C} cy={C} r={R.case} fill={finish.rim} />
      <circle cx={C} cy={C} r={R.case - 3} fill="none" stroke="white" stroke-opacity={finish.dark ? 0.08 : 0.5} stroke-width="2" />
    {/if}

    <!-- bezel -->
    <circle cx={C} cy={C} r={R.bezelOut + 8} fill={finish.bezel} />
    {#each sleepSectors as s, i (i)}
      <path d={s.d} fill={mix(finish.bezel, finish.dark ? '#000000' : finish.ink, finish.dark ? 0.35 : 0.08)} />
    {/each}
    {#if elapsedSector}
      <path d={elapsedSector} fill={finish.ink} opacity={finish.dark ? 0.1 : 0.06} />
    {/if}
    <!-- bezel graduations: show through wherever the day is free -->
    {#each preset.numerals as n (n.angle)}
      {@const p = polar((R.bezelIn + R.bezelOut) / 2, n.angle)}
      <circle cx={p[0]} cy={p[1]} r={compact ? 7 : 4.5} fill={finish.track} opacity="0.45" />
    {/each}

    <!-- face -->
    <circle cx={C} cy={C} r={R.bezelIn - 8} fill={finish.face} />
    <circle cx={C} cy={C} r={R.bezelIn - 8} fill="url(#face-depth)" />
    {#if prayerLayer?.band}
      {#key prayerBloom}
        <path d={prayerLayer.band} fill={prayerColor} opacity={finish.dark ? 0.22 : 0.15} class="prayer-band" class:bloom={prayerBloom > 0 && !reduced} />
      {/key}
    {/if}
    <path d={trackPath} stroke={finish.track} stroke-width={compact ? 5 : 3} stroke-linecap="round" />
    {#if prayerLayer}
      <g class="prayers" aria-hidden="true">
        {#if prayerLayer.bead}
          <circle cx={prayerLayer.bead[0]} cy={prayerLayer.bead[1]} r={compact ? 6 : 4} fill={finish.face} stroke={prayerColor} stroke-width="2.5" />
        {/if}
        {#each prayerLayer.marks as m (m.id)}
          <g class="prayer-mark" class:now={m.current}>
            <title>{m.name} · {formatTime(m.at, hour12)}</title>
            {#if m.current}<circle cx={m.pt[0]} cy={m.pt[1]} r={compact ? 17 : 13} fill={prayerColor} opacity="0.2" />{/if}
            <circle cx={m.pt[0]} cy={m.pt[1]} r={compact ? 10 : m.current ? 7.5 : 6} fill={prayerColor} stroke={finish.face} stroke-width={compact ? 4 : 3} />
          </g>
        {/each}
      </g>
    {/if}
    {#if finish.dark}
      <path d={majorPath} stroke={finish.lume} stroke-width={compact ? 7 : 5} stroke-linecap="round" opacity="0.5" />
    {/if}

    {#if sp}
      <!-- Alef's screen: a soft well in the dial's colours (or black glass), set in a slim bezel -->
      <g class="screen" aria-hidden="true">
        <circle cx={C} cy={C} r={screenR + 7} fill={sp.bezel} />
        <circle cx={C} cy={C} r={screenR} fill="url(#alef-well)" />
        <circle cx={C} cy={C} r={screenR - 3} fill="none" stroke="url(#alef-shade)" stroke-width="6" />
        {#if sp.dark && sp.sheen}
          <ellipse cx={C - screenR * 0.18} cy={C - screenR * 0.46} rx={screenR * 0.62} ry={screenR * 0.36} fill="url(#alef-sheen)" transform={`rotate(-18 ${C} ${C})`} />
        {/if}
      </g>
    {/if}

    <!-- time-timer wedge: numerals print over it, like the disc on a Time Timer -->
    {#if wedgeArc}
      <path d={wedgeArc.d} fill={wedgeArc.color} class="wedge" />
      {#if wedgeArc.edge}<path d={wedgeArc.edge} fill={wedgeArc.edgeColor} />{/if}
    {/if}

    {#key presetId}
      <g class="numerals" in:fade={{ duration: reduced ? 0 : 420, delay: reduced ? 0 : 120 }} out:fade={{ duration: reduced ? 0 : 160 }}>
        {#each numerals as n (n.label + n.angle)}
          {@const p = polar(compact ? R.numerals - 22 : R.numerals, n.angle)}
          <text x={p[0]} y={p[1]} class="numeral" fill={finish.ink} font-size={compact ? 64 : 40} dominant-baseline="central" text-anchor="middle">{n.label}</text>
        {/each}
      </g>
    {/key}

    {#each sleepSectors as s, i (i)}
      {@const m = polar((R.bezelIn + R.bezelOut) / 2, s.mid)}
      {#if !compact && s.long}
        <Icon name="moon" size={26} x={m[0] - 13} y={m[1] - 13} color={finish.track} stroke={2} />
      {/if}
    {/each}


    {#if remain}
      <RemainRing {...remain} {now} finish={ringFinish} rIn={ringR.rIn} rOut={ringR.rOut} {reduced} />
    {/if}

    <!-- blocks -->
    {#each arcs.filter((x) => x.lane < MAX_LANES) as a, i (a.block.key)}
      <g class="lift" style:transform={liftOf(a.a0, a.a1)} style:transition-delay={lift ? `${i * 35}ms` : `${i * 20}ms`}>
      <DialArc
        enterDelay={booting ? 120 + i * 55 : 0}
        block={a.block}
        a0={a.a0}
        a1={a.a1}
        lane={a.lane}
        lanes={clusterLanes.get(a.block.key) ?? 1}
        elapsed={a.elapsed}
        selected={selectedKey === a.block.key}
        dimmed={!!selectedKey && selectedKey !== a.block.key}
        headsUp={headsUpKey === a.block.key}
        current={a.current}
        past={a.past}
        handAngle={showNow ? toDeg(handTime) : null}
        {finish}
        {compact}
        {reduced}
        {interactive}
        onpick={onPick}
        onhover={(b) => (hovered = b)}
      />
      </g>
    {/each}

    {#each overflow as o (o.angle)}
      {@const p = polar(R.bezelIn + 6, o.angle)}
      <g class="overflow">
        <title>{o.titles.join(' · ')}</title>
        <circle cx={p[0]} cy={p[1]} r="20" fill={finish.ink} />
        <text x={p[0]} y={p[1] + 1} fill={finish.face} font-size="19" text-anchor="middle" dominant-baseline="central" class="numeral strong">+{o.count}</text>
      </g>
    {/each}

    {#if ghost}
      {@const g = laneRadii(0, 1)}
      <path d={sectorPath(ghost.a0, ghost.a1, g.rIn, g.rOut)} fill={finish.ink} opacity="0.16" />
      <path d={sectorPath(ghost.a0, ghost.a1, g.rIn, g.rOut)} fill="none" stroke={finish.ink} stroke-width="2.5" stroke-dasharray="8 8" opacity="0.55" />
    {/if}

    {#if drop}
      {@const g = laneRadii(0, 1)}
      <path d={sectorPath(toDeg(drop.startMs), toDeg(drop.startMs + drop.minutes * MINUTE), g.rIn, g.rOut)} fill={finish.signal} opacity="0.35" />
      <path d={sectorPath(toDeg(drop.startMs), toDeg(drop.startMs + drop.minutes * MINUTE), g.rIn, g.rOut)} fill="none" stroke={finish.signal} stroke-width="3" stroke-dasharray="8 7" />
    {/if}

    {#if selectedArc && interactive && !drag}
      {@const g = laneRadii(selectedArc.lane, clusterLanes.get(selectedArc.block.key) ?? 1)}
      {@const k = polar((g.rIn + g.rOut) / 2 + 5, selectedArc.a1)}
      <g class="knob" role="slider" aria-label="Drag to change length" aria-valuenow={0} tabindex="-1" onpointerdown={(e) => onKnob(e, selectedArc.block)}>
        <circle cx={k[0]} cy={k[1]} r="30" fill="transparent" />
        <circle cx={k[0]} cy={k[1]} r="15" fill={finish.face} stroke={selectedArc.block.color} stroke-width="6" />
      </g>
    {/if}

    {#if dragLabel}
      <g class="drag-label" transform={`translate(${dragLabel.at[0]} ${dragLabel.at[1]})`}>
        <rect x="-58" y="-26" width="116" height="52" rx="26" fill={finish.ink} />
        <text y="2" fill={finish.face} font-size="28" text-anchor="middle" dominant-baseline="central" class="numeral strong">{dragLabel.text}</text>
      </g>
    {/if}

    {#if worldZones.length}
      <ZoneRings zones={worldZones} span={w} now={minuteNow} {finish} {compact} {reduced} {hour12} interactive={interactive && !drag} />
    {/if}

    <!-- now hand -->
    {#if showNow}
      <!-- The hand lives between the numerals and the bezel; only a hairline crosses the
           inserts, so it never hides a number or a label. The arrow marks the bezel. -->
      <g class="hand" style:transform={`rotate(${handAngle}deg)`}>
        <line x1={C} y1={C - R.trackMajor - 6} x2={C} y2={C - R.bezelIn + 4} stroke={finish.signal} stroke-width={compact ? 12 : 8} stroke-linecap="round" />
        <line x1={C} y1={C - R.bezelIn + 4} x2={C} y2={C - R.bezelOut - 4} stroke={finish.signal} stroke-width={compact ? 4 : 2.5} />
        {#if presetId === 'gmt24' && !compact}
          <circle cx={C} cy={C - R.marker + 2} r="17" fill={finish.signal} />
          <Icon name={night ? 'moon' : 'sun'} size={22} x={C - 11} y={C - R.marker - 9} color="white" stroke={2.4} />
        {:else}
          <path d={`M${C - 16} ${C - R.marker - 4}L${C + 16} ${C - R.marker - 4}L${C} ${C - R.bezelOut - 4}Z`} fill={finish.signal} />
        {/if}
      </g>
    {/if}

    {#if dayCompleteAt}
      {#key dayCompleteAt}
        <path d={arcPath((R.bezelIn + R.bezelOut) / 2, 0.01, 359.9)} pathLength="1" stroke={finish.lume} stroke-width={R.bezelOut - R.bezelIn} fill="none" class="day-sweep" style:transform={`rotate(${handAngle}deg)`} />
      {/key}
    {/if}
  </svg>

  {#if showNow && showSeconds && !reduced}
    <!-- Seconds bead: an HTML layer outside the SVG, stepping once a second, so the
         compositor moves it without repainting the dial. Re-synced every minute. -->
    {#key minuteKey}
      <div class="seconds" style:transform={`rotate(${secondsAngle}deg)`} aria-hidden="true">
        <i style:background={finish.track} class:big={compact}></i>
      </div>
    {/key}
  {/if}

  {#if breathing && breathStart}
    {#key breathStart}
      <BreathOrb startAt={breathStart} color={categoryColor('rest', sp?.dark ?? finish.dark)} dark={sp?.dark ?? finish.dark} ink={sp?.ink ?? finish.ink} {compact} {reduced} />
    {/key}
  {/if}

  {#if tip && !compact}
    {#key tip.block.key}
      <div
        class="tip"
        style:left={`${tip.x}%`}
        style:top={`${tip.y}%`}
        style:--tx={tip.tx}
        style:--ty={tip.ty}
        in:scale={{ start: 0.94, duration: reduced ? 0 : 160, easing: cubicOut }}
        out:fade={{ duration: reduced ? 0 : 90 }}
      >
        <HoverCard block={tip.block} {now} {hour12} />
      </div>
    {/key}
  {/if}

  {#if screen}
    <!-- The screen's edge light, in the feeling's colour (opacity only) -->
    <div class="screen-light" class:soft={!sp?.dark} style:--led={screen.led} style:--r={`${screenR / 10}%`} style:opacity={(0.3 + screen.glow * 0.7) * (sp?.dark ? 1 : 0.7)} aria-hidden="true"></div>
  {/if}

  {#if children}
    <!-- On the small widget, hovering an arc swaps the face to that block's details. -->
    <div class="readout" class:on-screen={!!sp} style:--screen-ink={sp?.ink} style:--screen-ink2={sp?.ink2} style:--screen-chip={sp?.chip} style:--alef-eye={sp?.eye}>
      {#if tip && compact}
        {#key tip.block.key}
          <div class="face-swap" in:fade={{ duration: reduced ? 0 : 140 }}>
            <HoverCard block={tip.block} {now} {hour12} compact />
          </div>
        {/key}
      {:else}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>

<style>
  .dial-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    container-type: inline-size;
  }
  .aura {
    position: absolute;
    inset: -4%;
    border-radius: 50%;
    pointer-events: none;
    background: conic-gradient(from var(--a0), var(--c) 0deg var(--sweep), transparent var(--sweep) 360deg);
    -webkit-mask: radial-gradient(closest-side, transparent 78%, #000 88%, #000 90%, transparent 100%);
    mask: radial-gradient(closest-side, transparent 78%, #000 88%, #000 90%, transparent 100%);
    opacity: 0.3;
    will-change: opacity;
    /* 4 s in · 4 s out: the pace of slow, calm breathing */
    animation: aura 8s ease-in-out infinite;
  }
  .aura.fast {
    animation-duration: 4s;
  }
  .aura.still {
    animation: none;
    opacity: 0.35;
  }
  /* opacity only: the compositor animates it without touching the page */
  @keyframes aura {
    0%,
    100% {
      opacity: 0.12;
    }
    50% {
      opacity: 0.7;
    }
  }
  /* The widget's case. Its shadow stays within ~10px, inside the widget's transparent square
     window: anything further would be cut in a straight line, visible on light desktops. */
  .dial-wrap.case {
    border-radius: 50%;
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.16),
      0 4px 10px -4px rgb(0 0 0 / 0.3);
  }
  .dial {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    overflow: visible;
  }
  .dial.dragging {
    cursor: grabbing;
  }
  .numeral {
    font-family: var(--font-ui);
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    user-select: none;
    pointer-events: none;
  }
  .numeral.strong {
    font-weight: 500;
  }
  .hand {
    transform-origin: 500px 500px;
    transform-box: view-box;
    transition: transform 0.8s var(--ease-out);
    pointer-events: none;
  }
  .seconds {
    position: absolute;
    inset: 0;
    pointer-events: none;
    will-change: transform;
    transition: transform 0.28s var(--ease-out);
  }
  .seconds i {
    position: absolute;
    left: 50%;
    top: 14.2%;
    width: 1%;
    height: 1%;
    margin: -0.5% 0 0 -0.5%;
    border-radius: 50%;
  }
  .seconds i.big {
    width: 1.4%;
    height: 1.4%;
    margin: -0.7% 0 0 -0.7%;
  }
  .wedge {
    opacity: 0.88;
  }
  .knob {
    cursor: ew-resize;
  }
  .knob circle:last-child {
    transition: r 0.15s var(--ease-out);
  }
  .knob:hover circle:last-child {
    r: 18;
  }
  .drag-label {
    pointer-events: none;
  }
  .day-sweep {
    transform-origin: 500px 500px;
    transform-box: view-box;
    stroke-dasharray: 0.3 1.4;
    stroke-dashoffset: 0.3;
    opacity: 0.5;
    mix-blend-mode: plus-lighter;
    pointer-events: none;
    animation: day-sweep 2.4s cubic-bezier(0.45, 0.05, 0.2, 1) forwards;
  }
  @keyframes day-sweep {
    to {
      stroke-dashoffset: -1.1;
      opacity: 0;
    }
  }
  /* Salah: at each adhan the current prayer's band blooms in, once. */
  .prayer-band.bloom {
    transform-origin: 500px 500px;
    animation: prayer-bloom 1400ms var(--ease-out);
  }
  @keyframes prayer-bloom {
    0% {
      opacity: 0;
      transform: scale(0.97);
    }
  }
  .tip {
    position: absolute;
    z-index: 3;
    translate: var(--tx) var(--ty);
    pointer-events: none;
  }
  .face-swap {
    display: grid;
    place-items: center;
    max-width: 100%;
  }
  .lift {
    transition: transform 620ms cubic-bezier(0.34, 1.45, 0.64, 1);
  }
  .screen-light {
    position: absolute;
    left: calc(50% - var(--r));
    top: calc(50% - var(--r));
    width: calc(var(--r) * 2);
    height: calc(var(--r) * 2);
    border-radius: 50%;
    pointer-events: none;
    /* A thin edge light just inside the bezel, like light caught in the glass's rim. */
    background: radial-gradient(closest-side, transparent 90%, color-mix(in srgb, var(--led) 14%, transparent) 96%, color-mix(in srgb, var(--led) 42%, transparent) 99.4%, transparent 100%);
    transition:
      opacity 800ms ease,
      background 800ms ease;
  }
  .readout.on-screen {
    inset: 24%;
  }
  .readout {
    position: absolute;
    inset: 26%;
    display: grid;
    place-items: center;
    text-align: center;
    pointer-events: none;
    color: var(--ink);
  }
  .readout :global(button),
  .readout :global(a) {
    pointer-events: auto;
  }
</style>
