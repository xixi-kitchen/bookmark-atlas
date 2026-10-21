import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawFrameElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types';
import { describe, expect, it } from 'vitest';
import { createBookmarkElement } from '../excalidraw/bookmarkElements';
import type { LearningEvent } from './learningEvents';
import { createCanvasLearningSignals } from './canvasLearningSignals';

function bookmark(id: string, x = 0, y = 0) {
  return createBookmarkElement({ id, title: id, type: 'bookmark', url: `https://example.com/${id}` }, { x, y }, { id });
}

function drawing(id: string): ExcalidrawElement {
  return convertToExcalidrawElements([{ type: 'rectangle', id, x: 0, y: 0, width: 100, height: 100 }], { regenerateIds: false })[0]!;
}

function setup() {
  const events: LearningEvent[] = [];
  return { events, signals: createCanvasLearningSignals((event) => events.push(event)) };
}

describe('canvas learning signals', () => {
  it('waits for successful persistence of every imported live bookmark', () => {
    const { events, signals } = setup();
    const first = bookmark('first');
    const second = bookmark('second');
    signals.queueImport(['first', 'second']);
    signals.pointerDown([first, second]);
    signals.pointerUp([first, second], 1);
    expect(events).toEqual([]);
    signals.persisted([first]);
    expect(events).toEqual([]);
    signals.persisted([first, second]);
    signals.persisted([first, second]);
    expect(events).toEqual([{ type: 'bookmark-added', count: 2 }]);
  });

  it('allows an explicitly queued existing card once and deduplicates queued IDs', () => {
    const { events, signals } = setup();
    const card = bookmark('existing');
    signals.persisted([card]);
    expect(events).toEqual([]);
    signals.queueImport(['existing', 'existing']);
    signals.persisted([card]);
    signals.persisted([card]);
    signals.queueImport(['existing']);
    signals.persisted([card]);
    expect(events).toEqual([{ type: 'bookmark-added', count: 1 }, { type: 'bookmark-added', count: 1 }]);
  });

  it('rejects deleted cards and non-native drawings carrying bookmark data', () => {
    const { events, signals } = setup();
    const card = bookmark('queued');
    signals.queueImport(['queued']);
    signals.persisted([{ ...card, isDeleted: true }]);
    signals.persisted([{ ...drawing('queued'), customData: card.customData }]);
    signals.queueImport([]);
    signals.persisted([]);
    expect(events).toEqual([]);
    signals.persisted([card]);
    expect(events).toEqual([{ type: 'bookmark-added', count: 1 }]);
  });

  it.each(['layout-applied', 'ai-applied'] as const)('waits for the expected durable scene before emitting %s', (type) => {
    const { events, signals } = setup();
    const original = bookmark('card');
    const expected = { ...original, x: 300, frameId: 'frame' };
    signals.queueCommit({ type }, [expected]);
    signals.persisted([original]);
    signals.persisted([{ ...expected, isDeleted: true }]);
    signals.persisted([expected, drawing('unrelated')]);
    expect(events).toEqual([]);
    signals.persisted([{ ...expected, version: expected.version + 1, versionNonce: 123, updated: 987 }]);
    signals.persisted([expected]);
    expect(events).toEqual([{ type }]);
  });

  it('replaces stale pending commits and ignores non-commit event kinds', () => {
    const { events, signals } = setup();
    const oldScene = [bookmark('old')];
    const latestScene = [bookmark('latest')];
    signals.queueCommit({ type: 'layout-applied' }, oldScene);
    signals.queueCommit({ type: 'ai-applied', count: 2 }, latestScene);
    signals.queueCommit({ type: 'bookmark-opened' }, oldScene);
    signals.persisted(oldScene);
    expect(events).toEqual([]);
    signals.persisted(latestScene);
    expect(events).toEqual([{ type: 'ai-applied', count: 2 }]);
  });

  it('compares frame and text contents, geometry, relationships and bookmark custom data', () => {
    const { events, signals } = setup();
    const frame = { ...drawing('frame'), type: 'frame', name: 'Tools' } as ExcalidrawFrameElement;
    const text = { ...drawing('label'), type: 'text', text: 'Tools', originalText: 'Tools', fontSize: 20, fontFamily: 1,
      textAlign: 'left', verticalAlign: 'top', containerId: null, autoResize: true, lineHeight: 1.25 } as ExcalidrawTextElement;
    const card = { ...bookmark('card'), frameId: frame.id, boundElements: [{ type: 'text' as const, id: text.id }] };
    const expected: ExcalidrawElement[] = [frame, card, text];
    signals.queueCommit({ type: 'ai-applied' }, expected);
    for (const wrong of [
      [{ ...frame, name: 'Wrong' }, card, text],
      [{ ...frame, width: frame.width + 1 }, card, text],
      [frame, { ...card, frameId: null }, text],
      [frame, { ...card, boundElements: null }, text],
      [frame, { ...card, customData: {} }, text],
      [frame, card, { ...text, text: 'Wrong' }],
      [frame, card, { ...text, x: text.x + 1 }],
    ]) signals.persisted(wrong);
    expect(events).toEqual([]);
    signals.persisted(expected.map((element) => ({ ...element, version: element.version + 10, versionNonce: 99, updated: 999 })));
    expect(events).toEqual([{ type: 'ai-applied' }]);
  });

  it('snapshots queued scenes instead of following later caller mutations', () => {
    const { events, signals } = setup();
    const card = bookmark('card');
    signals.queueCommit({ type: 'layout-applied' }, [card]);
    Object.assign(card, { x: 400 });
    signals.persisted([card]);
    expect(events).toEqual([]);
    signals.persisted([{ ...card, x: 0 }]);
    expect(events).toEqual([{ type: 'layout-applied' }]);
  });

  it('emits movement only after the original live bookmark gesture is persisted', () => {
    const { events, signals } = setup();
    const card = bookmark('card');
    const shape = drawing('shape');
    signals.pointerDown([card, shape]);
    signals.pointerUp([card, { ...shape, x: 500 }, bookmark('new', 100)], 1);
    signals.pointerDown([card]);
    signals.pointerUp([{ ...card, x: 200, isDeleted: true }], 1);
    expect(events).toEqual([]);
    signals.pointerDown([card]);
    signals.pointerUp([{ ...card, x: 100 }], 1);
    expect(events).toEqual([]);
    signals.persisted([{ ...card, x: 200 }]);
    expect(events).toEqual([]);
    signals.persisted([{ ...card, x: 100 }]);
    signals.persisted([{ ...card, x: 100 }]);
    signals.pointerUp([{ ...card, x: 200 }], 1);
    expect(events).toEqual([{ type: 'bookmark-moved' }]);
  });

  it('cancels pending movement before an incoming matching scene is persisted', () => {
    const { events, signals } = setup();
    const card = bookmark('card');
    const moved = { ...card, x: 100 };
    signals.pointerDown([card]);
    signals.pointerUp([moved], 1);
    expect(events).toEqual([]);
    signals.cancelPointer();
    signals.persisted([moved]);
    expect(events).toEqual([]);
  });

  it('suppresses a cancelled gesture after an incoming scene changes positions', () => {
    const { events, signals } = setup();
    const card = bookmark('card');
    signals.pointerDown([card]);
    signals.cancelPointer();
    signals.pointerUp([{ ...card, x: 900 }], 2);
    expect(events).toEqual([]);
  });

  it('requires a genuine pointer gesture and two selected bookmarks for selection', () => {
    const { events, signals } = setup();
    signals.pointerUp([], 2);
    signals.pointerDown([]);
    signals.pointerUp([bookmark('new', 30)], 1);
    expect(events).toEqual([]);
    signals.pointerDown([]);
    signals.pointerUp([], 2);
    expect(events).toEqual([{ type: 'bookmarks-selected', count: 2 }]);
  });
});
