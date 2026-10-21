// Adapted from Fumadocs' Accordion (MIT, github.com/fuma-nama/fumadocs, listed on 21st.dev as
// fuma-nama/accordion): FAQ items that open from a link to their id, each with a button that
// copies its link. Changed for Daybloom: built on native <details name> (one open at a time,
// answers stay in the HTML for search and for readers without script) instead of Radix, and
// styled as the app's rows.

import { useEffect, useState, type ReactNode } from 'react';
import { Check, Link as LinkIcon, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Accordions({ children, className }: { children: ReactNode; className?: string }) {
  // Open the item the address points at (#faq-…), like Fumadocs does.
  useEffect(() => {
    const open = () => {
      const id = location.hash.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  return <div className={cn('divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-raised', className)}>{children}</div>;
}

export function Accordion({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = new URL(location.href);
    url.hash = id;
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      location.hash = id;
    }
  };
  return (
    <details id={id} name="faq" className="faq group scroll-mt-28">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4.5 text-[16.5px] font-medium text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--sunken)_45%,transparent)] sm:px-7 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        <Plus className="size-5 shrink-0 text-ink-3 transition-transform duration-300 [transition-timing-function:var(--ease-out)] group-open:rotate-45" aria-hidden="true" />
      </summary>
      <div className="relative px-5 pb-5 text-[15.5px] leading-[1.6] text-ink-2 sm:px-7 sm:pr-16 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_p+p]:mt-3">
        {children}
        <button type="button" onClick={copy} className="absolute top-0 right-5 hidden size-8 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink sm:grid" aria-label={copied ? 'Link copied' : 'Copy a link to this answer'} aria-live="polite">
          {copied ? <Check className="size-4" aria-hidden="true" /> : <LinkIcon className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </details>
  );
}
