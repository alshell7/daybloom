<script lang="ts">
  // Settings › Screen › Desktop widget › Long words: how the widget shows what doesn't fit in its
  // dial. A small live picture of the widget (its real dial and wing, in the widget's finish) to
  // play with: drag the wing's outer edge to set its width, tap a side of the dial to open it
  // there, switch between a reply from Alef and a block title, and watch the reply type at the
  // speed you choose. The same choices follow as rows. Saved in `settings.widget.wing`, which
  // syncs with your other computers; the widget uses them the next time a wing opens.
  import { untrack } from 'svelte';
  import Dial from '../../lib/dial/Dial.svelte';
  import Readout from '../../lib/dial/Readout.svelte';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration, formatTime, isoOf, MINUTE } from '../../lib/engine/time';
  import type { Block } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { resolveFinish, type FinishId } from '../../lib/presets';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { isOn } from '../../lib/addons/registry';
  import Segmented from '../Segmented.svelte';
  import AlefReply from '../widget/AlefReply.svelte';
  import TitleCard from '../widget/TitleCard.svelte';
  import Wing from '../widget/Wing.svelte';
  import { clamp, GAP, growFor, maxHeight, SPEED_MAX, SPEED_MIN, WIDTH_MAX, WIDTH_MIN, wingPalette, type Side } from '../widget/wing';

  const wc = $derived(settings.value.widget.wing);
  const rm = $derived(view.reducedMotion);
  const finish = $derived(settings.value.widget.finish === 'auto' ? view.finish : resolveFinish(settings.value.widget.finish as FinishId, view.theme));
  const palette = $derived(wingPalette(finish, wc.style));
  /** Alef's rows (and its reply in the picture) only while Alef is on. */
  const alefOn = $derived(isOn('alef'));

  // ---- the picture ---------------------------------------------------------------------
  /** The smallest widget: a real dial, at its real size, scaled to fit the panel. */
  const D = 200;
  const circle0 = { cx: D / 2, cy: D / 2, r: ((D - 24) / 2) * (497 / 500) };
  /** 'Auto' opens toward the middle of your screen; here, the right. */
  const side = $derived<Side>(wc.side === 'left' ? 'left' : 'right');
  /** The width while you drag the edge (saved when you let go). */
  let dragW = $state<number | null>(null);
  const width = $derived(dragW ?? clamp(wc.width, WIDTH_MIN, WIDTH_MAX));
  const grow = $derived(growFor(circle0, D, side, width));
  const sceneW = $derived(D + grow);
  const circle = $derived(side === 'left' ? { ...circle0, cx: circle0.cx + grow } : circle0);
  const maxH = maxHeight(circle0.r, D);

  let boxW = $state(0);
  /** The scale, held still while you drag so the edge stays under the pointer. */
  let k = $state(1);
  $effect(() => {
    const fit = boxW ? Math.min(1, (boxW - 8) / sceneW) : 1;
    if (dragW == null) k = fit;
  });

  // A sample day: a long block now and a walk after it.
  const now = $derived(clock.minute);
  const sample = $derived.by((): Block[] => {
    const at = now - 25 * MINUTE;
    const mk = (key: string, title: string, icon: string, cat: Block['category'], s: number, e: number): Block => ({
      key,
      kind: 'task',
      date: isoOf(s),
      title,
      icon,
      category: cat,
      color: categoryColor(cat, finish.dark),
      startMs: s,
      endMs: e,
      floating: false,
      done: false,
      recurring: false,
      readOnly: false,
    });
    return [mk('pv:a', 'Write the quarterly report for the design team', 'pen', 'focus', at, at + 70 * MINUTE), mk('pv:b', 'Evening walk around the park', 'footprints', 'move', at + 80 * MINUTE, at + 110 * MINUTE)];
  });
  const nowState = $derived({ current: sample[0], next: sample[1], remainingMs: sample[0].endMs - now, progress: (now - sample[0].startMs) / (sample[0].endMs - sample[0].startMs), alongside: [] });
  const titleInfo = $derived({
    lead: 'Now',
    title: sample[0].title,
    icon: sample[0].icon,
    color: sample[0].color,
    when: `${formatTime(sample[0].startMs, view.hour12)}–${formatTime(sample[0].endMs, view.hour12)} · ${formatDuration(sample[0].endMs - sample[0].startMs)}`,
    left: `${formatDuration(sample[0].endMs - now)} left`,
    then: { title: sample[1].title, icon: sample[1].icon, color: sample[1].color, at: formatTime(sample[1].startMs, view.hour12) },
  });
  const REPLY = 'Twenty minutes left on the report. Want to finish the summary first, then send it before your walk?';

  /** What the picture's wing shows; a replay restarts the typing. */
  let picked = $state<'reply' | 'title'>('reply');
  const shows = $derived(alefOn ? picked : 'title');
  let take = $state(0);
  const replay = () => {
    picked = 'reply';
    take++;
  };
  // A new speed or typing on: type it again.
  $effect(() => {
    wc.speed;
    wc.typing;
    untrack(() => take++);
  });

  /** A tap on the picture's dial: its left or right half opens the wing on that side. */
  function tapDial(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    settings.value.widget.wing.side = e.clientX < r.left + r.width / 2 ? 'left' : 'right';
  }

  // Dragging the wing's outer edge sets its width.
  let drag: { x: number; w: number } | null = null;
  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, w: width };
    dragW = width;
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const d = (e.clientX - drag.x) / k;
    dragW = Math.round(clamp(drag.w + (side === 'right' ? d : -d), WIDTH_MIN, WIDTH_MAX));
  }
  function up() {
    if (!drag) return;
    drag = null;
    if (dragW != null) settings.value.widget.wing.width = dragW;
    dragW = null;
  }
  function keys(e: KeyboardEvent) {
    const step = e.shiftKey ? 40 : 10;
    const out = side === 'right' ? 'ArrowRight' : 'ArrowLeft';
    const into = side === 'right' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key !== out && e.key !== into && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const w = e.key === 'Home' ? WIDTH_MIN : e.key === 'End' ? WIDTH_MAX : width + (e.key === out ? step : -step);
    settings.value.widget.wing.width = clamp(w, WIDTH_MIN, WIDTH_MAX);
  }
  /** The edge handle, in the scene. */
  const edgeX = $derived(side === 'right' ? circle.cx + circle.r + GAP + width : circle.cx - circle.r - GAP - width);

  const SIDES = [
    { value: 'auto' as const, label: 'Auto', title: 'Toward the middle of the screen: the side with more room' },
    { value: 'left' as const, label: 'Left' },
    { value: 'right' as const, label: 'Right' },
  ];
  const LOOKS = [
    { value: 'auto' as const, label: 'Dial', title: 'In the dial’s own colours' },
    { value: 'dark' as const, label: 'Dark' },
    { value: 'light' as const, label: 'Light' },
  ];
</script>

<div class="wing-set">
  <p class="label">Long words</p>
  <p class="hint top">A title too long for the dial glides along its line. Tap it on the widget to see it in full beside the dial, in a wing; Alef’s replies open there too.</p>

  <div class="preview" bind:clientWidth={boxW} style:height={`${D * k + 4}px`}>
    <div class="scene" style:width={`${sceneW}px`} style:height={`${D}px`} style:transform={`translateX(${Math.max(0, (boxW - sceneW * k) / 2)}px) scale(${k})`}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="pv-dial" style:left={`${circle.cx - D / 2}px`} role="presentation" onclick={tapDial} title="Tap a side of the dial to open the wing there">
        <Dial presetId="field12" {finish} blocks={sample} {now} date={isoOf(now)} isToday={true} compact withCase interactive={false} showSeconds={false} reduced={rm} hour12={view.hour12} label="Widget preview">
          <Readout state={nowState} {now} date={isoOf(now)} isToday={true} hour12={view.hour12} tally={{ done: 1, total: 3 }} compact reduced={rm} slide={wc.marquee} titleOpen={shows === 'title'} ontitle={() => (picked = 'title')} />
        </Dial>
      </div>
      <Wing {circle} {side} {width} {maxH} {palette} reduced={rm} contentKey={`${shows}:${take}`} curve={shows === 'reply'} label="Wing preview" onclose={replay}>
        {#if shows === 'reply'}
          {#key take}
            <AlefReply text={REPLY} offers={[{ id: 'start2', label: 'Start for 2 min', icon: 'play' }]} typing={wc.typing} speed={wc.speed} reduced={rm} />
          {/key}
        {:else}
          <TitleCard info={titleInfo} fill={palette.fill} />
        {/if}
      </Wing>
      <span
        class="edge"
        class:left={side === 'left'}
        class:dragging={dragW != null}
        style:left={`${edgeX}px`}
        style:top={`${D / 2}px`}
        role="slider"
        tabindex="0"
        aria-label="Wing width"
        aria-valuemin={WIDTH_MIN}
        aria-valuemax={WIDTH_MAX}
        aria-valuenow={width}
        aria-valuetext={`${width} points`}
        title="Drag to set the wing’s width"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onkeydown={keys}
      ><i></i></span>
    </div>
    {#if alefOn}
      <div class="pv-tools">
        <button class="chip" aria-pressed={shows === 'reply'} onclick={replay} title="Alef’s reply, typed again"><Icon name={shows === 'reply' ? 'refresh' : 'message'} size={12} stroke={2.2} /> Reply</button>
        <button class="chip" aria-pressed={shows === 'title'} onclick={() => (picked = 'title')} title="A block’s title in full"><Icon name="pen" size={12} stroke={2.2} /> Title</button>
      </div>
    {/if}
    {#if dragW != null}<span class="readout-w tnum">{dragW} pt</span>{/if}
  </div>

  <label class="row">
    <span class="lbl">Slide long titles<small>Off: they end with “…”. Calm motion sets them on two lines.</small></span>
    <input type="checkbox" class="switch" bind:checked={settings.value.widget.wing.marquee} />
  </label>
  <div class="row">
    <span>Opens on</span>
    <Segmented label="Wing opens on" value={wc.side} options={SIDES} onchange={(v) => (settings.value.widget.wing.side = v)} />
  </div>
  <div class="row">
    <span>Look</span>
    <Segmented label="Wing look" value={wc.style} options={LOOKS} onchange={(v) => (settings.value.widget.wing.style = v)} />
  </div>
  {#if alefOn}
    <label class="row">
      <span class="lbl">Alef’s replies in a wing<small>Off: in a bubble over the dial</small></span>
      <input type="checkbox" class="switch" bind:checked={settings.value.widget.wing.replies} />
    </label>
    <label class="row" class:off={!wc.replies}>
      <span class="lbl">Type replies out<small>Letter by letter; Calm motion shows them at once</small></span>
      <input type="checkbox" class="switch" bind:checked={settings.value.widget.wing.typing} disabled={!wc.replies} />
    </label>
    <div class="row" class:off={!wc.typing || !wc.replies}>
      <span>Typing speed</span>
      <span class="speed">
        <Icon name="hourglass" size={13} />
        <input type="range" min={SPEED_MIN} max={SPEED_MAX} step="5" bind:value={settings.value.widget.wing.speed} disabled={!wc.typing || !wc.replies} aria-label="Typing speed, letters a second" onchange={() => (picked = 'reply')} />
        <Icon name="zap" size={13} />
      </span>
    </div>
  {/if}
  <p class="hint">Auto opens the wing toward the middle of your screen, where there’s room. The widget’s window widens while the wing is out and the dial stays where it is.</p>
</div>

<style>
  .wing-set {
    margin-top: var(--s-3);
    padding-top: var(--s-3);
    border-top: 1px dashed var(--line);
  }
  .label {
    margin: 0 0 var(--s-1);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .hint.top {
    margin: 0 0 var(--s-3);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  .row > span:first-child {
    color: var(--ink-2);
  }
  .row.off > span:first-child {
    opacity: 0.55;
  }
  .lbl {
    display: grid;
    gap: 1px;
  }
  .lbl small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .speed {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-3);
  }
  input[type='range'] {
    accent-color: var(--ink);
    width: 140px;
  }

  /* --- the picture ---------------------------------------------------------- */
  .preview {
    position: relative;
    margin: 0 0 var(--s-2);
    border-radius: var(--r-md);
    overflow: hidden;
    /* A quiet desktop for the widget to sit on. */
    background:
      radial-gradient(120% 140% at 20% 0%, color-mix(in srgb, var(--focus-ring) 10%, transparent), transparent 60%),
      linear-gradient(160deg, var(--sunken), color-mix(in srgb, var(--sunken) 70%, var(--ground)));
    box-shadow: inset 0 0 0 1px var(--line);
    transition: height var(--dur-3) var(--ease-out);
  }
  .scene {
    position: absolute;
    left: 0;
    top: 2px;
    transform-origin: 0 0;
    transition: transform var(--dur-3) var(--ease-out);
  }
  .pv-dial {
    position: absolute;
    top: 0;
    width: 200px;
    padding: 12px;
    cursor: pointer;
  }
  .edge {
    position: absolute;
    z-index: 6;
    width: 18px;
    height: 44px;
    translate: -9px -50%;
    display: grid;
    place-items: center;
    cursor: ew-resize;
    touch-action: none;
    border-radius: 9px;
  }
  .edge i {
    width: 5px;
    height: 26px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 42%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--raised) 80%, transparent);
    transition:
      height var(--dur-2) var(--ease-settle),
      background var(--dur-1) var(--ease-out);
  }
  .edge:hover i,
  .edge.dragging i,
  .edge:focus-visible i {
    height: 34px;
    background: var(--ink);
  }
  .pv-tools {
    position: absolute;
    left: 8px;
    bottom: 8px;
    display: flex;
    gap: 4px;
    z-index: 7;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 9px 0 7px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-2);
    background: color-mix(in srgb, var(--raised) 80%, transparent);
    box-shadow: 0 0 0 1px var(--line);
    transition: background var(--dur-1) var(--ease-out);
  }
  .chip[aria-pressed='true'] {
    color: var(--ink);
    background: var(--raised);
    box-shadow:
      0 0 0 1px var(--line-strong),
      var(--shadow-1);
  }
  .readout-w {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: 7;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-inverse);
    background: var(--ink);
  }
</style>
