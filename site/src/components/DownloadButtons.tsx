// "Download for macOS / Windows": the visitor's own computer wears the ink pill, the other the
// soft one. Order and size never change, so nothing moves when the page learns the OS. Links point at /releases/latest/download/<file> for the newest release.

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { detectOS, type OS } from '@/lib/os';
import { mb, useRelease } from '@/lib/release';
import { cn } from '@/lib/utils';
import { burst } from './ui/confetti';
import { Magnet } from './ui/magnet';
import { ShimmerLink } from './ui/shimmer-button';

export const DOWNLOADED = 'daybloom:downloaded';

export function useOS(): OS | null {
  const [os, setOS] = useState<OS | null>(null);
  useEffect(() => setOS(detectOS()), []);
  return os;
}

function announce(which: 'mac' | 'windows', el: Element | null) {
  void burst(el);
  window.dispatchEvent(new CustomEvent(DOWNLOADED, { detail: which }));
}

export function DownloadButtons({ size = 'lg', className, showMeta = true, center = false }: { size?: 'lg' | 'md'; className?: string; showMeta?: boolean; center?: boolean }) {
  const r = useRelease();
  const os = useOS();
  const primary = os === 'windows' ? 'windows' : 'mac';
  const h = size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-5 text-sm';
  const items = [
    { key: 'mac' as const, label: 'Download for macOS', href: r.mac?.url ?? r.page },
    { key: 'windows' as const, label: 'Download for Windows', href: r.win?.url ?? r.page },
  ];

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className={cn('flex flex-wrap items-center gap-2.5', center && 'justify-center')}>
        {items.map((it) => (
          <Magnet key={it.key}>
            <ShimmerLink
              href={it.href}
              tone={it.key === primary ? 'ink' : 'soft'}
              className={h}
              onClick={(e) => announce(it.key, e.currentTarget)}
              data-os={it.key}
            >
              <Download className="size-[18px]" aria-hidden="true" strokeWidth={2.2} />
              {it.label}
            </ShimmerLink>
          </Magnet>
        ))}
      </div>
      {showMeta && (
        <p className="tnum text-[13px] leading-relaxed text-ink-3">
          <span className="block">Free · version {r.version}</span>
          <span className="block">
            macOS 11 or later, Apple silicon and Intel{r.mac ? ` (${mb(r.mac.size)})` : ''} · Windows 10 and 11{r.win ? ` (${mb(r.win.size)})` : ''}
          </span>
        </p>
      )}
    </div>
  );
}
