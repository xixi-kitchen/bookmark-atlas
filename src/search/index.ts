export type SearchEngine = {
  id: string;
  name: string;
  kind?: 'chrome-default' | 'url';
  queryUrlTemplate: string;
  suggestionUrlTemplate?: string;
  suggestionEncoding?: 'utf-8' | 'gbk';
  shortcut?: string;
  icon?: string;
  enabled: boolean;
};

export const DEFAULT_SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    id: 'chrome-default',
    name: 'Chrome 默认',
    kind: 'chrome-default',
    queryUrlTemplate: '',
    shortcut: '默认',
    enabled: true,
  },
  {
    id: 'baidu',
    name: '百度',
    queryUrlTemplate: 'https://www.baidu.com/s?wd={query}',
    suggestionUrlTemplate: 'https://suggestion.baidu.com/su?wd={query}&action=opensearch',
    suggestionEncoding: 'gbk',
    shortcut: 'bd',
    enabled: true,
  },
  {
    id: 'bing',
    name: '必应',
    queryUrlTemplate: 'https://www.bing.com/search?q={query}',
    suggestionUrlTemplate: 'https://api.bing.com/osjson.aspx?query={query}',
    shortcut: 'bi',
    enabled: true,
  },
  {
    id: 'google',
    name: 'Google',
    queryUrlTemplate: 'https://www.google.com/search?q={query}',
    suggestionUrlTemplate: 'https://suggestqueries.google.com/complete/search?client=chrome&q={query}',
    shortcut: 'gg',
    enabled: true,
  },
] as const;

export function validateSearchEngine(engine: SearchEngine): string | null {
  if (!engine.id.trim()) {
    return 'Search engine id is required.';
  }

  if (!engine.name.trim()) {
    return 'Search engine name is required.';
  }

  if (engine.kind === 'chrome-default') return null;

  if (!engine.queryUrlTemplate.trim()) {
    return 'Search engine URL template is required.';
  }

  const placeholderCount = countQueryPlaceholders(engine.queryUrlTemplate);
  if (placeholderCount !== 1) {
    return 'Search engine URL template must contain exactly one {query} placeholder.';
  }

  try {
    const url = new URL(engine.queryUrlTemplate.replace('{query}', 'test'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Search engine URL template must use https, or http on localhost.';
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return 'Search engine URL template must use https, or http on localhost.';
    }
  } catch {
    return 'Search engine URL template must be a valid URL.';
  }

  if (engine.suggestionUrlTemplate?.trim()) {
    const suggestionPlaceholderCount = countQueryPlaceholders(engine.suggestionUrlTemplate);
    if (suggestionPlaceholderCount !== 1) {
      return 'Suggestion URL template must contain exactly one {query} placeholder.';
    }
    try {
      const suggestionUrl = new URL(engine.suggestionUrlTemplate.replace('{query}', 'test'));
      if (suggestionUrl.protocol !== 'https:' && !isLocalHttpUrl(suggestionUrl)) {
        return 'Suggestion URL template must use https, or http on localhost.';
      }
    } catch {
      return 'Suggestion URL template must be a valid URL.';
    }
  }

  return null;
}

export async function fetchRemoteSuggestions(
  engine: SearchEngine,
  query: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!query.trim() || !engine.suggestionUrlTemplate?.trim()) return [];
  const endpoint = engine.suggestionUrlTemplate.replace('{query}', encodeURIComponent(query.trim()));

  try {
    const response = await fetch(endpoint, {
      signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (!response.ok) return [];
    const bytes = await response.arrayBuffer();
    const text = new TextDecoder(engine.suggestionEncoding ?? 'utf-8').decode(bytes);
    const payload = JSON.parse(text) as unknown;
    const suggestions = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : [];

    return Array.from(new Set(
      suggestions
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value && !/^https?:\/\//i.test(value)),
    )).slice(0, 8);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return [];
    return [];
  }
}

export function buildSearchUrl(engine: SearchEngine, query: string): string {
  const validationError = validateSearchEngine(engine);
  if (validationError) {
    throw new Error(validationError);
  }

  return engine.queryUrlTemplate.replace('{query}', encodeURIComponent(query));
}

export async function runSearch(engine: SearchEngine, query: string, newTab = false) {
  const text = query.trim();
  if (!text) return;

  if (engine.kind === 'chrome-default' && globalThis.chrome?.search?.query) {
    await globalThis.chrome.search.query({
      text,
      disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB',
    });
    return;
  }

  if (engine.kind === 'chrome-default') {
    const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
    if (newTab) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    else window.location.assign(fallbackUrl);
    return;
  }

  const url = buildSearchUrl(engine, text);
  if (newTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.assign(url);
}

export function getSearchEnginePageUrl(engine: Pick<SearchEngine, 'queryUrlTemplate'>): string {
  try {
    const url = new URL(engine.queryUrlTemplate.replace('{query}', ''));
    return `${url.protocol}//${url.host}/`;
  } catch {
    return '';
  }
}

export function addSearchEngine(
  engines: readonly SearchEngine[],
  engine: SearchEngine,
): SearchEngine[] {
  const validationError = validateSearchEngine(engine);
  if (validationError) {
    throw new Error(validationError);
  }

  if (engines.some((existing) => existing.id === engine.id)) {
    throw new Error(`Search engine id already exists: ${engine.id}`);
  }

  return [...engines, { ...engine }];
}

export function updateSearchEngine(
  engines: readonly SearchEngine[],
  engineId: string,
  updates: Partial<Omit<SearchEngine, 'id'>>,
): SearchEngine[] {
  let didUpdate = false;
  const nextEngines = engines.map((engine) => {
    if (engine.id !== engineId) {
      return engine;
    }

    didUpdate = true;
    const nextEngine = { ...engine, ...updates };
    const validationError = validateSearchEngine(nextEngine);
    if (validationError) {
      throw new Error(validationError);
    }
    return nextEngine;
  });

  if (!didUpdate) {
    throw new Error(`Search engine not found: ${engineId}`);
  }

  return nextEngines;
}

export function removeSearchEngine(
  engines: readonly SearchEngine[],
  engineId: string,
): SearchEngine[] {
  const nextEngines = engines.filter((engine) => engine.id !== engineId);
  if (nextEngines.length === engines.length) {
    throw new Error(`Search engine not found: ${engineId}`);
  }

  return nextEngines;
}

export function setSearchEngineEnabled(
  engines: readonly SearchEngine[],
  engineId: string,
  enabled: boolean,
): SearchEngine[] {
  return updateSearchEngine(engines, engineId, { enabled });
}

export function reorderSearchEngine(
  engines: readonly SearchEngine[],
  engineId: string,
  toIndex: number,
): SearchEngine[] {
  const fromIndex = engines.findIndex((engine) => engine.id === engineId);
  if (fromIndex === -1) {
    throw new Error(`Search engine not found: ${engineId}`);
  }

  const clampedIndex = Math.max(0, Math.min(toIndex, engines.length - 1));
  const nextEngines = [...engines];
  const [engine] = nextEngines.splice(fromIndex, 1);
  if (!engine) {
    throw new Error(`Search engine not found: ${engineId}`);
  }
  nextEngines.splice(clampedIndex, 0, engine);
  return nextEngines;
}

function countQueryPlaceholders(template: string): number {
  return template.split('{query}').length - 1;
}

function isLocalHttpUrl(url: URL) {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
