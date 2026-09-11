import { describe, expect, it } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import type { CanvasSyncManifest } from './sceneSync';
import {
  assessSyncCompletion,
  assessAppliedIncomingSceneSync,
  decideIncomingScene,
  getLiveSyncedAppState,
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

  it('uses the last acknowledged cloud version to distinguish sync from a real conflict', () => {
    const input = {
      sameDevice: false,
      baseFingerprint: 'base',
      currentFingerprint: 'base',
      incomingFingerprint: 'remote',
      currentUpdatedAt: 100,
      incomingUpdatedAt: 200,
    };

    expect(decideIncomingScene(input)).toBe('apply');
    expect(decideIncomingScene({
      ...input,
      currentFingerprint: 'local',
      incomingFingerprint: 'base',
    })).toBe('keep-local');
    expect(decideIncomingScene({
      ...input,
      currentFingerprint: 'same',
      incomingFingerprint: 'same',
    })).toBe('ack');
    expect(decideIncomingScene({
      ...input,
      currentFingerprint: 'local',
      incomingFingerprint: 'remote',
    })).toBe('conflict');
    expect(decideIncomingScene({
      ...input,
      baseFingerprint: 'older-base',
      currentFingerprint: 'local',
      incomingFingerprint: 'remote-child',
      incomingParentFingerprint: 'local',
    })).toBe('apply');
    expect(decideIncomingScene({
      ...input,
      baseFingerprint: 'device-a-edit',
      currentFingerprint: 'device-a-edit',
      incomingFingerprint: 'device-b-edit',
      incomingParentFingerprint: 'base',
    })).toBe('conflict');
  });

  it('converges same-device tabs silently using the newest saved scene', () => {
    const input = {
      sameDevice: true,
      baseFingerprint: 'base',
      currentFingerprint: 'local',
      incomingFingerprint: 'other-tab',
      currentUpdatedAt: 100,
      incomingUpdatedAt: 200,
    };

    expect(decideIncomingScene(input)).toBe('apply');
    expect(decideIncomingScene({
      ...input,
      currentUpdatedAt: 300,
      incomingUpdatedAt: 200,
    })).toBe('keep-local');
  });

  it('keeps an applied same-device scene dirty until that fingerprint reaches cloud sync', () => {
    const applied = assessAppliedIncomingSceneSync('local-tab', 'local-new', 'cloud-old', false);
    expect(applied).toEqual({
      hasUnsyncedCloudChanges: true,
      shouldScheduleSync: true,
    });

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
