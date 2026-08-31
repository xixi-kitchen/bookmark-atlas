import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { normalizeBookmarkTree } from '../../src/bookmarks/normalize';
import type { ChromeBookmarkTreeNode } from '../../src/bookmarks/types';
import { autoLayout } from '../../src/canvas/layout';

describe('large bookmark collections', () => {
  it('normalizes 5,000 bookmarks without losing nodes', () => {
    const children: ChromeBookmarkTreeNode[] = Array.from({ length: 50 }, (_, folderIndex) => ({
      id: `folder-${folderIndex}`,
      parentId: '1',
      title: `Folder ${folderIndex}`,
      children: Array.from({ length: 99 }, (_, itemIndex) => ({
        id: `item-${folderIndex}-${itemIndex}`,
        parentId: `folder-${folderIndex}`,
        title: `Item ${folderIndex}-${itemIndex}`,
        url: `https://example.com/${folderIndex}/${itemIndex}`,
      })),
    }));
    const tree: ChromeBookmarkTreeNode[] = [{ id: '0', title: '', children: [{ id: '1', parentId: '0', title: 'Bookmarks Bar', children }] }];

    const started = performance.now();
    const normalized = normalizeBookmarkTree(tree);
    const elapsed = performance.now() - started;

    expect(normalized.orderedIds).toHaveLength(5_002);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('lays out a 1,000-node hierarchy within a practical smoke-test budget', () => {
    const nodes: Node[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index), position: { x: 0, y: 0 }, data: {},
    }));
    const edges: Edge[] = nodes.slice(1).map((node, index) => ({
      id: `e-${node.id}`, source: String(Math.floor(index / 10)), target: node.id,
    }));

    const started = performance.now();
    const result = autoLayout(nodes, edges, 'sm');
    const elapsed = performance.now() - started;

    expect(result).toHaveLength(1_000);
    expect(elapsed).toBeLessThan(5_000);
  });
});
