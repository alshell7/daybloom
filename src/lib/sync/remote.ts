// What sync needs from a service, whichever one holds the data (a GitHub repo, a Cloudflare D1
// database): a flat space of named text files, each with a version, written with optimistic
// concurrency. `sealedRemote` puts the vault in front of one, so every file is encrypted on
// the way out and decrypted on the way in, and the service only ever stores ciphertext.

import { open, seal, VaultError, type Vault } from './vault';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SyncErrorKind =
  | 'auth' // the token was refused
  | 'forbidden' // the token lacks a permission
  | 'not-found' // no such repo or database, or the token can't see it
  | 'branch' // GitHub: the branch doesn't exist
  | 'conflict' // the file changed since we read it
  | 'rate-limit' // the service asked us to slow down
  | 'network' // fetch itself failed (offline, DNS, TLS)
  | 'server' // 5xx
  | 'invalid' // anything else the service refused, or a file we can't read
  | 'locked' // the data is encrypted and this device needs the master password
  | 'vault'; // the data is locked with another password, or a sealed file was changed

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  readonly status: number;
  /** For `rate-limit`: when the service says we may try again (epoch ms). */
  readonly retryAt: number | null;
  constructor(kind: SyncErrorKind, message: string, status = 0, retryAt: number | null = null) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
    this.status = status;
    this.retryAt = retryAt;
  }
}

export interface RemoteEntry {
  name: string;
  version: string;
}

export interface SyncRemote {
  /** Everything in the sync space, as names and versions (no folders). */
  list(): Promise<RemoteEntry[]>;
  /** A file's text and version, or null when it doesn't exist. */
  get(name: string): Promise<{ text: string; version: string } | null>;
  /** Create (`version` null) or replace a file. Throws `conflict` when `version` is stale. */
  put(name: string, text: string, version: string | null): Promise<{ version: string }>;
  /** Delete a file at that version. Missing is fine; a newer version throws `conflict`. */
  remove(name: string, version: string): Promise<void>;
}

/** Name of the vault's public record in a sealed space. It is the one file stored in the clear. */
export const VAULT_FILE = 'vault.json';

/** The same space with every file sealed by `vault` (except the vault's own record). */
export function sealedRemote(remote: SyncRemote, vault: Vault): SyncRemote {
  return {
    list: () => remote.list(),
    async get(name) {
      const f = await remote.get(name);
      if (!f || name === VAULT_FILE) return f;
      try {
        return { text: await open(vault, name, f.text), version: f.version };
      } catch (e) {
        if (e instanceof VaultError) throw new SyncError('vault', e.message);
        throw e;
      }
    },
    async put(name, text, version) {
      return remote.put(name, name === VAULT_FILE ? text : await seal(vault, name, text), version);
    },
    remove: (name, version) => remote.remove(name, version),
  };
}
