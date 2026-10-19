<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { IcsPreviewError, IcsPreviewOk } from '../../lib/calendar/preview';
  import type { CalendarAccount } from '../../lib/calendar/types';
  import { addCalendarLink, previewCalendarLink } from '../../lib/calendarBridge.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { eventCount, eventWhen, guideFor, SOURCE_ICON } from './guides';
  import LinkGuides from './LinkGuides.svelte';
  import Spinner from './Spinner.svelte';

  let {
    replacing = null,
    onadded,
    oncancel,
  }: {
    /** A broken link calendar this one replaces; its name is kept. */
    replacing?: { id: string; label: string } | null;
    onadded: (account: CalendarAccount) => void;
    oncancel?: () => void;
  } = $props();

  type Phase = 'idle' | 'checking' | 'ready' | 'adding' | 'problem';

  let link = $state('');
  let phase = $state<Phase>('idle');
  let preview = $state<IcsPreviewOk | null>(null);
  let problem = $state<IcsPreviewError | null>(null);
  let name = $state('');
  let addError = $state('');
  let input: HTMLInputElement | undefined = $state();
  /** The text the shown result belongs to. */
  let checkedText = '';
  /** Drops answers to links the user has since changed. */
  let ticket = 0;

  const rm = $derived(view.reducedMotion);
  const enter = (ms: number) => ({ y: 8, duration: rm ? 0 : ms, easing: cubicOut });

  onMount(() => input?.focus());

  function clearResult() {
    ticket++;
    checkedText = '';
    phase = 'idle';
    preview = null;
    problem = null;
    addError = '';
  }

  async function check() {
    const text = link.trim();
    if (!text) return clearResult();
    if (text === checkedText && phase !== 'problem') return;
    const mine = ++ticket;
    checkedText = text;
    phase = 'checking';
    preview = null;
    problem = null;
    addError = '';
    const result = await previewCalendarLink(text);
    if (mine !== ticket) return;
    if (result.ok) {
      preview = result;
      name = replacing?.label ?? result.name;
      phase = 'ready';
    } else {
      problem = result;
      phase = 'problem';
    }
  }

  // The pasted text lands in the field after the paste event, so check on the next turn.
  const onpaste = () => setTimeout(check, 0);

  function oninput() {
    if (phase !== 'idle' && link.trim() !== checkedText) clearResult();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void check();
    }
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!preview || phase === 'adding') return;
    phase = 'adding';
    addError = '';
    try {
      const account = await addCalendarLink(preview.url, name.trim() || preview.name);
      // Don't keep the link around once the keychain has it.
      link = '';
      clearResult();
      onadded(account);
    } catch (err) {
      addError = (err as Error)?.message ?? String(err);
      phase = 'ready';
    }
  }

  function cancel() {
    link = '';
    clearResult();
    oncancel?.();
  }
</script>

<div class="addlink">
  {#if replacing}
    <p class="lead">Paste the new link for “{replacing.label}”.</p>
  {/if}

  <label class="lbl" for="calendar-link">Calendar link</label>
  <div class="link-row">
    <span class="lead-icon"><Icon name="link" size={15} /></span>
    <input
      id="calendar-link"
      class="field"
      type="text"
      inputmode="url"
      placeholder="https://… or webcal://…"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-describedby="calendar-link-note"
      bind:this={input}
      bind:value={link}
      {onpaste}
      {oninput}
      {onkeydown}
    />
    {#if phase === 'checking'}
      <span class="trail"><Spinner size={14} /></span>
    {:else if phase === 'ready' || phase === 'adding'}
      <span class="trail"><Icon name="check" size={15} /></span>
    {:else if link.trim()}
      <button class="trail-btn" onclick={check} aria-label="Check the link" title="Check the link"><Icon name="arrow-right" size={15} /></button>
    {/if}
  </div>
  <p id="calendar-link-note" class="note">Daybloom keeps the link in your system keychain. It only reads the calendar.</p>

  {#if phase === 'checking'}
    <div class="checking" role="status" in:fly={enter(200)}>
      <Spinner size={14} />
      <span>Checking the link…</span>
    </div>
  {:else if (phase === 'ready' || phase === 'adding') && preview}
    <form class="preview" onsubmit={add} in:fly={enter(260)} aria-label="Calendar preview">
      <div class="p-head">
        <i class="dot" class:none={!preview.color} style:background={preview.color}></i>
        <div class="p-who">
          <p class="p-name">{preview.name}</p>
          <p class="p-src"><Icon name={SOURCE_ICON[preview.provider]} size={12} /><span>{preview.displayUrl}</span></p>
        </div>
      </div>

      <div class="facts" role="status">
        {#if preview.upcoming > 0}
          <p class="count tnum">{eventCount(preview.upcoming)} in the next 2 weeks</p>
        {:else}
          <p class="count">No events in the next 2 weeks</p>
          <p class="sub tnum">{preview.total ? `The calendar has ${eventCount(preview.total).toLowerCase()} in all.` : 'The calendar is empty now.'}</p>
        {/if}
        {#if preview.next}
          <div class="next">
            <span class="next-lbl">Next</span>
            <span class="next-title">{preview.next.title}</span>
            <span class="next-when tnum">{eventWhen(preview.next.startMs, preview.next.allDay, clock.minute, view.hour12)}</span>
          </div>
        {/if}
      </div>

      <label class="lbl" for="calendar-name">Name</label>
      <input id="calendar-name" class="field" maxlength="60" autocomplete="off" bind:value={name} />
      {#if addError}<p class="error" role="alert">{addError}</p>{/if}

      <div class="actions">
        <button class="btn btn-primary" type="submit" disabled={phase === 'adding'}>
          {#if phase === 'adding'}
            <Spinner size={13} /> Adding…
          {:else}
            <Icon name="plus" size={14} /> Add calendar
          {/if}
        </button>
        <button class="btn btn-quiet" type="button" onclick={cancel} disabled={phase === 'adding'}>Cancel</button>
      </div>
    </form>
  {:else if phase === 'problem' && problem}
    <div class="problem" role="alert" in:fly={enter(240)}>
      <p class="msg">{problem.message}</p>
      {#if problem.advice}<p class="advice">{problem.advice}</p>{/if}
      {#if problem.kind !== 'invalid-url'}
        <button class="btn btn-soft small" onclick={() => check()}><Icon name="refresh" size={13} /> Try again</button>
      {/if}
      <details class="how">
        <summary>How to find this link <Icon name="chevron-down" size={13} /></summary>
        <div class="how-body">
          <LinkGuides only={guideFor(problem.provider)} />
        </div>
      </details>
    </div>
  {:else}
    <div class="where">
      <p class="lbl">Where to find the link</p>
      <LinkGuides />
    </div>
  {/if}
</div>

<style>
  .addlink {
    display: grid;
    gap: var(--s-2);
  }
  .lead {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .lbl {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
  }
  .link-row {
    position: relative;
  }
  .link-row .field {
    padding-left: 36px;
    padding-right: 40px;
    font-size: var(--t-sm);
    text-overflow: ellipsis;
  }
  .lead-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    pointer-events: none;
  }
  .trail,
  .trail-btn {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--r-pill);
    color: var(--ink-2);
  }
  .trail-btn {
    background: var(--sunken);
    color: var(--ink);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .trail-btn:hover {
    background: color-mix(in srgb, var(--sunken) 80%, var(--ink) 8%);
  }
  .trail-btn:active {
    transform: translateY(-50%) scale(0.92);
  }
  .note {
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.45;
    color: var(--ink-3);
  }

  .checking {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 64px;
    padding: 0 var(--s-4);
    margin-top: var(--s-1);
    border-radius: var(--r-md);
    border: 1px dashed var(--line-strong);
    font-size: var(--t-sm);
    color: var(--ink-2);
  }

  .preview {
    display: grid;
    gap: var(--s-2);
    margin-top: var(--s-1);
    padding: var(--s-4);
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .p-head {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
  }
  .dot {
    flex: none;
    width: 12px;
    height: 12px;
    margin-top: 4px;
    border-radius: 50%;
  }
  .dot.none {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--line-strong);
  }
  .p-who {
    min-width: 0;
  }
  .p-name {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .p-src {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    min-width: 0;
  }
  .p-src span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .facts {
    display: grid;
    gap: 6px;
    padding: var(--s-3) 0;
    margin: var(--s-1) 0;
    border-block: 1px solid var(--line);
  }
  .count {
    margin: 0;
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
  }
  .sub {
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .next {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .next-lbl {
    grid-row: span 2;
    color: var(--ink-3);
    font-size: var(--t-xs);
    padding-top: 2px;
  }
  .next-title {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .next-when {
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .preview .field {
    height: 36px;
    font-size: var(--t-sm);
  }
  .actions {
    display: flex;
    gap: var(--s-2);
    margin-top: var(--s-1);
  }
  .error {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--danger);
  }

  .problem {
    display: grid;
    gap: var(--s-2);
    justify-items: start;
    margin-top: var(--s-1);
    padding: var(--s-3) var(--s-4) var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .msg {
    margin: 0;
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 1.45;
    color: var(--danger);
  }
  .advice {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .small {
    height: 30px;
    padding: 0 var(--s-3);
    gap: 6px;
    font-size: 12.5px;
  }
  .how {
    justify-self: stretch;
  }
  .how summary {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    list-style: none;
    font-size: var(--t-sm);
    color: var(--ink-2);
    transition: color var(--dur-1) var(--ease-out);
  }
  .how summary::-webkit-details-marker {
    display: none;
  }
  .how summary:hover {
    color: var(--ink);
  }
  .how summary :global(svg) {
    transition: transform var(--dur-2) var(--ease-out);
  }
  .how[open] summary :global(svg) {
    transform: rotate(180deg);
  }
  .how-body {
    margin-top: var(--s-2);
  }
  .where {
    display: grid;
    gap: var(--s-2);
    margin-top: var(--s-3);
  }
</style>
