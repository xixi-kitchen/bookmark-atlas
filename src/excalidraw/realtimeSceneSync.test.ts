import { describe, expect, it } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import type { CanvasSyncManifest } from './sceneSync';
import {
  assessSyncCompletion,
  assessAppliedIncomingSceneSync,
  decideIncomingScene,
  getLiveSyncedAppState,
  hasConflictingLocalChanges,
  isOwnSyncManifest,
  normalizeLocalSceneSignal,
} from './realtimeSceneSync';

const manifest = (overrides: Partial<CanvasSyncManifest> = {}): CanvasSyncManifest => ({
  version: 1,
  revision: 'remote-revision',
  updatedAt: 100,
  deviceId: 'device-a',
  codec: 'plain-base64',
  chunkCount: 1,
  encodedLength: 10,
  elementCount: 1,
  excludedFileCount: 0,
  ...overrides,
});

describe('realtime scene sync decisions', () => {
  it('keeps a newer edit dirty when an older in-flight sync finishes', () => {
    expect(assessSyncCompletion('edit-a', 'edit-b')).toEqual({
      syncedCurrentScene: false,
      hasNewerLocalChanges: true,
    });
    expect(assessSyncCompletion('edit-b', 'edit-b')).toEqual({
      syncedCurrentScene: true,
      hasNewerLocalChanges: false,
    });
  });

  it('ignores only the current tab write and accepts another tab on the same device', () => {
    expect(isOwnSyncManifest(manifest({ contextId: 'tab-a' }), 'tab-a', '')).toBe(true);
    expect(isOwnSyncManifest(manifest({ contextId: 'tab-b' }), 'tab-a', '')).toBe(false);
    expect(isOwnSyncManifest(manifest({ revision: 'written-here' }), 'tab-a', 'written-here')).toBe(true);
  });

  it('applies clean changes, ignores identical scenes, and queues conflicts while dirty', () => {
    expect(decideIncomingScene(false, 'local', 'remote')).toBe('apply');
    expect(decideIncomingScene(true, 'local', 'remote')).toBe('conflict');
    expect(decideIncomingScene(true, 'same', 'same')).toBe('ignore');
  });

  it('does not treat a locally saved scene awaiting cloud sync as a same-device conflict', () => {
    expect(hasConflictingLocalChanges('local-tab', false, true)).toBe(false);
    expect(hasConflictingLocalChanges('local-tab', true, true)).toBe(true);
    expect(hasConflictingLocalChanges('chrome-sync', false, true)).toBe(true);
    expect(hasConflictingLocalChanges('chrome-sync', false, false)).toBe(false);
  });

  it('keeps an applied same-device scene dirty until that fingerprint reaches cloud sync', () => {
    const applied = assessAppliedIncomingSceneSync('local-tab', 'local-new', 'cloud-old', false);
    expect(applied).toEqual({
      hasUnsyncedCloudChanges: true,
      shouldScheduleSync: true,
    });
    expect(hasConflictingLocalChanges(
      'chrome-sync',
      false,
      applied.hasUnsyncedCloudChanges,
    )).toBe(true);

    expect(assessAppliedIncomingSceneSync('local-tab', 'same', 'same', false)).toEqual({
      hasUnsyncedCloudChanges: false,
      shouldScheduleSync: false,
    });
    expect(assessAppliedIncomingSceneSync('chrome-sync', 'remote', 'old', true)).toEqual({
      hasUnsyncedCloudChanges: true,
      shouldScheduleSync: true,
    });
  });

  it('does not move the active viewport or sidebar during a live remote apply', () => {
    const remote = {
      viewBackgroundColor: '#fff',
      gridModeEnabled: true,
      scrollX: 20,
      scrollY: 30,
      zoom: { value: 0.5 },
      openSidebar: { name: 'library' },
    } as Partial<AppState>;

    expect(getLiveSyncedAppState(remote)).toEqual({
      viewBackgroundColor: '#fff',
      gridModeEnabled: true,
    });
  });

  it('validates local broadcast payloads before consuming them', () => {
    expect(normalizeLocalSceneSignal({
      type: 'scene-saved',
      contextId: 'tab-b',
      savedAt: 42,
      fingerprint: 'fingerprint',
    })).toEqual({
      type: 'scene-saved',
      contextId: 'tab-b',
      savedAt: 42,
      fingerprint: 'fingerprint',
    });
    expect(normalizeLocalSceneSignal({ type: 'scene-saved', contextId: '', savedAt: 42 })).toBeNull();
  });
});
