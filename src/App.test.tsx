import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { createMemoryBookmarkAdapter } from './bookmarks/adapter';
import { configureBookmarkAdapterForTests } from './store/bookmarkStore';
import { usePreferencesStore } from './store/preferencesStore';

describe('App integration', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('bookmark-atlas:preferences:v1', JSON.stringify({ viewMode: 'grid' }));
    configureBookmarkAdapterForTests(createMemoryBookmarkAdapter());
    usePreferencesStore.setState({
      viewMode: 'grid',
      cardSize: 'md',
      themeId: 'swiss',
      activeEngineId: 'baidu',
      hydrated: true,
    });
  });

  it('loads demo bookmarks and exposes all primary controls', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Bookmark Atlas' })).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excalidraw 画布' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '行视图' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '卡片大小' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'UI 风格' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '卡片大小：中卡片' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'UI 风格：瑞士国际主义' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Chrome Extensions Docs')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '新建 Chrome 书签' })).toBeInTheDocument();
  });

  it('navigates folders and filters the managed view without leaving the page', async () => {
    render(<App />);

    const bookmarksBar = await screen.findByRole('treeitem', { name: /Bookmarks Bar/ });
    fireEvent.click(bookmarksBar);

    const breadcrumb = screen.getByRole('navigation', { name: '当前位置' });
    expect(within(breadcrumb).getByRole('button', { name: 'Bookmarks Bar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '书签：OpenAI' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '书签：Figma' })).not.toBeInTheDocument();
  });
});
