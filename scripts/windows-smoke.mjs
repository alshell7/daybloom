// Windows smoke test for the installed app (run by .github/workflows/windows.yml).
//
//   node scripts/windows-smoke.mjs <out-dir> <artifact-dir>
//
// Installs the NSIS bundle silently, launches Daybloom, and checks with real Win32 input,
// window styles and screenshots: the transparent widget (no black box), float-on-top vs
// sit-on-desktop, the tray left click, the widget double-click and drag, notifications, the
// microphone path, the theme reveal, activity sensing, exports, privacy mode, the screen-cues
// overlay, and idle CPU. Page state is read over the WebView2 DevTools protocol on a port the
// workflow builds into pull-request installers (WebView2 ignored the env var and registry
// overrides for it); published releases have no port, so their page-level checks are skipped.
// Nothing is attached while CPU is sampled. SMOKE_SOURCE says which kind is under test.
// Writes results.json, summary.md and screenshots to <out-dir>.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] ?? 'smoke-out');
const ART = path.resolve(process.argv[3] ?? 'artifact');
const PS1 = path.resolve(import.meta.dirname, 'win32.ps1');
const DEBUG_PORT = 9222;
const SOURCE = process.env.SMOKE_SOURCE ?? 'build'; // 'build' (port built in) | 'release'
const WALL = [0, 128, 128]; // solid teal desktop: anything else in a widget corner is the window itself
const IDENTIFIER = 'app.daybloom.desktop';
const CPU_SECONDS = 60;
const HIDDEN_CPU_SECONDS = 300; // the all-day state: widget on the desktop, planner in the tray

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const cpu = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(check, status, detail = '') {
  results.push({ check, status, detail });
  console.log(`[${status.toUpperCase()}] ${check}${detail ? ` — ${detail}` : ''}`);
}

function ps(cmd, args = {}) {
  const argv = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Cmd', cmd];
  for (const [k, v] of Object.entries(args)) argv.push(`-${k}`, String(v));
  let out;
  try {
    out = execFileSync('powershell', argv, { encoding: 'utf8', maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // Say what PowerShell said (a compile error in the helper's C# fails every command).
    throw new Error(`win32.ps1 ${cmd} failed: ${String(e.stderr ?? e.message).replace(/\s+/g, ' ').trim().slice(0, 600)}`);
  }
  // The JSON is the last line; anything a cmdlet printed before it (even UTF-16) is ignored.
  const last = out.replace(/\0/g, '').trim().split(/\r?\n/).pop();
  return last ? JSON.parse(last) : null;
}

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const rect = (w) => `${w.x},${w.y},${w.w},${w.h}`;
const shot = (name, r) => ps('shot', r ? { A: path.join(OUT, name), B: r } : { A: path.join(OUT, name) });

async function waitFor(what, fn, ms = 30_000, every = 500) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

function findFiles(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findFiles(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
}

// ---- a tiny DevTools-protocol client --------------------------------------------------

class Cdp {
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error(`cannot connect ${url}`));
    });
    return new Cdp(ws);
  }
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        const { res, rej } = this.pending.get(d.id);
        this.pending.delete(d.id);
        d.error ? rej(new Error(d.error.message)) : res(d.result);
      } else if (d.method === 'Runtime.exceptionThrown') {
        const x = d.params.exceptionDetails;
        this.errors.push(`exception: ${x.exception?.description ?? x.text}`.slice(0, 400));
      } else if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) {
        this.errors.push(`console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 400));
      } else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
        this.errors.push(`log: ${d.params.entry.text}`.slice(0, 400));
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      setTimeout(() => this.pending.delete(id) && rej(new Error(`${method} timed out`)), 20_000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  close() {
    this.ws.close();
  }
}

// DevTools clients by window label ({ main, widget }), or null if the wanted pages never showed.
async function pages(want = ['main', 'widget']) {
  const targets = await waitFor(
    `${want.join(' + ')} on the debug port`,
    async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const t = (await r.json()).filter((x) => x.type === 'page');
        return t.length >= want.length ? t : null;
      } catch {
        return null;
      }
    },
    45_000,
  ).catch(() => null);
  if (!targets) return null;
  const byLabel = {};
  for (const t of targets) {
    const c = await Cdp.connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');
    await c.send('Log.enable');
    const label = await c.eval('window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? null');
    if (label) byLabel[label] = c;
    else c.close();
  }
  if (want.every((l) => byLabel[l])) return byLabel;
  closeAll(byLabel);
  return null;
}

const closeAll = (pg) => pg && Object.values(pg).forEach((c) => c.close());

const PROBE = `(() => ({
  label: __TAURI_INTERNALS__.metadata.currentWindow.label,
  visibility: document.visibilityState,
  ua: navigator.userAgent.match(/Edg\\/[\\d.]+/)?.[0] ?? navigator.userAgent,
  viewTransitions: typeof document.startViewTransition === 'function',
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  motion: document.documentElement.dataset.motion,
  theme: document.documentElement.dataset.theme,
  htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  widgetMode: document.body.classList.contains('widget-mode'),
  lexend: document.fonts.check('16px "Lexend Variable"'),
  dpr: devicePixelRatio,
  size: [innerWidth, innerHeight],
  animations: document.getAnimations().length,
}))()`;

// ---- the app -------------------------------------------------------------------------

function install() {
  const setup = findFiles(ART, (n) => /-setup\.exe$/i.test(n))[0];
  if (!setup) throw new Error(`no NSIS installer under ${ART}`);
  const msi = findFiles(ART, (n) => /\.msi$/i.test(n))[0];
  record('Installers built', 'pass', [setup, msi].filter(Boolean).map((f) => `${path.basename(f)} (${(fs.statSync(f).size / 1048576).toFixed(1)} MB)`).join(', '));
  execFileSync(setup, ['/S'], { stdio: 'inherit' });
  const dirs = [path.join(process.env.LOCALAPPDATA, 'Daybloom'), path.join(process.env.LOCALAPPDATA, 'Programs', 'Daybloom'), path.join(process.env.ProgramFiles, 'Daybloom')];
  const exe = dirs.flatMap((d) => findFiles(d, (n) => /\.exe$/i.test(n) && !/uninstall/i.test(n)))[0];
  if (!exe) throw new Error(`installed exe not found in ${dirs.join(', ')}`);
  record('NSIS silent install', 'pass', `${exe}; WebView2 runtime ${ps('webview2') || 'not found'}`);
  return { exe, msi };
}

function seedState() {
  // Show the widget on launch, full motion (the heaviest case), notifications on.
  const dir = path.join(process.env.APPDATA, IDENTIFIER, 'state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ widget: { visible: true, layer: 'top' }, motion: 'full', notify: true, autoUpdate: false }));
}

const exits = new Map();
let launches = 0;

// The app's stdout/stderr go to app-N.log: a GUI-subsystem exe still writes a panic there.
function launch({ exe }) {
  const log = path.join(OUT, `app-${++launches}.log`);
  const fd = fs.openSync(log, 'w');
  const child = spawn(exe, [], { detached: true, stdio: ['ignore', fd, fd] });
  child.on('exit', (code) => exits.set(child.pid, `0x${(code >>> 0).toString(16)}`));
  child.unref();
  return { pid: child.pid, log };
}

function taskkill(...args) {
  try {
    execFileSync('taskkill', [...args, '/F'], { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
}

function quit(app) {
  if (app.pid) taskkill('/PID', String(app.pid), '/T');
  taskkill('/IM', path.basename(app.exe));
}

const windowsOf = (pid) => list(ps('windows', { A: pid }));
const mainOf = (pid) => windowsOf(pid).find((w) => w.title === 'Daybloom');
const widgetOf = (pid) => windowsOf(pid).find((w) => w.title === 'Daybloom Widget');
const TOPMOST = 0x8;

// What the app looked like when something never showed up: written to diagnostics-N.json.
function diagnose(run, what) {
  const procs = list(ps('procs'));
  const pids = new Set([run.pid, ...procs.map((p) => p.pid)]);
  const windows = list(ps('windows')).filter((w) => pids.has(w.pid) || /daybloom/i.test(w.title));
  const log = fs.existsSync(run.log) ? fs.readFileSync(run.log, 'utf8').slice(-4000) : '';
  const d = { what, spawned: run.pid, exit: exits.get(run.pid) ?? 'still running', procs, windows, log };
  fs.writeFileSync(path.join(OUT, `diagnostics-${launches}.json`), JSON.stringify(d, null, 2));
  try {
    shot(`diagnostics-${launches}.png`);
  } catch {
    /* ignore */
  }
  return `${what}: spawned pid ${run.pid} exit ${d.exit}; daybloom processes ${JSON.stringify(procs)}; windows ${JSON.stringify(windows.map((w) => [w.pid, w.title, w.cls, w.visible]))}; log ${JSON.stringify(log.slice(-600))}`;
}

// Launches the app and waits for the planner, then the widget (shown at launch from the seeded
// settings; opened through the app's own widget_show command if it was not).
async function start(app) {
  const run = { ...app, ...launch(app) };
  const planner = await waitFor('planner window', () => {
    const procs = list(ps('procs'));
    const pids = [run.pid, ...procs.map((p) => p.pid)];
    return list(ps('windows', { A: pids.join(',') })).find((w) => w.title === 'Daybloom' && w.visible);
  }, 90_000, 1000).catch(() => null);
  if (!planner) throw new Error(diagnose(run, 'planner window never appeared'));
  run.pid = planner.pid;

  let widget = await waitFor('widget window', () => widgetOf(run.pid)?.visible && widgetOf(run.pid), 20_000).catch(() => null);
  if (!widget) {
    const pg = await pages(['main']);
    await pg?.main.eval(`__TAURI_INTERNALS__.invoke('widget_show', { show: true })`).catch((e) => console.log('widget_show', e.message));
    closeAll(pg);
    widget = await waitFor('widget window', () => widgetOf(run.pid)?.visible && widgetOf(run.pid), 15_000).catch(() => null);
    if (!widget) throw new Error(diagnose(run, 'widget window never appeared'));
    record(`Widget shown at launch ${launches}`, 'warn', 'not shown from saved settings; opened with widget_show');
  }
  return { run, main: planner, widget };
}

async function hideMain(pid) {
  const main = mainOf(pid);
  ps('post', { A: main.hwnd, B: 0x10, C: 0, D: 0 }); // WM_CLOSE, as the title-bar X does
  return waitFor('planner to hide', () => !mainOf(pid)?.visible, 10_000);
}

async function trayClick(pid) {
  const hwnd = ps('tray', { A: pid, B: 0x201 });
  if (!hwnd) return null;
  await sleep(60);
  ps('tray', { A: pid, B: 0x202 });
  return hwnd;
}

// ---- phase A: behaviour ----------------------------------------------------------------

async function devtoolsWhy(pid) {
  let version;
  try {
    version = JSON.stringify(await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()).slice(0, 200);
  } catch (e) {
    version = String(e.cause?.code ?? e.message);
  }
  return `port ${DEBUG_PORT} listeners ${JSON.stringify(ps('port', { A: DEBUG_PORT }))}; /json/version ${version}; browser flags '${ps('browserargs', { A: pid })}'`;
}

// Starts the app and attaches to its pages when the build has a debugging port.
async function startWithDevtools(app) {
  const started = await start(app);
  await sleep(8000); // fonts, first springs, sample day
  if (SOURCE === 'release') {
    record('DevTools connection to the WebView2 pages', 'warn', 'release builds have no debugging port; page-level checks skipped');
    return { started, pg: null };
  }
  const pg = await pages();
  record(
    'DevTools connection to the WebView2 pages',
    pg ? 'pass' : 'fail',
    pg ? `browser flags '${ps('browserargs', { A: started.run.pid })}'` : `${await devtoolsWhy(started.run.pid)}; page-level checks skipped`,
  );
  return { started, pg };
}

async function behaviour(app) {
  let run = app;
  let pg = null;
  try {
    const { started, pg: pages0 } = await startWithDevtools(app);
    pg = pages0;
    run = started.run;
    const { pid } = run;
    const { widget } = started;

    if (pg) {
      const probeMain = await pg.main.eval(PROBE);
      const probeWidget = await pg.widget.eval(PROBE);
      record('WebView2 runtime', 'info', `${probeMain.ua}; dpr ${probeMain.dpr}; view transitions ${probeMain.viewTransitions}; prefers-reduced-motion ${probeMain.reducedMotion}; motion ${probeMain.motion}`);
      record('Bundled Lexend font loaded', probeMain.lexend ? 'pass' : 'fail');
      const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
      record(
        'Widget page background is transparent',
        probeWidget.widgetMode && clear(probeWidget.bodyBg) && clear(probeWidget.htmlBg) ? 'pass' : 'fail',
        `html ${probeWidget.htmlBg}, body ${probeWidget.bodyBg}`,
      );
    }
    const fg0 = ps('foreground');
    record('Widget does not take the focus when it appears', fg0?.hwnd !== widget.hwnd ? 'pass' : 'fail', `foreground '${fg0?.title}'`);
    record('Widget window styles', 'info', `exStyle 0x${(widget.exStyle >>> 0).toString(16)}, ${widget.w}x${widget.h} at ${widget.x},${widget.y}`);
    shot('01-launch.png');

    // Transparency: with the planner out of the way, the widget's corners must show the teal desktop.
    await hideMain(pid);
    await sleep(1500);
    if (pg) {
      const vis = await pg.main.eval('document.visibilityState');
      record('Planner closed to the tray reports document.hidden', vis === 'hidden' ? 'pass' : 'fail', `visibilityState '${vis}'`);
    }
    // Over desktop checked to be bare first: the runner's own console window sits top left.
    let w = widgetOf(pid);
    const scr = ps('screen');
    const teal = (c) => c.black < 0.01 && Math.abs(c.r - WALL[0]) + Math.abs(c.g - WALL[1]) + Math.abs(c.b - WALL[2]) < 60;
    const spot = [
      [scr.w - w.w - 60, Math.round((scr.h - w.h) / 2)],
      [scr.w - w.w - 60, 60],
      [Math.round((scr.w - w.w) / 2), scr.h - w.h - 90],
    ].find(([x, y]) => teal(ps('corners', { A: `${x},${y},${w.w},${w.h}` })));
    if (!spot) record('Transparent widget: no black box', 'warn', 'no bare patch of desktop to test over');
    else {
      ps('place', { A: w.hwnd, B: `${spot[0]},${spot[1]},${w.w},${w.h}` });
      await sleep(1500);
      w = widgetOf(pid);
      const c = ps('corners', { A: rect(w) });
      record('Transparent widget: no black box', teal(c) ? 'pass' : 'fail', `corners over bare desktop avg rgb(${c.r},${c.g},${c.b}), ${(c.black * 100).toFixed(1)}% near-black; desktop is rgb(${WALL})`);
    }
    shot('02-widget-over-desktop.png', `${w.x - 30},${w.y - 30},${w.w + 60},${w.h + 60}`);

    // Tray: a left click (button up) opens the planner.
    const tray = await trayClick(pid);
    if (!tray) record('Tray icon left click opens the planner', 'fail', 'no tray_icon_app window for the process');
    else {
      const shown = await waitFor('planner after tray click', () => mainOf(pid)?.visible, 5000).catch(() => false);
      record('Tray icon left click opens the planner', shown ? 'pass' : 'fail', 'WM_LBUTTONDOWN/UP delivered to the tray callback window');
    }
    await sleep(1500);
    if (pg) {
      const vis = await pg.main.eval('document.visibilityState');
      record('Reopened planner is visible to the page again', vis === 'visible' ? 'pass' : 'fail', `visibilityState '${vis}'`);
    }

    if (pg) {
      // Theme reveal (View Transitions in WebView2): must flip the theme and throw nothing.
      const before = pg.main.errors.length;
      const flip = await pg.main.eval(`(async () => {
        const b = document.querySelector('button.icon-btn.toggle');
        if (!b) return { error: 'theme toggle not found' };
        const from = document.documentElement.dataset.theme;
        b.click();
        await new Promise((r) => setTimeout(r, 1200));
        return { from, to: document.documentElement.dataset.theme };
      })()`);
      const img = await pg.main.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
      if (img) fs.writeFileSync(path.join(OUT, '03-theme-flipped.png'), Buffer.from(img.data, 'base64'));
      const errs = pg.main.errors.slice(before);
      record(
        'Theme reveal (view transition) flips the theme without errors',
        !flip.error && flip.from !== flip.to && !errs.length ? 'pass' : 'fail',
        flip.error ?? `${flip.from} → ${flip.to}${errs.length ? `; ${errs.join(' | ')}` : ''}`,
      );
      // The widget follows the theme; a dark color-scheme must not paint its canvas dark.
      if (flip.to === 'dark' && spot) {
        await sleep(1500);
        const wd = widgetOf(pid);
        const behind = ps('corners', { A: rect(wd) });
        const ok = behind.black < 0.01 && Math.abs(behind.r - WALL[0]) + Math.abs(behind.g - WALL[1]) + Math.abs(behind.b - WALL[2]) < 60;
        record('Transparent widget in the dark theme', ok ? 'pass' : 'fail', `corners avg rgb(${behind.r},${behind.g},${behind.b}), ${(behind.black * 100).toFixed(1)}% near-black; theme '${await pg.widget.eval('document.documentElement.dataset.theme')}'`);
        shot('03b-widget-dark.png', `${wd.x - 30},${wd.y - 30},${wd.w + 60},${wd.h + 60}`);
      }
      await pg.main.eval(`document.querySelector('button.icon-btn.toggle')?.click()`);
      await sleep(1200);

      // Notifications from the installed app (the same IPC as platform.notify).
      try {
        const granted = await pg.main.eval(`__TAURI_INTERNALS__.invoke('plugin:notification|is_permission_granted')`);
        await pg.main.eval(`__TAURI_INTERNALS__.invoke('plugin:notification|notify', { options: { title: 'Daybloom smoke test', body: 'Now: Deep work · 45m' } })`);
        await sleep(3500);
        shot('04-notification.png');
        record('Notification sent from the installed app', 'pass', `permission granted: ${granted}; see 04-notification.png`);
      } catch (e) {
        record('Notification sent from the installed app', 'fail', String(e.message ?? e));
      }

      // Microphone path for voice: getUserMedia must fail only for want of a device (runners
      // have none), never on CSP, the secure context or a permission prompt; the worklet loads.
      const mic = await pg.main.eval(`(async () => {
        const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('no answer after ' + ms + ' ms (permission prompt?)'), { name: 'Timeout' })), ms))]);
        const out = { secure: isSecureContext, inputs: (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').length };
        try {
          const s = await within(navigator.mediaDevices.getUserMedia({ audio: true }), 8000);
          s.getTracks().forEach((t) => t.stop());
          out.gum = 'granted';
        } catch (e) { out.gum = e.name + ': ' + e.message; }
        try {
          const ctx = new AudioContext();
          await within(ctx.audioWorklet.addModule('/voice/capture-worklet.js'), 8000);
          await ctx.close();
          out.worklet = 'loaded';
        } catch (e) { out.worklet = e.name + ': ' + e.message; }
        return out;
      })()`);
      record('Microphone: getUserMedia fails only for want of a device', mic.secure && (mic.gum === 'granted' || /^NotFoundError/.test(mic.gum)) ? 'pass' : 'fail', `secure context ${mic.secure}; ${mic.inputs} audio inputs; ${mic.gum}`);
      record('Microphone: voice AudioWorklet loads under the CSP', mic.worklet === 'loaded' ? 'pass' : 'fail', mic.worklet);
    }

    // Layers: Notepad over the widget, then the widget's pin button flips top ↔ desktop.
    const notepad = spawn('notepad.exe', [], { detached: true, stdio: 'ignore' });
    notepad.unref();
    const np = await waitFor('Notepad window', () => list(ps('windows')).find((x) => x.pid === notepad.pid && x.visible && x.w > 100), 15_000).catch(() => null);
    if (!np) record('Widget layers', 'fail', 'Notepad did not open');
    else {
      const wg = widgetOf(pid);
      ps('place', { A: np.hwnd, B: `${wg.x - 60},${wg.y - 60},${wg.w + 120},${wg.h + 120}` });
      ps('front', { A: np.hwnd });
      await sleep(1200);
      const z = () => {
        const all = list(ps('windows'));
        return { widget: all.find((x) => x.hwnd === wg.hwnd), notepad: all.find((x) => x.hwnd === np.hwnd) };
      };
      let s = z();
      record('Widget floats on top (topmost, above the active window)', s.widget.exStyle & TOPMOST && s.widget.z < s.notepad.z ? 'pass' : 'fail', `topmost ${!!(s.widget.exStyle & TOPMOST)}, z widget ${s.widget.z} vs Notepad ${s.notepad.z}`);
      shot('05-layer-top.png', `${wg.x - 80},${wg.y - 80},${wg.w + 160},${wg.h + 160}`);

      if (pg) {
        await pg.widget.eval(`document.querySelector('.tools button[aria-pressed]').click()`); // pin: top → desktop
        await sleep(1200);
        ps('front', { A: np.hwnd });
        await sleep(800);
        s = z();
        const below = !(s.widget.exStyle & TOPMOST) && s.widget.z > s.notepad.z;
        ps('front', { A: wg.hwnd }); // activating it must not raise it
        await sleep(1000);
        const after = z();
        record(
          'Widget sits on the desktop (below other windows, even when activated)',
          below && after.widget.z > after.notepad.z ? 'pass' : 'fail',
          `topmost ${!!(s.widget.exStyle & TOPMOST)}, z widget ${s.widget.z} vs Notepad ${s.notepad.z}; after activating the widget ${after.widget.z} vs ${after.notepad.z}`,
        );
        shot('06-layer-desktop.png', `${wg.x - 80},${wg.y - 80},${wg.w + 160},${wg.h + 160}`);

        await pg.widget.eval(`document.querySelector('.tools button[aria-pressed]').click()`); // back to top
        await sleep(1200);
        s = z();
        record('Widget returns to floating on top', s.widget.exStyle & TOPMOST ? 'pass' : 'fail');
      }
      taskkill('/PID', String(notepad.pid));
    }

    // Widget double-click opens the planner, and clicks never leave the window stuck to the cursor.
    await hideMain(pid);
    await sleep(800);
    let wg = widgetOf(pid);
    const cx = wg.x + Math.round(wg.w / 2);
    const cy = wg.y + Math.round(wg.h / 2);
    ps('click', { A: cx, B: cy, C: 2 });
    const opened = await waitFor('planner after widget double-click', () => mainOf(pid)?.visible, 4000).catch(() => false);
    record('Widget double-click opens the planner', opened ? 'pass' : 'fail', `real double-click at ${cx},${cy}`);
    ps('move', { A: cx + 140, B: cy + 90 });
    await sleep(700);
    const w2 = widgetOf(pid);
    record('Widget stays put after clicks (no stuck drag)', w2.x === wg.x && w2.y === wg.y ? 'pass' : 'fail', `before ${wg.x},${wg.y} after ${w2.x},${w2.y}`);
    ps('click', { A: 5, B: 5, C: 1 }); // release anything still captured
    await sleep(500);

    // Dragging moves it.
    wg = widgetOf(pid);
    ps('drag', { A: wg.x + Math.round(wg.w / 2), B: wg.y + Math.round(wg.h / 2), C: -120, D: 60 });
    await sleep(800);
    const w3 = widgetOf(pid);
    const dx = w3.x - wg.x;
    const dy = w3.y - wg.y;
    record('Dragging the widget moves it', Math.abs(dx + 120) < 20 && Math.abs(dy - 60) < 20 ? 'pass' : 'fail', `moved by ${dx},${dy} (expected -120,60)`);

    if (pg) {
      await activityChecks(pid, pg);
      await exportChecks(pg);
      const errs = [...pg.main.errors.map((e) => `main ${e}`), ...pg.widget.errors.map((e) => `widget ${e}`)];
      record('No console errors or exceptions', errs.length ? 'warn' : 'pass', errs.slice(0, 8).join(' | '));
    }
    await privacyChecks(pid, pg);
  } finally {
    closeAll(pg);
    quit(run);
    await sleep(2000);
  }
}

// ---- v0.1.5 native pieces: activity sensing, export, privacy mode -----------------------

const invoke = (pg, cmd, args = {}) =>
  pg.main.eval(`__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) }))`);

async function activityChecks(pid, pg) {
  ps('nudge');
  const fresh = await invoke(pg, 'activity_idle_seconds');
  await sleep(6000);
  const later = await invoke(pg, 'activity_idle_seconds');
  record(
    'Activity: idle seconds reset on input and grow without it',
    fresh.ok && later.ok && fresh.v >= 0 && fresh.v < 4 && later.v >= fresh.v + 4 ? 'pass' : 'fail',
    `${fresh.ok ? fresh.v : fresh.e} s just after input, ${later.ok ? later.v : later.e} s six seconds later`,
  );

  const notepad = spawn('notepad.exe', [], { detached: true, stdio: 'ignore' });
  notepad.unref();
  const np = await waitFor('Notepad window', () => list(ps('windows')).find((x) => x.pid === notepad.pid && x.visible && x.w > 100), 15_000).catch(() => null);
  if (!np) return record('Activity: foreground app', 'fail', 'Notepad did not open');
  ps('front', { A: np.hwnd });
  await sleep(800);
  const fg = ps('foreground');
  const plain = await invoke(pg, 'activity_foreground', { withTitle: false });
  const titled = await invoke(pg, 'activity_foreground', { withTitle: true });
  record(
    'Activity: foreground app is Notepad when it is in front',
    fg?.hwnd === np.hwnd && plain.ok && /^notepad$/i.test(plain.v?.app ?? '') && plain.v?.title == null ? 'pass' : 'fail',
    `foreground '${fg?.title}'; withTitle false → ${JSON.stringify(plain.ok ? plain.v : plain.e)}`,
  );
  record(
    'Activity: the window title only when asked',
    titled.ok && /^notepad$/i.test(titled.v?.app ?? '') && /Notepad/.test(titled.v?.title ?? '') ? 'pass' : 'fail',
    `withTitle true → ${JSON.stringify(titled.ok ? titled.v : titled.e)}`,
  );
  taskkill('/PID', String(notepad.pid));
}

async function exportChecks(pg) {
  const dl = ps('downloads');
  const BYTES = 'a,b\r\n1,2\r\n';
  const same = (a, b) => a.toLowerCase().replace(/\\+$/, '') === b.toLowerCase().replace(/\\+$/, '');
  const isFile = (p) => {
    try {
      return fs.statSync(p).isFile(); // never read a device name (CON) as a file
    } catch {
      return false;
    }
  };
  const save = (name) => invoke(pg, 'export_save', { name, contents: BYTES, then: null });
  const made = [];
  const keep = (r) => (r.ok && made.push(r.v), r);

  const r1 = keep(await save('Daybloom test.csv'));
  const bytes = r1.ok && isFile(r1.v) ? fs.readFileSync(r1.v) : null;
  record(
    'Export: saves into Downloads with the exact bytes',
    r1.ok && same(path.dirname(r1.v), dl) && bytes?.equals(Buffer.from(BYTES)) ? 'pass' : 'fail',
    r1.ok ? `${r1.v}; ${bytes ? `${bytes.length} bytes` : 'no file'}` : r1.e,
  );

  const escaped = path.resolve(dl, '..', '..', 'evil.csv');
  const r2 = keep(await save('..\\..\\evil.csv'));
  record(
    'Export: a path in the name stays inside Downloads',
    r2.ok && same(path.dirname(r2.v), dl) && !isFile(escaped) ? 'pass' : 'fail',
    `${r2.ok ? r2.v : r2.e}; ${escaped} ${isFile(escaped) ? 'EXISTS' : 'absent'}`,
  );

  const before = fs.readdirSync(dl).length;
  const names = ['evil.exe', 'evil.csv.exe', 'evil.bat', 'evil.ps1', 'evil.html.lnk', 'evil'];
  const written = [];
  for (const n of names) if (keep(await save(n)).ok) written.push(n);
  record(
    'Export: only .html, .csv, .json and .txt are written',
    !written.length && fs.readdirSync(dl).length === before ? 'pass' : 'fail',
    written.length ? `written: ${written.join(', ')}` : `refused ${names.join(', ')}`,
  );

  const r3 = keep(await save('CON.csv'));
  const con = r3.ok && isFile(r3.v) && fs.readFileSync(r3.v).equals(Buffer.from(BYTES));
  record('Export: a reserved Windows name (CON.csv) still becomes a real file', con ? 'pass' : 'warn', r3.ok ? `${r3.v}: ${isFile(r3.v) ? 'file' : 'no file (Windows treated CON as a device)'}` : r3.e);

  for (const f of made) {
    try {
      if (isFile(f)) fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

// Privacy mode through the tray menu (both legs), then privacy_set (with DevTools).
async function privacyChecks(pid, pg) {
  await trayClick(pid);
  await sleep(1200);
  ps('front', { A: mainOf(pid).hwnd });
  await sleep(600);
  const main = mainOf(pid);
  const patch = `${main.x + Math.round(main.w / 2) - 100},${main.y + Math.round(main.h / 2) - 100},200,200`;
  const diff = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  const rgb = (c) => `rgb(${c.r},${c.g},${c.b})`;
  const affinities = () => Object.fromEntries(windowsOf(pid).filter((w) => w.visible && /^Daybloom/.test(w.title)).map((w) => [w.title, ps('affinity', { A: w.hwnd })]));
  const hidden = (a) => a === 0x11 || a === 0x1;
  const shown = ps('corners', { A: patch });

  const m1 = ps('traymenu', { A: pid, B: 'Privacy Mode' });
  const i1 = list(m1?.items).find((i) => /Privacy Mode/.test(i.text));
  if (!m1?.menu || !i1 || !m1.clicked) {
    return record('Privacy mode: tray menu item', 'fail', !m1?.menu ? 'tray menu did not open' : `items: ${list(m1.items).map((i) => i.text).join(' | ')}`);
  }
  await sleep(1200);
  const a1 = affinities();
  const off = ps('corners', { A: patch });
  shot('08-privacy-on.png');
  record('Privacy mode: the tray item turns it on for every window', !i1.isChecked && Object.keys(a1).length > 1 && Object.values(a1).every(hidden) ? 'pass' : 'fail', `item was ${i1.isChecked ? 'checked' : 'unchecked'}; display affinity ${JSON.stringify(a1)}`);
  record('Privacy mode: the planner is left out of screen captures', diff(off, shown) > 60 ? 'pass' : 'fail', `planner patch ${rgb(shown)} → ${rgb(off)} in a capture`);

  const m2 = ps('traymenu', { A: pid, B: 'Privacy Mode' });
  const i2 = list(m2?.items).find((i) => /Privacy Mode/.test(i.text));
  await sleep(1200);
  const a2 = affinities();
  const back = ps('corners', { A: patch });
  record(
    'Privacy mode: the tray item shows the check and turns it off',
    i2?.isChecked && m2.clicked && Object.values(a2).every((a) => a === 0) && diff(back, shown) < 30 ? 'pass' : 'fail',
    `item ${i2?.isChecked ? 'checked' : 'unchecked'}; affinity ${JSON.stringify(a2)}; planner patch ${rgb(back)}`,
  );

  if (!pg) return;
  // privacy_set reaches the tray check, and a widget built while privacy is on gets it too.
  await invoke(pg, 'privacy_set', { on: true });
  await invoke(pg, 'widget_show', { show: false });
  await waitFor('widget to close', () => !widgetOf(pid), 10_000).catch(() => null);
  const fgBefore = ps('foreground');
  await invoke(pg, 'widget_show', { show: true });
  const w = await waitFor('widget to reopen', () => widgetOf(pid)?.visible && widgetOf(pid), 15_000).catch(() => null);
  await sleep(800);
  const fgAfter = ps('foreground');
  record('Widget reopened by widget_show does not take the focus', w && fgAfter?.hwnd !== w.hwnd ? 'pass' : 'fail', `foreground '${fgBefore?.title}' → '${fgAfter?.title}'`);
  const m3 = ps('traymenu', { A: pid, B: '' });
  const i3 = list(m3?.items).find((i) => /Privacy Mode/.test(i.text));
  const wa = w ? ps('affinity', { A: w.hwnd }) : null;
  record('Privacy mode: privacy_set, the tray check and a newly built widget agree', i3?.isChecked && hidden(wa) ? 'pass' : 'fail', `tray item ${i3?.isChecked ? 'checked' : 'unchecked'}; new widget affinity ${wa}`);
  await invoke(pg, 'privacy_set', { on: false });
  await sleep(1000);
  const a4 = affinities();
  record('Privacy mode: privacy_set(false) clears every window', Object.values(a4).every((a) => a === 0) ? 'pass' : 'fail', JSON.stringify(a4));
}

// ---- phase B: idle CPU (nothing attached while sampling) -----------------------------

async function idle(app) {
  let run = app;
  try {
    const started = await start(app);
    run = started.run;
    const { pid } = run;
    const { main } = started;
    await sleep(30_000);
    ps('front', { A: main.hwnd });
    const sample = (scenario, seconds = CPU_SECONDS) => {
      const r = ps('cpu', { A: pid, B: seconds });
      cpu.push({ scenario, ...r });
      record(`Idle CPU: ${scenario}`, 'info', `${r.oneCore}% of one core (${r.machine}% of ${r.cores} cores), ${r.privateMB} MB private, ${r.seconds} s`);
    };
    sample('planner + widget shown');

    // Closed to the tray: record the clock's cadence from inside the page, then let it sit past
    // Chromium's 5-minute mark for intensive throttling (which would stretch the tick to 60 s).
    await hideMain(pid);
    const hiddenAt = Date.now();
    const attach = () => (SOURCE === 'release' ? null : pages());
    let pg = await attach();
    await pg?.main.eval(`(() => { const t = (window.__smokeTicks = []); (function tick() { t.push(Date.now()); setTimeout(tick, 5000); })(); })()`);
    closeAll(pg);
    await sleep(5000);
    sample('planner closed to tray + widget', HIDDEN_CPU_SECONDS);
    await sleep(Math.max(0, hiddenAt + 7 * 60_000 - Date.now()));
    pg = await attach();
    if (pg) {
      const page = await pg.main.eval(`({ ticks: window.__smokeTicks ?? null, vis: document.visibilityState, loadedAt: Math.round(performance.timeOrigin), discarded: !!document.wasDiscarded })`);
      const ticks = page.ticks ?? [];
      const late = ticks.filter((t) => t > hiddenAt + 5.5 * 60_000);
      const gaps = late.slice(1).map((t, i) => t - late[i]);
      const worst = gaps.length ? Math.max(...gaps) : Infinity;
      const min = (t) => `${((t - hiddenAt) / 60_000).toFixed(1)} min`;
      // Why a run has no late ticks: the page reloaded (recorder gone), was discarded, or froze.
      const why = page.ticks == null ? `recorder gone: page loaded ${min(page.loadedAt)} after hiding${page.discarded ? ', was discarded' : ''}` : `${ticks.length} ticks in all, the last ${ticks.length ? min(ticks.at(-1)) : '–'} after hiding`;
      record(
        'Hidden planner keeps a ~5 s timer cadence after 5+ minutes (on-time notifications)',
        worst < 12_000 ? 'pass' : 'fail',
        `visibilityState '${page.vis}'; ${late.length} ticks in minutes 5.5–7, longest gap ${(worst / 1000).toFixed(1)} s; ${why}`,
      );
      closeAll(pg);
    }

    await trayClick(pid);
    await sleep(3000);
    ps('show', { A: mainOf(pid).hwnd, B: 6 }); // SW_MINIMIZE
    await sleep(10_000);
    sample('planner minimised + widget');
  } finally {
    quit(run);
    await sleep(2000);
  }
}

// ---- phase C: screen cues overlay -------------------------------------------------------

const CUES_TITLE = 'Daybloom Screen Cues';
const EX = { TOPMOST: 0x8, TRANSPARENT: 0x20, TOOLWINDOW: 0x80, LAYERED: 0x80000, NOACTIVATE: 0x8000000 };
const cuesOf = () => list(ps('windows')).find((w) => w.title === CUES_TITLE);
const isDesktop = (w) => w && /^(Progman|WorkerW)$/.test(w.cls);
const tealAt = (x, y) => {
  const c = ps('corners', { A: `${x - 15},${y - 15},30,30` });
  return { ok: c.black < 0.01 && Math.abs(c.r - WALL[0]) + Math.abs(c.g - WALL[1]) + Math.abs(c.b - WALL[2]) < 60, c };
};

// Screen cues on, plus a running focus session, so the planner opens the overlay by itself.
function seedCues() {
  const dir = path.join(process.env.APPDATA, IDENTIFIER, 'state');
  const file = path.join(dir, 'settings.json');
  const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  settings.privacy = { ...(settings.privacy ?? {}), on: false }; // whatever phase A left
  settings.screen = { when: 'focus', glow: true, glowStrength: 'medium', bar: true, barDock: 'top', barSize: 'thin', hud: true, hudCorner: 'top-right' };
  fs.writeFileSync(file, JSON.stringify(settings));
  const label = 'Smoke focus';
  fs.writeFileSync(
    path.join(dir, 'timer.json'),
    JSON.stringify({
      active: { kind: 'countdown', label, icon: 'target', category: 'focus', startedAt: Date.now(), segments: [{ kind: 'focus', label, ms: 60 * 60_000 }], pausedAt: null, pausedMs: 0, target: null },
      doneToday: { date: '', count: 0 },
    }),
  );
}

async function screenCues(app) {
  seedCues();
  let run = app;
  let pg = null;
  try {
    const started = await start(app);
    run = started.run;
    const { pid } = run;
    const cues = await waitFor('screen cues window', () => cuesOf()?.visible && cuesOf(), 30_000).catch(() => null);
    if (!cues) throw new Error(diagnose(run, 'screen cues window never appeared'));
    await sleep(3000);
    const scr = ps('screen');
    const ex = cues.exStyle >>> 0;
    const flags = Object.entries(EX).filter(([, bit]) => ex & bit).map(([k]) => k).join(' ');
    record('Screen cues: overlay opens for a running focus session', 'pass', `${cues.w}x${cues.h} at ${cues.x},${cues.y} on a ${scr.w}x${scr.h} screen; exStyle 0x${ex.toString(16)} (${flags})`);
    record('Screen cues: covers the display', cues.x === 0 && cues.y === 0 && cues.w === scr.w && cues.h === scr.h ? 'pass' : 'fail', `${cues.w}x${cues.h} at ${cues.x},${cues.y}`);
    const fg = ps('foreground');
    record('Screen cues: never takes focus', fg?.hwnd !== cues.hwnd ? 'pass' : 'fail', `foreground '${fg?.title}' (${fg?.cls})`);
    shot('07-screen-cues.png');

    // With the planner closed, points that hit-test to the desktop must still show it.
    await hideMain(pid);
    await sleep(1500);
    const grid = [];
    for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.35, 0.55, 0.75]) grid.push([Math.round(scr.w * fx), Math.round(scr.h * fy)]);
    const through = grid.filter(([x, y]) => isDesktop(ps('point', { A: x, B: y })));
    if (!through.length) record('Screen cues: no black box over the desktop', 'fail', 'no point hit-tests through the overlay to the desktop');
    else {
      const bad = through.map(([x, y]) => ({ x, y, ...tealAt(x, y) })).filter((p) => !p.ok);
      record(
        'Screen cues: no black box over the desktop',
        bad.length ? 'fail' : 'pass',
        bad.length ? bad.map((p) => `${p.x},${p.y} rgb(${p.c.r},${p.c.g},${p.c.b})`).join('; ') : `${through.length} desktop points read rgb(${WALL})`,
      );
    }

    // A real click lands on the window under the overlay and activates it.
    const notepad = spawn('notepad.exe', [], { detached: true, stdio: 'ignore' });
    notepad.unref();
    const np = await waitFor('Notepad window', () => list(ps('windows')).find((x) => x.pid === notepad.pid && x.visible && x.w > 100), 15_000).catch(() => null);
    if (!np) record('Screen cues: clicks pass through', 'fail', 'Notepad did not open');
    else {
      ps('place', { A: np.hwnd, B: '60,700,320,240' });
      // Bring the planner forward first, so only a click that reaches Notepad can activate it.
      await trayClick(pid);
      await sleep(1500);
      ps('front', { A: mainOf(pid).hwnd });
      await sleep(500);
      const before = ps('foreground');
      const hit = ps('point', { A: 220, B: 840 });
      ps('click', { A: 220, B: 840, C: 1 });
      await sleep(1000);
      const after = ps('foreground');
      const detail = `hit-test '${hit?.title}'; foreground '${before?.title}' → '${after?.title}'`;
      if (before?.hwnd === np.hwnd) record('Screen cues: clicks pass through to the window below', hit?.hwnd === np.hwnd ? 'warn' : 'fail', `${detail} (Notepad was already active, so only the hit-test counts)`);
      else record('Screen cues: clicks pass through to the window below', after?.hwnd === np.hwnd && hit?.hwnd === np.hwnd ? 'pass' : 'fail', detail);
      taskkill('/PID', String(notepad.pid));
    }

    // CPU with the overlay up, the planner in the tray (compare with phase B's same scenario).
    await hideMain(pid);
    await sleep(10_000);
    const r = ps('cpu', { A: pid, B: CPU_SECONDS });
    cpu.push({ scenario: 'planner closed to tray + widget + screen cues', ...r });
    record('Idle CPU: planner closed to tray + widget + screen cues', 'info', `${r.oneCore}% of one core (${r.machine}% of ${r.cores} cores), ${r.privateMB} MB private, ${r.seconds} s`);

    if (SOURCE === 'release') {
      record('Screen cues: overlay_show(false) closes the window', 'warn', 'release builds have no debugging port; skipped');
      return;
    }
    pg = await pages(['main', 'overlay']);
    if (!pg) return record('Screen cues: overlay_show(false) closes the window', 'fail', 'no DevTools connection to the planner and overlay');
    const bg = await pg.overlay.eval(`[getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]`);
    record('Screen cues: overlay page background is transparent', bg.every((c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c)) ? 'pass' : 'fail', `html ${bg[0]}, body ${bg[1]}`);
    await pg.main.eval(`__TAURI_INTERNALS__.invoke('overlay_show', { show: false })`);
    const gone = await waitFor('screen cues window to close', () => !cuesOf(), 10_000).catch(() => false);
    record('Screen cues: overlay_show(false) closes the window', gone ? 'pass' : 'fail', gone ? 'HWND destroyed' : `still there: ${JSON.stringify(cuesOf())}`);
    const errs = [...pg.main.errors.map((e) => `main ${e}`), ...pg.overlay.errors.map((e) => `overlay ${e}`)];
    record('Screen cues: no console errors', errs.length ? 'warn' : 'pass', errs.slice(0, 6).join(' | '));
  } finally {
    closeAll(pg);
    quit(run);
    await sleep(2000);
  }
}

function msiInstall(msi) {
  if (!msi) return record('MSI install', 'fail', 'no .msi built');
  try {
    const logFile = path.join(OUT, 'msi-install.log');
    execFileSync('msiexec', ['/i', msi, '/qn', '/norestart', '/l*v', logFile], { stdio: 'inherit' });
    // The verbose log is UTF-16. Tauri's MSI reuses an existing install folder (here the NSIS one).
    const log = fs.readFileSync(logFile).toString('utf16le');
    const status = log.match(/Installation success or error status: (\d+)/)?.[1];
    const dir = log.match(/Property\(S\): INSTALLDIR = (.+)/)?.[1]?.trim();
    const exe = dir && findFiles(dir, (n) => /\.exe$/i.test(n) && !/uninstall/i.test(n))[0];
    record('MSI silent install', status === '0' && exe ? 'pass' : 'fail', `status ${status}; INSTALLDIR ${dir}; ${exe ?? 'no exe there'}`);
  } catch (e) {
    record('MSI silent install', 'fail', `msiexec exit ${e.status}`);
  }
}

function report() {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, cpu }, null, 2));
  const icon = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️' };
  let md = '## Daybloom Windows smoke test\n\n| | Check | Detail |\n|---|---|---|\n';
  for (const r of results) md += `| ${icon[r.status]} | ${r.check} | ${String(r.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`;
  if (cpu.length) {
    md += `\n### Idle CPU (GitHub runners have no GPU, so WebView2 renders in software and these run high)\n\n| Scenario | % of one core | % of machine | Private MB | Top processes |\n|---|---|---|---|---|\n`;
    for (const s of cpu) {
      const top = list(s.processes).sort((a, b) => b.cpu - a.cpu).slice(0, 4).map((p) => `${p.role} ${p.cpu}%`).join(', ');
      md += `| ${s.scenario} | ${s.oneCore} | ${s.machine} | ${s.privateMB} | ${top} |\n`;
    }
  }
  fs.writeFileSync(path.join(OUT, 'summary.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
}

try {
  console.log('screen', ps('resolution', { A: 1920, B: 1080 }));
  ps('wallpaper', { A: WALL.join(',') });
  const app = install();
  const lnk = findFiles(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), (n) => /^Daybloom\.lnk$/i.test(n))[0];
  const aumid = lnk ? ps('aumid', { A: lnk }) : null;
  record('Start menu shortcut carries the AppUserModelID (toasts are attributed to Daybloom)', aumid === IDENTIFIER ? 'pass' : 'fail', lnk ? `${path.basename(lnk)}: '${aumid}'` : 'no Daybloom.lnk');
  seedState();
  await behaviour(app);
  await idle(app);
  await screenCues(app);
  msiInstall(app.msi);
} catch (e) {
  record('Smoke test aborted', 'fail', String(e.stack ?? e));
  try {
    shot('99-abort.png');
  } catch {
    /* ignore */
  }
}
report();
process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
