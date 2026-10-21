// AI your way: one setup feeds every feature, on-device first. Pick a service to see who uses
// what, and agree before anything is sent. Then MCP: your own AI apps can plan with your day.

import { useEffect, useRef, useState } from 'react';
import { Bot, Cpu, KeyRound, Layers, Mic, Search, ShieldCheck, Terminal } from 'lucide-react';
import { asset, cn } from '@/lib/utils';
import { useOffscreenPause } from '@/hooks/useOffscreenPause';
import { AnimatedBeam } from '../ui/animated-beam';
import { OrbitingCircles } from '../ui/orbiting-circles';
import { SectionHead } from '../ui/section-head';
import { NextChip } from '../ui/next-chip';
import { TapCards } from './TapCards';

const SERVICES = [
  { id: 'device', name: 'On this device', listens: false, speaks: false },
  { id: 'openai', name: 'OpenAI', listens: true, speaks: true },
  { id: 'anthropic', name: 'Anthropic', listens: false, speaks: false },
  { id: 'gemini', name: 'Gemini', listens: false, speaks: false },
  { id: 'openrouter', name: 'OpenRouter', listens: false, speaks: false },
  { id: 'cloudflare', name: 'Cloudflare', listens: false, speaks: false },
  { id: 'custom', name: 'Your own', listens: true, speaks: true },
] as const;
type ServiceId = (typeof SERVICES)[number]['id'];

const FEATURES = [
  { id: 'alef', name: 'Alef', does: 'Talks with you, plans with you and speaks up on its own', icon: Bot, color: 'rest', device: 'This device · chirps' },
  { id: 'ask', name: 'Ask Daybloom', does: 'Understands what you type or say (⌘K)', icon: Search, color: 'focus', device: 'Needle, on this device' },
  { id: 'smaller', name: 'Make it smaller', does: 'Splits a big task into small first steps', icon: Layers, color: 'move', device: 'Built-in ideas' },
  { id: 'voice', name: 'Voice input', does: 'Turns your voice into words', icon: Mic, color: 'learn', device: 'Whistle, on this device' },
] as const;

export function AI() {
  const [svc, setSvc] = useState<ServiceId>('device');
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const orbit = useRef<HTMLDivElement>(null);
  useOffscreenPause(orbit);
  // The orbits scale with their box, so they fit a phone as well as a desktop.
  const [size, setSize] = useState(460);
  useEffect(() => {
    const el = orbit.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = SERVICES.find((x) => x.id === svc)!;
  const cloud = svc !== 'device';
  const ok = !cloud || agreed[svc];

  const uses = (f: (typeof FEATURES)[number]) => {
    if (!cloud || !ok) return { text: f.device, cloud: false };
    if (f.id === 'voice' && !s.listens) return { text: `${f.device} (${s.name} does not listen)`, cloud: false };
    if (f.id === 'alef') return { text: s.speaks ? `${s.name} · thinks and speaks` : `${s.name} · thinks`, cloud: true };
    return { text: s.name, cloud: true };
  };

  return (
    <section id="ai" aria-labelledby="ai-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHead
          id="ai-title"
          title="One AI setup. Every feature."
          lead="Daybloom thinks on your computer first. Want more? Connect one service in Settings, and Alef, Ask Daybloom, Make it smaller and voice input can all use it. Each feature can pick its own model."
        />

        <NextChip note="AI, set up once" className="mt-5" />
        <div className="mt-12 grid items-center gap-12 lg:mt-14 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          <div ref={orbit} className="motion-loop relative mx-auto aspect-square w-full max-w-[460px]" aria-hidden="true">
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--c-learn)_12%,transparent),transparent)]" />
            <div className="absolute top-1/2 left-1/2 grid -translate-1/2 place-items-center rounded-full border border-line bg-raised shadow-float" style={{ width: Math.round(size * 0.24), height: Math.round(size * 0.24) }}>
              <img src={asset('favicon.svg')} alt="" width={64} height={64} className="size-[58%]" />
            </div>
            <OrbitingCircles radius={Math.round(size * 0.2)} duration={36} offset={20}>
              {['Needle', 'Whistle', 'Voice'].map((n) => (
                <span key={n} className="flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-ink shadow-rest">
                  <Cpu className="size-3 text-c-care" />
                  {n}
                </span>
              ))}
            </OrbitingCircles>
            <OrbitingCircles radius={Math.round(size * 0.385)} duration={64} reverse>
              {SERVICES.filter((x) => x.id !== 'device').map((x) => (
                <span key={x.id} className={cn('rounded-full border px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap shadow-rest transition-colors duration-300', x.id === svc ? 'border-transparent bg-ink text-ink-inverse' : 'border-line bg-raised text-ink-2')}>
                  {x.name}
                </span>
              ))}
            </OrbitingCircles>

          </div>

          <div className="rounded-[22px] border border-line bg-raised p-5 shadow-rest sm:p-7">
            <p className="text-[13px] font-medium text-ink-3">Who uses what</p>
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="AI service">
              {SERVICES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={svc === x.id}
                  onClick={() => setSvc(x.id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors duration-150',
                    svc === x.id ? 'border-transparent bg-ink text-ink-inverse' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
                  )}
                >
                  {x.id === 'device' && <Cpu className="size-3.5" aria-hidden="true" />}
                  {x.name}
                </button>
              ))}
            </div>

            <div className="mt-4 flex min-h-[44px] flex-wrap items-center gap-3 rounded-[14px] bg-sunken px-3.5 py-2.5 text-[13.5px]" aria-live="polite">
              {!cloud ? (
                <span className="flex items-center gap-2.5 text-ink-2">
                  <span className="size-2 shrink-0 rounded-full bg-c-care" aria-hidden="true" />
                  Works offline. Nothing leaves your computer.
                </span>
              ) : ok ? (
                <>
                  <span className="size-2 shrink-0 rounded-full bg-c-care" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-ink-2">
                    Connected. You agreed today. <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={() => setAgreed((a) => ({ ...a, [svc]: false }))}>Stop sharing</button>
                  </span>
                </>
              ) : (
                <>
                  <span className="size-2 shrink-0 rounded-full bg-c-routine" aria-hidden="true" />
                  <span className="min-w-[200px] flex-1 text-ink-2">Needs your OK. Nothing is sent until you agree, and {s.name}'s own privacy terms apply.</span>
                  <button type="button" onClick={() => setAgreed((a) => ({ ...a, [svc]: true }))} className="h-8 rounded-full bg-ink px-3.5 text-[13px] font-medium text-ink-inverse active:scale-[0.97]">
                    I agree
                  </button>
                </>
              )}
            </div>

            <ul className="mt-4 divide-y divide-line">
              {FEATURES.map((f) => {
                const u = uses(f);
                const Icon = f.icon;
                return (
                  <li key={f.id} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 py-3.5 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(--c-${f.color}) 15%, transparent)`, color: `var(--c-${f.color})` }}>
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-ink">{f.name}</span>
                      <span className="block text-[13px] text-ink-3">{f.does}</span>
                    </span>
                    <span key={u.text} className={cn('col-start-2 justify-self-start rounded-full px-2.5 py-1 text-[12.5px] leading-snug [animation:rise-in_.35s_var(--ease-out)] sm:col-start-auto sm:max-w-[220px] sm:justify-self-end sm:text-right', u.cloud ? 'bg-ink text-ink-inverse' : 'bg-sunken text-ink-2')}>
                      {u.text}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-ink-3">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Your key goes straight to the system keychain and is not shown again. If a service does not answer, Daybloom answers on your computer and tells you why.
            </p>
          </div>
        </div>

        <TapCards />
        <Mcp />
      </div>
    </section>
  );
}

const ASK = ['What’s on my day?', 'Find an hour for writing tomorrow afternoon', 'Move my walk to after lunch', 'How did my week go?'];

function Mcp() {
  const box = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  return (
    <div className="mt-6 grid gap-8 rounded-[22px] border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
      <div>
        <h3 className="text-[24px] leading-tight font-[420] tracking-[-0.02em] text-ink">Plan with the AI apps you already use.</h3>
        <p className="mt-3 max-w-[52ch] text-[15.5px] leading-[1.55] text-ink-2">
          With the MCP addon, Claude, Codex and other AI apps can read your day, find free time, and add or move blocks. Every change shows in Daybloom with an Undo.
        </p>
        <ul className="mt-5 grid gap-2 text-[14px] text-ink-2">
          {['Only on this computer, behind a key', 'Read-only with one switch', 'Never reads your keys or passwords'].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-c-care" aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div ref={box} className="relative flex items-center justify-between rounded-[18px] border border-line bg-raised px-5 py-5">
          <div ref={a} className="relative z-[1] grid justify-items-center gap-2 text-[12.5px] text-ink-2">
            <span className="grid size-14 place-items-center rounded-full bg-surface ring-1 ring-line">
              <img src={asset('favicon.svg')} alt="" width={36} height={36} className="size-9" />
            </span>
            Daybloom
          </div>
          <AnimatedBeam containerRef={box} fromRef={a} toRef={b} from="var(--c-focus)" to="var(--c-people)" />
          <div ref={b} className="relative z-[1] grid justify-items-center gap-2 text-[12.5px] text-ink-2">
            <span className="grid size-14 place-items-center rounded-[16px] bg-[color-mix(in_srgb,var(--c-people)_14%,var(--raised))] text-c-people ring-1 ring-line">
              <Terminal className="size-6" aria-hidden="true" />
            </span>
            Your AI app
          </div>
        </div>
        <p className="mt-4 mb-2 text-[13px] text-ink-3">Then ask</p>
        <div className="flex flex-wrap gap-1.5">
          {ASK.map((q) => (
            <span key={q} className="rounded-full bg-[color-mix(in_srgb,var(--c-people)_10%,var(--raised))] px-3 py-1.5 text-[13px] text-ink ring-1 ring-[color-mix(in_srgb,var(--c-people)_22%,transparent)]">
              “{q}”
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

