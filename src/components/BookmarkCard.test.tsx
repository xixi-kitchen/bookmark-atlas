import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkCard } from './BookmarkCard';
import type { BookmarkNode } from '../bookmarks/types';

const bookmark: BookmarkNode = {
  id: '1',
  parentId: 'toolbar',
  index: 0,
  title: 'Example',
  url: 'https://example.com/docs',
};

const originalChrome = globalThis.chrome;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'chrome', {
    value: originalChrome,
    configurable: true,
  });
});

describe('BookmarkCard', () => {
  it('opens a bookmark on a single click and exposes editing through one compact action menu', () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    Object.defineProperty(globalThis, 'chrome', {
      value: { runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` } },
      configurable: true,
    });

    const { container } = render(<BookmarkCard node={bookmark} selected cardSize="lg" onSelect={onSelect} onEdit={onEdit} />);

    const card = screen.getByRole('button', { name: '书签：Example' });
    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: 'Example 的操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }));

    expect(card).toHaveAttribute('data-card-size', 'lg');
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(onSelect).toHaveBeenCalledWith(bookmark);
    expect(open).toHaveBeenCalledWith(bookmark.url, '_self', 'noopener,noreferrer');
    expect(onEdit).toHaveBeenCalledWith(bookmark);
    expect(screen.queryByLabelText('调整真实书签结构')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('删除 Example')).not.toBeInTheDocument();
    expect(screen.getByLabelText('拖动调整分组或顺序')).toBeInTheDocument();
    expect(container.querySelector('.bookmark-favicon img')).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(bookmark.url!)),
    );
  });

  it('does not expose edit controls for readonly folders', () => {
    render(<BookmarkCard node={{ id: '2', title: 'Managed', readonly: true, children: [] }} />);

    expect(screen.getByRole('button', { name: '文件夹：Managed' })).toHaveClass('is-readonly');
    expect(screen.queryByLabelText('编辑 Managed')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('删除 Managed')).not.toBeInTheDocument();
  });

  it('moves a dragged node into a folder drop target', () => {
    const onMove = vi.fn();
    render(<BookmarkCard node={{ id: 'folder', title: 'Folder', children: [] }} onMove={onMove} />);

    const card = screen.getByRole('button', { name: '文件夹：Folder' });
    const dataTransfer = makeDataTransfer({ 'application/x-bookmark-atlas-node': 'child' });

    fireEvent.dragOver(card, { dataTransfer });
    fireEvent.drop(card, { dataTransfer });

    expect(onMove).toHaveBeenCalledWith('child', 'folder');
  });

  it('writes both private and text drag data so Chrome can preserve the source id', () => {
    const { container } = render(<BookmarkCard node={bookmark} />);
    const dataTransfer = makeDataTransfer({});

    fireEvent.dragStart(container.querySelector('[data-bookmark-id="1"]')!, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-bookmark-atlas-node', '1');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '1');
  });
});

function makeDataTransfer(values: Record<string, string>) {
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    getData: (type: string) => values[type] ?? '',
    setData: vi.fn(),
  };
}
