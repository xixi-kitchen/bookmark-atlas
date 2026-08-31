import { ArrowLeft, Home } from 'lucide-react';
import type { BookmarkNode } from '../../bookmarks/types';
import {
  buildBreadcrumbPath,
  countFolderItems,
  countNodeMapTopItems,
} from './navigationUtils';

export type ViewBreadcrumbProps = {
  nodes: Record<string, BookmarkNode>;
  currentFolderId?: string;
  rootLabel?: string;
  className?: string;
  onNavigate?: (folder?: BookmarkNode) => void;
};

export function ViewBreadcrumb({
  nodes,
  currentFolderId,
  rootLabel = '全部书签',
  className = '',
  onNavigate,
}: ViewBreadcrumbProps) {
  const path = buildBreadcrumbPath(nodes, currentFolderId);
  const currentFolder = path.at(-1);
  const parentFolder = path.at(-2);
  const count = currentFolder ? countFolderItems(currentFolder) : countNodeMapTopItems(nodes);
  const title = currentFolder?.title || rootLabel;
  const classes = ['view-breadcrumb', className].filter(Boolean).join(' ');

  return (
    <header className={classes}>
      <div className="view-breadcrumb__controls">
        <button
          className="view-breadcrumb__button"
          type="button"
          aria-label="后退"
          disabled={!currentFolder}
          onClick={() => onNavigate?.(parentFolder)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button
          className="view-breadcrumb__button"
          type="button"
          aria-label="回到顶层"
          disabled={!currentFolder}
          onClick={() => onNavigate?.()}
        >
          <Home size={16} aria-hidden="true" />
        </button>
      </div>

      <nav className="view-breadcrumb__trail" aria-label="当前位置">
        <button
          className="view-breadcrumb__crumb"
          type="button"
          aria-current={!currentFolder ? 'page' : undefined}
          onClick={() => onNavigate?.()}
        >
          {rootLabel}
        </button>
        {path.map((folder) => {
          const active = folder.id === currentFolder?.id;
          return (
            <button
              key={folder.id}
              className={`view-breadcrumb__crumb ${active ? 'is-current' : ''}`.trim()}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate?.(folder)}
            >
              {folder.title || '未命名文件夹'}
            </button>
          );
        })}
      </nav>

      <div className="view-breadcrumb__summary" aria-live="polite">
        <strong>{title}</strong>
        <span>{count.direct} 个直接项目</span>
        <span>{count.total} 个总项目</span>
      </div>
    </header>
  );
}
