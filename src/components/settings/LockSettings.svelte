<script lang="ts">
  // Settings › Privacy › App lock (lib/lock.svelte.ts): a PIN, when it locks again, and on a
  // phone the fingerprint. Turning it off or changing the PIN asks for the current one first.
  import { onMount } from 'svelte';
  import Icon from '../../lib/Icon.svelte';
  import { LOCK_AFTER, PIN_MAX, PIN_MIN, lock } from '../../lib/lock.svelte';
  import { platform } from '../../lib/platform';
  import Segmented from '../Segmented.svelte';

  let mode = $state<'' | 'set' | 'check-off' | 'check-change'>('');
  let first = $state('');
  let again = $state('');
  let current = $state('');
  let problem = $state('');
  let busy = $state(false);
  let bioHere = $state(false);

  onMount(() => void lock.bioAvailable().then((v) => (bioHere = v)));

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, PIN_MAX);
  const AFTER_LABEL: Record<number, string> = { 0: 'At once', 1: '1 min', 5: '5 min', 15: '15 min' };

  function reset() {
    mode = '';
    first = again = current = problem = '';
  }

  async function save() {
    problem = '';
    if (first.length < PIN_MIN) return void (problem = `Use ${PIN_MIN} to ${PIN_MAX} digits.`);
    if (first !== again) return void (problem = 'The two PINs aren’t the same yet.');
    busy = true;
    try {
      await lock.setPin(first);
      reset();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function check() {
    problem = '';
    busy = true;
    const ok = await lock.tryPin(current);
    busy = false;
    if (!ok) return void (problem = lock.waitUntil > Date.now() ? 'Take a short pause, then try again.' : 'That isn’t your PIN.');
    if (mode === 'check-off') {
      await lock.turnOff();
      reset();
    } else {
      current = '';
      mode = 'set';
    }
  }

  // The switch shows what's saved: it changes only once the fingerprint prompt has said yes.
  let asking = $state(false);
  async function bio(on: boolean) {
    if (asking) return;
    problem = '';
    asking = true;
    try {
      await lock.setBio(on);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      asking = false;
    }
  }
</script>

<div class="lockset">
  <label class="row">
    <span class="lbl"><Icon name="lock" size={15} /> App lock <small>Ask for a PIN{platform.isMobile ? ' or your fingerprint' : ''} when Daybloom opens</small></span>
    <input
      type="checkbox"
      class="switch"
      checked={lock.on || mode === 'set'}
      onchange={(e) => {
        if (e.currentTarget.checked) mode = 'set';
        else if (lock.on) {
          e.currentTarget.checked = true;
          mode = 'check-off';
        } else reset();
      }}
    />
  </label>

  {#if mode === 'set'}
    <div class="box">
      <label class="stack"
        ><span>{lock.on ? 'New PIN' : 'Choose a PIN'} ({PIN_MIN}–{PIN_MAX} digits)</span>
        <input class="field" type="password" inputmode="numeric" autocomplete="new-password" value={first} oninput={(e) => (first = e.currentTarget.value = digits(e.currentTarget.value))} /></label
      >
      <label class="stack"
        ><span>The same PIN again</span>
        <input class="field" type="password" inputmode="numeric" autocomplete="new-password" value={again} oninput={(e) => (again = e.currentTarget.value = digits(e.currentTarget.value))} onkeydown={(e) => e.key === 'Enter' && save()} /></label
      >
      <div class="actions">
        <button class="btn btn-primary" onclick={save} disabled={busy}>Save the PIN</button>
        <button class="btn btn-quiet" onclick={reset}>Cancel</button>
      </div>
    </div>
  {:else if mode === 'check-off' || mode === 'check-change'}
    <div class="box">
      <label class="stack"
        ><span>Your current PIN</span>
        <input class="field" type="password" inputmode="numeric" autocomplete="current-password" value={current} oninput={(e) => (current = e.currentTarget.value = digits(e.currentTarget.value))} onkeydown={(e) => e.key === 'Enter' && check()} /></label
      >
      <div class="actions">
        <button class="btn btn-primary" onclick={check} disabled={busy || current.length < PIN_MIN}>{mode === 'check-off' ? 'Turn the lock off' : 'Continue'}</button>
        <button class="btn btn-quiet" onclick={reset}>Cancel</button>
      </div>
    </div>
  {:else if lock.on}
    <div class="row">
      <span>Lock again after leaving</span>
      <Segmented label="Lock again after leaving" value={String(lock.after)} options={LOCK_AFTER.map((m) => ({ value: String(m), label: AFTER_LABEL[m] }))} onchange={(v) => lock.setAfter(Number(v))} />
    </div>
    {#if bioHere}
      <label class="row">
        <span class="lbl">Unlock with your fingerprint<small>{asking ? 'Touch the fingerprint sensor…' : 'Your PIN always works too'}</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={lock.bio}
          disabled={asking}
          onchange={(e) => {
            const want = e.currentTarget.checked;
            e.currentTarget.checked = lock.bio;
            void bio(want);
          }}
        />
      </label>
    {/if}
    <div class="actions">
      <button class="btn btn-soft" onclick={() => (mode = 'check-change')}>Change the PIN</button>
      <button class="btn btn-quiet" onclick={() => lock.lockNow()}>Lock now</button>
    </div>
  {/if}
  {#if problem}<p class="notice" aria-live="polite">{problem}</p>{/if}
  <p class="hint">It hides the planner; it doesn't encrypt your plans on {platform.isMobile ? 'this phone' : 'this computer'}. The PIN stays on this device{platform.isMobile ? ', and while the lock is on Android keeps Daybloom out of the recent-apps preview' : ''}.</p>
</div>

<style>
  .lockset {
    display: grid;
    gap: 2px;
    margin-top: var(--s-3);
  }
  .box {
    display: grid;
    gap: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .stack {
    display: grid;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .field {
    letter-spacing: 0.3em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-2);
  }
  .notice {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--danger, #d9534f);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  .lbl {
    display: grid;
    gap: 1px;
    flex: 1 1 0;
    min-width: 0;
  }
  .lbl :global(svg) {
    vertical-align: -2px;
    margin-right: 4px;
  }
  .lbl small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  @media (max-width: 480px) {
    .row {
      flex-wrap: wrap;
      row-gap: var(--s-2);
    }
    .row > :last-child:not(:first-child) {
      margin-left: auto;
    }
  }
</style>
