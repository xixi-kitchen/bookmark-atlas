import type { ChromeBookmarkTreeNode } from './types';

export function createDemoBookmarkTree(): ChromeBookmarkTreeNode[] {
  return [
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
              title: 'Design References',
              children: [
                {
                  id: '100',
                  parentId: '10',
                  index: 0,
                  title: 'Chrome Extensions Docs',
                  url: 'https://developer.chrome.com/docs/extensions',
                  dateAdded: 1710000000000,
                },
                {
                  id: '101',
                  parentId: '10',
                  index: 1,
                  title: 'React Flow',
                  url: 'https://reactflow.dev',
                  dateAdded: 1710000001000,
                },
              ],
            },
            {
              id: '11',
              parentId: '1',
              index: 1,
              title: 'OpenAI',
              url: 'https://openai.com',
              dateAdded: 1710000002000,
            },
          ],
        },
        {
          id: '2',
          parentId: '0',
          index: 1,
          title: 'Other Bookmarks',
          folderType: 'other',
          children: [
            {
              id: '20',
              parentId: '2',
              index: 0,
              title: 'Product',
              children: [
                {
                  id: '200',
                  parentId: '20',
                  index: 0,
                  title: 'Figma',
                  url: 'https://figma.com',
                  dateAdded: 1710000003000,
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}
