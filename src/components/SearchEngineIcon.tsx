import { BookmarkFavicon } from './BookmarkFavicon';
import { getSearchEnginePageUrl, type SearchEngine } from '../search';
import { Search } from 'lucide-react';
import { t } from '../i18n';

export function SearchEngineIcon({ engine, size = 20 }: { engine: SearchEngine; size?: number }) {
  if (engine.kind === 'chrome-default') {
    return (
      <span className="search-engine-icon search-engine-icon--default" style={{ width: size, height: size }} aria-label={t('chromeDefaultSearchEngine')} role="img">
        <Search size={Math.max(12, size - 6)} />
      </span>
    );
  }
  return (
    <BookmarkFavicon
      className="search-engine-icon"
      url={getSearchEnginePageUrl(engine)}
      title={engine.name}
      size={size}
    />
  );
}
