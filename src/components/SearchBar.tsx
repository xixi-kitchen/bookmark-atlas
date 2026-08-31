import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, ChevronDown, Search, Settings2 } from 'lucide-react';
import { activateBrowserSearchResult, searchLocalBrowserContent, type BrowserSearchGroups, type BrowserSearchResult } from '../search/browserSearch';
import { fetchRemoteSuggestions, runSearch, type SearchEngine } from '../search';
import { SearchEngineIcon } from './SearchEngineIcon';
import { BookmarkFavicon } from './BookmarkFavicon';

type Props = {
  engines: SearchEngine[];
  activeEngineId: string;
  onEngineChange: (id: string) => void;
  onManage: () => void;
};

type SearchAction = { id: string; kind: 'search' | 'remote'; title: string };
type SuggestionItem = SearchAction | BrowserSearchResult;
type SuggestionGroup = { id: string; label: string; items: SuggestionItem[] };

const EMPTY_LOCAL_RESULTS: BrowserSearchGroups = { tabs: [], bookmarks: [], history: [] };

export function SearchBar({ engines, activeEngineId, onEngineChange, onManage }: Props) {
  const [query, setQuery] = useState('');
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<string[]>([]);
  const [localResults, setLocalResults] = useState<BrowserSearchGroups>(EMPTY_LOCAL_RESULTS);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLFormElement>(null);
  const enabled = engines.filter((engine) => engine.enabled);
  const active = enabled.find((engine) => engine.id === activeEngineId) ?? enabled[0];

  const groups = useMemo<SuggestionGroup[]>(() => {
    const trimmedQuery = query.trim();
    return [
      {
        id: 'remote',
        label: active?.kind === 'chrome-default' ? 'Chrome 默认搜索' : active ? `${active.name} 联想` : '搜索建议',
        items: trimmedQuery && active
          ? [
              { id: `search:${trimmedQuery}`, kind: 'search' as const, title: trimmedQuery },
              ...remoteSuggestions.map((title, index) => ({ id: `remote:${index}:${title}`, kind: 'remote' as const, title })),
            ]
          : [],
      },
      { id: 'tabs', label: '已打开的标签页', items: localResults.tabs },
      { id: 'bookmarks', label: 'Chrome 书签', items: localResults.bookmarks },
      { id: 'history', label: trimmedQuery ? '浏览历史' : '最近访问', items: localResults.history },
    ].filter((group) => group.items.length > 0);
  }, [active, localResults, query, remoteSuggestions]);

  const flattenedItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setEngineMenuOpen(false);
      setSuggestionsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void Promise.all([
        active ? fetchRemoteSuggestions(active, query, controller.signal) : Promise.resolve([]),
        searchLocalBrowserContent(query),
      ]).then(([remote, local]) => {
        if (controller.signal.aborted) return;
        setRemoteSuggestions(remote);
        setLocalResults(local);
        setLoading(false);
      });
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, query, suggestionsOpen]);

  useEffect(() => {
    if (activeIndex >= flattenedItems.length) setActiveIndex(flattenedItems.length - 1);
  }, [activeIndex, flattenedItems.length]);

  const searchWithEngine = (value: string, newTab = false) => {
    if (!active || !value.trim()) return;
    void runSearch(active, value, newTab);
    setSuggestionsOpen(false);
  };

  const executeSuggestion = async (item: SuggestionItem, newTab: boolean) => {
    if (item.kind === 'search' || item.kind === 'remote') {
      searchWithEngine(item.title, newTab);
      return;
    }
    if (item.kind === 'tab' && await activateBrowserSearchResult(item)) {
      setSuggestionsOpen(false);
      return;
    }
    if ('url' in item) openUrl(item.url, newTab);
    setSuggestionsOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = activeIndex >= 0 ? flattenedItems[activeIndex] : undefined;
    if (selected) void executeSuggestion(selected, false);
    else searchWithEngine(query);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, flattenedItems.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
      return;
    }
    if (event.key === 'Escape') {
      setSuggestionsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter' && event.shiftKey && active && query.trim()) {
      event.preventDefault();
      const selected = activeIndex >= 0 ? flattenedItems[activeIndex] : undefined;
      if (selected) void executeSuggestion(selected, true);
      else searchWithEngine(query, true);
    }
  };

  return (
    <form className="search-box" onSubmit={submit} role="search" ref={rootRef}>
      <div className="search-engine-switcher">
        <button
          type="button"
          className="search-engine-switcher__trigger"
          aria-label="切换搜索引擎"
          aria-haspopup="listbox"
          aria-expanded={engineMenuOpen}
          onClick={() => {
            setEngineMenuOpen((open) => !open);
            setSuggestionsOpen(false);
          }}
        >
          {active ? <SearchEngineIcon engine={active} /> : <span className="search-engine-mark">?</span>}
          <span>{active?.name ?? '未选择'}</span>
          <ChevronDown size={14} />
        </button>
        {engineMenuOpen && (
          <div className="search-engine-menu" role="listbox" aria-label="选择搜索引擎">
            <header><strong>搜索引擎</strong><small>{enabled.length} 个已启用</small></header>
            {enabled.map((engine) => {
              const selected = engine.id === active?.id;
              return (
                <button
                  type="button"
                  key={engine.id}
                  className={selected ? 'is-selected' : ''}
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onEngineChange(engine.id);
                    setEngineMenuOpen(false);
                  }}
                >
                  <SearchEngineIcon engine={engine} />
                  <span><strong>{engine.name}</strong><small>{engine.shortcut || '搜索'}</small></span>
                  {selected && <Check size={16} />}
                </button>
              );
            })}
            <button
              type="button"
              className="search-engine-menu__manage"
              onClick={() => {
                setEngineMenuOpen(false);
                onManage();
              }}
            >
              <Settings2 size={15} /> 管理搜索引擎
            </button>
          </div>
        )}
      </div>

      <input
        value={query}
        role="combobox"
        aria-controls="unified-search-suggestions"
        aria-expanded={suggestionsOpen}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? flattenedItems[activeIndex]?.id : undefined}
        onFocus={() => {
          setSuggestionsOpen(true);
          setEngineMenuOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setRemoteSuggestions([]);
          setLocalResults(EMPTY_LOCAL_RESULTS);
          setSuggestionsOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleInputKeyDown}
        placeholder={active ? `使用 ${active.name} 搜索网页、标签页、历史和书签` : '请先启用一个搜索引擎'}
        aria-label="搜索内容"
        autoComplete="off"
      />
      <button type="submit" aria-label="搜索"><Search size={18} /></button>

      {suggestionsOpen && (
        <div className="search-suggestions" id="unified-search-suggestions" role="listbox" aria-label="预搜索结果">
          <header className="search-suggestions__header">
            <strong>{query.trim() ? '预搜索' : '快速继续'}</strong>
            <span>{loading ? '正在联想…' : '↑↓ 选择 · Enter 打开'}</span>
          </header>
          {groups.length > 0 ? groups.map((group) => (
            <section className="search-suggestion-group" key={group.id} aria-label={group.label}>
              <h3>{group.label}</h3>
              {group.items.map((item) => {
                const itemIndex = flattenedItems.findIndex((candidate) => candidate.id === item.id);
                return (
                  <button
                    key={item.id}
                    id={item.id}
                    type="button"
                    role="option"
                    aria-selected={itemIndex === activeIndex}
                    className={itemIndex === activeIndex ? 'is-active' : ''}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onClick={(event) => void executeSuggestion(item, shouldOpenNewTab(event))}
                  >
                    <SuggestionIcon item={item} activeEngine={active} />
                    <span className="search-suggestion__copy">
                      <strong>{item.title}</strong>
                      <small>{suggestionSubtitle(item, active)}</small>
                    </span>
                    <span className="search-suggestion__kind">{suggestionKind(item)}</span>
                  </button>
                );
              })}
            </section>
          )) : (
            <div className="search-suggestions__empty"><Search size={18} /><span>{loading ? '正在获取建议…' : '输入关键词开始搜索'}</span></div>
          )}
          <footer>远程联想由当前搜索引擎提供；本地结果不会上传。</footer>
        </div>
      )}
    </form>
  );
}

function SuggestionIcon({ item, activeEngine }: { item: SuggestionItem; activeEngine?: SearchEngine }) {
  if ((item.kind === 'search' || item.kind === 'remote') && activeEngine) return <SearchEngineIcon engine={activeEngine} size={22} />;
  return 'url' in item
    ? <BookmarkFavicon className="search-suggestion__favicon" url={item.url} title={item.title} size={22} />
    : <span className="search-suggestion__source-icon"><Search size={16} /></span>;
}

function suggestionSubtitle(item: SuggestionItem, activeEngine?: SearchEngine) {
  if (item.kind === 'search') return `直接使用 ${activeEngine?.name ?? '当前引擎'} 搜索`;
  if (item.kind === 'remote') return '远程联想词';
  return 'subtitle' in item ? item.subtitle : '';
}

function suggestionKind(item: SuggestionItem) {
  if (item.kind === 'search' || item.kind === 'remote') return '搜索';
  if (item.kind === 'tab') return '切换';
  if (item.kind === 'bookmark') return '书签';
  return '历史';
}

function shouldOpenNewTab(event: MouseEvent<HTMLButtonElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
}

function openUrl(url: string, newTab: boolean) {
  if (newTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.assign(url);
}
