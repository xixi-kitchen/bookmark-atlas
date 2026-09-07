import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Search } from 'lucide-react';
import type { BookmarkNode } from '../../bookmarks/types';
import {
  countFolderItems,
  countRootItems,
  folderMatchesQuery,
  isFolderNode,
} from './navigationUtils';
import { t } from '../../i18n';

export type FolderNavigatorProps = {
  roots: BookmarkNode[];
  selectedFolderId?: string;
  rootLabel?: string;
  searchPlaceholder?: string;
  className?: string;
  onSelectFolder?: (folder?: BookmarkNode) => void;
};

export function FolderNavigator({
  roots,
  selectedFolderId,
  rootLabel = t('allBookmarks'),
  searchPlaceholder = t('filterFolders'),
  className = '',
  onSelectFolder,
}: FolderNavigatorProps) {
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(roots.filter(isFolderNode).map((folder) => folder.id)),
  );
  const rootCount = countRootItems(roots);
  const normalizedQuery = query.trim();
  const folders = useMemo(
    () => roots.filter(isFolderNode).filter((node) => folderMatchesQuery(node, normalizedQuery)),
    [roots, normalizedQuery],
  );

  const toggleFolder = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const classes = ['view-navigator', className].filter(Boolean).join(' ');

  return (
    <nav className={classes} aria-label={t('folderNavigator')}>
      <label className="view-navigator__search">
        <Search size={15} aria-hidden="true" />
        <span className="view-navigator__search-label">{t('searchFolders')}</span>
        <input
          type="search"
          value={query}
          placeholder={searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="folder-tree" role="tree" aria-label={t('folderTree')}>
        <button
          className={`folder-tree__button ${selectedFolderId ? '' : 'is-selected'}`.trim()}
          type="button"
          role="treeitem"
          aria-selected={!selectedFolderId}
          onClick={() => onSelectFolder?.()}
        >
          <Folder size={16} aria-hidden="true" />
          <span className="folder-tree__title">{rootLabel}</span>
          <span className="folder-tree__count">{rootCount.direct} / {rootCount.total}</span>
        </button>

        {folders.length ? (
          folders.map((folder) => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              depth={0}
              expandedIds={expandedIds}
              selectedFolderId={selectedFolderId}
              query={normalizedQuery}
              onToggle={toggleFolder}
              onSelectFolder={onSelectFolder}
            />
          ))
        ) : (
          <p className="folder-tree__empty">{t('noMatchingFolders')}</p>
        )}
      </div>
    </nav>
  );
}

type FolderTreeItemProps = {
  folder: BookmarkNode;
  depth: number;
  expandedIds: Set<string>;
  selectedFolderId?: string;
  query: string;
  onToggle: (id: string) => void;
  onSelectFolder?: (folder: BookmarkNode) => void;
};

function FolderTreeItem({
  folder,
  depth,
  expandedIds,
  selectedFolderId,
  query,
  onToggle,
  onSelectFolder,
}: FolderTreeItemProps) {
  const childFolders = (folder.children ?? []).filter(isFolderNode).filter((node) => folderMatchesQuery(node, query));
  const hasChildFolders = childFolders.length > 0;
  const expanded = query ? true : expandedIds.has(folder.id);
  const selected = selectedFolderId === folder.id;
  const count = countFolderItems(folder);

  return (
    <div className="folder-tree__item" role="none" data-depth={depth}>
      <div className="folder-tree__row">
        <button
          className="folder-tree__toggle"
          type="button"
          aria-label={expanded ? t('collapseFolder', folder.title || t('unnamedFolder')) : t('expandFolder', folder.title || t('unnamedFolder'))}
          aria-expanded={expanded}
          disabled={!hasChildFolders}
          onClick={() => onToggle(folder.id)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button
          className={`folder-tree__button ${selected ? 'is-selected' : ''}`.trim()}
          type="button"
          role="treeitem"
          aria-selected={selected}
          aria-level={depth + 1}
          onClick={() => onSelectFolder?.(folder)}
        >
          <Folder size={16} aria-hidden="true" />
          <span className="folder-tree__title">{folder.title || t('unnamedFolder')}</span>
          <span className="folder-tree__count">{count.direct} / {count.total}</span>
        </button>
      </div>

      {hasChildFolders && expanded && (
        <div className="folder-tree__children" role="group">
          {childFolders.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedFolderId={selectedFolderId}
              query={query}
              onToggle={onToggle}
              onSelectFolder={onSelectFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
