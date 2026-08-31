import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { BookmarkCreateInput, BookmarkNode } from '../bookmarks/types';

type Props = {
  node?: BookmarkNode;
  folders: BookmarkNode[];
  initialParentId?: string;
  onSave: (value: BookmarkCreateInput) => Promise<void> | void;
  onClose: () => void;
};

export function BookmarkEditor({ node, folders, initialParentId, onSave, onClose }: Props) {
  const editing = Boolean(node);
  const [kind, setKind] = useState<'bookmark' | 'folder'>(node?.url ? 'bookmark' : 'folder');
  const [title, setTitle] = useState(node?.title ?? '');
  const [url, setUrl] = useState(node?.url ?? 'https://');
  const [parentId, setParentId] = useState(node?.parentId ?? initialParentId ?? folders[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const destinationFolders = useMemo(() => {
    const blockedIds = new Set<string>(node ? [node.id, ...collectDescendantIds(node)] : []);
    return folders.filter((folder) => (
      folder.readonlyReason !== 'root'
      && folder.readonlyReason !== 'managed'
      && !blockedIds.has(folder.id)
    ));
  }, [folders, node]);
  const validation = useMemo(() => {
    if (!title.trim()) return '请输入名称。';
    if (kind === 'bookmark') {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '书签只允许 http 或 https 地址。';
      } catch {
        return '请输入有效的网址。';
      }
    }
    return null;
  }, [kind, title, url]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (validation || busy) return;
    setBusy(true);
    try {
      await onSave({
        parentId,
        title: title.trim(),
        url: kind === 'bookmark' ? url.trim() : undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="bookmark-editor-title" onSubmit={submit}>
        <header className="modal__header">
          <h2 id="bookmark-editor-title">{editing ? '编辑书签' : '新建项目'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal__body">
          {!editing && (
            <div className="segmented" aria-label="项目类型">
              <button type="button" className={kind === 'bookmark' ? 'is-active' : ''} onClick={() => setKind('bookmark')}>书签</button>
              <button type="button" className={kind === 'folder' ? 'is-active' : ''} onClick={() => setKind('folder')}>文件夹</button>
            </div>
          )}
          <div className="form-field">
            <label htmlFor="bookmark-title">名称</label>
            <input id="bookmark-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
          </div>
          {kind === 'bookmark' && (
            <div className="form-field">
              <label htmlFor="bookmark-url">网址</label>
              <input id="bookmark-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} />
            </div>
          )}
          <div className="form-field">
              <label htmlFor="bookmark-parent">{editing ? '所属文件夹' : '保存到'}</label>
              <select id="bookmark-parent" value={parentId} onChange={(event) => setParentId(event.target.value)}>
                {destinationFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{'—'.repeat(folder.depth ?? 0)} {folder.title || '根目录'}</option>
                ))}
              </select>
            </div>
          {validation && <p className="form-error">{validation}</p>}
        </div>
        <footer className="modal__footer">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={Boolean(validation) || busy}>{busy ? '保存中…' : '保存'}</button>
        </footer>
      </form>
    </div>
  );
}

function collectDescendantIds(node: BookmarkNode): string[] {
  return (node.children ?? []).flatMap((child) => [child.id, ...collectDescendantIds(child)]);
}
