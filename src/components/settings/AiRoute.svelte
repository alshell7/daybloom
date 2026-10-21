<script lang="ts">
  // What one part of Daybloom uses for one skill (what Alef thinks with, what voice input listens
  // with…). It shows the choice; open it to pick this device or a connected service, then, for a
  // service, one of its models or voices, or set up another service. Every choice is saved to
  // Settings › AI at once, so the whole app follows. `compact` drops the skill label, for
  // embedding beside a feature's own settings.
  import { fade } from 'svelte/transition';
  import { ai, aiFile, FEATURES, type Feature, type Source, type SpeakVia } from '../../lib/ai/hub.svelte';
  import { can, LlmError, PROVIDERS, providerOf, synthesize, type ProviderId, type Skill } from '../../lib/ai/providers';
  import { alefFile } from '../../lib/addons/alef/alef.svelte';
  import { hush, playSpoken, speak } from '../../lib/addons/alef/voice';
  import { tinyTts } from '../../lib/addons/alef/tts/tts.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { audioOut } from '../../lib/sound';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { deviceModel, type DeviceId } from './ai/device';
  import DeviceRow from './ai/DeviceRow.svelte';
  import { collapse, expand, pop, rise, SKILLS } from './ai/kit';
  import { aiUi } from './ai/ui.svelte';

  let { feature, skill, compact = false }: { feature: Feature; skill: Skill; compact?: boolean } = $props();

  interface Opt {
    id: string;
    name: string;
    sub: string;
    icon: string;
    /** The service behind it, if any. */
    service?: ProviderId;
    /** False: chosen, but the service isn't connected right now. */
    ready: boolean;
  }

  const SAMPLE = "Hi! I'm Alef. This is how I sound.";
  const still = $derived(view.reducedMotion);
  const meta = $derived(FEATURES.find((f) => f.id === feature)!);
  const isSpeak = $derived(feature === 'alef' && skill === 'speak');
  const id = $derived(`${feature}:${skill}`);
  const open = $derived(aiUi.picker === id);
  const speakUse = $derived(aiFile.value.use.alef.speak);
  const route = $derived(ai.route(feature, skill));
  /** What's chosen: 'device', a service, or (Alef's voice) chirps · device · system · off. */
  const via = $derived<string>(isSpeak ? speakUse.via : route.via);
  /** This feature's own model or voice, if it picked one. */
  const pinned = $derived(isSpeak ? speakUse.voice : route.model);

  /** The on-device model behind "this device", when there is one. */
  const local = $derived.by<DeviceId | null>(() => {
    if (isSpeak) return via === 'device' ? 'voice' : null;
    if (via !== 'device') return null;
    return feature === 'voice' ? 'whistle' : feature === 'smaller' || feature === 'reality' || feature === 'starter' ? null : 'needle';
  });
  const localModel = $derived(local ? deviceModel(local) : null);

  function deviceSub(): string {
    if (feature === 'smaller') return 'Ready-made steps; works offline';
    if (feature === 'reality') return 'Medians of your finished blocks; works offline';
    if (feature === 'starter') return 'A ready-made two-minute start; works offline';
    const m = deviceModel(feature === 'voice' ? 'whistle' : 'needle');
    if (m.status === 'ready') return 'Private; nothing leaves your computer';
    if (m.status === 'downloading') return `Getting ${m.name}… ${Math.round(m.progress * 100)}%`;
    return feature === 'voice' ? `Needs ${m.name} on this computer` : `Basic mode until ${m.name} is here`;
  }

  const services = $derived(PROVIDERS.filter((p) => can(p.id, skill)));
  const live = $derived(services.filter((p) => ai.connected(p.id)));
  const notYet = $derived(services.filter((p) => !ai.connected(p.id)));

  function defaultOf(p: ProviderId): string {
    if (isSpeak) return ai.service(p)?.voice || providerOf(p).speak?.voices[0] || '';
    return ai.configOf(p, skill).model;
  }

  const opts = $derived.by<Opt[]>(() => {
    const own: Opt[] = isSpeak
      ? [
          { id: 'chirps', name: 'Chirps', sub: 'Little robot sounds', icon: 'audio-lines', ready: true },
          { id: 'device', name: 'On-device voice', sub: tinyTts.status === 'ready' ? 'Made on this computer' : 'Not downloaded yet', icon: 'speech', ready: true },
          { id: 'system', name: 'System voice', sub: "Your computer's own voice", icon: 'volume', ready: true },
          { id: 'off', name: 'Off', sub: 'Silent; you can still read it', icon: 'volume-off', ready: true },
        ]
      : [{ id: 'device', name: meta.device[skill] ?? 'This device', sub: deviceSub(), icon: feature === 'smaller' || feature === 'starter' ? 'lightbulb' : feature === 'reality' ? 'chart-column' : 'cpu', ready: true }];
    const svc = (p: (typeof PROVIDERS)[number], ready: boolean): Opt => ({
      id: p.id,
      name: p.name,
      sub: ready ? (via === p.id && pinned) || defaultOf(p.id) || 'Default model' : 'Not ready yet · finish its setup',
      icon: p.id === 'custom' ? 'server' : 'cloud',
      service: p.id,
      ready,
    });
    const out = [...own, ...live.map((p) => svc(p, true))];
    // Chosen before, but not connected now (its key was forgotten, or you stopped sharing).
    const stale = services.find((p) => p.id === via && !ai.connected(p.id));
    if (stale) out.push(svc(stale, false));
    return out;
  });
  const cur = $derived(opts.find((o) => o.id === via) ?? opts[0]);
  const curService = $derived(cur.ready ? cur.service : undefined);
  const detail = $derived(cur.service ? (cur.ready ? cur.sub : 'not ready') : '');

  // ── Choosing ──
  let ticked = $state(false);
  let fresh = $state<string | null>(null);
  /** A word about the voice sample (sounds off, or it couldn't play). */
  let note = $state('');
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  let foldTimer: ReturnType<typeof setTimeout> | undefined;

  function toggle() {
    clearTimeout(foldTimer);
    aiUi.picker = open ? null : id;
  }

  function confirm(what: string) {
    fresh = what;
    note = '';
    ticked = true;
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => (ticked = false), 1500);
  }

  function choose(o: Opt) {
    clearTimeout(foldTimer);
    if (o.id !== via) {
      if (isSpeak) aiFile.value.use.alef.speak = { via: o.id as SpeakVia };
      else ai.setRoute(feature, skill, { via: o.id as Source });
      confirm(o.id);
    }
    // Nothing more to pick: fold away once the tick has landed.
    const needsGet = (isSpeak ? o.id === 'device' && tinyTts.status !== 'ready' : o.id === 'device' && feature !== 'smaller' && feature !== 'reality' && feature !== 'starter' && deviceModel(feature === 'voice' ? 'whistle' : 'needle').status !== 'ready');
    if (!o.service && !needsGet) foldTimer = setTimeout(() => aiUi.picker === id && (aiUi.picker = null), 720);
  }

  /** Models (or voices) to offer for the chosen service; the service's default comes first. */
  const choices = $derived.by<string[]>(() => {
    if (!curService) return [];
    const p = providerOf(curService);
    const def = defaultOf(curService);
    const list = isSpeak ? (p.speak?.voices ?? []) : skill === 'listen' ? (p.listen?.models ?? []) : (aiUi.models[curService] ?? p.suggested);
    return [...new Set([...(pinned ? [pinned] : []), ...list])].filter((m) => m && (m !== def || m === pinned)).slice(0, 40);
  });

  function pick(m?: string) {
    if (!curService) return;
    if (isSpeak) aiFile.value.use.alef.speak = { via: curService, ...(m ? { voice: m } : {}) };
    else ai.setRoute(feature, skill, { via: curService, ...(m ? { model: m } : {}) });
    confirm(`m:${m ?? ''}`);
  }

  // ── The thumb glides to the chosen row ──
  let menu: HTMLDivElement | undefined = $state();
  let thumb = $state<{ y: number; h: number } | null>(null);
  let glide = $state(false);
  $effect(() => {
    const i = opts.findIndex((o) => o.id === cur.id);
    opts.length;
    if (!menu || !open) {
      glide = false;
      return;
    }
    const row = menu.querySelectorAll<HTMLElement>('[role="radio"]')[i];
    if (row) thumb = { y: row.offsetTop, h: row.offsetHeight };
    if (!glide) requestAnimationFrame(() => (glide = true));
  });

  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      aiUi.picker = null;
      return;
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step || !menu) return;
    e.preventDefault();
    const rows = [...menu.querySelectorAll<HTMLElement>('[role="radio"]')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    rows[(at + step + rows.length) % rows.length]?.focus();
  }

  // ── Hearing Alef's voice ──
  let playing = $state(false);
  async function hear() {
    note = '';
    if (playing) {
      hush();
      playing = false;
      return;
    }
    if (!settings.value.sound) {
      note = 'Sounds are off in Settings › Rhythm, so Alef is silent.';
      return;
    }
    const a = alefFile.value.settings;
    playing = true;
    try {
      let total = 0;
      if (cur.service) {
        const conn = await ai.connection('alef', 'speak');
        const out = audioOut();
        if (!conn || !out) throw new LlmError(`${cur.name} isn't ready yet. Finish its setup above.`);
        const voice = speakUse.voice ?? ai.service(conn.provider)?.voice;
        const bytes = await synthesize(conn.config, conn.key, SAMPLE, (u, i) => platform.fetch(u, i), { voice });
        const buf = await out.ctx.decodeAudioData(bytes);
        total = playSpoken(SAMPLE, { samples: buf.getChannelData(0).slice(), rate: buf.sampleRate }, a)?.total ?? 0;
      } else if (via !== 'off') {
        const mode = via === 'device' ? 'speech' : (via as 'chirps' | 'system');
        total = (await speak(SAMPLE, mode, { pitch: a.pitch, volume: a.volume, soundOn: true, tts: tinyTts }))?.total ?? 2;
      }
      setTimeout(() => (playing = false), total * 1000 + 150);
    } catch (e) {
      playing = false;
      note = e instanceof LlmError ? e.message : "Couldn't play it just now.";
    }
  }
</script>

<div class="route" class:compact class:open>
  <div class="line">
    {#if !compact}
      <span class="skill"><Icon name={SKILLS[skill].icon} size={14} /> {SKILLS[skill].label}</span>
    {/if}
    <button class="choice" aria-expanded={open} aria-label={`${meta.name} ${SKILLS[skill].verb} with ${cur.name}${detail ? `, ${detail}` : ''}`} onclick={toggle}>
      <span class="c-icon" class:dim={!cur.ready}><Icon name={cur.icon} size={14} /></span>
      {#key `${cur.id}|${detail}`}
        <span class="c-text" in:rise={{ still }}>
          {cur.name}{#if detail}<small class:warn={!cur.ready}>{` · ${detail}`}</small>{/if}
        </span>
      {/key}
      {#if ticked}<span class="tick" in:pop={{ still }} out:fade={{ duration: still ? 0 : 260 }} aria-hidden="true"><Icon name="check" size={13} stroke={2.4} /></span>{/if}
      <span class="chev" aria-hidden="true"><Icon name="chevron-down" size={15} /></span>
    </button>
    {#if isSpeak}
      <button class="icon-btn hear" onclick={hear} disabled={via === 'off'} aria-label={playing ? 'Stop' : "Hear Alef's voice"} title={playing ? 'Stop' : 'Hear it'}>
        <Icon name={playing ? 'pause' : 'play'} size={14} />
      </button>
    {/if}
  </div>
  {#if note}<p class="note" in:rise={{ still }}>{note}</p>{/if}

  {#if open}
    <div class="wrap" in:expand={{ still }} out:collapse={{ still }}>
      <div class="menu-in">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div class="menu" role="radiogroup" aria-label={`What ${meta.name} ${SKILLS[skill].verb} with`} bind:this={menu} onkeydown={keys}>
          {#if thumb}<span class="thumb" class:glide style:height={`${thumb.h}px`} style:transform={`translateY(${thumb.y}px)`} aria-hidden="true"></span>{/if}
          {#each opts as o (o.id)}
            <button role="radio" aria-checked={o.id === cur.id} class="opt" class:dim={!o.ready} onclick={() => choose(o)}>
              <span class="o-icon"><Icon name={o.icon} size={15} /></span>
              <span class="o-text"><b>{o.name}</b><small>{o.sub}</small></span>
              {#if o.id === cur.id}<span class="o-tick" in:pop={{ still }}><Icon name="check" size={14} stroke={2.4} /></span>{/if}
            </button>
          {/each}
        </div>

        {#if localModel && localModel.status !== 'ready'}
          <DeviceRow model={localModel} inline />
        {/if}

        {#if curService}
          <div class="sub">
            <span class="sub-l">{isSpeak ? 'Voice' : skill === 'listen' ? 'Listening model' : 'Model'} for {meta.name}</span>
            <div class="chips" class:many={choices.length > 8}>
              <button class="chip" class:on={!pinned} class:fresh={fresh === 'm:'} onclick={() => pick()}>Default · {defaultOf(curService)}</button>
              {#each choices as m (m)}
                <button class="chip" class:on={pinned === m} class:fresh={fresh === `m:${m}`} onclick={() => pick(m)}>{m}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if notYet.length}
          <div class="more">
            <span>{live.length ? 'Or set up' : 'Use a service'}</span>
            {#each notYet as p (p.id)}
              <button class="dash" onclick={() => aiUi.setUp(p.id)}><Icon name="plus" size={12} stroke={2.2} /> {p.name}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .route {
    container-type: inline-size;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .skill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 74px;
    flex: none;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  @container (max-width: 300px) {
    .line {
      flex-wrap: wrap;
      row-gap: 4px;
    }
    .skill {
      width: 100%;
    }
  }
  .choice {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 10px 0 6px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    text-align: left;
    font-size: var(--t-sm);
    color: var(--ink);
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .choice:hover {
    border-color: color-mix(in srgb, var(--ink-3) 70%, transparent);
  }
  .choice:active {
    transform: scale(0.985);
  }
  .open .choice {
    border-color: var(--ink-2);
    box-shadow: var(--shadow-1);
  }
  .c-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink-2);
  }
  .c-icon.dim {
    opacity: 0.55;
  }
  .c-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform-origin: 0 50%;
  }
  .c-text small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .c-text small.warn {
    color: color-mix(in srgb, var(--warm) 75%, var(--ink));
  }
  .tick {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--ink-inverse);
    background: var(--focus-ring);
  }
  .chev {
    display: grid;
    flex: none;
    color: var(--ink-3);
    transition: transform 420ms cubic-bezier(0.34, 1.4, 0.64, 1);
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .hear {
    flex: none;
    width: 34px;
    height: 34px;
    background: var(--sunken);
  }
  .note {
    margin: 6px 0 0;
    font-size: var(--t-xs);
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
    line-height: 1.45;
    transform-origin: 0 0;
  }

  /* The menu: a sunken track like the segmented control, its raised thumb gliding to the choice. */
  .menu-in {
    padding-top: 8px;
  }
  .menu {
    position: relative;
    display: grid;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--sunken);
    isolation: isolate;
  }
  .thumb {
    position: absolute;
    top: 0;
    left: 3px;
    right: 3px;
    z-index: -1;
    border-radius: 11px;
    background: var(--raised);
    box-shadow: var(--shadow-1);
  }
  .thumb.glide {
    transition: transform 560ms cubic-bezier(0.34, 1.3, 0.64, 1);
    transition-timing-function: linear(0, 0.041, 0.143, 0.279, 0.427, 0.573, 0.706, 0.819, 0.911, 0.981, 1.03, 1.061, 1.078, 1.083, 1.081, 1.073, 1.062, 1.049, 1.037, 1.026, 1.016, 1.008, 1.002, 0.998, 0.995, 0.994, 0.993, 0.993, 1);
  }
  .opt {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 4px 10px 4px 6px;
    border-radius: 11px;
    text-align: left;
    color: var(--ink-2);
    transition:
      color var(--dur-2) var(--ease-out),
      background var(--dur-2) var(--ease-out);
  }
  .opt:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--raised) 40%, transparent);
  }
  .opt[aria-checked='true'] {
    color: var(--ink);
    background: transparent;
  }
  .opt:active .o-icon {
    transform: scale(0.88);
  }
  .opt.dim {
    opacity: 0.6;
  }
  .o-icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    transition: transform var(--dur-1) var(--ease-out);
  }
  .o-text {
    display: grid;
    min-width: 0;
  }
  .o-text b {
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .o-text small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .o-tick {
    display: grid;
    color: var(--focus-ring);
  }

  .sub {
    display: grid;
    gap: 6px;
    padding: 10px 2px 0;
  }
  .sub-l,
  .more > span {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chips.many {
    max-height: 124px;
    overflow-y: auto;
    padding: 2px;
    margin: -2px;
  }
  .chip {
    max-width: 100%;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font-size: var(--t-xs);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out);
  }
  .chip:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .chip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--ink-inverse);
  }
  .chip.on.fresh {
    animation: settle 520ms both;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 6px;
    padding: 10px 2px 2px;
  }
  .more > span {
    margin-right: 2px;
  }
  .dash {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px 0 8px;
    border-radius: var(--r-pill);
    border: 1px dashed var(--line-strong);
    font-size: var(--t-xs);
    color: var(--ink-2);
    transition:
      border-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .dash:hover {
    border-style: solid;
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .dash:active {
    transform: scale(0.95);
  }

  .compact .choice {
    height: 36px;
  }

  @keyframes settle {
    0% {
      transform: scale(0.9);
    }
    45% {
      transform: scale(1.06);
    }
    75% {
      transform: scale(0.985);
    }
    100% {
      transform: scale(1);
    }
  }
  :global([data-motion='calm']) .thumb.glide,
  :global([data-motion='calm']) .chev {
    transition: none;
  }
  :global([data-motion='calm']) .chip.on.fresh {
    animation: none;
  }
</style>
