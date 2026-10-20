<script lang="ts">
  // Setting Alef up: where it shows, how it looks and sounds, how much it talks, and its brain —
  // on this device, or an AI service you choose (key kept in the system keychain, a model to
  // pick, a quick test, and your clear yes before anything is sent).
  import { onMount } from 'svelte';
  import { alef, alefFile, EYE_COLORS, keyAccount, type Brain } from '../../../lib/addons/alef/alef.svelte';
  import { chatOnce, LlmError, listModels, PROVIDERS, providerOf, type ProviderId } from '../../../lib/addons/alef/llm';
  import { tinyTts, VOICE_BYTES } from '../../../lib/addons/alef/tts/tts.svelte';
  import type { VoiceMode } from '../../../lib/addons/alef/voice';
  import Icon from '../../../lib/Icon.svelte';
  import { platform } from '../../../lib/platform';
  import { session } from '../../../lib/assistant/session.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import EngineBadge from '../../assistant/EngineBadge.svelte';
  import Segmented from '../../Segmented.svelte';

  const s = $derived(alefFile.value.settings);
  const set = (patch: Partial<typeof alefFile.value.settings>) => Object.assign(alefFile.value.settings, patch);
  const setYou = (patch: Partial<typeof alefFile.value.settings.you>) => (alefFile.value.settings.you = { ...alefFile.value.settings.you, ...patch });

  onMount(() => {
    session.open();
    void alef.refreshKey();
    void tinyTts.check();
  });

  // ── Voice ──
  const VOICE_HINT: Record<VoiceMode, string> = {
    chirps: 'Little robot sounds in the rhythm of the words.',
    speech: 'A small spoken voice, made on this device.',
    system: "Your computer's own voice, a little higher.",
    off: 'Alef stays silent; you can still read what it says.',
  };
  function testVoice() {
    alef.perform('happy');
    alef.say("Hi! I'm Alef. This is how I sound.", { voice: true, important: true });
  }

  // ── Brain ──
  const BRAINS: { id: Brain; name: string; icon: string }[] = [{ id: 'local', name: 'This device', icon: 'cpu' }, ...PROVIDERS.map((p) => ({ id: p.id as Brain, name: p.name, icon: p.id === 'custom' ? 'link' : 'cloud' }))];
  const provider = $derived(s.brain === 'local' ? null : providerOf(s.brain));
  const cfg = $derived(s.brain === 'local' ? null : (s.configs[s.brain] ?? { model: '' }));

  function chooseBrain(b: Brain) {
    set({ brain: b });
    if (b !== 'local' && !s.configs[b]) alefFile.value.settings.configs = { ...s.configs, [b]: { model: providerOf(b).suggested[0] ?? '' } };
    models = [];
    test = null;
    keyText = '';
    void alef.refreshKey();
  }
  function patchCfg(p: Record<string, unknown>) {
    if (s.brain === 'local') return;
    const b = s.brain;
    alefFile.value.settings.configs = { ...s.configs, [b]: { model: '', ...(s.configs[b] ?? {}), ...p } };
  }

  // Key: saved straight to the keychain, never shown again.
  let keyText = $state('');
  let keyBusy = $state(false);
  async function saveKey(e: SubmitEvent) {
    e.preventDefault();
    if (s.brain === 'local' || !keyText.trim()) return;
    keyBusy = true;
    try {
      await platform.secrets.set(keyAccount(s.brain), keyText.trim());
      keyText = '';
      await alef.refreshKey();
    } finally {
      keyBusy = false;
    }
  }
  async function removeKey() {
    if (s.brain === 'local') return;
    await platform.secrets.delete(keyAccount(s.brain));
    await alef.refreshKey();
  }

  // Headers for a custom endpoint, one "Name: value" a line.
  const headerText = $derived(Object.entries(cfg?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'));
  function setHeaders(t: string) {
    const h: Record<string, string> = {};
    for (const line of t.split('\n')) {
      const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(line);
      if (m) h[m[1]] = m[2];
    }
    patchCfg({ headers: h });
  }

  // Models: the provider's list when it can say, with good suggestions first.
  let models = $state<string[]>([]);
  let loadingModels = $state(false);
  async function loadModels() {
    if (s.brain === 'local' || !cfg) return;
    loadingModels = true;
    try {
      const key = (await platform.secrets.get(keyAccount(s.brain))) ?? '';
      models = await listModels({ provider: s.brain, ...cfg }, key, (u, i) => platform.fetch(u, i));
    } finally {
      loadingModels = false;
    }
  }
  const modelChips = $derived((models.length ? models : (provider?.suggested ?? [])).slice(0, models.length ? 60 : 4));

  // A quick test: say hello.
  let test = $state<{ ok: boolean; text: string } | null>(null);
  let testing = $state(false);
  async function tryIt() {
    if (s.brain === 'local' || !cfg) return;
    testing = true;
    test = null;
    try {
      const key = (await platform.secrets.get(keyAccount(s.brain))) ?? '';
      const r = await chatOnce({ provider: s.brain, ...cfg }, key, [{ role: 'user', content: 'Say hello to me in five cheerful words.' }], null, (u, i) => platform.fetch(u, i), 40);
      test = { ok: true, text: r.content.trim() || '(an empty answer, but it works)' };
      alef.perform('delighted', { sound: true });
    } catch (e) {
      test = { ok: false, text: e instanceof LlmError ? e.message : String(e) };
      alef.perform('confused', { sound: true });
    } finally {
      testing = false;
    }
  }

  const agreed = $derived(s.brain !== 'local' && !!s.consent[s.brain]);
  function agree(on: boolean) {
    if (s.brain === 'local') return;
    const c = { ...s.consent };
    if (on) c[s.brain as ProviderId] = Date.now();
    else delete c[s.brain as ProviderId];
    alefFile.value.settings.consent = c;
    if (on) alef.react('thanks', { line: null });
  }
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
    <Segmented
      label="Voice"
      value={s.voice}
      onchange={(v) => set({ voice: v })}
      options={[
        { value: 'chirps', label: 'Chirps' },
        { value: 'speech', label: 'Voice' },
        { value: 'system', label: 'System' },
        { value: 'off', label: 'Silent' },
      ]}
    />
    <p class="hint">{VOICE_HINT[s.voice]}</p>
    {#if s.voice === 'speech'}
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
    {#if s.voice !== 'off'}
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
    <div class="brains" role="radiogroup" aria-label="Alef's brain">
      {#each BRAINS as b (b.id)}
        <button role="radio" aria-checked={s.brain === b.id} class="brain" class:on={s.brain === b.id} onclick={() => chooseBrain(b.id)}>
          <Icon name={b.icon} size={14} />
          {b.name}
        </button>
      {/each}
    </div>

    {#if s.brain === 'local'}
      <p class="hint">Alef understands you on this device with Daybloom's own assistant. Nothing leaves your computer.</p>
      <div class="engine"><EngineBadge /></div>
    {:else if provider && cfg}
      <div class="setup">
        {#if provider.needsAccount}
          <label class="fieldset">
            <span>Account ID</span>
            <input class="field" value={cfg.accountId ?? ''} oninput={(e) => patchCfg({ accountId: e.currentTarget.value.trim() })} placeholder="32 letters and numbers, from your Cloudflare dashboard" spellcheck="false" autocomplete="off" />
          </label>
        {/if}
        {#if s.brain === 'custom'}
          <label class="fieldset">
            <span>Address</span>
            <input class="field" value={cfg.baseUrl ?? ''} oninput={(e) => patchCfg({ baseUrl: e.currentTarget.value.trim() })} placeholder="https://…/v1 (any OpenAI-compatible service)" spellcheck="false" autocomplete="off" />
          </label>
          <label class="fieldset">
            <span>Extra headers <small>(optional, one “Name: value” a line)</small></span>
            <textarea class="field area" value={headerText} onchange={(e) => setHeaders(e.currentTarget.value)} spellcheck="false" rows="2"></textarea>
          </label>
        {/if}

        <div class="fieldset">
          <span>Key {#if provider.keyUrl}<button class="link" onclick={() => platform.openExternal(provider.keyUrl)}>Get one <Icon name="external" size={11} /></button>{/if}</span>
          {#if alef.hasKey}
            <div class="saved">
              <Icon name="lock" size={14} />
              <span>Saved in your system keychain</span>
              <button class="link" onclick={() => (alef.hasKey = false)}>Replace</button>
              <button class="link danger" onclick={removeKey}>Remove</button>
            </div>
          {:else}
            <form class="keyrow" onsubmit={saveKey}>
              <input class="field" type="password" bind:value={keyText} placeholder={provider.keyHint} autocomplete="off" spellcheck="false" aria-label={`${provider.name} key`} />
              <button class="btn btn-soft" type="submit" disabled={!keyText.trim() || keyBusy}>Save</button>
            </form>
          {/if}
        </div>

        <div class="fieldset">
          <span>Model</span>
          <div class="keyrow">
            <input class="field" value={cfg.model} oninput={(e) => patchCfg({ model: e.currentTarget.value.trim() })} placeholder="A model id" spellcheck="false" autocomplete="off" list="alef-models" />
            <button class="btn btn-quiet" onclick={loadModels} disabled={loadingModels} title="Ask the provider which models you can use">
              <Icon name="refresh" size={13} />
              {loadingModels ? 'Loading…' : 'All models'}
            </button>
          </div>
          <datalist id="alef-models">{#each models as m (m)}<option value={m}></option>{/each}</datalist>
          {#if modelChips.length}
            <div class="chips" class:many={models.length > 4}>
              {#each modelChips as m (m)}
                <button class="mchip" class:on={cfg.model === m} onclick={() => patchCfg({ model: m })}>{m}</button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Consent -->
        <div class="consent" class:yes={agreed}>
          <Icon name={agreed ? 'shield' : 'info'} size={16} />
          <div>
            <p>
              To answer, Alef sends <b>{provider.name}</b> what you say, <b>today's blocks</b> (titles, times, notes), <b>your Daybloom settings</b>{s.you.name.trim() || s.you.about.trim() ? ' and what you wrote under About you' : ''}.{s.mayChange ? ' It can also add, move or finish blocks; each change shows with an Undo.' : ''}
              {provider.name}'s own privacy terms apply. Nothing is sent until you agree.
            </p>
            {#if agreed}
              <button class="link" onclick={() => agree(false)}>Stop sharing</button>
            {:else}
              <button class="btn btn-primary" onclick={() => agree(true)}>I agree</button>
            {/if}
          </div>
        </div>

        <label class="row">
          <span><b>Alef may change my plans</b><small>Off: it can only read and suggest.</small></span>
          <input type="checkbox" class="switch" checked={s.mayChange} onchange={(e) => set({ mayChange: e.currentTarget.checked })} />
        </label>

        <div class="test">
          <button class="btn btn-soft" onclick={tryIt} disabled={testing || (!alef.hasKey && s.brain !== 'custom') || !cfg.model}>
            <Icon name="zap" size={13} />
            {testing ? 'Trying…' : 'Try it'}
          </button>
          {#if test}<span class:ok={test.ok} class:bad={!test.ok}>{test.text}</span>{/if}
          {#if !alef.hasKey && s.brain !== 'custom'}<span class="muted">Save a key first.</span>{/if}
        </div>
      </div>
    {/if}
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
  .brains {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .brain {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font-size: var(--t-xs);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out);
  }
  .brain:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .brain.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--raised);
  }
  .engine {
    margin-top: var(--s-2);
  }
  .setup {
    display: grid;
    gap: var(--s-3);
    margin-top: var(--s-3);
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
  .keyrow {
    display: flex;
    gap: 6px;
  }
  .keyrow .field {
    flex: 1;
    min-width: 0;
  }
  .saved {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .saved span {
    flex: 1;
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
  .link.danger {
    color: var(--danger);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chips.many {
    max-height: 132px;
    overflow-y: auto;
    padding: 2px;
  }
  .mchip {
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font: 500 11px / 1 ui-monospace, monospace;
    color: var(--ink-2);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mchip.on {
    background: var(--ink);
    color: var(--raised);
    border-color: var(--ink);
  }
  .consent {
    display: flex;
    gap: 10px;
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: color-mix(in srgb, #ffc75c 14%, transparent);
    color: var(--ink);
  }
  .consent.yes {
    background: color-mix(in srgb, var(--lume) 14%, transparent);
  }
  .consent :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .consent p {
    margin: 0 0 var(--s-2);
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .consent b {
    color: var(--ink);
    font-weight: 500;
  }
  .test {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
    font-size: var(--t-xs);
  }
  .test .ok {
    color: var(--ink);
  }
  .test .bad {
    color: var(--danger);
  }
</style>
