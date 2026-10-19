// The one seam between the UI and the host. In the Tauri shell it calls native
// commands (see src-tauri/src/commands.rs); in a plain browser (vite dev, tests)
// it falls back to web APIs so the whole UI can be developed without Rust.
//
// Native command contract (Rust side must match):
//   state_load(key)                  -> string | null      app-data JSON blob
//   state_save(key, value)           -> void               atomic write
//   secret_get(account)              -> string | null      OS keychain
//   secret_set(account, value)       -> void
//   secret_delete(account)           -> void
//   oauth_listen()                   -> number             loopback port on 127.0.0.1
//   oauth_wait(port, timeoutSecs)    -> OAuthRedirect      blocks until redirect hits
//   widget_show(show?)               -> boolean            new visibility
//   widget_set_layer(layer)          -> void               'top' | 'desktop' | 'normal'
//   main_show()                      -> void
//   set_tray_status(title, tooltip)  -> void               macOS menu-bar text + tooltip
//   set_dock_visible(visible)        -> void               macOS only; no-op elsewhere
//
// Events: `daybloom://state` {key, origin} is broadcast whenever a window saves,
// `daybloom://tray` {action} is emitted by the native tray menu,
// `daybloom://widget` {visible, layer} whenever the widget changes natively (tray, Alt+F4).

export type WidgetLayer = 'top' | 'desktop' | 'normal';

export interface OAuthRedirect {
  code: string | null;
  state: string | null;
  error: string | null;
}

export type TrayAction = 'new-block' | 'focus-now' | 'open-settings';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type WindowLabel = 'main' | 'widget' | 'overlay';

/** Label of the current window. Browser dev uses `?view=widget` / `?view=overlay`. */
export function windowLabel(): WindowLabel {
  if (isTauri) {
    const label = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
    if (label === 'widget' || label === 'overlay') return label;
    return 'main';
  }
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('view') : null;
  return v === 'widget' || v === 'overlay' ? v : 'main';
}

export interface ScreenMetrics {
  screen: { x: number; y: number; width: number; height: number };
  /** Relative to the display: what the menu bar, Dock or taskbar leave free. */
  work: { x: number; y: number; width: number; height: number };
  scale: number;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const channel: BroadcastChannel | null =
  !isTauri && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daybloom') : null;

export const platform = {
  isNative: isTauri,
  os: detectOS(),

  async load(key: string): Promise<string | null> {
    if (isTauri) return invoke<string | null>('state_load', { key });
    try {
      return localStorage.getItem(`daybloom:${key}`);
    } catch {
      return null;
    }
  },

  async save(key: string, value: string): Promise<void> {
    if (isTauri) {
      await invoke('state_save', { key, value });
      const { emit } = await import('@tauri-apps/api/event');
      await emit('daybloom://state', { key, origin: windowLabel() });
      return;
    }
    try {
      localStorage.setItem(`daybloom:${key}`, value);
    } catch {
      /* private mode: keep running in memory */
    }
    channel?.postMessage({ key, origin: windowLabel() });
  },

  /** Fires when another window saved `key`. Returns an unsubscribe function. */
  onExternalChange(cb: (key: string) => void): () => void {
    const me = windowLabel();
    if (isTauri) {
      let off: (() => void) | null = null;
      let dead = false;
      import('@tauri-apps/api/event').then(({ listen }) =>
        listen<{ key: string; origin: string }>('daybloom://state', (e) => {
          if (e.payload.origin !== me) cb(e.payload.key);
        }).then((u) => (dead ? u() : (off = u))),
      );
      return () => {
        dead = true;
        off?.();
      };
    }
    const handler = (e: MessageEvent) => {
      if (e.data?.origin !== me) cb(e.data.key);
    };
    channel?.addEventListener('message', handler);
    return () => channel?.removeEventListener('message', handler);
  },

  onTray(cb: (action: TrayAction) => void): () => void {
    if (!isTauri) return () => {};
    let off: (() => void) | null = null;
    let dead = false;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<{ action: TrayAction }>('daybloom://tray', (e) => cb(e.payload.action)).then((u) =>
        dead ? u() : (off = u),
      ),
    );
    return () => {
      dead = true;
      off?.();
    };
  },

  async notify(title: string, body: string): Promise<void> {
    if (isTauri) {
      const n = await import('@tauri-apps/plugin-notification');
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === 'granted';
      if (granted) n.sendNotification({ title, body });
      return;
    }
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') new Notification(title, { body });
  },

  async showWidget(show?: boolean): Promise<boolean> {
    if (isTauri) return invoke<boolean>('widget_show', { show: show ?? null });
    if (show !== false) window.open(`${location.pathname}?view=widget`, 'daybloom-widget', 'width=300,height=300');
    return show !== false;
  },

  /**
   * Save an export (a bill, a timesheet) to Downloads; `then` opens it or shows it in its
   * folder. In a browser the file downloads instead. Returns where it went.
   */
  async exportFile(name: string, contents: string, then?: 'open' | 'reveal'): Promise<string> {
    if (isTauri) return invoke<string>('export_save', { name, contents, then: then ?? null });
    const type = name.endsWith('.csv') ? 'text/csv' : name.endsWith('.json') ? 'application/json' : 'text/html';
    const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  },

  /** Privacy mode: keep every Daybloom window out of screenshots and recordings. */
  async setPrivacy(on: boolean): Promise<void> {
    if (isTauri) await invoke('privacy_set', { on });
  },

  /** Privacy mode changed natively (the tray menu). */
  onPrivacyChange(cb: (on: boolean) => void): () => void {
    if (!isTauri) return () => {};
    let off: (() => void) | null = null;
    let dead = false;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<{ on: boolean }>('daybloom://privacy', (e) => cb(!!e.payload?.on)).then((u) => (dead ? u() : (off = u))),
    );
    return () => {
      dead = true;
      off?.();
    };
  },

  /** Screen cues window (edge glow, time bar, HUD). Desktop only. */
  async showOverlay(show: boolean): Promise<boolean> {
    if (isTauri) return invoke<boolean>('overlay_show', { show });
    return false;
  },

  /** The display the cues cover, and its work area. Null in a browser. */
  async screenMetrics(): Promise<ScreenMetrics | null> {
    if (isTauri) return invoke<ScreenMetrics | null>('overlay_metrics');
    return null;
  },

  async setWidgetLayer(layer: WidgetLayer): Promise<void> {
    if (isTauri) await invoke('widget_set_layer', { layer });
  },

  async showMain(): Promise<void> {
    if (isTauri) await invoke('main_show');
    else window.open(location.pathname, 'daybloom-main');
  },

  /** Begin dragging the current (frameless) window. */
  async startDrag(): Promise<void> {
    if (!isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  },

  async hideSelf(): Promise<void> {
    if (!isTauri) return;
    // The widget goes through the native command so the tray checkmark stays in sync.
    if (windowLabel() === 'widget') {
      await invoke('widget_show', { show: false });
      return;
    }
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  },

  onWidgetChange(cb: (s: { visible: boolean; layer: WidgetLayer }) => void): () => void {
    if (!isTauri) return () => {};
    let off: (() => void) | null = null;
    let dead = false;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<{ visible: boolean; layer: WidgetLayer }>('daybloom://widget', (e) => cb(e.payload)).then((u) =>
        dead ? u() : (off = u),
      ),
    );
    return () => {
      dead = true;
      off?.();
    };
  },

  async setTrayStatus(title: string | null, tooltip: string): Promise<void> {
    if (isTauri) await invoke('set_tray_status', { title, tooltip });
  },

  async setDockVisible(visible: boolean): Promise<void> {
    if (isTauri) await invoke('set_dock_visible', { visible });
  },

  async setLaunchAtLogin(on: boolean): Promise<void> {
    if (!isTauri) return;
    const a = await import('@tauri-apps/plugin-autostart');
    if (on) await a.enable();
    else await a.disable();
  },

  async openExternal(url: string): Promise<void> {
    if (isTauri) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  },

  /** fetch() that is not subject to webview CORS in the native shell. */
  async fetch(input: string, init?: RequestInit): Promise<Response> {
    if (isTauri) {
      const http = await import('@tauri-apps/plugin-http');
      return http.fetch(input, init);
    }
    return fetch(input, init);
  },

  secrets: {
    async get(account: string): Promise<string | null> {
      if (isTauri) return invoke<string | null>('secret_get', { account });
      try {
        return sessionStorage.getItem(`daybloom-secret:${account}`);
      } catch {
        return null;
      }
    },
    async set(account: string, value: string): Promise<void> {
      if (isTauri) return invoke('secret_set', { account, value });
      try {
        sessionStorage.setItem(`daybloom-secret:${account}`, value);
      } catch {
        /* ignore */
      }
    },
    async delete(account: string): Promise<void> {
      if (isTauri) return invoke('secret_delete', { account });
      try {
        sessionStorage.removeItem(`daybloom-secret:${account}`);
      } catch {
        /* ignore */
      }
    },
  },

  oauth: {
    /** Start a one-shot loopback listener; returns the port for the redirect URI. */
    async listen(): Promise<number> {
      if (!isTauri) throw new Error('Calendar sign-in needs the desktop app.');
      return invoke<number>('oauth_listen');
    },
    async wait(port: number, timeoutSecs = 300): Promise<OAuthRedirect> {
      return invoke<OAuthRedirect>('oauth_wait', { port, timeoutSecs });
    },
  },
};

function detectOS(): 'mac' | 'windows' | 'linux' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'windows';
  if (p.includes('linux')) return 'linux';
  return 'other';
}
