import { AlertTriangle, X } from 'lucide-react';
import type { BookmarkNode } from '../bookmarks/types';
import { t } from '../i18n';

type Props = {
  node: BookmarkNode;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function DeleteConfirm({ node, onConfirm, onClose }: Props) {
  const descendants = countDescendants(node);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <header className="modal__header">
          <h2 id="delete-title">{t('confirmDelete')}</h2>
          <button className="icon-button" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>
        <div className="modal__body">
          <AlertTriangle size={30} />
          <p>{t('deleteConfirmBody', [
            node.title || t('unnamed'),
            descendants > 0 ? t('deleteConfirmDescendants', String(descendants)) : '',
          ])}</p>
        </div>
        <footer className="modal__footer">
          <button className="secondary-button" onClick={onClose}>{t('cancel')}</button>
          <button className="danger-button" onClick={() => void onConfirm()}>{t('delete')}</button>
        </footer>
      </section>
    </div>
  );
}

function countDescendants(node: BookmarkNode): number {
  return (node.children ?? []).reduce((total, child) => total + 1 + countDescendants(child), 0);
}
