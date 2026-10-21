// Adapted from Magic UI's Magic Card (MIT, magicui.design/docs/components/magic-card): a soft
// light follows the pointer across the card and catches its edge. Changed for Daybloom: the
// light is the card's block colour at low strength, pointer position lives in CSS variables
// (no re-renders), no theme library, and touch screens get the plain card.

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function MagicCard({ children, className, color = 'var(--c-focus)', as: Tag = 'div' }: { children: ReactNode; className?: string; color?: string; as?: 'div' | 'article' | 'li' }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <Tag
      ref={ref as never}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      style={{ '--glow': color } as CSSProperties}
      className={cn(
        'magic-card group/card relative isolate overflow-hidden rounded-[22px] border border-line bg-raised shadow-rest',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
