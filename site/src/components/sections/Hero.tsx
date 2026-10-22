// The first viewport: the promise in one line, the download, and a live dial on the
// visitor's own clock. Sweep the ring to paint a block; click a block to finish it.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useCalm } from '@/hooks/useCalm';
import { useMounted } from '@/hooks/useMounted';
import { useNow } from '@/hooks/useNow';
import { sampleDay, type Block, type IconName } from '@/lib/day';
import type { CategoryId } from '@/lib/themes';
import { formatTime, MINUTE, prefers12h } from '@/lib/time';
import { Dial, type DialMode } from '../dial/Dial';
import { Readout } from '../dial/Readout';
import { DownloadButtons } from '../DownloadButtons';
import { ClickSpark, type SparkHandle } from '../ui/click-spark';
import { Segmented } from '../ui/segmented';

const PAINTS: { title: string; category: CategoryId; icon: IconName }[] = [
  { title: 'Call a friend', category: 'people', icon: 'phone' },
  { title: 'Stretch', category: 'care', icon: 'heart' },
  { title: 'Write', category: 'focus', icon: 'pen' },
  { title: 'Water the plants', category: 'routine', icon: 'leaf' },
  { title: 'Practise piano', category: 'learn', icon: 'music' },
  { title: 'Nap', category: 'rest', icon: 'moon' },
  { title: 'Walk', category: 'move', icon: 'footprints' },
];

const HINTS: Record<DialMode, string> = {
  '12': 'The next 12 hours on a clock face',
  '24': 'Your whole day, noon on top, night shaded',
  '60': 'The next hour as a shrinking wedge',
  cycles: 'Focus rounds with built-in breaks',
};

const LUME = ['#3FBF8A', '#8EF0C1', '#FFD84A'];

export function Hero() {
  const now = useNow(1000);
  const calm = useCalm();
  const mounted = useMounted();
  const hour12 = useMemo(() => (mounted ? prefers12h() : false), [mounted]);
  const [mode, setMode] = useState<DialMode>('12');
  const [mine, setMine] = useState<Block[]>([]);
  const [flips, setFlips] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const sparks = useRef<SparkHandle>(null);
  const painted = useRef(0);

  // The sample plan is laid on the visitor's clock once a minute.
  const minute = now == null ? null : now - (now % MINUTE);
  const blocks = useMemo(() => {
    if (minute == null) return [];
    return [...sampleDay(minute), ...mine].map((b) => (b.key in flips ? { ...b, done: flips[b.key] } : b));
  }, [minute, mine, flips]);

  const create = useCallback(
    (r: { startMs: number; endMs: number }) => {
      const p = PAINTS[painted.current++ % PAINTS.length];
      const b: Block = { key: `mine:${Date.now()}`, ...p, startMs: r.startMs, endMs: r.endMs, mine: true };
      setMine((m) => [...m, b]);
      setNote(`Planned “${p.title}”, ${formatTime(r.startMs, hour12)} to ${formatTime(r.endMs, hour12)}.`);
    },
    [hour12],
  );

  const toggle = useCallback(
    (key: string, at: { x: number; y: number }) => {
      const b = blocks.find((x) => x.key === key);
      if (!b) return;
      if (b.event) {
        setNote(`“${b.title}” comes from a calendar. Daybloom only reads calendars.`);
        return;
      }
      const done = !b.done;
      setFlips((f) => ({ ...f, [key]: done }));
      setNote(done ? `“${b.title}” is done. Finished time glows.` : `“${b.title}” is open again.`);
      if (done) sparks.current?.spark(at.x, at.y, LUME);
    },
    [blocks],
  );

  // Keyboard: add a 30-minute block in the next free time (the app's N key).
  const addNext = () => {
    if (now == null) return;
    const step = 5 * MINUTE;
    let t = Math.ceil(now / step) * step;
    const busy = blocks.filter((b) => b.endMs > t).sort((a, b) => a.startMs - b.startMs);
    for (const b of busy) {
      if (b.startMs >= t + 30 * MINUTE) break;
      if (b.endMs > t) t = Math.ceil(b.endMs / step) * step;
    }
    create({ startMs: t, endMs: t + 30 * MINUTE });
  };

  const label = 'A Daybloom dial on your clock. Each block of a sample day is an arc on the ring, and the hand points at now.';

  return (
    <section id="top" className="relative isolate overflow-clip pt-24 pb-20 sm:pt-28 lg:pt-32 lg:pb-28">
      <Washes />
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,580px)]">
        <div className="max-w-[580px]">
          <h1 className="hero-title text-[clamp(46px,8vw,96px)] leading-[0.96] font-[340] tracking-[-0.04em] text-ink">
            {['Time', 'you', 'can', 'see.'].map((w, i) => (
              <span key={w}>
                <span className="hero-word" style={{ animationDelay: `${80 + i * 90}ms` }}>
                  {w}
                </span>
                {i < 3 ? ' ' : ''}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-[34ch] text-[clamp(18px,2vw,21px)] leading-[1.5] text-ink-2 sm:mt-7">
            Daybloom is a visual day planner and timer for macOS, Windows and Android. Your day becomes a dial: each block is an arc on the ring, and the hand points at now.
          </p>
          <DownloadButtons className="mt-9" />
        </div>

        <div className="mx-auto grid w-full max-w-[580px] justify-items-center gap-5">
          <div className="relative w-full" onKeyDown={(e) => e.key.toLowerCase() === 'n' && (e.preventDefault(), addNext())}>
            <Dial mode={mode} blocks={blocks} now={now} hour12={hour12} calm={calm} label={label} interactive onCreate={create} onToggle={toggle}>
              <Readout blocks={blocks} now={now} hour12={hour12} calm={calm} />
            </Dial>
          </div>
          <Segmented
            label="Dial type"
            value={mode}
            onChange={setMode}
            options={[
              { value: '12', label: '12 h' },
              { value: '24', label: '24 h' },
              { value: '60', label: 'Hour' },
              { value: 'cycles', label: 'Cycles' },
            ]}
          />
          <div className="grid min-h-[44px] justify-items-center gap-1 text-center text-[13px] text-ink-3">
            <p>{HINTS[mode]}</p>
            <p aria-live="polite" className="text-ink-2">
              {note || (
                <>
                  Drag around the ring to plan a block. Click a block to finish it.{' '}
                  <button type="button" onClick={addNext} className="inline-flex items-center gap-1 rounded-full px-1.5 align-baseline font-medium text-ink underline-offset-4 hover:underline">
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add one
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
      <ClickSpark ref={sparks} />
    </section>
  );
}

/** The soft colour of the app's screenshots behind the desk: three still washes, no motion. */
function Washes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-[18%] -left-[12%] size-[62vmax] rounded-full bg-[radial-gradient(closest-side,var(--wash-a),transparent)] opacity-70" />
      <div className="absolute -top-[22%] right-[-18%] size-[52vmax] rounded-full bg-[radial-gradient(closest-side,var(--wash-b),transparent)] opacity-60" />
      <div className="absolute right-[-10%] bottom-[-30%] size-[56vmax] rounded-full bg-[radial-gradient(closest-side,var(--wash-c),transparent)] opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-ground" />
    </div>
  );
}
