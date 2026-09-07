import { ArrowLeft, Home } from 'lucide-react';
import type { BookmarkNode } from '../../bookmarks/types';
import {
  buildBreadcrumbPath,
  countFolderItems,
  countNodeMapTopItems,
} from './navigationUtils';
import { t } from '../../i18n';

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
  rootLabel = t('allBookmarks'),
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
          aria-label={t('goBack')}
          disabled={!currentFolder}
          onClick={() => onNavigate?.(parentFolder)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button
          className="view-breadcrumb__button"
          type="button"
          aria-label={t('goTop')}
          disabled={!currentFolder}
          onClick={() => onNavigate?.()}
        >
          <Home size={16} aria-hidden="true" />
        </button>
      </div>

      <nav className="view-breadcrumb__trail" aria-label={t('currentLocation')}>
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
              {folder.title || t('unnamedFolder')}
            </button>
          );
        })}
      </nav>

      <div className="view-breadcrumb__summary" aria-live="polite">
        <strong>{title}</strong>
        <span>{t('directItemCount', String(count.direct))}</span>
        <span>{t('totalItemCount', String(count.total))}</span>
      </div>
    </header>
  );
}
