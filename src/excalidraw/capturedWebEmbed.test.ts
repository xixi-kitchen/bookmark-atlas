import { describe, expect, it } from 'vitest';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { EmbedCaptureIntent } from '../capture/embedCaptureQueue';
import { createBookmarkElement, getBookmarkElementData } from './bookmarkElements';
import { buildCapturedWebEmbedChange } from './capturedWebEmbed';

const intent = (overrides: Partial<EmbedCaptureIntent> = {}): EmbedCaptureIntent => ({
  id: 'one', kind: 'embed', url: 'https://example.com/page?b=2&a=1#section', title: 'Page', createdAt: 1,
  saveBookmark: false, phase: 'ready', ...overrides,
});
const web = (url: string, id = 'drawn-web') => ({ ...buildCapturedWebEmbedChange([], intent({ url })).target!, id });

describe('captured web embeds', () => {
  it('creates a complete regular embeddable preserving exact URL and independent metadata', () => {
    const request = intent();
    const result = buildCapturedWebEmbedChange([], request);
    expect(result).toMatchObject({ changed: true, outcome: 'added' });
    expect(result.target).toMatchObject({ id: 'embed-capture-one', type: 'embeddable', x: 0, y: 0, width: 960, height: 640, link: request.url, frameId: null, isDeleted: false, version: expect.any(Number), groupIds: [], boundElements: null });
    expect(result.target!.seed).toEqual(expect.any(Number));
    expect(getBookmarkElementData(result.target!)).toBeNull();
    expect(result.target!.customData?.bookmarkAtlas).toMatchObject({ kind: 'web-embed', requestId: 'one', title: 'Page', url: request.url });
  });
  it.each(['https://www.youtube.com/watch?v=abc123', 'https://youtu.be/abc123', 'https://www.bilibili.com/video/BV123', 'https://player.bilibili.com/player.html?bvid=BV123'])('uses video dimensions for supported video URLs: %s', (url) => {
    expect(buildCapturedWebEmbedChange([], intent({ url })).target).toMatchObject({ width: 960, height: 540, link: url });
  });
  it.each(['https://www.youtube.com/', 'https://www.bilibili.com/', 'https://example.com/video/one'])('keeps normal dimensions for ordinary pages: %s', (url) => {
    expect(buildCapturedWebEmbedChange([], intent({ url })).target!.height).toBe(640);
  });
  it('appends 64 units right of live content, preserving old cards and drawings', () => {
    const card = createBookmarkElement({ id: 'native', title: 'Bookmark', url: intent().url }, { x: 40, y: -50 });
    const removed = { ...card, id: 'deleted', isDeleted: true, x: 99999 };
    const result = buildCapturedWebEmbedChange([card, removed], intent());
    expect(result.elements.slice(0, 2)).toEqual([card, removed]);
    expect(result.elements[0]).toBe(card);
    expect(result.target).toMatchObject({ x: card.x + card.width + 64, y: -50 });
  });
  it('reuses only exact normalized URLs in live non-bookmark embeds, independently of bookmark choice', () => {
    const existing = web('https://EXAMPLE.com:443/page?b=2&a=1#section');
    const result = buildCapturedWebEmbedChange([existing], intent({ id: 'second', saveBookmark: true }));
    expect(result).toMatchObject({ target: existing, outcome: 'existing', changed: false });
    expect(result.elements).toEqual([existing]);
  });
  it.each(['https://example.com/page?b=2&a=1#other', 'https://example.com/page?a=1&b=2#section', 'https://example.com/page/?b=2&a=1#section'])('does not apply bookmark normalization to %s', (url) => {
    expect(buildCapturedWebEmbedChange([web(url)], intent({ id: 'other' })).changed).toBe(true);
  });
  it('does not reuse a rectangle with a web link or a deleted earlier embed', () => {
    const existing = web(intent().url);
    const rectangle = { ...existing, type: 'rectangle' } as ExcalidrawElement;
    expect(buildCapturedWebEmbedChange([rectangle], intent({ id: 'new' })).changed).toBe(true);
    expect(buildCapturedWebEmbedChange([{ ...existing, isDeleted: true }], intent({ id: 'new' })).changed).toBe(true);
  });
  it('does not resurrect a deterministic request target already deleted', () => {
    const existing = buildCapturedWebEmbedChange([], intent()).target!;
    const deleted = { ...existing, isDeleted: true };
    expect(buildCapturedWebEmbedChange([deleted], intent())).toMatchObject({ changed: false, outcome: 'cancelled', target: deleted });
  });
  it.each(['create', 'reuse'] as const)('retains a planned %s target and cancels its deletion without choosing another', (mode) => {
    const target = web(intent().url, 'fixed');
    const request = intent({ phase: 'planned', target: { elementId: 'fixed', mode } });
    if (mode === 'create') target.customData = { bookmarkAtlas: { kind: 'web-embed', requestId: 'one', url: request.url } };
    expect(buildCapturedWebEmbedChange([target], request)).toMatchObject({ target, outcome: mode === 'create' ? 'added' : 'existing', changed: false });
    expect(buildCapturedWebEmbedChange([{ ...target, isDeleted: true }, web(request.url, 'other')], request)).toMatchObject({ outcome: 'cancelled', changed: false });
    expect(buildCapturedWebEmbedChange([web(request.url, 'other')], request)).toMatchObject({ outcome: 'needs-review', target: null, changed: false });
  });
  it('retains data and requires review for collisions, modified targets and unfinished requests', () => {
    const unrelated = createBookmarkElement({ id: 'native', title: 'Bookmark', url: intent().url }, { x: 0, y: 0 }, { id: 'embed-capture-one' });
    const elements = [unrelated];
    expect(buildCapturedWebEmbedChange(elements, intent())).toMatchObject({ elements, changed: false, outcome: 'needs-review' });
    expect(buildCapturedWebEmbedChange([web('https://other.test', 'fixed')], intent({ phase: 'planned', target: { elementId: 'fixed', mode: 'reuse' } })).outcome).toBe('needs-review');
    expect(buildCapturedWebEmbedChange([], intent({ phase: 'preparing' })).outcome).toBe('needs-review');
  });
  it('rejects invalid input without changing scene data', () => {
    for (const request of [intent({ id: '../bad' }), intent({ url: 'javascript:alert(1)' }), intent({ url: 'https://user:pass@example.com' })]) {
      expect(() => buildCapturedWebEmbedChange([], request)).toThrow();
    }
  });
});
