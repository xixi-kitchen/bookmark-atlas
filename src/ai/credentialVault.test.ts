import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCredentialVault, createIndexedDBCredentialKeyStore } from './credentialVault';
import { deferred, memoryKeyStore, serialLocks } from './credentialVault.testHelpers';

const crypto = webcrypto as unknown as Crypto;
const baseUrl = 'https://provider.example/v1';
const apiKey = 'test-only-private-api-key';
const createVault = () => {
  const keys = memoryKeyStore();
  return { vault: createCredentialVault({ crypto, keyStore: keys.store, locks: serialLocks() }), keys };
};

afterEach(() => vi.unstubAllGlobals());

describe('local encrypted credential vault', () => {
  it('round-trips real AES-GCM using a structured-cloned, nonextractable 256-bit local key', async () => {
    const { vault, keys } = createVault();
    const record = await vault.encrypt(baseUrl, apiKey);
    expect(record).toEqual({ version: 2, algorithm: 'AES-GCM', baseUrl, iv: expect.any(String), ciphertext: expect.any(String) });
    expect(JSON.stringify(record)).not.toContain(apiKey);
    expect(atob(record.ciphertext)).not.toContain(apiKey);
    expect(atob(record.iv)).toHaveLength(12);
    expect(await vault.decrypt(baseUrl, record)).toBe(apiKey);
    expect(keys.key).toMatchObject({ type: 'secret', extractable: false, algorithm: { name: 'AES-GCM', length: 256 } });
    await expect(crypto.subtle.exportKey('raw', keys.key!)).rejects.toThrow();
    // A fresh panel/vault instance can use the persisted CryptoKey without exporting it.
    const reopened = createCredentialVault({ crypto, keyStore: keys.store });
    expect(await reopened.decrypt(baseUrl, structuredClone(record))).toBe(apiKey);
  });

  it('uses a new random 96-bit nonce on each save', async () => {
    const { vault } = createVault();
    const one = await vault.encrypt(baseUrl, apiKey);
    const two = await vault.encrypt(baseUrl, apiKey);
    expect(two.iv).not.toBe(one.iv);
    expect(two.ciphertext).not.toBe(one.ciphertext);
    expect(await vault.decrypt(baseUrl, two)).toBe(apiKey);
  });

  it('authenticates the entire endpoint path and rejects copied or tampered envelopes without plaintext errors', async () => {
    const { vault } = createVault();
    const record = await vault.encrypt(baseUrl, apiKey);
    const bytes = Uint8Array.from(atob(record.ciphertext), (char) => char.charCodeAt(0));
    bytes[0] = bytes[0]! ^ 1;
    const corrupt = btoa(String.fromCharCode(...bytes));
    for (const [endpoint, envelope] of [
      ['https://provider.example/other', record],
      ['https://provider.example/other', { ...record, baseUrl: 'https://provider.example/other' }],
      [baseUrl, { ...record, ciphertext: corrupt }],
      [baseUrl, { ...record, iv: btoa('wrong-length') }],
      [baseUrl, { ...record, iv: btoa('12-bytes-iv!!') }],
      [baseUrl, { ...record, version: 3 }],
      [baseUrl, { ...record, apiKey }],
      [baseUrl, { ...record, ciphertext: '!badbase64!' }],
      [baseUrl, { ...record, ciphertext: 'a'.repeat(23_000) }],
    ] as const) {
      await expect(vault.decrypt(endpoint, envelope)).rejects.toMatchObject({ code: 'storage_unavailable', message: 'storage_unavailable' });
    }
  });

  it('does not generate a replacement key when decryption key is missing', async () => {
    const { vault } = createVault();
    const record = await vault.encrypt(baseUrl, apiKey);
    const keys = memoryKeyStore();
    const lost = createCredentialVault({ crypto, keyStore: keys.store });
    await expect(lost.decrypt(baseUrl, record)).rejects.toThrow('storage_unavailable');
    expect(keys.key).toBeNull();
  });

  it('fails closed if WebCrypto, IndexedDB, a key transaction or Web Locks is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    await expect(createCredentialVault().encrypt(baseUrl, apiKey)).rejects.toThrow('storage_unavailable');
    vi.stubGlobal('crypto', crypto);
    vi.stubGlobal('indexedDB', undefined);
    await expect(createCredentialVault().encrypt(baseUrl, apiKey)).rejects.toThrow('storage_unavailable');
    const failing = createCredentialVault({ crypto, keyStore: { read: async () => null, getOrCreate: async () => { throw new Error(apiKey); } } });
    await expect(failing.encrypt(baseUrl, apiKey)).rejects.toMatchObject({ code: 'storage_unavailable', message: 'storage_unavailable' });
    vi.stubGlobal('navigator', {});
    const action = vi.fn();
    await expect(createCredentialVault().withLock(action)).rejects.toThrow('storage_unavailable');
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps concurrent first-use clients on the same atomically chosen key', async () => {
    const keys = memoryKeyStore();
    const one = createCredentialVault({ crypto, keyStore: keys.store });
    const two = createCredentialVault({ crypto, keyStore: keys.store });
    const [first, second] = await Promise.all([one.encrypt(baseUrl, 'first'), two.encrypt(baseUrl, 'second')]);
    expect(await two.decrypt(baseUrl, first)).toBe('first');
    expect(await one.decrypt(baseUrl, second)).toBe('second');
  });

  it('serializes complete actions across vault instances and releases a failed action', async () => {
    const locks = serialLocks();
    const one = createCredentialVault({ locks });
    const two = createCredentialVault({ locks });
    const gate = deferred<void>();
    const order: string[] = [];
    const first = one.withLock(async () => { order.push('first'); await gate.promise; throw new Error(apiKey); });
    const rejected = expect(first).rejects.toThrow('storage_unavailable');
    const second = two.withLock(async () => { order.push('second'); return 'cleared'; });
    await Promise.resolve();
    expect(order).toEqual(['first']);
    gate.resolve();
    await rejected;
    expect(await second).toBe('cleared');
    expect(order).toEqual(['first', 'second']);
  });
});

describe('IndexedDB installation key store', () => {
  // This tiny event fake exercises the actual IDB adapter's transaction/commit
  // contract; cryptographic tests above use Node's real WebCrypto, never a cipher mock.
  function fakeDatabase(options: { existing?: CryptoKey; abort?: boolean; blocked?: boolean } = {}) {
    let stored = options.existing;
    const modes: string[] = [];
    const put = vi.fn((key: CryptoKey) => { stored = structuredClone(key); });
    const close = vi.fn();
    const database = {
      objectStoreNames: { contains: () => false }, createObjectStore: vi.fn(), close,
      transaction: vi.fn((_name, mode) => {
        modes.push(mode);
        const request = { result: undefined as CryptoKey | undefined, onsuccess: undefined as (() => void) | undefined };
        const transaction = {
          objectStore: () => ({ get: () => request, put }),
          oncomplete: undefined as (() => void) | undefined,
          onabort: undefined as (() => void) | undefined,
          onerror: undefined as (() => void) | undefined,
        };
        queueMicrotask(() => {
          request.result = stored;
          request.onsuccess?.();
          queueMicrotask(() => options.abort ? transaction.onabort?.() : transaction.oncomplete?.());
        });
        return transaction;
      }),
    };
    const factory = { open: vi.fn(() => {
      const request = { result: database, onupgradeneeded: undefined as (() => void) | undefined,
        onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined,
        onblocked: undefined as (() => void) | undefined };
      queueMicrotask(() => {
        if (options.blocked) { request.onblocked?.(); request.onsuccess?.(); }
        else { request.onupgradeneeded?.(); request.onsuccess?.(); }
      });
      return request;
    }) } as unknown as IDBFactory;
    return { factory, modes, put, close, database };
  }

  it('commits the nonextractable candidate via a strict readwrite transaction and reads it on reopen', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const fake = fakeDatabase();
    const store = createIndexedDBCredentialKeyStore(fake.factory);
    expect(await store.read()).toBeNull();
    expect(await store.getOrCreate(key)).toBe(key);
    expect((await store.read())?.extractable).toBe(false);
    expect(fake.database.transaction).toHaveBeenCalledWith('keys', 'readwrite', { durability: 'strict' });
    expect(fake.modes).toEqual(['readonly', 'readwrite', 'readonly']);
    expect(fake.put).toHaveBeenCalledTimes(1);
    expect(fake.close).toHaveBeenCalledTimes(3);
  });

  it('never overwrites a first-use winner that another client already stored', async () => {
    const [winner, candidate] = await Promise.all([0, 1].map(() => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])));
    const fake = fakeDatabase({ existing: winner });
    expect(await createIndexedDBCredentialKeyStore(fake.factory).getOrCreate(candidate!)).toBe(winner);
    expect(fake.put).not.toHaveBeenCalled();
  });

  it('does not acknowledge aborted or blocked key storage and closes the connection', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    for (const option of [{ abort: true }, { blocked: true }]) {
      const fake = fakeDatabase(option);
      await expect(createIndexedDBCredentialKeyStore(fake.factory).getOrCreate(key)).rejects.toThrow('storage_unavailable');
      expect(fake.close).toHaveBeenCalledTimes(1);
    }
  });
});
