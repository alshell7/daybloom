<script lang="ts">
  // A date field: "Today", "Tomorrow", "Fri 23 Oct". Click it for one-tap days, a box to type
  // in ("fri", "30 oct", "+3") and the month. Arrow keys move it a day without opening it.
  // The value is "YYYY-MM-DD" or "" (no date).
  import { addDays, isoOf } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { dayLabel, parseDayText, quickDays } from '../../lib/pickers';
  import { clock } from '../../lib/stores/clock.svelte';
  import MonthGrid from './MonthGrid.svelte';
  import Popover from './Popover.svelte';

  let {
    value = $bindable(''),
    onchange,
    label,
    disabled = false,
    clearable = false,
    placeholder = 'No date',
    busy = false,
    min = null,
    max = null,
    quick = true,
    compact = false,
    pill = false,
  }: {
    value?: string;
    onchange?: (v: string) => void;
    label: string;
    disabled?: boolean;
    clearable?: boolean;
    placeholder?: string;
    /** Show how full each day already is (for planning a block). */
    busy?: boolean;
    min?: ISODate | null;
    max?: ISODate | null;
    /** One-tap days (today, tomorrow, the weekend…). */
    quick?: boolean;
    compact?: boolean;
    /** A small rounded variant for trays. */
    pill?: boolean;
  } = $props();

  let btn = $state<HTMLButtonElement>();
  let open = $state(false);
  let typed = $state('');
  let input = $state<HTMLInputElement>();

  const today = $derived(isoOf(clock.minute));
  const parsed = $derived(typed.trim() ? parseDayText(typed, today, clock.now) : null);
  const ok = (d: ISODate) => (!min || d >= min) && (!max || d <= max);
  const chips = $derived(quick ? quickDays(today).filter((q) => ok(q.date)) : []);

  function set(v: string) {
    if (v === value) return;
    value = v;
    onchange?.(v);
  }
  function show(start = '') {
    if (disabled) return;
    typed = start;
    open = true;
    queueMicrotask(() => input?.focus());
  }
  function pick(d: string) {
    set(d);
    open = false;
    btn?.focus();
  }
  function fieldKey(e: KeyboardEvent) {
    if (disabled || open) return;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value) {
      e.preventDefault();
      const d = addDays(value, e.key === 'ArrowUp' ? 1 : -1);
      if (ok(d)) set(d);
    } else if (/^[a-z0-9+]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      show(e.key);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && clearable) {
      e.preventDefault();
      set('');
    }
  }
  function typeKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsed && ok(parsed)) pick(parsed);
    } else if (e.key === 'ArrowDown' && !typed.trim()) {
      e.preventDefault();
      (btn?.ownerDocument.querySelector('.mg .grid [tabindex="0"]') as HTMLElement | null)?.focus();
    }
  }
</script>

<button
  bind:this={btn}
  type="button"
  class="df {pill ? 'pill' : 'field'}"
  class:compact
  class:empty={!value}
  class:on={open}
  {disabled}
  aria-label={`${label}: ${value ? dayLabel(value, today) : placeholder}`}
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={() => (open ? (open = false) : show())}
  onkeydown={fieldKey}
>
  {#if !compact}<Icon name="calendar" size={14} />{/if}
  <span>{value ? dayLabel(value, today) : placeholder}</span>
</button>

{#if open && btn}
  <Popover anchor={btn} onclose={() => (open = false)} {label} width={292}>
    <div class="dp">
      <label class="type">
        <Icon name="pen" size={13} />
        <input bind:this={input} bind:value={typed} onkeydown={typeKey} placeholder="Type a day · fri, 30 oct, +3" aria-label={`Type ${label.toLowerCase()}`} spellcheck="false" autocomplete="off" />
        {#if typed.trim()}<small class:bad={!parsed || !ok(parsed)}>{parsed && ok(parsed) ? dayLabel(parsed, today) : '?'}</small>{/if}
      </label>
      {#if chips.length || (clearable && value)}
        <div class="chips">
          {#each chips as c (c.label)}
            <button type="button" class="chip" class:sel={c.date === value} onclick={() => pick(c.date)}>{c.label}</button>
          {/each}
          {#if clearable && value}<button type="button" class="chip quiet" onclick={() => pick('')}>{placeholder}</button>{/if}
        </div>
      {/if}
      <MonthGrid value={value || null} preview={parsed} {today} {busy} {min} {max} onpick={pick} />
    </div>
  </Popover>
{/if}

<style>
  .df {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    cursor: pointer;
    text-align: left;
    color: var(--ink);
    transition: box-shadow var(--dur-1) var(--ease-out);
  }
  .df :global(svg) {
    flex: none;
    color: var(--ink-3);
  }
  .df span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .df.empty span {
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
  .df.on {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 40%, transparent);
  }
  .df:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .dp {
    display: grid;
    gap: 8px;
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
    white-space: nowrap;
  }
  .type small.bad {
    color: var(--ink-3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    height: 28px;
    padding: 0 11px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink);
    background: var(--sunken);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    background: color-mix(in srgb, var(--ink) 10%, var(--sunken));
  }
  .chip:active {
    transform: scale(0.96);
  }
  .chip.sel {
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .chip.quiet {
    background: none;
    color: var(--ink-3);
  }
</style>
