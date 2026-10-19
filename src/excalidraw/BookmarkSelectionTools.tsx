import { useEffect, useState } from 'react';
import { AlignHorizontalJustifyCenter, Check, FileText, X } from 'lucide-react';
import { t } from '../i18n';
import { MAX_BOOKMARK_DESCRIPTION_LENGTH, type BookmarkPresentation } from './bookmarkDisplay';

type Props = {
  count: number;
  presentation: BookmarkPresentation | 'mixed';
  description: string;
  onPresentation: (presentation: BookmarkPresentation) => void;
  onDescription: (description: string) => void;
  onLayout: () => void;
  onAI?: () => void;
};

export function BookmarkSelectionTools({ count, presentation, description, onPresentation, onDescription, onLayout, onAI }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  useEffect(() => { setDraft(description); setEditing(false); }, [description, count]);
  return (
    <div className="atlas-bookmark-tools" role="toolbar" aria-label={t('bookmarkSelectionTools')}>
      <span className="atlas-bookmark-tools__count">{t('selectedBookmarksCount', String(count))}</span>
      <div className="segmented" role="group" aria-label={t('bookmarkDisplay')}>
        {(['icon', 'compact', 'detailed'] as const).map((value) => (
          <button type="button" key={value} aria-pressed={presentation === value} className={presentation === value ? 'is-active' : ''}
            onClick={() => onPresentation(value)}>{t(value === 'icon' ? 'bookmarkDisplayIcon' : value === 'compact' ? 'bookmarkDisplayCompact' : 'bookmarkDisplayDetailed')}</button>
        ))}
      </div>
      <button type="button" disabled={count !== 1} title={count === 1 ? t('bookmarkDescription') : t('descriptionSelectOne')}
        onClick={() => setEditing((value) => !value)}><FileText size={15} />{t('bookmarkDescription')}</button>
      <button type="button" disabled={count < 2} onClick={onLayout}><AlignHorizontalJustifyCenter size={15} />{t('previewBookmarkLayout')}</button>
      {onAI && <button type="button" onClick={onAI}>{t('aiOrganize')}</button>}
      {editing && (
        <form className="atlas-bookmark-description" onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); setEditing(false); }
        }} onSubmit={(event) => { event.preventDefault(); onDescription(draft); setEditing(false); }}>
          <label htmlFor="atlas-bookmark-description">{t('bookmarkDescription')}</label>
          <textarea id="atlas-bookmark-description" value={draft} autoFocus rows={3} onChange={(event) => setDraft(Array.from(event.target.value).slice(0, MAX_BOOKMARK_DESCRIPTION_LENGTH).join(''))} />
          <footer><small>{Array.from(draft).length}/{MAX_BOOKMARK_DESCRIPTION_LENGTH}</small>
            <button type="button" aria-label={t('cancel')} onClick={() => setEditing(false)}><X size={15} /></button>
            <button type="submit"><Check size={15} />{t('save')}</button></footer>
        </form>
      )}
    </div>
  );
}
