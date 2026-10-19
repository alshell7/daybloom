<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { CalendarAccount } from '../../lib/calendar/types';
  import { calendarState, syncNow } from '../../lib/calendarBridge.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import AccountCard from './AccountCard.svelte';
  import AddGoogle from './AddGoogle.svelte';
  import AddLink from './AddLink.svelte';
  import Spinner from './Spinner.svelte';
  import type { PanelFix } from './guides';

  type Choice = 'google' | 'ics';

  let { add = undefined }: { add?: Choice } = $props();

  let choice = $state<Choice | null>(null);
  let replacing = $state<{ id: string; label: string } | null>(null);
  let googleSetup = $state(false);
  let syncing = $state(false);
  let announce = $state('');
  let addSection: HTMLElement | undefined = $state();

  const rm = $derived(view.reducedMotion);
  const accounts = $derived(calendarState.accounts);
  const busySync = $derived(syncing || calendarState.status === 'syncing');

  // `view.sheet = { kind: 'calendars', add: 'ics' }` opens straight on that choice.
  $effect.pre(() => {
    if (add) choice = add;
  });

  function pick(next: Choice) {
    choice = choice === next ? null : next;
    replacing = null;
    googleSetup = false;
  }

  async function syncAll() {
    syncing = true;
    try {
      await syncNow();
    } finally {
      syncing = false;
    }
  }

  async function onfix(fix: PanelFix, account: CalendarAccount) {
    if (fix === 'replace-link') {
      choice = 'ics';
      replacing = { id: account.id, label: account.label };
    } else {
      choice = 'google';
      googleSetup = true;
    }
    await tick();
    reveal(addSection);
  }

  /** Scroll the panel's own scroller to `el` (scrollIntoView would also shift the clipped panel). */
  function reveal(el: HTMLElement | undefined) {
    let scroller = el?.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!el || !scroller) return;
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top, behavior: rm ? 'auto' : 'smooth' });
  }

  async function onLinkAdded(account: CalendarAccount) {
    const old = replacing;
    replacing = null;
    choice = null;
    announce = `Added ${account.label}.`;
    // A new link means a new account; the broken one it replaces goes.
    if (old && old.id !== account.id) await calendarState.service?.removeAccount(old.id);
  }

  function onGoogleAdded(account: CalendarAccount) {
    choice = null;
    googleSetup = false;
    announce = `Connected ${account.label}.`;
  }
</script>

{#if !calendarState.service}
  <div class="intro">
    <span class="intro-mark"><Icon name="calendar" size={22} /></span>
    <p class="intro-text">Calendar support isn’t included in this build.</p>
  </div>
{:else}
  {#if accounts.length}
    <section aria-labelledby="calendars-connected">
      <div class="sec-head">
        <h3 id="calendars-connected">Connected</h3>
        <button class="btn btn-quiet small" onclick={syncAll} disabled={busySync}>
          {#if busySync}
            <Spinner size={12} /> Syncing…
          {:else}
            <Icon name="refresh" size={14} /> Sync now
          {/if}
        </button>
      </div>
      <div class="cards">
        {#each accounts as acc (acc.id)}
          <div
            animate:flip={{ duration: rm ? 0 : 240, easing: cubicOut }}
            in:fly={{ y: 8, duration: rm ? 0 : 260, easing: cubicOut }}
            out:slide={{ duration: rm ? 0 : 200, easing: cubicOut }}
          >
            <AccountCard account={acc} {onfix} />
          </div>
        {/each}
      </div>
    </section>
  {:else}
    <div class="intro">
      <span class="intro-mark"><Icon name="calendar" size={22} /></span>
      <p class="intro-title">Bring in your calendars</p>
      <p class="intro-text">Your events appear on the dial, next to your blocks. Daybloom only reads them. It never changes them.</p>
    </div>
  {/if}

  <section class="add" aria-labelledby="calendars-add" bind:this={addSection}>
    <h3 id="calendars-add">Add a calendar</h3>
    <div class="choices">
      <button class="choice" class:on={choice === 'google'} aria-expanded={choice === 'google'} onclick={() => pick('google')}>
        <span class="c-mark"><Icon name="google" size={18} /></span>
        <span class="c-title">Google account</span>
        <span class="c-sub">Sign in once. See all your Google calendars.</span>
      </button>
      <button class="choice" class:on={choice === 'ics'} aria-expanded={choice === 'ics'} onclick={() => pick('ics')}>
        <span class="c-mark"><Icon name="link" size={18} /></span>
        <span class="c-title">Calendar link</span>
        <span class="c-sub">Paste an ICS or webcal link from any app.</span>
      </button>
    </div>

    {#if choice === 'google'}
      <div class="choice-body" in:fly={{ y: 8, duration: rm ? 0 : 240, easing: cubicOut }}>
        <AddGoogle showSetup={googleSetup} onadded={onGoogleAdded} />
      </div>
    {:else if choice === 'ics'}
      <div class="choice-body" in:fly={{ y: 8, duration: rm ? 0 : 240, easing: cubicOut }}>
        {#key replacing?.id}
          <AddLink
            {replacing}
            onadded={onLinkAdded}
            oncancel={() => {
              choice = null;
              replacing = null;
            }}
          />
        {/key}
      </div>
    {/if}
  </section>

  <p class="visually-hidden" aria-live="polite">{announce}</p>
{/if}

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child,
  .intro + section {
    border-top: 0;
  }
  section:first-child {
    padding-top: 0;
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
  }
  .sec-head h3 {
    margin: 0;
  }
  .small {
    height: 30px;
    padding: 0 var(--s-3);
    gap: 6px;
    font-size: 12.5px;
  }
  .cards {
    display: grid;
    gap: var(--s-2);
  }

  .intro {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: var(--s-1);
    padding: var(--s-4) var(--s-4) var(--s-5);
  }
  .intro-mark {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: var(--s-2);
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink);
  }
  .intro-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .intro-text {
    margin: 0;
    max-width: 30ch;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--s-2);
  }
  .choice {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 2px;
    padding: var(--s-3);
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    text-align: left;
    transition:
      border-color var(--dur-1) var(--ease-out),
      background var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .choice:hover {
    border-color: var(--ink-3);
  }
  .choice:active {
    transform: scale(0.98);
  }
  .choice.on {
    border-color: var(--ink);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .c-mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-bottom: var(--s-2);
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }
  .choice.on .c-mark {
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .c-title {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
  }
  .c-sub {
    font-size: var(--t-xs);
    line-height: 1.4;
    color: var(--ink-3);
  }
  .choice-body {
    margin-top: var(--s-4);
  }
</style>
