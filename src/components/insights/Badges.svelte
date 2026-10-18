<script lang="ts">
  // Badges: earned ones in colour with a soft lume edge and the day they were earned;
  // the rest wait as quiet dashed outlines (dashes mean "not claimed yet") with a hint.
  import { CATEGORIES, categoryColor } from '../../lib/engine/categories';
  import { addDays, fromISODate, isoOf } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import type { Achievement } from '../../lib/insights';
  import Icon from '../../lib/Icon.svelte';

  let {
    items,
    today,
    seenBefore,
    dark = false,
  }: {
    items: { achievement: Achievement; at: number | null }[];
    today: ISODate;
    /** Badges earned after this instant glint once. */
    seenBefore: number;
    dark?: boolean;
  } = $props();

  const ordered = $derived([...items.filter((i) => i.at != null), ...items.filter((i) => i.at == null)]);

  const spectrum = $derived(
    `conic-gradient(${CATEGORIES.map((c, i) => {
      const col = categoryColor(c.id, dark);
      return `color-mix(in srgb, ${col} 30%, var(--raised)) ${((i / CATEGORIES.length) * 100).toFixed(2)}% ${(((i + 1) / CATEGORIES.length) * 100).toFixed(2)}%`;
    }).join(', ')})`,
  );

  function tone(a: Achievement) {
    if (a.tone === 'lume') return 'var(--lume)';
    if (a.tone === 'spectrum') return 'var(--ink)';
    return categoryColor(a.tone, dark);
  }

  function when(at: number) {
    const d = isoOf(at);
    if (d === today) return 'Today';
    if (d === addDays(today, -1)) return 'Yesterday';
    return fromISODate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

<ul class="badges">
  {#each ordered as { achievement: a, at } (a.id)}
    {@const earned = at != null}
    <li
      class="badge"
      class:earned
      class:fresh={earned && at! > seenBefore}
      style:--c={tone(a)}
      aria-label={earned ? `${a.title}, earned ${when(at!)}. ${a.description}` : `${a.title}, still ahead. ${a.hint}`}
      title={earned ? a.description : undefined}
    >
      <span class="medal" style:background={earned && a.tone === 'spectrum' ? spectrum : undefined} aria-hidden="true">
        <Icon name={a.icon} size={18} stroke={earned ? 2 : 1.75} />
      </span>
      <span class="text">
        <span class="title">{a.title}</span>
        <span class="sub tnum">{earned ? when(at!) : a.hint}</span>
      </span>
    </li>
  {/each}
</ul>

<style>
  .badges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--s-4) var(--s-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .badge {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: center;
    gap: var(--s-3);
  }
  .medal {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1.5px dashed var(--line-strong);
    color: var(--ink-3);
  }
  .medal :global(svg) {
    opacity: 0.55;
  }
  .earned .medal {
    border: 0;
    background: color-mix(in srgb, var(--c) 16%, var(--raised));
    color: var(--c);
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--lume) 70%, transparent),
      0 0 10px -2px color-mix(in srgb, var(--lume) 55%, transparent);
  }
  .earned .medal :global(svg) {
    opacity: 1;
  }
  .text {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .title {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-2);
  }
  .earned .title {
    color: var(--ink);
  }
  .sub {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    line-height: 1.35;
    color: var(--ink-3);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Newly earned since you last looked: the medal charges once with lume, then rests. */
  .fresh .medal {
    animation: charge 900ms var(--ease-settle) 260ms both;
  }
  @keyframes charge {
    0% {
      transform: scale(0.8);
      box-shadow:
        0 0 0 1.5px color-mix(in srgb, var(--lume) 0%, transparent),
        0 0 0 0 color-mix(in srgb, var(--lume) 0%, transparent);
    }
    45% {
      transform: scale(1.06);
      box-shadow:
        0 0 0 2px var(--lume),
        0 0 18px 2px color-mix(in srgb, var(--lume) 70%, transparent);
    }
    100% {
      transform: scale(1);
      box-shadow:
        0 0 0 1.5px color-mix(in srgb, var(--lume) 70%, transparent),
        0 0 10px -2px color-mix(in srgb, var(--lume) 55%, transparent);
    }
  }
  :global([data-motion='calm']) .fresh .medal {
    animation: none;
  }
</style>
