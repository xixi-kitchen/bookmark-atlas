import { AlertTriangle, X } from 'lucide-react';
import type { BookmarkNode } from '../bookmarks/types';

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
          <h2 id="delete-title">确认删除</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal__body">
          <AlertTriangle size={30} />
          <p>将删除“{node.title || '未命名'}”{descendants > 0 ? `以及其中的 ${descendants} 个项目` : ''}。删除会立即同步到 Chrome 书签。</p>
        </div>
        <footer className="modal__footer">
          <button className="secondary-button" onClick={onClose}>取消</button>
          <button className="danger-button" onClick={() => void onConfirm()}>删除</button>
        </footer>
      </section>
    </div>
  );
}

function countDescendants(node: BookmarkNode): number {
  return (node.children ?? []).reduce((total, child) => total + 1 + countDescendants(child), 0);
}
