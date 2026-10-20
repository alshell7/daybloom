<script lang="ts">
  // A time field: shows the time in your clock style; click it for the dial, a box to type in
  // ("930", "2:30pm", "noon") and one-tap suggestions (now, the next free stretch that fits).
  // Without opening it: arrow keys or the scroll wheel nudge it, and typing a digit starts
  // typing a time. The value is "HH:MM" (24-hour) or "" (no time).
  import { blocksInRange, freeGaps } from '../../lib/engine/blocks';
  import { addDays, atMinutes, formatMinutes, isoOf, MINUTE, minutesOfDay, startOfDayMs } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { fromHHMM, parseTimeText, toHHMM } from '../../lib/pickers';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Popover from './Popover.svelte';
  import { landingPad } from '../../lib/addons/landings/pad.svelte';
  import TimeDial from './TimeDial.svelte';

  let {
    value = $bindable(''),
    onchange,
    label,
    disabled = false,
    clearable = false,
    placeholder = 'Set a time',
    date = null,
    length = 0,
    exclude = null,
    accent = 'var(--ink)',
    step = 5,
    suggest = [],
    nowChip = false,
    compact = false,
    pill = false,
    autoopen = false,
    onenter,
  }: {
    value?: string;
    onchange?: (v: string) => void;
    label: string;
    disabled?: boolean;
    clearable?: boolean;
    placeholder?: string;
    /** The day it's on: its other blocks show on the dial, and free time is suggested. */
    date?: ISODate | null;
    /** Minutes, for the span on the dial and the free-time suggestion. */
    length?: number;
    /** Leave this block out of "busy" (the one being edited). */
    exclude?: string | null;
    accent?: string;
    step?: number;
    suggest?: { label: string; minutes: number }[];
    /** Offer "Now" even without a date. */
    nowChip?: boolean;
    compact?: boolean;
    /** A small rounded variant for trays. */
    pill?: boolean;
    /** Open the dial as soon as it appears. */
    autoopen?: boolean;
    /** After Enter in the typing box (the value is already set). */
    onenter?: () => void;
  } = $props();

  let btn = $state<HTMLButtonElement>();
  let open = $state(false);
  let draft = $state(0);
  let typed = $state('');
  let input = $state<HTMLInputElement>();
  /** Where a bare typed hour leans (am or pm): the time as it was when the card opened. */
  let near = 0;

  const minutes = $derived(fromHHMM(value));
  const nowMin = $derived(Math.ceil(minutesOfDay(clock.now) / step) * step);
  const today = $derived(isoOf(clock.now));

  function set(m: number | null) {
    const v = m === null ? '' : toHHMM(m);
    if (v === value) return;
    value = v;
    onchange?.(v);
  }

  function show(start = '') {
    if (disabled) return;
    draft = minutes ?? (date === today || !date ? nowMin : settings.value.wake);
    near = draft;
    typed = start;
    open = true;
    queueMicrotask(() => input?.focus());
  }
  function close() {
    open = false;
  }
  $effect(() => {
    if (autoopen) queueMicrotask(() => show());
  });

  // The day's other blocks, for the dial and for "next free".
  const dayBusy = $derived.by(() => {
    if (!open || !date) return [];
    const s = startOfDayMs(date);
    return blocksInRange(taskFile.value.tasks, view.events, s, startOfDayMs(addDays(date, 1)), view.finish.dark).filter((b) => b.key !== exclude && !b.floating);
  });
  const busyArcs = $derived(dayBusy.map((b) => ({ start: minutesOfDay(Math.max(b.startMs, startOfDayMs(date!))), end: minutesOfDay(Math.min(b.endMs - 1, startOfDayMs(addDays(date!, 1)) - 1)) + 1, color: b.color })));
  const nextFree = $derived.by(() => {
    if (!date) return null;
    const need = Math.max(step, length || 30) * MINUTE;
    const from = Math.max(atMinutes(date, settings.value.wake), date === today ? Math.ceil(clock.now / (5 * MINUTE)) * 5 * MINUTE : 0);
    const gap = freeGaps(landingPad(dayBusy), from, startOfDayMs(addDays(date, 1)), need)[0];
    return gap ? Math.round(minutesOfDay(gap.startMs)) : null;
  });
  const chips = $derived.by(() => {
    const out: { label: string; minutes: number }[] = [];
    if (nowChip || date === today) out.push({ label: 'Now', minutes: nowMin % 1440 });
    if (nextFree !== null && nextFree !== nowMin) out.push({ label: 'Next free', minutes: nextFree });
    return [...out, ...suggest];
  });

  const parsed = $derived(
    typed.trim() ? parseTimeText(typed, { hour12: view.hour12, nowMinutes: nowMin, near, awake: date ? { from: settings.value.wake, to: settings.value.sleep } : undefined }) : null,
  );
  $effect(() => {
    if (parsed !== null) draft = parsed;
  });

  function fieldKey(e: KeyboardEvent) {
    if (disabled) return;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && minutes !== null) {
      e.preventDefault();
      const d = (e.shiftKey ? 60 : step) * (e.key === 'ArrowUp' ? 1 : -1);
      set((((minutes + d) % 1440) + 1440) % 1440);
    } else if (/^[0-9]$/.test(e.key) && !open) {
      e.preventDefault();
      show(e.key);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && clearable && !open) {
      e.preventDefault();
      set(null);
    }
  }
  function wheel(e: WheelEvent) {
    if (disabled || minutes === null || document.activeElement !== btn) return;
    e.preventDefault();
    set((((minutes + (e.deltaY < 0 ? step : -step)) % 1440) + 1440) % 1440);
  }
  function typeKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsed !== null || !typed.trim()) set(parsed ?? draft);
      close();
      btn?.focus();
      onenter?.();
    }
  }
</script>

<button
  bind:this={btn}
  type="button"
  class="tf tnum {pill ? 'pill' : 'field'}"
  class:compact
  class:empty={minutes === null}
  class:on={open}
  {disabled}
  aria-label={`${label}: ${minutes === null ? placeholder : formatMinutes(minutes, view.hour12)}`}
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={() => (open ? close() : show())}
  onkeydown={fieldKey}
  onwheel={wheel}
>
  {#if !compact}<Icon name="clock" size={14} />{/if}
  <span>{minutes === null ? placeholder : formatMinutes(minutes, view.hour12)}</span>
</button>

{#if open && btn}
  <Popover anchor={btn} onclose={close} label={label} width={268}>
    <div class="tp">
      <label class="type">
        <Icon name="pen" size={13} />
        <input bind:this={input} bind:value={typed} onkeydown={typeKey} placeholder="Type a time · 930, 2:30pm, noon" aria-label={`Type ${label.toLowerCase()}`} spellcheck="false" autocomplete="off" />
        {#if typed.trim()}<small class:bad={parsed === null}>{parsed === null ? '?' : '↵'}</small>{/if}
      </label>
      <TimeDial
        value={draft}
        {step}
        {length}
        busy={busyArcs}
        night={{ from: settings.value.sleep, to: settings.value.wake }}
        hour12={view.hour12}
        {accent}
        {label}
        onchange={(m) => {
          typed = '';
          draft = m;
        }}
        oncommit={(m) => {
          typed = '';
          draft = m;
          set(m);
        }}
      />
      {#if chips.length || clearable}
        <div class="chips">
          {#each chips as c (c.label)}
            <button
              type="button"
              class="chip"
              onclick={() => {
                draft = c.minutes;
                set(c.minutes);
                close();
                btn?.focus();
              }}
            >
              {c.label} <span class="tnum">{formatMinutes(c.minutes, view.hour12)}</span>
            </button>
          {/each}
          {#if clearable && minutes !== null}
            <button
              type="button"
              class="chip quiet"
              onclick={() => {
                set(null);
                close();
                btn?.focus();
              }}>No time</button
            >
          {/if}
        </div>
      {/if}
    </div>
  </Popover>
{/if}

<style>
  .tf {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    cursor: pointer;
    text-align: left;
    color: var(--ink);
    transition:
      box-shadow var(--dur-1) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .tf :global(svg) {
    flex: none;
    color: var(--ink-3);
  }
  .tf span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tf.empty span {
    color: var(--ink-3);
  }
  /* A small rounded variant for trays and rows. */
  .pill {
    height: 28px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    font-size: var(--t-xs);
    gap: 5px;
  }
  .pill:hover:not(:disabled) {
    border-color: var(--ink-3);
  }
  .tf.on {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 40%, transparent);
  }
  .tf:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .tp {
    display: grid;
    gap: 6px;
  }
  .type {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--r-sm);
    background: var(--sunken);
    color: var(--ink-3);
  }
  .type input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--t-sm);
    color: var(--ink);
    outline: none;
  }
  .type small {
    font-size: 12px;
    color: var(--ink-2);
  }
  .type small.bad {
    color: var(--ink-3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink);
    background: var(--sunken);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .chip span {
    font-weight: 400;
    color: var(--ink-2);
  }
  .chip:hover {
    background: color-mix(in srgb, var(--ink) 10%, var(--sunken));
  }
  .chip:active {
    transform: scale(0.96);
  }
  .chip.quiet {
    background: none;
    color: var(--ink-3);
  }
</style>
