<script lang="ts">
  // One calendar in an account card: its colour, name, how many events are coming, and whether
  // it shows. The pencil opens a small editor below it: your own name, and the colour its events
  // take (one of the category colours, so a colour still means one thing everywhere).
  import { tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { calendarName } from '../../lib/calendar/service';
  import type { CalendarAccount, CalendarInfo } from '../../lib/calendar/types';
  import { calendarState, upcomingCount } from '../../lib/calendarBridge.svelte';
  import { CATEGORIES, categoryColor } from '../../lib/engine/categories';
  import type { CategoryId } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { eventCount } from './guides';

  let { account, cal }: { account: CalendarAccount; cal: CalendarInfo } = $props();

  let editing = $state(false);
  let draft = $state('');
  let field: HTMLInputElement | undefined = $state();

  const svc = $derived(calendarState.service);
  const rm = $derived(view.reducedMotion);
  const n = $derived(upcomingCount(account.id, cal.id));
  const shown = $derived(calendarName(cal));
  const color = $derived(cal.category ? categoryColor(cal.category, view.finish.dark) : cal.color);

  async function edit() {
    editing = !editing;
    if (!editing) return;
    draft = shown;
    await tick();
    field?.select();
  }
  function saveName() {
    if (draft.trim() !== shown) void svc?.updateCalendar(account.id, cal.id, { name: draft.trim() || null });
  }
  function pick(c: CategoryId | null) {
    void svc?.updateCalendar(account.id, cal.id, { category: c });
  }
</script>

<div class="row" class:off={!cal.enabled} class:open={editing}>
  <button class="dot-btn" onclick={edit} aria-label={`Colour and name of ${shown}`} title="Colour and name">
    <i class="dot" style:background={color}></i>
  </button>
  <span class="name" title={shown}>{shown}{#if cal.customName}<small title={`In ${account.provider === 'google' ? 'Google' : 'the feed'}: ${cal.name}`}>renamed</small>{/if}</span>
  <span class="count tnum">{n === null ? 'Hidden' : eventCount(n)}</span>
  <button class="edit" onclick={edit} aria-expanded={editing} aria-label={`Edit ${shown}`} title="Edit"><Icon name="pen" size={13} /></button>
  <input
    type="checkbox"
    class="switch"
    checked={cal.enabled}
    disabled={!account.enabled}
    aria-label={`Show ${shown}`}
    onchange={(e) => svc?.setCalendarEnabled(account.id, cal.id, e.currentTarget.checked)}
  />
</div>

{#if editing}
  <div class="editor" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
    <label class="fld">
      <span>Name</span>
      <input
        bind:this={field}
        class="field"
        bind:value={draft}
        placeholder={cal.name}
        maxlength="80"
        onblur={saveName}
        onkeydown={(e) => {
          if (e.key === 'Enter') (saveName(), (editing = false));
          else if (e.key === 'Escape') (e.stopPropagation(), (draft = shown), (editing = false));
        }}
      />
    </label>
    <div class="fld" role="radiogroup" aria-label="Colour of its events">
      <span>Colour</span>
      <div class="swatches">
        <button class="sw auto" class:on={!cal.category} role="radio" aria-checked={!cal.category} onclick={() => pick(null)} title="The calendar's own colour, matched to the nearest category">
          <i style:background={cal.color}></i>
          <em>Auto</em>
        </button>
        {#each CATEGORIES as c (c.id)}
          <button class="sw" class:on={cal.category === c.id} role="radio" aria-checked={cal.category === c.id} onclick={() => pick(c.id)} title={c.label} aria-label={c.label}>
            <i style:background={categoryColor(c.id, view.finish.dark)}></i>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 38px;
    border-top: 1px solid var(--line);
    font-size: var(--t-sm);
  }
  .dot-btn {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-left: -6px;
    border-radius: 50%;
    flex: none;
  }
  .dot-btn:hover {
    background: var(--sunken);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transition:
      background var(--dur-3) var(--ease-out),
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .dot-btn:hover .dot {
    transform: scale(1.25);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name small {
    margin-left: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .count {
    flex: none;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .edit {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: 50%;
    color: var(--ink-3);
    opacity: 0;
    transition:
      opacity var(--dur-1) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .row:hover .edit,
  .row.open .edit,
  .edit:focus-visible {
    opacity: 1;
  }
  .edit:hover,
  .row.open .edit {
    background: var(--sunken);
    color: var(--ink);
  }
  .off .name,
  .off .count {
    color: var(--ink-3);
  }
  .off .dot {
    opacity: 0.35;
  }
  .editor {
    display: grid;
    gap: var(--s-2);
    padding: 2px 0 var(--s-3) 24px;
  }
  .fld {
    display: grid;
    grid-template-columns: 52px 1fr;
    align-items: center;
    gap: var(--s-2);
  }
  .fld > span {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .field {
    height: 32px;
    font-size: var(--t-sm);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .sw {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    min-width: 24px;
    padding: 0 5px;
    justify-content: center;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--line);
    transition:
      box-shadow var(--dur-1) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .sw i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    transition: transform var(--dur-2) var(--ease-settle);
  }
  .sw em {
    font-style: normal;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .sw:hover {
    background: var(--sunken);
  }
  .sw.on {
    box-shadow: inset 0 0 0 2px var(--ink);
  }
  .sw.on i {
    transform: scale(1.15);
  }
</style>
