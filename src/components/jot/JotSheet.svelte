<script lang="ts">
  // Jot: get it out of your head in seconds. Type (or say) one thing per line; each line shows
  // where it will go before anything is added — on the dial today or tomorrow, or in the backlog
  // (Next, Inbox, Someday). With the Decision addon on, TinyDecide reads each line on this device
  // and suggests the place, the kind and the urgency; one tap on another place changes it, and
  // what you keep or change teaches it. Opened from the phone's + button, the app icon's
  // shortcuts, the quick-settings tile, the home-screen Backlog widget, text shared to Daybloom,
  // and J on a computer.
  import { tick } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { celebrateBadges } from '../../lib/actions';
  import { decision, decisionFile } from '../../lib/addons/decision/decision.svelte';
  import { DESTINATIONS, type Answer, type Destination, type Suggestion } from '../../lib/addons/decision/questions';
  import { isOn, setOn } from '../../lib/addons/registry';
  import { dueLabel, openItems, PRIORITY_LABEL } from '../../lib/backlog';
  import { freeSlot } from '../../lib/busy';
  import { CATEGORY_BY_ID, categoryColor } from '../../lib/engine/categories';
  import { addDays, formatDayShort, formatDuration, formatMinutes, MINUTE } from '../../lib/engine/time';
  import type { Task } from '../../lib/engine/types';
  import { haptic } from '../../lib/haptics';
  import Icon from '../../lib/Icon.svelte';
  import { readLine, ruleDestination, taskFor, type JotLine } from '../../lib/jot';
  import { platform } from '../../lib/platform';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { taskFile, tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { voice } from '../../lib/voice/voice.svelte';
  import Panel from '../Panel.svelte';
  import LiveWords from '../voice/LiveWords.svelte';
  import MicButton from '../voice/MicButton.svelte';

  const open = $derived(view.sheet?.kind === 'jot');
  const rm = $derived(view.reducedMotion);

  let text = $state('');
  let ta = $state<HTMLTextAreaElement>();

  /** Per line (by its text): the model's view, and the place you picked, if you did. */
  interface Entry {
    sug?: Suggestion;
    answers?: Answer[];
    asking?: boolean;
    picked?: Destination;
  }
  let entries = $state<Record<string, Entry>>({});

  const lines = $derived(
    text
      .split(/\r?\n/)
      .map((l) => readLine(l, clock.minute))
      .filter((l): l is JotLine => !!l)
      .slice(0, 30),
  );

  // Opening: take any text handed over (shared text, a widget), focus, and start the model.
  $effect(() => {
    if (!open) return;
    const s = view.sheet;
    const given = s?.kind === 'jot' ? s.text : '';
    const talk = s?.kind === 'jot' && s.voice;
    if (given) text = given;
    void tick().then(() => {
      ta?.focus();
      if (talk) void voice.start('jot', { handsFree: true });
    });
    if (isOn('decision') && !decision.viaAi) void decision.ensure().catch(() => {});
  });

  // Dictation: live words flow in as a new line; the final words stay for a look before adding.
  const dictating = $derived(voice.surface === 'jot' && (voice.phase === 'listening' || voice.phase === 'finishing'));
  let before = '';
  let usedFinal = '';
  $effect(() => {
    if (dictating) {
      if (!before && text.trim()) before = `${text.replace(/\s+$/, '')}\n`;
    } else before = '';
  });
  $effect(() => {
    if (voice.surface !== 'jot' || voice.phase !== 'idle' || !voice.final || voice.final === usedFinal) return;
    usedFinal = voice.final;
    text = `${text.trim() ? `${text.replace(/\s+$/, '')}\n` : ''}${voice.final}`;
    ta?.focus();
  });

  // Ask the model about each new line, a moment after typing stops, one at a time.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  $effect(() => {
    const want = lines.map((l) => l.raw);
    if (!open || !isOn('decision')) return;
    clearTimeout(timer);
    timer = setTimeout(() => void askAll(want), 320);
    return () => clearTimeout(timer);
  });
  async function askAll(want: string[]) {
    if (busy) return;
    busy = true;
    try {
      for (const raw of want) {
        if (!lines.some((l) => l.raw === raw) || entries[raw]?.sug) continue;
        const l = lines.find((x) => x.raw === raw)!;
        entries[raw] = { ...entries[raw], asking: true };
        const r = await decision.suggest(raw, l.hints).catch(() => null);
        entries[raw] = { ...entries[raw], asking: false, ...(r ? { sug: r.suggestion, answers: r.answers } : {}) };
      }
    } finally {
      busy = false;
    }
    // Typed more while it was busy: catch up.
    if (lines.some((l) => !entries[l.raw]?.sug)) void askAll(lines.map((l) => l.raw));
  }

  const destOf = (l: JotLine): Destination => entries[l.raw]?.picked ?? entries[l.raw]?.sug?.dest ?? ruleDestination(l);
  const planOf = (l: JotLine) => {
    const e = entries[l.raw];
    return {
      dest: destOf(l),
      category: e?.sug?.category ?? l.hints.category,
      priority: e?.sug?.priority ?? l.hints.priority,
      energy: e?.sug?.energy ?? l.hints.energy,
      minutes: e?.sug?.found?.minutes ?? null,
    };
  };
  const slot = (date: string, minutes: number) => freeSlot(date, minutes, clock.now, { days: 1 });

  /** What a line will become, for its card (the same as what Add makes). */
  function preview(l: JotLine) {
    const p = planOf(l);
    const t = taskFor(l, p, clock.now, slot, 0);
    const day = t.date ? (t.date === view.today ? 'Today' : t.date === addDays(view.today, 1) ? 'Tomorrow' : (({ dow, day }) => `${dow} ${day}`)(formatDayShort(t.date))) : null;
    const when = day ? (t.start != null ? `${day} · ${formatMinutes(t.start, view.hour12)}` : `${day} · anytime`) : null;
    return { t, p, when };
  }

  const dayLabel = (d: string) => (({ dow, day }) => `${dow.slice(0, 3)} ${day}`)(formatDayShort(d));

  function pick(l: JotLine, d: Destination) {
    entries[l.raw] = { ...entries[l.raw], picked: d };
    haptic('pick');
  }

  let added = $state<{ ids: string[]; line: string } | null>(null);

  function add() {
    if (!lines.length) return;
    const made: Task[] = [];
    let order = Math.min(0, ...openItems(taskFile.value.tasks).map((t) => t.order ?? 0)) - lines.length;
    const where = { day: 0, backlog: 0 };
    for (const l of lines) {
      const { t, p } = preview(l);
      const task = tasks.create({ ...t, order: order++ });
      made.push(task);
      if (task.date) where.day++;
      else where.backlog++;
      const e = entries[l.raw];
      if (e?.answers && isOn('decision')) decision.learn(e.answers, { dest: p.dest, category: p.category }, !!e.picked && e.picked !== e.sug?.dest);
    }
    sounds.tick();
    haptic('done');
    const r = ta?.getBoundingClientRect();
    if (r) view.spark(r.left + 28, r.top + 20, categoryColor(made[0].category, view.finish.dark), false, made.length === 1 ? 'Added' : `+${made.length}`);
    const parts = [where.day && `${where.day} on your day`, where.backlog && `${where.backlog} in the backlog`].filter(Boolean).join(', ');
    const ids = made.map((t) => t.id);
    view.say(made.length === 1 ? `“${made[0].title}” · ${made[0].date ? 'on your day' : 'in the backlog'}` : `Added ${made.length}: ${parts}`, {
      label: 'Undo',
      run: () => ids.forEach((id) => tasks.remove(id)),
    });
    added = { ids, line: parts };
    text = '';
    entries = {};
    celebrateBadges();
    void tick().then(() => ta?.focus());
  }

  function keydown(e: KeyboardEvent) {
    // Enter adds a single line; with several lines, Enter makes a new one and ⌘/Ctrl+Enter adds.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (!e.shiftKey && !text.includes('\n') && !platform.isMobile))) {
      e.preventDefault();
      add();
    }
  }

  // Grow with the text, up to about six lines.
  $effect(() => {
    text;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  });

  // The backlog, at a glance: what's next and what's waiting.
  const waiting = $derived(
    openItems(taskFile.value.tasks)
      .sort((a, z) => (a.list === 'next' ? 0 : 1) - (z.list === 'next' ? 0 : 1) || (a.priority ?? 9) - (z.priority ?? 9) || (a.order ?? 0) - (z.order ?? 0))
      .slice(0, 4),
  );
  const backlogCount = $derived(openItems(taskFile.value.tasks).length);

  const status = $derived.by(() => {
    if (!isOn('decision')) return null;
    if (decision.status === 'downloading') return `Getting Decision ready · ${Math.round(decision.progress * 100)}%`;
    if (decision.status === 'loading') return 'Waking Decision…';
    if (decision.status === 'error') return 'Decision isn’t available right now. The usual rules place your lines.';
    return null;
  });

  function close() {
    if (dictating) voice.cancel();
    view.sheet = null;
    added = null;
  }
</script>

{#if open}
  <Panel title="Jot it down" onclose={close} genieFrom="jot" accent="#D99A06">
    <div class="jot">
      <div class="box" class:hearing={dictating} style:--lvl={dictating ? voice.level : 0}>
        <textarea
          bind:this={ta}
          bind:value={text}
          rows="2"
          placeholder={'One thing per line —\ncall the bank tomorrow, gym 6pm, learn piano someday'}
          aria-label="Jot things down, one per line"
          aria-describedby="jot-hint"
          autocomplete="off"
          autocapitalize="sentences"
          enterkeyhint={platform.isMobile ? 'enter' : 'done'}
          onkeydown={keydown}
        ></textarea>
        {#if dictating}<div class="live"><LiveWords placeholder="Listening… one thing at a time" /></div>{/if}
        <div class="tools">
          <MicButton surface="jot" size={36} label="Say it" />
        </div>
      </div>
      <p class="hint" id="jot-hint">
        {#if isOn('decision')}
          <Icon name="route" size={13} /> {decision.who} suggests where each line goes, and who, where and how long. Tap another place to change it.
        {:else}
          Times, days, “by fri”, “!!” and “someday” are understood.
          <button class="link" onclick={() => setOn('decision', true)}>Let Decision place them</button>
        {/if}
      </p>
      {#if status}<p class="status" role="status">{status}</p>{/if}

      {#if lines.length}
        <ol class="lines" aria-label="What will be added" transition:slide={{ duration: rm ? 0 : 200, easing: cubicOut }}>
          {#each lines as l, i (l.raw)}
            {@const v = preview(l)}
            {@const e = entries[l.raw]}
            {@const c = categoryColor(v.t.category ?? 'focus', view.finish.dark)}
            <li class="line" style:--c={c} animate:flip={{ duration: rm ? 0 : 200 }} in:fly={{ y: 6, duration: rm ? 0 : 220, easing: cubicOut }}>
              <div class="top">
                <span class="kind" title={CATEGORY_BY_ID[v.t.category ?? 'focus'].label}><Icon name={v.t.icon ?? 'laptop'} size={15} stroke={2} /></span>
                <span class="title">{v.t.title}</span>
                {#if e?.asking}
                  <span class="thinking" aria-label="Decision is reading this line"><i></i><i></i><i></i></span>
                {:else if e?.sug && !e.picked}
                  <span class="by" title={e.sug.why}><Icon name="sparkle" size={12} /> {e.sug.why}</span>
                {/if}
              </div>
              <div class="meta">
                {#if v.when}<span class="chip"><Icon name="clock" size={11} /> {v.when}</span>{/if}
                {#if v.t.duration}<span class="chip tnum">{formatDuration(v.t.duration * MINUTE)}</span>{/if}
                {#if v.t.due}<span class="chip"><Icon name="calendar-clock" size={11} /> {dueLabel(v.t.due, view.today)}</span>{/if}
                {#if v.t.priority}<span class="chip" class:must={v.t.priority === 1}><Icon name="flag" size={11} /> {PRIORITY_LABEL[v.t.priority]}</span>{/if}
                {#if e?.sug?.found?.person}<span class="chip found" title="Who it involves"><Icon name="user" size={11} /> {e.sug.found.person}</span>{/if}
                {#if e?.sug?.found?.place}<span class="chip found" title="Where"><Icon name="map-pin" size={11} /> {e.sug.found.place}</span>{/if}
              </div>
              <div class="dests" role="radiogroup" aria-label={`Where “${v.t.title}” goes`}>
                {#each DESTINATIONS as d (d.id)}
                  <button
                    role="radio"
                    aria-checked={v.p.dest === d.id}
                    class:on={v.p.dest === d.id}
                    class:suggested={e?.sug?.dest === d.id && !e.picked}
                    onclick={() => pick(l, d.id)}
                  >
                    <Icon name={d.icon} size={13} />
                    <span>{d.id === 'today' && l.writtenDate && l.writtenDate > addDays(view.today, 1) ? dayLabel(l.writtenDate) : d.label.replace('Backlog · ', '')}</span>
                  </button>
                {/each}
              </div>
              <span class="sr">{i + 1} of {lines.length}</span>
            </li>
          {/each}
        </ol>
      {:else if waiting.length}
        <section class="peek" aria-labelledby="jot-peek" in:fly={{ y: 6, duration: rm ? 0 : 240, easing: cubicOut }}>
          <header>
            <h3 id="jot-peek">In your backlog <span class="n tnum">{backlogCount}</span></h3>
            <button class="link" onclick={() => (view.sheet = { kind: 'backlog' })}>Open <Icon name="chevron-right" size={13} /></button>
          </header>
          <ul>
            {#each waiting as t (t.id)}
              <li style:--c={categoryColor(t.category, view.finish.dark)}>
                <i class="dot"></i>
                <span class="t">{t.title}</span>
                {#if t.priority === 1}<span class="flag" title="Must"><Icon name="flag" size={11} /></span>{/if}
                <span class="list">{t.list === 'next' ? 'Next' : t.list === 'someday' ? 'Someday' : 'Inbox'}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
    {#snippet footer()}
      <button class="btn btn-quiet" onclick={() => (view.sheet = { kind: 'backlog' })}><Icon name="inbox" size={15} /> Backlog</button>
      <span class="grow"></span>
      <button class="btn btn-primary add" onclick={add} disabled={!lines.length}>
        <Icon name="plus" size={16} stroke={2.4} />
        {lines.length > 1 ? `Add ${lines.length}` : 'Add'}
      </button>
    {/snippet}
  </Panel>
{/if}

<style>
  .jot {
    display: grid;
    gap: var(--s-3);
    padding-top: 2px;
  }
  .box {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: var(--s-2);
    padding: 10px 8px 10px 14px;
    border-radius: var(--r-lg, 16px);
    background: var(--raised);
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    transition: box-shadow var(--dur-2) var(--ease-out);
  }
  .box:focus-within {
    box-shadow: inset 0 0 0 2px var(--focus-ring);
  }
  .box.hearing {
    box-shadow: inset 0 0 0 2px var(--signal), 0 0 0 calc(var(--lvl) * 10px) color-mix(in srgb, var(--signal) 18%, transparent);
  }
  textarea {
    width: 100%;
    min-height: 52px;
    resize: none;
    border: 0;
    outline: none;
    background: transparent;
    font: 400 var(--t-md, 16px) / 1.45 var(--font-ui);
    color: var(--ink);
  }
  textarea::placeholder {
    color: var(--ink-3);
  }
  .live {
    grid-column: 1 / -1;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .tools {
    display: grid;
    gap: 6px;
  }
  .hint,
  .status {
    margin: 0;
    line-height: 1.45;
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .status {
    color: var(--ink-2);
  }
  .hint :global(svg) {
    vertical-align: -2px;
    margin-right: 2px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--signal);
    font-weight: 500;
    min-height: 32px;
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--s-2);
  }
  .line {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 12px 12px 10px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c) 7%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 22%, var(--line));
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .kind {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }
  .title {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .by {
    flex: none;
    max-width: 46%;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs, 12px);
    color: color-mix(in srgb, #d99a06 70%, var(--ink-2));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .thinking {
    flex: none;
    display: inline-flex;
    gap: 3px;
  }
  .thinking i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ink-3);
    animation: blink 1.1s infinite ease-in-out;
  }
  .thinking i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .thinking i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes blink {
    50% {
      opacity: 0.25;
      transform: translateY(-2px);
    }
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-left: 38px;
  }
  .meta:empty {
    display: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs, 12px);
    color: var(--ink-2);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .chip.must {
    color: var(--signal);
  }
  .chip.found {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: color-mix(in srgb, #d99a06 70%, var(--ink-2));
    background: color-mix(in srgb, #d99a06 12%, transparent);
  }
  /* Five places in a row; on a narrow screen or with a large font they wrap rather than cut. */
  .dests {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
    gap: 4px;
  }
  .dests button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    min-height: 46px;
    padding: 4px 1px;
    border-radius: 12px;
    font-size: 10.5px;
    letter-spacing: -0.01em;
    line-height: 1.1;
    font-weight: 500;
    color: var(--ink-2);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .dests button span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dests button.suggested:not(.on) {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #d99a06 50%, transparent);
  }
  .dests button.on {
    color: var(--on-signal, #fff);
    background: var(--c);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--c) 35%, transparent);
  }
  .dests button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .peek header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .peek h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink-2);
  }
  .n {
    padding: 0 6px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .peek ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
  }
  .peek li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    border-bottom: 1px solid var(--line);
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .peek li:last-child {
    border-bottom: 0;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .flag {
    color: var(--signal);
    display: grid;
  }
  .list {
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .grow {
    flex: 1;
  }
  .add {
    min-height: 44px;
    min-width: 108px;
    justify-content: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .thinking i {
      animation: none;
    }
  }
</style>
