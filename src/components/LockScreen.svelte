<script lang="ts">
  // The app lock's screen (lib/lock.svelte.ts): over everything, until the PIN or (a phone)
  // the fingerprint opens it. Digits from a keyboard work too. Forgetting the PIN is never a
  // dead end: turning the lock off keeps every plan, and only asks sync for its password again.
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { haptic } from '../lib/haptics';
  import Icon from '../lib/Icon.svelte';
  import { lock } from '../lib/lock.svelte';
  import { platform } from '../lib/platform';
  import { d1Sync, githubSync } from '../lib/sync/sync.svelte';
  import { view } from '../lib/stores/view.svelte';

  let pin = $state('');
  let wrong = $state(false);
  let note = $state('');
  let busy = $state(false);
  let forgot = $state(false);
  let now = $state(Date.now());
  const waiting = $derived(lock.waitUntil > now);
  const waitS = $derived(Math.ceil((lock.waitUntil - now) / 1000));

  async function press(d: string) {
    if (busy || waiting || pin.length >= lock.length) return;
    haptic('tick');
    pin += d;
    wrong = false;
    note = '';
    if (pin.length === lock.length) {
      busy = true;
      const ok = await lock.tryPin(pin);
      busy = false;
      if (ok) haptic('done');
      else {
        haptic('no');
        wrong = true;
        note = lock.waitUntil > Date.now() ? 'Take a short pause, then try again.' : 'That isn’t it. Try again.';
        setTimeout(() => (pin = ''), 320);
      }
    }
  }
  function back() {
    if (!pin) return;
    haptic('tick');
    pin = pin.slice(0, -1);
  }

  async function fingerprint() {
    note = '';
    try {
      await lock.tryBio();
      haptic('done');
    } catch (e) {
      note = e instanceof Error ? e.message : String(e);
    }
  }

  async function reset() {
    // Sync's key on this device goes too, so the lock can't be bypassed to reach the vault.
    for (const s of [githubSync, d1Sync]) if (s.unlocked) await s.lockHere().catch(() => {});
    await lock.turnOff();
    view.say('The lock is off. Set a new PIN any time in Settings.');
  }

  function key(e: KeyboardEvent) {
    if (/^\d$/.test(e.key)) void press(e.key);
    else if (e.key === 'Backspace') back();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    // A phone with the fingerprint on asks at once.
    if (lock.bio) void fingerprint();
    return () => clearInterval(t);
  });
</script>

<svelte:window onkeydown={key} />

<div class="lock" role="dialog" aria-modal="true" aria-label="Daybloom is locked" transition:fade={{ duration: view.reducedMotion ? 0 : 160 }}>
  <div class="top">
    <span class="mark" aria-hidden="true"><Icon name="lock" size={22} stroke={2} /></span>
    <h2>Daybloom is locked</h2>
    <p class="sub">{waiting ? `Try again in ${waitS} s` : lock.bio ? 'Your fingerprint or your PIN' : 'Enter your PIN'}</p>
    <div class="dots" class:wrong aria-label={`${pin.length} of ${lock.length} digits`}>
      {#each Array.from({ length: lock.length }, (_, i) => i) as i (i)}<i class:on={i < pin.length}></i>{/each}
    </div>
    <p class="note" aria-live="polite">{note}</p>
  </div>

  {#if forgot}
    <div class="forgot">
      <p>Turn the lock off? Your plans stay just as they are. If sync is on, it asks for your master password on this device once.</p>
      <div class="row">
        <button class="btn btn-primary" onclick={reset}>Turn the lock off</button>
        <button class="btn btn-quiet" onclick={() => (forgot = false)}>Back</button>
      </div>
    </div>
  {:else}
    <div class="pad" class:off={waiting}>
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d (d)}
        <button class="k" onclick={() => press(d)} disabled={waiting}>{d}</button>
      {/each}
      {#if lock.bio}
        <button class="k fn" onclick={fingerprint} aria-label="Use your fingerprint"><Icon name="fingerprint" size={24} stroke={1.8} /></button>
      {:else}
        <span></span>
      {/if}
      <button class="k" onclick={() => press('0')} disabled={waiting}>0</button>
      <button class="k fn" onclick={back} aria-label="Delete a digit" disabled={!pin}><Icon name="delete" size={22} stroke={1.8} /></button>
    </div>
    <button class="link" onclick={() => (forgot = true)}>Forgot your PIN?</button>
  {/if}
  {#if !platform.isNative}<p class="note">In a browser the lock only hides the page.</p>{/if}
</div>

<style>
  .lock {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    grid-template-rows: 1fr auto auto;
    justify-items: center;
    gap: var(--s-4);
    padding: calc(var(--safe-top, 0px) + 48px) 24px calc(var(--safe-bottom, 0px) + 28px);
    background: var(--ground);
    color: var(--ink);
    font-family: var(--font-ui);
    user-select: none;
    -webkit-user-select: none;
  }
  .top {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 8px;
    text-align: center;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 18px;
    background: var(--surface);
    color: var(--ink-2);
    box-shadow: 0 0 0 1px var(--line);
  }
  h2 {
    margin: 8px 0 0;
    font-size: var(--t-lg);
    font-weight: 500;
  }
  .sub {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .dots {
    display: flex;
    gap: 14px;
    height: 20px;
    align-items: center;
    margin-top: 14px;
  }
  .dots i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
    transition:
      background var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }
  .dots i.on {
    background: var(--ink);
    box-shadow: none;
  }
  .dots.wrong {
    animation: shake 320ms ease-in-out;
  }
  .dots.wrong i.on {
    background: var(--danger, #d9534f);
  }
  @keyframes shake {
    20%,
    60% {
      transform: translateX(-7px);
    }
    40%,
    80% {
      transform: translateX(7px);
    }
  }
  .note {
    min-height: 1.4em;
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    max-width: 30ch;
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 76px);
    gap: 14px 26px;
  }
  .pad.off {
    opacity: 0.45;
  }
  .k {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    font-size: 28px;
    font-weight: 400;
    color: var(--ink);
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--line);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .k:active {
    transform: scale(0.94);
    background: var(--sunken);
  }
  .k.fn {
    display: grid;
    place-items: center;
    background: transparent;
    box-shadow: none;
    color: var(--ink-2);
  }
  .k:disabled {
    opacity: 0.5;
  }
  .link {
    padding: 10px 14px;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .forgot {
    display: grid;
    gap: var(--s-3);
    max-width: 34ch;
    text-align: center;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .forgot .row {
    display: flex;
    gap: var(--s-2);
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
