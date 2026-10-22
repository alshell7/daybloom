<script lang="ts">
  // The board (Timeline views addon). By day: Later, Today, Now and Done. By week: Later and the
  // next seven days. Drag a card to another column (or use Shift + an arrow key) and it lands
  // where it belongs: a free time that fits, the backlog, or done. A held card lifts off the
  // board and follows the pointer; the other cards make room for a drop preview that says
  // where it will land; on release it flies into its new place (crossfade + FLIP: transform and
  // opacity only). Nothing runs while you aren't dragging, apart from the minute ticking.
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { crossfade } from 'svelte/transition';
  import { toggleDone } from '../../../lib/actions';
  import { describeDrop, dropFor, landingIndex, neighbour, statusBoard, weekBoard, type Card, type ColumnId, type Drop } from '../../../lib/addons/views/board';
  import { applyDrop, fitFree, spanFree, viewsFile } from '../../../lib/addons/views/views.svelte';
  import { backlog } from '../../../lib/backlog';
  import { blocksInRange, floatingBlocks } from '../../../lib/engine/blocks';
  import { categoryColor } from '../../../lib/engine/categories';
  import { addDays, formatDayShort, formatDuration, formatTime, MINUTE, startOfDayMs } from '../../../lib/engine/time';
  import type { CategoryId, ISODate } from '../../../lib/engine/types';
  import Icon from '../../../lib/Icon.svelte';
  import { detent } from '../../../lib/sound';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { taskFile } from '../../../lib/stores/tasks.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import BoardCard from './BoardCard.svelte';

  const week = $derived(viewsFile.value.board.group === 'week');
  const now = $derived(clock.minute);

  // ── Columns ────────────────────────────────────────────────────────────────
  const status = $derived(week ? null : statusBoard({ date: view.date, today: view.today, now, timed: view.dayBlocks, floating: view.floating, tasks: taskFile.value.tasks }));
  const weekCols = $derived.by(() => {
    if (!week) return null;
    clock.zone;
    const dates = Array.from({ length: 7 }, (_, i) => addDays(view.date, i));
    const all = taskFile.value.tasks;
    const days: Record<ISODate, { timed: ReturnType<typeof blocksInRange>; floating: ReturnType<typeof floatingBlocks> }> = {};
    for (const d of dates) {
      days[d] = {
        timed: blocksInRange(all, view.events, startOfDayMs(d), startOfDayMs(addDays(d, 1)), view.finish.dark),
        floating: floatingBlocks(all, view.events, d, view.finish.dark),
      };
    }
    return weekBoard({ dates, today: view.today, now, days, tasks: all });
  });

  interface Col {
    id: ColumnId;
    cards: Card[];
    date: ISODate | null;
  }
  const cols = $derived.by((): Col[] => {
    if (weekCols) return weekCols.map((c) => ({ ...c, date: c.id.startsWith('day:') ? c.id.slice(4) : null }));
    const s = status!;
    const out: Col[] = [
      { id: 'later', cards: s.later, date: null },
      { id: 'today', cards: s.today, date: view.date },
    ];
    if (view.isToday) out.push({ id: 'now', cards: s.now, date: view.today });
    out.push({ id: 'done', cards: s.done, date: view.date });
    return out;
  });
  const colIds = $derived(cols.map((c) => c.id));
  // Narrow columns get tighter cards (measured: a container query would make each column its
  // own stacking context, and a card flying between columns would pass under its neighbours).
  let boardW = $state(0);
  const compact = $derived(boardW > 0 && (boardW - 12 * (cols.length - 1)) / cols.length < 200);
  const findCard = (id: string) => {
    for (const c of cols) for (const x of c.cards) if (x.id === id) return x;
    return null;
  };

  const dayName = (d: ISODate) => (d === view.today ? 'Today' : d === addDays(view.today, 1) ? 'Tomorrow' : (({ dow, day }) => `${dow} ${day}`)(formatDayShort(d)));
  const sum = (cards: Card[]) => cards.reduce((a, c) => a + (c.locked || c.anytime ? 0 : c.minutes), 0);
  const waking = $derived(((settings.value.sleep > settings.value.wake ? settings.value.sleep - settings.value.wake : settings.value.sleep + 1440 - settings.value.wake) || 1440) as number);

  function head(c: Col): { title: string; icon: string; sub: string } {
    const n = c.cards.length;
    const time = sum(c.cards);
    const t = time ? ` · ${formatDuration(time * MINUTE)}` : '';
    switch (c.id) {
      case 'later':
        return { title: 'Later', icon: 'inbox', sub: n ? `${n}${t}` : '' };
      case 'today':
        return { title: dayName(view.date), icon: 'calendar', sub: n ? `${n}${t}` : '' };
      case 'now':
        return { title: 'Now', icon: 'play', sub: c.cards[0]?.endMs && !c.cards[0].locked ? `until ${formatTime(c.cards[0].endMs, view.hour12)}` : '' };
      case 'done':
        return { title: 'Done', icon: 'circle-check', sub: n ? `${n}${t}` : '' };
      default:
        return { title: dayName(c.date!), icon: 'calendar', sub: time ? formatDuration(time * MINUTE) : '' };
    }
  }

  /** A day's planned time by kind, as a share of the waking day (the week's little spectrum). */
  function spectrum(c: Col): { color: string; w: number }[] {
    const by = new Map<CategoryId, number>();
    for (const x of c.cards) if (!x.anytime && x.minutes) by.set(x.category, (by.get(x.category) ?? 0) + x.minutes);
    return [...by].map(([cat, m]) => ({ color: categoryColor(cat, view.dark), w: Math.min(100, (m / waking) * 100) }));
  }

  function empty(c: Col): string {
    switch (c.id) {
      case 'later':
        return 'Nothing waiting. Drag a block here to keep it for later.';
      case 'today':
        return view.date < view.today ? 'Nothing left on this day.' : 'Drag a task here to plan it.';
      case 'now':
        return view.now.next ? `Free until ${formatTime(view.now.next.startMs, view.hour12)}.` : 'Free right now.';
      case 'done':
        return 'Finished blocks land here.';
      default:
        return 'A free day.';
    }
  }

  // ── Motion ─────────────────────────────────────────────────────────────────
  /** Lands with a small overshoot, then settles. */
  const springy = (t: number) => {
    const s = 1.15;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  };
  const [send, receive] = crossfade({
    duration: (d) => (view.reducedMotion ? 0 : Math.min(560, 260 + Math.sqrt(d) * 9)),
    easing: springy,
    fallback: () => ({
      duration: view.reducedMotion ? 0 : 220,
      easing: cubicOut,
      css: (t) => `opacity: ${t}; transform: scale(${0.94 + 0.06 * t})`,
    }),
  });
  const flipMs = (d: number) => (view.reducedMotion ? 0 : Math.min(420, 180 + Math.sqrt(d) * 10));
  /** A card in flight rides above the other columns (they make no stacking context of their own). */
  const lifted = (t: ReturnType<typeof send>) => () => {
    const c = t();
    const css = c.css;
    return css ? { ...c, css: (a: number, b: number) => `${css(a, b)}; z-index: 5;` } : c;
  };
  const arrive = (node: Element, p: { key: string }) => lifted(receive(node, p));
  const leave = (node: Element, p: { key: string }) => lifted(send(node, p));

  // ── Dragging ───────────────────────────────────────────────────────────────
  interface Held {
    card: Card;
    pointerId: number;
    x0: number;
    y0: number;
    /** Where the card was grabbed, inside it. */
    gx: number;
    gy: number;
    w: number;
    h: number;
    moved: boolean;
    /** The lifted card's top-left, in the layer. */
    x: number;
    y: number;
    over: ColumnId | null;
    /** Where in Later it would go (a reorder). */
    index: number;
    drop: Drop | null;
  }
  let held = $state<Held | null>(null);
  /** What the lifted card shows. It outlives the drag, so the card can still fly home from it. */
  let lift = $state<{ card: Card; w: number; x: number; y: number } | null>(null);
  let root = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  let box = { left: 0, top: 0 };
  let drops = new Map<string, Drop>();
  let last = { x: 0, y: 0 };

  const ctx = () => ({ today: view.today, date: view.date, now: clock.now, fit: fitFree, free: spanFree });

  interface Item {
    id: string;
    fly: string;
    card: Card | null;
  }
  /** A column's cards as shown: the held one lifted out, a drop preview where it would land. */
  function shown(c: Col): Item[] {
    const h = held?.moved ? held : null;
    const cards = h ? c.cards.filter((x) => x.id !== h.card.id) : c.cards;
    const items: Item[] = cards.map((x) => ({ id: x.id, fly: x.fly, card: x }));
    if (h && h.over === c.id && h.drop) {
      const reorder = c.id === 'later' && h.card.col === 'later';
      if (reorder || h.drop.kind !== 'none' || h.drop.why === 'full') {
        const at = reorder ? Math.min(h.index, cards.length) : h.drop.kind === 'none' ? cards.length : landingIndex(cards, h.drop, h.card, h.index);
        items.splice(at, 0, { id: '__drop', fly: '__drop', card: null });
      }
    }
    return items;
  }
  const previewText = $derived(held?.drop ? describeDrop(held.drop, view.today, view.hour12) : '');
  const previewIcon = $derived.by(() => {
    const k = held?.drop?.kind;
    return k === 'tick' || k === 'finish' ? 'check' : k === 'unschedule' || k === 'restore' ? 'inbox' : k === 'start' || (k === 'schedule' && held?.drop && 'now' in held.drop && held.drop.now) ? 'play' : k === 'none' ? 'clock' : k === 'untick' ? 'rotate' : 'calendar-clock';
  });

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    // A press means any earlier one has ended, even if its release never arrived.
    if (held) cancel();
    const t = e.target as HTMLElement;
    if (t.closest('.tick, button, a, input')) return;
    const el = t.closest<HTMLElement>('[data-card]');
    const card = el ? findCard(el.dataset.card!) : null;
    if (!el || !card || card.locked) return;
    const r = el.getBoundingClientRect();
    held = { card, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, w: r.width, h: r.height, moved: false, x: 0, y: 0, over: card.col, index: 0, drop: null };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('keydown', escape, true);
    addEventListener('blur', cancel);
  }

  function move(e: PointerEvent) {
    const h = held;
    if (!h || e.pointerId !== h.pointerId) return;
    if (!h.moved) {
      if (Math.hypot(e.clientX - h.x0, e.clientY - h.y0) < 5) return;
      const b = layer?.getBoundingClientRect();
      box = { left: b?.left ?? 0, top: b?.top ?? 0 };
      drops = new Map();
      lift = { card: h.card, w: h.w, x: 0, y: 0 };
      h.moved = true;
      document.documentElement.classList.add('board-dragging');
    }
    last = { x: e.clientX, y: e.clientY };
    h.x = e.clientX - box.left - h.gx;
    h.y = e.clientY - box.top - h.gy;
    if (lift) {
      lift.x = h.x;
      lift.y = h.y;
    }
    aim(e.clientX, e.clientY);
    edgeScroll(e.clientX, e.clientY);
  }

  /** Which column (and, in Later, which place) is under the pointer, and what dropping there would do. */
  function aim(x: number, y: number) {
    const h = held;
    if (!h) return;
    const colEl = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-col]');
    const over = (colEl?.dataset.col as ColumnId | undefined) ?? null;
    const index = over === 'later' && colEl ? placeIn(colEl, y) : 0;
    if (over === h.over && index === h.index && h.drop) return;
    const changed = over !== h.over;
    h.over = over;
    h.index = index;
    if (!over) return void (h.drop = null);
    if (over === 'later') {
      const ids = cols.find((c) => c.id === 'later')?.cards.map((c) => c.id) ?? [];
      h.drop = dropFor(h.card, over, { ...ctx(), laterIds: ids, index });
    } else {
      if (!drops.has(over)) drops.set(over, dropFor(h.card, over, ctx()));
      h.drop = drops.get(over)!;
    }
    if (changed && h.drop.kind !== 'none') detent();
  }

  /** The place in a column's list under `y`, read off layout positions (steady while cards glide). */
  function placeIn(colEl: HTMLElement, y: number): number {
    const list = colEl.querySelector<HTMLElement>('.cards');
    if (!list || !held) return 0;
    const top = list.getBoundingClientRect().top;
    let slotH = 0;
    let n = 0;
    for (const li of list.children as HTMLCollectionOf<HTMLElement>) {
      if (li.classList.contains('slot')) {
        slotH = li.offsetHeight + 8;
        continue;
      }
      if (li.querySelector(`[data-card="${CSS.escape(held.card.id)}"]`) || li.dataset.leaving) continue;
      const mid = li.offsetTop - slotH + li.offsetHeight / 2;
      if (top + mid < y) n++;
    }
    return n;
  }

  let raf = 0;
  let vx = 0;
  let vy = 0;
  /** Near the board's edge while holding a card: it scrolls that way (a frame loop only then). */
  function edgeScroll(x: number, y: number) {
    if (!root) return;
    const r = root.getBoundingClientRect();
    const edge = 44;
    const speed = (d: number) => Math.round((Math.min(edge, d) / edge) * 16);
    vx = x < r.left + edge ? -speed(r.left + edge - x) : x > r.right - edge ? speed(x - r.right + edge) : 0;
    vy = y < r.top + edge ? -speed(r.top + edge - y) : y > r.bottom - edge ? speed(y - r.bottom + edge) : 0;
    if ((vx || vy) && !raf) raf = requestAnimationFrame(stepScroll);
  }
  function stepScroll() {
    raf = 0;
    if (!held?.moved || !root || (!vx && !vy)) return;
    root.scrollLeft += vx;
    root.scrollTop += vy;
    aim(last.x, last.y);
    raf = requestAnimationFrame(stepScroll);
  }

  function release() {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
    removeEventListener('keydown', escape, true);
    removeEventListener('blur', cancel);
    cancelAnimationFrame(raf);
    raf = 0;
    document.documentElement.classList.remove('board-dragging');
  }

  function up(e: PointerEvent) {
    const h = held;
    if (!h || e.pointerId !== h.pointerId) return;
    release();
    if (!h.moved) {
      held = null;
      return;
    }
    // The click that follows a drag isn't a click on whatever is under it.
    const swallow = (ev: Event) => ev.stopPropagation();
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, true), 0);
    const d = h.drop;
    if (d && d.kind !== 'none') applyDrop(d, { x: e.clientX, y: e.clientY });
    else if (d?.kind === 'none' && d.why === 'full') view.say(`${describeDrop(d, view.today, view.hour12)}. Pick a time in the block, or try another day.`);
    held = null;
  }

  function cancel() {
    release();
    held = null;
  }
  function escape(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !held) return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }

  // ── Cards ──────────────────────────────────────────────────────────────────
  function open(c: Card) {
    if (c.key) {
      view.selected = c.key;
      view.sheet = { kind: 'edit', key: c.key };
    } else if (c.taskId) view.sheet = { kind: 'edit', key: `later:${c.taskId}` };
  }

  function check(c: Card, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (c.key) toggleDone(c.key, at);
    else if (c.taskId && c.done) backlog.restore(c.taskId);
    else if (c.taskId) applyDrop({ kind: 'finish', taskId: c.taskId }, at);
  }

  /** Keep the keyboard on a card after it moved (its id can change: Later → a day). */
  async function refocus(id: string | null, fly: string) {
    await tick();
    const el = (id && root?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)) || root?.querySelector<HTMLElement>(`[data-fly="${CSS.escape(fly)}"]`);
    el?.focus({ preventScroll: false });
  }

  function focusCard(colIdx: number, i: number) {
    const col = cols[colIdx];
    if (!col?.cards.length) return false;
    const c = col.cards[Math.max(0, Math.min(col.cards.length - 1, i))];
    root?.querySelector<HTMLElement>(`[data-card="${CSS.escape(c.id)}"]`)?.focus();
    return true;
  }

  function key(e: KeyboardEvent) {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>('[data-card]');
    const c = el ? findCard(el.dataset.card!) : null;
    if (!el || !c) return;
    const ci = cols.findIndex((x) => x.id === c.col);
    const i = cols[ci]?.cards.findIndex((x) => x.id === c.id) ?? 0;
    if (e.key === 'Enter') open(c);
    else if (e.key === ' ') {
      if (!c.locked) check(c, el);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) {
      if (c.locked) return void e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      // Step past columns that won't take it (a finished block skips Now on its way back).
      let to = neighbour(colIds, c.col, dir);
      let d: Drop | null = null;
      while (to) {
        d = dropFor(c, to, { ...ctx(), laterIds: cols[0].cards.map((x) => x.id), index: 0 });
        if (d.kind !== 'none' || d.why === 'full') break;
        to = neighbour(colIds, to, dir);
      }
      if (d && d.kind !== 'none') {
        const id = applyDrop(d, (() => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })());
        void refocus(id, c.fly);
      } else if (d?.kind === 'none' && d.why === 'full') view.say(describeDrop(d, view.today, view.hour12));
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey && c.col === 'later') {
      const ids = cols[0].cards.map((x) => x.id);
      const d = dropFor(c, 'later', { ...ctx(), laterIds: ids, index: i + (e.key === 'ArrowUp' ? -1 : 1) });
      if (d.kind === 'reorder') {
        applyDrop(d);
        void refocus(c.id, c.fly);
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      focusCard(ci, i + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      for (let j = ci + dir; j >= 0 && j < cols.length; j += dir) if (focusCard(j, i)) break;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  $effect(() => () => {
    release();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="board" class:week class:compact class:holding={held?.moved} bind:this={root} bind:clientWidth={boardW} onpointerdown={down} onkeydown={key}>
  {#each cols as col, ci (col.id)}
    {@const h = head(col)}
    {@const items = shown(col)}
    <section
      class="col"
      class:over={held?.moved && held.over === col.id && held.drop && held.drop.kind !== 'none'}
      class:today={col.date === view.today && col.id !== 'done' && col.id !== 'now'}
      class:now-col={col.id === 'now'}
      data-col={col.id}
      aria-label={h.title}
      style:--i={ci}
    >
      <header class="col-head">
        {#if col.date && col.id.startsWith('day:')}
          <button class="day" class:shown={col.date === view.date} onclick={() => view.setDate(col.date!)} title="Show this day on the dial">{h.title}</button>
        {:else}
          <h3>
            {#if col.id === 'now'}<span class="live-dot" class:on={col.cards.some((c) => !c.locked)} aria-hidden="true"></span>{:else}<Icon name={h.icon} size={14} />{/if}
            {h.title}
          </h3>
        {/if}
        <span class="sub tnum">{h.sub}</span>
        {#if week && col.date}
          <span class="spectrum" aria-hidden="true">{#each spectrum(col) as s, k (k)}<i style:background={s.color} style:width={`${s.w}%`}></i>{/each}</span>
        {/if}
      </header>
      <ol class="cards">
        {#each items as item, k (item.id)}
          <li
            class:slot={!item.card}
            animate:flip={{ duration: flipMs, easing: cubicOut }}
            in:arrive={{ key: item.fly }}
            out:leave={{ key: item.fly }}
          >
            {#if !item.card}
              <div class="drop" class:refuse={held?.drop?.kind === 'none'} style:height={`${held?.h ?? 56}px`}>
                {#if previewText}<span><Icon name={previewIcon} size={13} stroke={2.2} />{previewText}</span>{/if}
              </div>
            {:else}
              {@const c = item.card}
              {#if c.anytime && col.id !== 'done' && !items[k - 1]?.card?.anytime}<span class="group">Anytime</span>{/if}
              <BoardCard card={c} {now} onopen={() => open(c)} />
              {#if !c.locked}
                <button
                  class="tick"
                  class:on={c.done}
                  style:--c={categoryColor(c.category, view.dark)}
                  onclick={(e) => check(c, e.currentTarget)}
                  aria-pressed={c.done}
                  aria-label={c.done ? `Mark ${c.title} not done` : `Mark ${c.title} done`}
                  tabindex="-1"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6 7.4-7.6" /></svg>
                </button>
              {/if}
            {/if}
          </li>
        {/each}
      </ol>
      {#if !items.length}
        <p class="empty">{empty(col)}</p>
      {/if}
    </section>
  {/each}

  <div class="layer" bind:this={layer} aria-hidden="true">
    {#if held?.moved && lift}
      <div class="ghost" style:width={`${lift.w}px`} style:translate={`${lift.x}px ${lift.y}px`} in:receive={{ key: lift.card.fly }} out:send={{ key: lift.card.fly }}>
        <BoardCard card={lift.card} {now} ghost />
      </div>
    {/if}
  </div>
</div>

<style>
  .board {
    --gap: 12px;
    position: relative;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(196px, 1fr);
    gap: var(--gap);
    height: 100%;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 2px 2px var(--s-4);
    scroll-padding: 0 var(--s-2);
    animation: board-in var(--dur-3) var(--ease-out) backwards;
  }
  .board.week {
    grid-auto-columns: minmax(172px, 1fr);
  }
  @keyframes board-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .col {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100%;
    min-width: 0;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--sunken) 42%, var(--surface));
    box-shadow: inset 0 0 0 1px var(--line);
    transition:
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
    animation: col-in var(--dur-3) var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 40ms);
  }
  @keyframes col-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  /* A card held over a column that will take it. */
  .col.over {
    background: color-mix(in srgb, var(--sunken) 70%, var(--surface));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 14%, transparent);
  }
  .col-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--s-2);
    padding: 11px 12px 8px 14px;
    border-radius: var(--r-md) var(--r-md) 0 0;
    background: inherit;
  }
  h3,
  .day {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-2);
  }
  h3 :global(svg) {
    color: var(--ink-3);
    align-self: center;
  }
  .day {
    padding: 2px 8px;
    margin-left: -8px;
    border-radius: var(--r-pill);
    transition: background var(--dur-1) var(--ease-out);
  }
  .day:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .day.shown {
    color: var(--ink);
  }
  .col.today .day {
    color: var(--signal);
  }
  .sub {
    margin-left: auto;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--line-strong);
    align-self: center;
  }
  .live-dot.on {
    background: var(--signal);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--signal) 18%, transparent);
  }
  .spectrum {
    flex-basis: 100%;
    display: flex;
    gap: 1px;
    height: 4px;
    margin-top: 6px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .spectrum i {
    height: 100%;
    transition: width 0.6s var(--ease-out);
  }
  .cards {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    margin: 0;
    padding: 2px 8px 10px;
    list-style: none;
  }
  .cards li {
    position: relative;
  }
  .group {
    display: block;
    margin: 6px 2px 6px 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  /* The drop preview: dashed, provisional, saying where the card will land. */
  .drop {
    display: grid;
    place-items: center;
    min-height: 44px;
    border-radius: 12px;
    border: 1.5px dashed color-mix(in srgb, var(--signal) 60%, transparent);
    background: color-mix(in srgb, var(--signal) 7%, transparent);
    color: var(--ink-2);
    font-size: var(--t-xs);
    text-align: center;
    padding: 0 10px;
  }
  .drop span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    animation: rise var(--dur-2) var(--ease-out);
  }
  .drop span :global(svg) {
    color: var(--signal);
    flex: none;
  }
  .drop.refuse {
    border-color: color-mix(in srgb, var(--ink) 22%, transparent);
    background: color-mix(in srgb, var(--sunken) 60%, transparent);
    color: var(--ink-3);
  }
  .drop.refuse span :global(svg) {
    color: var(--ink-3);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
  }
  .empty {
    position: absolute;
    left: 16px;
    right: 16px;
    top: 52px;
    margin: 0;
    padding: 18px 10px;
    border-radius: 12px;
    border: 1.5px dashed color-mix(in srgb, var(--ink) 12%, transparent);
    color: var(--ink-3);
    font-size: var(--t-xs);
    line-height: 1.45;
    text-align: center;
    pointer-events: none;
  }
  .col.over .empty {
    opacity: 0;
  }
  /* The tick: over the card's corner on hover (it takes no room from the words). */
  .tick {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--c) 65%, var(--line-strong));
    background: var(--raised);
    box-shadow: 0 0 0 4px var(--raised), -10px 0 10px 2px var(--raised);
    display: grid;
    place-items: center;
    opacity: 0;
    transform: scale(0.85);
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle),
      background var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out);
  }
  .cards li:hover .tick,
  .cards li:focus-within .tick {
    opacity: 1;
    transform: none;
  }
  .tick:hover {
    transform: scale(1.1);
  }
  .tick:active {
    transform: scale(0.88);
  }
  .tick svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: white;
    stroke-width: 2.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 20;
    stroke-dashoffset: 20;
    transition: stroke-dashoffset var(--dur-3) var(--ease-out) 80ms;
  }
  .tick:hover svg {
    stroke: var(--c);
    stroke-dashoffset: 0;
    opacity: 0.6;
  }
  .tick.on {
    background: var(--lume);
    border-color: var(--lume);
  }
  .tick.on svg {
    stroke: var(--ink-inverse);
    stroke-dashoffset: 0;
    opacity: 1;
  }
  .board.holding .tick {
    opacity: 0;
  }

  /* The lifted card: above everything, following the pointer (translate, on the compositor). */
  .layer {
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
  }
  .ghost {
    position: absolute;
    left: 0;
    top: 0;
    rotate: -2deg;
    scale: 1.03;
    will-change: translate;
  }
  :global(html.board-dragging),
  :global(html.board-dragging *) {
    cursor: grabbing !important;
    user-select: none !important;
  }
  :global([data-motion='calm']) .ghost {
    rotate: none;
    scale: none;
  }
  :global([data-motion='calm']) .board,
  :global([data-motion='calm']) .col {
    animation: none;
  }

  @media (max-width: 860px) {
    .board {
      height: min(72vh, 640px);
      min-height: 380px;
      scroll-snap-type: x proximity;
    }
    .col {
      scroll-snap-align: start;
    }
  }

  /* A touch screen has no hover to reveal it: it always shows. */
  @media (hover: none) {
    .cards li .tick {
      opacity: 1;
      visibility: visible;
    }
  }
</style>
