// Alef, the small robot friend that lives in the middle of the dial. Its eyes follow your
// pointer and blink; click it, stroke it slowly (petting), wiggle over it (tickling) or press
// and hold (a squeeze), and it answers in feelings from the app's own repertoire.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Hand, MessageCircleHeart, Timer } from 'lucide-react';
import { ACTS, lengthOf, type Behavior, type Eye } from '@/lib/alef/behaviors';
import { useCalm } from '@/hooks/useCalm';
import { cssVar, useTheme } from '@/hooks/useTheme';
import { useNow } from '@/hooks/useNow';
import { sampleDay } from '@/lib/day';
import { MINUTE } from '@/lib/time';
import { THEMES, themeStyle } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { AlefEyes } from '../alef/AlefEyes';
import { Dial } from '../dial/Dial';
import { NumberTicker } from '../ui/number-ticker';
import { NextChip } from '../ui/next-chip';
import { SectionHead } from '../ui/section-head';

const E: Eye = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, lid: 0, slant: 0, smile: 0 };
const REST = { l: E, r: E, ms: 480 };

// What Alef says, from the app's lines (src/lib/addons/alef/lines.ts and persona.ts).
const HELLO = ['Boop!', 'Hi there!', 'Oh, hello!', 'Two minutes is a fine start.', 'Plans are meant to bend.', 'One down!', 'I tried to catch fog. I mist.', 'Focus time. I’ll work right here beside you.'];
const FEELINGS: { id: string; label: string; line: string }[] = [
  { id: 'happy', label: 'Happy', line: 'That counts. Well done.' },
  { id: 'loving', label: 'Loving', line: 'Aww! You made my LEDs glow.' },
  { id: 'excited', label: 'Excited', line: 'Ooh, a fresh dial!' },
  { id: 'curious', label: 'Curious', line: 'What’s next on the ring?' },
  { id: 'spinning', label: 'Thinking', line: 'Let me think about your day…' },
  { id: 'proud', label: 'Proud', line: 'Big block, finished. Take a breath.' },
  { id: 'sleepy', label: 'Sleepy', line: 'Late already. Tomorrow is a fresh dial.' },
  { id: 'grumpy', label: 'Grumpy', line: 'Grr! (Just kidding.)' },
  { id: 'dancing', label: 'Dancing', line: 'That’s the whole day. Look at that dial glow!' },
];

interface Sample {
  x: number;
  y: number;
  t: number;
}
/** The app's touch reading (pet.ts): a slow stroke is petting, a fast wiggle tickles. */
function gesture(samples: Sample[], now: number): 'pet' | 'tickle' | null {
  const recent = samples.filter((s) => now - s.t <= 1500);
  if (recent.length < 5) return null;
  let path = 0;
  let turns = 0;
  let dir = 0;
  let run = 0;
  const quick: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const dx = recent[i].x - recent[i - 1].x;
    const dy = recent[i].y - recent[i - 1].y;
    path += Math.hypot(dx, dy);
    if (Math.abs(dx) < 0.004) continue;
    const d = Math.sign(dx);
    if (dir && d !== dir) {
      if (run >= 0.06) {
        turns++;
        quick.push(recent[i].t);
      }
      run = 0;
    }
    dir = d;
    run += Math.abs(dx);
  }
  if (quick.filter((t) => now - t <= 900).length >= 5 && path >= 0.9) return 'tickle';
  if (turns >= 2 && path >= 1.1) return 'pet';
  return null;
}

// The section wears a dark theme of the app in both modes: Midnight on a light page, Plum on a
// dark one, so Alef's eyes glow in the dial's lume.
const toCss = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');
const BAND_CSS = `[data-theme='light'] #alef{${toCss(themeStyle(THEMES[4]) as Record<string, string>)}}[data-theme='dark'] #alef{${toCss(themeStyle(THEMES[8]) as Record<string, string>)}}`;

const CONFETTI = ['#FFD84A', '#5CF2B0', '#FF7AB8', '#7AA7FF', '#FFB14A', '#A58BFF'];

export function Alef() {
  const calm = useCalm();
  const [mode] = useTheme();
  const now = useNow(MINUTE);
  const [pose, setPose] = useState<{ l: Eye; r: Eye; ms: number } | null>(null);
  const [act, setAct] = useState<{ b: Behavior; seq: number } | null>(null);
  const [bubble, setBubble] = useState<{ text: string; seq: number } | null>(null);
  const [follow, setFollow] = useState<{ x: number; y: number } | null>(null);
  const [eye, setEye] = useState({ color: '#8ef0c1', glow: 0.55, shadow: null as string | null });
  const face = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clicks = useRef<number[]>([]);
  const samples = useRef<Sample[]>([]);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const seq = useRef(0);
  const helloIdx = useRef(0);

  const blocks = useMemo(() => (now == null ? [] : sampleDay(now - (now % MINUTE))), [now]);

  // Eye colour from the band's dial finish: lume, glowing (the band is always a dark theme).
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    setEye({ color: cssVar('--d-lume', el) || '#8ef0c1', glow: (0.35 + 0.6 * 0.5) * 0.85, shadow: null });
  }, [mode]);

  const say = (text: string) => {
    setBubble({ text, seq: ++seq.current });
  };

  const play = useCallback(
    (id: string, line?: string) => {
      const b = ACTS[id];
      if (!b) return;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setAct({ b, seq: ++seq.current });
      if (line) say(line);
      if (calm) {
        const last = b.poses[b.poses.length - 1];
        setPose({ l: last.l, r: last.r, ms: 0 });
        timers.current.push(setTimeout(() => (setPose(null), setAct(null)), 1600));
        return;
      }
      let t = 0;
      for (const p of b.poses) {
        timers.current.push(setTimeout(() => setPose({ l: p.l, r: p.r, ms: p.ms }), t));
        t += p.ms + p.hold;
      }
      timers.current.push(setTimeout(() => (setPose(null), setAct(null)), Math.max(t, lengthOf(b))));
    },
    [calm],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // The bubble stays up long enough to read, then goes.
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble((b) => (b?.seq === bubble.seq ? null : b)), 2600 + bubble.text.length * 45);
    return () => clearTimeout(t);
  }, [bubble]);

  // Glancing toward the pointer, anywhere on the screen (in the app it watches you everywhere).
  useEffect(() => {
    if (calm) return;
    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = face.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy);
        const k = Math.min(1, d / (r.width * 1.1));
        setFollow({ x: (dx / (d || 1)) * k, y: (dy / (d || 1)) * k });
        if (idle) clearTimeout(idle);
        idle = setTimeout(() => setFollow(null), 2000);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (idle) clearTimeout(idle);
      cancelAnimationFrame(frame);
    };
  }, [calm]);

  const onClick = () => {
    if (held.current) {
      held.current = false;
      return;
    }
    const t = performance.now();
    clicks.current = [...clicks.current.filter((c) => t - c < 2500), t];
    if (clicks.current.length >= 5) {
      clicks.current = [];
      play('grumpy', 'Grr! (Just kidding.)');
      return;
    }
    const line = HELLO[helloIdx.current++ % HELLO.length];
    play(clicks.current.length >= 3 ? 'delighted' : 'happy', line);
  };
  const onMoveFace = (e: React.PointerEvent) => {
    const el = face.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = performance.now();
    samples.current.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width, t });
    if (samples.current.length > 60) samples.current.splice(0, samples.current.length - 60);
    if (hold.current && e.buttons) {
      clearTimeout(hold.current);
      hold.current = null;
    }
    const g = gesture(samples.current, t);
    if (g) {
      samples.current = [];
      if (g === 'pet') play('purring', 'Aww! You made my LEDs glow.');
      else play('giggling', 'That tickles!');
    }
  };
  const onDown = (e: React.PointerEvent) => {
    held.current = false;
    if (e.button > 0) return;
    hold.current = setTimeout(() => {
      hold.current = null;
      held.current = true;
      play('squished', 'Eep!');
    }, 650);
  };
  const onUp = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };

  const led = act?.b.led ?? '#4FD3E6';
  const ledGlow = act ? act.b.glow : 0.45;
  const overlay = act && !calm ? act.b.overlay : undefined;
  const posture = act && !calm ? act.b.posture : null;

  return (
    <section ref={section} id="alef" aria-labelledby="alef-title" className="screen-dark relative overflow-clip bg-ground py-24 text-ink sm:py-32">
      <style>{BAND_CSS}</style>
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="relative mx-auto w-full max-w-[560px] lg:order-none" data-reveal="turn">
          <Dial mode="12" blocks={blocks} now={now} hour12={false} calm={calm} label="Alef's face in the middle of a Daybloom dial" screen showSeconds={false} showRemain={false}>
            <div className="relative grid w-full justify-items-center">
              {bubble && (
                <div key={bubble.seq} className="alef-bubble absolute bottom-[calc(100%+2%)] z-10 max-w-[150%] rounded-[18px] bg-raised px-4 py-2 text-center text-[clamp(12px,2.6cqi,16px)] font-medium text-ink shadow-float" role="status">
                  {bubble.text}
                </div>
              )}
              <button
                ref={face}
                type="button"
                className="alef-face pointer-events-auto relative w-full cursor-pointer rounded-full outline-offset-8"
                style={posture ? { transform: `translateY(${posture.y * 0.5}%) rotate(${posture.tilt}deg) scale(${posture.scale})` } : undefined}
                aria-label="Alef. Click to say hello, stroke slowly to pet, wiggle to tickle, press and hold to squeeze."
                onClick={onClick}
                onPointerMove={onMoveFace}
                onPointerDown={onDown}
                onPointerUp={onUp}
                onPointerLeave={onUp}
              >
                <span className={cn('block', posture?.bounce && 'alef-hop', posture?.shake && 'alef-shake')} key={act?.seq}>
                  <AlefEyes pose={pose ?? REST} color={eye.color} glow={eye.glow} shadow={eye.shadow} look={pose ? null : follow} alive={!pose} calm={calm} />
                </span>
                {overlay && <Overlay kind={overlay} key={act?.seq} />}
              </button>
              <span className="mt-[6%] text-[clamp(10px,2.3cqi,14px)] font-medium opacity-60">{act ? act.b.label : 'Alef'}</span>
            </div>
          </Dial>
          <div className="alef-led pointer-events-none absolute inset-[22.1%] rounded-full" style={{ ['--led' as string]: led, opacity: 0.3 + ledGlow * 0.7 }} aria-hidden="true" />
        </div>

        <div>
          <SectionHead
            id="alef-title"
            title="Meet Alef, a small friend in your dial."
            lead="Alef is an addon that lives in the middle of the dial, on the widget and in focus mode. Its eyes follow your pointer and show how it feels about your day: glad when you finish, kind when plans slip, sleepy late at night."
          />
          <ul className="mt-9 grid gap-5 sm:grid-cols-2">
            <Point icon={MessageCircleHeart} color="rest" title={<><NumberTicker value={32} /> feelings</>}>
              From glad to sleepy, they follow your day. Slipping plans never make it sad, only attentive.
            </Point>
            <Point icon={Timer} color="care" title="Two minutes to start" note="A helping hand to start">
              When a block begins, Alef offers to do the first two minutes with you, then ten more. A big block is one tap from smaller steps.
            </Point>
            <Point icon={Brain} color="learn" title="It thinks your way">
              On this device by default. Or with an AI service you choose, and only after you agree.
            </Point>
            <Point icon={Hand} color="people" title="A small voice">
              Little robot chirps, a small voice made on your computer, or quiet. Pet it, and it purrs.
            </Point>
          </ul>
          <div className="mt-9">
            <p className="mb-3 text-[13px] text-ink-3">Try a feeling, or touch Alef: click, stroke slowly, wiggle, or press and hold.</p>
            <div className="flex flex-wrap gap-1.5">
              {FEELINGS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => play(f.id, f.line)}
                  className={cn('h-8 rounded-full border px-3 text-[13px] transition-colors duration-150', act?.b.id === f.id ? 'border-transparent bg-ink text-ink-inverse' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Point({ icon: Icon, color, title, children, note }: { icon: typeof Brain; color: string; title: React.ReactNode; children: React.ReactNode; note?: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(--c-${color}) 15%, transparent)`, color: `var(--c-${color})` }}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span>
        <span className="tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] font-medium text-ink">
          {title}
          {note && <NextChip note={note} />}
        </span>
        <span className="mt-1 block text-[14.5px] leading-[1.55] text-ink-2">{children}</span>
      </span>
    </li>
  );
}

function Overlay({ kind }: { kind: string }) {
  if (kind === 'hearts')
    return (
      <span className="alef-fx" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg key={i} className="fx-heart" style={{ ['--i' as string]: i }} viewBox="0 0 24 24">
            <path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.8 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.8 0 5.7 4.1 4.2 7.4C19.5 16.4 12 21 12 21z" />
          </svg>
        ))}
      </span>
    );
  if (kind === 'stars' || kind === 'spark')
    return (
      <span className="alef-fx" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <svg key={i} className="fx-star" style={{ ['--i' as string]: i }} viewBox="0 0 24 24">
            <path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z" />
          </svg>
        ))}
      </span>
    );
  if (kind === 'zzz')
    return (
      <span className="alef-fx" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="fx-z" style={{ ['--i' as string]: i }}>
            z
          </span>
        ))}
      </span>
    );
  if (kind === 'question') return <span className="alef-fx" aria-hidden="true"><span className="fx-mark">?</span></span>;
  if (kind === 'confetti')
    return (
      <span className="alef-fx" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} className="fx-bit" style={{ ['--i' as string]: i, ['--c' as string]: CONFETTI[i % CONFETTI.length], ['--dx' as string]: `${((i * 37) % 21) - 10}`, ['--rot' as string]: `${(i * 53) % 360}deg` }} />
        ))}
      </span>
    );
  return null;
}
