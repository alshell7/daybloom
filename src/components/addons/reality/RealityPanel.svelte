<script lang="ts">
  // Reality check: planned and real time, side by side. A calm lens at the top (how your plans
  // fit, overall), then each kind of task as a pair of bars: the outline is what you planned,
  // the fill is what it really took. Words, not judgement.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { ratioWords, summarize, type Group } from '../../../lib/addons/reality/reality';
  import { realityFile } from '../../../lib/addons/reality/reality.svelte';
  import { categoryColor } from '../../../lib/engine/categories';
  import { formatDuration, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { shownTitle } from '../../../lib/privacy';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';
  import { untrack } from 'svelte';
  import { ai } from '../../../lib/ai/hub.svelte';
  import { aiTips, type PlanLine, type TipAction, type Tips } from '../../../lib/addons/reality/aiReality';
  import { estimate, kindKey } from '../../../lib/addons/reality/reality';
  import { moveToTomorrow } from '../../../lib/actions';
  import { busyBetween, wakingSpan } from '../../../lib/busy';
  import { freeGaps } from '../../../lib/engine/blocks';
  import { formatTime } from '../../../lib/engine/time';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { taskFile, tasks } from '../../../lib/stores/tasks.svelte';

  const open = $derived(view.sheet?.kind === 'reality');

  // ── Practical tips (with an AI service for Reality check) ──
  const aiOn = $derived(ai.ready('reality', 'think'));
  let tips = $state<Tips | null>(null);
  let asking = $state(false);
  let failed = $state(false);
  let applied = $state<Record<number, boolean>>({});
  /** Today's blocks still ahead, with what blocks like them usually take. */
  function todayPlan(): PlanLine[] {
    const now = clock.now;
    return view.todayBlocks
      .filter((b) => b.kind === 'task' && !b.floating && !b.done && b.endMs > now && b.date === view.today)
      .slice(0, 14)
      .map((b) => {
        const planned = Math.round((b.endMs - b.startMs) / MINUTE);
        const est = estimate(realityFile.value.samples, { title: b.title, category: b.category });
        const usual = est ? Math.round(est.typical ?? planned * est.ratio) : undefined;
        return { key: b.key, title: b.title, start: formatTime(b.startMs, false), planned, ...(usual && Math.abs(usual - planned) >= 5 ? { usual } : {}) };
      });
  }
  async function askTips() {
    if (asking) return;
    asking = true;
    failed = false;
    applied = {};
    try {
      const now = clock.now;
      const span = wakingSpan(view.today);
      const from = Math.max(now, span.fromMs);
      const freeMin = from < span.toMs ? Math.round(freeGaps(busyBetween(from, span.toMs), from, span.toMs, 5 * MINUTE).reduce((a, g) => a + g.endMs - g.startMs, 0) / MINUTE) : 0;
      const recurring = [...new Set(taskFile.value.tasks.filter((t) => t.recurrence && t.title.trim()).map((t) => t.title.trim()))];
      tips = await aiTips({ samples: realityFile.value.samples, today: todayPlan(), freeMin, recurring });
      failed = !tips;
    } finally {
      asking = false;
    }
  }
  $effect(() => {
    if (open && aiOn && !tips && !asking) untrack(() => void askTips());
  });
  function apply(i: number, a: TipAction) {
    if (a.type === 'tomorrow') {
      moveToTomorrow(a.key);
    } else {
      const k = kindKey(a.task);
      const hit = taskFile.value.tasks.filter((t) => t.recurrence && kindKey(t.title) === k);
      const before = hit.map((t) => [t.id, t.duration] as const);
      for (const t of hit) tasks.update(t.id, { duration: a.minutes });
      view.say(`“${a.task}” is ${formatDuration(a.minutes * MINUTE)} from now on`, { label: 'Undo', run: () => before.forEach(([id, d]) => tasks.update(id, { duration: d })) }, 7000);
    }
    applied = { ...applied, [i]: true };
  }
  const rm = $derived(view.reducedMotion);
  const sum = $derived(summarize(realityFile.value.samples));
  let by = $state<'title' | 'category'>('title');
  const groups = $derived((by === 'title' && sum.byTitle.length ? sum.byTitle : sum.byCategory).slice(0, 12));
  const scale = $derived(Math.max(1, ...groups.map((g) => Math.max(g.planned, g.actual))));
  const words = $derived(sum.ratio != null ? ratioWords(sum.ratio) : null);
  // The lens: the real bar is the planned bar stretched by the ratio (never past 2×, drawn).
  const lens = $derived(sum.ratio != null ? Math.min(2, sum.ratio) : 1);
  const d = (m: number) => formatDuration(Math.round(m) * MINUTE);
  const diff = (g: Group) => {
    const x = Math.round(g.actual - g.planned);
    return Math.abs(x) < 3 ? 'about as planned' : x > 0 ? `usually ${d(g.actual)} (+${d(x)})` : `usually ${d(g.actual)}`;
  };
</script>

{#if open}
  <Panel title="Reality check" onclose={() => (view.sheet = null)} accent="#8670E6">
    <div class="rc">
      {#if aiOn}
        <section class="tips" in:fly={{ y: 6, duration: rm ? 0 : 280, easing: cubicOut }}>
          <div class="sh">
            <h3><Icon name="sparkles" size={15} /> Practical tips</h3>
            <button class="link" onclick={() => void askTips()} disabled={asking} title="Ask again"><Icon name="refresh" size={13} /> {asking ? 'Thinking…' : 'Refresh'}</button>
          </div>
          {#if asking && !tips}
            <div class="ghosts" aria-label="Looking at your record and today"><i></i><i></i><i></i></div>
          {:else if tips}
            <p class="tipline">{tips.headline}</p>
            <ul class="tiplist">
              {#each tips.tips as t, i (t.title)}
                <li in:fly={{ y: 6, duration: rm ? 0 : 260, delay: rm ? 0 : i * 60, easing: cubicOut }}>
                  <p class="tt">{t.title}</p>
                  <p class="td">{t.detail}</p>
                  {#if t.action}
                    {#if applied[i]}
                      <span class="done"><Icon name="check" size={13} stroke={2.4} /> Done</span>
                    {:else}
                      <button class="btn btn-soft sm" onclick={() => apply(i, t.action!)}>
                        {t.action.type === 'length' ? `Make it ${formatDuration(t.action.minutes * MINUTE)}` : 'Move to tomorrow'}
                      </button>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
          {:else if failed}
            <p class="hint">No tips this time — the AI service didn't answer. Try Refresh in a moment.</p>
          {/if}
        </section>
      {:else}
        <p class="hint ai-off"><Icon name="sparkles" size={13} /> For practical tips and realistic lengths from your own record, choose an AI service for Reality check in <button class="link" onclick={() => (view.sheet = { kind: 'settings', section: 'ai' })}>Settings › AI</button>.</p>
      {/if}
      {#if sum.n === 0}
        <div class="empty">
          <div class="pair" aria-hidden="true">
            <span class="plan" style:--w="70%"></span>
            <span class="real" style:--w="92%"></span>
          </div>
          <h3>Learning how long things really take</h3>
          <p>As you finish blocks, Daybloom notes how long they took: from focus sessions, tracked time, or when you tick them. After a few days you'll see your plans next to reality here, and a gentle “usually ~45m” when you set a length.</p>
        </div>
      {:else}
        <section class="hero" in:fly={{ y: 8, duration: rm ? 0 : 360, easing: cubicOut }}>
          <p class="headline">{words?.headline}</p>
          <div class="lens" role="img" aria-label={`Planned compared with real time: about ${sum.ratio?.toFixed(1)} times`}>
            <div class="lane">
              <span class="tag">Planned</span>
              <span class="bar plan" style:--w={`${50}%`}></span>
            </div>
            <div class="lane">
              <span class="tag">Real</span>
              <span class="bar real" class:grow={!rm} style:--w={`${50 * lens}%`}></span>
            </div>
          </div>
          <p class="basis tnum">From {sum.n} finished {sum.n === 1 ? 'block' : 'blocks'} · it never changes your plans by itself</p>
        </section>

        <section>
          <div class="sh">
            <h3>By kind</h3>
            {#if sum.byTitle.length}
              <Segmented label="Group by" value={by} options={[{ value: 'title', label: 'Task' }, { value: 'category', label: 'Category' }]} onchange={(v) => (by = v)} />
            {/if}
          </div>
          <div class="legend" aria-hidden="true">
            <span><i class="k plan"></i> Planned</span>
            <span><i class="k real"></i> Real</span>
          </div>
          <ul class="rows">
            {#each groups as g, i (g.key)}
              {@const c = categoryColor(g.category, view.finish.dark)}
              <li style:--c={c} in:fly={{ y: 6, duration: rm ? 0 : 280, delay: rm ? 0 : i * 40, easing: cubicOut }} title={`${g.label}: planned ${d(g.planned)}, really ${d(g.actual)} (${g.n} times)`}>
                <span class="ico"><Icon name={by === 'title' ? g.icon : 'circle-dashed'} size={14} stroke={2} /></span>
                <div class="what">
                  <p class="name"><span>{by === 'title' ? shownTitle(g.label, g.category) : g.label}</span><small class="tnum">{g.n}×</small></p>
                  <div class="bars">
                    <span class="bar plan" style:--w={`${(g.planned / scale) * 100}%`}></span>
                    <span class="bar real" class:grow={!rm} style:--w={`${(g.actual / scale) * 100}%`} style:--delay={`${i * 50}ms`}></span>
                  </div>
                  <p class="nums tnum">{d(g.planned)} planned · {diff(g)}</p>
                </div>
              </li>
            {/each}
          </ul>
        </section>
        <p class="hint">
          <Icon name="clock" size={13} /> When you set a length, Daybloom may say “usually ~45m”. One tap uses it; ignore it and nothing changes.
        </p>
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--t-xs);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .link:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .tips h3 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tips h3 :global(svg) {
    color: var(--lilac);
  }
  .tipline {
    margin: var(--s-2) 0 var(--s-3);
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .tiplist {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tiplist li {
    display: grid;
    gap: 4px;
    justify-items: start;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--lilac) 7%, var(--raised));
    border: 1px solid color-mix(in srgb, var(--lilac) 22%, var(--line));
  }
  .tt {
    margin: 0;
    font-size: var(--t-sm);
    font-weight: 600;
  }
  .td {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .tiplist .sm {
    height: 28px;
    margin-top: 4px;
    padding: 0 12px;
    font-size: var(--t-xs);
  }
  .tiplist .done {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .ghosts {
    display: grid;
    gap: 8px;
    margin-top: var(--s-3);
  }
  .ghosts i {
    display: block;
    height: 58px;
    border-radius: var(--r-md);
    background: var(--sunken);
    opacity: 0.7;
  }
  /* One flowing sentence with its link (as flex items its words and link wrapped apart). */
  .hint.ai-off {
    display: block;
    margin: 0 0 var(--s-3);
  }
  .ai-off :global(svg) {
    vertical-align: -2px;
    margin-right: 4px;
  }
  .ai-off .link {
    display: inline;
  }
  .rc {
    --lilac: #8670e6;
  }
  :global([data-theme='dark']) .rc {
    --lilac: #b4a2ff;
  }
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
  }
  h3 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .sh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
  }
  .hero {
    padding: var(--s-4);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--lilac) 8%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lilac) 18%, var(--line));
  }
  .headline {
    margin: 0 0 var(--s-3);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .lens {
    display: grid;
    gap: 8px;
  }
  .lane {
    display: grid;
    grid-template-columns: 54px 1fr;
    align-items: center;
    gap: 8px;
  }
  .tag {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .bar {
    display: block;
    height: 12px;
    width: var(--w);
    border-radius: 6px;
  }
  .bar.plan {
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
    opacity: 0.7;
  }
  .bar.real {
    background: var(--c, var(--lilac));
    transform-origin: left center;
  }
  /* One-shot: the real bar grows from the planned one. */
  .bar.real.grow {
    animation: grow 900ms var(--ease-out) backwards;
    animation-delay: calc(180ms + var(--delay, 0ms));
  }
  @keyframes grow {
    from {
      transform: scaleX(0.2);
      opacity: 0.4;
    }
  }
  .basis {
    margin: var(--s-3) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .legend {
    display: flex;
    gap: var(--s-4);
    margin: 0 0 var(--s-2);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .k {
    width: 18px;
    height: 8px;
    border-radius: 4px;
  }
  .k.plan {
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
  }
  .k.real {
    background: var(--ink-2);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
  }
  .rows li {
    display: flex;
    gap: 10px;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 9px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 15%, transparent);
  }
  .what {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 2px 0 6px;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name small {
    font-size: var(--t-xs);
    font-weight: 400;
    color: var(--ink-3);
  }
  .bars {
    display: grid;
    gap: 3px;
  }
  .bars .bar {
    height: 8px;
    border-radius: 4px;
  }
  .nums {
    margin: 5px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .hint {
    display: flex;
    gap: 6px;
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .empty {
    display: grid;
    gap: var(--s-2);
  }
  .empty .pair {
    display: grid;
    gap: 6px;
    width: 160px;
    margin-bottom: var(--s-2);
  }
  .empty .pair span {
    height: 10px;
    width: var(--w);
    border-radius: 5px;
  }
  .empty .plan {
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
    opacity: 0.6;
  }
  .empty .real {
    background: var(--lilac);
    opacity: 0.8;
  }
  .empty p {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.55;
    color: var(--ink-3);
  }
  :global([data-motion='calm']) .bar.real.grow {
    animation: none;
  }
</style>
