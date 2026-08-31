export type BrowserSearchKind = 'tab' | 'history' | 'bookmark';

export type BrowserSearchResult = {
  id: string;
  kind: BrowserSearchKind;
  title: string;
  url: string;
  subtitle: string;
  tabId?: number;
  windowId?: number;
};

export type BrowserSearchGroups = {
  tabs: BrowserSearchResult[];
  bookmarks: BrowserSearchResult[];
  history: BrowserSearchResult[];
};

const EMPTY_GROUPS: BrowserSearchGroups = { tabs: [], bookmarks: [], history: [] };

export async function searchLocalBrowserContent(query: string): Promise<BrowserSearchGroups> {
  const chromeApi = globalThis.chrome;
  if (!chromeApi) return EMPTY_GROUPS;

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const [tabs, bookmarks, history] = await Promise.all([
    searchTabs(normalizedQuery),
    normalizedQuery ? searchBookmarks(normalizedQuery) : Promise.resolve([]),
    searchHistory(normalizedQuery),
  ]);

  const claimedUrls = new Set(tabs.map((result) => normalizeUrl(result.url)));
  const uniqueBookmarks = bookmarks.filter((result) => claimUrl(result.url, claimedUrls));
  const uniqueHistory = history.filter((result) => claimUrl(result.url, claimedUrls));

  return {
    tabs: tabs.slice(0, 5),
    bookmarks: uniqueBookmarks.slice(0, 5),
    history: uniqueHistory.slice(0, 6),
  };
}

export async function activateBrowserSearchResult(result: BrowserSearchResult): Promise<boolean> {
  const chromeApi = globalThis.chrome;
  if (result.kind !== 'tab' || result.tabId == null || !chromeApi?.tabs?.update) return false;

  await chromeApi.tabs.update(result.tabId, { active: true });
  if (result.windowId != null && chromeApi.windows?.update) {
    await chromeApi.windows.update(result.windowId, { focused: true });
  }
  return true;
}

async function searchTabs(query: string): Promise<BrowserSearchResult[]> {
  const tabsApi = globalThis.chrome?.tabs;
  if (!tabsApi?.query) return [];

  try {
    const tabs = await tabsApi.query({});
    return tabs
      .filter((tab) => tab.id != null && isSearchableUrl(tab.url) && matches(tab.title, tab.url, query))
      .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))
      .map((tab) => ({
        id: `tab:${tab.id}`,
        kind: 'tab' as const,
        title: tab.title?.trim() || hostname(tab.url),
        url: tab.url!,
        subtitle: tab.active ? '当前标签页' : hostname(tab.url),
        tabId: tab.id,
        windowId: tab.windowId,
      }));
  } catch {
    return [];
  }
}

async function searchBookmarks(query: string): Promise<BrowserSearchResult[]> {
  const bookmarksApi = globalThis.chrome?.bookmarks;
  if (!bookmarksApi?.search) return [];

  try {
    const bookmarks = await bookmarksApi.search(query);
    return bookmarks
      .filter((bookmark) => isSearchableUrl(bookmark.url))
      .map((bookmark) => ({
        id: `bookmark:${bookmark.id}`,
        kind: 'bookmark' as const,
        title: bookmark.title?.trim() || hostname(bookmark.url),
        url: bookmark.url!,
        subtitle: hostname(bookmark.url),
      }));
  } catch {
    return [];
  }
}

async function searchHistory(query: string): Promise<BrowserSearchResult[]> {
  const historyApi = globalThis.chrome?.history;
  if (!historyApi?.search) return [];

  try {
    const history = await historyApi.search({
      text: query,
      startTime: 0,
      maxResults: query ? 18 : 8,
    });
    return history
      .filter((item) => isSearchableUrl(item.url))
      .map((item, index) => ({
        id: `history:${normalizeUrl(item.url!)}:${index}`,
        kind: 'history' as const,
        title: item.title?.trim() || hostname(item.url),
        url: item.url!,
        subtitle: hostname(item.url),
      }));
  } catch {
    return [];
  }
}

function matches(title: string | undefined, url: string | undefined, query: string) {
  if (!query) return true;
  return `${title ?? ''} ${url ?? ''}`.toLocaleLowerCase().includes(query);
}

function claimUrl(url: string, claimedUrls: Set<string>) {
  const normalized = normalizeUrl(url);
  if (!normalized || claimedUrls.has(normalized)) return false;
  claimedUrls.add(normalized);
  return true;
}

function normalizeUrl(url: string) {
  try {
    const normalized = new URL(url);
    normalized.hash = '';
    return normalized.href;
  } catch {
    return url;
  }
}

function hostname(url?: string) {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSearchableUrl(url?: string): url is string {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
