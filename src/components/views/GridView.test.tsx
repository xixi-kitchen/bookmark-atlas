import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GridView } from './GridView';
import type { BookmarkNode } from '../../bookmarks/types';

afterEach(() => cleanup());

const tree: BookmarkNode[] = [
  {
    id: 'design',
    title: 'Design',
    parentId: 'root',
    index: 0,
    children: [
      { id: 'figma', title: 'Figma', parentId: 'design', index: 0, url: 'https://figma.com' },
      { id: 'docs', title: 'Docs', parentId: 'design', index: 1, url: 'https://docs.example' },
    ],
  },
  { id: 'loose', title: 'Loose', parentId: 'root', index: 1, url: 'https://loose.example' },
];

describe('GridView', () => {
  it('groups loose bookmarks and folder children into column sections', () => {
    render(<GridView bookmarks={tree} cardSize="md" selectedId="figma" />);

    expect(screen.getByRole('region', { name: '顶层书签' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Design' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '书签：Figma' })).toHaveClass('is-selected');
    expect(within(screen.getByRole('region', { name: 'Design' })).getByText(/2 个直接项目/)).toBeInTheDocument();
  });

  it('renders an empty state', () => {
    render(<GridView bookmarks={[]} emptyTitle="没有书签" emptyDescription="稍后同步" />);

    expect(screen.getByText('没有书签')).toBeInTheDocument();
    expect(screen.getByText('稍后同步')).toBeInTheDocument();
  });

  it('creates sections for deeply nested folders so every bookmark is visible', () => {
    const nested: BookmarkNode[] = [{
      id: 'root-folder', title: 'Root folder', children: [{
        id: 'nested-folder', title: 'Nested folder', parentId: 'root-folder', children: [{
          id: 'deep-link', title: 'Deep link', parentId: 'nested-folder', url: 'https://deep.example',
        }],
      }],
    }];

    render(<GridView bookmarks={nested} />);

    expect(screen.getByRole('region', { name: 'Nested folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '书签：Deep link' })).toBeInTheDocument();
  });

  it('opens a group and exposes create, edit, and delete actions', () => {
    const onOpenFolder = vi.fn();
    const onCreateInFolder = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<GridView bookmarks={tree} onOpenFolder={onOpenFolder} onCreateInFolder={onCreateInFolder} onEdit={onEdit} onDelete={onDelete} />);

    const designGroup = screen.getByRole('region', { name: 'Design' });
    fireEvent.click(within(designGroup).getByRole('button', { name: /Design.*2 个直接项目/ }));
    fireEvent.click(screen.getByRole('button', { name: '在 Design 中新建' }));
    fireEvent.click(screen.getByRole('button', { name: '编辑 Design' }));
    fireEvent.click(screen.getByRole('button', { name: '删除 Design' }));

    expect(onOpenFolder).toHaveBeenCalledWith(tree[0]);
    expect(onCreateInFolder).toHaveBeenCalledWith(tree[0]);
    expect(onEdit).toHaveBeenCalledWith(tree[0]);
    expect(onDelete).toHaveBeenCalledWith(tree[0]);
  });

  it('allows creating inside a Chrome system folder without exposing destructive folder actions', () => {
    const systemFolder: BookmarkNode = {
      ...tree[0]!,
      readonly: true,
      readonlyReason: 'system',
      folderType: 'bookmarks-bar',
    };
    const onCreateInFolder = vi.fn();
    render(<GridView bookmarks={[systemFolder]} onCreateInFolder={onCreateInFolder} onEdit={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '在 Design 中新建' }));

    expect(onCreateInFolder).toHaveBeenCalledWith(systemFolder);
    expect(screen.queryByRole('button', { name: '编辑 Design' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除 Design' })).not.toBeInTheDocument();
  });

  it('moves a dragged bookmark into a different group using the whole group as a drop target', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const destination: BookmarkNode = { id: 'research', title: 'Research', parentId: 'root', children: [] };
    render(<GridView bookmarks={[...tree, destination]} onMove={onMove} />);
    const dataTransfer = makeDataTransfer({ 'application/x-bookmark-atlas-node': 'figma' });
    const researchGroup = screen.getByRole('region', { name: 'Research' });

    fireEvent.dragOver(researchGroup, { dataTransfer });
    expect(researchGroup).toHaveClass('is-drop-target');
    fireEvent.drop(researchGroup, { dataTransfer });

    await waitFor(() => expect(onMove).toHaveBeenCalledWith('figma', 'research', 0));
  });

  it('keeps the dragged bookmark id when Chrome protects drag data during dragover', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const destination: BookmarkNode = { id: 'research', title: 'Research', parentId: 'root', children: [] };
    const { container } = render(<GridView bookmarks={[...tree, destination]} onMove={onMove} />);
    const dataTransfer = makeProtectedDataTransfer();
    const sourceCard = container.querySelector<HTMLElement>('[data-bookmark-id="figma"]')!;
    const researchGroup = screen.getByRole('region', { name: 'Research' });

    fireEvent.dragStart(sourceCard, { dataTransfer });
    dataTransfer.protected = true;
    fireEvent.dragOver(researchGroup, { dataTransfer });

    expect(researchGroup).toHaveClass('is-drop-target');

    dataTransfer.protected = false;
    fireEvent.drop(researchGroup, { dataTransfer });
    await waitFor(() => expect(onMove).toHaveBeenCalledWith('figma', 'research', 0));
  });

  it('reorders a bookmark before another bookmark in the same Chrome folder', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<GridView bookmarks={tree} onMove={onMove} />);
    const dataTransfer = makeDataTransfer({ 'application/x-bookmark-atlas-node': 'docs' });
    const figmaDropTarget = container.querySelector<HTMLElement>('[data-drop-item-id="figma"]')!;
    vi.spyOn(figmaDropTarget, 'getBoundingClientRect').mockReturnValue(rect(100, 200));

    fireDragEvent(figmaDropTarget, 'dragOver', dataTransfer, 120);
    expect(figmaDropTarget).toHaveClass('is-drop-before');
    fireDragEvent(figmaDropTarget, 'drop', dataTransfer, 120);

    await waitFor(() => expect(onMove).toHaveBeenCalledWith('docs', 'design', 0));
  });

  it('normalizes the destination index when moving forward within the same folder', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<GridView bookmarks={tree} onMove={onMove} />);
    const dataTransfer = makeDataTransfer({ 'application/x-bookmark-atlas-node': 'figma' });
    const docsDropTarget = container.querySelector<HTMLElement>('[data-drop-item-id="docs"]')!;
    vi.spyOn(docsDropTarget, 'getBoundingClientRect').mockReturnValue(rect(100, 200));

    fireDragEvent(docsDropTarget, 'dragOver', dataTransfer, 290);
    expect(docsDropTarget).toHaveClass('is-drop-after');
    fireDragEvent(docsDropTarget, 'drop', dataTransfer, 290);

    await waitFor(() => expect(onMove).toHaveBeenCalledWith('figma', 'design', 1));
  });

  it('does not allow a folder to be moved into one of its descendants', () => {
    const onMove = vi.fn();
    const nested: BookmarkNode[] = [{
      id: 'parent', title: 'Parent', parentId: 'root', children: [
        { id: 'child', title: 'Child', parentId: 'parent', children: [] },
      ],
    }];
    render(<GridView bookmarks={nested} onMove={onMove} />);
    const dataTransfer = makeDataTransfer({ 'application/x-bookmark-atlas-node': 'parent' });
    const childGroup = screen.getByRole('region', { name: 'Child' });

    fireEvent.dragOver(childGroup, { dataTransfer });
    fireEvent.drop(childGroup, { dataTransfer });

    expect(childGroup).not.toHaveClass('is-drop-target');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('does not accept drops into a managed folder', () => {
    const onMove = vi.fn();
    const managed: BookmarkNode = {
      id: 'managed', title: 'Managed', parentId: 'root', readonly: true, readonlyReason: 'managed', children: [],
    };
    render(<GridView bookmarks={[...tree, managed]} onMove={onMove} />);
    const dataTransfer = makeDataTransfer({ 'application/x-bookmark-atlas-node': 'figma' });
    const managedGroup = screen.getByRole('region', { name: 'Managed' });

    fireEvent.dragOver(managedGroup, { dataTransfer });
    fireEvent.drop(managedGroup, { dataTransfer });

    expect(managedGroup).not.toHaveClass('is-drop-target');
    expect(onMove).not.toHaveBeenCalled();
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

function makeProtectedDataTransfer() {
  const values: Record<string, string> = {};
  return {
    protected: false,
    effectAllowed: 'move',
    dropEffect: 'move',
    getData(type: string) { return this.protected ? '' : (values[type] ?? ''); },
    setData(type: string, value: string) { values[type] = value; },
  };
}

function rect(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    right: left + width,
    top: 0,
    bottom: 72,
    width,
    height: 72,
    toJSON: () => ({}),
  };
}

function fireDragEvent(
  target: HTMLElement,
  type: 'dragOver' | 'drop',
  dataTransfer: ReturnType<typeof makeDataTransfer>,
  clientX: number,
): void {
  const event = createEvent[type](target, { dataTransfer });
  Object.defineProperty(event, 'clientX', { value: clientX });
  fireEvent(target, event);
}
