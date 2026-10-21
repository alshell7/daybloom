<script lang="ts">
  // The Gantt chart (Timeline views addon): the hours run left to right under a sticky header.
  // One day has a row for each kind of block; 3 days or a week have a row for each day. Bars
  // fill like the rail's capsules (a glass ahead of you, full once its time has passed), the now
  // line steps with the minute, free time shows faintly, and calendar events (clear glass) and
  // salah (soft light) stay put. Drag a bar to move it, its ends to stretch it, or across empty hours
  // to paint a new block, all in 5-minute steps; pinch or Ctrl + scroll zooms. No loops: the
  // only frame loop runs while a drag sits at the chart's edge.
  import { flushSync, tick, untrack } from 'svelte';
  import { CATEGORIES, CATEGORY_BY_ID, categoryColor, inkOn, mix, onColor } from '../../../lib/engine/categories';
  import { blocksInRange } from '../../../lib/engine/blocks';
  import { addDays, DAY, formatDayShort, formatDuration, formatMinutes, formatTime, MINUTE, minutesOfDay, startOfDayMs } from '../../../lib/engine/time';
  import type { Block, ISODate } from '../../../lib/engine/types';
  import { barLabels, clampPxh, DAY_MIN, dragSpan, fitPxh, freeBands, hourStep, LANE, layoutGantt, msAt, ROW_PAD, rowAt, snapMin, sweepSpan, zoomScroll, type Bar, type Grip, type Row } from '../../../lib/addons/views/gantt';
  import { ganttCmd, moveBar, paintBar, viewsFile } from '../../../lib/addons/views/views.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { detent } from '../../../lib/sound';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { taskFile } from '../../../lib/stores/tasks.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  const HEAD = 30;
  const days = $derived(viewsFile.value.gantt.days);
  const dates = $derived(Array.from({ length: days }, (_, i) => addDays(view.date, i)));
  const byKind = $derived(days === 1);
  const blocks = $derived.by(() => {
    if (days === 1) return view.dayBlocks;
    clock.zone;
    return blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(dates[0]), startOfDayMs(addDays(dates[dates.length - 1], 1)), view.finish.dark);
  });
  const lay = $derived(layoutGantt(blocks, dates, byKind, CATEGORIES.map((c) => c.id)));
  const rowById = $derived(new Map(lay.rows.map((r) => [r.id, r])));

  // ── Scale ──────────────────────────────────────────────────────────────────
  let scroller = $state<HTMLDivElement>();
  let viewW = $state(0);
  const labelW = $derived(viewW && viewW < 560 ? 56 : byKind ? 108 : 96);
  const fit = $derived(fitPxh(Math.max(240, viewW - labelW - 24), settings.value.wake, settings.value.sleep));
  /** The scale while a pinch is under way (kept in the file when it ends). */
  let pinch = $state<number | null>(null);
  const pxh = $derived(pinch ?? (viewsFile.value.gantt.pxh || fit));
  const pxm = $derived(pxh / 60);
  const width = $derived(Math.round(DAY_MIN * pxm));
  /** The rows, plus room under a day chart for its free-time words. The box ends there. */
  const bodyH = $derived(lay.height + (byKind ? 30 : 4));
  $effect(() => {
    ganttCmd.pxh = pxh;
  });
  const step = $derived(hourStep(pxh));
  const ticks = $derived(Array.from({ length: Math.floor(24 / step) + 1 }, (_, i) => i * step));
  /** Zoomed in far enough, the half hours get a quiet mark too. */
  const halves = $derived(pxh >= 110 ? Array.from({ length: 24 }, (_, h) => h + 0.5) : []);
  const hourLabel = (h: number) => {
    if (h === 24) return '';
    const t = formatMinutes(h * 60, view.hour12);
    return view.hour12 ? t.replace(':00', '') : t;
  };

  // ── Time ───────────────────────────────────────────────────────────────────
  const todayIdx = $derived(dates.indexOf(view.today));
  const nowMin = $derived(todayIdx >= 0 ? minutesOfDay(clock.minute) : null);
  const todayRow = $derived(todayIdx >= 0 ? lay.rows.find((r) => r.date === view.today && !byKind) ?? null : null);
  const wake = $derived(settings.value.wake);
  const sleep = $derived(settings.value.sleep);
  const night = $derived(sleep > wake ? [{ s: 0, e: wake }, { s: sleep, e: DAY_MIN }] : [{ s: sleep, e: wake }]);
  const free = $derived.by(() => {
    if (byKind) return [{ top: 0, height: bodyH, bands: freeBands(blocks, dates[0], wake, sleep), row: null as Row | null }];
    return lay.rows.map((r) => ({ top: r.top, height: r.height, row: r, bands: freeBands(blocks.filter((b) => b.startMs < startOfDayMs(addDays(r.date, 1)) && b.endMs > startOfDayMs(r.date)), r.date, wake, sleep) }));
  });

  // ── Bars ───────────────────────────────────────────────────────────────────
  const labels = $derived(barLabels(lay.bars, pxm));
  const paints = new Map<string, Record<string, string>>();
  function paint(b: Block): Record<string, string> {
    const dark = view.dark;
    const c = b.kind === 'task' ? categoryColor(b.category, dark) : b.event?.category ? categoryColor(b.event.category, dark) : b.color;
    const k = `${c}|${dark}`;
    let p = paints.get(k);
    if (!p) {
      const soft = mix(c, dark ? '#131a27' : '#ffffff', 0.8);
      const liquid = mix(c, soft, 0.42);
      p = { '--c': c, '--c-soft': soft, '--fg': onColor(c), '--ink-soft': inkOn(soft, c), '--ink-live': inkOn(liquid, c), '--ink-washed': inkOn(mix(c, soft, 0.66), c), '--c-live': liquid };
      paints.set(k, p);
    }
    return p;
  }
  const styleOf = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `${k}:${v}`).join(';');
  const editable = (b: Block) => b.kind === 'task' && !b.readOnly;
  function stateOf(bar: Bar, now: number) {
    const b = bar.block;
    const live = !b.done && b.startMs <= now && now < b.endMs;
    const past = now >= b.endMs;
    return {
      live,
      past,
      missed: past && !b.done && editable(b),
      p: b.done || past ? 1 : live ? Math.min(1, Math.max(0.02, (now - b.startMs) / (b.endMs - b.startMs))) : 0,
    };
  }
  const dayName = (d: ISODate) => (d === view.today ? 'Today' : d === addDays(view.today, 1) ? 'Tomorrow' : (({ dow, day }) => `${dow} ${day}`)(formatDayShort(d)));
  const rowLabel = (r: Row) => (r.category ? CATEGORY_BY_ID[r.category].label : dayName(r.date));
  const planned = (r: Row) => formatDuration(lay.bars.filter((x) => x.row === r.id && x.block.kind === 'task').reduce((a, x) => a + (x.e - x.s), 0) * MINUTE);

  // ── Dragging a bar ─────────────────────────────────────────────────────────
  interface Held {
    bar: Bar;
    grip: Grip;
    pointerId: number;
    x0: number;
    y0: number;
    left0: number;
    moved: boolean;
    s: number;
    e: number;
    date: ISODate;
    top: number;
  }
  let held = $state<Held | null>(null);
  let body = $state<HTMLDivElement>();
  let justDragged = false;
  let settling = $state(false);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  function settle() {
    clearTimeout(settleTimer);
    if (view.reducedMotion) return;
    settling = true;
    settleTimer = setTimeout(() => (settling = false), 420);
  }

  /** Keep the pointer's moves while dragging, even off the element (where the platform allows). */
  function capture(e: PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* no capture: moves still arrive while over it */
    }
  }

  /** A block's own span on a row's day (it may start the night before, or run past midnight). */
  const spanOn = (b: Block, date: ISODate) => {
    const d0 = startOfDayMs(date);
    return { s: Math.round((b.startMs - d0) / MINUTE), e: Math.round((b.endMs - d0) / MINUTE) };
  };

  function barDown(e: PointerEvent, bar: Bar, grip: Grip) {
    if (e.button !== 0 || !editable(bar.block)) return;
    e.stopPropagation();
    capture(e);
    const own = spanOn(bar.block, bar.date);
    held = { bar, grip, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, left0: scroller?.scrollLeft ?? 0, moved: false, s: own.s, e: own.e, date: bar.date, top: bar.top };
  }

  function barMove(e: PointerEvent) {
    const h = held;
    if (!h || e.pointerId !== h.pointerId) return;
    const dx = e.clientX - h.x0 + ((scroller?.scrollLeft ?? 0) - h.left0);
    if (!h.moved && Math.abs(dx) < 4 && Math.abs(e.clientY - h.y0) < 4) return;
    if (!h.moved) {
      h.moved = true;
      document.documentElement.classList.add('gantt-dragging');
    }
    lastPointer = { x: e.clientX, y: e.clientY };
    const own = spanOn(h.bar.block, h.bar.date);
    const next = dragSpan(h.grip, own.s, own.e, dx / pxm);
    let date = h.bar.date;
    let top = h.bar.top;
    // A longer chart: drag up or down onto another day.
    if (h.grip === 'move' && !byKind && body) {
      const r = rowAt(lay.rows, e.clientY - body.getBoundingClientRect().top);
      if (r) {
        date = r.date;
        top = r.id === h.bar.row ? h.bar.top : r.top + ROW_PAD + Math.min(h.bar.lane, r.lanes - 1) * LANE;
      }
    }
    if (next.s !== h.s || next.e !== h.e || date !== h.date) detent();
    h.s = next.s;
    h.e = next.e;
    h.date = date;
    h.top = top;
    view.railPreview = { key: h.bar.key, startMs: msAt(date, next.s), endMs: msAt(date, next.e) };
    edgeScroll(e.clientX);
  }

  function barUp(e: PointerEvent) {
    const h = held;
    if (!h || e.pointerId !== h.pointerId) return;
    stopDrag();
    held = null;
    view.railPreview = null;
    if (!h.moved) return;
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    const own = spanOn(h.bar.block, h.bar.date);
    if (h.s === own.s && h.e === own.e && h.date === h.bar.date) return;
    settle();
    const key = moveBar(h.bar.key, h.date, h.s, h.e);
    if (view.selected === h.bar.key) view.selected = key;
  }

  function barCancel() {
    stopDrag();
    held = null;
    view.railPreview = null;
  }

  function open(b: Block) {
    if (justDragged) return;
    view.selected = b.key;
    view.sheet = { kind: 'edit', key: b.key };
  }

  /** Arrows move a bar 5 minutes, Shift + arrows stretch it, ↑ ↓ move it a day (longer charts). */
  async function barKey(e: KeyboardEvent, bar: Bar) {
    const b = bar.block;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Enter') open(b);
      return;
    }
    if (!editable(b) || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    e.stopPropagation();
    const own = spanOn(b, bar.date);
    let date = bar.date;
    let { s, e: en } = own;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = e.key === 'ArrowRight' ? 5 : -5;
      ({ s, e: en } = dragSpan(e.shiftKey ? 'end' : 'move', own.s, own.e, d));
    } else if (!byKind) {
      const i = dates.indexOf(bar.date) + (e.key === 'ArrowDown' ? 1 : -1);
      if (i < 0 || i >= dates.length) return;
      date = dates[i];
    } else return;
    if (s === own.s && en === own.e && date === bar.date) return;
    detent();
    settle();
    const key = moveBar(bar.key, date, s, en);
    await tick();
    scroller?.querySelector<HTMLElement>(`[data-bar="${CSS.escape(`${key}|${date}`)}"]`)?.focus();
  }

  // ── Painting a new block ───────────────────────────────────────────────────
  let sweep = $state<null | { a: number; b: number; row: Row; pointerId: number }>(null);
  const minAt = (clientX: number) => (body ? (clientX - body.getBoundingClientRect().left) / pxm : 0);
  const rowUnder = (clientY: number) => (body ? rowAt(lay.rows, clientY - body.getBoundingClientRect().top) : null);
  const swept = $derived(sweep ? sweepSpan(sweep.a, sweep.b) : null);

  function bodyDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.bar, .beside')) return;
    const row = rowUnder(e.clientY);
    if (!row) return;
    capture(e);
    const m = minAt(e.clientX);
    sweep = { a: m, b: m, row, pointerId: e.pointerId };
  }
  let lastSwept = '';
  function bodyMove(e: PointerEvent) {
    if (!sweep || e.pointerId !== sweep.pointerId) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    sweep.b = minAt(e.clientX);
    const k = swept ? `${swept.s}-${swept.e}` : '';
    if (k && k !== lastSwept) detent();
    lastSwept = k;
    edgeScroll(e.clientX);
  }
  function bodyUp(e: PointerEvent) {
    if (!sweep || e.pointerId !== sweep.pointerId) return;
    const s = swept;
    const row = sweep.row;
    sweep = null;
    lastSwept = '';
    stopDrag();
    if (s) {
      settle();
      paintBar(msAt(row.date, s.s), msAt(row.date, s.e), row.category);
    } else if (view.sheet?.kind !== 'edit') view.selected = null;
  }
  function bodyDbl(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.bar, .beside')) return;
    const row = rowUnder(e.clientY);
    if (!row) return;
    const s = Math.min(DAY_MIN - 30, snapMin(minAt(e.clientX) - 15));
    paintBar(msAt(row.date, Math.max(0, s)), msAt(row.date, Math.max(0, s) + 30), row.category);
  }

  // ── Edge scrolling while dragging (the only frame loop, and only then) ────
  let raf = 0;
  let vx = 0;
  let lastPointer = { x: 0, y: 0 };
  function edgeScroll(x: number) {
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    const edge = 48;
    const lo = r.left + labelW + edge;
    vx = x < lo ? -Math.round((Math.min(edge, lo - x) / edge) * 18) : x > r.right - edge ? Math.round((Math.min(edge, x - r.right + edge) / edge) * 18) : 0;
    if (vx && !raf) raf = requestAnimationFrame(stepScroll);
  }
  function stepScroll() {
    raf = 0;
    if (!scroller || !vx || (!held?.moved && !sweep)) return;
    scroller.scrollLeft += vx;
    // Re-aim at the same pointer: the hours moved under it.
    const ev = { clientX: lastPointer.x, clientY: lastPointer.y, pointerId: held?.pointerId ?? sweep?.pointerId } as PointerEvent;
    if (held) barMove(ev);
    else if (sweep) bodyMove(ev);
    raf = requestAnimationFrame(stepScroll);
  }
  function stopDrag() {
    cancelAnimationFrame(raf);
    raf = 0;
    vx = 0;
    document.documentElement.classList.remove('gantt-dragging');
  }

  // The time pill while dragging or painting.
  const pill = $derived.by(() => {
    if (held?.moved) {
      const d = held.date !== held.bar.date || !byKind ? `${dayName(held.date)} · ` : '';
      return { s: held.s, e: held.e, top: held.top, text: `${d}${formatTime(msAt(held.date, held.s), view.hour12)} → ${formatTime(msAt(held.date, held.e), view.hour12)} · ${formatDuration((held.e - held.s) * MINUTE)}` };
    }
    if (sweep && swept) return { s: swept.s, e: swept.e, top: sweep.row.top + ROW_PAD, text: `${formatTime(msAt(sweep.row.date, swept.s), view.hour12)} → ${formatTime(msAt(sweep.row.date, swept.e), view.hour12)} · ${formatDuration((swept.e - swept.s) * MINUTE)}` };
    return null;
  });

  // ── Zoom ───────────────────────────────────────────────────────────────────
  /** Zoom to `to` px/h keeping the time under `clientX` still. */
  function zoomAt(clientX: number, to: number) {
    const el = scroller;
    if (!el) return;
    const next = clampPxh(to);
    if (next === pxh) return;
    const viewX = clientX - el.getBoundingClientRect().left;
    const left = zoomScroll(el.scrollLeft, viewX, labelW, pxh, next);
    flushSync(() => (pinch = next));
    el.scrollLeft = left;
  }
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  function commitSoon(ms = 260) {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      if (pinch === null) return;
      selfZoom = true;
      viewsFile.value.gantt.pxh = Math.round(pinch * 10) / 10;
      pinch = null;
    }, ms);
  }
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // A trackpad pinch sends many small steps, a mouse wheel a few big ones: cap each.
        zoomAt(e.clientX, pxh * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.006));
        commitSoon();
        return;
      }
      // A plain wheel over a chart whose rows all fit: scroll the hours instead (not where the
      // page itself scrolls, under the dial on a narrow window).
      if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollHeight <= el.clientHeight + 1 && !matchMedia('(max-width: 860px)').matches) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    // Safari / WKWebView: a trackpad pinch arrives as gesture events.
    let g0 = 0;
    const gs = (e: Event) => {
      e.preventDefault();
      g0 = pxh;
    };
    const gc = (e: Event) => {
      e.preventDefault();
      const g = e as unknown as { scale: number; clientX: number };
      zoomAt(g.clientX, g0 * g.scale);
    };
    const ge = (e: Event) => {
      e.preventDefault();
      commitSoon(0);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', gs);
    el.addEventListener('gesturechange', gc);
    el.addEventListener('gestureend', ge);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', gs);
      el.removeEventListener('gesturechange', gc);
      el.removeEventListener('gestureend', ge);
    };
  });

  // A zoom from the toolbar (or a resize that changes the fit) keeps the middle of the view still.
  let prevPxh = 0;
  let selfZoom = false;
  $effect.pre(() => {
    const p = pxh;
    untrack(() => {
      const el = scroller;
      if (el && prevPxh && p !== prevPxh && pinch === null && !selfZoom) {
        const left = zoomScroll(el.scrollLeft, labelW + (el.clientWidth - labelW) / 2, labelW, prevPxh, p);
        void tick().then(() => (el.scrollLeft = left));
      }
      selfZoom = false;
      prevPxh = p;
    });
  });

  // ── Scroll to now ──────────────────────────────────────────────────────────
  function toNow(smooth: boolean) {
    const el = scroller;
    if (!el) return;
    const m = nowMin ?? wake;
    const left = Math.max(0, m * pxm - (el.clientWidth - labelW) * 0.28);
    const top = todayRow ? Math.max(0, todayRow.top - 8) : 0;
    el.scrollTo({ left, top, behavior: smooth && !view.reducedMotion ? 'smooth' : 'auto' });
  }
  let placed = false;
  $effect(() => {
    if (placed || viewW <= 0) return;
    placed = true;
    untrack(() => toNow(false));
  });
  let jumps = ganttCmd.jump;
  $effect(() => {
    const j = ganttCmd.jump;
    if (j === jumps) return;
    jumps = j;
    untrack(() => toNow(true));
  });

  $effect(() => () => {
    stopDrag();
    clearTimeout(commitTimer);
    clearTimeout(settleTimer);
    view.railPreview = null;
  });
</script>

<div
  class="gantt"
  class:zooming={pinch !== null}
  class:settling
  class:holding={held?.moved || !!sweep}
  class:kinds={byKind}
  bind:this={scroller}
  style:--rows={`${lay.height}px`}
  bind:clientWidth={viewW}
  style:--pxm={`${pxm}px`}
  style:--lw={`${labelW}px`}
  style:--head={`${HEAD}px`}
>
  <div class="grid" style:width={`${labelW + width}px`}>
    <div class="corner"></div>
    <div class="head" aria-hidden="true">
      {#each ticks as h (h)}
        <span class="hour tnum" class:major={h % 6 === 0} class:under={nowMin !== null && Math.abs(h * 60 + 18 / pxm - nowMin) * pxm < 40} style:--m={h * 60}>{hourLabel(h)}</span>
      {/each}
      {#each halves as h (h)}
        <span class="hour half tnum" class:under={nowMin !== null && Math.abs(h * 60 + 18 / pxm - nowMin) * pxm < 40} style:--m={h * 60}>{formatMinutes(h * 60, view.hour12)}</span>
      {/each}
      {#if nowMin !== null}
        <span class="now-pill tnum" style:--m={nowMin}>{formatTime(clock.minute, view.hour12)}</span>
      {/if}
    </div>

    <div class="labels" style:height={`${bodyH}px`}>
      {#each lay.rows as r (r.id)}
        <div class="label" class:empty={r.empty} class:today={r.date === view.today && !r.category} style:top={`${r.top}px`} style:height={`${r.height}px`}>
          {#if r.category}
            <span class="kind" style:--c={categoryColor(r.category, view.dark)}><Icon name={CATEGORY_BY_ID[r.category].icon} size={13} stroke={2} /></span>
          {/if}
          <span class="name">
            <span class="n">{rowLabel(r)}</span>
            {#if !r.category && !r.empty && labelW > 60}<span class="sum tnum">{planned(r)}</span>{/if}
          </span>
        </div>
      {/each}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="body"
      class:fine={halves.length > 0}
      bind:this={body}
      style:height={`${bodyH}px`}
      onpointerdown={bodyDown}
      onpointermove={bodyMove}
      onpointerup={bodyUp}
      onpointercancel={() => ((sweep = null), stopDrag())}
      ondblclick={bodyDbl}
    >
      {#each night as n, i (i)}
        <span class="night" style:--s={n.s} style:--e={n.e}></span>
      {/each}
      {#each lay.rows as r (r.id)}
        <span class="row-line" class:today={r.date === view.today && !r.category} style:top={`${r.top}px`} style:height={`${r.height}px`}></span>
      {/each}
      {#if nowMin !== null}
        <!-- Time already behind you: a faint film, like the dial's. -->
        <span class="behind" style:--e={nowMin} style:top={`${todayRow ? todayRow.top : 0}px`} style:height={`${todayRow ? todayRow.height : bodyH}px`}></span>
      {/if}
      {#each free as f, i (i)}
        {#each f.bands as g (g.s)}
          <span class="free" style:--s={g.s} style:--e={g.e} style:top={`${f.top}px`} style:height={`${f.height}px`}>
            {#if (g.e - g.s) * pxm >= 58}<span class="free-label tnum">{formatDuration((g.e - g.s) * MINUTE)} free</span>{/if}
          </span>
        {/each}
      {/each}

      {#each lay.bars as bar (bar.id)}
        {@const b = bar.block}
        {@const st = stateOf(bar, clock.minute)}
        {@const lab = labels.get(bar.id)}
        {@const mine = held?.moved && held.bar.id === bar.id ? held : null}
        <div
          class="bar"
          class:live={st.live}
          class:past={st.past}
          class:missed={st.missed}
          class:done={b.done}
          class:locked={!editable(b)}
          class:event={b.kind === 'event'}
          class:held={!!mine}
          class:selected={view.selected === b.key}
          class:clip-s={bar.clipS}
          class:clip-e={bar.clipE}
          class:narrow={(bar.e - bar.s) * pxm < 36}
          style={styleOf(paint(b))}
          style:--s={mine ? mine.s : bar.s}
          style:--e={mine ? mine.e : bar.e}
          style:--y={`${mine ? mine.top : bar.top}px`}
          style:--p={st.p}
          data-bar={bar.id}
          data-genie={`block:${b.key}`}
          role="button"
          tabindex="0"
          aria-label={`${b.title || 'Untitled block'}, ${formatTime(b.startMs, view.hour12)} to ${formatTime(b.endMs, view.hour12)}${editable(b) ? '' : ', read-only'}`}
          title={`${b.title || 'Untitled block'} · ${formatTime(b.startMs, view.hour12)}–${formatTime(b.endMs, view.hour12)} · ${formatDuration(b.endMs - b.startMs)}${editable(b) ? '' : ' · read-only'}`}
          onpointerdown={(e) => barDown(e, bar, 'move')}
          onpointermove={barMove}
          onpointerup={barUp}
          onpointercancel={barCancel}
          onlostpointercapture={(e) => held?.pointerId === e.pointerId && barCancel()}
          onclick={() => open(b)}
          onkeydown={(e) => barKey(e, bar)}
        >
          <span class="fill" aria-hidden="true"></span>
          {#if lab?.fit !== 'none'}
            <span class="ico" data-genie-anchor><Icon name={b.done ? 'check' : b.icon} size={14} stroke={2.1} /></span>
          {/if}
          {#if lab?.fit === 'full'}
            <span class="words"><span class="t">{b.title || 'Untitled block'}</span>{#if (bar.e - bar.s) * pxm > 150}<span class="tm tnum">{formatTime(b.startMs, view.hour12)}</span>{/if}</span>
          {/if}
          {#if !editable(b) && (bar.e - bar.s) * pxm > 110}<span class="lock"><Icon name="lock" size={11} stroke={2.2} /></span>{/if}
          {#if editable(b)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="grip l" onpointerdown={(e) => barDown(e, bar, 'start')}></span>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="grip r" onpointerdown={(e) => barDown(e, bar, 'end')}></span>
          {/if}
        </div>
        {#if lab?.out && !mine}
          <span class="beside" class:dim={st.past || b.done} style:--x={bar.e} style:top={`${bar.top}px`} style:max-width={`${lab.out}px`}>{b.title || 'Untitled block'}</span>
        {/if}
      {/each}

      {#if sweep && swept}
        <span class="ghost" style:--s={swept.s} style:--e={swept.e} style:top={`${sweep.row.top + ROW_PAD}px`}></span>
      {/if}
      {#if nowMin !== null}
        <span class="now-line" style:--m={nowMin} style:top={`${todayRow ? todayRow.top : 0}px`} style:height={`${todayRow ? todayRow.height : bodyH}px`} aria-hidden="true"></span>
      {/if}
      {#if pill}
        <span class="pill tnum" class:below={pill.top < 34} style:--s={pill.s} style:top={`${pill.top}px`}>{pill.text}</span>
      {/if}
      {#if !lay.bars.length}
        <p class="hint">Drag across the hours to plan a block.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .gantt {
    position: relative;
    align-self: start;
    max-height: 100%;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
    animation: chart-in var(--dur-3) var(--ease-out) backwards;
  }
  @keyframes chart-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .grid {
    position: relative;
    display: grid;
    grid-template-columns: var(--lw) 1fr;
    grid-template-rows: var(--head) auto;
  }

  /* ── The sticky edges: the hours along the top, the rows down the left ── */
  .corner {
    position: sticky;
    left: 0;
    top: 0;
    z-index: 6;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
  }
  .head {
    position: sticky;
    top: 0;
    z-index: 5;
    height: var(--head);
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .hour {
    position: absolute;
    top: 9px;
    left: 0;
    translate: calc(var(--m) * var(--pxm) + 4px) 0;
    font-size: 10.5px;
    color: var(--ink-3);
    white-space: nowrap;
    pointer-events: none;
  }
  .hour.major {
    color: var(--ink-2);
  }
  .hour.half {
    opacity: 0.6;
  }
  /* The now pill sits over the hour it is in. */
  .hour.under {
    opacity: 0;
  }
  .now-pill {
    position: absolute;
    top: 6px;
    left: 0;
    translate: calc(var(--m) * var(--pxm) - 50%) 0;
    padding: 1px 7px;
    border-radius: var(--r-pill);
    background: var(--signal);
    color: white;
    font-size: 10.5px;
    font-weight: 600;
    pointer-events: none;
  }
  .labels {
    position: sticky;
    left: 0;
    z-index: 4;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }
  .label {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 12px;
    border-bottom: 1px solid var(--line);
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .label.empty {
    color: var(--ink-3);
  }
  .label.empty .kind {
    opacity: 0.55;
  }
  .label.today .n {
    color: var(--signal);
    font-weight: 500;
  }
  .kind {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .name {
    display: grid;
    min-width: 0;
  }
  .n {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .sum {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  /* ── The hours ── */
  .body {
    position: relative;
    cursor: crosshair;
    touch-action: none;
    /* An hairline every hour. */
    background: repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px calc(var(--pxm) * 60));
  }
  .body.fine {
    background:
      repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px calc(var(--pxm) * 60)),
      repeating-linear-gradient(90deg, transparent 0 calc(var(--pxm) * 30), color-mix(in srgb, var(--ink) 4%, transparent) calc(var(--pxm) * 30) calc(var(--pxm) * 30 + 1px), transparent calc(var(--pxm) * 30 + 1px) calc(var(--pxm) * 60));
  }
  .night,
  .free,
  .behind,
  .ghost,
  .now-line,
  .pill {
    position: absolute;
    left: 0;
  }
  .night {
    top: 0;
    bottom: 0;
    translate: calc(var(--s) * var(--pxm)) 0;
    width: calc((var(--e) - var(--s)) * var(--pxm));
    background: color-mix(in srgb, var(--sunken) 55%, transparent);
    pointer-events: none;
  }
  .row-line {
    position: absolute;
    left: 0;
    right: 0;
    border-bottom: 1px solid var(--line);
    pointer-events: none;
  }
  .row-line.today {
    background: color-mix(in srgb, var(--raised) 55%, transparent);
  }
  .behind {
    width: calc(var(--e) * var(--pxm));
    background: color-mix(in srgb, var(--ink) 3.5%, transparent);
    pointer-events: none;
  }
  /* Free time stays bare: a faint dashed bracket and how long it is. */
  .free {
    translate: calc(var(--s) * var(--pxm)) 0;
    width: calc((var(--e) - var(--s)) * var(--pxm));
    border-inline: 1px dashed color-mix(in srgb, var(--ink) 8%, transparent);
    pointer-events: none;
  }
  .free-label {
    position: absolute;
    left: 50%;
    bottom: 5px;
    translate: -50% 0;
    font-size: 10.5px;
    color: var(--ink-3);
    opacity: 0.85;
    white-space: nowrap;
  }
  /* A day chart's free time runs through every row: its words sit just under the last one. */
  .kinds .free-label {
    top: calc(var(--rows) + 8px);
    bottom: auto;
  }
  .now-line {
    width: 2px;
    margin-left: -1px;
    translate: calc(var(--m) * var(--pxm)) 0;
    background: var(--signal);
    border-radius: 1px;
    z-index: 3;
    pointer-events: none;
  }
  .now-line::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--signal);
  }
  .hint {
    position: absolute;
    left: 50%;
    top: 40%;
    translate: -50% 0;
    margin: 0;
    padding: 8px 14px;
    border-radius: var(--r-pill);
    background: var(--raised);
    box-shadow: var(--shadow-1);
    color: var(--ink-2);
    font-size: var(--t-sm);
    pointer-events: none;
    white-space: nowrap;
  }

  /* ── Bars: a glass ahead of you that fills as its time is spent ── */
  .bar {
    --h: 28px;
    position: absolute;
    left: 0;
    top: 0;
    height: var(--h);
    margin-top: calc((34px - var(--h)) / 2);
    translate: calc(var(--s) * var(--pxm)) var(--y);
    width: max(6px, calc((var(--e) - var(--s)) * var(--pxm) - 2px));
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-radius: calc(var(--h) / 2);
    background: var(--c-soft);
    color: var(--ink-soft);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    z-index: 2;
    transition:
      box-shadow var(--dur-2) var(--ease-out),
      scale var(--dur-2) var(--ease-settle);
  }
  .settling .bar {
    transition:
      translate var(--dur-3) var(--ease-settle),
      width var(--dur-3) var(--ease-settle),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .zooming .bar {
    transition: none;
  }
  .bar:hover {
    box-shadow:
      inset 0 0 0 1.5px color-mix(in srgb, var(--c) 75%, transparent),
      var(--shadow-2);
    z-index: 3;
  }
  .bar:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .bar.selected {
    box-shadow:
      inset 0 0 0 1.5px var(--c),
      0 0 0 2px var(--surface),
      0 0 0 3.5px color-mix(in srgb, var(--c) 70%, transparent);
    z-index: 3;
  }
  .bar.held {
    z-index: 7;
    cursor: grabbing;
    scale: 1.03;
    transition: scale var(--dur-2) var(--ease-settle);
    box-shadow:
      inset 0 0 0 1.5px var(--c),
      var(--shadow-3);
  }
  .clip-s {
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }
  .clip-e {
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
  }
  .fill {
    position: absolute;
    inset: 0;
    background: var(--c);
    transform-origin: left;
    transform: scaleX(var(--p));
    transition: transform 0.9s var(--ease-out);
    pointer-events: none;
  }
  .ico,
  .words,
  .lock {
    position: relative;
    z-index: 1;
  }
  .ico {
    flex: none;
    display: grid;
  }
  .words {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1;
  }
  .t {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-read);
  }
  .tm {
    flex: none;
    font-size: 10.5px;
    font-weight: 400;
    opacity: 0.8;
  }
  .lock {
    margin-left: auto;
    flex: none;
    display: grid;
    opacity: 0.8;
  }
  /* Running: the liquid rises from the left up to now. */
  .live {
    color: var(--ink-live);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c) 45%, transparent);
  }
  .live .fill {
    background: var(--c-live);
  }
  /* Its time has passed: full. Done: full, with the lume ring. */
  .past,
  .done {
    color: var(--fg);
  }
  .done {
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--lume) 80%, transparent),
      0 0 0 2px color-mix(in srgb, var(--lume) 16%, transparent);
  }
  /* Went by without a tick: washed and dashed, never red. */
  .missed {
    color: var(--ink-washed);
    box-shadow: none;
  }
  /* Drawn over the fill (an outline would sit under it). */
  .missed::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    border: 1.5px dashed color-mix(in srgb, var(--c) 70%, transparent);
    pointer-events: none;
  }
  .missed .fill {
    background: color-mix(in srgb, var(--c) 34%, var(--c-soft));
  }
  /* From a calendar: clear glass with one crisp edge, read-only. As its time passes it fills
     only with a light wash, never solid colour like your own bars. */
  .locked {
    cursor: default;
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--c) 8%, var(--surface));
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  .locked .fill {
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }
  /* Salah (its key is `cal:salah:…`): soft light, brightest where its time begins, no edge. */
  .locked[data-genie^='block:cal:salah:'] {
    background:
      radial-gradient(ellipse 80% 120% at 14% 50%, color-mix(in srgb, var(--c) 44%, transparent), color-mix(in srgb, var(--c) 10%, transparent)),
      var(--surface);
    box-shadow: none;
  }
  .locked[data-genie^='block:cal:salah:'] .fill {
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .locked.done {
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--lume) 80%, transparent),
      0 0 0 2px color-mix(in srgb, var(--lume) 16%, transparent);
  }
  .locked.past {
    color: var(--ink-soft);
  }
  .locked .t {
    font-weight: 400;
  }
  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 9px;
    z-index: 2;
    cursor: ew-resize;
  }
  .grip.l {
    left: 0;
  }
  .grip.r {
    right: 0;
  }
  /* A short bar keeps most of itself for moving: only its end stretches. */
  .narrow .grip.l {
    display: none;
  }
  .narrow .grip.r {
    width: 6px;
  }
  .narrow .grip.r::after {
    right: 2px;
  }
  .grip::after {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 1px;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .grip.l::after {
    left: 3px;
  }
  .grip.r::after {
    right: 3px;
  }
  .bar:hover .grip::after,
  .bar.held .grip::after {
    opacity: 0.5;
  }
  .beside {
    position: absolute;
    left: 0;
    height: 34px;
    line-height: 34px;
    translate: calc(var(--x) * var(--pxm) + 6px) 0;
    font-size: 12px;
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 1;
  }
  .beside.dim {
    color: var(--ink-3);
  }

  /* Painting a new block: the same ghost the dial sweeps. */
  .ghost {
    height: 28px;
    margin-top: 3px;
    translate: calc(var(--s) * var(--pxm)) 0;
    width: calc((var(--e) - var(--s)) * var(--pxm));
    border-radius: 14px;
    background: color-mix(in srgb, var(--ink) 16%, transparent);
    outline: 1.5px dashed color-mix(in srgb, var(--ink) 55%, transparent);
    outline-offset: -1.5px;
    pointer-events: none;
    z-index: 6;
  }
  .pill {
    translate: calc(var(--s) * var(--pxm)) -30px;
    padding: 3px 10px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: var(--t-xs);
    font-weight: 500;
    white-space: nowrap;
    box-shadow: var(--shadow-2);
    pointer-events: none;
    z-index: 8;
    animation: rise 0.2s var(--ease-out);
  }
  .pill.below {
    translate: calc(var(--s) * var(--pxm)) 38px;
  }
  @keyframes rise {
    from {
      opacity: 0;
    }
  }
  .holding {
    scroll-behavior: auto;
  }
  :global(html.gantt-dragging),
  :global(html.gantt-dragging *) {
    user-select: none !important;
  }
  :global([data-motion='calm']) .gantt {
    animation: none;
  }

  @media (max-width: 860px) {
    .gantt {
      max-height: min(70vh, 620px);
    }
  }
</style>
