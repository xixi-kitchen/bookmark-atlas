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
    expect(screen.getByRole('button', { name: 'Excalidraw canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Card size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'UI style' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Card size: Medium cards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'UI style: Swiss International' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Chrome Extensions Docs')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'New Chrome bookmark' })).toBeInTheDocument();
  });

  it('navigates folders and filters the managed view without leaving the page', async () => {
    render(<App />);

    const bookmarksBar = await screen.findByRole('treeitem', { name: /Bookmarks Bar/ });
    fireEvent.click(bookmarksBar);

    const breadcrumb = screen.getByRole('navigation', { name: 'Current location' });
    expect(within(breadcrumb).getByRole('button', { name: 'Bookmarks Bar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Bookmark: OpenAI' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bookmark: Figma' })).not.toBeInTheDocument();
  });
});
