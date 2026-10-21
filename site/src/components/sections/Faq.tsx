import { REPO_URL } from '@/lib/release';
import { Accordion, Accordions } from '../ui/accordion';
import { SectionHead } from '../ui/section-head';

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="py-20 sm:py-28">
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-20">
        <SectionHead id="faq-title" title="Questions, answered." lead={<>Something else? Ask on <a className="font-medium text-ink underline underline-offset-4" href={`${REPO_URL}/issues`}>GitHub</a>.</>} />
        <Accordions>
          <Accordion id="faq-free" title="Is Daybloom free?">
            <p>Yes. Download it and use it. There is no account to make.</p>
          </Accordion>
          <Accordion id="faq-systems" title="Which computers does it run on?">
            <p>macOS 11 or later, as one app for Apple silicon and Intel Macs, and Windows 10 and 11. The Windows installer adds the WebView2 runtime if your computer does not have it.</p>
          </Accordion>
          <Accordion id="faq-warning" title="Why does my computer warn me the first time?">
            <p>Daybloom is not notarised by Apple or code-signed for Windows yet. So macOS or SmartScreen asks you once. The install steps above show what to click. Updates after that install without the question, and Daybloom installs only updates with a valid signature.</p>
          </Accordion>
          <Accordion id="faq-offline" title="Does it need the internet?">
            <p>No. Daybloom works offline. It uses the network only for the things you connect: calendars, sync with GitHub, an AI service, and the check for updates.</p>
          </Accordion>
          <Accordion id="faq-data" title="Where is my data?">
            <p>On your computer. On a Mac it is in <code className="code">~/Library/Application Support/app.daybloom.desktop/state/</code>, and on Windows in <code className="code">%APPDATA%\app.daybloom.desktop\state\</code>. Tokens and calendar links stay in your system keychain. To make a backup, open Settings › App › Your data and click Export.</p>
          </Accordion>
          <Accordion id="faq-sync" title="Can I use it on more than one computer?">
            <p>Yes. Turn on Sync with GitHub, and Daybloom keeps your blocks and settings the same on all your computers. It writes small files to a private repository that you own. There is no Daybloom server.</p>
          </Accordion>
          <Accordion id="faq-ai" title="Which AI services can I use?">
            <p>None, if you like: Daybloom understands requests and speech on your computer. Its small models download once (35 MB and 17 MB) and are checked before use.</p>
            <p>For more, connect OpenAI, Anthropic, Gemini, OpenRouter, Cloudflare, or any address that works like OpenAI's. Alef, Ask Daybloom, Make it smaller and voice input then share that one setup. Nothing is sent until you agree.</p>
          </Accordion>
          <Accordion id="faq-alef" title="Do I have to use Alef?">
            <p>No. Alef is an addon. Switch it on in the Addons gallery, and switch it off whenever you like. Your day does not change.</p>
          </Accordion>
          <Accordion id="faq-calendars" title="Does it work with Google Calendar, iCloud and Outlook?">
            <p>Yes. Sign in with one or more Google accounts, or paste a calendar link from iCloud, Outlook or any app. Daybloom only reads your calendars. It never changes them.</p>
          </Accordion>
          <Accordion id="faq-reset" title="Can I start over?">
            <p>Yes. A block you delete waits in the Trash for 30 days, so you can put it back. To clear more, Export a copy first in Settings › App › Your data.</p>
            <p>In the next update, Settings › App › Reset Daybloom lets you choose what to clear: blocks, progress, settings, addons and their data, AI services and keys, calendars, sync, downloaded models, or everything. Hold the button to confirm.</p>
          </Accordion>
          <Accordion id="faq-source" title="Can I see the source code?">
            <p>
              Yes. Daybloom is open source under the MIT licence. The code is on <a href={REPO_URL}>GitHub</a>, with notes on how to build it.
            </p>
          </Accordion>
        </Accordions>
      </div>
    </section>
  );
}
