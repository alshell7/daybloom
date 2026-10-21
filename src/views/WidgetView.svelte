<script lang="ts">
  // The desktop widget: the dial in its own small, frameless, see-through window (Alef's face in
  // the middle when that addon is on). Drag it to move it, double-click it to open the planner,
  // hover it for a few quiet tools. A long block title glides along its line in the dial; a tap
  // on the title, or a reply from Alef, opens a wing beside the dial with the words in full
  // (components/widget). The wing needs room, so the window grows sideways while it's out and
  // shrinks back after, keeping the dial exactly where it is on the screen (wingWindow.ts).
  import { tick, untrack } from 'svelte';
  import { hidingNames, shownTitle } from '../lib/privacy';
  import Dial from '../lib/dial/Dial.svelte';
  import Readout from '../lib/dial/Readout.svelte';
  import { mix } from '../lib/engine/categories';
  import Icon from '../lib/Icon.svelte';
  import { platform } from '../lib/platform';
  import { PRESET_ORDER, PRESETS, resolveFinish, type FinishId } from '../lib/presets';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { timer } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { nudges } from '../lib/nudges.svelte';
  import { blocksInRange } from '../lib/engine/blocks';
  import { addDays, formatDuration, formatTime, startOfDayMs } from '../lib/engine/time';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { isOn } from '../lib/addons/registry';
  import { prayerMarks, waqt } from '../lib/addons/waqt/waqt.svelte';
  import AlefFace from '../components/addons/alef/AlefFace.svelte';
  import AlefPosture from '../components/addons/alef/AlefPosture.svelte';
  import { alef, alefFile, readingMs } from '../lib/addons/alef/alef.svelte';
  import { ACTS } from '../lib/addons/alef/behaviors';
  import type { Offer } from '../lib/addons/alef/coach';
  import { gesture, type Sample } from '../lib/addons/alef/pet';
  import WidgetTalk from '../components/addons/alef/WidgetTalk.svelte';
  import { voice } from '../lib/voice/voice.svelte';
  import AlarmPip from '../components/AlarmPip.svelte';
  import Wing from '../components/widget/Wing.svelte';
  import TitleCard, { type TitleInfo } from '../components/widget/TitleCard.svelte';
  import AlefReply from '../components/widget/AlefReply.svelte';
  import { clamp, GAP, growFor, MARGIN, maxHeight, pickSide, widthFor, WIDTH_MAX, WIDTH_MIN, wingPalette, type Circle, type Side } from '../components/widget/wing';
  import { growWindow, leftGrown, restoreWindow, roomBeside, shrinkWindow, type Grown } from '../components/widget/wingWindow';

  const alefOn = $derived(isOn('alef') && alefFile.ready && alefFile.value.settings.inWidget);

  // Alef's face on the widget answers touch: a stroke over it is petting, a wiggle tickles, a
  // click is a poke. The planner window decides how Alef feels; the widget shows it.
  let dialEl = $state<HTMLDivElement>();
  let strokes: Sample[] = [];
  function faceAt(e: MouseEvent): { x: number; y: number } | null {
    if (!dialEl) return null;
    const r = dialEl.getBoundingClientRect();
    const size = r.width * 0.42;
    const x = (e.clientX - (r.left + r.width / 2 - size / 2)) / size;
    const y = (e.clientY - (r.top + r.height / 2 - size / 2)) / size;
    return Math.hypot(x - 0.5, y - 0.5) <= 0.5 ? { x, y } : null;
  }
  function onHover(e: PointerEvent) {
    if (!alefOn || e.buttons) return;
    const p = faceAt(e);
    if (!p) {
      strokes = [];
      return;
    }
    const now = performance.now();
    strokes.push({ ...p, t: now });
    if (strokes.length > 60) strokes.splice(0, strokes.length - 60);
    const g = gesture(strokes, now);
    if (g) {
      strokes = [];
      void platform.broadcast('alef-touch', { kind: g });
    }
  }
  // Talking to Alef here: the chat button, or click the widget and just type; hold Space (or
  // the mic) to speak.
  let talk = $state<{ start: string } | null>(null);
  function openTalk(start = '') {
    if (alefOn) talk = { start };
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && what) {
      hide();
      return;
    }
    if (!alefOn || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea');
    if (!talk && !typing && e.key.length === 1 && e.key !== ' ') {
      e.preventDefault();
      openTalk(e.key);
    } else if (e.key === ' ' && !typing) {
      e.preventDefault();
      if (!e.repeat) {
        if (!talk) openTalk();
        voice.press('alef');
      }
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.key === ' ' && !(e.target as HTMLElement)?.closest?.('input, textarea')) voice.release();
  }

  function onTap(e: MouseEvent) {
    // A click beside the wing (not a drag) puts it away.
    if (what && !(e.target as HTMLElement).closest('.wing, .tools, .talk') && !moved(e)) hide();
    if (alefOn && e.detail === 1 && faceAt(e)) void platform.broadcast('alef-touch', { kind: 'poke' });
  }

  // The desktop object: a watch on your wallpaper. Drag to move, double-click to open
  // the planner, hover for a few quiet controls.
  const w = $derived(settings.value.widget);
  // The planner's face and finish unless the widget has its own: the two dials agree.
  const presetId = $derived(w.own ? w.preset : settings.value.preset);
  const finish = $derived(w.finish === 'auto' ? view.finish : resolveFinish(w.finish as FinishId, view.theme));
  const timed = $derived(presetId === 'timer60' || presetId === 'chrono');
  const ts = $derived(timer.active ? timer.status(clock.now) : null);

  // Block colours for this dial's own light or dark finish.
  const dayPool = $derived(
    finish.dark === view.finish.dark ? view.pool : blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(addDays(view.today, -1)), startOfDayMs(addDays(view.today, 2)), finish.dark),
  );
  const rawBlocks = $derived(timed && timer.active ? timer.blocks(clock.minute, finish.dark) : dayPool);
  // The widget always shows today, also after midnight.
  $effect(() => {
    if (view.date !== view.today) view.date = view.today;
  });
  // Privacy mode can swap names for categories on this shared surface.
  const blocks = $derived(hidingNames() ? rawBlocks.map((b) => ({ ...b, title: shownTitle(b.title, b.category) })) : rawBlocks);
  const nowState = $derived.by(() => {
    const st = view.now;
    if (!hidingNames()) return st;
    const hide = <T extends { title: string; category: import('../lib/engine/types').CategoryId } | null>(b: T): T => (b ? { ...b, title: shownTitle(b.title, b.category) } : b);
    return { ...st, current: hide(st.current), next: hide(st.next) };
  });
  const wedge = $derived.by(() => {
    if (!timed) return null;
    if (ts && !ts.finished) {
      const segs = timer.blocks(clock.minute, finish.dark);
      return { key: `timer:${ts.index}`, startMs: clock.now, endMs: clock.now + ts.remainingMs, color: segs[ts.index]?.color ?? finish.signal };
    }
    const c = view.now.current;
    if (c) return { key: c.key, startMs: c.startMs, endMs: c.endMs, color: c.color };
    const n = view.now.next;
    if (n && n.startMs - clock.now <= 60 * 60_000) return { key: null, startMs: clock.now, endMs: n.startMs, color: mix(finish.track, finish.face, 0.62), edgeColor: n.color };
    return null;
  });
  const readoutTimer = $derived(
    timed && ts && !ts.finished && timer.active
      ? { label: ts.segment.label, remainingMs: ts.remainingMs, paused: ts.paused, index: ts.index, count: Math.ceil(timer.active.segments.length / (timer.active.kind === 'cycles' ? 2 : 1)), kind: timer.active.kind, segment: ts.segment.kind }
      : null,
  );

  /** Its own face from here on (Settings › Screen › Widget can make it follow again). */
  function cyclePreset() {
    const i = PRESET_ORDER.indexOf(presetId);
    settings.value.widget.preset = PRESET_ORDER[(i + 1) % PRESET_ORDER.length];
    settings.value.widget.own = true;
  }

  async function toggleLayer() {
    const next = w.layer === 'top' ? 'desktop' : 'top';
    settings.value.widget.layer = next;
    await platform.setWidgetLayer(next);
  }

  const SIZES = [200, 280, 380];
  async function cycleSize() {
    if (!platform.isNative) return;
    // Sizes count from the dial's own square: the wing goes in first.
    await putAway();
    const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const cur = (await win.innerSize()).toLogical(await win.scaleFactor()).width;
    const next = SIZES.find((s) => s > cur + 10) ?? SIZES[0];
    await win.setSize(new LogicalSize(next, next));
  }

  // Windows' native move loop swallows the mouse-up, so a drag started on press would eat every
  // click (and the double-click that opens the planner). Off macOS the drag waits until the
  // pointer has really moved; macOS keeps dragging from the press.
  const dragOnMove = platform.os !== 'mac';
  let press: { x: number; y: number } | null = null;
  /** Where the last press was, to tell a click from the end of a drag. */
  let pressAt = { x: 0, y: 0 };
  const moved = (e: MouseEvent) => Math.hypot(e.screenX - pressAt.x, e.screenY - pressAt.y) >= 4;

  function onDown(e: PointerEvent) {
    pressAt = { x: e.screenX, y: e.screenY };
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tools, .talk, .wing button, .wing .flow')) return;
    if (dragOnMove) press = { x: e.screenX, y: e.screenY };
    else platform.startDrag();
  }

  function onMove(e: PointerEvent) {
    if (!press) return;
    if (!(e.buttons & 1)) {
      press = null;
    } else if (Math.hypot(e.screenX - press.x, e.screenY - press.y) >= 4) {
      press = null;
      platform.startDrag();
    }
  }

  /** Double-click: the planner, or straight back into the focus view while a session runs. */
  async function openMain() {
    hide();
    await platform.showMain();
    if (timer.active) await platform.trayAction('focus-now');
  }

  async function hideWidget() {
    await putAway();
    await platform.hideSelf();
  }

  // ---- the wing ---------------------------------------------------------------------------

  const wc = $derived(w.wing);
  const rm = $derived(view.reducedMotion);
  /** Alef's replies open in the wing (else in the bubble over the dial). */
  const wingReplies = $derived(alefOn && wc.replies);

  /** What the wing shows (null: it's away). */
  let what = $state<{ kind: 'title' | 'alef' } | null>(null);
  /** The wing is out, beside the dial (the window has room for it). */
  let open = $state(false);
  let side = $state<Side>('right');
  let wingW = $state(260);
  let circle = $state<Circle | null>(null);
  let job: Promise<void> = Promise.resolve();
  /** One window change at a time, in order. */
  function queue(fn: () => Promise<void>): Promise<void> {
    job = job.then(fn).catch(() => {});
    return job;
  }

  /**
   * The window, grown for the wing: the dial's square keeps its own size (`baseW` × `baseH`),
   * pinned to the side away from the wing. A window left grown last time starts that way.
   */
  type GrownState = { g: Grown | null; pin: Side; baseW: number; baseH: number };
  const stale = platform.isNative ? leftGrown() : null;
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  let grown = $state<GrownState | null>(stale ? { g: stale, pin: stale.side === 'left' ? 'right' : 'left', baseW: stale.w / dpr, baseH: stale.h / dpr } : null);
  if (stale)
    void queue(async () => {
      await restoreWindow(stale, () => grown && (grown.pin = 'left'));
      grown = null;
    });

  function measureCircle(): Circle | null {
    if (!dialEl) return null;
    const r = dialEl.getBoundingClientRect();
    // The case edge: 497 of the dial's 500 units, inside the 12px room for its shadow.
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: ((r.width - 24) / 2) * (497 / 500) };
  }

  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Bring the window and the wing in line with `what`. */
  async function sync(): Promise<void> {
    if (what && !open) {
      const c = measureCircle();
      if (!c) return;
      const want = clamp(wc.width, WIDTH_MIN, WIDTH_MAX);
      if (platform.isNative && !grown) {
        const winW = window.innerWidth;
        const need = growFor(c, winW, 'right', want);
        const room = (await roomBeside()) ?? { left: need, right: need };
        const pick = pickSide(wc.side, room, need);
        const grow = Math.max(pick.fit, growFor(c, winW, pick.side, WIDTH_MIN));
        side = pick.side;
        wingW = clamp(widthFor(c, winW, side, grow), WIDTH_MIN, want);
        grown = { g: null, pin: 'left', baseW: winW, baseH: window.innerHeight };
        await tick();
        const g = await growWindow(side, grow, () => grown && (grown.pin = side === 'left' ? 'right' : 'left'));
        if (grown) grown.g = g;
        await tick();
        await frame();
      } else if (!platform.isNative) {
        // In a browser the page is the window: the wing opens where the page has room.
        const extra = GAP + MARGIN;
        const pick = pickSide(wc.side, { left: c.cx - c.r, right: window.innerWidth - c.cx - c.r }, want + extra);
        side = pick.side;
        wingW = clamp(pick.fit - extra, WIDTH_MIN, want);
      }
      if (!what) return sync();
      circle = measureCircle();
      open = true;
      return;
    }
    if (!what && (open || grown)) {
      if (open) {
        open = false;
        await sleep(rm ? 0 : 200);
      }
      if (what) return sync();
      if (grown?.g) await shrinkWindow(grown.g, () => grown && (grown.pin = 'left'));
      grown = null;
    }
  }

  function show(kind: 'title' | 'alef') {
    what = { kind };
    void queue(sync);
    armClose(kind === 'title' ? 12_000 + readingMs(titleInfo.title) : null);
  }
  function hide() {
    if (!what && !open && !grown) return;
    void putAway();
  }
  /** Put the wing away and wait until the window is its own size again. */
  function putAway(): Promise<void> {
    what = null;
    disarm();
    // Gone from under the pointer: nothing holds it (or Alef's line) any more.
    held = false;
    if (heldAlef) {
      heldAlef = false;
      alef.holdBubble(false);
    }
    return queue(sync);
  }

  // The window grew or the page resized: the dial may have moved within it.
  function onResize() {
    if (open) circle = measureCircle();
  }

  // Closing by itself: a title after a while, Alef's reply once it's been readable for a while.
  // Resting the pointer on the wing holds it.
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let held = false;
  /** Alef's line is held too (the widget's copy keeps it while you read). */
  let heldAlef = false;
  function disarm() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  }
  function armClose(ms: number | null) {
    disarm();
    if (ms == null || held) return;
    closeTimer = setTimeout(() => !held && hide(), ms);
  }
  function onHold(on: boolean) {
    held = on;
    if (what?.kind === 'alef' || heldAlef) {
      heldAlef = on;
      alef.holdBubble(on);
    }
    if (on) disarm();
    else if (what?.kind === 'alef' && talk) disarm();
    else armClose(3500);
  }

  function onTitle(e: MouseEvent) {
    if (e.detail > 1 || moved(e)) return;
    if (what?.kind === 'title') hide();
    else show('title');
  }

  /** The block (or focus round) behind the title, in full. */
  const titleInfo = $derived.by((): TitleInfo => {
    const h12 = view.hour12;
    const now = clock.now;
    if (readoutTimer && ts) {
      const r = readoutTimer;
      return {
        lead: r.segment === 'break' ? 'Break' : r.kind === 'cycles' ? `Round ${Math.floor(r.index / 2) + 1} of ${r.count}` : 'Focus',
        title: r.label,
        icon: r.segment === 'break' ? 'coffee' : 'target',
        color: finish.signal,
        when: r.paused ? 'Paused' : `ends ${formatTime(now + r.remainingMs, h12)}`,
        left: `${formatDuration(r.remainingMs)} left`,
      };
    }
    const span = (b: { startMs: number; endMs: number }) => `${formatTime(b.startMs, h12)}–${formatTime(b.endMs, h12)} · ${formatDuration(b.endMs - b.startMs)}`;
    const { current: cur, next } = nowState;
    const then = (b: typeof next) => (b ? { title: b.title || 'Untitled block', icon: b.icon, color: b.color, at: formatTime(b.startMs, h12) } : null);
    if (cur) return { lead: 'Now', title: cur.title || 'Untitled block', icon: cur.icon, color: cur.color, when: span(cur), left: `${formatDuration(cur.endMs - now)} left`, then: then(next) };
    if (next) return { lead: 'Free time · up next', title: next.title || 'Untitled block', icon: next.icon, color: next.color, when: span(next), left: `in ${formatDuration(next.startMs - now)}` };
    const t = view.tally;
    return { lead: 'Today', title: t.total && t.done === t.total ? "That's the day" : 'Nothing else planned', icon: null, color: null, when: t.total ? `${t.done} of ${t.total} done` : '', left: '' };
  });

  // Alef's replies: thinking dots after you asked here, then its words, typed out.
  let asked = $state(false);
  let reply = $state<{ seq: number; text: string; offers: Offer[] } | null>(null);
  let typedAt = 0;
  let lastSeq = -1;
  $effect(() => {
    const b = alef.bubble;
    if (!b || b.seq === lastSeq) return;
    lastSeq = b.seq;
    untrack(() => {
      asked = false;
      reply = { seq: b.seq, text: b.text, offers: b.offers ?? [] };
      typedAt = 0;
      if (wingReplies) show('alef');
    });
  });
  $effect(() => {
    if (!(wingReplies && asked && alef.thinking)) return;
    untrack(() => {
      if (what?.kind === 'alef') return disarm();
      reply = null;
      show('alef');
    });
  });
  // Thinking ended without words (an error, a cancel): the wing goes.
  $effect(() => {
    if (what?.kind === 'alef' && !reply && !alef.thinking) untrack(() => armClose(800));
  });
  // Alef moved on (its bubble went): the wing goes too, once the words have been up a while.
  $effect(() => {
    if (alef.bubble || what?.kind !== 'alef' || !reply) return;
    untrack(() => {
      if (talk) return;
      if (typedAt) armClose(Math.max(0, typedAt + 4000 - Date.now()));
    });
  });
  // Done talking here: the last reply stays a moment, then goes.
  $effect(() => {
    if (!talk && what?.kind === 'alef' && reply && typedAt) untrack(() => armClose(Math.max(2500, typedAt + readingMs(reply!.text) - Date.now())));
  });
  function onTyped() {
    typedAt = Date.now();
    if (talk || !reply) return;
    // Still Alef's line: time to read it (and its buttons); Alef already moved on: a few seconds.
    armClose(alef.bubble?.seq === reply.seq ? readingMs(reply.text) + (reply.offers.length ? 14_000 : 0) : 4000);
  }
  function onAsk() {
    asked = true;
    // A new question: the dots in place of the last answer.
    if (what?.kind === 'alef') reply = null;
  }
  function onAct(i: number) {
    if (!reply) return;
    void platform.broadcast('alef-act', { seq: reply.seq, index: i });
    hide();
  }

  const palette = $derived(wingPalette(finish, wc.style, alefOn ? alef.screenFor(finish).eye : undefined));
  const maxH = $derived(circle ? maxHeight(circle.r, grown?.baseH ?? window.innerHeight) : 0);
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} onblur={() => hide()} onresize={onResize} />

{#snippet alefFace(info: { big: string; tone: string })}
  <AlefFace framed={false} perf={alef.perf} performing={alef.performing} affect={alef.affect} talk={alef.talk} screen={alef.screenFor(finish)} led={alefFile.value.settings.led} reduced={view.reducedMotion} compact interactive={false} gaze={false} />
{/snippet}

<div
  class="widget"
  role="presentation"
  onpointerdown={onDown}
  onpointermove={(e) => (onMove(e), onHover(e))}
  onpointerup={() => (press = null)}
  onclick={onTap}
  ondblclick={openMain}
  title={`${PRESETS[presetId].name} · double-click to open ${timer.active ? 'your focus' : 'Daybloom'}`}
>
  <div class="stage" class:pinned={!!grown} class:to-right={grown?.pin === 'right'} style:width={grown ? `${grown.baseW}px` : undefined}>
    <div class="dial" bind:this={dialEl}>
      <AlefPosture on={alefOn} reduced={view.reducedMotion} compact>
      <Dial
        {presetId}
        {finish}
        {blocks}
        now={clock.now}
        date={view.today}
        isToday={true}
        headsUpKey={view.headsUpKey}
        compact
        withCase
        interactive={false}
        showSeconds={settings.value.showSeconds}
        reduced={view.reducedMotion}
        sleep={{ wake: settings.value.wake, sleep: settings.value.sleep }}
        {wedge}
        hideKey={wedge?.key ?? null}
        dayCompleteAt={view.dayCompleteAt}
        hour12={view.hour12}
        prayers={isOn('waqt') ? prayerMarks(clock.minute) : []}
        prayerBloom={waqt.bloom}
        label="Daybloom widget"
        lift={alefOn && alef.performing ? ACTS[alef.perf.id].lift : 0}
        screen={alefOn ? { led: alef.led, glow: alef.glow, palette: alef.screenFor(finish) } : null}
        worldZones={settings.value.worldClock.onDial ? settings.value.worldClock.zones : []}
      >
        <Readout
          state={nowState}
          now={clock.now}
          date={view.today}
          isToday={true}
          hour12={view.hour12}
          tally={view.tally}
          timer={readoutTimer}
          compact
          reduced={view.reducedMotion}
          face={alefOn ? alefFace : undefined}
          slide={wc.marquee}
          ontitle={onTitle}
          titleOpen={open && what?.kind === 'title'}
        />
      </Dial>
      </AlefPosture>
    </div>

    {#if nudges.attention}
      <button class="pip tnum" onclick={() => platform.showMain()} title="Open Daybloom to check in" aria-label={`${nudges.attention} check-ins waiting`}>
        {nudges.attention}
      </button>
    {/if}

    <AlarmPip face={finish.face} ink={finish.ink} dark={finish.dark} />

    {#if alefOn && (talk || (!wingReplies && (alef.bubble || alef.thinking)))}
      {#key !!talk}
        <WidgetTalk bar={!!talk} start={talk?.start ?? ''} ink={finish.ink} face={finish.face} wing={wingReplies} onask={onAsk} onclose={() => (talk = null)} />
      {/key}
    {/if}

    <div class="tools" class:hidden={!!talk} style:--face={finish.face} style:--ink={finish.ink}>
      {#if alefOn}
        <button onclick={() => openTalk()} aria-label="Talk to Alef" title="Talk to Alef · or just start typing"><Icon name="message" size={14} stroke={2} /></button>
      {/if}
      <button onclick={cyclePreset} aria-label="Switch dial" title="Switch dial"><Icon name="dial" size={14} stroke={2} /></button>
      <button onclick={toggleLayer} aria-pressed={w.layer === 'top'} aria-label={w.layer === 'top' ? 'Floating on top' : 'Sitting on desktop'} title={w.layer === 'top' ? 'Floating on top — click to sit on the desktop' : 'On the desktop — click to float on top'}><Icon name="pin" size={14} stroke={2} /></button>
      {#if platform.isNative}
        <button onclick={cycleSize} aria-label="Resize" title="Resize"><Icon name="maximize" size={14} stroke={2} /></button>
      {/if}
      <button onclick={() => platform.showMain()} aria-label="Open Daybloom" title="Open Daybloom"><Icon name="external" size={14} stroke={2} /></button>
      <button onclick={hideWidget} aria-label="Hide widget" title="Hide widget"><Icon name="x" size={14} stroke={2} /></button>
    </div>
  </div>

  {#if open && what && circle}
    <Wing
      {circle}
      {side}
      width={what.kind === 'alef' && !reply ? 64 : wingW}
      {maxH}
      {palette}
      reduced={rm}
      contentKey={what.kind === 'alef' ? `alef:${reply?.seq ?? 'thinking'}` : `title:${titleInfo.title}:${titleInfo.lead}`}
      curve={what.kind === 'alef'}
      label={what.kind === 'alef' ? 'Alef says' : 'This block in full'}
      onclose={hide}
      onhold={onHold}
    >
      {#if what.kind === 'alef'}
        {#key reply?.seq ?? -1}
          <AlefReply text={reply?.text ?? ''} offers={reply?.offers ?? []} thinking={!reply} typing={wc.typing} speed={wc.speed} reduced={rm} onact={onAct} ontyped={onTyped} />
        {/key}
      {:else}
        <TitleCard info={titleInfo} fill={palette.fill} />
      {/if}
    </Wing>
  {/if}
</div>

<style>
  .widget {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: transparent;
    cursor: grab;
    overflow: hidden;
  }
  /* The dial's own square: the whole window, or (while the wing is out) its old size, pinned
     to the side away from the wing so the dial doesn't move on the screen. */
  .stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .stage.pinned {
    right: auto;
  }
  .stage.pinned.to-right {
    left: auto;
    right: 0;
  }
  .dial {
    width: min(100%, 100vh);
    /* Room for the case's shadow inside the square window. */
    padding: 12px;
  }
  .pip {
    position: absolute;
    top: 9%;
    right: 9%;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: var(--warm, #d98a12);
    color: #1b1206;
    font: 600 12px/22px var(--font-ui);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
    cursor: pointer;
  }
  .tools {
    position: absolute;
    left: 50%;
    bottom: 13%;
    transform: translate(-50%, 6px);
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--face) 92%, transparent);
    color: var(--ink);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.18);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s var(--ease-out),
      transform 0.25s var(--ease-out);
  }
  .stage:hover .tools:not(.hidden) {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }
  .tools button {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .tools button:hover {
    background: color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .tools button[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ink) 14%, transparent);
  }
</style>
