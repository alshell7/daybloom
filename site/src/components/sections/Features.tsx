// The features, as a bento of things that work: four dial faces, quick add that reads plain
// words, the world clock, alarm tones you can hear, the 30-day Trash, voice and the backlog.

import { useEffect, useRef, useState } from 'react';
import { BellRing, Mic, RotateCcw, Trash2 } from 'lucide-react';
import { useCalm } from '@/hooks/useCalm';
import { useNow } from '@/hooks/useNow';
import { sampleDay } from '@/lib/day';
import { MINUTE } from '@/lib/time';
import { Dial, type DialMode } from '../dial/Dial';
import { ICONS } from '@/lib/icons';
import type { IconName } from '@/lib/day';
import type { CategoryId } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { WorldClock } from '../WorldClock';
import { MagicCard } from '../ui/magic-card';
import { SectionHead } from '../ui/section-head';
import { NextChip } from '../ui/next-chip';
import { TypingAnimation } from '../ui/typing-animation';
import { Breathe, DoneList, MonthDials } from './FeatureExtras';

function Card({ title, body, color, className, children, note }: { title: string; body: string; color: CategoryId; className?: string; children?: React.ReactNode; note?: string }) {
  return (
    <MagicCard as="article" color={`var(--c-${color})`} className={cn('flex flex-col', className)}>
      <div className="p-6 pb-0 sm:p-7 sm:pb-0">
        <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[19px] leading-snug font-medium tracking-[-0.01em] text-ink">
          {title}
          {note && <NextChip note={note} />}
        </h3>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-[1.55] text-ink-2">{body}</p>
      </div>
      <div className="relative mt-6 flex-1">{children}</div>
    </MagicCard>
  );
}

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHead
          id="features-title"
          title="Everything your day needs, drawn as a shape."
          lead="Plan in plain words, read the time at a glance, and let the day bend. Here is some of what Daybloom does. Most of it you can try right on this page."
        />
        <div className="mt-14 grid gap-4 sm:mt-16 md:grid-cols-2 lg:grid-cols-3">
          <Card
            className="md:col-span-2"
            color="focus"
            title="Four ways to read the dial"
            body="12 h shows the next twelve hours. 24 h shows the whole day with the night shaded. Hour shows one hour as a wedge. Cycles shows focus rounds with breaks."
          >
            <FourDials />
          </Card>

          <Card color="move" title="Plan in plain words" body="Type “gym 5pm 45m” or “standup weekdays 9:30 15m”. A preview shows what Daybloom understood before you press Enter.">
            <QuickAdd />
          </Card>

          <Card className="lg:row-span-2" color="learn" note="World clock" title="A world clock in the ring" body="Pin up to two cities beside your own. Each ring is that city's day, dusk and night, from the real sun. Point at a ring to read every city's time then.">
            <div className="px-6 pb-7 sm:px-7">
              <WorldClock />
            </div>
          </Card>

          <Card color="routine" note="Alarms" title="Alarms that wake you gently" body="Any block can ring as an alarm. Seven tones are made on your computer, and a gentle start grows from quiet over 40 seconds.">
            <Tones />
          </Card>

          <Card color="people" note="Trash" title="A Trash that keeps 30 days" body="Removed a block by mistake? It waits in the Trash for 30 days. Put it back with one tap.">
            <TrashDemo />
          </Card>

          <Card color="rest" title="Just say it" body="Hold V and talk. Your words show as you speak, and Daybloom acts when you stop. Speech turns into text on your computer.">
            <Voice />
          </Card>

          <Card color="care" note="What you've done" title="What you've done" body="A Done list keeps everything you finished, day by day: blocks, backlog tasks, meetings and salah. Changed your mind? Mark it not done.">
            <DoneList />
          </Card>

          <Card className="md:col-span-2" color="focus" note="The month at a glance" title="The month at a glance" body="Every day of the month is a tiny dial of its blocks. Press M, or type “fri” or “12 nov” to go there.">
            <MonthDials />
          </Card>

          <Card className="md:col-span-2 lg:col-span-1" color="rest" title="Breathe for a minute" body="In free time, one tap starts a short guide. In, hold, out, rest: one breath goes once round the circle.">
            <Breathe />
          </Card>
        </div>
      </div>
    </section>
  );
}

// ---- quick add: phrases typed into the field, each with the block it becomes ----

const PHRASES: { text: string; icon: IconName; color: CategoryId; title: string; when: string }[] = [
  { text: 'gym 5pm 45m', icon: 'dumbbell', color: 'move', title: 'Gym', when: 'Today at 17:00 · 45 minutes' },
  { text: 'standup weekdays 9:30 15m', icon: 'video', color: 'people', title: 'Standup', when: 'Monday to Friday at 09:30 · 15 minutes' },
  { text: 'meds every day 8am', icon: 'pill', color: 'care', title: 'Meds', when: 'Every day at 08:00' },
  { text: 'yoga every other day 7am 30m', icon: 'heart', color: 'care', title: 'Yoga', when: 'Every 2 days at 07:00 · 30 minutes' },
  { text: 'return parcel later', icon: 'sparkles', color: 'routine', title: 'Return parcel', when: 'In the backlog' },
];

function QuickAdd() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(true);
  const p = PHRASES[i];
  const Icon = ICONS[p.icon];
  return (
    <div className="grid gap-3 px-6 pb-7 sm:px-7">
      <div className="flex h-[46px] items-center gap-2 rounded-[14px] border bg-raised pr-3 pl-1.5 transition-[border-color,box-shadow] duration-300" style={{ borderColor: `color-mix(in srgb, var(--c-${p.color}) 60%, transparent)`, boxShadow: `0 0 0 4px color-mix(in srgb, var(--c-${p.color}) 14%, transparent)` }}>
        <span key={p.icon} className="grid size-8 shrink-0 place-items-center rounded-[10px] [animation:rise-in_.3s_var(--ease-out)]" style={{ background: `color-mix(in srgb, var(--c-${p.color}) 18%, transparent)`, color: `var(--c-${p.color})` }}>
          <Icon className="size-[17px]" aria-hidden="true" />
        </span>
        <TypingAnimation
          words={PHRASES.map((x) => x.text)}
          className="min-w-0 flex-1 truncate text-[15px] text-ink"
          onWord={(n, done) => {
            setI(n);
            setTyped(done);
          }}
        />
      </div>
      <div className={cn('flex items-center gap-3 rounded-[14px] bg-sunken px-3 py-2.5 transition-[opacity,transform] duration-300', typed ? 'opacity-100' : 'translate-y-1 opacity-0')} aria-live="polite">
        <span className="grid size-8 place-items-center rounded-full" style={{ background: `var(--c-${p.color})`, color: `var(--on-${p.color})` }}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-medium text-ink">{p.title}</span>
          <span className="tnum block truncate text-[12.5px] text-ink-3">{p.when}</span>
        </span>
      </div>
    </div>
  );
}

// ---- alarm tones: tap one to hear it, made on the spot by the app's own synthesiser ----

const TONES = [
  ['dawn', 'Dawn', 'A soft bell that climbs, like light coming up'],
  ['meadow', 'Meadow', 'A bright little marimba tune'],
  ['harp', 'Harp', 'Plucked strings rolling up, again and again'],
  ['chimes', 'Chimes', 'Slow wind chimes in a quiet garden'],
  ['bedside', 'Bedside', 'Four soft beeps, like a bedside clock'],
  ['musicbox', 'Music box', 'A tiny lullaby, wound up and playing'],
  ['tide', 'Tide', 'Warm, slow swells that rise and fall'],
] as const;

function Tones() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [hint, setHint] = useState<string>(TONES[0][2]);
  const mod = useRef<typeof import('@/lib/tones') | null>(null);
  useEffect(() => () => mod.current?.stopPreview(), []);
  const play = async (id: string, h: string) => {
    setHint(h);
    mod.current ??= await import('@/lib/tones');
    if (playing === id) {
      mod.current.stopPreview();
      setPlaying(null);
      return;
    }
    setPlaying(id);
    mod.current.previewTone(id, 0.55, () => setPlaying((p) => (p === id ? null : p)));
  };
  return (
    <div className="grid gap-3 px-6 pb-7 sm:px-7">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Alarm tones">
        {TONES.map(([id, name, h]) => {
          const on = playing === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => void play(id, h)}
              onPointerEnter={() => setHint(h)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors duration-150',
                on ? 'border-transparent bg-c-routine text-[var(--on-routine)]' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
              )}
            >
              {on ? <Eq /> : <BellRing className="size-3.5" aria-hidden="true" />}
              {name}
            </button>
          );
        })}
      </div>
      <p className="min-h-[2.6em] text-[13px] leading-snug text-ink-3" aria-live="polite">
        {hint}. <span className="text-ink-2">Tap a tone to hear it.</span>
      </p>
    </div>
  );
}

function Eq() {
  return (
    <span className="motion-loop flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className="eq-bar w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

// ---- the Trash: restore a block, watch it go home ----

const TRASHED = [
  { key: 'a', title: 'Spanish practice', icon: 'languages' as IconName, color: 'learn' as CategoryId, left: 'Today · 30 days left' },
  { key: 'b', title: 'Call with Sam', icon: 'phone' as IconName, color: 'people' as CategoryId, left: 'Yesterday · 29 days left' },
];

function TrashDemo() {
  const [gone, setGone] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const left = TRASHED.filter((t) => !gone.includes(t.key));
  return (
    <div className="grid gap-2 px-6 pb-7 sm:px-7">
      <div className="rounded-[14px] border border-line bg-surface p-2">
        <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-[13px] font-medium text-ink-3">
          <Trash2 className="size-3.5" aria-hidden="true" /> Trash
        </div>
        <ul className="grid gap-1">
          {TRASHED.map((t) => {
            const out = gone.includes(t.key);
            const Icon = ICONS[t.icon];
            return (
              <li key={t.key} className={cn('grid transition-[grid-template-rows,opacity,transform] duration-500 [transition-timing-function:var(--ease-out)]', out ? 'grid-rows-[0fr] -translate-y-2 opacity-0' : 'grid-rows-[1fr]')} aria-hidden={out}>
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2.5 rounded-[10px] bg-raised px-2.5 py-2">
                    <span className="grid size-7 place-items-center rounded-full" style={{ background: `var(--c-${t.color})`, color: `var(--on-${t.color})` }}>
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{t.title}</span>
                      <span className="block truncate text-[12px] text-ink-3">{t.left}</span>
                    </span>
                    <button
                      type="button"
                      tabIndex={out ? -1 : 0}
                      onClick={() => {
                        setGone((g) => [...g, t.key]);
                        setMsg(`“${t.title}” is back on your day.`);
                      }}
                      className="h-7 rounded-full bg-sunken px-2.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--sunken),var(--ink)_7%)]"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {left.length === 0 && (
          <div className="flex items-center justify-between gap-2 px-2 py-2.5 text-[13px] text-ink-3 [animation:rise-in_.4s_var(--ease-out)]">
            The Trash is empty.
            <button type="button" onClick={() => (setGone([]), setMsg(''))} className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">
              <RotateCcw className="size-3.5" aria-hidden="true" /> Again
            </button>
          </div>
        )}
      </div>
      <p className="min-h-[1.4em] text-[13px] text-ink-3" aria-live="polite">
        {msg}
      </p>
    </div>
  );
}

// ---- voice: the capsule while listening ----

function Voice() {
  return (
    <div className="grid gap-3 px-6 pb-7 sm:px-7">
      <div className="flex items-center gap-3 rounded-full bg-ink py-2 pr-4 pl-2 text-ink-inverse shadow-float">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-c-rest text-[var(--on-rest)]">
          <Mic className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="motion-loop flex h-6 items-center gap-[3px]" aria-hidden="true">
          {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.3].map((h, i) => (
            <i key={i} className="voice-bar w-[3px] rounded-full bg-current opacity-80" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.09}s` }} />
          ))}
        </span>
        <span className="truncate text-[13px] opacity-80">Listening</span>
      </div>
      <p className="rounded-[14px] bg-sunken px-3.5 py-2.5 text-[14px] text-ink">“Add yoga tomorrow at 7:30 for 30 minutes”</p>
      <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <kbd>V</kbd> hold to talk · tap for hands-free
      </p>
    </div>
  );
}

// ---- the four dial types, live on your clock ----

const FACES: { mode: DialMode; name: string; hint: string }[] = [
  { mode: '12', name: '12 h', hint: 'The next 12 hours' },
  { mode: '24', name: '24 h', hint: 'The whole day' },
  { mode: '60', name: 'Hour', hint: 'One hour as a wedge' },
  { mode: 'cycles', name: 'Cycles', hint: 'Focus with breaks' },
];

function FourDials() {
  const now = useNow(5000);
  const calm = useCalm();
  const blocks = now == null ? [] : sampleDay(now - (now % MINUTE));
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 px-6 pb-7 sm:grid-cols-4 sm:px-7">
      {FACES.map((f) => (
        <li key={f.mode} className="grid justify-items-center gap-3 text-center">
          <div className="w-full max-w-[170px]">
            <Dial mode={f.mode} blocks={blocks} now={now} hour12={false} calm={calm} label={`The ${f.name} dial`} compact showSeconds={false} showRemain={false} />
          </div>
          <span>
            <span className="block text-[14px] font-medium text-ink">{f.name}</span>
            <span className="block text-[12.5px] text-ink-3">{f.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
