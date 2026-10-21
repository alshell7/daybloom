<script lang="ts">
  // Settings › Screen › Phone (Android only): what reminders and alarms are allowed to do, with
  // a one-tap way to Android's own switch for each; the home-screen widgets; and the Time
  // Tracker's usage access. It re-reads everything when you come back from Android's settings.
  import { onMount } from 'svelte';
  import Icon from '../../lib/Icon.svelte';
  import { deviceCall } from '../../lib/native/device.svelte';
  import { isOn } from '../../lib/addons/registry';

  interface Access {
    notifications: boolean;
    exactAlarms: boolean;
    fullScreen: boolean;
    unrestricted: boolean;
  }

  let access = $state<Access | null>(null);
  let usage = $state<boolean | null>(null);
  let note = $state('');

  async function read() {
    access = await deviceCall<Access>('reminderAccess').catch(() => null);
    usage = isOn('tracker') ? ((await deviceCall<{ granted: boolean }>('usageAccess').catch(() => null))?.granted ?? null) : null;
  }

  onMount(() => {
    void read();
    const back = () => document.visibilityState === 'visible' && void read();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  });

  async function notifications() {
    try {
      const n = await import('@tauri-apps/plugin-notification');
      if ((await n.requestPermission()) !== 'granted') await deviceCall('openSettings', { which: 'notifications' });
    } catch {
      await deviceCall('openSettings', { which: 'notifications' }).catch(() => {});
    }
    void read();
  }

  const open = (which: string) => () => void deviceCall('openSettings', { which }).catch(() => {});

  async function pin(kind: 'dial' | 'alef') {
    note = '';
    const r = await deviceCall<{ asked: boolean }>('pinWidget', { kind }).catch(() => null);
    if (!r?.asked) note = 'Your home screen doesn’t let apps add widgets. Long-press the home screen, tap Widgets and find Daybloom.';
  }

  const rows = $derived(
    access
      ? [
          { id: 'notifications', label: 'Notifications', on: access.notifications, why: 'Block starts, heads-ups and salah times', fix: notifications },
          { id: 'exactAlarms', label: 'On-time alarms', on: access.exactAlarms, why: 'Reminders arrive on the minute', fix: open('exactAlarms') },
          { id: 'fullScreen', label: 'Alarms over the lock screen', on: access.fullScreen, why: 'An alarm opens full screen, like a clock', fix: open('fullScreen') },
          { id: 'battery', label: 'Run in the background', on: access.unrestricted, why: 'Some phones pause apps to save battery. Allow this if a reminder ever comes late.', fix: open('battery') },
        ]
      : [],
  );
</script>

<section aria-labelledby="phone-heading">
  <h3 id="phone-heading">Phone</h3>
  <p class="label">Reminders and alarms</p>
  {#each rows as r (r.id)}
    <div class="row">
      <span class="what">
        <span>{r.label}</span>
        <span class="why">{r.why}</span>
      </span>
      {#if r.on}
        <span class="chip"><Icon name="check" size={12} /> On</span>
      {:else}
        <button class="btn btn-soft" onclick={r.fix}>Turn on</button>
      {/if}
    </div>
  {/each}

  <p class="label">Home screen</p>
  <div class="actions">
    <button class="btn btn-soft" onclick={() => pin('dial')}><Icon name="dial" size={14} /> Add the dial</button>
    {#if isOn('alef')}<button class="btn btn-soft" onclick={() => pin('alef')}><Icon name="bot" size={14} /> Add Alef</button>{/if}
  </div>
  {#if note}<p class="hint" aria-live="polite">{note}</p>{/if}

  {#if usage !== null}
    <p class="label">Time Tracker</p>
    <div class="row">
      <span class="what">
        <span>Know which app is in front</span>
        <span class="why">Android calls this usage access. Only the app’s name is read, on this phone.</span>
      </span>
      {#if usage}
        <span class="chip"><Icon name="check" size={12} /> On</span>
      {:else}
        <button class="btn btn-soft" onclick={() => void deviceCall('usageSettings')}>Allow</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--s-2);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .label {
    margin: var(--s-3) 0 var(--s-1);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 52px;
    font-size: var(--t-sm);
  }
  .what {
    display: grid;
    gap: 2px;
    color: var(--ink);
  }
  .why {
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.4;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    color: var(--ink-2);
    font-size: var(--t-xs);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
</style>
