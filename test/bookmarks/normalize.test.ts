import { describe, expect, it } from 'vitest';
import { normalizeBookmarkTree } from '../../src/bookmarks/normalize';
import type { ChromeBookmarkTreeNode } from '../../src/bookmarks/types';

describe('normalizeBookmarkTree', () => {
  it('flattens bookmark trees and marks root, system, and managed nodes readonly', () => {
    const rawTree: ChromeBookmarkTreeNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            parentId: '0',
            index: 0,
            title: 'Bookmarks Bar',
            folderType: 'bookmarks-bar',
            children: [
              {
                id: '10',
                parentId: '1',
                index: 0,
                title: 'Editable folder',
                children: [
                  {
                    id: '100',
                    parentId: '10',
                    index: 0,
                    title: 'Managed link',
                    url: 'https://example.com',
                    unmodifiable: 'managed',
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const tree = normalizeBookmarkTree(rawTree);

    expect(tree.rootIds).toEqual(['0']);
    expect(tree.orderedIds).toEqual(['0', '1', '10', '100']);
    expect(tree.nodes['0']).toMatchObject({ readonly: true, readonlyReason: 'root', type: 'folder' });
    expect(tree.nodes['1']).toMatchObject({ readonly: true, readonlyReason: 'system', folderType: 'bookmarks-bar' });
    expect(tree.nodes['10']).toMatchObject({ readonly: false, type: 'folder', childIds: ['100'], depth: 2 });
    expect(tree.nodes['100']).toMatchObject({ readonly: true, readonlyReason: 'managed', type: 'bookmark' });
  });
});
