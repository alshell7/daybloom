// More bento cards: the month as tiny dials, the Done list, and the one-minute breathing guide
// (box breathing round a circle, as the app draws it).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Square, Undo2 } from 'lucide-react';
import { useCalm } from '@/hooks/useCalm';
import { useMounted } from '@/hooks/useMounted';
import { useNow } from '@/hooks/useNow';
import { Mihrab } from '@/lib/mihrab';
import type { CategoryId } from '@/lib/themes';
import { cn } from '@/lib/utils';

/** An open arc round (cx, cy), angles clockwise from 12 o'clock. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  };
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ---- the month at a glance: every day a tiny dial of its blocks ----

const WEEK: [number, number, CategoryId][] = [
  [7 * 60, 10, 'care'],
  [9 * 60 + 30, 90, 'focus'],
  [12 * 60 + 30, 40, 'care'],
  [13 * 60 + 30, 90, 'focus'],
  [15 * 60 + 15, 30, 'people'],
  [17 * 60 + 30, 60, 'move'],
  [20 * 60, 30, 'learn'],
];
const WEEKEND: [number, number, CategoryId][] = [
  [9 * 60, 60, 'routine'],
  [11 * 60, 90, 'people'],
  [16 * 60, 60, 'move'],
  [19 * 60, 45, 'rest'],
];

function TinyDial({ day, today, past, outside }: { day: Date; today: boolean; past: boolean; outside: boolean }) {
  const dow = day.getDay();
  const seed = day.getDate();
  const plan = (dow === 0 || dow === 6 ? WEEKEND : WEEK).filter((_, i) => (seed * 7 + i * 3) % 5 !== 0);
  // 24 hours, noon on top, like the app's 24 h dial.
  const deg = (m: number) => ((m - 720) / 1440) * 360;
  return (
    <svg viewBox="0 0 100 100" className={cn('block w-full', outside && 'opacity-25')} aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="none" strokeWidth="12" style={{ stroke: 'var(--d-bezel)' }} />
      <circle cx="50" cy="50" r="36" style={{ fill: 'var(--d-face)' }} />
      {plan.map(([s, len, c], i) => (
        <path
          key={i}
          d={arc(50, 50, 44, deg(s) + 1.5, Math.max(deg(s) + 4.5, deg(s + len) - 1.5))}
          fill="none"
          strokeWidth="12"
          style={{ stroke: past ? `color-mix(in srgb, var(--c-${c}), var(--d-face) var(--d-done))` : `var(--c-${c})` }}
        />
      ))}
      {today && <circle cx="50" cy="50" r="49" fill="none" strokeWidth="2.5" style={{ stroke: 'var(--d-signal)' }} />}
      <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize="30" className="tnum" style={{ fill: today ? 'var(--d-signal)' : 'var(--d-ink)', fontWeight: today ? 600 : 400 }}>
        {day.getDate()}
      </text>
    </svg>
  );
}

export function MonthDials() {
  const mounted = useMounted();
  const now = useNow(60_000);
  const base = now ?? Date.UTC(2026, 9, 21);
  const { cells, title } = useMemo(() => {
    const d = new Date(base);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday first
    const out: { day: Date; outside: boolean; today: boolean; past: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const today = day.toDateString() === d.toDateString();
      out.push({ day, outside: day.getMonth() !== d.getMonth(), today, past: day < d && !today });
    }
    return { cells: out, title: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  }, [base]);
  return (
    <div className="px-6 pb-7 sm:px-7">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[15px] font-medium text-ink">{mounted ? title : ' '}</span>
        <span className="text-[12.5px] text-ink-3">
          Press <kbd>M</kbd>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-x-1.5 gap-y-1 text-center text-[11px] text-ink-3">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {cells.map((c, i) => (
          <div key={i} className="aspect-square" title={mounted && !c.outside ? c.day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : undefined}>
            {mounted ? <TinyDial {...c} /> : <span className="block size-full rounded-full bg-sunken/60" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- what you've done: everything you finished, day by day ----

const DONE = [
  { day: 'Today', items: [
    { t: 'Morning meds', at: '08:04', kind: 'Block', c: 'care' as CategoryId },
    { t: 'Standup', at: '09:15', kind: 'Calendar', c: 'people' as CategoryId },
    { t: 'Dhuhr · in jamaat', at: '13:32', kind: 'Salah', c: 'care' as CategoryId },
  ] },
  { day: 'Yesterday', items: [
    { t: 'Renew the passport', at: '11:20', kind: 'Backlog', c: 'routine' as CategoryId },
    { t: 'Gym', at: '18:40', kind: 'Block', c: 'move' as CategoryId },
  ] },
];

export function DoneList() {
  const [undone, setUndone] = useState<string[]>([]);
  return (
    <div className="grid gap-3 px-6 pb-7 sm:px-7">
      {DONE.map((g) => (
        <div key={g.day}>
          <p className="mb-1.5 text-[12.5px] text-ink-3">{g.day}</p>
          <ul className="grid gap-1">
            {g.items.map((it) => {
              const off = undone.includes(it.t);
              return (
                <li key={it.t} className={cn('flex items-center gap-2.5 rounded-[12px] bg-surface px-2.5 py-1.5 ring-1 ring-line transition-opacity duration-300', off && 'opacity-60')}>
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300', off ? 'border-2 border-line-strong' : 'bg-lume text-[#141b29]')} aria-hidden="true">
                    {!off && (it.kind === 'Salah' ? <Mihrab className="size-3.5" strokeWidth={2.4} /> : <Check className="size-3.5" strokeWidth={3} />)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[13.5px] font-medium text-ink', off && 'text-ink-3')}>{it.t}</span>
                    <span className="tnum block text-[11.5px] text-ink-3">
                      {it.at} · {it.kind}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUndone((u) => (off ? u.filter((x) => x !== it.t) : [...u, it.t]))}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
                  >
                    {off ? (
                      <>
                        <Undo2 className="size-3.5" aria-hidden="true" /> Undo
                      </>
                    ) : (
                      'Not done?'
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---- breathe: box breathing round a circle (in up the left, hold over the top, out down
// the right, rest along the bottom), four rounds, about a minute ----

const PHASES = [
  { id: 'in', word: 'Breathe in', a0: 225, a1: 315 },
  { id: 'hold', word: 'Hold', a0: 315, a1: 405 },
  { id: 'out', word: 'Breathe out', a0: 45, a1: 135 },
  { id: 'rest', word: 'Rest', a0: 135, a1: 225 },
] as const;
const SIDE = 4;
const ROUNDS = 4;

export function Breathe() {
  const [t0, setT0] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const calm = useCalm();
  useEffect(() => {
    if (t0 == null) return;
    timer.current = setInterval(() => setTick((x) => x + 1), 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [t0]);
  const el = t0 == null ? 0 : (performance.now() - t0) / 1000;
  void tick;
  const total = SIDE * 4 * ROUNDS;
  const running = t0 != null && el < total;
  useEffect(() => {
    if (t0 != null && el >= total) setT0(null);
  }, [el, t0, total]);
  const phase = Math.floor(el / SIDE) % 4;
  const round = Math.min(ROUNDS, Math.floor(el / (SIDE * 4)) + 1);
  const left = Math.ceil(SIDE - (el % SIDE));
  const C = 'var(--c-rest)';
  return (
    <div className="grid justify-items-center gap-4 px-6 pb-7 sm:px-7">
      <div className="relative aspect-square w-full max-w-[220px]">
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden="true">
          {PHASES.map((p, i) => (
            <path
              key={p.id}
              d={arc(100, 100, 90, p.a0 + 4, p.a1 - 4)}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              style={{ stroke: running && (i < phase || (i === phase)) ? C : 'var(--line-strong)', opacity: running && i === phase ? 1 : running && i < phase ? 0.55 : 1, transition: 'stroke 0.6s, opacity 0.6s' }}
            />
          ))}
        </svg>
        <div
          key={t0 ?? 'idle'}
          className={cn('absolute inset-[22%] rounded-full', running && !calm && 'breath-orb')}
          style={{ background: `radial-gradient(circle at 50% 42%, color-mix(in srgb, ${C} 70%, white), color-mix(in srgb, ${C} 40%, transparent) 62%, transparent 72%)`, opacity: running ? 1 : 0.55, transform: running ? undefined : 'scale(0.7)' }}
          aria-hidden="true"
        />
        {running && !calm && (
          <div key={`b${t0}`} className="breath-bead absolute inset-0" aria-hidden="true">
            <i className="absolute top-[5%] left-1/2 size-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_14px_var(--c-rest)]" style={{ background: C }} />
          </div>
        )}
        <div className="absolute inset-0 grid place-items-center text-center" aria-live="polite">
          {running ? (
            <span>
              <span className="block text-[17px] font-medium text-ink">{PHASES[phase].word}</span>
              <span className="tnum block text-[13px] text-ink-3">
                {left} · round {round} of {ROUNDS}
              </span>
            </span>
          ) : (
            <span className="text-[13px] text-ink-3">4 · 4 · 4 · 4</span>
          )}
        </div>
      </div>
      <button type="button" onClick={() => setT0(running ? null : performance.now())} className="inline-flex h-9 items-center gap-2 rounded-full bg-sunken px-4 text-[13.5px] font-medium text-ink dark:bg-raised dark:ring-1 dark:ring-line-strong hover:bg-[color-mix(in_srgb,var(--sunken),var(--ink)_6%)] active:scale-[0.97]">
        {running ? <Square className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
        {running ? 'Stop' : 'Breathe · 1 min'}
      </button>
    </div>
  );
}
