import type { AppState } from '@excalidraw/excalidraw/types';
import type { CanvasSyncManifest } from './sceneSync';

export const LOCAL_SCENE_CHANNEL = 'bookmark-atlas:scene-live:v1';
export const SYNC_POLL_INTERVAL_MS = 30_000;

export type LocalSceneSignal = {
  type: 'scene-saved';
  contextId: string;
  savedAt: number;
  fingerprint: string;
};

export type IncomingSceneDecision = 'ignore' | 'apply' | 'conflict';
export type IncomingSceneSource = 'local-tab' | 'chrome-sync';

export function assessSyncCompletion(sentFingerprint: string, currentFingerprint: string) {
  const syncedCurrentScene = Boolean(sentFingerprint && sentFingerprint === currentFingerprint);
  return {
    syncedCurrentScene,
    hasNewerLocalChanges: !syncedCurrentScene,
  };
}

export function createCanvasContextId() {
  return globalThis.crypto?.randomUUID?.() ?? `context-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function isOwnSyncManifest(
  manifest: CanvasSyncManifest,
  contextId: string,
  lastWrittenRevision: string,
) {
  return manifest.contextId === contextId || manifest.revision === lastWrittenRevision;
}

export function decideIncomingScene(
  hasLocalChanges: boolean,
  currentFingerprint: string,
  incomingFingerprint: string,
): IncomingSceneDecision {
  if (currentFingerprint && currentFingerprint === incomingFingerprint) return 'ignore';
  return hasLocalChanges ? 'conflict' : 'apply';
}

export function hasConflictingLocalChanges(
  source: IncomingSceneSource,
  hasUnpersistedLocalChanges: boolean,
  hasUnsyncedCloudChanges: boolean,
) {
  return source === 'local-tab'
    ? hasUnpersistedLocalChanges
    : hasUnsyncedCloudChanges;
}

export function assessAppliedIncomingSceneSync(
  source: IncomingSceneSource,
  incomingFingerprint: string,
  lastSyncedFingerprint: string,
  reconciliationChanged: boolean,
) {
  const awaitingCloudSync = source === 'local-tab'
    && incomingFingerprint !== lastSyncedFingerprint;
  return {
    hasUnsyncedCloudChanges: reconciliationChanged || awaitingCloudSync,
    shouldScheduleSync: reconciliationChanged || awaitingCloudSync,
  };
}

export function getLiveSyncedAppState(appState: Partial<AppState>): Partial<AppState> {
  const {
    scrollX: _scrollX,
    scrollY: _scrollY,
    zoom: _zoom,
    openSidebar: _openSidebar,
    ...stableState
  } = appState;
  return stableState;
}

export function normalizeLocalSceneSignal(value: unknown): LocalSceneSignal | null {
  if (!value || typeof value !== 'object') return null;
  const signal = value as Partial<LocalSceneSignal>;
  if (
    signal.type !== 'scene-saved'
    || typeof signal.contextId !== 'string'
    || signal.contextId.length === 0
    || typeof signal.savedAt !== 'number'
    || typeof signal.fingerprint !== 'string'
    || signal.fingerprint.length === 0
  ) return null;
  return signal as LocalSceneSignal;
}
