<script lang="ts">
  // The top bar's calendar button (once a calendar is connected): when it last synced, a
  // "Sync now" that is one tap away, each calendar's state, and how often they all check.
  import { accountName, DEFAULT_SYNC_MIN, SYNC_CADENCES } from '../../lib/calendar/service';
  import { calendarState, syncNow } from '../../lib/calendarBridge.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Popover from '../pickers/Popover.svelte';
  import Segmented from '../Segmented.svelte';
  import { syncedAgo } from './guides';

  let btn = $state<HTMLButtonElement>();
  let open = $state(false);
  let syncing = $state(false);
  let done = $state(false);

  const accounts = $derived(calendarState.accounts.filter((a) => a.enabled !== false));
  const problems = $derived(accounts.filter((a) => a.error).length);
  const last = $derived(accounts.reduce((m, a) => Math.max(m, a.lastSyncAt ?? 0), 0) || calendarState.lastSyncAt || 0);
  const busy = $derived(syncing || calendarState.status === 'syncing');

  const LABEL: Record<number, string> = { 5: '5m', 10: '10m', 30: '30m', 60: '1h', 360: '6h', 0: 'Off' };
  const cadences = SYNC_CADENCES.map((m) => ({ value: String(m), label: LABEL[m], title: m === 0 ? 'Only when you press Sync now' : `Every ${m < 60 ? `${m} minutes` : m === 60 ? 'hour' : `${m / 60} hours`}` }));
  /** The shared cadence, or '' when calendars differ. */
  const every = $derived.by(() => {
    const set = new Set(accounts.map((a) => a.syncEveryMin ?? DEFAULT_SYNC_MIN));
    return set.size === 1 ? String([...set][0]) : '';
  });

  async function sync() {
    if (busy) return;
    syncing = true;
    done = false;
    try {
      await syncNow();
      done = true;
      setTimeout(() => (done = false), 1800);
    } finally {
      syncing = false;
    }
  }
  function setEvery(v: string) {
    const svc = calendarState.service;
    for (const a of accounts) void svc?.updateAccount(a.id, { syncEveryMin: Number(v) });
  }
</script>

{#if accounts.length}
  <button
    bind:this={btn}
    class="icon-btn cal"
    class:on={open}
    class:busy
    onclick={() => (open = !open)}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={`Calendars: ${busy ? 'syncing' : syncedAgo(last, clock.minute).toLowerCase()}`}
    title={busy ? 'Syncing calendars…' : `Calendars · ${syncedAgo(last, clock.minute).toLowerCase()}`}
  >
    <Icon name="calendar" size={18} />
    {#if busy}<i class="spin" aria-hidden="true"></i>{:else if problems}<i class="warn" aria-hidden="true"></i>{/if}
  </button>
{/if}

{#if open && btn}
  <Popover anchor={btn} onclose={() => (open = false)} label="Calendars" width={320}>
    <div class="cp">
      <div class="head">
        <div>
          <p class="t">Calendars</p>
          <p class="s tnum">{busy ? 'Syncing…' : done ? 'Up to date' : syncedAgo(last, clock.minute)}</p>
        </div>
        <button class="btn btn-primary sync" onclick={sync} disabled={busy}>
          <span class="ic" class:turn={busy}><Icon name={done ? 'check' : 'refresh'} size={14} stroke={2.2} /></span>
          {busy ? 'Syncing' : 'Sync now'}
        </button>
      </div>
      <ul>
        {#each accounts as a (a.id)}
          <li class:bad={!!a.error}>
            <i style:background={a.calendars.find((c) => c.enabled)?.color ?? 'var(--ink-3)'}></i>
            <span class="n">{accountName(a)}</span>
            <span class="w tnum">{a.error ? (a.errorCode === 'reconnect' ? 'Needs you' : 'Couldn’t sync') : syncedAgo(a.lastSyncAt, clock.minute).replace('Synced ', '')}</span>
          </li>
        {/each}
      </ul>
      <div class="every">
        <span>Check for changes</span>
        <Segmented label="How often calendars sync" options={cadences.filter((c) => c.value !== '360')} value={every} onchange={setEvery} />
      </div>
      <button
        class="manage"
        onclick={() => {
          open = false;
          view.sheet = { kind: 'calendars' };
        }}>{problems ? 'Fix and manage calendars' : 'Manage calendars'} <Icon name="chevron-right" size={14} /></button
      >
    </div>
  </Popover>
{/if}

<style>
  .cal {
    position: relative;
  }
  .spin {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    border-top-color: var(--focus-ring);
    animation: spin 0.9s linear infinite;
  }
  .warn {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--warm);
    box-shadow: 0 0 0 2px var(--ground);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .cp {
    display: grid;
    gap: var(--s-3);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .t {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 500;
  }
  .s {
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .sync {
    gap: 6px;
    height: 32px;
  }
  .ic {
    display: grid;
  }
  .ic.turn {
    animation: spin 0.9s linear infinite;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  li {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    font-size: var(--t-sm);
  }
  li i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .n {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .w {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  li.bad .w {
    color: var(--ink);
    padding: 1px 7px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--warm) 22%, transparent);
  }
  .every {
    display: grid;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .manage {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    margin-left: -8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .manage:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  :global([data-motion='calm']) .spin,
  :global([data-motion='calm']) .ic.turn {
    animation-duration: 2.4s;
  }
</style>
