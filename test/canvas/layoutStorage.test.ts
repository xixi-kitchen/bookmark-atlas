import { beforeEach, describe, expect, it } from 'vitest';
import { loadCanvasLayout, remapCanvasLayoutIds, saveCanvasPositions, saveCanvasViewport } from '../../src/canvas/layoutStorage';

describe('canvas layout storage', () => {
  beforeEach(() => localStorage.clear());

  it('persists positions and viewport without replacing either part', async () => {
    await saveCanvasPositions({ a: { x: 10, y: 20 } });
    await saveCanvasViewport({ x: 4, y: 8, zoom: 0.75 });

    await expect(loadCanvasLayout()).resolves.toEqual({
      positions: { a: { x: 10, y: 20 } },
      viewport: { x: 4, y: 8, zoom: 0.75 },
    });
  });

  it('moves saved positions from deleted ids to restored ids', async () => {
    await saveCanvasPositions({ old: { x: 30, y: 40 }, untouched: { x: 1, y: 2 } });
    await remapCanvasLayoutIds({ old: 'restored' });

    expect((await loadCanvasLayout()).positions).toEqual({
      restored: { x: 30, y: 40 },
      untouched: { x: 1, y: 2 },
    });
  });
});
