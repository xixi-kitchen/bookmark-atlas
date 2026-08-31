import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { autoLayout } from '../../src/canvas/layout';

describe('autoLayout', () => {
  it('creates stable finite positions for a hierarchy', () => {
    const nodes: Node[] = [
      { id: 'root', position: { x: 0, y: 0 }, data: {} },
      { id: 'child-a', position: { x: 0, y: 0 }, data: {} },
      { id: 'child-b', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'a', source: 'root', target: 'child-a' },
      { id: 'b', source: 'root', target: 'child-b' },
    ];

    const result = autoLayout(nodes, edges, 'md');

    expect(result).toHaveLength(3);
    expect(result.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    expect(result.find((node) => node.id === 'root')!.position.x).toBeLessThan(
      result.find((node) => node.id === 'child-a')!.position.x,
    );
  });
});
