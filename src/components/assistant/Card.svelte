<script lang="ts">
  // One answer: the warm line, then the card its result kind calls for. Cards read live state
  // (blocks, timer, clock) so they stay true after they appear.
  import type { Entry } from '../../lib/assistant/session.svelte';
  import { session } from '../../lib/assistant/session.svelte';
  import Icon from '../../lib/Icon.svelte';
  import BlockCard from './BlockCard.svelte';
  import CalmCard from './CalmCard.svelte';
  import CheckInsCard from './CheckInsCard.svelte';
  import ChoiceCard from './ChoiceCard.svelte';
  import ConfirmCard from './ConfirmCard.svelte';
  import DayCard from './DayCard.svelte';
  import FreeCard from './FreeCard.svelte';
  import HelpCard from './HelpCard.svelte';
  import ItemsCard from './ItemsCard.svelte';
  import NowCard from './NowCard.svelte';
  import PlanCard from './PlanCard.svelte';
  import SettingCard from './SettingCard.svelte';
  import StreaksCard from './StreaksCard.svelte';
  import SummaryCard from './SummaryCard.svelte';
  import TimerCard from './TimerCard.svelte';
  import WeekCard from './WeekCard.svelte';
  import WhenCard from './WhenCard.svelte';

  let { entry }: { entry: Entry } = $props();
  const r = $derived(entry.result!);
  const card = $derived(r.card);
  const ownUndo = $derived(card.kind === 'block');
</script>

<div class="answer" class:undone={entry.undone}>
  {#if r.say}<p class="a-say">{r.say}</p>{/if}

  {#if card.kind === 'now'}
    <NowCard />
  {:else if card.kind === 'timer'}
    <TimerCard />
  {:else if card.kind === 'day'}
    <DayCard {card} />
  {:else if card.kind === 'summary'}
    <SummaryCard {card} />
  {:else if card.kind === 'block'}
    <BlockCard {card} canUndo={!!r.undo} undone={entry.undone} onundo={() => session.undo(entry)} />
  {:else if card.kind === 'confirm'}
    <ConfirmCard {card} />
  {:else if card.kind === 'when'}
    <WhenCard {card} />
  {:else if card.kind === 'items'}
    <ItemsCard {card} />
  {:else if card.kind === 'plan'}
    <PlanCard {card} />
  {:else if card.kind === 'free'}
    <FreeCard {card} />
  {:else if card.kind === 'week'}
    <WeekCard {card} />
  {:else if card.kind === 'streaks'}
    <StreaksCard />
  {:else if card.kind === 'checkins'}
    <CheckInsCard />
  {:else if card.kind === 'theme' || card.kind === 'dial' || card.kind === 'zone' || card.kind === 'widget'}
    <SettingCard kind={card.kind} />
  {:else if card.kind === 'breathe' || card.kind === 'winddown'}
    <CalmCard kind={card.kind} />
  {:else if card.kind === 'help'}
    <HelpCard />
  {:else if card.kind === 'choice'}
    <ChoiceCard options={card.options} />
  {:else if card.kind === 'note' && card.chips?.length}
    <ChoiceCard options={card.chips} />
  {/if}

  {#if r.undo && !ownUndo}
    <div class="a-actions undo-row">
      {#if entry.undone}
        <span class="a-meta"><Icon name="undo" size={12} /> Undone</span>
      {:else}
        <button class="a-chip quiet" onclick={() => session.undo(entry)}><Icon name="undo" size={13} /> Undo</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .answer {
    display: grid;
    gap: var(--s-2);
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .answer.undone > :global(.a-card) {
    opacity: 0.55;
  }
  .undo-row {
    margin-top: -2px;
  }
</style>
