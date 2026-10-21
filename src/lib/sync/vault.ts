// The sync vault: end-to-end encryption for synced files, under one master password.
//
// A random 256-bit data key encrypts every synced file (AES-GCM, gzipped first). The data
// key is only ever stored wrapped: once under a key made from the master password
// (Argon2id, 64 MiB), once under the recovery key shown at setup. The wrapped copies live
// beside the data (`VaultRecord`), so the sync service — GitHub or Cloudflare — sees only
// ciphertext, a new device needs only the password, and changing the password rewraps one
// small record. Each file's name is bound into its encryption, so one file can't be passed
// off as another. Pure: WebCrypto and hash-wasm, no app imports.

import { argon2id } from 'hash-wasm';

export type VaultErrorKind = 'wrong-password' | 'wrong-recovery' | 'other-vault' | 'damaged' | 'weak-password';

export class VaultError extends Error {
  readonly kind: VaultErrorKind;
  constructor(kind: VaultErrorKind, message: string) {
    super(message);
    this.name = 'VaultError';
    this.kind = kind;
  }
}

interface Wrapped {
  iv: string;
  ct: string;
}

/** The public half of a vault: safe to store next to the data. */
export interface VaultRecord {
  app: 'daybloom';
  v: 1;
  /** Key id: which data key encrypted a file. */
  kid: string;
  kdf: { alg: 'argon2id'; m: number; t: number; p: number; salt: string };
  password: Wrapped;
  recovery: Wrapped;
  /** When the password was last set (ms). */
  at: number;
}

/** An unlocked vault: the data key in memory, and the record it came from. */
export interface Vault {
  kid: string;
  key: CryptoKey;
  raw: Uint8Array;
  record: VaultRecord;
}

/** What a sealed file looks like on the service. */
interface Envelope {
  daybloom: 'vault';
  v: 1;
  kid: string;
  /** 1 when the text was gzipped before encryption. */
  z: 0 | 1;
  iv: string;
  ct: string;
}

export const MIN_PASSWORD = 10;
/** Argon2id cost: 64 MiB, 3 passes. About 0.15 s on an M1, under a second on a phone. */
const KDF = { m: 65_536, t: 3, p: 1 };

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// -- recovery keys ----------------------------------------------------------
// 130 random bits as 26 Crockford base32 characters in groups of four or five, so it can be
// read aloud and typed back with no ambiguous letters (no I, L, O or U).

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function toBase32(bytes: Uint8Array, chars: number): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** Tidies a typed recovery key: case, spaces and dashes don't matter; O means 0, I and L mean 1. */
export function normalizeRecovery(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function formatRecovery(code: string): string {
  const c = normalizeRecovery(code);
  return [c.slice(0, 5), c.slice(5, 10), c.slice(10, 14), c.slice(14, 18), c.slice(18, 22), c.slice(22, 26)].filter(Boolean).join('-');
}

function newRecoveryCode(): string {
  return toBase32(random(17), 26);
}

// -- keys -------------------------------------------------------------------

async function aesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, usages);
}

async function passwordKey(password: string, kdf: VaultRecord['kdf']): Promise<CryptoKey> {
  const bytes = await argon2id({
    password: password.normalize('NFC'),
    salt: fromB64(kdf.salt),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  });
  return aesKey(bytes, ['encrypt', 'decrypt']);
}

async function recoveryKey(code: string, kid: string): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(normalizeRecovery(code)) as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(`daybloom-vault:${kid}`) as BufferSource, info: enc.encode('recovery') as BufferSource },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrap(kek: CryptoKey, raw: Uint8Array, aad: string): Promise<Wrapped> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) as BufferSource }, kek, raw as BufferSource));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function unwrap(kek: CryptoKey, w: Wrapped, aad: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(w.iv) as BufferSource, additionalData: enc.encode(aad) as BufferSource }, kek, fromB64(w.ct) as BufferSource));
  } catch {
    return null;
  }
}

/** A plain-words check that runs before any work: long enough is what matters most. */
export function passwordProblem(password: string): string | null {
  const p = password ?? '';
  if (p.trim().length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters. A short sentence you'll remember works well.`;
  if (/^(.)\1+$/.test(p)) return 'Mix it up a little: one repeated character is easy to guess.';
  return null;
}

async function wrapBoth(record: Omit<VaultRecord, 'password' | 'recovery'>, raw: Uint8Array, password: string, code: string): Promise<VaultRecord> {
  const [pw, rk] = await Promise.all([passwordKey(password, record.kdf), recoveryKey(code, record.kid)]);
  return {
    ...record,
    password: await wrap(pw, raw, `daybloom-vault:${record.kid}:password`),
    recovery: await wrap(rk, raw, `daybloom-vault:${record.kid}:recovery`),
  };
}

async function openVault(record: VaultRecord, raw: Uint8Array): Promise<Vault> {
  return { kid: record.kid, raw, record, key: await aesKey(raw, ['encrypt', 'decrypt']) };
}

/** A new vault, its record and the recovery key to show once. */
export async function createVault(password: string, now = Date.now()): Promise<{ vault: Vault; recovery: string }> {
  const problem = passwordProblem(password);
  if (problem) throw new VaultError('weak-password', problem);
  const raw = random(32);
  const recovery = newRecoveryCode();
  const record = await wrapBoth({ app: 'daybloom', v: 1, kid: hex(random(8)), kdf: { alg: 'argon2id', ...KDF, salt: toB64(random(16)) }, at: now }, raw, password, recovery);
  return { vault: await openVault(record, raw), recovery };
}

export function parseRecord(raw: unknown): VaultRecord | null {
  const r = raw as VaultRecord;
  const ok =
    r?.app === 'daybloom' &&
    r.v === 1 &&
    typeof r.kid === 'string' &&
    r.kdf?.alg === 'argon2id' &&
    [r.kdf.m, r.kdf.t, r.kdf.p].every((n) => Number.isInteger(n) && n > 0) &&
    r.kdf.m <= 1_048_576 &&
    r.kdf.t <= 20 &&
    typeof r.kdf.salt === 'string' &&
    typeof r.password?.iv === 'string' &&
    typeof r.password?.ct === 'string' &&
    typeof r.recovery?.iv === 'string' &&
    typeof r.recovery?.ct === 'string';
  return ok ? { app: 'daybloom', v: 1, kid: r.kid, kdf: { ...r.kdf }, password: { ...r.password }, recovery: { ...r.recovery }, at: Number(r.at) || 0 } : null;
}

export async function unlock(record: VaultRecord, password: string): Promise<Vault> {
  const raw = await unwrap(await passwordKey(password, record.kdf), record.password, `daybloom-vault:${record.kid}:password`);
  if (!raw) throw new VaultError('wrong-password', "That password doesn't open this vault. Check caps lock, or use your recovery key.");
  return openVault(record, raw);
}

export async function unlockWithRecovery(record: VaultRecord, code: string): Promise<Vault> {
  const raw = normalizeRecovery(code).length === 26 ? await unwrap(await recoveryKey(code, record.kid), record.recovery, `daybloom-vault:${record.kid}:recovery`) : null;
  if (!raw) throw new VaultError('wrong-recovery', "That recovery key doesn't match. It has 26 letters and digits, like the one you saved.");
  return openVault(record, raw);
}

/** The same data key under a new password. The recovery key keeps working. */
export async function changePassword(vault: Vault, password: string, now = Date.now()): Promise<Vault> {
  const problem = passwordProblem(password);
  if (problem) throw new VaultError('weak-password', problem);
  const kdf = { ...vault.record.kdf, ...KDF, salt: toB64(random(16)) };
  const record: VaultRecord = { ...vault.record, kdf, at: Math.max(now, vault.record.at + 1), password: await wrap(await passwordKey(password, kdf), vault.raw, `daybloom-vault:${vault.kid}:password`) };
  return { ...vault, record };
}

/** A fresh recovery key; the old one stops working. */
export async function newRecovery(vault: Vault, now = Date.now()): Promise<{ vault: Vault; recovery: string }> {
  const recovery = newRecoveryCode();
  const record: VaultRecord = { ...vault.record, at: Math.max(now, vault.record.at + 1), recovery: await wrap(await recoveryKey(recovery, vault.kid), vault.raw, `daybloom-vault:${vault.kid}:recovery`) };
  return { vault: { ...vault, record }, recovery };
}

// -- files ------------------------------------------------------------------

const canZip = () => typeof (globalThis as any).CompressionStream === 'function' && typeof (globalThis as any).DecompressionStream === 'function';

async function through(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as TransformStream));
  return new Uint8Array(await out.arrayBuffer());
}

export function isSealed(text: string): boolean {
  return /^\s*\{\s*"daybloom"\s*:\s*"vault"/.test(text);
}

/** The vault's id inside a sealed file, or null when the text isn't one. */
export function sealedKid(text: string): string | null {
  if (!isSealed(text)) return null;
  try {
    const e = JSON.parse(text) as Envelope;
    return typeof e.kid === 'string' ? e.kid : null;
  } catch {
    return null;
  }
}

/** Encrypts one file's text. `name` is bound in, so the file only opens under that name. */
export async function seal(vault: Vault, name: string, text: string): Promise<string> {
  const z = canZip() ? 1 : 0;
  const plain = z ? await through(enc.encode(text), new (globalThis as any).CompressionStream('gzip')) : enc.encode(text);
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(`daybloom-vault:${vault.kid}:file:${name}`) as BufferSource }, vault.key, plain as BufferSource));
  const e: Envelope = { daybloom: 'vault', v: 1, kid: vault.kid, z, iv: toB64(iv), ct: toB64(ct) };
  return `${JSON.stringify(e)}\n`;
}

/** Decrypts a sealed file. Throws `other-vault` for another vault's file, `damaged` if it was changed. */
export async function open(vault: Vault, name: string, text: string): Promise<string> {
  let e: Envelope;
  try {
    e = JSON.parse(text);
  } catch {
    throw new VaultError('damaged', `${name} can't be read: it isn't a sealed Daybloom file.`);
  }
  if (e?.daybloom !== 'vault' || e.v !== 1) throw new VaultError('damaged', `${name} can't be read: it isn't a sealed Daybloom file.`);
  if (e.kid !== vault.kid) throw new VaultError('other-vault', `${name} was locked with a different master password.`);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(e.iv) as BufferSource, additionalData: enc.encode(`daybloom-vault:${vault.kid}:file:${name}`) as BufferSource }, vault.key, fromB64(e.ct) as BufferSource));
  } catch {
    throw new VaultError('damaged', `${name} was changed outside Daybloom, so it can't be opened.`);
  }
  if (e.z) plain = await through(plain, new (globalThis as any).DecompressionStream('gzip'));
  return dec.decode(plain);
}

// -- keeping an unlocked vault on this device ---------------------------------
// The data key goes into the OS secure store (Keychain, Credential Manager, Android Keystore),
// so background syncs never ask for the password again.

export function exportVault(vault: Vault): string {
  return JSON.stringify({ v: 1, key: toB64(vault.raw), record: vault.record });
}

export async function importVault(text: string | null): Promise<Vault | null> {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    const record = parseRecord(j?.record);
    const raw = typeof j?.key === 'string' ? fromB64(j.key) : null;
    if (!record || !raw || raw.length !== 32) return null;
    return openVault(record, raw);
  } catch {
    return null;
  }
}
