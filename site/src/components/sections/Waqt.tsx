// Free time that respects meetings and salah: a sample day where calendar events, the five
// prayers and a few minutes to land after meetings all count as taken. Switch them on and
// off and watch the free time change, the way Daybloom finds it (busyBetween in the app).

import { useMemo, useState } from 'react';
import { CalendarDays, Check, Link2, Users, Video } from 'lucide-react';
import { Mihrab } from '@/lib/mihrab';
import { cn } from '@/lib/utils';
import { NextChip } from '../ui/next-chip';
import { Picture } from '../ui/picture';
import { SectionHead } from '../ui/section-head';

type Kind = 'block' | 'event' | 'salah' | 'landing';
interface Item {
  start: number;
  end: number;
  title: string;
  kind: Kind;
  color: string;
}

const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const DAY0 = m('08:00');
const DAY1 = m('20:00');

const BLOCKS: Item[] = [
  { start: m('09:30'), end: m('11:00'), title: 'Deep work', kind: 'block', color: 'focus' },
  { start: m('12:30'), end: m('13:10'), title: 'Lunch', kind: 'block', color: 'care' },
  { start: m('13:30'), end: m('14:45'), title: 'Draft', kind: 'block', color: 'focus' },
  { start: m('18:20'), end: m('19:20'), title: 'Gym', kind: 'block', color: 'move' },
];
const EVENTS: Item[] = [
  { start: m('09:00'), end: m('09:15'), title: 'Standup', kind: 'event', color: 'people' },
  { start: m('11:15'), end: m('12:00'), title: 'Review', kind: 'event', color: 'people' },
  { start: m('15:00'), end: m('15:30'), title: 'Call', kind: 'event', color: 'people' },
];
const SALAH: Item[] = [
  { start: m('12:02'), end: m('12:17'), title: 'Dhuhr', kind: 'salah', color: 'care' },
  { start: m('16:14'), end: m('16:29'), title: 'Asr', kind: 'salah', color: 'care' },
  { start: m('17:51'), end: m('18:06'), title: 'Maghrib', kind: 'salah', color: 'care' },
];
const LANDINGS: Item[] = EVENTS.map((e) => ({ start: e.end, end: e.end + 10, title: 'Land', kind: 'landing', color: 'rest' }));

const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
const pct = (min: number) => `${((min - DAY0) / (DAY1 - DAY0)) * 100}%`;

export function Waqt() {
  const [on, setOn] = useState({ events: true, salah: true, landing: true });
  const items = useMemo(() => [...BLOCKS, ...(on.events ? EVENTS : []), ...(on.salah ? SALAH : []), ...(on.landing && on.events ? LANDINGS : [])], [on]);
  const free = useMemo(() => {
    const busy = [...items].sort((a, b) => a.start - b.start);
    const out: { start: number; end: number }[] = [];
    let t = DAY0;
    for (const b of busy) {
      if (b.start - t >= 40) out.push({ start: t, end: b.start });
      t = Math.max(t, b.end);
    }
    if (DAY1 - t >= 40) out.push({ start: t, end: DAY1 });
    return out;
  }, [items]);
  // All free minutes count, also the short gaps the strip leaves unmarked.
  const total = useMemo(() => {
    const busy = [...items].sort((a, b) => a.start - b.start);
    let t = DAY0;
    let sum = 0;
    for (const b of busy) {
      if (b.start > t) sum += b.start - t;
      t = Math.max(t, b.end);
    }
    return sum + Math.max(0, DAY1 - t);
  }, [items]);

  const toggles: { key: keyof typeof on; label: string; icon: typeof Users }[] = [
    { key: 'events', label: 'Calendar events', icon: CalendarDays },
    { key: 'salah', label: 'Salah', icon: Mihrab },
    { key: 'landing', label: 'Soft landings', icon: Users },
  ];

  return (
    <section id="waqt" aria-labelledby="waqt-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHead
          id="waqt-title"
          title="Free time that respects meetings and salah."
          lead="Calendar events, the five prayers and a few minutes to land after a meeting all count as taken. So when Daybloom, Alef or an AI app suggests a time, that time is really free."
        />

        <div className="mt-12 rounded-[22px] border border-line bg-raised p-5 shadow-rest sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            {toggles.map((t) => {
              const Icon = t.icon;
              const active = on[t.key] && (t.key !== 'landing' || on.events);
              return (
                <button
                  key={t.key}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  disabled={t.key === 'landing' && !on.events}
                  onClick={() => setOn((o) => ({ ...o, [t.key]: !o[t.key] }))}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors duration-150 disabled:opacity-50',
                    active ? 'border-transparent bg-ink text-ink-inverse' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t.label}
                  <span className={cn('grid size-4 place-items-center rounded-full', active ? 'bg-ink-inverse text-ink' : 'border border-line-strong')} aria-hidden="true">
                    {active && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
            <p className="tnum ml-auto text-[14px] text-ink-2" aria-live="polite">
              <span className="font-medium text-ink">{dur(total)}</span> free between 08:00 and 20:00
            </p>
          </div>

          <div className="-mx-5 mt-6 overflow-x-auto px-5 pb-2 sm:-mx-7 sm:px-7">
            <div className="relative h-[156px] min-w-[960px]">
              {/* hours */}
              {Array.from({ length: 13 }, (_, i) => DAY0 + i * 60).map((h) => (
                <div key={h} className="absolute top-0 bottom-6 border-l border-dashed border-line" style={{ left: pct(h) }}>
                  <span className="tnum absolute bottom-[-22px] -translate-x-1/2 text-[11.5px] text-ink-3">{fmt(h).slice(0, 2)}</span>
                </div>
              ))}
              {/* the taken time */}
              {items.map((it) => (
                <div
                  key={`${it.kind}${it.start}`}
                  className={cn('absolute top-[18px] flex h-[58px] items-center overflow-hidden rounded-[12px] px-1.5 text-[11.5px] font-medium [animation:rise-in_.4s_var(--ease-out)]', it.kind === 'landing' && 'top-[30px] h-[34px] rounded-[9px]')}
                  style={{
                    left: pct(it.start),
                    width: `calc(${pct(it.end + DAY0 - it.start)} - 3px)`,
                    // The app's three materials: solid blocks, glass events, salah as soft light.
                    background:
                      it.kind === 'event'
                        ? `color-mix(in srgb, var(--c-${it.color}) 18%, var(--raised))`
                        : it.kind === 'salah'
                          ? `radial-gradient(closest-side, color-mix(in srgb, var(--c-care) 74%, transparent), color-mix(in srgb, var(--c-care) 42%, transparent) 55%, color-mix(in srgb, var(--c-care) 14%, transparent))`
                          : it.kind === 'landing'
                            ? `color-mix(in srgb, var(--c-rest) 20%, var(--raised))`
                            : `var(--c-${it.color})`,
                    color: it.kind === 'block' ? `var(--text-on-${it.color})` : it.kind === 'landing' ? 'var(--ink)' : `color-mix(in srgb, var(--c-${it.color}), var(--glass-ink) 48%)`,
                    boxShadow: it.kind === 'event' ? `inset 0 0 0 2px var(--c-${it.color})` : undefined,
                  }}
                  title={`${it.title} ${fmt(it.start)}–${fmt(it.end)}`}
                >
                  <span className="truncate">{it.kind === 'landing' || it.end - it.start < 30 ? '' : it.title}</span>
                </div>
              ))}
              {/* free time: dashed brackets underneath, like the Gantt view */}
              {free.map((f) => (
                <div key={`${f.start}-${f.end}`} className="absolute top-[88px] h-[30px] rounded-[10px] border-[1.5px] border-dashed border-line-strong px-2 text-[11.5px] leading-[27px] text-ink-3 transition-[left,width] duration-500 [transition-timing-function:var(--ease-out)]" style={{ left: pct(f.start), width: `calc(${pct(f.end + DAY0 - f.start)} - 3px)` }}>
                  <span className="tnum block truncate">{f.end - f.start >= 60 ? `${dur(f.end - f.start)} free` : dur(f.end - f.start)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-3">
            <Legend swatch="var(--c-focus)">Your blocks</Legend>
            <Legend swatch="color-mix(in srgb, var(--c-people) 18%, var(--raised))" edge="var(--c-people)">Calendar events (glass)</Legend>
            <Legend swatch="radial-gradient(closest-side, color-mix(in srgb, var(--c-care) 80%, transparent), color-mix(in srgb, var(--c-care) 20%, transparent))">Salah (soft light), 15 minutes kept free</Legend>
            <Legend swatch="color-mix(in srgb, var(--c-rest) 30%, var(--raised))">10 minutes to land</Legend>
            <span>A sample day.</span>
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Panel
            image={<div className="max-h-[300px] overflow-hidden"><Picture name="waqt" sizes="(min-width: 768px) 280px, 80vw" alt="The Waqt panel: the sun's path from Fajr to Maghrib, today's five prayers with jamaat times, and a week of marked prayers." /></div>}
            title="Waqt: salah in your day"
            icon={Mihrab}
            color="care"
            points={['The five prayers on your dial, with adhan, jamaat and Jumu’ah', ['Tick a prayer right in the timeline: on time, in jamaat, late or qasr', 'Waqt: mark salah in one tap'], 'Gentle reminders before the adhan, at it, and before jamaat', ['Your salah in calm charts: the week, the month, each prayer’s run', 'Waqt: your salah in charts'], 'The Hijri date, the Qibla, and your mosque’s own times']}
          />
          <Panel
            image={<CalendarsMini />}
            title="Your calendars, in one place"
            icon={CalendarDays}
            color="people"
            points={['Google, with more than one account', 'A link from iCloud, Outlook or any app (ICS or webcal)', ['Tick or skip a meeting; a skipped one frees its time', 'Tick or skip calendar events'], 'Read-only: Daybloom never changes your calendars', 'Join Meet, Zoom and Teams calls in one click']}
            extra={
              <span className="flex flex-wrap gap-1.5 pt-1">
                <Tag icon={Video}>Meet · Zoom · Teams</Tag>
                <Tag icon={Link2}>Any ICS link</Tag>
              </span>
            }
          />
        </div>
      </div>
    </section>
  );
}

/** The calendars you connect, as the app lists them (sample accounts). */
function CalendarsMini() {
  const rows = [
    { name: 'Work', from: 'Google', color: 'focus' },
    { name: 'Personal', from: 'Google', color: 'people' },
    { name: 'Family', from: 'iCloud link', color: 'care' },
    { name: 'Team', from: 'Outlook link', color: 'learn' },
  ];
  return (
    <div className="bg-raised p-3.5 text-left" aria-label="A sample list of connected calendars" role="img">
      <p className="px-1 pb-2 text-[12.5px] font-medium text-ink-3">Calendars · synced 2 min ago</p>
      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2.5 rounded-[10px] bg-surface px-2.5 py-2">
            <span className="size-2.5 rounded-full" style={{ background: `var(--c-${r.color})` }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
              <span className="block truncate text-[11px] text-ink-3">{r.from}</span>
            </span>
            <span className="relative h-[18px] w-[30px] rounded-full bg-c-care">
              <span className="absolute top-[2px] right-[2px] size-[14px] rounded-full bg-white shadow-rest" />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 shadow-[inset_0_0_0_2px_var(--c-people)]" style={{ background: 'color-mix(in srgb, var(--c-people) 14%, var(--raised))' }}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium" style={{ color: 'color-mix(in srgb, var(--c-people), var(--glass-ink) 48%)' }}>Design review</span>
          <span className="tnum block text-[11px] text-ink-3">11:15 · in 8 min</span>
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-ink px-2.5 text-[12px] font-medium text-ink-inverse">
          <Video className="size-3.5" /> Join
        </span>
      </div>
    </div>
  );
}

function Legend({ swatch, edge, children }: { swatch: string; edge?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-[4px]" style={{ background: swatch, boxShadow: edge ? `inset 0 0 0 1.5px ${edge}` : undefined }} aria-hidden="true" />
      {children}
    </span>
  );
}

function Tag({ icon: Icon, children }: { icon: typeof Video; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function Panel({ image, title, icon: Icon, color, points, extra }: { image: React.ReactNode; title: string; icon: typeof Video; color: string; points: (string | [string, string])[]; extra?: React.ReactNode }) {
  return (
    <article className="grid grid-cols-1 overflow-hidden rounded-[22px] border border-line bg-raised shadow-rest sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="grid place-items-center bg-surface p-5 sm:p-6">
        <div className="w-full max-w-[280px] overflow-hidden rounded-[16px] shadow-float ring-1 ring-line">{image}</div>
      </div>
      <div className="grid content-start gap-3 p-6 sm:p-7">
        <h3 className="flex items-center gap-2.5 text-[19px] font-medium tracking-[-0.01em] text-ink">
          <span className="grid size-8 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(--c-${color}) 15%, transparent)`, color: `var(--c-${color})` }}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {title}
        </h3>
        <ul className="grid gap-2 text-[14.5px] leading-snug text-ink-2">
          {points.map((p) => {
            const [text, note] = typeof p === 'string' ? [p, null] : p;
            return (
              <li key={text} className="flex gap-2">
                <Check className="mt-[3px] size-3.5 shrink-0" style={{ color: `var(--c-${color})` }} strokeWidth={3} aria-hidden="true" />
                <span>
                  {text}
                  {note && <NextChip note={note} className="ml-2 h-5 align-[1px] text-[11px]" />}
                </span>
              </li>
            );
          })}
        </ul>
        {extra}
      </div>
    </article>
  );
}
