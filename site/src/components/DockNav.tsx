// The section dock at the foot of the screen (wide screens): it shows when you scroll back up
// or point near the bottom edge, and its dot follows the section you are reading.

import { useEffect, useState } from 'react';
import { Bot, CircleHelp, Columns3, Download, History, LayoutGrid, Palette, ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { Mihrab } from '@/lib/mihrab';
import { useCalm } from '@/hooks/useCalm';
import { cn } from '@/lib/utils';
import { Dock, DockIcon } from './ui/dock';

const ITEMS = [
  { id: 'features', label: 'Features', icon: LayoutGrid },
  { id: 'alef', label: 'Alef', icon: Bot },
  { id: 'ai', label: 'AI your way', icon: Sparkles },
  { id: 'waqt', label: 'Meetings and salah', icon: Mihrab },
  { id: 'views', label: 'Board and Gantt', icon: Columns3 },
  { id: 'focus', label: 'Focus and widget', icon: Timer },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'install', label: 'Install', icon: Download },
  { id: 'whats-new', label: "What's new", icon: History },
  { id: 'faq', label: 'FAQ', icon: CircleHelp },
];

export function DockNav() {
  const [show, setShow] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const calm = useCalm();
  useEffect(() => {
    // It stays out of the way while you read down the page, and comes back when you scroll up,
    // or when the pointer comes near the bottom edge. Never on the first screen or the footer.
    let lastY = window.scrollY;
    let near = false;
    let up = false;
    const allowed = () => window.scrollY > window.innerHeight * 0.8 && window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 160;
    const update = () => setShow(allowed() && (up || near));
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) > 6) up = y < lastY;
      lastY = y;
      update();
    };
    const onPointer = (e: PointerEvent) => {
      const n = e.pointerType === 'mouse' && e.clientY > window.innerHeight - 110;
      if (n !== near) {
        near = n;
        update();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    ITEMS.forEach((i) => {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      io.disconnect();
    };
  }, []);
  return (
    <nav
      aria-label="Jump to a section"
      className={cn(
        'fixed bottom-5 left-1/2 z-40 hidden -translate-x-1/2 transition-[opacity,translate] duration-500 [transition-timing-function:var(--ease-out)] md:block',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
      )}
      inert={!show || undefined}
    >
      <Dock magnify={!calm}>
        {(mouseX) =>
          ITEMS.map((i) => {
            const Icon = i.icon;
            return (
              <DockIcon key={i.id} mouseX={mouseX} href={`#${i.id}`} label={i.label} active={active === i.id}>
                <Icon aria-hidden="true" />
              </DockIcon>
            );
          })
        }
      </Dock>
    </nav>
  );
}
