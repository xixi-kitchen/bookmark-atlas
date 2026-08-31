import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode } from '../../bookmarks/types';
import { FolderNavigator } from './FolderNavigator';

const roots: BookmarkNode[] = [
  {
    id: 'design',
    title: 'Design',
    parentId: 'root',
    children: [
      { id: 'figma', title: 'Figma', parentId: 'design', url: 'https://figma.com' },
      {
        id: 'research',
        title: 'Research',
        parentId: 'design',
        children: [
          { id: 'papers', title: 'Papers', parentId: 'research', url: 'https://papers.example' },
        ],
      },
    ],
  },
  {
    id: 'dev',
    title: 'Development',
    parentId: 'root',
    children: [
      { id: 'react', title: 'React', parentId: 'dev', url: 'https://react.dev' },
    ],
  },
];

afterEach(() => cleanup());

describe('FolderNavigator', () => {
  it('renders recursive folders with direct and total counts', () => {
    render(<FolderNavigator roots={roots} selectedFolderId="research" />);

    expect(screen.getByRole('tree', { name: '文件夹树' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /全部书签/ })).toHaveTextContent('2 / 6');
    expect(screen.getByRole('treeitem', { name: /Design/ })).toHaveTextContent('2 / 3');
    expect(screen.getByRole('treeitem', { name: /Research/ })).toHaveTextContent('1 / 1');
    expect(screen.getByRole('treeitem', { name: /Research/ })).toHaveClass('is-selected');
  });

  it('selects root and folders', () => {
    const onSelectFolder = vi.fn();
    render(<FolderNavigator roots={roots} onSelectFolder={onSelectFolder} />);

    fireEvent.click(screen.getByRole('treeitem', { name: /全部书签/ }));
    fireEvent.click(screen.getByRole('treeitem', { name: /Development/ }));

    expect(onSelectFolder).toHaveBeenNthCalledWith(1);
    expect(onSelectFolder).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'dev' }));
  });

  it('collapses folders and filters by descendant text', () => {
    render(<FolderNavigator roots={roots} />);

    fireEvent.click(screen.getByRole('button', { name: '折叠 Design' }));
    expect(screen.queryByRole('treeitem', { name: /Research/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'papers' } });

    expect(screen.getByRole('treeitem', { name: /Design/ })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /Research/ })).toBeInTheDocument();
    expect(screen.queryByRole('treeitem', { name: /Development/ })).not.toBeInTheDocument();
  });

  it('uses the expected semantic class names', () => {
    const { container } = render(<FolderNavigator roots={roots} />);

    expect(container.querySelector('.view-navigator')).toBeInTheDocument();
    expect(container.querySelector('.view-navigator__search')).toBeInTheDocument();
    expect(container.querySelector('.folder-tree')).toBeInTheDocument();
    expect(container.querySelector('.folder-tree__item')).toBeInTheDocument();
    expect(container.querySelector('.folder-tree__button')).toBeInTheDocument();

    const firstItem = container.querySelector('.folder-tree__item');
    expect(within(firstItem as HTMLElement).getByRole('treeitem', { name: /Design/ })).toBeInTheDocument();
  });
});
