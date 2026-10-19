import { AIError } from './plan';

export interface EncryptedAICredential {
  version: 2;
  algorithm: 'AES-GCM';
  baseUrl: string;
  iv: string;
  ciphertext: string;
}

export interface CredentialKeyStore {
  read(): Promise<CryptoKey | null>;
  /** Must choose an existing winner atomically instead of replacing it. */
  getOrCreate(candidate: CryptoKey): Promise<CryptoKey>;
}

interface VaultDependencies {
  crypto?: Crypto;
  keyStore?: CredentialKeyStore;
  locks?: Pick<LockManager, 'request'>;
}

const DATABASE_NAME = 'bookmark-atlas-ai-credential-vault';
const STORE_NAME = 'keys';
const KEY_ID = 'local-aes-gcm-v1';
const LOCK_NAME = 'bookmark-atlas-ai-local-credentials-v2';
const MAX_CIPHERTEXT_BYTES = 16_400;

function unavailable(): AIError { return new AIError('storage_unavailable'); }

function validateKey(value: unknown): CryptoKey {
  const key = value as CryptoKey | null;
  if (!key || key.type !== 'secret' || key.extractable !== false
    || key.algorithm?.name !== 'AES-GCM' || (key.algorithm as AesKeyAlgorithm).length !== 256
    || !key.usages.includes('encrypt') || !key.usages.includes('decrypt')) throw unavailable();
  return key;
}

function openKeyDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1);
    let failed = false;
    const fail = () => { failed = true; reject(unavailable()); };
    request.onerror = fail;
    request.onblocked = fail;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (failed) request.result.close();
      else resolve(request.result);
    };
  });
}

/** CryptoKey is structured-cloned directly; key bytes are never exported. */
export function createIndexedDBCredentialKeyStore(factory: IDBFactory): CredentialKeyStore {
  async function transact(candidate?: CryptoKey): Promise<CryptoKey | null> {
    const database = await openKeyDatabase(factory);
    try {
      return await new Promise<CryptoKey | null>((resolve, reject) => {
        // Strict durability matters: only encrypt once the key transaction committed.
        const transaction = candidate
          ? database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' })
          : database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        let winner: unknown;
        const request = store.get(KEY_ID);
        request.onsuccess = () => {
          winner = request.result;
          if (winner === undefined && candidate) {
            winner = candidate;
            store.put(candidate, KEY_ID);
          }
        };
        transaction.oncomplete = () => {
          try { resolve(winner === undefined ? null : validateKey(winner)); }
          catch { reject(unavailable()); }
        };
        transaction.onerror = () => reject(unavailable());
        transaction.onabort = () => reject(unavailable());
      });
    } finally { database.close(); }
  }
  return {
    read: () => transact(),
    getOrCreate: async (candidate) => {
      const key = await transact(validateKey(candidate));
      if (!key) throw unavailable();
      return key;
    },
  };
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value: string, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (!value || value.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw unavailable();
  const raw = atob(value);
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (bytes.length > maxBytes || encode(bytes) !== value) throw unavailable();
  return bytes;
}

function readEnvelope(value: unknown): EncryptedAICredential {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  const record = value as Partial<EncryptedAICredential> & { apiKey?: unknown };
  if (record.version !== 2 || record.algorithm !== 'AES-GCM' || typeof record.baseUrl !== 'string'
    || typeof record.iv !== 'string' || typeof record.ciphertext !== 'string' || 'apiKey' in record) throw unavailable();
  return record as EncryptedAICredential;
}

export function createCredentialVault(dependencies: VaultDependencies = {}) {
  function capabilities(): { crypto: Crypto; keyStore: CredentialKeyStore } {
    const crypto = dependencies.crypto ?? globalThis.crypto;
    if (!crypto?.subtle || !crypto.getRandomValues) throw unavailable();
    const keyStore = dependencies.keyStore ?? (globalThis.indexedDB
      ? createIndexedDBCredentialKeyStore(globalThis.indexedDB) : null);
    if (!keyStore) throw unavailable();
    return { crypto, keyStore };
  }
  const additionalData = (baseUrl: string) => new TextEncoder().encode(`bookmark-atlas-ai-credential-v2\0${baseUrl}`);
  return {
    /** Encloses every read/migrate/save/clear operation, including storage commits. */
    async withLock<T>(action: () => Promise<T>): Promise<T> {
      const locks = dependencies.locks ?? globalThis.navigator?.locks;
      if (!locks?.request) throw unavailable();
      try { return await locks.request(LOCK_NAME, { mode: 'exclusive' }, action); }
      catch { throw unavailable(); }
    },
    async encrypt(baseUrl: string, apiKey: string): Promise<EncryptedAICredential> {
      try {
        if (!baseUrl || !apiKey || apiKey.length > 4096) throw unavailable();
        const { crypto, keyStore } = capabilities();
        let key = await keyStore.read();
        if (!key) {
          // Generate outside IDB, then let a readwrite transaction select the winner.
          const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          key = await keyStore.getOrCreate(candidate);
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(baseUrl), tagLength: 128 }, validateKey(key), new TextEncoder().encode(apiKey));
        return { version: 2, algorithm: 'AES-GCM', baseUrl, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
      } catch { throw unavailable(); }
    },
    async decrypt(baseUrl: string, value: unknown): Promise<string> {
      try {
        const record = readEnvelope(value);
        if (record.baseUrl !== baseUrl) throw unavailable();
        const { crypto, keyStore } = capabilities();
        const key = await keyStore.read();
        if (!key) throw unavailable();
        const iv = decode(record.iv, 12);
        const ciphertext = decode(record.ciphertext, MAX_CIPHERTEXT_BYTES);
        if (iv.length !== 12 || ciphertext.length < 17) throw unavailable();
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: additionalData(baseUrl), tagLength: 128 }, validateKey(key), ciphertext);
        return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
      } catch { throw unavailable(); }
    },
  };
}

export const localCredentialVault = createCredentialVault();
