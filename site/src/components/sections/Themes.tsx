// The themes gallery: pick one of the app's ten themes and this whole section wears it, the
// dial in its paired finish, revealed as a circle from the swatch you pressed (the app's own
// theme change, a 650 ms view transition).

import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNow } from '@/hooks/useNow';
import { useCalm } from '@/hooks/useCalm';
import { sampleDay } from '@/lib/day';
import { ICONS } from '@/lib/icons';
import { FINISHES, THEMES, themeStyle } from '@/lib/themes';
import { formatTime, MINUTE } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Dial } from '../dial/Dial';
import { Readout } from '../dial/Readout';

export function Themes() {
  const [id, setId] = useState('linen');
  const now = useNow(MINUTE);
  const calm = useCalm();
  const busy = useRef(false);
  const theme = THEMES.find((t) => t.id === id)!;
  const finish = FINISHES[theme.finish];
  // The sample day plus one salah, so all three block materials show: solid, glass, soft light.
  const blocks = useMemo(() => {
    if (now == null) return [];
    const m = now - (now % MINUTE);
    const dhuhr = new Date(m);
    dhuhr.setHours(12, 0, 0, 0);
    return [...sampleDay(m), { key: 'dhuhr', title: 'Dhuhr', category: 'care' as const, icon: 'mihrab' as const, startMs: dhuhr.getTime(), endMs: dhuhr.getTime() + 25 * MINUTE, event: true, salah: true }];
  }, [now]);
  const rail = useMemo(() => (now == null ? [] : blocks.filter((b) => b.endMs > now && !b.salah).sort((a, b) => a.startMs - b.startMs).slice(0, 3)), [blocks, now]);

  const pick = (next: string, e: MouseEvent<HTMLButtonElement>) => {
    if (next === id) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    if (calm || !doc.startViewTransition || busy.current) return setId(next);
    const r = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
    const at = `${(x / vw) * 100}% ${(y / vh) * 100}%`;
    const from = `circle(0% at ${at})`;
    const to = `circle(${(rad / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}% at ${at})`;
    const root = document.documentElement;
    busy.current = true;
    root.dataset.themeVt = 'active';
    root.style.setProperty('--theme-vt-clip-from', from);
    const vt = doc.startViewTransition(() => flushSync(() => setId(next)));
    vt.ready.then(() => root.animate({ clipPath: [from, to] }, { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
    vt.finished.finally(() => {
      busy.current = false;
      delete root.dataset.themeVt;
      root.style.removeProperty('--theme-vt-clip-from');
    });
  };

  return (
    <section
      id="themes"
      aria-labelledby="themes-title"
      className={cn('relative overflow-clip bg-ground py-24 text-ink sm:py-32', finish.dark ? 'screen-dark' : 'theme-light')}
      style={{ ...themeStyle(theme), colorScheme: theme.mode }}
    >
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div>
          <h2 id="themes-title" className="text-[clamp(34px,4.8vw,58px)] leading-[1.03] font-[360] tracking-[-0.04em] text-ink">
            Ten themes. One calm look.
          </h2>
          <p className="mt-5 max-w-[50ch] text-[clamp(17px,1.6vw,19.5px)] leading-[1.55] text-ink-2">
            Four light themes and six dark ones, including true black. Each one pairs with a dial finish, so the planner, the widget and the dial always agree. Pick one: this section wears it.
          </p>
          <div className="mt-9 grid gap-5">
            {(['light', 'dark'] as const).map((mode) => (
              <div key={mode}>
                <p className="mb-2.5 text-[13px] text-ink-3">{mode === 'light' ? 'Light' : 'Dark'}</p>
                <div className="flex flex-wrap gap-x-1.5 gap-y-4 sm:gap-x-3" role="radiogroup" aria-label={`${mode} themes`}>
                  {THEMES.filter((t) => t.mode === mode).map((t) => {
                    const f = FINISHES[t.finish];
                    const on = t.id === id;
                    return (
                      <button key={t.id} type="button" role="radio" aria-checked={on} onClick={(e) => pick(t.id, e)} className="group grid w-[50px] justify-items-center gap-1.5 text-[12px] sm:w-[60px] sm:text-[12.5px]">
                        <span className={cn('relative grid size-10 place-items-center rounded-full sm:size-12 transition-transform duration-200 group-hover:scale-105 group-active:scale-95', on ? 'ring-2 ring-ink ring-offset-2 ring-offset-ground' : 'ring-1 ring-line-strong')} style={{ background: f.bezel }}>
                          <span className="grid size-6 place-items-center rounded-full sm:size-8" style={{ background: f.face }}>
                            <span className="size-2 rounded-full" style={{ background: t.signal }} />
                          </span>
                          <span className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full ring-2" style={{ background: t.ground, ['--tw-ring-color' as string]: f.bezel }} aria-hidden="true" />
                        </span>
                        <span className={cn(on ? 'font-medium text-ink' : 'text-ink-2')}>{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[13.5px] text-ink-3">
            {theme.name} wears the {finish.name} dial. Calm motion and a reading font with more open letters are in Settings, too.
          </p>
        </div>

        <div className="relative rounded-[28px] border border-line bg-surface p-5 shadow-lift sm:p-7">
          <div className="mx-auto max-w-[400px]">
            <Dial mode="12" blocks={blocks} now={now} hour12={false} calm={calm} label={`The dial in the ${theme.name} theme`} showSeconds={false}>
              <Readout blocks={blocks} now={now} hour12={false} calm={calm} />
            </Dial>
          </div>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-3" aria-label="Block materials">
            <li className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-[4px] bg-c-focus" aria-hidden="true" /> Your blocks: solid
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-[4px] bg-[color-mix(in_srgb,var(--c-people)_22%,transparent)] shadow-[inset_0_0_0_1.5px_var(--c-people)]" aria-hidden="true" /> Calendar events: glass
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-[4px] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--c-care)_80%,transparent),color-mix(in_srgb,var(--c-care)_15%,transparent))]" aria-hidden="true" /> Salah: soft light
            </li>
          </ul>
          <ul className="mt-5 grid gap-1.5">
            {rail.map((b) => {
              const Icon = ICONS[b.icon];
              const live = b.startMs <= (now ?? 0);
              return (
                <li key={b.key} className={cn('flex items-center gap-3 rounded-[14px] px-2.5 py-2', live ? 'bg-raised shadow-rest' : '')}>
                  <span className="tnum w-[44px] text-right text-[12px] text-ink-3">{formatTime(b.startMs, false)}</span>
                  <span className="grid h-9 w-8 place-items-center rounded-full" style={{ background: live ? `color-mix(in srgb, var(--c-${b.category}) 22%, var(--raised))` : `var(--c-${b.category})`, color: live ? `var(--c-${b.category})` : `var(--on-${b.category})` }}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{b.title}</span>
                  <span className="size-5 rounded-full border-2 border-line-strong" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
