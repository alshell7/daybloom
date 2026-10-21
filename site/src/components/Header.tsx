// The top bar: the name, a few section links, GitHub, the theme switch and the download.
// It sits clear at the top and gains a paper backing once the page scrolls under it.

import { useEffect, useRef, useState } from 'react';
import { Download, Menu, X } from 'lucide-react';
import { LATEST_URL, REPO_URL, useRelease } from '@/lib/release';
import { asset, cn } from '@/lib/utils';
import { useOS } from './DownloadButtons';
import { GithubMark } from './ui/github-mark';
import { ThemeToggle } from './ui/theme-toggle';

export const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#alef', label: 'Alef' },
  { href: '#ai', label: 'AI' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#install', label: 'Install' },
  { href: '#whats-new', label: "What's new" },
  { href: '#faq', label: 'FAQ' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const r = useRelease();
  const os = useOS();
  const href = os === 'windows' ? (r.win?.url ?? LATEST_URL) : os === 'mac' ? (r.mac?.url ?? LATEST_URL) : '#install';

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // The menu closes with Esc, a click outside, or a link.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const down = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          'absolute inset-0 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
          scrolled || open ? 'border-line bg-[color-mix(in_srgb,var(--ground)_92%,transparent)] backdrop-blur-xl backdrop-saturate-150' : 'border-transparent',
        )}
        aria-hidden="true"
      />
      <div className="container-page relative flex h-16 items-center gap-3">
        <a href="#top" className="-ml-1 flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-[17px] font-medium tracking-[-0.01em] text-ink">
          <img src={asset('favicon.svg')} alt="" width={30} height={30} className="size-[30px]" />
          Daybloom
        </a>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-3 py-1.5 text-[13.5px] font-medium text-ink-2 transition-colors duration-150 hover:bg-sunken hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <a href={REPO_URL} className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-sunken hover:text-ink" aria-label="Daybloom on GitHub" title="GitHub">
            <GithubMark className="size-[18px]" />
          </a>
          <ThemeToggle />
          <a
            href={href}
            className="ml-1.5 hidden h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-ink-inverse transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--ink),var(--signal)_12%)] active:scale-[0.97] sm:inline-flex"
          >
            <Download className="size-4" aria-hidden="true" strokeWidth={2.2} />
            Download
          </a>
          <button
            ref={button}
            type="button"
            className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-sunken hover:text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="menu"
            aria-label={open ? 'Close the menu' : 'Open the menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div
        ref={panel}
        id="menu"
        hidden={!open}
        className="container-page relative pb-4 lg:hidden"
      >
        <nav aria-label="Sections" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-raised p-2 shadow-lift">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-[15px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
