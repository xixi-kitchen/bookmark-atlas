import { describe, expect, it } from 'vitest';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BookmarkNode } from '../bookmarks/types';
import { createBookmarkElement, getBookmarkElementData } from './bookmarkElements';
import {
  createBookmarkReconciliationIndex,
  isBookmarkEntryAlreadyImported,
  migrateBookmarkElementsForCurrentTree,
  resolveBookmarkElementData,
} from './bookmarkReconciliation';

const entry = (node: BookmarkNode, folderPath: string) => ({ node, folderPath });

describe('bookmark reconciliation', () => {
  it('trusts a Chrome bookmark id only when the URL still matches', () => {
    const original = createBookmarkElement(
      { id: 'device-a-id', title: 'OpenAI', url: 'https://openai.com/', type: 'bookmark' },
      { x: 10, y: 20 },
      { folderPath: 'AI' },
    );
    const data = getBookmarkElementData(original)!;
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'device-a-id', title: 'Wrong local bookmark', url: 'https://example.com/', type: 'bookmark' }, 'Other'),
      entry({ id: 'device-b-id', title: 'OpenAI', url: 'https://openai.com', type: 'bookmark' }, 'AI'),
    ]);

    const resolution = resolveBookmarkElementData(data, index);

    expect(resolution.status).toBe('matched');
    expect(resolution.status === 'matched' ? resolution.entry.node.id : '').toBe('device-b-id');
  });

  it('uses the stable key when another profile reuses the same id and URL for a different bookmark', () => {
    const original = createBookmarkElement(
      { id: 'shared-id', title: 'Correct bookmark', url: 'https://example.com/shared', type: 'bookmark' },
      { x: 10, y: 20 },
      { folderPath: 'Correct folder' },
    );
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'shared-id', title: 'Wrong local bookmark', url: 'https://example.com/shared', type: 'bookmark' }, 'Wrong folder'),
      entry({ id: 'correct-local-id', title: 'Correct bookmark', url: 'https://example.com/shared', type: 'bookmark' }, 'Correct folder'),
    ]);

    const resolution = resolveBookmarkElementData(getBookmarkElementData(original)!, index);

    expect(resolution).toMatchObject({
      status: 'matched',
      entry: { node: { id: 'correct-local-id' } },
    });
  });

  it('matches a migrated bookmark by unique normalized URL when the old id is missing', () => {
    const original = createBookmarkElement(
      { id: 'old-id', title: 'Docs', url: 'https://EXAMPLE.com/docs/?b=2&a=1#section', type: 'bookmark' },
      { x: 10, y: 20 },
    );
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'new-id', title: 'Docs', url: 'https://example.com/docs?a=1&b=2', type: 'bookmark' }, ''),
    ]);

    const resolution = resolveBookmarkElementData(getBookmarkElementData(original)!, index);

    expect(resolution.status).toBe('matched');
    expect(resolution.status === 'matched' ? resolution.entry.node.id : '').toBe('new-id');
  });

  it('disambiguates duplicate URLs only with the stored title and folder path together', () => {
    const original = createBookmarkElement(
      { id: 'old-id', title: 'Same URL in Work', url: 'https://example.com/shared', type: 'bookmark' },
      { x: 10, y: 20 },
      { folderPath: 'Work' },
    );
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'new-work', title: 'Same URL in Work', url: 'https://example.com/shared', type: 'bookmark' }, 'Work'),
      entry({ id: 'new-personal', title: 'Same URL in Personal', url: 'https://example.com/shared', type: 'bookmark' }, 'Personal'),
    ]);

    const resolution = resolveBookmarkElementData(getBookmarkElementData(original)!, index);

    expect(resolution.status).toBe('matched');
    expect(resolution.status === 'matched' ? resolution.entry.node.id : '').toBe('new-work');
  });

  it('refuses to bind a duplicate URL when title and folder path are still ambiguous', () => {
    const original = createBookmarkElement(
      { id: 'old-id', title: 'Shared', url: 'https://example.com/shared', type: 'bookmark' },
      { x: 10, y: 20 },
      { folderPath: 'Work' },
    );
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'new-a', title: 'Shared', url: 'https://example.com/shared', type: 'bookmark' }, 'Work'),
      entry({ id: 'new-b', title: 'Shared', url: 'https://example.com/shared', type: 'bookmark' }, 'Work'),
    ]);

    const resolution = resolveBookmarkElementData(getBookmarkElementData(original)!, index);

    expect(resolution.status).toBe('ambiguous');
  });

  it('migrates legacy elements without moving or resizing them', () => {
    const original = createBookmarkElement(
      { id: 'old-id', title: 'Legacy', url: 'https://legacy.example/', type: 'bookmark' },
      { x: 48, y: 96 },
      { frameId: 'frame-1', folderPath: 'Old' },
    );
    const legacy = {
      ...original,
      customData: {
        bookmarkAtlas: {
          kind: 'bookmark',
          bookmarkId: 'old-id',
          title: 'Legacy',
          url: 'https://legacy.example/',
          folderPath: 'Old',
        },
      },
    } as ExcalidrawElement;
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'new-id', title: 'Legacy', url: 'https://legacy.example', type: 'bookmark' }, 'Old'),
    ]);

    const migration = migrateBookmarkElementsForCurrentTree([legacy], index);
    const migrated = migration.elements[0]!;
    const migratedData = getBookmarkElementData(migrated)!;

    expect(migration).toMatchObject({ changed: true, matched: 1, missing: 0, ambiguous: 0 });
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.x).toBe(48);
    expect(migrated.y).toBe(96);
    expect(migrated.width).toBe(legacy.width);
    expect(migrated.frameId).toBe('frame-1');
    expect(migrated.version).toBe(legacy.version + 1);
    expect(migrated.link).toBe(legacy.link);
    expect(migratedData.bookmarkId).toBe('old-id');
    expect(migratedData.bookmarkKey).toContain('https://legacy.example/');
  });

  it('keeps device-local ids out of synced migrations to avoid cross-device ping-pong', () => {
    const original = createBookmarkElement(
      { id: 'device-a-id', title: 'Docs', url: 'https://example.com/docs', type: 'bookmark' },
      { x: 0, y: 0 },
    );
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'device-b-id', title: 'Docs', url: 'https://example.com/docs', type: 'bookmark' }, ''),
    ]);

    const migration = migrateBookmarkElementsForCurrentTree([original], index);
    const migratedData = getBookmarkElementData(migration.elements[0]!)!;

    expect(migratedData.bookmarkId).toBe('device-a-id');
    expect(resolveBookmarkElementData(migratedData, index)).toMatchObject({
      status: 'matched',
      entry: { node: { id: 'device-b-id' } },
    });
  });

  it('refuses a profile-local id fallback when the stored URL no longer exists', () => {
    const original = createBookmarkElement(
      { id: 'same-device-id', title: 'Docs', url: 'https://example.com/old', type: 'bookmark' },
      { x: 0, y: 0 },
      { folderPath: 'Work' },
    );
    const index = createBookmarkReconciliationIndex([
      entry({ id: 'same-device-id', title: 'Docs', url: 'https://example.com/new', type: 'bookmark' }, 'Work'),
    ]);

    const resolution = resolveBookmarkElementData(getBookmarkElementData(original)!, index);

    expect(resolution).toEqual({ status: 'missing' });
  });

  it('marks the same current bookmark as imported after a cross-device id change', () => {
    const existing = getBookmarkElementData(createBookmarkElement(
      { id: 'device-a-id', title: 'Old title', url: 'https://example.com/item', type: 'bookmark' },
      { x: 0, y: 0 },
      { folderPath: 'Old folder' },
    ))!;
    const current = entry(
      { id: 'device-b-id', title: 'New title', url: 'https://example.com/item', type: 'bookmark' },
      'New folder',
    );
    const index = createBookmarkReconciliationIndex([current]);

    expect(isBookmarkEntryAlreadyImported(current, [existing], index)).toBe(true);
  });

  it('does not merge explicit duplicate bookmarks that share a URL', () => {
    const work = entry({ id: 'work-id', title: 'Shared Work', url: 'https://example.com/shared', type: 'bookmark' }, 'Work');
    const personal = entry({ id: 'personal-id', title: 'Shared Personal', url: 'https://example.com/shared', type: 'bookmark' }, 'Personal');
    const existing = getBookmarkElementData(createBookmarkElement(work.node, { x: 0, y: 0 }, { folderPath: work.folderPath }))!;
    const index = createBookmarkReconciliationIndex([work, personal]);

    expect(isBookmarkEntryAlreadyImported(work, [existing], index)).toBe(true);
    expect(isBookmarkEntryAlreadyImported(personal, [existing], index)).toBe(false);
  });
});
