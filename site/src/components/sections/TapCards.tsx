// Answers you can tap: with an AI service, Alef and Ask Daybloom answer with small cards as
// well as words (a plan to place in one go, free times with "Add here", a block with Done and
// Start 2 min). The content is a sample; the buttons work on this page.

import { useState } from 'react';
import { Check, Play, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NextChip } from '../ui/next-chip';

function Shell({ ask, children }: { ask: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
      <p className="self-end rounded-[16px] rounded-br-[6px] bg-ink px-3.5 py-2 text-[13.5px] text-ink-inverse">{ask}</p>
      <div className="rounded-[16px] border border-line bg-raised p-3.5 shadow-rest">{children}</div>
    </article>
  );
}

export function TapCards() {
  const [pick, setPick] = useState([true, true, false]);
  const [placed, setPlaced] = useState(false);
  const [added, setAdded] = useState<number[]>([]);
  const [state, setState] = useState<'open' | 'done' | 'started'>('open');
  const plan = [
    { t: 'Draft the proposal', at: '13:30–15:00', c: 'focus' },
    { t: 'Call Sam back', at: '15:15–15:30', c: 'people' },
    { t: 'Walk outside', at: '16:30–17:00', c: 'move' },
  ];
  const slots = [
    ['07:00–08:00', '1h free'],
    ['10:30–12:00', '1h 30m free'],
    ['14:00–15:30', '1h 30m free'],
  ];
  const n = pick.filter(Boolean).length;
  return (
    <div className="mt-6 rounded-[22px] border border-line bg-raised p-5 shadow-rest sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[24px] leading-tight font-[420] tracking-[-0.02em] text-ink">
            Answers you can tap.
            <NextChip note="Answers you can tap" />
          </h3>
          <p className="mt-2 max-w-[60ch] text-[15.5px] leading-[1.55] text-ink-2">With an AI service, Alef and Ask Daybloom answer with small cards as well as words. One Undo takes back everything a reply changed.</p>
        </div>
        <span className="text-[12.5px] text-ink-3">A sample conversation</span>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Shell ask="Plan my afternoon">
          <p className="text-[13px] font-medium text-ink-3">A plan</p>
          <ul className="mt-2 grid gap-1.5">
            {plan.map((p, i) => (
              <li key={p.t}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 hover:bg-sunken/60">
                  <input type="checkbox" className="peer sr-only" checked={pick[i]} disabled={placed} onChange={() => setPick((x) => x.map((v, j) => (j === i ? !v : v)))} />
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-focus', pick[i] ? 'border-transparent' : 'border-line-strong')} style={pick[i] ? { background: `var(--c-${p.c})`, color: `var(--on-${p.c})` } : undefined} aria-hidden="true">
                    {pick[i] && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{p.t}</span>
                    <span className="tnum block text-[12px] text-ink-3">{p.at}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!n && !placed}
            onClick={() => setPlaced((v) => !v)}
            className={cn('mt-3 h-9 w-full rounded-full text-[13.5px] font-medium transition-colors active:scale-[0.98] disabled:opacity-50', placed ? 'bg-sunken text-ink' : 'bg-ink text-ink-inverse')}
          >
            {placed ? `Placed ${n}. Undo` : `Place ${n} ${n === 1 ? 'block' : 'blocks'}`}
          </button>
        </Shell>

        <Shell ask="When am I free tomorrow?">
          <p className="text-[13px] font-medium text-ink-3">Free times</p>
          <ul className="mt-2 grid gap-1.5">
            {slots.map(([at, free], i) => {
              const on = added.includes(i);
              return (
                <li key={at} className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1.5">
                  <span className="grid size-7 place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-ink-3" aria-hidden="true">
                    {on ? <Check className="size-3.5 text-c-care" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="tnum block text-[14px] font-medium text-ink">{at}</span>
                    <span className="block text-[12px] text-ink-3">{on ? 'Added as a block' : free}</span>
                  </span>
                  <button type="button" onClick={() => setAdded((a) => (on ? a.filter((x) => x !== i) : [...a, i]))} className={cn('inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium transition-colors', on ? 'bg-sunken text-ink-2' : 'bg-ink text-ink-inverse')}>
                    {on ? 'Undo' : (
                      <>
                        <Plus className="size-3.5" aria-hidden="true" /> Add here
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Shell>

        <Shell ask="I'm stuck on the proposal">
          <p className="text-[13px] font-medium text-ink-3">A block, and first steps</p>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-c-focus text-[var(--on-focus)]" aria-hidden="true">
              {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : <Play className="size-3.5" />}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[14px] font-medium text-ink', state === 'done' && 'text-ink-3 line-through')}>Draft the proposal</span>
              <span className="tnum block text-[12px] text-ink-3">{state === 'started' ? 'Focus · 2:00 left' : state === 'done' ? 'Done' : '13:30–15:00 · 40m left'}</span>
            </span>
          </div>
          <ol className="mt-3 grid list-decimal gap-1 pl-5 text-[13px] text-ink-2 marker:text-ink-3">
            <li>Open the doc</li>
            <li>Outline three sections</li>
            <li>Write one rough paragraph</li>
          </ol>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setState((s) => (s === 'done' ? 'open' : 'done'))} className="h-9 rounded-full bg-sunken text-[13px] font-medium text-ink active:scale-[0.98] dark:bg-raised dark:ring-1 dark:ring-line-strong">
              {state === 'done' ? 'Not done' : 'Done'}
            </button>
            <button type="button" onClick={() => setState((s) => (s === 'started' ? 'open' : 'started'))} className="h-9 rounded-full bg-ink text-[13px] font-medium text-ink-inverse active:scale-[0.98]">
              {state === 'started' ? 'Stop' : 'Start 2 min'}
            </button>
          </div>
        </Shell>
      </div>
    </div>
  );
}
