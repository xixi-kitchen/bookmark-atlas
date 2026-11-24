import { describe, expect, it } from 'vitest';
import { createBookmarkElement, getBookmarkElementData } from '../../excalidraw/bookmarkElements';
import { applyCanvasPathChanges } from './canvasChanges';

const node = { id: 'a', title: 'Article', url: 'https://example.com/article' };
describe('native organization canvas associations', () => {
  it('repairs only a verified old path and preserves position and card presentation', () => {
    const card = createBookmarkElement(node, { x: 10, y: 20 }, { folderPath: 'Other / Inbox', presentation: 'compact' });
    const changes = [{ bookmarkId: 'a', title: node.title, url: node.url, beforePath: 'Other / Inbox', afterPath: 'Other / Work' }];
    const result = applyCanvasPathChanges([card], changes);
    expect(getBookmarkElementData(result[0]!)?.folderPath).toBe('Other / Work');
    expect(result[0]).toMatchObject({ x: 10, y: 20, width: card.width, height: card.height });
    expect(applyCanvasPathChanges(result, changes)[0]).toBe(result[0]);
  });
  it('does not attach an unrelated same-URL bookmark with another source path', () => {
    const card = createBookmarkElement({ ...node, id: 'other' }, { x: 0, y: 0 }, { folderPath: 'Other / Personal' });
    expect(applyCanvasPathChanges([card], [{ bookmarkId: 'a', title: node.title, url: node.url, beforePath: 'Other / Inbox', afterPath: 'Other / Work' }])[0]).toBe(card);
  });
  it('repairs a source-device ID using a unique verified old URL, title and path', () => {
    const card = createBookmarkElement({ ...node, id: 'source-device-id' }, { x: 0, y: 0 }, { folderPath: 'Other / Inbox' });
    const result = applyCanvasPathChanges([card], [{ bookmarkId: 'local-device-id', beforeIdentityUnique: true, title: node.title, url: node.url, beforePath: 'Other / Inbox', afterPath: 'Other / Work' }]);
    expect(getBookmarkElementData(result[0]!)?.folderPath).toBe('Other / Work');
    expect(getBookmarkElementData(result[0]!)?.bookmarkId).toBe('source-device-id');
  });
  it('preserves ambiguity when two local bookmarks have the same old identity', () => {
    const card = createBookmarkElement({ ...node, id: 'source-device-id' }, { x: 0, y: 0 }, { folderPath: 'Other / Inbox' });
    const base = { title: node.title, url: node.url, beforePath: 'Other / Inbox' };
    const result = applyCanvasPathChanges([card], [{ ...base, bookmarkId: 'one', afterPath: 'Work' }, { ...base, bookmarkId: 'two', afterPath: 'Personal' }]);
    expect(result[0]).toBe(card);
  });
  it('preserves a source-device card when an unchanged twin makes the old identity ambiguous', () => {
    const card = createBookmarkElement({ ...node, id: 'source-device-id' }, { x: 0, y: 0 }, { folderPath: 'Other / Inbox' });
    const changes = [{ bookmarkId: 'a', title: node.title, url: node.url, beforePath: 'Other / Inbox', afterPath: 'Other / Work', beforeIdentityUnique: false }];
    expect(applyCanvasPathChanges([card], changes)[0]).toBe(card);
  });
  it('keeps a forward move followed by restore idempotent', () => {
    const card = createBookmarkElement(node, { x: 0, y: 0 }, { folderPath: 'Other / Inbox' });
    const base = { bookmarkId: 'a', title: node.title, url: node.url };
    const changes = [{ ...base, beforePath: 'Other / Inbox', afterPath: 'Other / Work' }, { ...base, beforePath: 'Other / Work', afterPath: 'Other / Inbox' }];
    expect(applyCanvasPathChanges([card], changes)[0]).toBe(card);
  });
});
