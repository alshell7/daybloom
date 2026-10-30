<script lang="ts">
  // The backlog as an Eisenhower matrix: urgent × important, four quadrants with their own next
  // move. Drag an item to another quadrant (a computer), or tap it and pick one (a phone). A task
  // you place keeps its place; the rest follow their due date and priority. With an AI service
  // or the Decision addon, "Suggest places" proposes where the unsorted ones belong, for you to
  // check before anything moves.
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { dueLabel } from '../../lib/backlog';
  import { categoryColor } from '../../lib/engine/categories';
  import type { Task } from '../../lib/engine/types';
  import { haptic } from '../../lib/haptics';
  import Icon from '../../lib/Icon.svelte';
  import { byQuadrant, patchFor, placedByYou, QUADRANTS, type MatrixGuess, type Quadrant } from '../../lib/matrix';
  import { place, suggester, suggestPlaces } from '../../lib/matrix.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { items, today, onplan }: { items: Task[]; today: string; onplan: (ids: string[]) => void } = $props();

  const groups = $derived(byQuadrant(items, today));
  const rm = $derived(view.reducedMotion);
  let openId = $state<string | null>(null);
  let over = $state<Quadrant | null>(null);

  function moveTo(t: Task, q: Quadrant) {
    tasks.update(t.id, patchFor(q));
    openId = null;
    haptic('drop');
  }

  // Drag between quadrants (pointer devices).
  let dragId: string | null = null;
  function dragStart(e: DragEvent, t: Task) {
    dragId = t.id;
    e.dataTransfer?.setData('text/plain', t.title);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function drop(e: DragEvent, q: Quadrant) {
    e.preventDefault();
    over = null;
    const t = dragId ? tasks.get(dragId) : null;
    dragId = null;
    if (t) moveTo(t, q);
  }

  // Suggestions, confirmed before they apply.
  let guesses = $state<(MatrixGuess & { on: boolean; title: string; to: Quadrant })[] | null>(null);
  let asking = $state(false);
  const who = $derived(suggester());
  const unsorted = $derived(items.filter((t) => !placedByYou(t)).length);
  async function suggest() {
    asking = true;
    try {
      const got = await suggestPlaces(items);
      guesses = got.map((g) => {
        const q: Quadrant = g.urgent && g.important ? 'do' : g.important ? 'plan' : g.urgent ? 'quick' : 'drop';
        return { ...g, on: true, title: tasks.get(g.taskId)?.title ?? '', to: q };
      });
    } finally {
      asking = false;
    }
  }
  function apply() {
    if (!guesses) return;
    const chosen = guesses.filter((g) => g.on);
    const undo = place(chosen);
    view.say(`Placed ${chosen.length} in the matrix`, { label: 'Undo', run: undo });
    guesses = null;
  }

  const action: Record<Quadrant, { label: string; icon: string; run: (ids: string[]) => void }> = {
    do: { label: 'Pick one to start', icon: 'shuffle', run: (ids) => (view.sheet = { kind: 'pick', only: ids }) },
    plan: { label: 'Give them a day', icon: 'calendar-plus', run: (ids) => onplan(ids) },
    quick: { label: 'Pick a quick one', icon: 'timer', run: (ids) => (view.sheet = { kind: 'pick', only: ids }) },
    drop: {
      label: 'Move to Someday',
      icon: 'cloud',
      run: (ids) => {
        const before = ids.map((id) => ({ id, list: tasks.get(id)?.list ?? 'inbox' }));
        for (const id of ids) tasks.update(id, { list: 'someday' });
        view.say(`${ids.length} moved to Someday. Letting go is a choice too.`, { label: 'Undo', run: () => before.forEach((b) => tasks.update(b.id, { list: b.list })) });
      },
    },
  };
</script>

<div class="matrix-wrap">
  {#if who && unsorted && !guesses}
    <button class="suggest" onclick={suggest} disabled={asking}>
      <Icon name={who === 'ai' ? 'sparkles' : 'route'} size={14} />
      <span>{asking ? 'Reading your backlog…' : `Suggest places for ${unsorted} unsorted ${unsorted === 1 ? 'item' : 'items'}`}</span>
      <small>{who === 'ai' ? 'AI' : 'Decision'}</small>
    </button>
  {/if}
  {#if guesses}
    <section class="guesses" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }} aria-label="Suggested places">
      {#if guesses.length}
        <ul>
          {#each guesses as g (g.taskId)}
            {@const q = QUADRANTS.find((x) => x.id === g.to)!}
            <li>
              <label>
                <input type="checkbox" bind:checked={g.on} />
                <span class="gt">{g.title}</span>
                <span class="gq"><Icon name={q.icon} size={11} /> {q.title}</span>
              </label>
              {#if g.why}<small>{g.why}</small>{/if}
            </li>
          {/each}
        </ul>
        <div class="gacts">
          <button class="btn btn-quiet" onclick={() => (guesses = null)}>Not now</button>
          <button class="btn btn-primary" onclick={apply} disabled={!guesses.some((g) => g.on)}>Place {guesses.filter((g) => g.on).length}</button>
        </div>
      {:else}
        <p class="muted">No suggestions this time.</p>
        <button class="btn btn-quiet" onclick={() => (guesses = null)}>OK</button>
      {/if}
    </section>
  {/if}

  <div class="axes" aria-hidden="true"><span>Urgent</span><span>Not urgent</span></div>
  <div class="matrix" role="list" aria-label="Eisenhower matrix">
    {#each [QUADRANTS[0], QUADRANTS[1], QUADRANTS[2], QUADRANTS[3]] as q (q.id)}
      {@const list = groups[q.id]}
      <section
        class="quad {q.id}"
        class:over={over === q.id}
        role="listitem"
        aria-label={`${q.title}: ${q.hint}, ${list.length} ${list.length === 1 ? 'item' : 'items'}`}
        ondragover={(e) => {
          e.preventDefault();
          over = q.id;
        }}
        ondragleave={() => over === q.id && (over = null)}
        ondrop={(e) => drop(e, q.id)}
      >
        <header>
          <span class="qi"><Icon name={q.icon} size={14} stroke={2.2} /></span>
          <span class="qt"><strong>{q.title}</strong><small>{q.hint}</small></span>
          <span class="n tnum">{list.length}</span>
        </header>
        <ul>
          {#each list as t (t.id)}
            <li style:--c={categoryColor(t.category, view.finish.dark)}>
              <button class="item" class:open={openId === t.id} draggable="true" ondragstart={(e) => dragStart(e, t)} onclick={() => (openId = openId === t.id ? null : t.id)} aria-expanded={openId === t.id}>
                <i class="dot"></i>
                <span class="it">{t.title}</span>
                {#if t.due}<span class="due">{dueLabel(t.due, today)}</span>{/if}
              </button>
              {#if openId === t.id}
                <div class="moves" transition:slide={{ duration: rm ? 0 : 160 }} role="group" aria-label={`Move ${t.title}`}>
                  {#each QUADRANTS.filter((x) => x.id !== q.id) as to (to.id)}
                    <button onclick={() => moveTo(t, to.id)}><Icon name={to.icon} size={12} /> {to.short}</button>
                  {/each}
                  <button onclick={() => (view.sheet = { kind: 'edit', key: `later:${t.id}` })}><Icon name="pencil" size={12} /> Details</button>
                </div>
              {/if}
            </li>
          {:else}
            <li class="none">{q.id === 'do' ? 'Nothing on fire. Lovely.' : 'Empty'}</li>
          {/each}
        </ul>
        {#if list.length}
          <button class="qa" onclick={() => action[q.id].run(list.map((t) => t.id))}><Icon name={action[q.id].icon} size={13} /> {action[q.id].label}</button>
        {/if}
      </section>
    {/each}
  </div>
  <div class="axes-v" aria-hidden="true"><span>Important</span><span>Less important</span></div>
</div>

<style>
  .matrix-wrap {
    display: grid;
    gap: var(--s-2);
  }
  .suggest {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: var(--r-md);
    font-size: var(--t-sm);
    color: var(--ink-2);
    background: var(--sunken);
  }
  .suggest span {
    flex: 1;
    text-align: left;
  }
  .suggest small {
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .guesses {
    padding: 8px 12px;
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .guesses ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .guesses li {
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .guesses label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
  }
  .guesses input {
    width: 20px;
    height: 20px;
  }
  .gt {
    flex: 1;
    min-width: 0;
    color: var(--ink);
  }
  .gq {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs, 12px);
    color: var(--ink-2);
  }
  .guesses small {
    display: block;
    padding-left: 30px;
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .gacts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
  }
  .muted {
    margin: 0 0 6px;
    color: var(--ink-3);
    font-size: var(--t-sm);
  }
  .axes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    text-align: center;
  }
  .axes-v {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--ink-3);
  }
  .axes-v span:first-child::before {
    content: '↑ ';
  }
  .axes-v span:last-child::after {
    content: ' ↓';
  }
  .matrix {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .quad {
    --q: #3d6fe3;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    min-height: 150px;
    padding: 10px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--q) 7%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--q) 22%, var(--line));
    transition: box-shadow var(--dur-2) var(--ease-out);
  }
  .quad.do {
    --q: #ea6a2a;
  }
  .quad.plan {
    --q: #3d6fe3;
  }
  .quad.quick {
    --q: #d99a06;
  }
  .quad.drop {
    --q: #8670e6;
  }
  .quad.over {
    box-shadow: inset 0 0 0 2px var(--q);
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .qi {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    color: var(--q);
    background: color-mix(in srgb, var(--q) 16%, transparent);
  }
  .qt {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.2;
  }
  .qt strong {
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .qt small {
    font-size: 11px;
    color: var(--ink-3);
  }
  .n {
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .quad ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    max-height: 220px;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 4px 6px;
    border-radius: 9px;
    text-align: left;
    font-size: var(--t-sm);
    color: var(--ink);
    cursor: grab;
  }
  .item:hover,
  .item.open {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .item:focus-visible,
  .qa:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }
  .it {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .due {
    flex: none;
    font-size: 11px;
    color: var(--ink-3);
  }
  .moves {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 0 6px 13px;
  }
  .moves button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 32px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    font-size: 12px;
    color: var(--ink-2);
    background: var(--raised);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .none {
    padding: 6px;
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .qa {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 36px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--q);
    background: color-mix(in srgb, var(--q) 12%, transparent);
  }
  @container backlog (max-width: 420px) {
    .quad {
      padding: 8px;
      min-height: 130px;
    }
    .qt small {
      display: none;
    }
    .item {
      align-items: flex-start;
      font-size: 13px;
      line-height: 1.3;
    }
    .dot {
      margin-top: 5px;
    }
    .it {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .due {
      display: none;
    }
  }
</style>
