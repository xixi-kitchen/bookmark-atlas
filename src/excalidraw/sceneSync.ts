import type { StoredExcalidrawScene } from './sceneStorage';
import {
  mergeSyncedAppState,
  normalizeStoredScene,
  pickSyncedAppState,
} from './sceneStorage';

export const SYNC_MANIFEST_KEY = 'bookmark-atlas:canvas-sync:v1:manifest';
const SYNC_CHUNK_PREFIX = 'bookmark-atlas:canvas-sync:v1:chunk:';
const DEVICE_ID_KEY = 'bookmark-atlas:canvas-sync:device-id';
const MAX_CHUNK_LENGTH = 7_000;
const MAX_ENCODED_LENGTH = 70 * 1024;
const MAX_CHUNKS = 12;

type SyncCodec = 'gzip-base64' | 'plain-base64';

export type CanvasSyncManifest = {
  version: 1;
  revision: string;
  updatedAt: number;
  deviceId: string;
  contextId?: string;
  fingerprint?: string;
  fingerprintVersion?: 2;
  parentFingerprint?: string;
  codec: SyncCodec;
  chunkCount: number;
  encodedLength: number;
  elementCount: number;
  excludedFileCount: number;
};

export type CanvasSyncSaveResult =
  | { status: 'synced'; manifest: CanvasSyncManifest }
  | { status: 'too-large'; encodedLength: number; limit: number }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

type SyncableScene = Pick<StoredExcalidrawScene, 'version' | 'elements' | 'appState' | 'libraryItems' | 'savedAt'>;

export type CanvasSyncSaveOptions = {
  contextId?: string;
  fingerprint?: string;
  parentFingerprint?: string;
};

export type CanvasSyncLoadOptions = {
  manifest?: CanvasSyncManifest;
  revision?: string;
  retries?: number;
  retryDelayMs?: number;
};

export async function saveSceneToSync(
  scene: StoredExcalidrawScene,
  options: CanvasSyncSaveOptions = {},
): Promise<CanvasSyncSaveResult> {
  const storage = globalThis.chrome?.storage?.sync;
  if (!storage) return { status: 'unavailable' };

  try {
    const payload = createSyncableScene(scene);
    const payloadText = JSON.stringify(payload);
    const encoded = await encodePayload(payloadText);
    if (encoded.data.length > MAX_ENCODED_LENGTH) {
      return { status: 'too-large', encodedLength: encoded.data.length, limit: MAX_ENCODED_LENGTH };
    }

    const chunks = splitIntoChunks(encoded.data, MAX_CHUNK_LENGTH);
    if (chunks.length > MAX_CHUNKS) {
      return { status: 'too-large', encodedLength: encoded.data.length, limit: MAX_ENCODED_LENGTH };
    }

    const previous = await getCanvasSyncManifest();
    const manifest: CanvasSyncManifest = {
      version: 1,
      revision: createRevision(),
      updatedAt: scene.savedAt,
      deviceId: await getCanvasSyncDeviceId(),
      ...(options.contextId ? { contextId: options.contextId } : {}),
      fingerprint: options.fingerprint ?? createSceneSyncFingerprint(scene),
      fingerprintVersion: 2,
      ...(options.parentFingerprint ? { parentFingerprint: options.parentFingerprint } : {}),
      codec: encoded.codec,
      chunkCount: chunks.length,
      encodedLength: encoded.data.length,
      elementCount: scene.elements.filter((element) => !element.isDeleted).length,
      excludedFileCount: Object.keys(scene.files).length,
    };
    const values: Record<string, unknown> = { [SYNC_MANIFEST_KEY]: manifest };
    chunks.forEach((chunk, index) => { values[chunkKey(index)] = chunk; });
    await storage.set(values);

    if (previous && previous.chunkCount > chunks.length) {
      await storage.remove(
        Array.from({ length: previous.chunkCount - chunks.length }, (_, index) => chunkKey(chunks.length + index)),
      );
    }
    return { status: 'synced', manifest };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadSceneFromSync(
  options: CanvasSyncLoadOptions = {},
): Promise<{ scene: StoredExcalidrawScene; manifest: CanvasSyncManifest } | null> {
  const storage = globalThis.chrome?.storage?.sync;
  if (!storage) return null;

  try {
    const manifest = options.manifest ?? await getCanvasSyncManifest();
    if (!manifest || manifest.chunkCount < 1 || manifest.chunkCount > MAX_CHUNKS) return null;
    if (options.revision && manifest.revision !== options.revision) return null;
    const keys = Array.from({ length: manifest.chunkCount }, (_, index) => chunkKey(index));
    const encoded = await readCompleteEncodedPayload(storage, keys, manifest.encodedLength, {
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
    });
    if (!encoded) return null;
    const parsed = JSON.parse(await decodePayload(encoded, manifest.codec)) as Partial<SyncableScene>;
    const scene = normalizeStoredScene({ ...parsed, version: 2, files: {} });
    if (!scene) return null;
    const syncedScene = { ...scene, appState: pickSyncedAppState(scene.appState) };
    if (
      manifest.fingerprintVersion === 2
      && manifest.fingerprint
      && createSceneSyncFingerprint(syncedScene) !== manifest.fingerprint
    ) return null;
    return { scene: syncedScene, manifest };
  } catch {
    return null;
  }
}

export async function getCanvasSyncManifest(): Promise<CanvasSyncManifest | null> {
  const storage = globalThis.chrome?.storage?.sync;
  if (!storage) return null;
  const result = await storage.get(SYNC_MANIFEST_KEY);
  return normalizeManifest(result[SYNC_MANIFEST_KEY]);
}

export async function getCanvasSyncDeviceId(): Promise<string> {
  const local = globalThis.chrome?.storage?.local;
  if (local) {
    const result = await local.get(DEVICE_ID_KEY);
    if (typeof result[DEVICE_ID_KEY] === 'string') return result[DEVICE_ID_KEY];
    const deviceId = createDeviceId();
    await local.set({ [DEVICE_ID_KEY]: deviceId });
    return deviceId;
  }

  const existing = globalThis.localStorage?.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = createDeviceId();
  globalThis.localStorage?.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function subscribeToCanvasSync(listener: (manifest: CanvasSyncManifest) => void) {
  const event = globalThis.chrome?.storage?.onChanged;
  if (!event?.addListener) return () => undefined;

  const handleChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'sync') return;
    const manifest = normalizeManifest(changes[SYNC_MANIFEST_KEY]?.newValue);
    if (manifest) listener(manifest);
  };
  event.addListener(handleChange);
  return () => event.removeListener(handleChange);
}

export function mergeSyncedSceneWithLocalFiles(
  synced: StoredExcalidrawScene,
  local: StoredExcalidrawScene | null,
): StoredExcalidrawScene {
  return {
    ...synced,
    appState: mergeSyncedAppState(synced.appState, local?.appState),
    files: local?.files ?? {},
  };
}

export function createSceneSyncFingerprint(scene: StoredExcalidrawScene) {
  return hashText(JSON.stringify({
    elements: scene.elements.map((element) => [
      element.id,
      element.version,
      element.versionNonce,
      element.updated,
      element.isDeleted,
    ]),
    appState: pickSyncedAppState(scene.appState),
    libraryItems: scene.libraryItems.map((item) => [
      item.id,
      item.status,
      item.name,
      item.created,
      item.elements.map((element) => [
        element.id,
        element.version,
        element.versionNonce,
        element.updated,
        element.isDeleted,
      ]),
    ]),
  }));
}

function createSyncableScene(scene: StoredExcalidrawScene): SyncableScene {
  return {
    version: 2,
    elements: scene.elements,
    appState: pickSyncedAppState(scene.appState),
    libraryItems: scene.libraryItems,
    savedAt: scene.savedAt,
  };
}

async function readCompleteEncodedPayload(
  storage: chrome.storage.StorageArea,
  keys: string[],
  expectedLength: number,
  options: Pick<CanvasSyncLoadOptions, 'retries' | 'retryDelayMs'>,
) {
  const attempts = Math.max(1, (options.retries ?? 2) + 1);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await storage.get(keys);
    const chunks = keys.map((key) => result[key]);
    if (chunks.every((value): value is string => typeof value === 'string')) {
      const encoded = chunks.join('');
      if (encoded.length === expectedLength) return encoded;
    }
    if (attempt < attempts - 1) await wait(options.retryDelayMs ?? 50);
  }
  return null;
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function encodePayload(value: string): Promise<{ codec: SyncCodec; data: string }> {
  const bytes = new TextEncoder().encode(value);
  if (typeof CompressionStream === 'function' && typeof Blob.prototype.stream === 'function') {
    const compressed = await streamToBytes(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    );
    return { codec: 'gzip-base64', data: bytesToBase64(compressed) };
  }
  return { codec: 'plain-base64', data: bytesToBase64(bytes) };
}

async function decodePayload(value: string, codec: SyncCodec) {
  const bytes = base64ToBytes(value);
  const decoded = codec === 'gzip-base64'
    ? await streamToBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')))
    : bytes;
  return new TextDecoder().decode(decoded);
}

async function streamToBytes(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function splitIntoChunks(value: string, length: number) {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += length) chunks.push(value.slice(offset, offset + length));
  return chunks;
}

function chunkKey(index: number) {
  return `${SYNC_CHUNK_PREFIX}${index}`;
}

function normalizeManifest(value: unknown): CanvasSyncManifest | null {
  if (!value || typeof value !== 'object') return null;
  const manifest = value as Partial<CanvasSyncManifest>;
  if (
    manifest.version !== 1
    || typeof manifest.revision !== 'string'
    || typeof manifest.updatedAt !== 'number'
    || typeof manifest.deviceId !== 'string'
    || (manifest.contextId !== undefined && typeof manifest.contextId !== 'string')
    || (manifest.fingerprint !== undefined && typeof manifest.fingerprint !== 'string')
    || (manifest.fingerprintVersion !== undefined && manifest.fingerprintVersion !== 2)
    || (manifest.parentFingerprint !== undefined && typeof manifest.parentFingerprint !== 'string')
    || (manifest.codec !== 'gzip-base64' && manifest.codec !== 'plain-base64')
    || typeof manifest.chunkCount !== 'number'
    || typeof manifest.encodedLength !== 'number'
  ) return null;
  return {
    ...manifest,
    elementCount: typeof manifest.elementCount === 'number' ? manifest.elementCount : 0,
    excludedFileCount: typeof manifest.excludedFileCount === 'number' ? manifest.excludedFileCount : 0,
  } as CanvasSyncManifest;
}

function createRevision() {
  return `${Date.now().toString(36)}-${createDeviceId()}`;
}

function createDeviceId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function hashText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(36)}`;
}
