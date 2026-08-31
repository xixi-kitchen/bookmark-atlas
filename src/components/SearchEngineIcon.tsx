import { BookmarkFavicon } from './BookmarkFavicon';
import { getSearchEnginePageUrl, type SearchEngine } from '../search';
import { Search } from 'lucide-react';

export function SearchEngineIcon({ engine, size = 20 }: { engine: SearchEngine; size?: number }) {
  if (engine.kind === 'chrome-default') {
    return (
      <span className="search-engine-icon search-engine-icon--default" style={{ width: size, height: size }} aria-label="Chrome 默认搜索引擎" role="img">
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
