import type { PersistedPreferences } from '../store/preferencesStore';
import { getPreferencesSnapshot, usePreferencesStore } from '../store/preferencesStore';
import {
  normalizeStoredScene,
  saveStoredScene,
  type StoredExcalidrawScene,
} from './sceneStorage';

export type BookmarkAtlasBackup = {
  type: 'bookmark-atlas-backup';
  version: 1;
  createdAt: string;
  appVersion: string;
  contents: {
    excalidrawScene: StoredExcalidrawScene;
    preferences: PersistedPreferences;
  };
};

export function createBookmarkAtlasBackup(scene: StoredExcalidrawScene): BookmarkAtlasBackup {
  return {
    type: 'bookmark-atlas-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: globalThis.chrome?.runtime?.getManifest?.().version ?? 'development',
    contents: {
      excalidrawScene: scene,
      preferences: getPreferencesSnapshot(),
    },
  };
}

export function parseBookmarkAtlasBackup(value: string): BookmarkAtlasBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('无法读取这个文件，请选择 Bookmark Atlas 导出的 JSON 备份。');
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('备份文件格式不正确。');
  const candidate = parsed as Partial<BookmarkAtlasBackup>;
  const scene = normalizeStoredScene(candidate.contents?.excalidrawScene);
  if (candidate.type !== 'bookmark-atlas-backup' || candidate.version !== 1 || !scene) {
    throw new Error('这不是有效的 Bookmark Atlas 完整备份。');
  }

  const preferences = candidate.contents?.preferences;
  if (!preferences || typeof preferences !== 'object') throw new Error('备份中缺少界面配置。');

  return {
    ...candidate,
    type: 'bookmark-atlas-backup',
    version: 1,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
    appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : 'unknown',
    contents: {
      excalidrawScene: scene,
      preferences: preferences as PersistedPreferences,
    },
  };
}

export async function restoreBookmarkAtlasBackup(backup: BookmarkAtlasBackup): Promise<void> {
  await saveStoredScene(backup.contents.excalidrawScene);
  await usePreferencesStore.getState().restorePreferences(backup.contents.preferences);
}

export function backupFileName(date = new Date()): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `bookmark-atlas-backup-${timestamp}.json`;
}
