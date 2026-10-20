<script lang="ts">
  // Alef's home: talk with it, set it up (its look, voice and brain), and meet all its
  // feelings. Alef itself sits at the top, alive, mirroring the one in the dial.
  import { alef, alefFile } from '../../../lib/addons/alef/alef.svelte';
  import { BEHAVIORS } from '../../../lib/addons/alef/behaviors';
  import { providerOf } from '../../../lib/addons/alef/llm';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';
  import AlefFace from './AlefFace.svelte';
  import AlefFeelings from './AlefFeelings.svelte';
  import AlefSettings from './AlefSettings.svelte';
  import AlefTalk from './AlefTalk.svelte';

  type Tab = 'talk' | 'alef' | 'feelings';
  const open = $derived(view.sheet?.kind === 'alef');
  let tab = $state<Tab>('talk');
  $effect(() => {
    const s = view.sheet;
    if (s?.kind === 'alef' && s.tab) tab = s.tab;
  });

  const s = $derived(alefFile.value.settings);
  const brainLine = $derived(
    s.brain === 'local'
      ? 'Thinks on this device'
      : alef.aiReady
        ? `Thinks with ${providerOf(s.brain).name}${s.configs[s.brain]?.model ? ` · ${s.configs[s.brain]!.model}` : ''}`
        : `${providerOf(s.brain).name} isn't set up yet · thinks on this device`,
  );
  const feelingLine = $derived(alef.thinking ? 'Thinking…' : alef.talk ? 'Talking' : `Feeling ${BEHAVIORS[alef.perf.id].label.toLowerCase().replace(' (cute)', '')}`);
</script>

{#if open}
  <Panel title="Alef" onclose={() => (view.sheet = null)} accent={alef.screenFor(view.finish).eye} wide>
    <div class="hero">
      <div class="me">
        <AlefFace
          perf={alef.perf}
          performing={alef.performing}
          affect={alef.affect}
          talk={alef.talk}
          screen={alef.screenFor(view.finish)}
          led={s.led}
          reduced={view.reducedMotion}
          posture
          onpoke={() => alef.poke()}
          label="Alef"
        />
      </div>
      <div class="who">
        <h3>Alef</h3>
        <p class="feel">{feelingLine}</p>
        <p class="brain">{brainLine}</p>
      </div>
    </div>

    <div class="tabs">
      <Segmented
        label="Alef"
        value={tab}
        onchange={(v) => (tab = v)}
        options={[
          { value: 'talk', label: 'Talk' },
          { value: 'alef', label: 'Settings' },
          { value: 'feelings', label: 'Feelings' },
        ]}
      />
    </div>

    {#if tab === 'talk'}
      <AlefTalk />
    {:else if tab === 'alef'}
      <AlefSettings />
    {:else}
      <AlefFeelings />
    {/if}

    {#snippet footer()}
      {#if tab === 'talk'}
        <AlefTalk input />
      {:else}
        <span class="spacer"></span>
        <button class="btn btn-primary" onclick={() => (view.sheet = null)}>Done</button>
      {/if}
    {/snippet}
  </Panel>
{/if}

<style>
  .hero {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-1, 4px) 0 var(--s-4);
  }
  .me {
    width: 112px;
    flex: none;
    padding: 10px 6px 6px;
  }
  .who {
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-family: var(--font-read);
    font-size: var(--t-xl);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .feel {
    margin: 2px 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .brain {
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .tabs {
    margin-bottom: var(--s-3);
  }
  .spacer {
    flex: 1;
  }
</style>
