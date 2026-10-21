// The same blocks in three ways (the Timeline views addon): the list, a board that moves
// work from later to today to done, and a Gantt chart of the hours with free time between.

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import type { IconName } from '@/lib/day';
import { ICONS } from '@/lib/icons';
import type { CategoryId } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { SectionHead } from '../ui/section-head';
import { NextChip } from '../ui/next-chip';
import { Segmented } from '../ui/segmented';

type View = 'list' | 'board' | 'gantt';

interface B {
  key: string;
  title: string;
  start: string;
  min: number;
  color: CategoryId;
  icon: IconName;
  state: 'done' | 'now' | 'next' | 'later';
  event?: boolean;
}

const DAY: B[] = [
  { key: 'meds', title: 'Morning meds', start: '08:00', min: 10, color: 'care', icon: 'pill', state: 'done' },
  { key: 'plan', title: 'Plan the day', start: '08:30', min: 15, color: 'routine', icon: 'sparkles', state: 'done' },
  { key: 'deep', title: 'Deep work', start: '09:30', min: 90, color: 'focus', icon: 'laptop', state: 'now' },
  { key: 'review', title: 'Design review', start: '11:15', min: 45, color: 'people', icon: 'video', state: 'next', event: true },
  { key: 'lunch', title: 'Lunch & water', start: '12:30', min: 40, color: 'care', icon: 'utensils', state: 'next' },
  { key: 'draft', title: 'Draft the proposal', start: '13:30', min: 90, color: 'focus', icon: 'laptop', state: 'next' },
  { key: 'gym', title: 'Gym', start: '17:30', min: 60, color: 'move', icon: 'dumbbell', state: 'next' },
];
const LATER: B[] = [
  { key: 'bike', title: 'Fix the bike light', start: '', min: 20, color: 'move', icon: 'footprints', state: 'later' },
  { key: 'bill', title: 'Pay the electricity bill', start: '', min: 15, color: 'routine', icon: 'sparkles', state: 'later' },
];

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
const NOW = toMin('10:40');

export function Views() {
  const [view, setView] = useState<View>('list');
  const calm = useReducedMotion();
  return (
    <section id="views" aria-labelledby="views-title" className="py-20 sm:py-28">
      <div className="container-page">
        <div className="grid justify-items-center gap-8 text-center">
          <SectionHead
            center
            id="views-title"
            title="Your day as a list, a board or a Gantt chart."
            lead="The same blocks, three ways. A board moves work from later to today to done. A Gantt chart lays your hours side by side, with free time between. Calendar events and salah stay where they are."
          />
          <NextChip note="Timeline views" className="-mt-3" />
          <Segmented
            size="lg"
            label="Timeline view"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'List', title: 'The timeline as a list' },
              { value: 'board', label: 'Board', title: 'Later, today, now and done, as columns' },
              { value: 'gantt', label: 'Gantt', title: 'Your hours from left to right' },
            ]}
          />
        </div>

        <div className="mt-10 overflow-hidden rounded-[22px] border border-line bg-surface shadow-rest">
          <div className="flex items-center gap-2 border-b border-line bg-raised px-5 py-3 text-[13px] text-ink-3">
            <span className="font-medium text-ink">Today</span> · a sample day at 10:40
          </div>
          <div className="relative min-h-[520px] p-4 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={calm ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={calm ? undefined : { opacity: 0, y: -8, filter: 'blur(4px)' }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                {view === 'list' ? <ListView /> : view === 'board' ? <BoardView /> : <GanttView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function Dot({ b, size = 28 }: { b: B; size?: number }) {
  const Icon = ICONS[b.state === 'done' ? 'check' : b.icon];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: b.state === 'done' ? `color-mix(in srgb, var(--c-${b.color}) 22%, var(--raised))` : `var(--c-${b.color})`,
        color: b.state === 'done' ? 'var(--ink-2)' : `var(--on-${b.color})`,
        boxShadow: b.state === 'done' ? 'inset 0 0 0 2px var(--lume)' : undefined,
      }}
    >
      <Icon className="size-[55%]" aria-hidden="true" strokeWidth={2.2} />
    </span>
  );
}

// ---- List: the Structured-style timeline, capsules as tall as their time ----
function ListView() {
  const rows: (B | { gap: number; at: number })[] = [];
  DAY.forEach((b, i) => {
    if (i > 0) {
      const prev = DAY[i - 1];
      const gap = toMin(b.start) - (toMin(prev.start) + prev.min);
      if (gap >= 15) rows.push({ gap, at: toMin(prev.start) + prev.min });
    }
    rows.push(b);
  });
  return (
    <ol className="mx-auto grid max-w-[760px] gap-1">
      {rows.map((r, i) =>
        'gap' in r ? (
          <li key={`g${i}`} className="grid grid-cols-[52px_44px_1fr] items-center gap-3 py-1 text-[12.5px] text-ink-3 [animation:rise-in_.4s_var(--ease-out)_both]" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="tnum text-right">{fmt(r.at)}</span>
            <span className="mx-auto h-6 w-0 border-l-2 border-dotted border-line-strong" aria-hidden="true" />
            <span className="tnum">{dur(r.gap)} free</span>
          </li>
        ) : (
          <li key={r.key} className={cn('grid grid-cols-[52px_44px_1fr_auto] items-start gap-3 rounded-[14px] px-0 py-1.5 [animation:rise-in_.4s_var(--ease-out)_both]', r.state === 'now' && 'bg-raised shadow-rest')} style={{ animationDelay: `${i * 30}ms` }}>
            <span className="tnum pt-2 text-right text-[12.5px] text-ink-3">{r.start}</span>
            <Capsule b={r} />
            <span className="min-w-0 pt-1.5">
              <span className={cn('block text-[15px] leading-snug font-medium text-ink', r.state === 'done' && 'text-ink-3 line-through decoration-ink-3/60')}>{r.title}</span>
              <span className="tnum block text-[12.5px] text-ink-3">
                {r.start}–{fmt(toMin(r.start) + r.min)} · {r.state === 'now' ? `${dur(toMin(r.start) + r.min - NOW)} left` : dur(r.min)}
                {r.event ? ' · calendar' : ''}
              </span>
            </span>
            <span className={cn('mt-2 mr-2 grid size-6 place-items-center rounded-full border-2', r.state === 'done' ? 'border-transparent bg-lume text-[#141b29]' : 'border-line-strong')}>
              {r.state === 'done' && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
              <span className="sr-only">{r.state === 'done' ? 'done' : 'not done'}</span>
            </span>
          </li>
        ),
      )}
    </ol>
  );
}

function Capsule({ b }: { b: B }) {
  const h = Math.max(44, Math.min(120, b.min * 1.15));
  const Icon = ICONS[b.icon];
  const live = b.state === 'now';
  const filled = live ? (NOW - toMin(b.start)) / b.min : 0;
  return (
    <span
      className="relative mx-auto grid w-[40px] place-items-start justify-center overflow-hidden rounded-[20px] pt-2.5"
      style={{
        height: h,
        background: b.state === 'done' || live ? `color-mix(in srgb, var(--c-${b.color}) 20%, var(--raised))` : b.event ? `color-mix(in srgb, var(--c-${b.color}) 18%, var(--raised))` : `var(--c-${b.color})`,
        boxShadow: b.state === 'done' ? 'inset 0 0 0 2px var(--lume)' : live ? `inset 0 0 0 2px color-mix(in srgb, var(--c-${b.color}) 45%, transparent)` : b.event ? `inset 0 0 0 2px var(--c-${b.color})` : undefined,
        color: b.state === 'next' && !b.event ? `var(--on-${b.color})` : b.event ? `color-mix(in srgb, var(--c-${b.color}), var(--glass-ink) 48%)` : 'var(--ink-2)',
      }}
    >
      {live && <span className="absolute inset-x-0 bottom-0" style={{ height: `${filled * 100}%`, background: `var(--c-${b.color})` }} aria-hidden="true" />}
      <Icon className="relative size-[18px]" aria-hidden="true" />
    </span>
  );
}

// ---- Board: Later, Today, Now and Done ----
function BoardView() {
  const cols: { name: string; sub: string; items: B[] }[] = [
    { name: 'Later', sub: 'the backlog', items: LATER },
    { name: 'Today', sub: `${DAY.filter((b) => b.state === 'next').length} blocks`, items: DAY.filter((b) => b.state === 'next') },
    { name: 'Now', sub: 'until 11:00', items: DAY.filter((b) => b.state === 'now') },
    { name: 'Done', sub: `${DAY.filter((b) => b.state === 'done').length} blocks`, items: DAY.filter((b) => b.state === 'done') },
  ];
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <div className="grid min-w-[760px] grid-cols-4 gap-3">
        {cols.map((c, ci) => (
          <div key={c.name} className="rounded-[18px] bg-sunken/70 p-2.5">
            <div className="flex items-baseline justify-between px-1.5 pt-1 pb-2.5">
              <span className={cn('text-[14px] font-medium', c.name === 'Now' ? 'text-signal' : 'text-ink')}>{c.name}</span>
              <span className="tnum text-[12px] text-ink-3">{c.sub}</span>
            </div>
            <ul className="grid gap-2">
              {c.items.map((b, i) => (
                <li key={b.key} className={cn('flex items-center gap-2.5 rounded-[14px] border border-line bg-raised p-2.5 shadow-rest [animation:rise-in_.4s_var(--ease-out)_both]', b.state === 'now' && 'ring-2 ring-[color-mix(in_srgb,var(--c-focus)_40%,transparent)]')} style={{ animationDelay: `${ci * 60 + i * 35}ms` }}>
                  <Dot b={b} />
                  <span className="min-w-0">
                    <span className={cn('block truncate text-[13.5px] font-medium text-ink', b.state === 'done' && 'text-ink-3 line-through')}>{b.title}</span>
                    <span className="tnum block truncate text-[12px] text-ink-3">{b.start ? `${b.start} · ${dur(b.min)}` : dur(b.min)}{b.event ? ' · calendar' : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Gantt: one row per kind of block, hours from left to right, free time between ----
function GanttView() {
  const from = toMin('08:00');
  const to = toMin('19:00');
  const pct = (m: number) => `${((m - from) / (to - from)) * 100}%`;
  const rows: { name: string; color: CategoryId }[] = [
    { name: 'Focus', color: 'focus' },
    { name: 'Care', color: 'care' },
    { name: 'People', color: 'people' },
    { name: 'Routine', color: 'routine' },
    { name: 'Move', color: 'move' },
  ];
  const busy = [...DAY].sort((a, b) => toMin(a.start) - toMin(b.start));
  const free: { s: number; e: number }[] = [];
  let t = from;
  for (const b of busy) {
    if (toMin(b.start) - t >= 30) free.push({ s: t, e: toMin(b.start) });
    t = Math.max(t, toMin(b.start) + b.min);
  }
  if (to - t >= 30) free.push({ s: t, e: to });
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <div className="relative grid min-w-[760px] grid-cols-[84px_1fr] gap-y-2">
        <div className="pointer-events-none absolute top-6 bottom-0 z-[2] w-0.5 rounded-full bg-signal" style={{ left: `calc(84px + (100% - 84px) * ${(NOW - from) / (to - from)})` }} aria-hidden="true">
          <span className="tnum absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full rounded-full bg-signal px-1.5 py-0.5 text-[10.5px] font-semibold text-[#141b29]">10:40</span>
        </div>
        <span />
        <div className="relative h-6">
          {Array.from({ length: 12 }, (_, i) => from + i * 60).map((h) => (
            <span key={h} className="tnum absolute -translate-x-1/2 text-[11.5px] text-ink-3" style={{ left: pct(h) }}>
              {fmt(h).slice(0, 2)}
            </span>
          ))}
        </div>
        {rows.map((r, ri) => (
          <div key={r.name} className="contents">
            <span className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="size-2 rounded-full" style={{ background: `var(--c-${r.color})` }} aria-hidden="true" />
              {r.name}
            </span>
            <div className="relative h-11 rounded-[12px] bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(100%/11_-_1px),var(--line)_calc(100%/11_-_1px),var(--line)_calc(100%/11))]">
              {DAY.filter((b) => b.color === r.color).map((b, i) => (
                <div
                  key={b.key}
                  className="absolute top-1.5 flex h-8 items-center gap-1.5 overflow-hidden rounded-[10px] px-2 text-[12px] font-medium [animation:rise-in_.4s_var(--ease-out)_both]"
                  style={{
                    left: pct(toMin(b.start)),
                    width: `calc(${((b.min) / (to - from)) * 100}% - 3px)`,
                    animationDelay: `${ri * 50 + i * 30}ms`,
                    background: b.state === 'done' ? `color-mix(in srgb, var(--c-${b.color}) 22%, var(--raised))` : b.event ? `color-mix(in srgb, var(--c-${b.color}) 18%, var(--raised))` : `var(--c-${b.color})`,
                    color: b.state === 'done' ? 'var(--ink)' : b.event ? `color-mix(in srgb, var(--c-${b.color}), var(--glass-ink) 48%)` : `var(--text-on-${b.color})`,
                    boxShadow: b.state === 'done' ? 'inset 0 0 0 2px var(--lume)' : b.event ? `inset 0 0 0 2px var(--c-${b.color})` : undefined,
                  }}
                  title={`${b.title} ${b.start}–${fmt(toMin(b.start) + b.min)}`}
                >
                  <span className="truncate">{b.title}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <span className="pt-2 text-[13px] text-ink-3">Free</span>
        <div className="relative h-9 pt-2">
          {free.map((f) => (
            <div key={f.s} className="tnum absolute top-2 h-7 rounded-[9px] border-[1.5px] border-dashed border-line-strong px-2 text-[11.5px] leading-[24px] text-ink-3" style={{ left: pct(f.s), width: `calc(${((f.e - f.s) / (to - from)) * 100}% - 3px)` }}>
              <span className="block truncate">{dur(f.e - f.s)} free</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
