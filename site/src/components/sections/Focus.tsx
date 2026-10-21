// Focus and the widget: three steps beside one frame that changes as you read (sticky on wide
// screens, inline on phones).

import { useEffect, useRef, useState } from 'react';
import { AppWindow, Focus as FocusIcon, PanelTop } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Picture } from '../ui/picture';
import { SectionHead } from '../ui/section-head';

const STEPS = [
  {
    key: 'focus',
    icon: FocusIcon,
    color: 'focus',
    title: 'Focus on one thing',
    body: 'Pick a block, a task from the backlog, or just focus. Turn the dial to any length from one minute to two hours, in one stretch or in cycles with breaks. Focus mode then shows only the session, the steps of the task and what comes next.',
    chips: ['Rest of block', 'Until the next block', 'Just 2 min'],
    image: 'focus' as const,
    alt: 'Focus mode on a black theme: a large dial counts down 40 minutes for “Draft the proposal”, with its steps beside it.',
  },
  {
    key: 'cues',
    icon: PanelTop,
    color: 'learn',
    title: 'Cues at the edge of your screen',
    body: 'An edge glow breathes in the colour of the task and breathes faster near the end. A thin time bar drains along the edge you choose, and a small HUD shows the time left in a corner. None of them takes a click.',
    chips: ['Edge glow', 'Time bar', 'HUD'],
    image: 'screen-cues' as const,
    alt: 'A desktop with a blue edge glow, a time bar along the top, a HUD in the top-right corner, and the Daybloom widget.',
  },
  {
    key: 'widget',
    icon: AppWindow,
    color: 'rest',
    title: 'Always in view',
    body: 'A small, clear dial floats over your work or sits on the desktop. On a Mac, the menu bar shows the countdown too. You can talk to Alef from the widget, and double-click it to open the planner.',
    chips: ['Float on top', 'On the desktop', 'Countdown in the menu bar'],
    image: 'desktop-widget' as const,
    alt: 'The Daybloom widget, a round dial, floating on a dark desktop next to a document window. The menu bar shows “40m · Draft the proposal”.',
  },
];

export function Focus() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="focus" aria-labelledby="focus-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHead id="focus-title" title="Focus on one thing. Keep the time in view." lead="When it is time to work, Daybloom gets out of the way, and keeps the time where you can feel it." />
        <div className="mt-12 grid gap-10 lg:mt-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-16">
          <ol>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.key}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  data-i={i}
                  className={cn('group/step py-8 lg:flex lg:min-h-[78vh] lg:flex-col lg:justify-center lg:py-0', active === i ? 'is-active' : 'is-resting')}
                >
                  <span className="grid size-10 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(--c-${s.color}) 15%, transparent)`, color: `var(--c-${s.color})` }}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {/* The step you are reading is in full ink; the others rest in a quieter ink that still reads. */}
                  <h3 className="mt-4 text-[26px] leading-tight font-[420] tracking-[-0.025em] text-ink transition-colors duration-500 lg:group-[.is-resting]/step:text-ink-3">{s.title}</h3>
                  <p className="mt-3 text-[16px] leading-[1.6] text-ink-2 transition-colors duration-500 lg:group-[.is-resting]/step:text-ink-3">{s.body}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {s.chips.map((c) => (
                      <span key={c} className="rounded-full bg-sunken px-2.5 py-1 text-[12.5px] text-ink-2">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="mt-6 overflow-hidden rounded-[18px] shadow-lift ring-1 ring-line lg:hidden">
                    <Picture name={s.image} sizes="100vw" alt={s.alt} />
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-min(31vw,330px))]">
              <div className="relative aspect-[1600/1000] overflow-hidden rounded-[22px] bg-black shadow-lift ring-1 ring-line">
                {STEPS.map((s, i) => (
                  <div key={s.key} className={cn('absolute inset-0 transition-[opacity,transform] duration-700 [transition-timing-function:var(--ease-out)]', active === i ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0')} aria-hidden={active !== i}>
                    <Picture name={s.image} sizes="(min-width: 1024px) 680px, 1px" alt={active === i ? s.alt : ''} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
