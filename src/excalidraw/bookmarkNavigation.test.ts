import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forwardBookmarkPointerDown,
  getBookmarkDisplayUrl,
  getSafeBookmarkUrl,
  hitBookmarkIcon,
  isBookmarkClickGesture,
  isRepeatedBookmarkClick,
  type BookmarkPointer,
} from './bookmarkNavigation';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

const pointer = (overrides: Partial<BookmarkPointer> = {}): BookmarkPointer => ({ clientX: 100, clientY: 100, button: 0, pointerId: 1, ...overrides });

describe('bookmark favicon hit testing', () => {
  const detailed = { x: 100, y: 200, width: 300, height: 168 };

  it('uses the detailed template for historic cards and rejects title or empty card space', () => {
    expect(hitBookmarkIcon({ x: 119, y: 219 }, detailed)).toBe(true);
    expect(hitBookmarkIcon({ x: 155, y: 255 }, detailed)).toBe(true);
    expect(hitBookmarkIcon({ x: 118, y: 219 }, detailed)).toBe(false);
    expect(hitBookmarkIcon({ x: 180, y: 219 }, detailed)).toBe(false);
    expect(hitBookmarkIcon({ x: 130, y: 300 }, detailed)).toBe(false);
  });

  it('centers compact favicons vertically using actual manually resized dimensions', () => {
    const bounds = { x: 20, y: 30, width: 400, height: 160 };
    expect(hitBookmarkIcon({ x: 35, y: 92 }, bounds, 'compact')).toBe(true);
    expect(hitBookmarkIcon({ x: 71, y: 128 }, bounds, 'compact')).toBe(true);
    expect(hitBookmarkIcon({ x: 35, y: 91 }, bounds, 'compact')).toBe(false);
    expect(hitBookmarkIcon({ x: 72, y: 110 }, bounds, 'compact')).toBe(false);
  });

  it('uses only the centered favicon in icon mode, preserving card padding for selection', () => {
    const bounds = { x: -30, y: -10, width: 72, height: 72 };
    expect(hitBookmarkIcon({ x: -15, y: 5 }, bounds, 'icon')).toBe(true);
    expect(hitBookmarkIcon({ x: 27, y: 47 }, bounds, 'icon')).toBe(true);
    expect(hitBookmarkIcon({ x: -30, y: -10 }, bounds, 'icon')).toBe(false);
    expect(hitBookmarkIcon({ x: 42, y: 62 }, bounds, 'icon')).toBe(false);
    expect(hitBookmarkIcon({ x: 43, y: 62 }, bounds, 'icon')).toBe(false);
  });

  it.each([Math.PI / 2, -Math.PI / 4, Math.PI])('unrotates around the element center for angle %s', (angle) => {
    const local = { x: 30, y: 30 };
    const dx = local.x - detailed.width / 2;
    const dy = local.y - detailed.height / 2;
    const point = {
      x: detailed.x + detailed.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: detailed.y + detailed.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
    expect(hitBookmarkIcon(point, { ...detailed, angle }, 'detailed')).toBe(true);
    expect(hitBookmarkIcon({ x: detailed.x + detailed.width / 2, y: detailed.y + detailed.height / 2 }, { ...detailed, angle }, 'detailed')).toBe(false);
  });

  it('clips the icon hit area to the actual card and rejects invalid geometry', () => {
    const shrunk = { x: 0, y: 0, width: 30, height: 30 };
    expect(hitBookmarkIcon({ x: 25, y: 25 }, shrunk)).toBe(true);
    expect(hitBookmarkIcon({ x: 40, y: 25 }, shrunk)).toBe(false);
    expect(hitBookmarkIcon({ x: NaN, y: 25 }, detailed)).toBe(false);
    expect(hitBookmarkIcon({ x: 120, y: 220 }, { ...detailed, width: 0 })).toBe(false);
    expect(hitBookmarkIcon({ x: 120, y: 220 }, { ...detailed, angle: Infinity })).toBe(false);
  });
});

describe('bookmark click gestures', () => {
  it('accepts exactly six screen pixels, using Euclidean distance', () => {
    expect(isBookmarkClickGesture(pointer(), pointer())).toBe(true);
    expect(isBookmarkClickGesture(pointer(), pointer({ clientX: 106 }))).toBe(true);
    expect(isBookmarkClickGesture(pointer(), pointer({ clientX: 106.01 }))).toBe(false);
    expect(isBookmarkClickGesture(pointer(), pointer({ clientX: 105, clientY: 105 }))).toBe(false);
  });

  it.each([0.2, 1, 2])('keeps a six-screen-pixel threshold at zoom %s', (zoom) => {
    const sceneMotion = 5.9 / zoom;
    expect(isBookmarkClickGesture(pointer(), pointer({ clientX: 100 + sceneMotion * zoom }))).toBe(true);
    expect(isBookmarkClickGesture(pointer(), pointer({ clientX: 100 + 6.1 / zoom * zoom }))).toBe(false);
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)('preserves %s auxiliary selection at either end', (modifier) => {
    expect(isBookmarkClickGesture(pointer({ [modifier]: true }), pointer())).toBe(false);
    expect(isBookmarkClickGesture(pointer(), pointer({ [modifier]: true }))).toBe(false);
  });

  it('rejects non-left buttons, different pointers and browser double-click detail', () => {
    for (const button of [1, 2, -1]) {
      expect(isBookmarkClickGesture(pointer({ button }), pointer())).toBe(false);
      expect(isBookmarkClickGesture(pointer(), pointer({ button }))).toBe(false);
    }
    expect(isBookmarkClickGesture(pointer(), pointer({ pointerId: 2 }))).toBe(false);
    expect(isBookmarkClickGesture(pointer({ detail: 2 }), pointer())).toBe(false);
    expect(isBookmarkClickGesture(pointer(), pointer({ detail: 2 }))).toBe(false);
    expect(isBookmarkClickGesture(pointer(), pointer({ clientY: Infinity }))).toBe(false);
  });

  it('can reject a drag which returned near its start before pointerup', () => {
    expect(isBookmarkClickGesture(pointer(), pointer(), 30)).toBe(false);
    expect(isBookmarkClickGesture(pointer(), pointer(), 6)).toBe(true);
    expect(isBookmarkClickGesture(pointer(), pointer(), NaN)).toBe(false);
    expect(isBookmarkClickGesture(pointer(), pointer(), -1)).toBe(false);
  });
});

describe('safe bookmark navigation', () => {
  it('labels URLs without credentials, search or hash, even when the original is invalid', () => {
    expect(getBookmarkDisplayUrl('https://me:secret@www.example.com:8443/path/to/item?token=secret#private')).toBe('example.com:8443/path/to/item');
    expect(getBookmarkDisplayUrl('https://www.example.com/?key=private')).toBe('example.com');
    expect(getBookmarkDisplayUrl('javascript:alert(1)')).toBe('');
    expect(getBookmarkDisplayUrl('not a url')).toBe('');
  });
  it('normalizes absolute HTTP(S) URLs without losing path, query or fragment', () => {
    expect(getSafeBookmarkUrl(' https://Example.com/a?q=世界#note ')).toBe('https://example.com/a?q=%E4%B8%96%E7%95%8C#note');
    expect(getSafeBookmarkUrl('http://localhost:8080')).toBe('http://localhost:8080/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,a', 'chrome://settings', 'file:///tmp/a', '//example.com', '/relative', 'not a url', '', 'https://exam\nple.com', null, 42])('rejects non-web or malformed target %s', (raw) => {
    expect(getSafeBookmarkUrl(raw)).toBeNull();
  });

  it('suppresses the same target within a double-click interval without suppressing other targets', () => {
    const previous = { elementId: 'a', timeStamp: 1000 };
    expect(isRepeatedBookmarkClick(previous, { elementId: 'a', timeStamp: 1500 })).toBe(true);
    expect(isRepeatedBookmarkClick(previous, { elementId: 'a', timeStamp: 1501 })).toBe(false);
    expect(isRepeatedBookmarkClick(previous, { elementId: 'b', timeStamp: 1100 })).toBe(false);
    expect(isRepeatedBookmarkClick(previous, { elementId: 'a', timeStamp: 900 })).toBe(false);
    expect(isRepeatedBookmarkClick(null, previous)).toBe(false);
    expect(isRepeatedBookmarkClick(previous, { elementId: 'a', timeStamp: NaN })).toBe(false);
  });
});

describe('custom embeddable DOM-to-native canvas bridge', () => {
  it('forwards only pointerdown to the same Excalidraw canvas, preserving drag and drawing inputs', () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, options: PointerEventInit = {}) {
        super(type, options);
        this.pointerId = options.pointerId ?? 0;
        this.pointerType = options.pointerType ?? 'mouse';
      }
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    // The real library renders the embeddable in a sibling of its interactive
    // canvas. Bubbling through the card alone cannot reach canvas.onPointerDown.
    document.body.innerHTML = '<div class="excalidraw"><canvas class="excalidraw__canvas interactive"></canvas><div class="excalidraw__embeddable-container"><a>icon</a></div></div><div class="excalidraw"><canvas class="excalidraw__canvas interactive"></canvas></div>';
    const target = document.querySelector('a')!;
    const canvases = document.querySelectorAll('canvas');
    const received = vi.fn();
    const unrelated = vi.fn();
    canvases[0]!.addEventListener('pointerdown', received);
    canvases[1]!.addEventListener('pointerdown', unrelated);
    const event = new TestPointerEvent('pointerdown', { clientX: 123, clientY: 98, button: 0, buttons: 1, pointerId: 7, pointerType: 'pen', shiftKey: true });
    expect(forwardBookmarkPointerDown(target, event as PointerEvent)).toBe(true);
    expect(received).toHaveBeenCalledOnce();
    const forwarded = received.mock.calls[0]![0] as PointerEvent;
    expect(forwarded).toMatchObject({ clientX: 123, clientY: 98, buttons: 1, button: 0, pointerId: 7, pointerType: 'pen', shiftKey: true });
    expect(forwarded.target).toBe(canvases[0]);
    expect(unrelated).not.toHaveBeenCalled();
    expect(forwardBookmarkPointerDown(document.body, event as PointerEvent)).toBe(false);
  });
});
