import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, DatabaseBackup, Maximize2, MoreHorizontal } from 'lucide-react';
import { t } from '../i18n';

type Props = {
  onFitAll: () => void;
  onFocusBookmarks: () => void;
  onBackup: () => void;
};

export function CanvasActionsMenu({ onFitAll, onFocusBookmarks, onBackup }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  };

  return (
    <div className="atlas-canvas-more" ref={rootRef} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <button ref={triggerRef} type="button" className="atlas-excalidraw-button is-secondary is-icon"
        aria-label={t('canvasMoreActions')} title={t('canvasMoreActions')} aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
      {open && (
        <div ref={panelRef} className="atlas-canvas-more__panel" role="dialog" aria-label={t('canvasMoreActions')}>
          <button type="button" onClick={() => run(onFitAll)}><Maximize2 size={16} />{t('fitAllElements')}</button>
          <button type="button" onClick={() => run(onFocusBookmarks)}><BookmarkPlus size={16} />{t('focusAllBookmarks')}</button>
          <button type="button" onClick={() => run(onBackup)}><DatabaseBackup size={16} />{t('fullBackup')}</button>
        </div>
      )}
    </div>
  );
}
