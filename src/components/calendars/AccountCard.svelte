<script lang="ts">
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { CalendarAccount } from '../../lib/calendar/types';
  import { calendarState, connectGoogleAccount, syncNow, upcomingCount } from '../../lib/calendarBridge.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { eventCount, SOURCE_ICON, sourceOfDisplayUrl, syncedAgo, type PanelFix } from './guides';
  import Spinner from './Spinner.svelte';

  let {
    account,
    onfix,
  }: {
    account: CalendarAccount;
    /** Fixes that need the add-a-calendar area (a new link, the Google client setup). */
    onfix: (fix: PanelFix, account: CalendarAccount) => void;
  } = $props();

  type Fix = { kind: 'reconnect' | 'retry' | PanelFix; label: string };

  let confirming = $state(false);
  let removing = $state(false);
  let fixing = $state(false);
  let fixError = $state('');
  let cancelBtn: HTMLButtonElement | undefined = $state();

  const svc = $derived(calendarState.service);
  const rm = $derived(view.reducedMotion);
  const isGoogle = $derived(account.provider === 'google');
  const icon = $derived(isGoogle ? 'google' : SOURCE_ICON[sourceOfDisplayUrl(account.displayUrl)]);
  const syncing = $derived(calendarState.status === 'syncing' && account.enabled);
  const problem = $derived(account.enabled ? (account.error ?? null) : null);
  const problemText = $derived(problem === 'reconnect' ? 'Google needs you to sign in again.' : problem);

  const fix = $derived.by((): Fix | null => {
    if (!problem) return null;
    if (problem === 'reconnect') return { kind: 'reconnect', label: 'Sign in again' };
    const code = account.errorCode;
    if (code === 'network') return { kind: 'retry', label: 'Try again' };
    if (isGoogle && code === 'config') return { kind: 'setup-google', label: 'Set up Google' };
    if (!isGoogle && (code === 'http' || code === 'invalid')) return { kind: 'replace-link', label: 'Paste a new link' };
    return { kind: 'retry', label: 'Try again' };
  });

  async function runFix(f: Fix) {
    fixError = '';
    if (f.kind === 'replace-link' || f.kind === 'setup-google') {
      onfix(f.kind, account);
      return;
    }
    fixing = true;
    try {
      if (f.kind === 'reconnect') await connectGoogleAccount();
      else await syncNow();
    } catch (e) {
      fixError = (e as Error)?.message ?? String(e);
    } finally {
      fixing = false;
    }
  }

  async function askRemove() {
    confirming = true;
    await tick();
    cancelBtn?.focus();
  }

  async function remove() {
    removing = true;
    try {
      await svc?.removeAccount(account.id);
    } finally {
      removing = false;
    }
  }
</script>

<article class="card" class:paused={!account.enabled} aria-label={account.label}>
  <div class="head">
    <span class="mark"><Icon name={icon} size={16} /></span>
    <div class="who">
      <p class="label" title={account.label}>{account.label}</p>
      {#if !account.enabled}
        <p class="status">Paused. Its events are hidden.</p>
      {:else if problem}
        <p class="status bad">{problemText}</p>
      {:else if syncing}
        <p class="status"><Spinner size={10} /> Syncing…</p>
      {:else}
        <p class="status tnum">{syncedAgo(account.lastSyncAt, clock.minute)}</p>
      {/if}
      {#if fixError}<p class="status bad" role="alert">{fixError}</p>{/if}
      {#if fix || !account.enabled}
        <div class="fix">
          {#if !account.enabled}
            <button class="btn btn-soft small" onclick={() => svc?.setAccountEnabled(account.id, true)}>Turn on</button>
          {:else if fix}
            <button class="btn btn-soft small" onclick={() => runFix(fix)} disabled={fixing}>
              {#if fixing}<Spinner size={12} />{/if}
              {fix.label}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if account.calendars.length}
    <div class="cals" role="group" aria-label={`Calendars in ${account.label}`}>
      <div class="cals-head" aria-hidden="true"><span>Calendar</span><span>Next 2 weeks</span></div>
      {#each account.calendars as cal (cal.id)}
        {@const n = upcomingCount(account.id, cal.id)}
        <label class="cal" class:off={!cal.enabled}>
          <i class="dot" style:background={cal.color}></i>
          <span class="name" title={cal.name}>{cal.name}</span>
          <span class="count tnum">{n === null ? 'Hidden' : eventCount(n)}</span>
          <input
            type="checkbox"
            class="switch"
            checked={cal.enabled}
            disabled={!account.enabled}
            aria-label={`Show ${cal.name}`}
            onchange={(e) => svc?.setCalendarEnabled(account.id, cal.id, e.currentTarget.checked)}
          />
        </label>
      {/each}
    </div>
  {/if}

  <div class="foot">
    <span class="where" title={isGoogle ? undefined : 'The full link is in your system keychain.'}>
      {#if isGoogle}Google account · read-only{:else}{account.displayUrl ?? 'Calendar link'}{/if}
    </span>
    {#if !confirming}
      <button class="btn btn-quiet small" onclick={askRemove}>Remove</button>
    {/if}
  </div>

  {#if confirming}
    <div class="confirm" transition:slide={{ duration: rm ? 0 : 200, easing: cubicOut }}>
      <p>
        {#if isGoogle}
          Remove this account? Its events leave the dial. Daybloom also signs out of it.
        {:else}
          Remove this calendar? Its events leave the dial. You can add the link again later.
        {/if}
      </p>
      <div class="confirm-row">
        <button class="btn btn-quiet small" bind:this={cancelBtn} onclick={() => (confirming = false)}>Cancel</button>
        <button class="btn btn-danger small" onclick={remove} disabled={removing}>
          {#if removing}<Spinner size={12} />{/if}
          Remove
        </button>
      </div>
    </div>
  {/if}
</article>

<style>
  .card {
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-3) var(--s-2);
  }
  .mark {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--raised);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .label {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 0;
    font-size: var(--t-xs);
    line-height: 1.4;
    color: var(--ink-3);
  }
  .status.bad {
    color: var(--danger);
  }
  .fix {
    margin-top: var(--s-2);
  }
  .small {
    height: 30px;
    padding: 0 var(--s-3);
    gap: 6px;
    font-size: 12.5px;
  }
  .cals {
    padding: 0 var(--s-3) var(--s-1);
  }
  .cals-head {
    display: flex;
    justify-content: space-between;
    padding: var(--s-1) calc(38px + var(--s-3)) var(--s-1) 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .cal {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 36px;
    border-top: 1px solid var(--line);
    font-size: var(--t-sm);
    cursor: pointer;
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--dur-2) var(--ease-out);
  }
  .count {
    flex: none;
    margin-right: var(--s-1);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .cal.off .name,
  .cal.off .count {
    color: var(--ink-3);
  }
  .cal.off .dot {
    opacity: 0.35;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
    border-top: 1px solid var(--line);
    min-height: 40px;
  }
  .where {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .confirm {
    padding: 0 var(--s-3) var(--s-3);
  }
  .confirm p {
    margin: var(--s-1) 0 var(--s-2);
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink-2);
  }
  .confirm-row {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
  }
  .paused .cals {
    opacity: 0.6;
  }

  /* Switch, as in Settings: the thumb squishes while pressed. */
  .switch {
    appearance: none;
    flex: none;
    width: 38px;
    height: 22px;
    margin: 0;
    border-radius: 11px;
    background: var(--line-strong);
    position: relative;
    cursor: pointer;
    transition: background var(--dur-2) var(--ease-out);
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition:
      transform var(--dur-2) var(--ease-settle),
      width var(--dur-1) var(--ease-out);
  }
  .switch:checked {
    background: var(--focus-ring);
  }
  .switch:checked::after {
    transform: translateX(16px);
  }
  .switch:active::after {
    width: 23px;
  }
  .switch:checked:active::after {
    transform: translateX(11px);
  }
  .switch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
