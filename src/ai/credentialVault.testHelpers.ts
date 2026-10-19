import type { CredentialKeyStore } from './credentialVault';

export function memoryKeyStore() {
  let key: CryptoKey | null = null;
  const store: CredentialKeyStore = {
    async read() { return key; },
    async getOrCreate(candidate) { key ??= structuredClone(candidate); return key; },
  };
  return { store, get key() { return key; } };
}

export function serialLocks(): Pick<LockManager, 'request'> {
  let tail = Promise.resolve();
  return {
    request: ((_name: string, _options: LockOptions, action: () => Promise<unknown>) => {
      const result = tail.then(action);
      tail = result.then(() => undefined, () => undefined);
      return result;
    }) as LockManager['request'],
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
