<script lang="ts">
  // Setting Alef up: about you, where it shows, how it looks and sounds, how much it talks, and
  // its brain. The brain and the voice come from Settings › AI (services are set up once there,
  // for every part of Daybloom); here you pick which one Alef uses.
  import { onMount } from 'svelte';
  import { alef, alefFile, EYE_COLORS } from '../../../lib/addons/alef/alef.svelte';
  import { ai, aiFile } from '../../../lib/ai/hub.svelte';
  import { can, PROVIDERS, providerOf } from '../../../lib/ai/providers';
  import { tinyTts, VOICE_BYTES } from '../../../lib/addons/alef/tts/tts.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { session } from '../../../lib/assistant/session.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import EngineBadge from '../../assistant/EngineBadge.svelte';
  import Segmented from '../../Segmented.svelte';
  import AiRoute from '../../settings/AiRoute.svelte';

  const s = $derived(alefFile.value.settings);
  const set = (patch: Partial<typeof alefFile.value.settings>) => Object.assign(alefFile.value.settings, patch);
  const setYou = (patch: Partial<typeof alefFile.value.settings.you>) => (alefFile.value.settings.you = { ...alefFile.value.settings.you, ...patch });

  onMount(() => {
    session.open();
    void ai.refreshKeys();
    void tinyTts.check();
  });

  const openAi = () => (view.sheet = { kind: 'settings', section: 'ai' });

  // ── Voice: Alef's own voices, and any AI service set up to speak ──
  const speak = $derived(aiFile.value.use.alef.speak);
  const VOICE_HINT: Record<string, string> = {
    chirps: 'Little robot sounds in the rhythm of the words.',
    device: 'A small spoken voice, made on this device.',
    system: "Your computer's own voice, a little higher.",
    off: 'Alef stays silent; you can still read what it says.',
  };
  const speakers = $derived(PROVIDERS.filter((p) => can(p.id, 'speak') && ai.connected(p.id)));
  const cloudVoice = $derived(speak.via !== 'chirps' && speak.via !== 'device' && speak.via !== 'system' && speak.via !== 'off' ? speak.via : null);
  function testVoice() {
    alef.perform('happy');
    alef.say("Hi! I'm Alef. This is how I sound.", { voice: true, important: true });
  }

  // ── Brain ──
  const think = $derived(ai.route('alef', 'think'));
  const brain = $derived.by(() => {
    if (think.via === 'device') return { name: 'This device', model: null as string | null, ready: true };
    const svc = ai.service(think.via);
    return { name: providerOf(think.via).name, model: think.model || svc?.model || null, ready: ai.ready('alef', 'think') };
  });
</script>

<div class="as">
  <!-- About you -->
  <section>
    <h4>About you</h4>
    <div class="fieldset">
      <span>What should Alef call you?</span>
      <input class="field" value={s.you.name} oninput={(e) => setYou({ name: e.currentTarget.value.slice(0, 40) })} placeholder="Your name or a nickname" autocomplete="off" maxlength="40" />
    </div>
    <div class="fieldset">
      <span>A few words about you <small>(optional)</small></span>
      <textarea
        class="field area about"
        value={s.you.about}
        oninput={(e) => setYou({ about: e.currentTarget.value.slice(0, 1200) })}
        rows="4"
        maxlength="1200"
        placeholder="For example: I'm a designer. Mornings are my best time. Short, kind nudges help me; long lists don't. I'm learning Spanish."
      ></textarea>
      <small class="count">{s.you.about.length} / 1200 · Alef uses this to fit its help to you. With an AI brain, it is sent with your words.</small>
    </div>
    <div class="line">
      <span class="lbl">Talk to me</span>
      <Segmented
        label="How Alef talks"
        value={s.you.tone}
        onchange={(v) => setYou({ tone: v })}
        options={[
          { value: 'warm', label: 'Warm' },
          { value: 'playful', label: 'Playful' },
          { value: 'calm', label: 'Calm' },
          { value: 'brief', label: 'Brief' },
        ]}
      />
    </div>
  </section>

  <!-- Where -->
  <section>
    <h4>Where Alef shows</h4>
    <label class="row">
      <span><b>In the dial</b><small>In the middle of the planner's dial and in focus mode.</small></span>
      <input type="checkbox" class="switch" checked={s.onDial} onchange={(e) => set({ onDial: e.currentTarget.checked })} />
    </label>
    <label class="row">
      <span><b>On the desktop widget</b><small>Its face, mirrored on the small dial.</small></span>
      <input type="checkbox" class="switch" checked={s.inWidget} onchange={(e) => set({ inWidget: e.currentTarget.checked })} />
    </label>
    <label class="row">
      <span><b>Lively</b><small>Little moves between moments. Off: calmer, fewer moves.</small></span>
      <input type="checkbox" class="switch" checked={s.lively} onchange={(e) => set({ lively: e.currentTarget.checked })} />
    </label>
  </section>

  <!-- Look -->
  <section>
    <h4>Look</h4>
    <div class="line">
      <span class="lbl">Screen</span>
      <Segmented
        label="Screen"
        value={s.screen}
        onchange={(v) => set({ screen: v })}
        options={[
          { value: 'dial', label: 'Dial colours' },
          { value: 'oled', label: 'OLED black' },
        ]}
      />
    </div>
    <label class="row">
      <span><b>Glass shine</b><small>A soft glint across Alef's screen, like light on glass.</small></span>
      <input type="checkbox" class="switch" checked={s.glare} onchange={(e) => set({ glare: e.currentTarget.checked })} />
    </label>
    <div class="line">
      <span class="lbl">Eyes</span>
      <div class="swatches" role="radiogroup" aria-label="Eye colour">
        {#each EYE_COLORS as c (c.id)}
          <button
            role="radio"
            aria-checked={s.eyes.toLowerCase() === c.id.toLowerCase()}
            class="sw"
            class:dial={c.id === 'dial'}
            style:--c={c.id === 'dial' ? alef.screenFor({ ...view.finish }).eye : c.id}
            title={c.name}
            aria-label={c.name}
            onclick={() => set({ eyes: c.id })}
          ></button>
        {/each}
        <label class="sw custom" title="Your own colour" style:--c={s.eyes === 'dial' ? '#888888' : s.eyes}>
          <input type="color" value={s.eyes === 'dial' ? '#5ce1e6' : s.eyes} oninput={(e) => set({ eyes: e.currentTarget.value })} aria-label="Your own eye colour" />
          <Icon name="palette" size={13} />
        </label>
      </div>
    </div>
    <div class="line">
      <span class="lbl">Mood light</span>
      <div class="light">
        <Segmented
          label="Mood light"
          value={s.led === 'feeling' ? 'feeling' : 'fixed'}
          onchange={(v) => set({ led: v === 'feeling' ? 'feeling' : alef.screenFor(view.finish).eye })}
          options={[
            { value: 'feeling', label: 'Follows feelings' },
            { value: 'fixed', label: 'One colour' },
          ]}
        />
        {#if s.led !== 'feeling'}
          <label class="sw custom" style:--c={s.led} title="Light colour">
            <input type="color" value={s.led} oninput={(e) => set({ led: e.currentTarget.value })} aria-label="Mood light colour" />
          </label>
        {/if}
      </div>
    </div>
  </section>

  <!-- Voice -->
  <section>
    <h4>Voice</h4>
    <AiRoute feature="alef" skill="speak" compact />
    <p class="hint">
      {cloudVoice ? `${providerOf(cloudVoice).name}'s voice, through Alef's small speaker.` : VOICE_HINT[speak.via]}
      {#if !speakers.length}<button class="link" onclick={openAi}>Use an AI voice <Icon name="external" size={11} /></button>{/if}
    </p>
    {#if speak.via === 'device'}
      <div class="tts">
        {#if tinyTts.status === 'ready'}
          <span class="ok"><Icon name="check" size={14} /> Alef's voice is on this device.</span>
        {:else if tinyTts.status === 'downloading' || tinyTts.status === 'loading'}
          <span class="bar" role="progressbar" aria-valuenow={Math.round(tinyTts.progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style:width={`${Math.round(tinyTts.progress * 100)}%`}></i></span>
          <span class="muted">{tinyTts.status === 'loading' ? 'Waking up…' : `Downloading… ${Math.round(tinyTts.progress * 100)}%`}</span>
        {:else}
          <button class="btn btn-soft" onclick={() => void tinyTts.download()}><Icon name="download" size={14} /> Get Alef's voice</button>
          <span class="muted">{tinyTts.error ?? `About ${Math.round(VOICE_BYTES / 1e6)} MB, once, checked and kept on this device. Until then, your computer's voice speaks.`}</span>
        {/if}
      </div>
    {/if}
    {#if speak.via !== 'off'}
      <div class="sliders">
        <label>
          <span>Pitch</span>
          <input type="range" min="0.8" max="1.3" step="0.05" value={s.pitch} oninput={(e) => set({ pitch: Number(e.currentTarget.value) })} />
        </label>
        <label>
          <span>Volume</span>
          <input type="range" min="0" max="1" step="0.05" value={s.volume} oninput={(e) => set({ volume: Number(e.currentTarget.value) })} />
        </label>
        <button class="btn btn-soft" onclick={testVoice}><Icon name="play" size={13} /> Test</button>
      </div>
      {#if !settings.value.sound}<p class="hint warn">Sounds are off in Settings, so Alef is silent.</p>{/if}
    {/if}
  </section>

  <!-- Chattiness -->
  <section>
    <h4>How much Alef talks</h4>
    <Segmented
      label="Chattiness"
      value={s.chattiness}
      onchange={(v) => set({ chattiness: v })}
      options={[
        { value: 'quiet', label: 'Quiet' },
        { value: 'some', label: 'Now and then' },
        { value: 'chatty', label: 'Chatty' },
      ]}
    />
    <p class="hint">
      {s.chattiness === 'quiet' ? 'Only its face shows how it feels. It talks when you talk to it.' : s.chattiness === 'some' ? 'A word at the big moments: hello, wins, check-ins, focus.' : 'It says something at most moments: starts, finishes, pokes.'}
    </p>
  </section>

  <!-- Brain -->
  <section>
    <h4>Alef's brain</h4>
    <AiRoute feature="alef" skill="think" compact />
    {#if think.via !== 'device' && !brain.ready}<p class="hint">{brain.name} isn't set up yet, so Alef thinks on this device for now. <button class="link" onclick={openAi}>Set it up <Icon name="external" size={11} /></button></p>{/if}
    {#if think.via === 'device'}<div class="engine"><EngineBadge /></div>{/if}
    <label class="row">
      <span><b>Alef may change my plans</b><small>With an AI brain. Each change shows with an Undo. Off: it only reads and suggests.</small></span>
      <input type="checkbox" class="switch" checked={s.mayChange} onchange={(e) => set({ mayChange: e.currentTarget.checked })} />
    </label>
    <label class="row">
      <span><b>Speaks up in its own words</b><small>With an AI brain, Alef writes its own hellos, check-ins and cheers, a few times a day.</small></span>
      <input type="checkbox" class="switch" checked={s.proactive} onchange={(e) => set({ proactive: e.currentTarget.checked })} />
    </label>
  </section>
</div>

<style>
  .as {
    display: grid;
    gap: var(--s-2);
  }
  section {
    padding: var(--s-3) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
  }
  h4 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: 6px 0;
  }
  .row span {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .row b {
    font-weight: 500;
    font-size: var(--t-sm);
  }
  .row small,
  .fieldset small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .row .switch {
    flex: none;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: 6px 0;
    flex-wrap: wrap;
  }
  .lbl {
    width: 86px;
    flex: none;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .swatches,
  .light {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sw {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--c) 60%, white), var(--c));
    box-shadow:
      0 0 0 2px var(--raised),
      0 0 0 3px var(--line-strong);
    transition:
      transform var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }
  .sw[aria-checked='true'] {
    box-shadow:
      0 0 0 2px var(--raised),
      0 0 0 4px var(--ink);
  }
  .sw:hover {
    transform: scale(1.08);
  }
  /* "The dial's colour": a ring of the finish around its eye colour. */
  .sw.dial {
    background: radial-gradient(circle, var(--c) 0 45%, var(--line-strong) 47% 52%, var(--raised) 54%);
  }
  .sw.custom {
    display: grid;
    place-items: center;
    color: white;
    overflow: hidden;
    cursor: pointer;
  }
  .sw.custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.45;
  }
  .hint.warn {
    color: var(--ink-2);
  }
  .sliders {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    flex-wrap: wrap;
    margin-top: var(--s-3);
  }
  .sliders label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .sliders input {
    width: 110px;
    accent-color: var(--ink);
  }
  .tts {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
    margin-top: var(--s-3);
    font-size: var(--t-xs);
  }
  .tts .ok {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
  }
  .bar {
    width: 140px;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--ink-2);
    transition: width 300ms ease;
  }
  .muted {
    color: var(--ink-3);
    font-size: var(--t-xs);
  }
  .engine {
    margin-top: var(--s-2);
  }
  .fieldset {
    display: grid;
    gap: 6px;
  }
  .fieldset > span {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .area.about {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    line-height: 1.45;
  }
  .count {
    font-size: 11px;
    color: var(--ink-3);
  }
  .area {
    height: auto;
    padding: 8px var(--s-3);
    resize: vertical;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link:hover {
    color: var(--ink);
  }
</style>
