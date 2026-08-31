import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode } from '../../bookmarks/types';
import { GroupCanvas, measureGroup } from './GroupCanvas';

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    MiniMap: () => null,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectionMode: { Partial: 'partial' },
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNodes: () => [],
      setCenter: vi.fn(),
      setViewport: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomTo: vi.fn(),
    }),
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
    ReactFlow: ({ nodes, nodeTypes, children }: { nodes: Array<{ id: string; type: string; data: unknown }>; nodeTypes: Record<string, React.ComponentType<{ data: unknown; selected: boolean }>>; children: React.ReactNode }) => (
      <div>
        {nodes.map((node) => {
          const NodeComponent = nodeTypes[node.type];
          return NodeComponent ? <NodeComponent key={node.id} data={node.data} selected={false} /> : null;
        })}
        {children}
      </div>
    ),
  };
});

const tree: BookmarkNode[] = [
  {
    id: 'design',
    title: 'Design',
    children: [
      { id: 'figma', title: 'Figma', parentId: 'design', url: 'https://figma.com' },
      {
        id: 'tools',
        title: 'Tools',
        parentId: 'design',
        children: [
          {
            id: 'deep',
            title: 'Deep',
            parentId: 'tools',
            children: [{ id: 'deep-link', title: 'Deep link', parentId: 'deep', url: 'https://deep.example' }],
          },
        ],
      },
    ],
  },
];

afterEach(() => cleanup());

describe('GroupCanvas', () => {
  it('renders every nested folder and bookmark as content-sized groups without collapsing', async () => {
    render(<GroupCanvas roots={tree} cardSize="md" onEdit={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} />);

    expect(await screen.findByLabelText('Design 分组')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '书签：Figma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文件夹：Tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文件夹：Deep' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '书签：Deep link' })).toBeInTheDocument();
  });

  it('calculates near-square bookmark rows and grows the outer group around nested content', () => {
    const bookmarks = Array.from({ length: 10 }, (_, index): BookmarkNode => ({
      id: `bookmark-${index}`,
      title: `Bookmark ${index}`,
      url: `https://example.com/${index}`,
    }));
    const direct = measureGroup(bookmarks, 'md');
    const nested = measureGroup([{ id: 'folder', title: 'Folder', children: bookmarks }], 'md');

    expect(direct.bookmarkColumns).toBe(4);
    expect(direct.bookmarkRows).toBe(3);
    expect(nested.width).toBeGreaterThanOrEqual(direct.width);
    expect(nested.height).toBeGreaterThan(direct.height);
  });
});
