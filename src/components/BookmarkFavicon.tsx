import { useEffect, useMemo, useState } from 'react';
import type { BookmarkNode } from '../bookmarks/types';
import { t } from '../i18n';

export type BookmarkFaviconProps = {
  node?: Pick<BookmarkNode, 'title' | 'url'>;
  url?: string;
  title?: string;
  size?: number;
  className?: string;
};

const DEFAULT_SIZE = 24;
const MIN_SIZE = 12;
const MAX_SIZE = 64;

export function BookmarkFavicon({
  node,
  url,
  title,
  size = DEFAULT_SIZE,
  className = '',
}: BookmarkFaviconProps) {
  const resolvedUrl = url ?? node?.url ?? '';
  const resolvedTitle = title ?? node?.title ?? '';
  const iconSize = clampSize(size);
  const [failed, setFailed] = useState(false);

  const faviconUrl = useMemo(
    () => buildChromeFaviconUrl(resolvedUrl, iconSize),
    [resolvedUrl, iconSize],
  );
  const fallback = getFallbackLabel(resolvedUrl, resolvedTitle);

  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  const classes = ['bookmark-favicon', className].filter(Boolean).join(' ');
  const style = {
    width: iconSize,
    height: iconSize,
    fontSize: Math.max(10, Math.round(iconSize * 0.46)),
  };

  if (!faviconUrl || failed) {
    return (
      <span
        className={`${classes} bookmark-favicon--fallback`}
        style={style}
        aria-label={t('faviconAlt', resolvedTitle || fallback)}
        role="img"
      >
        {fallback}
      </span>
    );
  }

  return (
    <span className={classes} style={style}>
      <img
        src={faviconUrl}
        width={iconSize}
        height={iconSize}
        alt={t('faviconAlt', resolvedTitle || fallback)}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export function buildChromeFaviconUrl(pageUrl: string, size = DEFAULT_SIZE) {
  if (!isLikelyHttpUrl(pageUrl)) return '';

  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) return '';

  const params = new URLSearchParams({
    pageUrl,
    size: String(clampSize(size)),
  });

  return runtime.getURL(`_favicon/?${params.toString()}`);
}

function getFallbackLabel(pageUrl: string, title: string) {
  const hostInitial = getHostname(pageUrl).replace(/^www\./, '').charAt(0);
  const titleInitial = title.trim().charAt(0);
  return (hostInitial || titleInitial || '?').toUpperCase();
}

function getHostname(pageUrl: string) {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return '';
  }
}

function isLikelyHttpUrl(pageUrl: string) {
  try {
    const protocol = new URL(pageUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function clampSize(size: number) {
  if (!Number.isFinite(size)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
}
