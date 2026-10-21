// The phone's fingerprint (or face) unlock for the sync vault: the unlocked vault key is
// sealed by a Keystore key that opens only after a strong biometric (BioVault in Extras.kt).
// A new fingerprint enrolled on the phone voids it, and then the password is needed once.

import { platform } from '../platform';
import { deviceCall } from './device.svelte';

export const BIO_ACCOUNT = 'sync-vault-bio';

export async function bioState(): Promise<{ available: boolean; sealed: boolean }> {
  if (!platform.isMobile) return { available: false, sealed: false };
  return (await deviceCall<{ available: boolean; sealed: boolean }>('bioStatus', { account: BIO_ACCOUNT }).catch(() => null)) ?? { available: false, sealed: false };
}

export async function bioSeal(key: string): Promise<void> {
  await deviceCall('bioSeal', { account: BIO_ACCOUNT, value: key });
}

export async function bioForget(): Promise<void> {
  await deviceCall('bioForget', { account: BIO_ACCOUNT });
}

/** The sealed vault key, after the fingerprint prompt. Plain-words errors. */
export async function bioOpen(title = 'Unlock sync'): Promise<string> {
  try {
    const r = await deviceCall<{ value: string }>('bioOpen', { account: BIO_ACCOUNT, title });
    if (!r?.value) throw new Error('No fingerprint unlock on this phone yet.');
    return r.value;
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? e);
    if (/cancelled/.test(code)) throw new Error('Cancelled. Your password works too.');
    if (/invalidated/.test(code)) throw new Error('A new fingerprint was added to this phone, so Daybloom needs your master password once.');
    throw e instanceof Error ? e : new Error('The fingerprint unlock didn’t work. Use your password.');
  }
}
