<script lang="ts">
  import { applyGoogleClient, calendarState, syncNow } from '../lib/calendarBridge.svelte';
  import { formatMinutes } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { platform } from '../lib/platform';
  import { FINISHES, PRESET_ORDER, PRESETS, type FinishId } from '../lib/presets';
  import { sounds } from '../lib/sound';
  import { settings } from '../lib/stores/settings.svelte';
  import { seedSampleDay, taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import Panel from './Panel.svelte';
  import Segmented from './Segmented.svelte';
  import { checkForUpdates, installUpdate, loadVersion, updates } from '../lib/updater.svelte';
  import ThemeGallery from './ThemeGallery.svelte';

  const s = $derived(settings.value);
  const open = $derived(view.sheet?.kind === 'settings');
  $effect(() => {
    if (open && !updates.current) loadVersion().catch(() => {});
  });

  function minutesToStr(m: number) {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  function strToMinutes(v: string) {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  let icsUrl = $state('');
  let icsLabel = $state('');
  let calBusy = $state(false);
  let calError = $state('');

  async function connectGoogle() {
    calError = '';
    calBusy = true;
    try {
      applyGoogleClient();
      await calendarState.service?.connectGoogle();
      await syncNow();
    } catch (e: any) {
      calError = e?.message ?? String(e);
    } finally {
      calBusy = false;
    }
  }

  async function addIcs(e: SubmitEvent) {
    e.preventDefault();
    if (!icsUrl.trim()) return;
    calError = '';
    calBusy = true;
    try {
      await calendarState.service?.addIcs(icsUrl.trim(), icsLabel.trim() || undefined);
      await syncNow();
      icsUrl = '';
      icsLabel = '';
    } catch (e: any) {
      calError = e?.message ?? String(e);
    } finally {
      calBusy = false;
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'daybloom', version: 1, settings: $state.snapshot(settings.value), tasks: $state.snapshot(taskFile.value.tasks) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daybloom-${view.today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      try {
        const data = JSON.parse(txt);
        if (!Array.isArray(data.tasks)) throw new Error('No tasks in that file.');
        taskFile.value = { version: 1, tasks: data.tasks };
        view.say(`Imported ${data.tasks.length} blocks`);
      } catch (err: any) {
        view.say(`Couldn't import: ${err?.message ?? 'unreadable file'}`);
      }
    });
  }

  function clearAll() {
    const snapshot = $state.snapshot(taskFile.value.tasks);
    taskFile.value.tasks = [];
    view.say('Cleared every block', { label: 'Undo', run: () => (taskFile.value.tasks = snapshot) }, 8000);
  }
</script>

{#if open}
  <Panel title="Settings" onclose={() => (view.sheet = null)}>
    <section>
      <h3>Theme</h3>
      <div class="row">
        <span>Mode</span>
        <Segmented label="Mode" value={s.theme} options={[{ value: 'system', label: 'Follow system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onchange={(v) => (settings.value.theme = v)} />
      </div>
      <ThemeGallery />
    </section>

    <section>
      <h3>Dial</h3>
      <div class="refs">
        {#each PRESET_ORDER as id (id)}
          <button class="ref" class:on={s.preset === id} onclick={() => (settings.value.preset = id)}>
            <strong>{PRESETS[id].name}</strong>
            <span>{PRESETS[id].hint}</span>
          </button>
        {/each}
      </div>
      <p class="label">Finish</p>
      <div class="finishes">
        <button class="finish auto" class:on={s.finish === 'auto'} onclick={() => (settings.value.finish = 'auto')} aria-label="Match the theme" title="Match the theme">
          <span style:background={FINISHES[view.theme.finish].face}></span><span style:background={FINISHES[view.theme.finish].bezel}></span>
        </button>
        {#each Object.values(FINISHES) as f (f.id)}
          <button class="finish" class:on={s.finish === f.id} style:--face={f.face} style:--bezel={f.bezel} style:--signal={f.signal} onclick={() => (settings.value.finish = f.id as FinishId)} aria-label={f.name} title={f.name}>
            <i></i>
          </button>
        {/each}
      </div>
      <label class="row">
        <span>Seconds bead</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.showSeconds} />
      </label>
    </section>

    <section>
      <h3>Time</h3>
      <div class="row">
        <span>Clock</span>
        <Segmented label="Clock" value={s.clock} options={[{ value: 'auto', label: 'Auto' }, { value: '12', label: '12h' }, { value: '24', label: '24h' }]} onchange={(v) => (settings.value.clock = v)} />
      </div>
      <div class="row">
        <span>Waking day</span>
        <span class="pair">
          <input type="time" class="field tnum" value={minutesToStr(s.wake)} onchange={(e) => (settings.value.wake = strToMinutes(e.currentTarget.value))} aria-label="Wake" />
          <span class="to">to</span>
          <input type="time" class="field tnum" value={minutesToStr(s.sleep)} onchange={(e) => (settings.value.sleep = strToMinutes(e.currentTarget.value))} aria-label="Sleep" />
        </span>
      </div>
      <p class="hint">Sleep ({formatMinutes(s.sleep, view.hour12)}–{formatMinutes(s.wake, view.hour12)}) is shaded on the ring.</p>
    </section>

    <section>
      <h3>Transitions</h3>
      <div class="row">
        <span>Heads-up before a block ends</span>
        <div class="segmented">
          {#each [0, 2, 5, 10] as m (m)}
            <button aria-pressed={s.headsUp === m} onclick={() => (settings.value.headsUp = m)}>{m ? `${m}m` : 'Off'}</button>
          {/each}
        </div>
      </div>
      <label class="row">
        <span>Notifications</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.notify} />
      </label>
      <label class="row">
        <span>Sounds</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.sound} />
      </label>
      {#if s.sound}
        <div class="row">
          <span>Volume</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={settings.value.volume} onchange={() => sounds.done()} aria-label="Volume" />
        </div>
      {/if}
    </section>

    <section>
      <h3>Gentle support</h3>
      <label class="row">
        <span>Ask “did you finish?” when a block ends</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.nudges.checkIn} />
      </label>
      <label class="row">
        <span>Speak up when a block runs into the next</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.nudges.overrun} />
      </label>
      <label class="row">
        <span>Suggest backlog items that fit free time</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.nudges.gapIdeas} />
      </label>
      <div class="row">
        <span>Time anchors</span>
        <Segmented label="Time anchors" value={s.nudges.anchors} options={[{ value: 'off', label: 'Off' }, { value: 'hourly', label: 'Hourly' }, { value: 'half', label: 'Every 30m' }]} onchange={(v) => (settings.value.nudges.anchors = v)} />
      </div>
      <div class="row">
        <span>Offer a wind-down at</span>
        <span class="pair">
          <input type="time" class="field tnum" value={s.nudges.windDown < 0 ? '' : minutesToStr(s.nudges.windDown)} disabled={s.nudges.windDown < 0} onchange={(e) => (settings.value.nudges.windDown = strToMinutes(e.currentTarget.value))} aria-label="Wind-down time" />
          <input type="checkbox" class="switch" checked={s.nudges.windDown >= 0} onchange={(e) => (settings.value.nudges.windDown = e.currentTarget.checked ? Math.max(0, settings.value.sleep - 60) : -1)} aria-label="Wind-down on" />
        </span>
      </div>
      <p class="hint">Anchors are a soft tick and a line of context, so hours don't quietly vanish. Nothing here ever turns red.</p>
    </section>

    <section>
      <h3>Comfort</h3>
      <div class="row">
        <span>Motion</span>
        <Segmented label="Motion" value={s.motion} options={[{ value: 'system', label: 'System' }, { value: 'full', label: 'Full' }, { value: 'calm', label: 'Calm' }]} onchange={(v) => (settings.value.motion = v)} />
      </div>
      <div class="row">
        <span>Reading font</span>
        <div class="segmented">
          <button aria-pressed={s.font === 'lexend'} onclick={() => (settings.value.font = 'lexend')}>Lexend</button>
          <button aria-pressed={s.font === 'atkinson'} onclick={() => (settings.value.font = 'atkinson')} style="font-family: 'Atkinson Hyperlegible'">Hyperlegible</button>
        </div>
      </div>
    </section>

    <section>
      <h3>Desktop widget</h3>
      <label class="row">
        <span>Show the widget</span>
        <input
          type="checkbox"
          class="switch"
          checked={s.widget.visible}
          onchange={async (e) => (settings.value.widget.visible = await platform.showWidget(e.currentTarget.checked))}
        />
      </label>
      <div class="row">
        <span>Position</span>
        <div class="segmented">
          <button aria-pressed={s.widget.layer === 'top'} onclick={() => { settings.value.widget.layer = 'top'; platform.setWidgetLayer('top'); }}>Float on top</button>
          <button aria-pressed={s.widget.layer === 'desktop'} onclick={() => { settings.value.widget.layer = 'desktop'; platform.setWidgetLayer('desktop'); }}>On desktop</button>
        </div>
      </div>
      <div class="row">
        <span>Dial</span>
        <div class="segmented">
          {#each PRESET_ORDER as id (id)}
            <button aria-pressed={s.widget.preset === id} onclick={() => (settings.value.widget.preset = id)}>{PRESETS[id].name}</button>
          {/each}
        </div>
      </div>
      <div class="row">
        <span>Finish</span>
        <div class="finishes small">
          <button class="finish auto" class:on={s.widget.finish === 'auto'} onclick={() => (settings.value.widget.finish = 'auto')} aria-label="Match the theme" title="Match the theme">
            <span style:background={FINISHES[view.theme.finish].face}></span><span style:background={FINISHES[view.theme.finish].bezel}></span>
          </button>
          {#each Object.values(FINISHES) as f (f.id)}
            <button class="finish" class:on={s.widget.finish === f.id} style:--face={f.face} style:--bezel={f.bezel} style:--signal={f.signal} onclick={() => (settings.value.widget.finish = f.id as FinishId)} aria-label={f.name}><i></i></button>
          {/each}
        </div>
      </div>
      {#if platform.os === 'mac'}
        <label class="row">
          <span>Countdown in the menu bar</span>
          <input type="checkbox" class="switch" bind:checked={settings.value.menuBarTimer} />
        </label>
      {/if}
      <label class="row">
        <span>Open at login</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.launchAtLogin} onchange={(e) => platform.setLaunchAtLogin(e.currentTarget.checked)} />
      </label>
    </section>

    <section>
      <h3>Calendars</h3>
      {#if !calendarState.service}
        <p class="hint">Calendar support isn't included in this build.</p>
      {:else}
        {#each calendarState.accounts as acc (acc.id)}
          <div class="account">
            <div class="acc-head">
              <Icon name={acc.provider === 'google' ? 'calendar' : 'link'} size={16} />
              <span class="acc-label">{acc.label}</span>
              {#if acc.error}<span class="acc-err">{acc.error === 'reconnect' ? 'Needs reconnecting' : 'Sync problem'}</span>{/if}
              <button class="icon-btn" onclick={() => calendarState.service?.removeAccount(acc.id)} aria-label={`Remove ${acc.label}`}><Icon name="x" size={14} /></button>
            </div>
            {#each acc.calendars as cal (cal.id)}
              <label class="cal">
                <input type="checkbox" checked={cal.enabled} onchange={(e) => calendarState.service?.setCalendarEnabled(acc.id, cal.id, e.currentTarget.checked)} />
                <i style:background={cal.color}></i>
                <span>{cal.name}</span>
              </label>
            {/each}
          </div>
        {/each}
        <div class="cal-actions">
          <button class="btn btn-soft" onclick={connectGoogle} disabled={calBusy}>
            <Icon name="plus" size={14} /> Add Google account
          </button>
          {#if calendarState.accounts.length}
            <button class="btn btn-quiet" onclick={() => syncNow()} disabled={calBusy}><Icon name="refresh" size={14} /> Sync</button>
          {/if}
        </div>
        <p class="hint">Add as many Google accounts as you use — work and personal sit side by side, read-only, hatched on the dial.</p>
        <details>
          <summary>Google client ID</summary>
          <p class="hint">Daybloom needs a Google OAuth “Desktop app” client to sign in. See docs/calendar.md.</p>
          <input class="field" placeholder="Client ID" bind:value={settings.value.google.clientId} />
          <input class="field" placeholder="Client secret (desktop clients have one)" bind:value={settings.value.google.clientSecret} />
        </details>
        <form class="ics" onsubmit={addIcs}>
          <p class="label">Or subscribe to any calendar link (ICS / webcal)</p>
          <input class="field" placeholder="https://… .ics" bind:value={icsUrl} />
          <div class="ics-row">
            <input class="field" placeholder="Name" bind:value={icsLabel} />
            <button class="btn btn-soft" disabled={calBusy || !icsUrl.trim()}>Subscribe</button>
          </div>
        </form>
        {#if calError}<p class="error">{calError}</p>{/if}
      {/if}
    </section>

    <section>
      <h3>Updates</h3>
      <div class="row">
        <span>{platform.isNative ? `Daybloom ${updates.current || ''}` : 'Daybloom (browser preview)'}</span>
        <button class="btn btn-soft" onclick={() => checkForUpdates(true)} disabled={updates.status === 'checking' || updates.status === 'downloading'}>
          <Icon name="refresh" size={14} />
          {updates.status === 'checking' ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {#if updates.status === 'none'}
        <p class="hint">You're on the latest version.</p>
      {:else if updates.status === 'available'}
        <div class="row">
          <span>Version {updates.version} is ready.</span>
          <button class="btn btn-primary" onclick={() => installUpdate()}>Update &amp; restart</button>
        </div>
        {#if updates.notes}<p class="hint">{updates.notes}</p>{/if}
      {:else if updates.status === 'error'}
        <p class="hint">Couldn't reach the update feed. {updates.error}</p>
      {/if}
      <label class="row">
        <span>Check for updates automatically</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.autoUpdate} />
      </label>
      <p class="hint">Updates are signed; Daybloom refuses any download that doesn't match its key.</p>
    </section>

    <section>
      <h3>Your data</h3>
      <p class="hint">Everything stays on this computer. Calendar sign-ins live in your system keychain.</p>
      <div class="cal-actions">
        <button class="btn btn-soft" onclick={exportData}>Export</button>
        <label class="btn btn-soft">Import<input type="file" accept="application/json" onchange={importData} hidden /></label>
        <button class="btn btn-quiet" onclick={() => seedSampleDay()}>Add sample day</button>
        <button class="btn btn-danger" onclick={clearAll}>Clear all</button>
      </div>
      <p class="hint keys">Keys: <kbd>N</kbd> new · <kbd>←</kbd><kbd>→</kbd> days · <kbd>T</kbd> today · <kbd>1</kbd>–<kbd>4</kbd> dials · <kbd>F</kbd> focus · <kbd>W</kbd> widget · <kbd>Space</kbd> done</p>
    </section>
  </Panel>
{/if}

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .refs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-2);
  }
  .ref {
    display: grid;
    gap: 2px;
    padding: var(--s-3);
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    text-align: left;
    transition: border-color var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out);
  }
  .ref strong {
    font-family: var(--font-ui);
    font-weight: 500;
  }
  .ref span {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .ref:hover {
    border-color: var(--ink-3);
  }
  .ref.on {
    border-color: var(--ink);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .label {
    margin: var(--s-4) 0 var(--s-2);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .finishes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .finish {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bezel);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    display: grid;
    place-items: center;
    transition: transform var(--dur-2) var(--ease-settle);
  }
  .finishes.small .finish {
    width: 26px;
    height: 26px;
  }
  .finish i {
    width: 70%;
    height: 70%;
    border-radius: 50%;
    background: var(--face);
    position: relative;
  }
  .finish i::after {
    content: '';
    position: absolute;
    left: calc(50% - 1px);
    top: 8%;
    width: 2px;
    height: 42%;
    border-radius: 2px;
    background: var(--signal);
  }
  .finish.auto {
    overflow: hidden;
    display: flex;
    background: none;
  }
  .finish.auto span {
    flex: 1;
    height: 100%;
  }
  .finish:hover {
    transform: scale(1.08);
  }
  .finish.on {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  .row > span:first-child {
    color: var(--ink-2);
  }
  .pair {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .pair .field {
    width: 110px;
    height: 32px;
  }
  .to {
    color: var(--ink-3);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .switch {
    appearance: none;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--line-strong);
    position: relative;
    cursor: pointer;
    transition: background var(--dur-2) var(--ease-out);
    flex: none;
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
    transition: transform var(--dur-2) var(--ease-settle);
  }
  .switch:checked {
    background: var(--focus-ring);
  }
  .switch:checked::after {
    transform: translateX(16px);
  }
  /* the thumb squishes while pressed, like a real toggle */
  .switch:active::after {
    width: 23px;
  }
  .switch:checked:active::after {
    transform: translateX(11px);
  }
  .switch::after {
    transition:
      transform var(--dur-2) var(--ease-settle),
      width var(--dur-1) var(--ease-out);
  }
  input[type='range'] {
    accent-color: var(--ink);
    width: 160px;
  }
  .account {
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    margin-bottom: var(--s-2);
  }
  .acc-head {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .acc-label {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .acc-err {
    font-size: var(--t-xs);
    color: var(--danger);
  }
  .cal {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 30px;
    padding-left: var(--s-5);
    font-size: var(--t-sm);
  }
  .cal i {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .cal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-2);
  }
  details {
    margin-top: var(--s-3);
    font-size: var(--t-sm);
  }
  summary {
    cursor: pointer;
    color: var(--ink-2);
  }
  details .field {
    margin-top: var(--s-2);
    height: 34px;
    font-size: var(--t-sm);
  }
  .ics {
    margin-top: var(--s-3);
    display: grid;
    gap: var(--s-2);
  }
  .ics .label {
    margin: 0;
  }
  .ics .field {
    height: 34px;
    font-size: var(--t-sm);
  }
  .ics-row {
    display: flex;
    gap: var(--s-2);
  }
  .error {
    margin: var(--s-2) 0 0;
    font-size: var(--t-sm);
    color: var(--danger);
  }
  .keys {
    line-height: 2;
  }
  kbd {
    font-family: var(--font-ui);
    font-size: 10.5px;
    padding: 1px 5px;
    margin: 0 1px;
    border-radius: 5px;
    border: 1px solid var(--line-strong);
  }
</style>
