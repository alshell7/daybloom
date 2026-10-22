// The app lock: a PIN (4–8 digits) on every platform, and on a phone the fingerprint too. It
// closes over the planner when the app starts and when you come back after the time you chose.
// It's a privacy screen, not encryption: your plans on this device stay as they are.
//
// The PIN is kept only as a salted PBKDF2 hash in this device's secure storage (the keychain,
// or Android's Keystore), never in settings and never synced. The fingerprint opens a random
// token sealed by the Keystore (BioVault), checked against its hash beside the PIN's.
// Five wrong PINs in a row ask for a short wait, longer each time.

import { bioForget, bioOpen, bioSeal, bioState } from './native/bio';
import { deviceCall } from './native/device.svelte';
import { platform } from './platform';
import { persisted } from './stores/persisted.svelte';
import { settings } from './stores/settings.svelte';

const ACCOUNT = 'app-lock';
const BIO = 'app-lock-bio';
const ROUNDS = 200_000;
export const PIN_MIN = 4;
export const PIN_MAX = 8;
/** Lock again after this many minutes away (0: as soon as Daybloom is left). */
export const LOCK_AFTER = [0, 1, 5, 15] as const;

interface Record {
  v: 1;
  salt: string;
  hash: string;
  /** The PIN's length, so the pad can check as soon as it's complete. */
  n: number;
  /** SHA-256 of the fingerprint's sealed token, when the fingerprint is on. */
  bio?: string;
}

/** This device only: never synced (it isn't one of the sync's files). */
const prefs = persisted<{ on: boolean; after: number; bio: boolean }>('app-lock', { on: false, after: 0, bio: false });

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ROUNDS }, key, 256));
}
async function sha(text: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
/** Same length, every byte looked at: no early exit to time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function readRecord(): Promise<Record | null> {
  const raw = await platform.secrets.get(ACCOUNT).catch(() => null);
  try {
    const r = raw ? (JSON.parse(raw) as Record) : null;
    return r && r.v === 1 && r.salt && r.hash ? r : null;
  } catch {
    return null;
  }
}
const writeRecord = (r: Record) => platform.secrets.set(ACCOUNT, JSON.stringify(r));

class Lock {
  /** The lock screen is up. */
  locked = $state(false);
  /** The PIN's length (for the pad's dots). */
  length = $state(0);
  /** Wrong PINs in a row, and until when the pad waits (ms). */
  misses = $state(0);
  waitUntil = $state(0);

  get on() {
    return prefs.value.on;
  }
  get after() {
    return prefs.value.after;
  }
  get bio() {
    return prefs.value.bio && platform.isMobile;
  }

  /** Before the first paint: a locked app opens on the lock screen, not on the planner. */
  async load() {
    await prefs.load();
    if (prefs.value.on) {
      const r = await readRecord();
      // The PIN is gone (a restored backup, a reset keychain): nothing to unlock with.
      if (!r) prefs.value = { ...prefs.value, on: false, bio: false };
      else {
        this.length = r.n;
        this.locked = true;
      }
    }
  }

  async setPin(pin: string): Promise<void> {
    if (!/^\d+$/.test(pin) || pin.length < PIN_MIN || pin.length > PIN_MAX) throw new Error(`A PIN is ${PIN_MIN} to ${PIN_MAX} digits.`);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const old = await readRecord();
    await writeRecord({ v: 1, salt: b64(salt), hash: await hashPin(pin, salt), n: pin.length, bio: old?.bio });
    this.length = pin.length;
    prefs.value = { ...prefs.value, on: true };
  }

  /** Right PIN: unlocks. Wrong: counts it (and asks for a wait after five). */
  async tryPin(pin: string): Promise<boolean> {
    if (Date.now() < this.waitUntil) return false;
    const r = await readRecord();
    if (!r) return this.open(), true;
    const ok = same(await hashPin(pin, unb64(r.salt)), r.hash);
    if (ok) {
      this.open();
      return true;
    }
    this.misses++;
    if (this.misses % 5 === 0) this.waitUntil = Date.now() + 30_000 * 2 ** (this.misses / 5 - 1);
    return false;
  }

  /** Whether this phone can use its fingerprint here. */
  async bioAvailable(): Promise<boolean> {
    return platform.isMobile && (await bioState(BIO)).available;
  }

  async setBio(on: boolean): Promise<void> {
    const r = await readRecord();
    if (!r) throw new Error('Set a PIN first.');
    if (on) {
      const token = b64(crypto.getRandomValues(new Uint8Array(24)));
      await bioSeal(token, BIO, 'Use your fingerprint for Daybloom', 'Use PIN');
      await writeRecord({ ...r, bio: await sha(token) });
    } else {
      await bioForget(BIO).catch(() => {});
      await writeRecord({ ...r, bio: undefined });
    }
    prefs.value = { ...prefs.value, bio: on };
  }

  /** The fingerprint prompt; throws plain words when it doesn't open. */
  async tryBio(): Promise<void> {
    const r = await readRecord();
    if (!r?.bio) throw new Error('Use your PIN.');
    const token = await bioOpen('Unlock Daybloom', BIO, { short: 'Your PIN works too.', long: 'PIN', button: 'Use PIN' });
    if (!same(await sha(token), r.bio)) throw new Error('That didn’t match. Use your PIN.');
    this.open();
  }

  setAfter(min: number) {
    if ((LOCK_AFTER as readonly number[]).includes(min)) prefs.value = { ...prefs.value, after: min };
  }

  /** Turns the lock off (the PIN, the fingerprint's token: all gone from this device). */
  async turnOff(): Promise<void> {
    await bioForget(BIO).catch(() => {});
    await platform.secrets.delete(ACCOUNT).catch(() => {});
    prefs.value = { on: false, after: prefs.value.after, bio: false };
    this.length = 0;
    this.open();
  }

  lockNow() {
    if (prefs.value.on) this.locked = true;
  }

  private open() {
    this.locked = false;
    this.misses = 0;
    this.waitUntil = 0;
  }
}

export const lock = new Lock();

/** Main window: locks when you come back after the chosen time away. Returns a stop function. */
export function startLock(): () => void {
  let leftAt = 0;
  const onVisibility = () => {
    if (!lock.on) return;
    if (document.visibilityState === 'hidden') {
      leftAt = Date.now();
      // "At once": up before Android takes its picture for the recent apps.
      if (lock.after === 0) lock.lockNow();
    } else if (leftAt && Date.now() - leftAt >= lock.after * 60_000) lock.lockNow();
  };
  document.addEventListener('visibilitychange', onVisibility);
  // A phone keeps a locked app out of the recent-apps preview (and screenshots), as privacy
  // mode does; either one being on keeps it so. Applied a moment after privacy's own change.
  const stop = $effect.root(() => {
    $effect(() => {
      if (!platform.isMobile) return;
      const on = lock.on || settings.value.privacy.on;
      const t = setTimeout(() => void deviceCall('secure', { on }).catch(() => {}), 400);
      return () => clearTimeout(t);
    });
  });
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    stop();
  };
}
