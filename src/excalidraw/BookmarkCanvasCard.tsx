import { useEffect, useRef } from 'react';
import { BookmarkFavicon } from '../components/BookmarkFavicon';
import { t } from '../i18n';
import type { BookmarkPresentation } from './bookmarkDisplay';
import { forwardBookmarkPointerDown, getBookmarkDisplayUrl, getSafeBookmarkUrl, isBookmarkClickGesture, type BookmarkPointer } from './bookmarkNavigation';
import './BookmarkCanvasCard.css';

export type BookmarkCanvasCardProps = {
  title: string;
  url: string;
  folderPath?: string;
  description?: string;
  presentation?: BookmarkPresentation;
  matchStatus: 'matched' | 'missing' | 'ambiguous';
  selected?: boolean;
  onOpen?: () => void;
};

export function BookmarkCanvasCard({ title, url, folderPath, description, presentation = 'detailed', matchStatus, selected = false, onOpen }: BookmarkCanvasCardProps) {
  const name = title || t('unnamedBookmark');
  const safeUrl = getSafeBookmarkUrl(url);
  const displayUrl = getBookmarkDisplayUrl(url);
  const pointer = useRef<{ start: BookmarkPointer; maximumDistance: number } | null>(null);
  const forwardedPointer = useRef(false);
  const cleanupPointer = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupPointer.current?.(), []);
  return (
    <div data-learning-target="bookmark" className={`atlas-bookmark-embed is-${presentation} ${matchStatus !== 'matched' ? 'is-missing' : ''}`}
      title={[name, displayUrl, description, folderPath].filter(Boolean).join('\n')}>
      {safeUrl && onOpen ? <a data-learning-target="bookmark-open" className="atlas-bookmark-embed__icon" href={safeUrl} target="_blank" rel="noopener noreferrer"
        aria-label={t('openBookmarkIcon', name)} tabIndex={selected ? 0 : -1} draggable={false}
        onPointerDown={(event) => {
          cleanupPointer.current?.();
          const start = {
            clientX: event.clientX, clientY: event.clientY, button: event.button, pointerId: event.pointerId,
            altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, detail: event.detail,
          };
          pointer.current = { start, maximumDistance: 0 };
          const move = (native: PointerEvent) => {
            if (!pointer.current || native.pointerId !== start.pointerId) return;
            pointer.current.maximumDistance = Math.max(pointer.current.maximumDistance, Math.hypot(native.clientX - start.clientX, native.clientY - start.clientY));
          };
          const cancel = () => { pointer.current = null; cleanupPointer.current?.(); };
          const end = () => cleanupPointer.current?.();
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', end, { once: true });
          window.addEventListener('pointercancel', cancel, { once: true });
          window.addEventListener('blur', cancel, { once: true });
          cleanupPointer.current = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('blur', cancel);
            cleanupPointer.current = null;
          };
          // Without this bridge, DOM favicons consume the event and native dragging
          // never begins. Native pointer capture delivers the real pointerup.
          forwardedPointer.current = forwardBookmarkPointerDown(event.currentTarget, event.nativeEvent);
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onOpen(); }
        }} onClick={(event) => {
          event.preventDefault(); event.stopPropagation();
          const gesture = pointer.current;
          pointer.current = null;
          // A forwarded native gesture is handled once by useBookmarkNavigation.
          // This DOM fallback also supports keyboard/assistive click activation.
          if (event.detail === 0 || (!forwardedPointer.current && event.detail === 1
            && isBookmarkClickGesture(gesture?.start ?? event, event, gesture?.maximumDistance))) onOpen();
          forwardedPointer.current = false;
        }}>
        <BookmarkFavicon title={name} url={url} size={presentation === 'icon' ? 42 : 36} className="atlas-bookmark-embed__favicon" />
      </a> : <span className="atlas-bookmark-embed__icon" aria-label={name}>
        <BookmarkFavicon title={name} url={url} size={presentation === 'icon' ? 42 : 36} className="atlas-bookmark-embed__favicon" />
      </span>}
      {presentation !== 'icon' && (
        <div className="atlas-bookmark-embed__copy">
          <strong>{name}</strong>
        </div>
      )}
      {presentation === 'detailed' && description && <p className="atlas-bookmark-embed__description">{description}</p>}
      {presentation === 'detailed' && <span className="atlas-bookmark-embed__url">{displayUrl}</span>}
      {matchStatus !== 'matched' && <small className="atlas-bookmark-embed__warning" role="status">{t(matchStatus === 'missing' ? 'bookmarkMatchMissing' : 'bookmarkMatchAmbiguous')}</small>}
    </div>
  );
}
