<script lang="ts">
  // Settings › AI: set up an AI service once (Services), keep Daybloom's own models on this
  // computer (On this device), and choose what each part of Daybloom thinks, listens and speaks
  // with (Who uses what). Every choice is saved at once and the whole app follows.
  import { onMount, tick } from 'svelte';
  import { ai, aiFile, FEATURES, type Feature } from '../../lib/ai/hub.svelte';
  import { can, PROVIDERS, type ProviderId, type Skill } from '../../lib/ai/providers';
  import { alefFile } from '../../lib/addons/alef/alef.svelte';
  import { isOn, setOn, type AddonId } from '../../lib/addons/registry';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import AiRoute from './AiRoute.svelte';
  import { checkDevice, DEVICE_MODELS } from './ai/device';
  import DeviceRow from './ai/DeviceRow.svelte';
  import { collapse, expand, pop, rise, serviceState, SKILLS, STATE_LABEL } from './ai/kit';
  import ServiceSetup from './ai/ServiceSetup.svelte';
  import { aiUi } from './ai/ui.svelte';

  const still = $derived(view.reducedMotion);
  const ADDON: Partial<Record<Feature, AddonId>> = { alef: 'alef', smaller: 'smaller', reality: 'reality' };
  const skillsOf = (id: ProviderId) => (['think', 'listen', 'speak'] as Skill[]).filter((k) => can(id, k));
  const stateOf = (id: ProviderId) => serviceState(id, ai.service(id), !!ai.keys[id]);
  const fresh = $derived(!Object.keys(aiFile.value.services).length && !Object.values(ai.keys).some(Boolean));

  const openIdx = $derived(aiUi.open ? PROVIDERS.findIndex((p) => p.id === aiUi.open) : -1);
  const openRow = $derived(openIdx < 0 ? -1 : Math.floor(openIdx / 2));

  onMount(() => {
    checkDevice();
    if (!alefFile.ready) void alefFile.load();
    return () => (aiUi.picker = null);
  });

  function toggleTile(id: ProviderId) {
    aiUi.open = aiUi.open === id ? null : id;
    aiUi.reveal++;
  }

  // Bring an opened setup into view once it has grown, keeping its tile on screen.
  let grid: HTMLDivElement | undefined = $state();
  $effect(() => {
    const ask = aiUi.reveal;
    const id = aiUi.open;
    if (!id || !grid || ask === aiUi.revealed) return;
    aiUi.revealed = ask;
    const t = setTimeout(async () => {
      await tick();
      const slot = grid?.querySelector<HTMLElement>('.slot');
      const tileEl = grid?.querySelector<HTMLElement>(`[data-id="${id}"]`);
      const box = grid?.closest<HTMLElement>('.content');
      if (!slot || !tileEl || !box) return;
      const b = box.getBoundingClientRect();
      const over = slot.getBoundingClientRect().bottom - b.bottom + 16;
      const room = tileEl.getBoundingClientRect().top - b.top - 12;
      const by = Math.min(over, room);
      if (by > 0) box.scrollBy({ top: by, behavior: still ? 'auto' : 'smooth' });
      else if (room < 0) box.scrollBy({ top: room, behavior: still ? 'auto' : 'smooth' });
    }, still ? 0 : 480);
    return () => clearTimeout(t);
  });

  const alefThinksHere = $derived(aiFile.value.use.alef.think.via === 'device' || !ai.ready('alef', 'think'));
</script>

<section class="services">
  <h3>Services</h3>
  {#if fresh}
    <div class="intro" in:rise={{ still }}>
      <p>Everything runs on this computer for now. Add a service once, and every part of Daybloom can use it.</p>
      <ol class="steps">
        <li><i>1</i> Add a key</li>
        <li><i>2</i> Give your OK</li>
        <li><i>3</i> Choose who uses it</li>
      </ol>
    </div>
  {/if}
  <div class="grid" bind:this={grid}>
    {#each PROVIDERS as p, i (p.id)}
      {@const st = stateOf(p.id)}
      <button class="tile" data-id={p.id} data-state={st} class:open={aiUi.open === p.id} aria-expanded={aiUi.open === p.id} onclick={() => toggleTile(p.id)}>
        <span class="t-top">
          <b>{p.name}</b>
          <span class="t-skills" aria-label={skillsOf(p.id).map((k) => SKILLS[k].label).join(', ')}>
            {#each skillsOf(p.id) as k (k)}<span title={SKILLS[k].label}><Icon name={SKILLS[k].icon} size={13} /></span>{/each}
          </span>
        </span>
        <span class="t-state">
          {#key st}<i class="dot" in:pop={{ still }}></i>{/key}
          {STATE_LABEL[st]}
        </span>
      </button>
      {#if i % 2 === 1 && openRow === (i - 1) / 2 && aiUi.open}
        <div class="slot" style:--caret={openIdx % 2 ? '75%' : '25%'} in:expand={{ still }} out:collapse={{ still }}>
          <div class="slot-in">
            {#key aiUi.open}
              <div in:rise={{ still, duration: 300 }}>
                <ServiceSetup id={aiUi.open} onclose={() => (aiUi.open = null)} />
              </div>
            {/key}
          </div>
        </div>
      {/if}
    {/each}
  </div>
  <p class="hint legend">
    <span><Icon name={SKILLS.think.icon} size={12} /> thinks</span>
    <span><Icon name={SKILLS.listen.icon} size={12} /> listens</span>
    <span><Icon name={SKILLS.speak.icon} size={12} /> speaks</span>
  </p>
</section>

<section>
  <h3>On this device</h3>
  <div class="devs">
    {#each DEVICE_MODELS as m (m.id)}<DeviceRow model={m} />{/each}
  </div>
  <p class="hint">Each one downloads once, is checked, and stays on this computer. They work offline, and nothing they hear or read leaves it. Needle and Whistle are by Cactus Compute (Apache-2.0).</p>
</section>

<section>
  <h3>Who uses what</h3>
  <div class="feats">
    {#each FEATURES as f (f.id)}
      {@const addon = ADDON[f.id]}
      <div class="feat" class:off={addon && !isOn(addon)}>
        <div class="f-head">
          <span class="f-icon" aria-hidden="true"><Icon name={f.icon} size={16} /></span>
          <span class="f-text"><b>{f.name}</b><small>{f.blurb}</small></span>
          {#if addon && !isOn(addon)}
            <button class="f-off" onclick={() => setOn(addon, true)} title={`${f.name} is off. Turn it on`}>Off · <u>Turn on</u></button>
          {/if}
        </div>
        <div class="f-routes">
          {#each f.skills as k (k)}<AiRoute feature={f.id} skill={k} />{/each}
        </div>
        {#if f.id === 'alef' && alefFile.ready}
          <div class="f-switches">
            <label class="sw-row">
              <span><b>Can change your plans</b><small>Each change shows with an Undo.</small></span>
              <input type="checkbox" class="switch" checked={alefFile.value.settings.mayChange} onchange={(e) => (alefFile.value.settings.mayChange = e.currentTarget.checked)} />
            </label>
            <label class="sw-row">
              <span>
                <b>Speaks up on its own</b>
                <small>In its own words, a few times a day.{alefThinksHere ? ' Only with an AI service as its brain.' : ''}</small>
              </span>
              <input type="checkbox" class="switch" checked={alefFile.value.settings.proactive} onchange={(e) => (alefFile.value.settings.proactive = e.currentTarget.checked)} />
            </label>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child,
  :global(.grp) + section {
    border-top: 0;
  }
  section:first-child {
    padding-top: var(--s-2);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .hint {
    margin: var(--s-3) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .intro {
    display: grid;
    gap: 10px;
    margin: -2px 0 var(--s-3);
  }
  .intro p {
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-2);
    line-height: 1.5;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .steps li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .steps i {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--sunken);
    font-style: normal;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--ink);
  }

  /* Services: two columns of tiles; a setup opens under its row, its caret pointing up at it. */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 8px;
  }
  .tile {
    display: grid;
    gap: 3px;
    min-width: 0;
    margin-bottom: 8px;
    padding: 10px 12px 11px;
    border-radius: var(--r-md);
    border: 1px dashed var(--line-strong);
    text-align: left;
    transition:
      border-color var(--dur-2) var(--ease-out),
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .tile:hover {
    border-color: var(--ink-3);
    background: color-mix(in srgb, var(--sunken) 45%, transparent);
  }
  .tile:active {
    transform: scale(0.97);
  }
  .tile[data-state='consent'],
  .tile[data-state='on'] {
    border-style: solid;
    border-color: var(--line-strong);
    background: var(--surface);
  }
  .tile.open {
    border-style: solid;
    border-color: var(--ink-2);
    background: var(--raised);
    box-shadow: var(--shadow-1);
  }
  .t-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }
  .t-top b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .t-skills {
    display: flex;
    gap: 3px;
    flex: none;
    color: var(--ink-3);
  }
  .t-skills span {
    display: grid;
  }
  .tile[data-state='on'] .t-skills {
    color: var(--ink-2);
  }
  .t-state {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
  }
  [data-state='consent'] .dot {
    box-shadow: none;
    background: var(--warm);
  }
  [data-state='consent'] .t-state {
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
  }
  [data-state='on'] .dot {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lume) 22%, transparent);
    background: var(--lume);
  }
  [data-state='on'] .t-state {
    color: var(--ink-2);
  }
  .slot {
    grid-column: 1 / -1;
    min-width: 0;
  }
  .slot-in {
    position: relative;
    padding: 6px 0 10px;
  }
  /* The caret: a small turned square in the setup's colours, under the open tile. */
  .slot-in::before {
    content: '';
    position: absolute;
    z-index: 1;
    top: 1px;
    left: var(--caret);
    width: 11px;
    height: 11px;
    background: var(--surface);
    border-left: 1px solid var(--line);
    border-top: 1px solid var(--line);
    transform: translateX(-50%) rotate(45deg);
    transition: left 520ms cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin-top: 2px;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .devs {
    display: grid;
  }

  /* Who uses what */
  .feats {
    display: grid;
    gap: 10px;
  }
  .feat {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .f-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }
  .f-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: var(--r-sm);
    background: var(--raised);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink);
  }
  .f-text {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .f-text b {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .f-text small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.4;
  }
  .f-off {
    flex: none;
    margin-top: 1px;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    font-size: 11px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .f-off:hover {
    color: var(--ink);
  }
  .f-off u {
    text-underline-offset: 2px;
  }
  .feat.off .f-icon {
    opacity: 0.6;
  }
  .f-routes {
    display: grid;
    gap: 8px;
  }
  .f-switches {
    display: grid;
    padding-top: 4px;
    border-top: 1px solid var(--line);
  }
  .sw-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: 6px 0;
  }
  .sw-row > span {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .sw-row b {
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .sw-row small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.4;
  }
  :global([data-motion='calm']) .slot-in::before {
    transition: none;
  }
</style>
