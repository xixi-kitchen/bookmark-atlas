import {
  addSearchEngine,
  buildSearchUrl,
  DEFAULT_SEARCH_ENGINES,
  fetchRemoteSuggestions,
  getSearchEnginePageUrl,
  removeSearchEngine,
  reorderSearchEngine,
  runSearch,
  setSearchEngineEnabled,
  updateSearchEngine,
  validateSearchEngine,
  type SearchEngine,
} from '../../src/search';
import { afterEach, describe, expect, it, vi } from 'vitest';

const customEngine: SearchEngine = {
  id: 'custom',
  name: 'Custom',
  queryUrlTemplate: 'https://example.com/search?q={query}',
  enabled: true,
};

describe('search engines', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('defines the required default engines', () => {
    expect(DEFAULT_SEARCH_ENGINES.map((engine) => engine.id)).toEqual([
      'chrome-default',
      'baidu',
      'bing',
      'google',
    ]);
    expect(DEFAULT_SEARCH_ENGINES.every((engine) => validateSearchEngine(engine) === null)).toBe(
      true,
    );
  });

  it('uses Chrome default search without replacing the user provider', async () => {
    const query = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', { search: { query } });

    await runSearch(DEFAULT_SEARCH_ENGINES[0]!, 'bookmark atlas', true);

    expect(query).toHaveBeenCalledWith({ text: 'bookmark atlas', disposition: 'NEW_TAB' });
  });

  it('validates query URL templates', () => {
    expect(validateSearchEngine(customEngine)).toBeNull();
    expect(
      validateSearchEngine({ ...customEngine, queryUrlTemplate: 'ftp://example.com?q={query}' }),
    ).toMatch(/https/);
    expect(
      validateSearchEngine({ ...customEngine, queryUrlTemplate: 'http://example.com?q={query}' }),
    ).toMatch(/https/);
    expect(
      validateSearchEngine({ ...customEngine, queryUrlTemplate: 'http://localhost:8080?q={query}' }),
    ).toBeNull();
    expect(
      validateSearchEngine({ ...customEngine, queryUrlTemplate: 'https://example.com/search' }),
    ).toMatch(/exactly one/);
    expect(
      validateSearchEngine({
        ...customEngine,
        queryUrlTemplate: 'https://example.com/search?q={query}&again={query}',
      }),
    ).toMatch(/exactly one/);
  });

  it('builds encoded search URLs without storing search text', () => {
    expect(buildSearchUrl(customEngine, 'chrome 书签 + tab')).toBe(
      'https://example.com/search?q=chrome%20%E4%B9%A6%E7%AD%BE%20%2B%20tab',
    );
  });

  it('derives the favicon page and parses OpenSearch remote suggestions', async () => {
    expect(getSearchEnginePageUrl(customEngine)).toBe('https://example.com/');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(['chrome', ['chrome extensions', 'chrome bookmarks']]),
      { status: 200 },
    )));

    const suggestions = await fetchRemoteSuggestions({
      ...customEngine,
      suggestionUrlTemplate: 'https://example.com/suggest?q={query}',
    }, 'chrome');

    expect(suggestions).toEqual(['chrome extensions', 'chrome bookmarks']);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/suggest?q=chrome',
      expect.objectContaining({ signal: undefined }),
    );
  });

  it('uses deterministic remote suggestions only for non-extension store screenshots', async () => {
    window.history.replaceState({}, '', '/?store-screenshot&lang=en');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await fetchRemoteSuggestions(DEFAULT_SEARCH_ENGINES[3]!, 'Excalidraw');

    expect(suggestions).toEqual([
      'Excalidraw workflow',
      'Excalidraw examples',
      'Excalidraw checklist',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds, updates, toggles, removes, and reorders engines immutably', () => {
    const added = addSearchEngine(DEFAULT_SEARCH_ENGINES, customEngine);
    expect(added).toHaveLength(DEFAULT_SEARCH_ENGINES.length + 1);
    expect(DEFAULT_SEARCH_ENGINES).toHaveLength(4);

    const updated = updateSearchEngine(added, 'custom', { name: 'Docs' });
    expect(updated.find((engine) => engine.id === 'custom')?.name).toBe('Docs');
    expect(added.find((engine) => engine.id === 'custom')?.name).toBe('Custom');

    const disabled = setSearchEngineEnabled(updated, 'custom', false);
    expect(disabled.find((engine) => engine.id === 'custom')?.enabled).toBe(false);

    const reordered = reorderSearchEngine(disabled, 'custom', 0);
    expect(reordered[0]?.id).toBe('custom');

    const removed = removeSearchEngine(reordered, 'custom');
    expect(removed.some((engine) => engine.id === 'custom')).toBe(false);
  });
});
