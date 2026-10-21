// The addons, sliding past in two rows. Switch one on when you need it; your day stays as it
// was when you switch it off.

import { Bot, Briefcase, Columns3, Hourglass, Layers, Leaf, MapPin, Plug, Timer, TrendingUp, type LucideIcon } from 'lucide-react';
import { Mihrab } from '@/lib/mihrab';
import type { CategoryId } from '@/lib/themes';
import { Marquee } from '../ui/marquee';

const ADDONS: { name: string; tagline: string; icon: LucideIcon; color: CategoryId }[] = [
  { name: 'Alef', tagline: 'A small robot friend in your dial', icon: Bot, color: 'rest' },
  { name: 'Timeline views', tagline: 'Your day as a board or a Gantt chart', icon: Columns3, color: 'focus' },
  { name: 'Waqt', tagline: 'Salah, woven into your day', icon: Mihrab as LucideIcon, color: 'care' },
  { name: 'Work', tagline: 'Every block can earn', icon: Briefcase, color: 'routine' },
  { name: 'Time Tracker', tagline: 'Know where the time went', icon: Timer, color: 'learn' },
  { name: 'Breadcrumbs', tagline: 'Pick up where you left off', icon: MapPin, color: 'people' },
  { name: 'Make it smaller', tagline: 'For tasks that feel too big to start', icon: Layers, color: 'move' },
  { name: 'Reality check', tagline: 'Plan with the time things really take', icon: Hourglass, color: 'routine' },
  { name: 'Soft landings', tagline: 'A gentle way back after meetings', icon: Leaf, color: 'care' },
  { name: 'Retrospection', tagline: 'Look back kindly, plan a little better', icon: TrendingUp, color: 'learn' },
  { name: 'MCP', tagline: 'Plan your day with your AI apps', icon: Plug, color: 'focus' },
];

function Chip({ a }: { a: (typeof ADDONS)[number] }) {
  const Icon = a.icon;
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-raised py-2 pr-5 pl-2 shadow-rest">
      <span className="grid size-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(--c-${a.color}) 16%, transparent)`, color: `var(--c-${a.color})` }}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="whitespace-nowrap">
        <span className="text-[14.5px] font-medium text-ink">{a.name}</span>
        <span className="ml-2 text-[13.5px] text-ink-3">{a.tagline}</span>
      </span>
    </div>
  );
}

export function Addons() {
  const half = Math.ceil(ADDONS.length / 2);
  return (
    <section aria-labelledby="addons-title" className="py-20 sm:py-24">
      <div className="container-page">
        <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
          <h2 id="addons-title" className="max-w-[18ch] text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-[360] tracking-[-0.035em] text-ink">
            Switch on new powers when you need them.
          </h2>
          <p className="max-w-[44ch] text-[16px] text-ink-2 md:text-right">Eleven addons. Switch one on when you need it. Switch it off, and your day stays as it was.</p>
        </div>
      </div>
      <ul className="sr-only">
        {ADDONS.map((a) => (
          <li key={a.name}>
            {a.name}: {a.tagline}
          </li>
        ))}
      </ul>
      <div className="mt-10 grid gap-3 [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]" aria-hidden="true">
        <Marquee>{ADDONS.slice(0, half).map((a) => <Chip key={a.name} a={a} />)}</Marquee>
        <Marquee reverse duration={56}>
          {ADDONS.slice(half).map((a) => <Chip key={a.name} a={a} />)}
        </Marquee>
      </div>
    </section>
  );
}
