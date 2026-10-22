<script lang="ts">
  import { keychain } from '../../lib/platform';
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { accountName, DEFAULT_SYNC_MIN, SYNC_CADENCES } from '../../lib/calendar/service';
  import type { CalendarAccount } from '../../lib/calendar/types';
  import { calendarState, connectGoogleAccount, syncNow } from '../../lib/calendarBridge.svelte';
  import Segmented from '../Segmented.svelte';
  import CalendarRow from './CalendarRow.svelte';
  import IncludeEvents from './IncludeEvents.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { SOURCE_ICON, sourceOfDisplayUrl, syncedAgo, type PanelFix } from './guides';
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
  let renaming = $state(false);
  let draft = $state('');
  let nameField: HTMLInputElement | undefined = $state();

  const shownName = $derived(accountName(account));
  const every = $derived(String(account.syncEveryMin ?? DEFAULT_SYNC_MIN));
  const CADENCE_LABEL: Record<number, string> = { 5: '5m', 10: '10m', 30: '30m', 60: '1h', 360: '6h', 0: 'Manual' };
  const cadences = SYNC_CADENCES.map((m) => ({ value: String(m), label: CADENCE_LABEL[m], title: m === 0 ? 'Only when you press Sync now' : `Every ${m < 60 ? `${m} minutes` : m === 60 ? 'hour' : `${m / 60} hours`}` }));

  async function rename() {
    renaming = true;
    draft = shownName;
    await tick();
    nameField?.select();
  }
  function saveName() {
    if (!renaming) return;
    renaming = false;
    if (draft.trim() !== shownName) void svc?.updateAccount(account.id, { name: draft.trim() });
  }

  const svc = $derived(calendarState.service);
  const rm = $derived(view.reducedMotion);
  const isGoogle = $derived(account.provider === 'google');
  // Google's own .ics links refresh on Google's side only every few hours.
  const googleFeed = $derived(!isGoogle && sourceOfDisplayUrl(account.displayUrl) === 'google');
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

<article class="card" class:paused={!account.enabled} aria-label={shownName}>
  <div class="head">
    <span class="mark"><Icon name={icon} size={16} /></span>
    <div class="who">
      {#if renaming}
        <input
          bind:this={nameField}
          class="field rename"
          bind:value={draft}
          placeholder={account.label}
          maxlength="80"
          aria-label="Account name"
          onblur={saveName}
          onkeydown={(e) => {
            if (e.key === 'Enter') saveName();
            else if (e.key === 'Escape') (e.stopPropagation(), (renaming = false));
          }}
        />
      {:else}
        <p class="label" title={account.name ? `${shownName} · ${account.label}` : account.label}>
          <button class="name-btn" onclick={rename} title="Rename">{shownName}<span class="pen"><Icon name="pen" size={11} /></span></button>
        </p>
      {/if}
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
    <div class="cals" role="group" aria-label={`Calendars in ${shownName}`}>
      <div class="cals-head" aria-hidden="true"><span>Calendar</span><span>Next 2 weeks</span></div>
      {#each account.calendars as cal (cal.id)}
        <CalendarRow {account} {cal} />
      {/each}
    </div>
  {/if}

  {#if account.enabled}
    <IncludeEvents {account} />
    <div class="cadence">
      <span class="c-lbl">Checks for changes{#if googleFeed}<small>Google refreshes these links every few hours</small>{/if}</span>
      <Segmented label="How often it syncs" options={cadences} value={every} onchange={(v) => svc?.updateAccount(account.id, { syncEveryMin: Number(v) })} />
    </div>
  {/if}

  <div class="foot">
    <span class="where" title={isGoogle ? undefined : `The full link is in ${keychain}.`}>
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
  .name-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    font: inherit;
    color: inherit;
    text-align: left;
    border-radius: 6px;
  }
  .name-btn:hover {
    color: var(--ink);
  }
  .pen {
    display: grid;
    color: var(--ink-3);
    opacity: 0;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  .name-btn:hover .pen,
  .name-btn:focus-visible .pen {
    opacity: 1;
  }
  .rename {
    height: 30px;
    width: 100%;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .cadence {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3);
    border-top: 1px solid var(--line);
  }
  .c-lbl {
    display: grid;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .c-lbl small {
    font-size: var(--t-xs);
    color: var(--ink-3);
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


  /* A touch screen has no hover to reveal it: it always shows. */
  @media (hover: none) {
    .name-btn .pen {
      opacity: 1;
      visibility: visible;
    }
  }
</style>
