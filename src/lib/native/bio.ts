// The phone's fingerprint (or face) unlock for the sync vault: the unlocked vault key is
// sealed by a Keystore key that opens only after a strong biometric (BioVault in Extras.kt).
// A new fingerprint enrolled on the phone voids it, and then the password is needed once.

import { platform } from '../platform';
import { deviceCall } from './device.svelte';

export const BIO_ACCOUNT = 'sync-vault-bio';

// The app lock (lib/lock.svelte.ts) keeps its own sealed value under another account.

export async function bioState(account = BIO_ACCOUNT): Promise<{ available: boolean; sealed: boolean }> {
  if (!platform.isMobile) return { available: false, sealed: false };
  return (await deviceCall<{ available: boolean; sealed: boolean }>('bioStatus', { account }).catch(() => null)) ?? { available: false, sealed: false };
}

export async function bioSeal(key: string, account = BIO_ACCOUNT, title = 'Unlock sync with your fingerprint', other = 'Use password'): Promise<void> {
  await deviceCall('bioSeal', { account, value: key, title, other });
}

export async function bioForget(account = BIO_ACCOUNT): Promise<void> {
  await deviceCall('bioForget', { account });
}

/** The sealed value, after the fingerprint prompt. Plain-words errors (`other`: what else works). */
export async function bioOpen(title = 'Unlock sync', account = BIO_ACCOUNT, other = { short: 'Your password works too.', long: 'master password', button: 'Use password' }): Promise<string> {
  try {
    const r = await deviceCall<{ value: string }>('bioOpen', { account, title, other: other.button });
    if (!r?.value) throw new Error('No fingerprint unlock on this phone yet.');
    return r.value;
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? e);
    if (/cancelled/.test(code)) throw new Error(`Cancelled. ${other.short}`);
    if (/invalidated/.test(code)) throw new Error(`A new fingerprint was added to this phone, so Daybloom needs your ${other.long} once.`);
    throw e instanceof Error ? e : new Error(`The fingerprint unlock didn’t work. ${other.short}`);
  }
}
