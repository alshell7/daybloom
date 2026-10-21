// Private by default: what stays on your computer, and the few things that ever leave it.

import { AudioLines, Cloud, FolderLock, KeyRound, Laptop, MicOff, MonitorX, ShieldCheck } from 'lucide-react';

import { SectionHead } from '../ui/section-head';

// The exact places, from the README's "Your data": what the list beside it does not say.
const KEPT = [
  { icon: FolderLock, what: 'On a Mac', where: '~/Library/Application Support/app.daybloom.desktop/state/' },
  { icon: FolderLock, what: 'On Windows', where: '%APPDATA%\\app.daybloom.desktop\\state\\' },
  { icon: AudioLines, what: 'On-device models', where: 'Needle (35 MB) and Whistle (17 MB), checked with SHA-256, work offline' },
];

const POINTS = [
  { icon: FolderLock, title: 'On your computer', body: 'Your blocks, settings and addon data live in a folder on your computer. Export a backup whenever you like.' },
  { icon: KeyRound, title: 'Keys in your keychain', body: 'Tokens, calendar sign-ins and calendar links stay in macOS Keychain or Windows Credential Manager.' },
  { icon: Cloud, title: 'Sync to your own repo', body: 'To use more than one computer, Daybloom writes small files to a private GitHub repository that you own.' },
  { icon: ShieldCheck, title: 'AI only with your OK', body: 'Nothing goes to an AI service until you agree. You can stop sharing at any time.' },
  { icon: MonitorX, title: 'Out of screen shares', body: 'Privacy mode keeps Daybloom out of screenshots, recordings and screen sharing. One shortcut turns it on.' },
  { icon: MicOff, title: 'Voice stays local', body: 'Speech turns into text on your computer. Daybloom does not keep recordings.' },
];

export function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="py-20 sm:py-28">
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-14 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-20">
        <figure className="order-2 mx-auto w-full max-w-[420px] lg:order-none" aria-label="What stays on your computer, and what leaves it">
          <div className="overflow-hidden rounded-[22px] border border-line bg-raised shadow-lift">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3 text-[13px] font-medium text-ink-2">
              <Laptop className="size-4" aria-hidden="true" /> On this computer
            </div>
            <ul className="grid gap-1 p-2.5">
              {KEPT.map((k) => {
                const Icon = k.icon;
                return (
                  <li key={k.what} className="flex items-center gap-3 rounded-[14px] px-2.5 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-2">
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium text-ink">{k.what}</span>
                      <span className="block text-[12.5px] leading-snug [overflow-wrap:anywhere] text-ink-3">{k.where}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-dashed border-line-strong bg-surface px-4 py-3.5">
              <p className="text-[12.5px] text-ink-3">Leaves only when you connect it</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {['Your calendars', 'Your GitHub repo', 'An AI service, after you agree'].map((t) => (
                  <span key={t} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2">
                    {t}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </figure>
        <div>
          <SectionHead
            id="privacy-title"
            title="Private by default."
            lead="There is no Daybloom account and no Daybloom server. The app talks only to the services you connect: your calendars, your GitHub repository and, if you agree, an AI service."
          />
          <ul className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {POINTS.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.title} className="border-t border-line pt-5">
                  <Icon className="size-5 text-ink-2" aria-hidden="true" />
                  <h3 className="mt-3 text-[16.5px] font-medium text-ink">{p.title}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-[1.55] text-ink-2">{p.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
