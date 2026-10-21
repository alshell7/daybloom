<script lang="ts">
  // Setting up one AI service, once for all of Daybloom: its key (straight to the system
  // keychain, never shown again), an account ID or an address where it needs one, the models it
  // thinks, listens and speaks with, a quick hello, your OK before anything is sent, which parts
  // of Daybloom use it, and Remove.
  import { ai, aiFile, FEATURES, type Feature } from '../../../lib/ai/hub.svelte';
  import { can, chatOnce, listModels, LlmError, providerOf, synthesize, type ProviderId, type Skill } from '../../../lib/ai/providers';
  import Icon from '../../../lib/Icon.svelte';
  import { platform } from '../../../lib/platform';
  import { view } from '../../../lib/stores/view.svelte';
  import { collapse, expand, headersText, missing, parseHeaders, playSample, pop, rise, serviceState, SKILLS, stopSample } from './kit';
  import { aiUi } from './ui.svelte';

  let { id, onclose }: { id: ProviderId; onclose: () => void } = $props();

  const still = $derived(view.reducedMotion);
  const fetchFn = (u: string, i?: RequestInit) => platform.fetch(u, i);
  const p = $derived(providerOf(id));
  const s = $derived(ai.service(id));
  const hasKey = $derived(!!ai.keys[id]);
  const status = $derived(serviceState(id, s, hasKey));
  const need = $derived(missing(id, s, hasKey));
  const agreed = $derived(!!s?.consent);
  const skills = $derived((['think', 'listen', 'speak'] as Skill[]).filter((k) => can(id, k)));
  const set = (patch: Parameters<typeof ai.configure>[1]) => ai.configure(id, patch);

  const words = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  // ── Key ──
  let keyText = $state('');
  let keyBusy = $state(false);
  let replacing = $state(false);
  async function saveKey(e: SubmitEvent) {
    e.preventDefault();
    if (!keyText.trim()) return;
    keyBusy = true;
    try {
      if (!s) set({});
      await ai.saveKey(id, keyText);
      keyText = '';
      replacing = false;
      test = null;
      void loadModels();
    } finally {
      keyBusy = false;
    }
  }

  // ── Models: the service's own list when it can say, good suggestions until then ──
  let loading = $state(false);
  async function loadModels() {
    if (need.some((n) => n === 'an address' || n === 'your account ID')) return;
    loading = true;
    try {
      const key = (await ai.key(id)) ?? '';
      aiUi.models = { ...aiUi.models, [id]: await listModels(ai.configOf(id, 'think'), key, fetchFn) };
    } finally {
      loading = false;
    }
  }
  const listed = $derived(aiUi.models[id]);
  const model = $derived(s?.model ?? p.suggested[0] ?? '');
  const modelChips = $derived([...new Set([...(model ? [model] : []), ...(listed ?? p.suggested)])].slice(0, listed ? 60 : 6));

  // ── A quick hello ──
  let test = $state<{ ok: boolean; text: string; help?: string } | null>(null);
  let testing = $state(false);
  async function sayHello() {
    testing = true;
    test = null;
    try {
      const r = await chatOnce(ai.configOf(id, 'think'), (await ai.key(id)) ?? '', [{ role: 'user', content: 'Say hello to me in five cheerful words.' }], null, fetchFn, 40);
      test = { ok: true, text: r.content.trim() || 'It answered (with no words, but it works).' };
    } catch (e) {
      const st = e instanceof LlmError ? e.status : 0;
      test = {
        ok: false,
        text: e instanceof LlmError ? e.message : "That didn't work.",
        help: st === 401 || st === 403 ? 'Check the key, or save a new one.' : st === 404 ? 'Try another model.' : st === 429 ? 'Wait a moment, then try again.' : '',
      };
    } finally {
      testing = false;
    }
  }

  // ── Hearing its voice ──
  let hearing = $state(false);
  let heard = $state('');
  async function hear() {
    if (hearing) {
      stopSample();
      return;
    }
    heard = '';
    hearing = true;
    try {
      const bytes = await synthesize(ai.configOf(id, 'speak'), (await ai.key(id)) ?? '', 'Hi! This is how I sound in Daybloom.', fetchFn, { voice: s?.voice });
      if (!(await playSample(bytes))) heard = 'Sounds are off in Settings › Rhythm.';
    } catch (e) {
      heard = e instanceof LlmError ? e.message : "Couldn't play it just now.";
    } finally {
      hearing = false;
    }
  }

  // ── Your OK ──
  function agree(on: boolean) {
    if (!s) set({});
    ai.agree(id, on);
  }
  const agreedOn = $derived(s?.consent ? new Date(s.consent).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  // ── Which parts use it ──
  const uses = $derived(
    FEATURES.flatMap((f) =>
      f.skills
        .filter((k) => can(id, k))
        .map((k) => ({ f: f.id, k, icon: k === 'speak' ? 'speech' : f.icon, label: f.id === 'alef' && k === 'speak' ? "Alef's voice" : f.name })),
    ),
  );
  const using = (f: Feature, k: Skill) => (f === 'alef' && k === 'speak' ? aiFile.value.use.alef.speak.via === id : ai.route(f, k).via === id);
  function toggleUse(f: Feature, k: Skill) {
    const on = using(f, k);
    if (f === 'alef' && k === 'speak') aiFile.value.use.alef.speak = on ? { via: 'chirps' } : { via: id };
    else ai.setRoute(f, k, { via: on ? 'device' : id });
  }

  // ── Remove ──
  let removing = $state(false);
  async function remove() {
    await ai.remove(id);
    delete aiUi.models[id];
    onclose();
  }
</script>

<div class="setup">
  <div class="head">
    <p class="what">
      {#if id === 'custom'}Any OpenAI-compatible service, like one running on your own computer.{:else}{p.name} {words(skills.map((k) => SKILLS[k].verb))}.{/if}
    </p>
    <button class="icon-btn close" onclick={onclose} aria-label={`Close ${p.name}`}><Icon name="x" size={15} /></button>
  </div>

  {#if p.needsAccount}
    <label class="fs">
      <span class="lbl">Account ID</span>
      <input class="field" value={s?.accountId ?? ''} oninput={(e) => set({ accountId: e.currentTarget.value.trim() })} placeholder="From your Cloudflare dashboard" spellcheck="false" autocomplete="off" />
    </label>
  {/if}
  {#if id === 'custom'}
    <label class="fs">
      <span class="lbl">Address</span>
      <input class="field" value={s?.baseUrl ?? ''} oninput={(e) => set({ baseUrl: e.currentTarget.value.trim() })} placeholder="https://…/v1" spellcheck="false" autocomplete="off" />
    </label>
    <label class="fs">
      <span class="lbl">Extra headers <small>optional, one “Name: value” a line</small></span>
      <textarea class="field area" value={headersText(s?.headers)} onchange={(e) => set({ headers: parseHeaders(e.currentTarget.value) })} spellcheck="false" rows="2"></textarea>
    </label>
  {/if}

  <!-- Key -->
  <div class="fs">
    <span class="lbl">
      Key
      {#if p.keyUrl}<button class="link end" onclick={() => platform.openExternal(p.keyUrl)}>Get a key <Icon name="external" size={11} /></button>{/if}
    </span>
    {#if hasKey && !replacing}
      <div class="saved" in:rise={{ still }}>
        <Icon name="lock" size={14} />
        <span>Saved in your keychain</span>
        <button class="link" onclick={() => (replacing = true)}>Replace</button>
        <button class="link" onclick={() => ai.forgetKey(id)}>Forget</button>
      </div>
    {:else}
      <form class="keyrow" onsubmit={saveKey}>
        <input class="field" type="password" bind:value={keyText} placeholder={p.keyHint} autocomplete="off" spellcheck="false" aria-label={`${p.name} key`} />
        <button class="btn btn-soft" type="submit" disabled={!keyText.trim() || keyBusy}>Save</button>
        {#if replacing}<button class="btn btn-quiet" type="button" onclick={() => (replacing = false)}>Cancel</button>{/if}
      </form>
      <small class="help">It goes straight to your system keychain and isn't shown again.</small>
    {/if}
  </div>

  <!-- Thinks with -->
  <div class="fs">
    <span class="lbl">
      <Icon name={SKILLS.think.icon} size={13} /> Thinks with
      <button class="link end" onclick={loadModels} disabled={loading}>
        <span class="spin" class:on={loading}><Icon name="refresh" size={11} /></span>
        {loading ? 'Asking…' : listed ? 'Ask again' : id === 'custom' ? 'List models' : `${p.name}'s models`}
      </button>
    </span>
    <input class="field mono" value={model} oninput={(e) => set({ model: e.currentTarget.value.trim() })} placeholder="A model id" spellcheck="false" autocomplete="off" aria-label="Model" />
    {#if modelChips.length}
      <div class="chips" class:many={modelChips.length > 8}>
        {#each modelChips as m (m)}
          <button class="chip" class:on={model === m} onclick={() => set({ model: m })}>{m}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#if p.listen}
    {@const cur = s?.listenModel || p.listen.models[0]}
    <div class="fs">
      <span class="lbl"><Icon name={SKILLS.listen.icon} size={13} /> Listens with</span>
      {#if id === 'custom'}
        <input class="field mono" value={s?.listenModel ?? ''} oninput={(e) => set({ listenModel: e.currentTarget.value.trim() || undefined })} placeholder={p.listen.models[0]} spellcheck="false" autocomplete="off" aria-label="Listening model" />
      {:else}
        <div class="chips">
          {#each p.listen.models as m (m)}<button class="chip" class:on={cur === m} onclick={() => set({ listenModel: m })}>{m}</button>{/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if p.speak}
    {@const cur = s?.speakModel || p.speak.models[0]}
    {@const voice = s?.voice || p.speak.voices[0]}
    <div class="fs">
      <span class="lbl"><Icon name={SKILLS.speak.icon} size={13} /> Speaks with</span>
      {#if id === 'custom'}
        <div class="pair">
          <input class="field mono" value={s?.speakModel ?? ''} oninput={(e) => set({ speakModel: e.currentTarget.value.trim() || undefined })} placeholder={p.speak.models[0]} spellcheck="false" autocomplete="off" aria-label="Speaking model" />
          <input class="field mono" value={s?.voice ?? ''} oninput={(e) => set({ voice: e.currentTarget.value.trim() || undefined })} placeholder={`Voice: ${p.speak.voices[0]}`} spellcheck="false" autocomplete="off" aria-label="Voice" />
        </div>
      {:else}
        <div class="chips">
          {#each p.speak.models as m (m)}<button class="chip" class:on={cur === m} onclick={() => set({ speakModel: m })}>{m}</button>{/each}
        </div>
        <span class="lbl sub">In the voice</span>
        <div class="chips">
          {#each p.speak.voices as v (v)}<button class="chip" class:on={voice === v} onclick={() => set({ voice: v })}>{v}</button>{/each}
        </div>
      {/if}
      <div class="tryrow">
        <button class="btn btn-soft sm" onclick={hear} disabled={need.some((n) => n !== 'a model')}>
          <Icon name={hearing ? 'pause' : 'volume'} size={13} />
          {hearing ? 'Playing…' : 'Hear it'}
        </button>
        {#if heard}<span class="result bad" in:rise={{ still }}>{heard}</span>{/if}
      </div>
    </div>
  {/if}

  <!-- Your OK -->
  <div class="consent" class:yes={agreed}>
    {#key agreed}<span class="c-icon" in:pop={{ still }}><Icon name={agreed ? 'shield' : 'info'} size={16} /></span>{/key}
    <div class="c-body">
      <p>
        Parts of Daybloom you point at <b>{p.name}</b> send it what they need: what you say to Alef or Ask Daybloom, <b>your blocks for the day</b> (titles, times, notes), <b>your Daybloom settings</b> and About you, the task you ask to make smaller or a block you haven't started yet, how long your past blocks really took (for Reality check){#if p.listen}, your voice while you talk{/if}{#if p.speak}, and what Alef says aloud{/if}.
        {p.name}'s own privacy terms apply. Nothing is sent until you agree.
      </p>
      {#if agreed}
        <span class="agreed">You agreed on {agreedOn}. <button class="link" onclick={() => agree(false)}>Stop sharing</button></span>
      {:else}
        <div class="agree">
          <button class="btn btn-primary sm" disabled={need.length > 0} onclick={() => agree(true)}>I agree</button>
          {#if need.length}<small>First add {words(need)}.</small>{/if}
        </div>
      {/if}
    </div>
  </div>

  {#if status === 'on'}
    <div class="wrap" in:expand={{ still }} out:collapse={{ still }}>
      <div class="fs uses">
        <span class="lbl">Use {p.name} for</span>
        <div class="chips">
          {#each uses as u (`${u.f}:${u.k}`)}
            {@const on = using(u.f, u.k)}
            <button class="chip use" class:on aria-pressed={on} onclick={() => toggleUse(u.f, u.k)}>
              {#if on}<span class="u-tick" in:pop={{ still }}><Icon name="check" size={12} stroke={2.4} /></span>{:else}<Icon name={u.icon} size={12} />{/if}
              {u.label}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div class="foot">
    <div class="tryrow">
      <button class="btn btn-soft sm" onclick={sayHello} disabled={testing || need.length > 0}>
        <Icon name="zap" size={13} />
        {testing ? 'Asking…' : 'Say hello'}
      </button>
      {#if !removing && (s || hasKey)}
        <button class="btn btn-quiet sm remove" onclick={() => (removing = true)}>Remove</button>
      {/if}
    </div>
    {#if test}
      <p class="result" class:ok={test.ok} class:bad={!test.ok} in:rise={{ still }}>
        {#if test.ok}<Icon name="check" size={13} stroke={2.2} /> “{test.text}”{:else}{test.text}{#if test.help}<span>{` ${test.help}`}</span>{/if}{/if}
      </p>
    {/if}
    {#if removing}
      <div class="confirm" in:rise={{ still }}>
        <span>Remove {p.name} and forget its key? Anything that used it goes back to this device.</span>
        <button class="btn btn-danger sm" onclick={remove}>Remove</button>
        <button class="btn btn-quiet sm" onclick={() => (removing = false)}>Keep</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .setup {
    position: relative;
    display: grid;
    gap: 14px;
    padding: 12px 14px 14px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: -4px;
  }
  .what {
    flex: 1;
    margin: 5px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-2);
    line-height: 1.45;
  }
  .close {
    flex: none;
    width: 28px;
    height: 28px;
    margin: -2px -6px 0 0;
  }
  .fs {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .lbl {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    min-width: 0;
  }
  .lbl small {
    color: var(--ink-3);
  }
  .lbl.sub {
    margin-top: 2px;
    color: var(--ink-3);
  }
  .end {
    margin-left: auto;
  }
  .help {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .field {
    height: 36px;
    min-width: 0;
    font-size: var(--t-sm);
  }
  .field.mono,
  .area {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 12px;
  }
  .area {
    height: auto;
    padding: 8px var(--s-3);
    resize: vertical;
  }
  .keyrow,
  .pair {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .keyrow .field,
  .pair .field {
    flex: 1;
  }
  .saved {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--lume) 12%, var(--raised));
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .saved span {
    flex: 1;
    min-width: 0;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 2px;
    white-space: nowrap;
  }
  .link:hover {
    color: var(--ink);
    text-decoration-color: currentColor;
  }
  .spin {
    display: grid;
  }
  .spin.on {
    animation: spin 0.9s linear infinite;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }
  .chips.many {
    max-height: 128px;
    overflow-y: auto;
    padding: 2px;
    margin: -2px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    font-size: var(--t-xs);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .chip:active {
    transform: scale(0.95);
  }
  .chip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--ink-inverse);
  }
  .chip.use {
    padding-left: 8px;
  }
  .u-tick {
    display: grid;
  }
  .btn.sm {
    height: 30px;
    padding: 0 12px;
    font-size: var(--t-xs);
    gap: 6px;
  }
  .tryrow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .remove {
    margin-left: auto;
    color: var(--ink-3);
  }
  .remove:hover {
    color: var(--danger);
  }
  .result {
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.45;
  }
  .result :global(svg) {
    flex: none;
    align-self: center;
  }
  .result.ok {
    display: flex;
    gap: 6px;
    color: var(--ink);
  }
  .result.bad {
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
  }
  .result.bad span {
    color: var(--ink-2);
  }
  .foot {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    padding: 10px 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--danger) 7%, transparent);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .confirm span {
    flex-basis: 100%;
  }
  .consent {
    display: flex;
    gap: 10px;
    padding: 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--warm) 11%, var(--raised));
    transition: background var(--dur-3) var(--ease-out);
  }
  .consent.yes {
    background: color-mix(in srgb, var(--lume) 13%, var(--raised));
  }
  .c-icon {
    display: grid;
    flex: none;
    height: 18px;
    color: var(--ink-2);
  }
  .c-body {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .consent p {
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .consent b {
    font-weight: 500;
    color: var(--ink);
  }
  .agree {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
  }
  .agree small,
  .agreed {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .agreed {
    color: var(--ink-2);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  :global([data-motion='calm']) .spin.on {
    animation: none;
  }
</style>
