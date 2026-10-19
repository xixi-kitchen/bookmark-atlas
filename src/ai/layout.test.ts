import { convertToExcalidrawElements, getCommonBounds } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawFrameElement } from '@excalidraw/excalidraw/element/types';
import { describe, expect, it } from 'vitest';
import { createBookmarkElement, getBookmarkElementData } from '../excalidraw/bookmarkElements';
import { createSceneSyncFingerprint } from '../excalidraw/sceneSync';
import { buildAIOrganizationPreview } from './layout';
import { AIError, type OrganizationPlan } from './plan';

function bookmark(id: string, x = 0, y = 0) {
  return createBookmarkElement({ id, title: id, type: 'bookmark', url: `https://example.com/${id}?private=query#secret` }, { x, y }, { id });
}

function drawing(id: string, x = 0, y = 0, width = 100, height = 100): ExcalidrawElement {
  return convertToExcalidrawElements([{ type: 'rectangle', id, x, y, width, height }], { regenerateIds: false })[0]!;
}

function frame(id: string): ExcalidrawFrameElement {
  return { ...drawing(id, 0, 0, 800, 800), type: 'frame', name: 'Original frame' } as ExcalidrawFrameElement;
}

function fingerprint(elements: readonly ExcalidrawElement[]) {
  return createSceneSyncFingerprint({ version: 2, elements, appState: {}, files: {}, libraryItems: [], savedAt: 0 });
}

function geometry(elements: readonly ExcalidrawElement[]) {
  return elements.map(({ id, type, x, y, width, height, frameId }) => ({ id, type, x, y, width, height, frameId }));
}

function expectInvalid(action: () => unknown) {
  expect(action).toThrow(AIError);
  try { action(); } catch (error) { expect((error as AIError).code).toBe('invalid_plan'); }
}

describe('AI organization local layout', () => {
  it('keeps original frames, unselected graphics and omitted selected bookmarks unchanged', () => {
    const originalFrame = frame('original');
    const first = { ...bookmark('first', 40, 60), frameId: 'original', groupIds: ['handmade-group'], customData: { future: true, bookmarkAtlas: bookmark('first').customData!.bookmarkAtlas } };
    const omitted = { ...bookmark('omitted', 400, 500), frameId: 'original' };
    const foreign = drawing('drawing', 1_000, 200);
    const unselected = bookmark('unselected', -300, 600);
    const elements = [originalFrame, first, omitted, foreign, unselected];
    const snapshot = JSON.stringify(elements);
    const result = buildAIOrganizationPreview(elements, ['first', 'omitted'], { groups: [{ title: 'Research', items: [{ id: 'first' }] }] }, 'request');
    const next = new Map(result.elements.map((element) => [element.id, element]));

    expect(result.ids).toEqual(['request-group-1', 'first']);
    expect(result.elements[0]!.id).toBe('request-group-1');
    expect(next.get('original')).toBe(originalFrame);
    expect(next.get('omitted')).toBe(omitted);
    expect(next.get('drawing')).toBe(foreign);
    expect(next.get('unselected')).toBe(unselected);
    expect(next.get('first')).toMatchObject({ frameId: 'request-group-1', groupIds: ['handmade-group'], link: first.link, customData: { future: true } });
    expect(getBookmarkElementData(next.get('first')!)?.url).toBe(getBookmarkElementData(first)?.url);
    expect(JSON.stringify(elements)).toBe(snapshot);
  });

  it('places every new group to the right of all visible objects and aligns the group grid to selection top', () => {
    const first = bookmark('first', -100, -50);
    const second = bookmark('second', 100, 200);
    const third = bookmark('third', 300, 600);
    const visible = drawing('far-right', 3_000, -200, 300, 200);
    const deleted = { ...drawing('deleted', 20_000, 30_000), isDeleted: true };
    const elements = [first, second, third, visible, deleted];
    const plan: OrganizationPlan = { groups: ['first', 'second', 'third'].map((id) => ({ title: id, items: [{ id }] })) };
    const result = buildAIOrganizationPreview(elements, ['first', 'second', 'third'], plan, 'request');
    const frames = result.elements.filter((element) => element.type === 'frame');
    expect(frames[0]).toMatchObject({ x: 3_396, y: -50 });
    expect(frames.every((element) => element.x >= 3_396)).toBe(true);
    expect(result.elements.find((element) => element.id === 'deleted')).toBe(deleted);

    frames.forEach((firstFrame, index) => frames.slice(index + 1).forEach((secondFrame) => {
      const horizontalGap = Math.max(firstFrame.x - secondFrame.x - secondFrame.width, secondFrame.x - firstFrame.x - firstFrame.width);
      const verticalGap = Math.max(firstFrame.y - secondFrame.y - secondFrame.height, secondFrame.y - firstFrame.y - firstFrame.height);
      expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(96);
    }));
  });

  it('computes repeatable geometry and request-prefixed ids without mutating frozen inputs', () => {
    const first = bookmark('first', 10, 20);
    const second = bookmark('second', 500, 600);
    const elements = [first, second];
    const plan: OrganizationPlan = { groups: [{ title: 'Tools', items: [{ id: 'second', presentation: 'icon' }, { id: 'first', presentation: 'detailed' }] }] };
    Object.freeze(elements);
    Object.freeze(first);
    Object.freeze(second);
    const firstResult = buildAIOrganizationPreview(elements, ['first', 'second'], plan, 'stable');
    const secondResult = buildAIOrganizationPreview(elements, ['first', 'second'], plan, 'stable');
    expect(geometry(firstResult.elements)).toEqual(geometry(secondResult.elements));
    expect(firstResult.ids).toEqual(secondResult.ids);
    expect(firstResult.elements[0]).toMatchObject({ type: 'frame', name: 'Tools', id: 'stable-group-1' });
  });

  it('applies validated descriptions and presentation through versioned commands', () => {
    const original = bookmark('first', 10, 20);
    const elements = [original];
    const description = '😀'.repeat(140);
    const result = buildAIOrganizationPreview(elements, ['first'], { groups: [{ title: 'Tools', items: [{ id: 'first', presentation: 'detailed', description }] }] }, 'request');
    const card = result.elements.find((element) => element.id === 'first')!;
    expect(card).toMatchObject({ width: 300, height: 168, frameId: 'request-group-1' });
    expect(getBookmarkElementData(card)).toMatchObject({ presentation: 'detailed', description });
    expect(card.version).toBeGreaterThan(original.version);
    expect(card.versionNonce).not.toBe(original.versionNonce);
    expect(fingerprint(result.elements)).not.toBe(fingerprint(elements));
    expect(getBookmarkElementData(original)?.presentation).toBe('compact');
    expect(getBookmarkElementData(original)?.description).toBeUndefined();
  });

  it('preserves manually resized dimensions for the same presentation and fits rotated cards', () => {
    const first = { ...bookmark('first', 10, 20), width: 400, height: 120, angle: Math.PI / 4 };
    const second = { ...bookmark('second', 200, 500), angle: Math.PI / 2 };
    const elements = [first, second];
    const result = buildAIOrganizationPreview(elements, ['first', 'second'], { groups: [{ title: 'Mixed', items: [{ id: 'first', presentation: 'compact' }, { id: 'second', presentation: 'icon' }] }] }, 'request');
    const container = result.elements[0]!;
    const firstCard = result.elements.find((element) => element.id === 'first')!;
    expect(firstCard).toMatchObject({ width: 400, height: 120, angle: Math.PI / 4 });
    for (const card of result.elements.slice(1)) {
      const [left, top, right, bottom] = getCommonBounds([card]);
      expect(left).toBeGreaterThanOrEqual(container.x + 24 - 1e-8);
      expect(top).toBeGreaterThanOrEqual(container.y + 24 - 1e-8);
      expect(right).toBeLessThanOrEqual(container.x + container.width - 24 + 1e-8);
      expect(bottom).toBeLessThanOrEqual(container.y + container.height - 24 + 1e-8);
    }
  });

  it.each(['locked', 'deleted', 'unknown', 'drawing', 'locked-parent'] as const)('rejects %s planned targets', (kind) => {
    const original = bookmark('first');
    const elements: ExcalidrawElement[] = kind === 'locked' ? [{ ...original, locked: true }]
      : kind === 'deleted' ? [{ ...original, isDeleted: true }]
        : kind === 'unknown' ? []
          : kind === 'drawing' ? [drawing('first')]
            : [{ ...frame('parent'), locked: true }, { ...original, frameId: 'parent' }];
    const snapshot = JSON.stringify(elements);
    expectInvalid(() => buildAIOrganizationPreview(elements, ['first'], { groups: [{ title: 'Tools', items: [{ id: 'first' }] }] }, 'request'));
    expect(JSON.stringify(elements)).toBe(snapshot);
  });

  it('rejects ids outside the selection, duplicate planned ids and malformed plans', () => {
    const elements = [bookmark('first'), bookmark('second')];
    expectInvalid(() => buildAIOrganizationPreview(elements, ['first'], { groups: [{ title: 'Tools', items: [{ id: 'second' }] }] }, 'request'));
    expectInvalid(() => buildAIOrganizationPreview(elements, ['first'], { groups: [{ title: 'Tools', items: [{ id: 'first' }, { id: 'first' }] }] }, 'request'));
    expectInvalid(() => buildAIOrganizationPreview(elements, ['first'], { groups: [{ title: 'Tools', items: [{ id: 'first', description: '中'.repeat(141) }] }] }, 'request'));
    expectInvalid(() => buildAIOrganizationPreview(elements, ['first'], { groups: [] }, 'request'));
  });

  it('rejects empty request ids and collisions with either active or deleted scene ids', () => {
    const original = bookmark('first');
    const plan: OrganizationPlan = { groups: [{ title: 'Tools', items: [{ id: 'first' }] }] };
    expectInvalid(() => buildAIOrganizationPreview([original], ['first'], plan, ' '));
    for (const isDeleted of [false, true]) {
      const collision = { ...drawing('request-group-1'), isDeleted };
      expectInvalid(() => buildAIOrganizationPreview([original, collision], ['first'], plan, 'request'));
    }
  });
});
