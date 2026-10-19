<script lang="ts">
  import { calendarState } from '../lib/calendarBridge.svelte';
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
  import { needle, whistle } from '../lib/assistant/engine.svelte';
  import type { VoiceLanguage } from '../lib/stores/settings.svelte';

  // Screen-cue colours: the task's own category colour, or one fixed calm colour.
  const CUE_COLORS = [
    { value: '#3D6FE3', label: 'Blue' },
    { value: '#14899B', label: 'Teal' },
    { value: '#25976A', label: 'Green' },
    { value: '#D98A12', label: 'Amber' },
    { value: '#D9467E', label: 'Rose' },
    { value: '#7B61FF', label: 'Violet' },
    { value: '#9AA4B8', label: 'Mist' },
  ];

  const VOICE_LANGS: { value: VoiceLanguage; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'auto', label: 'Detect' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
    { value: 'it', label: 'Italiano' },
    { value: 'nl', label: 'Nederlands' },
    { value: 'pl', label: 'Polski' },
  ];
  import ThemeGallery from './ThemeGallery.svelte';
  import SyncSettings from './SyncSettings.svelte';
  import ScreenPicker from './ScreenPicker.svelte';
  import { ADDONS, isOn, setOn } from '../lib/addons/registry';

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
      <h3>Addons</h3>
      {#each ADDONS as a (a.id)}
        <label class="row">
          <span class="lbl"><span class="ad-dot" style:--ac={a.accent}><Icon name={a.icon} size={12} stroke={2.2} /></span> {a.name} <small>{a.tagline}</small></span>
          <input type="checkbox" class="switch" checked={isOn(a.id)} onchange={(e) => setOn(a.id, e.currentTarget.checked)} />
        </label>
      {/each}
      <button class="btn btn-soft" onclick={() => (view.sheet = { kind: 'addons' })}><Icon name="puzzle" size={14} /> Browse addons</button>
    </section>

    <section>
      <h3>Privacy</h3>
      <label class="row">
        <span class="lbl"><Icon name="eye-off" size={15} /> Privacy mode <small>keep Daybloom out of screenshots, screen recordings and screen sharing · <kbd>⇧</kbd><kbd>⌘</kbd><kbd>P</kbd></small></span>
        <input type="checkbox" class="switch" bind:checked={settings.value.privacy.on} />
      </label>
      <label class="row">
        <span class="lbl"><Icon name="shield" size={15} /> Hide block names <small>on the widget, the HUD and the menu bar while privacy mode is on</small></span>
        <input type="checkbox" class="switch" bind:checked={settings.value.privacy.hideNames} disabled={!s.privacy.on} />
      </label>
      <p class="hint">{platform.os === 'windows' ? 'Windows leaves protected windows out of captures (they show as empty).' : 'macOS leaves protected windows out of screenshots. Some screen recorders can still capture them, so also hide block names when you share your screen.'} You can also switch it from the {platform.os === 'mac' ? 'menu bar' : 'tray'} icon.</p>
    </section>

    <section>
      <h3>Screen cues</h3>
      <p class="hint top">Quiet signals at the edge of your screen that keep the time in view — they never take a click or the keyboard.</p>
      <div class="row">
        <span>Show them</span>
        <Segmented
          label="When screen cues show"
          value={s.screen.when}
          options={[
            { value: 'focus', label: 'In focus sessions' },
            { value: 'blocks', label: 'For every block' },
          ]}
          onchange={(v) => (settings.value.screen.when = v as 'focus' | 'blocks')}
        />
      </div>

      <label class="row">
        <span class="lbl"><Icon name="scan" size={15} /> Edge glow <small>the screen's edge breathes, quicker near the end</small></span>
        <input type="checkbox" class="switch" bind:checked={settings.value.screen.glow} />
      </label>
      {#if s.screen.glow}
        <div class="row sub">
          <span>Strength</span>
          <Segmented
            label="Glow strength"
            value={s.screen.glowStrength}
            options={[
              { value: 'soft', label: 'Soft' },
              { value: 'medium', label: 'Medium' },
              { value: 'strong', label: 'Strong' },
            ]}
            onchange={(v) => (settings.value.screen.glowStrength = v as 'soft' | 'medium' | 'strong')}
          />
        </div>
      {/if}

      <label class="row">
        <span class="lbl"><Icon name="panel-top" size={15} /> Time bar <small>drains as the time goes</small></span>
        <input type="checkbox" class="switch" bind:checked={settings.value.screen.bar} />
      </label>
      {#if s.screen.bar}
        <div class="row sub picker">
          <span>Dock</span>
          <ScreenPicker mode="edge" label="Where the time bar docks" value={s.screen.barDock} onchange={(v) => (settings.value.screen.barDock = v as 'top' | 'bottom' | 'left' | 'right')} />
        </div>
        <div class="row sub">
          <span>Thickness</span>
          <Segmented
            label="Bar thickness"
            value={s.screen.barSize}
            options={[
              { value: 'thin', label: 'Thin' },
              { value: 'bold', label: 'Bold' },
            ]}
            onchange={(v) => (settings.value.screen.barSize = v as 'thin' | 'bold')}
          />
        </div>
      {/if}

      <label class="row">
        <span class="lbl"><Icon name="gauge" size={15} /> HUD <small>a small pill with the time left</small></span>
        <input type="checkbox" class="switch" bind:checked={settings.value.screen.hud} />
      </label>
      {#if s.screen.hud}
        <div class="row sub picker">
          <span>Corner</span>
          <ScreenPicker mode="corner" label="HUD corner" value={s.screen.hudCorner} onchange={(v) => (settings.value.screen.hudCorner = v as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right')} />
        </div>
      {/if}
      {#if s.screen.glow || s.screen.bar || s.screen.hud}
        <div class="row sub colors">
          <span>Colour</span>
          <div class="swatches" role="radiogroup" aria-label="Screen cue colour">
            <button class="sw task" class:on={s.screen.color === 'task'} role="radio" aria-checked={s.screen.color === 'task'} title="The colour of the task" aria-label="The colour of the task" onclick={() => (settings.value.screen.color = 'task')}></button>
            {#each CUE_COLORS as c (c.value)}
              <button class="sw" class:on={s.screen.color === c.value} style:--sw={c.value} role="radio" aria-checked={s.screen.color === c.value} title={c.label} aria-label={c.label} onclick={() => (settings.value.screen.color = c.value)}></button>
            {/each}
            <label class="sw custom" class:on={s.screen.color !== 'task' && !CUE_COLORS.some((c) => c.value === s.screen.color)} style:--sw={s.screen.color !== 'task' ? s.screen.color : '#888'} title="Pick any colour">
              <input type="color" value={s.screen.color !== 'task' ? s.screen.color : '#3d6fe3'} oninput={(e) => (settings.value.screen.color = e.currentTarget.value)} aria-label="Pick any colour" />
            </label>
          </div>
        </div>
      {/if}
      {#if !platform.isNative}<p class="hint">Screen cues need the desktop app.</p>{/if}
      <p class="hint">Turning one on shows a few seconds' preview. The HUD is a lighter companion to the widget: use either, or both.</p>
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
        {#if calendarState.accounts.length}
          <ul class="cal-sum">
            {#each calendarState.accounts as acc (acc.id)}
              <li>
                <Icon name={acc.provider === 'google' ? 'calendar' : 'link'} size={15} />
                <span>{acc.label}</span>
                {#if acc.error}<span class="acc-err">Needs attention</span>{:else}<small>{acc.calendars.filter((c) => c.enabled).length} of {acc.calendars.length} shown</small>{/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">Show events from Google Calendar, Apple iCloud, Outlook or any calendar link, read-only, beside your blocks.</p>
        {/if}
        <div class="cal-actions">
          <button class="btn btn-soft" onclick={() => (view.sheet = { kind: 'calendars' })}><Icon name="calendar" size={14} /> {calendarState.accounts.length ? 'Manage calendars' : 'Connect a calendar'}</button>
          <button class="btn btn-quiet" onclick={() => (view.sheet = { kind: 'calendars', add: 'ics' })}><Icon name="link" size={14} /> Add a calendar link</button>
        </div>
      {/if}
    </section>

    <section>
      <h3>Assistant</h3>
      <div class="row">
        <span>
          {#if needle.status === 'ready'}On this device{needle.loaded ? ` · ${Math.round(needle.memory / 1048576)} MB in use` : ' · sleeping'}
          {:else if needle.status === 'downloading'}Downloading… {Math.round(needle.progress * 100)}%
          {:else if needle.status === 'loading'}Waking up…
          {:else if needle.status === 'error'}Couldn't set up: {needle.error}
          {:else}Not downloaded yet{/if}
        </span>
        {#if needle.status === 'ready'}
          <button class="btn btn-quiet" onclick={() => needle.forget()}>Remove</button>
        {:else if needle.status !== 'downloading' && needle.status !== 'loading'}
          <button class="btn btn-soft" onclick={() => needle.ensureReady().catch(() => {})}>{needle.status === 'error' ? 'Try again' : 'Download (35 MB)'}</button>
        {/if}
      </div>
      {#if needle.status === 'downloading'}
        <span class="dl" aria-hidden="true"><i style:transform={`scaleX(${needle.progress})`}></i></span>
      {/if}
      <p class="hint">“Ask Daybloom” (⌘K) runs Needle by Cactus Compute (Apache-2.0) entirely on your computer — downloaded once, SHA-256 verified, then offline. Without it the assistant still works in basic mode.</p>

      <h4>Voice</h4>
      <div class="row">
        <span>
          {#if whistle.status === 'ready'}Whistle is on this device{whistle.loaded ? ` · ${Math.round(whistle.memory / 1048576)} MB in use` : ''}
          {:else if whistle.status === 'downloading'}Downloading Whistle… {Math.round(whistle.progress * 100)}%
          {:else if whistle.status === 'loading'}Waking up…
          {:else if whistle.status === 'error'}Couldn't set up: {whistle.error}
          {:else}Speech recognition is not downloaded yet{/if}
        </span>
        {#if whistle.status === 'ready'}
          <button class="btn btn-quiet" onclick={() => whistle.forget()}>Remove</button>
        {:else if whistle.status !== 'downloading' && whistle.status !== 'loading'}
          <button class="btn btn-soft" onclick={() => whistle.ensureReady().catch(() => {})}>{whistle.status === 'error' ? 'Try again' : 'Download (17 MB)'}</button>
        {/if}
      </div>
      {#if whistle.status === 'downloading'}
        <span class="dl" aria-hidden="true"><i style:transform={`scaleX(${whistle.progress})`}></i></span>
      {/if}
      <div class="row">
        <span>Language</span>
        <select class="field compact" bind:value={settings.value.voice.language} aria-label="Voice language">
          {#each VOICE_LANGS as l (l.value)}<option value={l.value}>{l.label}</option>{/each}
        </select>
      </div>
      <label class="row">
        <span>Hold <kbd>V</kbd> to talk</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.voice.hotkey} />
      </label>
      <label class="row">
        <span>Soft tones when listening</span>
        <input type="checkbox" class="switch" bind:checked={settings.value.voice.chimes} />
      </label>
      <p class="hint">Hold V and talk, or tap V and speak — it stops when you pause. Whistle by Cactus Compute (Apache-2.0) turns speech into text on this computer; the microphone is on only while you talk. Commands are understood in English.</p>
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

    <SyncSettings />

    <section>
      <h3>Your data</h3>
      <p class="hint">Everything stays on this computer unless you turn on Sync with GitHub. Sign-ins and tokens live in your system keychain.</p>
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
  .lbl {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .lbl small {
    flex-basis: 100%;
    padding-left: 23px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .row.sub {
    padding-left: 23px;
  }
  .row.picker {
    align-items: center;
  }
  .ad-dot {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    color: #fff;
    background: var(--ac);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
  .sw {
    position: relative;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--sw);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
    transition:
      transform var(--dur-1) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .sw:hover {
    transform: scale(1.1);
  }
  .sw.on {
    box-shadow:
      0 0 0 2px var(--raised),
      0 0 0 4px var(--ink);
  }
  .sw.task {
    background: conic-gradient(#3d6fe3, #25976a, #d98a12, #d9467e, #7b61ff, #3d6fe3);
  }
  .sw.custom {
    display: grid;
    place-items: center;
    background: conic-gradient(from 90deg, #f55, #fd5, #5f9, #5cf, #a6f, #f55);
    cursor: pointer;
    overflow: hidden;
  }
  .sw.custom.on {
    background: var(--sw);
  }
  .sw.custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .hint.top {
    margin: -6px 0 var(--s-3);
  }
  h4 {
    margin: var(--s-5) 0 var(--s-2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-2);
  }
  .field.compact {
    width: auto;
    height: 32px;
    padding: 0 10px;
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
  .dl {
    display: block;
    position: relative;
    height: 4px;
    margin-top: 4px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .dl i {
    position: absolute;
    inset: 0;
    background: var(--focus-ring);
    transform-origin: left;
    transition: transform 0.2s linear;
  }
  input[type='range'] {
    accent-color: var(--ink);
    width: 160px;
  }
  .cal-sum {
    display: grid;
    gap: 4px;
    margin: 0 0 var(--s-3);
    padding: 0;
    list-style: none;
  }
  .cal-sum li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
  }
  .cal-sum li span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cal-sum small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .acc-err {
    font-size: var(--t-xs);
    color: var(--danger);
  }
  .cal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-2);
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
