import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_ENGINES } from '../search';
import { SearchBar } from './SearchBar';
import { setLanguagePreference } from '../i18n/languagePreference';
import { t } from '../i18n';
import { EngineManager } from './EngineManager';

describe('SearchBar', () => {
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await setLanguagePreference('auto');
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

    expect(screen.queryByRole('combobox', { name: 'Search engines' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch search engine' }));
    fireEvent.click(screen.getByRole('option', { name: /Bing/ }));
    expect(onEngineChange).toHaveBeenCalledWith('bing');

    fireEvent.click(screen.getByRole('button', { name: 'Switch search engine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage search engines' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('localizes an old saved default-engine name in both search and management without changing its identity', async () => {
    const engines = [
      { ...DEFAULT_SEARCH_ENGINES[0]!, name: 'Chrome Default' },
      { id: 'custom', name: 'My Edge Docs', queryUrlTemplate: 'https://example.com/?q={query}', enabled: true },
    ];
    const onEngineChange = vi.fn();
    const props = { engines, activeEngineId: 'chrome-default', onEngineChange, onManage: vi.fn() };
    const { rerender } = render(<SearchBar {...props} />);
    expect(screen.queryByText('Chrome Default')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch search engine' })).toHaveTextContent('Browser default');
    fireEvent.click(screen.getByRole('button', { name: 'Switch search engine' }));
    fireEvent.click(screen.getByRole('option', { name: /Browser default/ }));
    expect(onEngineChange).toHaveBeenCalledWith('chrome-default');
    await setLanguagePreference('zh-CN');
    rerender(<SearchBar {...props} />);
    expect(screen.getByRole('button', { name: t('switchSearchEngine') })).toHaveTextContent('浏览器默认');
    expect(screen.getByRole('combobox', { name: t('searchContent') })).toHaveAttribute('placeholder', expect.stringContaining('浏览器默认'));
    fireEvent.focus(screen.getByRole('combobox', { name: t('searchContent') }));
    fireEvent.change(screen.getByRole('combobox', { name: t('searchContent') }), { target: { value: 'Edge label probe' } });
    expect(await screen.findByText('直接使用 浏览器默认 搜索')).toBeInTheDocument();
    cleanup();
    render(<EngineManager engines={engines} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Chrome Default')).not.toBeInTheDocument();
    expect(screen.getByText('浏览器默认')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: t('enableEngine', '浏览器默认') })).toBeChecked();
    expect(screen.getByText('My Edge Docs')).toBeInTheDocument();
    expect(engines[0]).toMatchObject({ id: 'chrome-default', kind: 'chrome-default', name: 'Chrome Default' });
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

    const input = screen.getByRole('combobox', { name: 'Search content' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'atlas' } });

    await waitFor(() => expect(screen.getByRole('option', { name: /atlas app/ })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: /Atlas tab/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Atlas bookmark/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Atlas history/ })).toBeInTheDocument();
  });
  it('updates existing result group labels when the interface language changes', async () => {
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 2, windowId: 1, title: 'Atlas tab', url: 'https://tab.example/atlas' }]) } });
    const props = { engines: [...DEFAULT_SEARCH_ENGINES], activeEngineId: 'chrome-default', onEngineChange: vi.fn(), onManage: vi.fn() };
    const { rerender } = render(<SearchBar {...props} />);
    const input = screen.getByRole('combobox', { name: 'Search content' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'atlas' } });
    expect(await screen.findByText('Open tabs')).toBeInTheDocument();
    await setLanguagePreference('zh-CN');
    rerender(<SearchBar {...props} />);
    expect(screen.getByText(t('openTabs'))).toBeInTheDocument();
    expect(screen.queryByText('Open tabs')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: t('searchContent') })).toHaveValue('atlas');
  });
});
