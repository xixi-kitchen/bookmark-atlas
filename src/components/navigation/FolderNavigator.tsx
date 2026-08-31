import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Search } from 'lucide-react';
import type { BookmarkNode } from '../../bookmarks/types';
import {
  countFolderItems,
  countRootItems,
  folderMatchesQuery,
  isFolderNode,
} from './navigationUtils';

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
  rootLabel = '全部书签',
  searchPlaceholder = '筛选文件夹',
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
    <nav className={classes} aria-label="书签文件夹导航">
      <label className="view-navigator__search">
        <Search size={15} aria-hidden="true" />
        <span className="view-navigator__search-label">搜索文件夹</span>
        <input
          type="search"
          value={query}
          placeholder={searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="folder-tree" role="tree" aria-label="文件夹树">
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
          <p className="folder-tree__empty">没有匹配的文件夹</p>
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
          aria-label={`${expanded ? '折叠' : '展开'} ${folder.title || '未命名文件夹'}`}
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
          <span className="folder-tree__title">{folder.title || '未命名文件夹'}</span>
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
