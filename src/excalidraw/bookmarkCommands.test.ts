import { convertToExcalidrawElements, getCommonBounds } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawFrameElement } from '@excalidraw/excalidraw/element/types';
import { describe, expect, it } from 'vitest';
import {
  getSelectedBookmarkIds,
  layoutBookmarkElements,
  setBookmarkDescription,
  setBookmarkPresentation,
} from './bookmarkCommands';
import { createBookmarkElement, getBookmarkElementData } from './bookmarkElements';
import { createSceneSyncFingerprint } from './sceneSync';

function bookmark(id: string, x = 0, y = 0) {
  return createBookmarkElement({ id, type: 'bookmark', title: id, url: `https://example.com/${id}` }, { x, y }, { id });
}

function shape(id: string): ExcalidrawElement {
  return convertToExcalidrawElements([{ type: 'rectangle', id, x: 0, y: 0, width: 100, height: 100 }], { regenerateIds: false })[0]!;
}

function frame(id: string, parentId: string | null = null): ExcalidrawFrameElement {
  return { ...shape(id), type: 'frame', name: id, frameId: parentId } as ExcalidrawFrameElement;
}

function fingerprint(elements: readonly ExcalidrawElement[]) {
  return createSceneSyncFingerprint({ version: 2, elements, appState: {}, files: {}, libraryItems: [], savedAt: 0 });
}

describe('bookmark commands', () => {
  it('selects bookmarks inside selected frames recursively, in scene order without duplicates', () => {
    const first = { ...bookmark('first'), frameId: 'inner' };
    const second = { ...bookmark('second'), frameId: 'outer' };
    const outside = bookmark('outside');
    const elements = [frame('outer'), frame('inner', 'outer'), first, second, outside, shape('drawing')];

    expect(getSelectedBookmarkIds(elements, { outer: true, inner: true, first: true, drawing: true, outside: false }))
      .toEqual(['first', 'second']);
  });

  it('excludes locked, deleted, non-bookmark and locked-frame descendants from selection', () => {
    const elements = [
      { ...bookmark('locked'), locked: true },
      { ...bookmark('deleted'), isDeleted: true },
      { ...frame('locked-parent'), locked: true },
      { ...bookmark('child'), frameId: 'locked-parent' },
      { ...frame('deleted-parent'), isDeleted: true },
      { ...bookmark('deleted-child'), frameId: 'deleted-parent' },
      shape('drawing'),
      bookmark('normal'),
    ];
    expect(getSelectedBookmarkIds(elements, Object.fromEntries(elements.map((element) => [element.id, true])))).toEqual(['normal']);
  });

  it('does not recurse forever through invalid frame cycles', () => {
    const elements = [frame('one', 'two'), frame('two', 'one'), { ...bookmark('child'), frameId: 'one' }];
    expect(getSelectedBookmarkIds(elements, { one: true })).toEqual([]);
  });

  it('changes presentation and recommended dimensions while preserving center, angle, groups and metadata', () => {
    const original = {
      ...bookmark('first', 40, 80), frameId: 'frame', groupIds: ['group'], angle: Math.PI / 4,
      customData: { outside: 'preserved', bookmarkAtlas: { ...bookmark('first').customData!.bookmarkAtlas, future: 'kept' } },
    };
    const unchanged = bookmark('other');
    const elements = [original, unchanged];
    const next = setBookmarkPresentation(elements, ['first'], 'detailed');

    expect(next[0]).toMatchObject({ width: 300, height: 168, x: 0, y: 40, frameId: 'frame', groupIds: ['group'], angle: Math.PI / 4 });
    expect(next[0]!.customData).toMatchObject({ outside: 'preserved', bookmarkAtlas: { presentation: 'detailed', future: 'kept' } });
    expect(next[0]!.version).toBe(original.version + 1);
    expect(next[0]!.versionNonce).not.toBe(original.versionNonce);
    expect(next[1]).toBe(unchanged);
    expect(original.width).toBe(220);
    expect(fingerprint(next)).not.toBe(fingerprint(elements));
  });

  it('keeps legacy detailed cards unchanged until an explicit presentation command', () => {
    const created = createBookmarkElement({ id: 'old', type: 'bookmark', title: 'Old', url: 'https://example.com' }, { x: 10, y: 20 }, { id: 'old', presentation: 'detailed' });
    const { presentation: _presentation, ...legacyData } = created.customData!.bookmarkAtlas;
    const legacy = { ...created, customData: { bookmarkAtlas: legacyData } };
    const legacyScene = [legacy];
    const originalFingerprint = fingerprint(legacyScene);
    expect(getBookmarkElementData(legacy)?.presentation).toBeUndefined();
    expect(setBookmarkPresentation(legacyScene, ['old'], 'detailed')).toBe(legacyScene);
    expect(fingerprint(legacyScene)).toBe(originalFingerprint);
    expect(legacy.version).toBe(created.version);
    const next = setBookmarkPresentation(legacyScene, ['old'], 'icon');
    expect(next[0]).toMatchObject({ x: 124, y: 68, width: 72, height: 72 });
    expect(getBookmarkElementData(legacy)?.presentation).toBeUndefined();
  });

  it('returns the same scene on repeated presentation writes, empty selection or unknown ids', () => {
    const elements = [bookmark('first')];
    expect(setBookmarkPresentation(elements, ['first'], 'compact')).toBe(elements);
    expect(setBookmarkPresentation(elements, [], 'icon')).toBe(elements);
    expect(setBookmarkPresentation(elements, ['missing'], 'icon')).toBe(elements);
    const iconScene = setBookmarkPresentation(elements, ['first', 'first'], 'icon');
    expect(iconScene[0]!.version).toBe(elements[0]!.version + 1);
    expect(setBookmarkPresentation(iconScene, ['first'], 'icon')).toBe(iconScene);
  });

  it('preserves manual dimensions and revisions when choosing the already active presentation', () => {
    const original = { ...bookmark('first', 10, 30), width: 400, height: 120 };
    const elements = [original];
    expect(setBookmarkPresentation(elements, ['first'], 'compact')).toBe(elements);
    expect(elements[0]).toBe(original);
    expect(elements[0]).toMatchObject({ x: 10, y: 30, width: 400, height: 120 });

    const next = setBookmarkPresentation(elements, ['first'], 'detailed');
    expect(next[0]).toMatchObject({ x: 60, y: 6, width: 300, height: 168 });
    expect(next[0]!.version).toBe(original.version + 1);
  });

  it('treats a manually scaled historical card as detailed without backfilling presentation', () => {
    const created = bookmark('legacy');
    const { presentation: _presentation, ...legacyData } = created.customData!.bookmarkAtlas;
    const legacy = { ...created, width: 540, height: 260, customData: { bookmarkAtlas: legacyData } };
    const elements = [legacy];
    expect(setBookmarkPresentation(elements, ['legacy'], 'detailed')).toBe(elements);
    expect(getBookmarkElementData(legacy)?.presentation).toBeUndefined();
    expect(legacy).toMatchObject({ width: 540, height: 260, version: created.version, versionNonce: created.versionNonce });
  });

  it('limits descriptions by Unicode code points, preserves ordinary text and updates sync revisions', () => {
    const elements = [bookmark('first')];
    const description = '<b>备注</b>\n' + '😀'.repeat(145);
    const next = setBookmarkDescription(elements, ['first'], description);
    expect(getBookmarkElementData(next[0]!)!.description).toBe(Array.from(description).slice(0, 140).join(''));
    expect(Array.from(getBookmarkElementData(next[0]!)!.description!)).toHaveLength(140);
    expect(getBookmarkElementData(next[0]!)!.description).toContain('<b>备注</b>\n');
    expect(fingerprint(next)).not.toBe(fingerprint(elements));
    expect(setBookmarkDescription(next, ['first'], description)).toBe(next);
    expect(elements[0]!.customData!.bookmarkAtlas.description).toBeUndefined();
  });

  it('supports empty and exactly 140-character descriptions without duplicate writes', () => {
    const elements = [bookmark('first')];
    expect(setBookmarkDescription(elements, ['first'], '')).toBe(elements);
    const next = setBookmarkDescription(elements, ['first'], '中'.repeat(140));
    expect(getBookmarkElementData(next[0]!)?.description).toBe('中'.repeat(140));
    const cleared = setBookmarkDescription(next, ['first'], '');
    expect(getBookmarkElementData(cleared[0]!)?.description).toBe('');
    expect(setBookmarkDescription(cleared, ['first'], '')).toBe(cleared);
  });

  it('protects locked, deleted, foreign elements and locked-frame descendants in every command', () => {
    const foreign = { ...shape('foreign'), customData: bookmark('foreign').customData };
    const elements = [
      { ...bookmark('locked'), locked: true },
      { ...bookmark('deleted'), isDeleted: true },
      foreign,
      { ...frame('locked-parent'), locked: true },
      { ...bookmark('child'), frameId: 'locked-parent' },
    ];
    const ids = elements.map((element) => element.id);
    expect(setBookmarkPresentation(elements, ids, 'detailed')).toBe(elements);
    expect(setBookmarkDescription(elements, ids, 'description')).toBe(elements);
    expect(layoutBookmarkElements(elements, ids)).toBe(elements);
  });

  it('lays out a near-square grid from the selected top-left with 24px gaps and stable scene order', () => {
    const elements = [bookmark('first', 500, 100), bookmark('second', 10, 900), bookmark('third', 200, 300), bookmark('fourth', 300, 500)];
    const ids = ['fourth', 'second', 'first', 'third'];
    const next = layoutBookmarkElements(elements, ids);
    expect(next.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 10, y: 100 }, { x: 10, y: 212 }, { x: 10, y: 324 }, { x: 10, y: 436 },
    ]);
    expect(next.map((element) => element.id)).toEqual(elements.map((element) => element.id));
    expect(layoutBookmarkElements(next, ids)).toBe(next);
    expect(elements[0]!.x).toBe(500);
  });

  it('handles mixed sizes without overlap while retaining frames, groups and non-target references', () => {
    const first = { ...bookmark('first', 40, 60), frameId: 'frame', groupIds: ['group'] };
    const second = createBookmarkElement({ id: 'second', type: 'bookmark', title: 'Second', url: 'https://example.com' }, { x: 600, y: 300 }, { id: 'second', presentation: 'detailed' });
    const drawing = shape('drawing');
    const elements = [first, second, drawing];
    const next = layoutBookmarkElements(elements, ['first', 'second', 'drawing']);
    expect(next[0]).toBe(first);
    expect(next[1]!.y).toBe(first.y + 168 + 24);
    expect(next[0]).toMatchObject({ frameId: 'frame', groupIds: ['group'] });
    expect(next[2]).toBe(drawing);
    expect(fingerprint(next)).not.toBe(fingerprint(elements));
    expect(layoutBookmarkElements(elements, ['first'])).toBe(elements);
  });

  it('accounts for rotated visible bounds when choosing the origin and spacing', () => {
    const elements = [
      { ...bookmark('first', 100, 100), angle: Math.PI / 4 },
      { ...bookmark('second', 300, 500), angle: Math.PI / 2 },
    ];
    const before = getCommonBounds(elements);
    const next = layoutBookmarkElements(elements, ['first', 'second']);
    const firstBounds = getCommonBounds([next[0]!]);
    const secondBounds = getCommonBounds([next[1]!]);
    expect(firstBounds[0]).toBeCloseTo(before[0]);
    expect(firstBounds[1]).toBeCloseTo(before[1]);
    expect(secondBounds[0] - firstBounds[2]).toBeCloseTo(24);
    expect(next.map((element) => element.angle)).toEqual(elements.map((element) => element.angle));
    expect(layoutBookmarkElements(next, ['first', 'second'])).toBe(next);
  });

  it('fits explicitly selected frames around fully targeted contents with 24px padding', () => {
    const container = { ...frame('group'), width: 2_000, height: 2_000, customData: { preserved: true } };
    const first = { ...bookmark('first', 100, 200), frameId: 'group' };
    const second = { ...bookmark('second', 700, 800), frameId: 'group' };
    const elements = [container, first, second, shape('other')];
    const next = layoutBookmarkElements(elements, ['group', 'first', 'second']);

    expect(next[0]).toMatchObject({ x: 76, y: 176, width: 268, height: 248, name: 'group', customData: { preserved: true } });
    expect(next[0]!.version).toBe(container.version + 1);
    expect(next[3]).toBe(elements[3]);
    expect(fingerprint(next)).not.toBe(fingerprint(elements));
    expect(layoutBookmarkElements(next, ['group', 'first', 'second'])).toBe(next);
  });

  it('retains non-explicit frames even when all their bookmark contents are targeted', () => {
    const container = { ...frame('group'), width: 2_000, height: 2_000 };
    const first = { ...bookmark('first', 100, 200), frameId: 'group' };
    const second = { ...bookmark('second', 700, 800), frameId: 'group' };
    const next = layoutBookmarkElements([container, first, second], ['first', 'second']);
    expect(next[0]).toBe(container);
  });

  it('keeps selected frames with unselected bookmarks or other drawings unchanged', () => {
    const container = { ...frame('group'), width: 2_000, height: 2_000 };
    const first = { ...bookmark('first', 100, 200), frameId: 'group' };
    const second = { ...bookmark('second', 700, 800), frameId: 'group' };
    const drawing = { ...shape('drawing'), frameId: 'group' };
    const elements = [container, first, second, drawing];
    const partial = layoutBookmarkElements(elements, ['group', 'first']);
    expect(partial).toBe(elements);
    const withDrawing = layoutBookmarkElements(elements, ['group', 'first', 'second', 'drawing']);
    expect(withDrawing[0]).toBe(container);
    expect(withDrawing[3]).toBe(drawing);
    expect(withDrawing).toBe(elements);
  });

  it('ignores deleted contents but protects locked contents and locked or deleted frames', () => {
    const container = { ...frame('group'), width: 2_000, height: 2_000 };
    const first = { ...bookmark('first', 100, 200), frameId: 'group' };
    const deleted = { ...shape('deleted'), frameId: 'group', isDeleted: true };
    const next = layoutBookmarkElements([container, first, deleted], ['group', 'first']);
    expect(next[0]).toMatchObject({ x: 76, y: 176, width: 268, height: 136 });
    expect(next[1]).toBe(first);
    expect(next[2]).toBe(deleted);

    const locked = { ...bookmark('locked'), frameId: 'group', locked: true };
    const lockedContents = [container, first, locked];
    expect(layoutBookmarkElements(lockedContents, ['group', 'first', 'locked'])).toBe(lockedContents);
    for (const protectedFrame of [{ ...container, locked: true }, { ...container, isDeleted: true }]) {
      const scene = [protectedFrame, first];
      expect(layoutBookmarkElements(scene, ['group', 'first'])).toBe(scene);
    }
  });

  it('fits explicitly selected nested frames from the innermost contents outward', () => {
    const outer = { ...frame('outer'), width: 4_000, height: 4_000 };
    const inner = { ...frame('inner', 'outer'), width: 2_000, height: 2_000 };
    const first = { ...bookmark('first', 100, 200), frameId: 'inner' };
    const elements = [outer, inner, first];
    const next = layoutBookmarkElements(elements, ['outer', 'inner', 'first']);
    expect(next[1]).toMatchObject({ x: 76, y: 176, width: 268, height: 136, frameId: 'outer' });
    expect(next[0]).toMatchObject({ x: 52, y: 152, width: 316, height: 184 });
    expect(next[2]).toBe(first);
    expect(layoutBookmarkElements(next, ['outer', 'inner', 'first'])).toBe(next);

    const outerOnly = layoutBookmarkElements(elements, ['outer', 'first']);
    expect(outerOnly[0]).toMatchObject({ x: 52, y: 152, width: 316, height: 184 });
    expect(outerOnly[1]).toMatchObject({ x: 76, y: 176, width: 268, height: 136 });
  });

  it('fits magicframes and protects frames with non-targeted content in a selected nested frame', () => {
    const outer = { ...frame('outer'), type: 'magicframe' as const, width: 4_000, height: 4_000 };
    const inner = { ...frame('inner', 'outer'), width: 2_000, height: 2_000 };
    const first = { ...bookmark('first', 100, 200), frameId: 'inner' };
    const drawing = { ...shape('drawing'), frameId: 'inner' };
    const scene = [outer, inner, first, drawing];
    expect(layoutBookmarkElements(scene, ['outer', 'inner', 'first', 'drawing'])).toBe(scene);
    const withoutDrawing = layoutBookmarkElements([outer, inner, first], ['outer', 'inner', 'first']);
    expect(withoutDrawing[0]).toMatchObject({ type: 'magicframe', x: 52, y: 152, width: 316, height: 184 });
  });

  it('lays out separate frames inside their existing regions without mixing or overlapping them', () => {
    const left = { ...frame('left'), x: 0, y: 0, width: 800, height: 800 };
    const right = { ...frame('right'), x: 1_000, y: 0, width: 800, height: 800 };
    const cards = [
      { ...bookmark('left-one', 40, 60), frameId: 'left' },
      { ...bookmark('left-two', 400, 500), frameId: 'left' },
      { ...bookmark('right-one', 1_040, 60), frameId: 'right' },
      { ...bookmark('right-two', 1_400, 500), frameId: 'right' },
    ];
    const scene = [left, right, ...cards];
    const next = layoutBookmarkElements(scene, scene.map((element) => element.id));
    const nextLeft = next[0]!;
    const nextRight = next[1]!;
    expect(nextLeft.x + nextLeft.width).toBeLessThanOrEqual(nextRight.x);
    for (const card of next.slice(2)) {
      const container = card.frameId === 'left' ? nextLeft : nextRight;
      expect(card.x).toBeGreaterThanOrEqual(container.x);
      expect(card.y).toBeGreaterThanOrEqual(container.y);
      expect(card.x + card.width).toBeLessThanOrEqual(container.x + container.width);
      expect(card.y + card.height).toBeLessThanOrEqual(container.y + container.height);
    }
    expect(next[4]!.x).toBeGreaterThanOrEqual(1_000);
  });

  it('recursively lays out nested contents in their own frame when only the outer frame is explicit', () => {
    const outer = { ...frame('outer'), width: 1_600, height: 1_400 };
    const inner = { ...frame('inner', 'outer'), x: 500, y: 400, width: 800, height: 800 };
    const first = { ...bookmark('first', 540, 460), frameId: 'inner' };
    const second = { ...bookmark('second', 900, 900), frameId: 'inner' };
    const direct = { ...bookmark('direct', 40, 60), frameId: 'outer' };
    const scene = [outer, inner, first, second, direct];
    const next = layoutBookmarkElements(scene, ['outer', 'first', 'second', 'direct']);
    const nextInner = next[1]!;
    expect(nextInner).not.toBe(inner);
    for (const card of next.slice(2, 4)) {
      expect(card.x).toBeGreaterThanOrEqual(nextInner.x);
      expect(card.y).toBeGreaterThanOrEqual(nextInner.y);
      expect(card.x + card.width).toBeLessThanOrEqual(nextInner.x + nextInner.width);
      expect(card.y + card.height).toBeLessThanOrEqual(nextInner.y + nextInner.height);
    }
    expect(next[4]).toBe(direct);
    expect(layoutBookmarkElements(next, ['outer', 'first', 'second', 'direct'])).toBe(next);
  });

  it('preserves an entire framed region when any live descendant is unselected or locked', () => {
    const outer = { ...frame('outer'), width: 1_600, height: 1_400 };
    const inner = { ...frame('inner', 'outer'), x: 500, y: 400, width: 800, height: 800 };
    const first = { ...bookmark('first', 540, 460), frameId: 'inner' };
    const second = { ...bookmark('second', 900, 900), frameId: 'inner' };
    const unselected = { ...bookmark('unselected', 40, 60), frameId: 'outer' };
    const scene = [outer, inner, first, second, unselected];
    expect(layoutBookmarkElements(scene, ['outer', 'inner', 'first', 'second'])).toBe(scene);
    const lockedScene = [outer, inner, first, { ...second, locked: true }];
    expect(layoutBookmarkElements(lockedScene, ['outer', 'inner', 'first', 'second'])).toBe(lockedScene);
  });

  it('chooses a fitting column count instead of clipping a short unselected frame', () => {
    const container = { ...frame('group'), width: 600, height: 180 };
    const first = { ...bookmark('first', 20, 20), frameId: 'group' };
    const second = { ...bookmark('second', 300, 20), frameId: 'group' };
    const scene = [container, first, second];
    const next = layoutBookmarkElements(scene, ['first', 'second']);
    expect(next[0]).toBe(container);
    expect(next[1]).toBe(first);
    expect(next[2]).toMatchObject({ x: 264, y: 20 });
    expect(next[2]!.y + next[2]!.height).toBeLessThanOrEqual(container.height);
  });

  it('avoids nested frame regions when laying out direct cards in their parent', () => {
    const outer = { ...frame('outer'), width: 1_000, height: 1_000 };
    const inner = { ...frame('inner', 'outer'), x: 0, y: 200, width: 250, height: 250 };
    const nested = { ...bookmark('nested', 15, 230), frameId: 'inner' };
    const first = { ...bookmark('first', 20, 20), frameId: 'outer' };
    const second = { ...bookmark('second', 400, 600), frameId: 'outer' };
    const scene = [outer, inner, nested, first, second];
    const next = layoutBookmarkElements(scene, ['outer', 'nested', 'first', 'second']);
    expect(next[3]).toBe(first);
    expect(next[4]).toMatchObject({ x: 264, y: 20 });
    expect(next[4]!.y + next[4]!.height).toBeLessThan(inner.y);
  });

  it('leaves a region unchanged if no grid fits and never expands it into a sibling frame', () => {
    const container = { ...frame('group'), width: 300, height: 160 };
    const sibling = { ...frame('sibling'), x: 350, width: 500, height: 500 };
    const first = { ...bookmark('first', 20, 20), frameId: 'group' };
    const second = { ...bookmark('second', 20, 100), frameId: 'group' };
    const scene = [container, sibling, first, second];
    expect(layoutBookmarkElements(scene, ['group', 'first', 'second'])).toBe(scene);
  });
});
