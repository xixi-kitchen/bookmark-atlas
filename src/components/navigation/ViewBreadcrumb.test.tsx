import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode } from '../../bookmarks/types';
import { ViewBreadcrumb } from './ViewBreadcrumb';

const nodes: Record<string, BookmarkNode> = {
  design: {
    id: 'design',
    title: 'Design',
    parentId: 'root',
    children: [
      { id: 'figma', title: 'Figma', parentId: 'design', url: 'https://figma.com' },
      { id: 'research', title: 'Research', parentId: 'design', children: [] },
    ],
  },
  research: {
    id: 'research',
    title: 'Research',
    parentId: 'design',
    children: [
      { id: 'papers', title: 'Papers', parentId: 'research', url: 'https://papers.example' },
    ],
  },
  dev: {
    id: 'dev',
    title: 'Development',
    parentId: 'root',
    children: [
      { id: 'react', title: 'React', parentId: 'dev', url: 'https://react.dev' },
    ],
  },
};

afterEach(() => cleanup());

describe('ViewBreadcrumb', () => {
  it('builds a trail from parent ids and summarizes the current folder', () => {
    render(<ViewBreadcrumb nodes={nodes} currentFolderId="research" />);

    expect(screen.getByRole('navigation', { name: 'Current location' })).toHaveTextContent('All bookmarks');
    expect(screen.getByRole('button', { name: 'Design' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Research' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('1 direct items')).toBeInTheDocument();
    expect(screen.getByText('1 total items')).toBeInTheDocument();
  });

  it('navigates backward, home, and to crumb folders', () => {
    const onNavigate = vi.fn();
    render(<ViewBreadcrumb nodes={nodes} currentFolderId="research" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to top level' }));
    fireEvent.click(screen.getByRole('button', { name: 'Design' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'design' }));
    expect(onNavigate).toHaveBeenNthCalledWith(2);
    expect(onNavigate).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: 'design' }));
  });

  it('disables root-only controls and exposes expected semantic classes', () => {
    const { container } = render(<ViewBreadcrumb nodes={nodes} />);

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to top level' })).toBeDisabled();
    expect(screen.getByText('2 direct items')).toBeInTheDocument();
    expect(screen.getByText('5 total items')).toBeInTheDocument();
    expect(container.querySelector('.view-breadcrumb')).toBeInTheDocument();
    expect(container.querySelector('.view-breadcrumb__trail')).toBeInTheDocument();
    expect(container.querySelector('.view-breadcrumb__summary')).toBeInTheDocument();
  });
});
