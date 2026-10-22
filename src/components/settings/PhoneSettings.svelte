<script lang="ts">
  // Settings › Screen › Phone (Android only): what reminders and alarms are allowed to do, with
  // a one-tap way to Android's own switch for each; the home-screen widgets; and the Time
  // Tracker's usage access. It re-reads everything when you come back from Android's settings.
  import { onMount } from 'svelte';
  import Icon from '../../lib/Icon.svelte';
  import { deviceCall } from '../../lib/native/device.svelte';
  import { isOn } from '../../lib/addons/registry';
  import { formatTime } from '../../lib/engine/time';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';

  interface Access {
    notifications: boolean;
    exactAlarms: boolean;
    fullScreen: boolean;
    unrestricted: boolean;
    /** Reminders go through the alarm clock (Reminders.kt `clock`), and why "auto" chose it. */
    onTime: 'auto' | 'clock' | 'standard';
    clock: boolean;
    loose: boolean;
    late: number;
    lateMin: number;
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
    return () => {
      document.removeEventListener('visibilitychange', back);
      clearTimeout(tryClear);
    };
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

  let switching = $state(false);
  async function useClock(on: boolean) {
    switching = true;
    await deviceCall('reminderMode', { mode: on ? 'clock' : 'standard' }).catch(() => {});
    await read();
    switching = false;
  }
  // A real alarm a few seconds from now, rung by Android like a planned one: you can close
  // Daybloom or lock the phone first and see that it still rings.
  const TRY_IN = 15_000;
  let tryAt = $state(0);
  let tryNote = $state('');
  let tryClear: ReturnType<typeof setTimeout> | undefined;
  async function tryAlarm() {
    const a = settings.value.alarm;
    const at = Date.now() + TRY_IN;
    const item = { id: 'try-alarm', at, kind: 'alarm', title: 'Daybloom alarm', body: 'This is how your alarms ring.', tone: a.tone, ringForMin: 1, snoozeMin: a.snooze, gentle: a.gentle, volume: a.volume };
    const ok = await deviceCall('testAlarm', { items: [item] }).then(
      () => true,
      () => false,
    );
    tryAt = ok ? at : 0;
    tryNote = ok ? `It rings at ${formatTime(at, view.hour12)}. Lock the phone or close Daybloom now if you like.` : 'The alarm couldn’t be set. Check “On-time alarms” above.';
    clearTimeout(tryClear);
    tryClear = setTimeout(() => ((tryAt = 0), (tryNote = '')), TRY_IN + 60_000);
  }

  const clockWhy = $derived(
    !access || access.onTime !== 'auto'
      ? 'Keeps every reminder on the minute. Your status bar then shows the next one as an alarm.'
      : access.late > 0
        ? `A reminder came ${Math.max(2, access.lateMin)} min late on this phone, so Daybloom changed to the alarm clock. Your status bar shows the next one.`
        : access.loose
          ? 'This phone can delay other reminders by up to an hour. The alarm clock keeps them on the minute. Your status bar shows the next one.'
          : 'Keeps every reminder on the minute. Your status bar then shows the next one as an alarm. Daybloom turns this on by itself if a reminder comes late.',
  );

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
  {#if access?.exactAlarms}
    <label class="row">
      <span class="what">
        <span>Use the alarm clock for reminders</span>
        <span class="why">{clockWhy}</span>
      </span>
      <input
        type="checkbox"
        class="switch"
        checked={access.clock}
        disabled={switching}
        onchange={(e) => {
          const want = e.currentTarget.checked;
          e.currentTarget.checked = access?.clock ?? false;
          void useClock(want);
        }}
      />
    </label>
  {/if}
  <div class="row">
    <span class="what">
      <span>Try the alarm</span>
      <span class="why" aria-live="polite">{tryNote || 'It rings in 15 seconds, also with Daybloom closed or the phone locked.'}</span>
    </span>
    <button class="btn btn-soft" onclick={tryAlarm} disabled={tryAt > 0}>Try it</button>
  </div>

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
    padding: 6px 0;
    font-size: var(--t-sm);
  }
  .what {
    display: grid;
    flex: 1 1 0;
    min-width: 0;
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
