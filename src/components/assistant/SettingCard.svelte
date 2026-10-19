<script lang="ts">
  // Look and feel, adjustable in place: theme swatches, the dial face, the time zone, the
  // desktop dial.
  import { activeTimeZone, formatTime, systemTimeZone, zoneCity, zoneOffsetLabel } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { PRESET_ORDER, PRESETS } from '../../lib/presets';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { THEMES, type Theme } from '../../lib/themes';
  import Segmented from '../Segmented.svelte';

  let { kind }: { kind: 'theme' | 'dial' | 'zone' | 'widget' } = $props();

  const system = systemTimeZone();
  const zone = $derived((clock.zone, activeTimeZone()));
  const away = $derived(zone !== system);

  function pickTheme(t: Theme) {
    if (t.mode === 'light') settings.value.lightTheme = t.id;
    else settings.value.darkTheme = t.id;
    if (view.dark !== (t.mode === 'dark')) settings.value.theme = t.mode;
  }

  function useZone(z: string) {
    settings.value.timeZone = z === system ? '' : z;
    if (z !== system) settings.value.recentZones = [z, ...settings.value.recentZones.filter((x) => x !== z)].slice(0, 5);
  }

  async function widget(on: boolean) {
    let vis = on;
    try {
      vis = await platform.showWidget(on);
    } catch {
      /* keep the wish */
    }
    settings.value.widget.visible = vis;
  }
</script>

<div class="a-card setting">
  {#if kind === 'theme'}
    <div class="swatches">
      {#each THEMES as t (t.id)}
        {@const on = view.theme.id === t.id}
        <button class="sw" aria-pressed={on} onclick={() => pickTheme(t)} title={`${t.name} · ${t.mode}`}>
          <span class="disc" style:background={t.vars.ground} style:--ring={t.vars.lineStrong}>
            <i style:background={t.vars.raised}></i>
            <b style:background={t.vars.signal}></b>
          </span>
          <span class="a-meta">{t.name}</span>
        </button>
      {/each}
    </div>
    <div class="a-actions">
      <Segmented
        label="Mode"
        value={settings.value.theme}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onchange={(v) => (settings.value.theme = v)}
      />
    </div>
  {:else if kind === 'dial'}
    <Segmented
      label="Dial"
      value={settings.value.preset}
      options={PRESET_ORDER.map((id) => ({ value: id, label: PRESETS[id].name, title: PRESETS[id].hint }))}
      onchange={(id) => (settings.value.preset = id)}
    />
    <p class="a-meta">{PRESETS[settings.value.preset].hint}.</p>
  {:else if kind === 'zone'}
    <div class="row">
      <span class="a-ico quiet"><Icon name="globe" size={15} /></span>
      <div class="txt">
        <strong class="a-title">{zoneCity(zone)} · {formatTime(clock.minute, view.hour12)}</strong>
        <span class="a-meta tnum">{zoneOffsetLabel(zone)}{away ? ` · this computer is on ${zoneCity(system)} time` : " · this computer's own time"}</span>
      </div>
    </div>
    <div class="a-actions">
      {#if away}<button class="a-chip" onclick={() => useZone(system)}><Icon name="rotate" size={13} /> Back to local time</button>{/if}
      {#each settings.value.recentZones.filter((z) => z !== zone).slice(0, 3) as z (z)}
        <button class="a-chip quiet" onclick={() => useZone(z)}>{zoneCity(z)}</button>
      {/each}
    </div>
  {:else}
    <div class="row">
      <span class="a-ico quiet"><Icon name="dial" size={15} /></span>
      <div class="txt">
        <strong class="a-title">Desktop dial</strong>
        <span class="a-meta">{settings.value.widget.visible ? 'Floating on your desktop' : 'Hidden'}</span>
      </div>
      <button class="a-chip" aria-pressed={settings.value.widget.visible} onclick={() => widget(!settings.value.widget.visible)}>
        {settings.value.widget.visible ? 'Hide' : 'Show'}
      </button>
    </div>
  {/if}
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .sw {
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 6px 2px;
    border-radius: var(--r-sm);
    transition: background var(--dur-1) var(--ease-out);
  }
  .sw:hover {
    background: var(--sunken);
  }
  .sw[aria-pressed='true'] {
    background: var(--raised);
    box-shadow: var(--shadow-1), 0 0 0 1.5px var(--ink);
  }
  .disc {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--ring);
    overflow: hidden;
  }
  .disc i {
    position: absolute;
    inset: 7px 7px 7px 7px;
    border-radius: 50%;
  }
  .disc b {
    position: absolute;
    left: 50%;
    top: 4px;
    width: 2px;
    height: 11px;
    margin-left: -1px;
    border-radius: 1px;
  }
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: center;
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
</style>
