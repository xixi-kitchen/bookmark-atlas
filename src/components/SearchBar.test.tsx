import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_ENGINES } from '../search';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses a custom search engine menu and can open engine management', () => {
    const onEngineChange = vi.fn();
    const onManage = vi.fn();
    render(
      <SearchBar
        engines={DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }))}
        activeEngineId="baidu"
        onEngineChange={onEngineChange}
        onManage={onManage}
      />,
    );

    expect(screen.queryByRole('combobox', { name: '搜索引擎' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '切换搜索引擎' }));
    fireEvent.click(screen.getByRole('option', { name: /必应/ }));
    expect(onEngineChange).toHaveBeenCalledWith('bing');

    fireEvent.click(screen.getByRole('button', { name: '切换搜索引擎' }));
    fireEvent.click(screen.getByRole('button', { name: '管理搜索引擎' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('shows remote suggestions together with open tabs, history, and bookmarks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(['atlas', ['atlas app', 'atlas bookmarks']]), { status: 200 })));
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` },
      tabs: { query: vi.fn(async () => [{ id: 2, windowId: 1, title: 'Atlas tab', url: 'https://tab.example/atlas' }]) },
      bookmarks: { search: vi.fn(async () => [{ id: 'b1', title: 'Atlas bookmark', url: 'https://bookmark.example/atlas' }]) },
      history: { search: vi.fn(async () => [{ title: 'Atlas history', url: 'https://history.example/atlas' }]) },
    });
    render(
      <SearchBar
        engines={DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }))}
        activeEngineId="baidu"
        onEngineChange={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: '搜索内容' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'atlas' } });

    await waitFor(() => expect(screen.getByRole('option', { name: /atlas app/ })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: /Atlas tab/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Atlas bookmark/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Atlas history/ })).toBeInTheDocument();
  });
});
