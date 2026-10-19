import { describe, expect, it } from 'vitest';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { buildCapturedBookmarkChange } from './captureElements';
import { createBookmarkElement, getBookmarkElementData } from './bookmarkElements';

const intent = { id: 'request-one', bookmarkId: 'native-one', title: 'Old title', url: 'https://example.com/old', folderPath: 'Other bookmarks / Bookmark Atlas', createdAt: 1 };
const node = { id: 'native-one', title: 'Live title', url: 'https://example.com/path?token=preserved#part', parentId: 'folder' };
describe('captured page scene addition', () => {
  it('adds a linked native bookmark without changing existing elements or dropping its real URL', () => {
    const old = createBookmarkElement({ id: 'old', title: 'Old', url: 'https://old.test' }, { x: 0, y: 20 });
    const result = buildCapturedBookmarkChange([old], intent, node, 'compact');
    expect(result.changed).toBe(true);
    expect(result.elements[0]).toBe(old);
    expect(result.target!.x).toBeGreaterThan(old.x + old.width);
    expect(result.target!.id).toBe('capture-request-one');
    expect(getBookmarkElementData(result.target!)).toMatchObject({ bookmarkId: 'native-one', title: 'Live title', url: node.url, folderPath: intent.folderPath, presentation: 'compact' });
  });
  it('reuses a matching bookmark from an earlier capture retry', () => {
    const first = buildCapturedBookmarkChange([], intent, node, 'icon');
    const retry = buildCapturedBookmarkChange(first.elements, { ...intent, id: 'second-attempt' }, node, 'detailed');
    expect(retry.changed).toBe(false);
    expect(retry.elements).toBe(first.elements);
    expect(retry.target).toBe(first.target);
  });
  it('does not resurrect a captured card the user already undid or deleted', () => {
    const first = buildCapturedBookmarkChange([], intent, node, 'icon');
    const deleted = { ...first.target!, isDeleted: true } as ExcalidrawElement;
    const retry = buildCapturedBookmarkChange([deleted], intent, node, 'icon');
    expect(retry.changed).toBe(false);
    expect(retry.target).toBeNull();
  });
  it('refuses unsafe URLs, the wrong native id, and unrelated element ID collisions', () => {
    expect(() => buildCapturedBookmarkChange([], intent, { ...node, id: 'wrong' }, 'compact')).toThrow();
    expect(() => buildCapturedBookmarkChange([], intent, { ...node, url: 'javascript:alert(1)' }, 'compact')).toThrow();
    const collision = { id: 'capture-request-one', type: 'rectangle', isDeleted: false } as ExcalidrawElement;
    expect(() => buildCapturedBookmarkChange([collision], intent, node, 'compact')).toThrow();
  });
});
