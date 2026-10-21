import { describe, expect, it } from 'vitest';
import {
  changePassword,
  createVault,
  exportVault,
  formatRecovery,
  importVault,
  isSealed,
  newRecovery,
  normalizeRecovery,
  open,
  parseRecord,
  passwordProblem,
  seal,
  sealedKid,
  unlock,
  unlockWithRecovery,
  VaultError,
} from './vault';

const PW = 'a quiet morning walk';

async function kind(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VaultError);
    return (e as VaultError).kind;
  }
  throw new Error('expected a VaultError');
}

describe('vault', () => {
  it('seals and opens a file, and the service only sees ciphertext', async () => {
    const { vault } = await createVault(PW);
    const text = JSON.stringify({ tasks: [{ id: 't1', title: 'Call mum ☎️ — café' }] });
    const sealed = await seal(vault, 'tasks.json', text);
    expect(isSealed(sealed)).toBe(true);
    expect(sealedKid(sealed)).toBe(vault.kid);
    expect(sealed).not.toContain('Call mum');
    expect(await open(vault, 'tasks.json', sealed)).toBe(text);
  });

  it('opens on another device with the password, from the record alone', async () => {
    const { vault } = await createVault(PW);
    const sealed = await seal(vault, 'settings.json', '{"a":1}');
    const record = parseRecord(JSON.parse(JSON.stringify(vault.record)))!;
    const other = await unlock(record, PW);
    expect(other.kid).toBe(vault.kid);
    expect(await open(other, 'settings.json', sealed)).toBe('{"a":1}');
  });

  it('refuses a wrong password and a wrong recovery key', async () => {
    const { vault } = await createVault(PW);
    expect(await kind(unlock(vault.record, 'a quiet morning walk!'))).toBe('wrong-password');
    expect(await kind(unlockWithRecovery(vault.record, 'ABCDE-FGHJK-MNPQ-RSTV-WXYZ-01'))).toBe('wrong-recovery');
    expect(await kind(unlockWithRecovery(vault.record, 'too short'))).toBe('wrong-recovery');
  });

  it('opens with the recovery key, however it is typed', async () => {
    const { vault, recovery } = await createVault(PW);
    expect(normalizeRecovery(recovery)).toHaveLength(26);
    expect(normalizeRecovery(recovery)).not.toMatch(/[ILOU]/);
    const typed = formatRecovery(recovery).toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    const again = await unlockWithRecovery(vault.record, typed);
    expect(again.kid).toBe(vault.kid);
  });

  it('a file only opens under its own name, and changes are caught', async () => {
    const { vault } = await createVault(PW);
    const sealed = await seal(vault, 'tasks.json', '{"x":1}');
    expect(await kind(open(vault, 'settings.json', sealed))).toBe('damaged');
    const e = JSON.parse(sealed);
    const ct = e.ct.split('');
    ct[5] = ct[5] === 'A' ? 'B' : 'A';
    expect(await kind(open(vault, 'tasks.json', JSON.stringify({ ...e, ct: ct.join('') })))).toBe('damaged');
    expect(await kind(open(vault, 'tasks.json', '{"tasks":[]}'))).toBe('damaged');
  });

  it("another vault's file is told apart from a damaged one", async () => {
    const a = await createVault(PW);
    const b = await createVault(PW);
    const sealed = await seal(a.vault, 'tasks.json', '{}');
    expect(await kind(open(b.vault, 'tasks.json', sealed))).toBe('other-vault');
  });

  it('changing the password keeps the data key and the recovery key', async () => {
    const { vault, recovery } = await createVault(PW);
    const sealed = await seal(vault, 'tasks.json', 'hello');
    const changed = await changePassword(vault, 'a different long phrase');
    expect(changed.kid).toBe(vault.kid);
    expect(await kind(unlock(changed.record, PW))).toBe('wrong-password');
    const v2 = await unlock(changed.record, 'a different long phrase');
    expect(await open(v2, 'tasks.json', sealed)).toBe('hello');
    expect((await unlockWithRecovery(changed.record, recovery)).kid).toBe(vault.kid);
  });

  it('a new recovery key replaces the old one', async () => {
    const { vault, recovery } = await createVault(PW);
    const next = await newRecovery(vault);
    expect(await kind(unlockWithRecovery(next.vault.record, recovery))).toBe('wrong-recovery');
    expect((await unlockWithRecovery(next.vault.record, next.recovery)).kid).toBe(vault.kid);
    expect((await unlock(next.vault.record, PW)).kid).toBe(vault.kid);
  });

  it('asks for a longer password, in kind words', async () => {
    expect(passwordProblem('short')).toMatch(/at least 10/);
    expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/repeated/);
    expect(passwordProblem(PW)).toBeNull();
    expect(await kind(createVault('short'))).toBe('weak-password');
  });

  it('round-trips the unlocked vault for the secure store', async () => {
    const { vault } = await createVault(PW);
    const back = await importVault(exportVault(vault));
    expect(back?.kid).toBe(vault.kid);
    expect(await open(back!, 'a.json', await seal(vault, 'a.json', 'x'))).toBe('x');
    expect(await importVault('not json')).toBeNull();
    expect(await importVault(null)).toBeNull();
  });

  it('rejects records that are malformed or ask for silly costs', async () => {
    const { vault } = await createVault(PW);
    expect(parseRecord({ ...vault.record, kdf: { ...vault.record.kdf, m: 10_000_000 } })).toBeNull();
    expect(parseRecord({ ...vault.record, app: 'other' })).toBeNull();
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord(vault.record)?.kid).toBe(vault.kid);
  });

  it('seals large files compactly', async () => {
    const { vault } = await createVault(PW);
    const big = JSON.stringify({ tasks: Array.from({ length: 4000 }, (_, i) => ({ id: `t${i}`, title: `Task number ${i}`, minutes: 30 })) });
    const sealed = await seal(vault, 'tasks.json', big);
    expect(sealed.length).toBeLessThan(big.length / 3);
    expect(await open(vault, 'tasks.json', sealed)).toBe(big);
  });
});
