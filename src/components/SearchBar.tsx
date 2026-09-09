import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type Ref } from 'react';
import { Check, ChevronDown, Search, Settings2 } from 'lucide-react';
import { activateBrowserSearchResult, searchLocalBrowserContent, type BrowserSearchGroups, type BrowserSearchResult } from '../search/browserSearch';
import { fetchRemoteSuggestions, runSearch, type SearchEngine } from '../search';
import { SearchEngineIcon } from './SearchEngineIcon';
import { BookmarkFavicon } from './BookmarkFavicon';
import { t } from '../i18n';

type Props = {
  engines: SearchEngine[];
  activeEngineId: string;
  onEngineChange: (id: string) => void;
  onManage: () => void;
  inputRef?: Ref<HTMLInputElement>;
};

type SearchAction = { id: string; kind: 'search' | 'remote'; title: string };
type SuggestionItem = SearchAction | BrowserSearchResult;
type SuggestionGroup = { id: string; label: string; items: SuggestionItem[] };

const EMPTY_LOCAL_RESULTS: BrowserSearchGroups = { tabs: [], bookmarks: [], history: [] };

export function SearchBar({ engines, activeEngineId, onEngineChange, onManage, inputRef }: Props) {
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
        label: active?.kind === 'chrome-default' ? t('defaultEngineSuggestions') : active ? t('engineSuggestions', active.name) : t('searchSuggestions'),
        items: trimmedQuery && active
          ? [
              { id: `search:${trimmedQuery}`, kind: 'search' as const, title: trimmedQuery },
              ...remoteSuggestions.map((title, index) => ({ id: `remote:${index}:${title}`, kind: 'remote' as const, title })),
            ]
          : [],
      },
      { id: 'tabs', label: t('openTabs'), items: localResults.tabs },
      { id: 'bookmarks', label: t('chromeBookmarks'), items: localResults.bookmarks },
      { id: 'history', label: trimmedQuery ? t('browsingHistory') : t('recentVisits'), items: localResults.history },
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
          aria-label={t('switchSearchEngine')}
          aria-haspopup="listbox"
          aria-expanded={engineMenuOpen}
          onClick={() => {
            setEngineMenuOpen((open) => !open);
            setSuggestionsOpen(false);
          }}
        >
          {active ? <SearchEngineIcon engine={active} /> : <span className="search-engine-mark">?</span>}
          <span>{active?.name ?? t('noSearchEngineSelected')}</span>
          <ChevronDown size={14} />
        </button>
        {engineMenuOpen && (
          <div className="search-engine-menu" role="listbox" aria-label={t('selectSearchEngine')}>
            <header><strong>{t('searchEngines')}</strong><small>{t('enabledEnginesCount', String(enabled.length))}</small></header>
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
                  <span><strong>{engine.name}</strong><small>{engine.shortcut || t('searchShortcut')}</small></span>
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
              <Settings2 size={15} /> {t('manageSearchEngines')}
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
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
        placeholder={active ? t('searchPlaceholder', active.name) : t('searchPlaceholderNoEngine')}
        aria-label={t('searchContent')}
        autoComplete="off"
      />
      <button type="submit" aria-label={t('search')}><Search size={18} /></button>

      {suggestionsOpen && (
        <div className="search-suggestions" id="unified-search-suggestions" role="listbox" aria-label={t('predictiveResults')}>
          <header className="search-suggestions__header">
            <strong>{query.trim() ? t('predictiveResults') : t('quickContinue')}</strong>
            <span>{loading ? t('loadingSuggestions') : t('chooseOpenHint')}</span>
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
            <div className="search-suggestions__empty"><Search size={18} /><span>{loading ? t('loadingSuggestions') : t('noSuggestionsYet')}</span></div>
          )}
          <footer>{t('suggestionPrivacyNote')}</footer>
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
  if (item.kind === 'search') return t('searchDirectlyWith', activeEngine?.name ?? t('searchEngines'));
  if (item.kind === 'remote') return t('remoteSuggestionTerm');
  return 'subtitle' in item ? item.subtitle : '';
}

function suggestionKind(item: SuggestionItem) {
  if (item.kind === 'search' || item.kind === 'remote') return t('suggestionKindSearch');
  if (item.kind === 'tab') return t('suggestionKindSwitch');
  if (item.kind === 'bookmark') return t('suggestionKindBookmark');
  return t('suggestionKindHistory');
}

function shouldOpenNewTab(event: MouseEvent<HTMLButtonElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
}

function openUrl(url: string, newTab: boolean) {
  if (newTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.assign(url);
}
