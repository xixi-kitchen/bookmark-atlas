import { ExternalLink, Link2, MousePointer2, RefreshCw, Youtube } from 'lucide-react';
import { useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';

export const WEB_EMBED_ALLOW = [
  'accelerometer',
  'autoplay',
  'camera',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'usb',
  'web-share',
  'xr-spatial-tracking',
].join('; ');

type Props = {
  elementId: string;
  url: string;
  active: boolean;
  onExitInteraction?: () => void;
};

export function WebEmbed({ elementId, url, active, onExitInteraction }: Props) {
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const src = resolveWebEmbedUrl(url);
  const embedIssue = getWebEmbedIssue(url);
  const stopPointer = (event: PointerEvent | MouseEvent) => event.stopPropagation();

  const refresh = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    setLoading(true);
    setRefreshRevision((revision) => revision + 1);
  };

  const openExternally = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const exitInteraction = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    onExitInteraction?.();
  };

  return (
    <div
      className={`atlas-web-embed ${active ? 'is-active' : ''}`}
      data-web-embed-id={elementId}
      data-interactive={active ? 'true' : 'false'}
      onPointerDown={stopPointer}
      onWheel={(event: WheelEvent<HTMLDivElement>) => event.stopPropagation()}
    >
      {active && (
        <div className="atlas-web-embed__toolbar" role="toolbar" aria-label="嵌入网页操作">
          <span className="atlas-web-embed__status">网页交互中</span>
          {!embedIssue && (
            <button type="button" onPointerDown={stopPointer} onClick={refresh} aria-label="刷新这个嵌入网页" title="刷新这个嵌入网页">
              <RefreshCw size={14} className={loading ? 'is-spinning' : ''} />
            </button>
          )}
          <button type="button" onPointerDown={stopPointer} onClick={openExternally} aria-label="在新标签页打开" title="在新标签页打开">
            <ExternalLink size={14} />
          </button>
          <button type="button" onPointerDown={stopPointer} onClick={exitInteraction} aria-label="退出网页交互" title="退出网页交互（也可按 Esc）">
            <MousePointer2 size={14} />
          </button>
        </div>
      )}

      <div className="atlas-web-embed__viewport">
        {embedIssue ? (
          <div className="atlas-web-embed__provider-note" role="note" aria-label={embedIssue.title}>
            <div className="atlas-web-embed__provider-icon"><Youtube size={34} strokeWidth={2.2} /></div>
            <div className="atlas-web-embed__provider-copy">
              <span>YouTube iframe</span>
              <strong>{embedIssue.title}</strong>
              <p>{embedIssue.description}</p>
            </div>
            <div className="atlas-web-embed__provider-formats" aria-label="支持的 YouTube 链接类型">
              <span><Link2 size={12} /> 视频</span>
              <span><Link2 size={12} /> Shorts</span>
              <span><Link2 size={12} /> 直播</span>
              <span><Link2 size={12} /> 播放列表</span>
            </div>
            <button type="button" onPointerDown={stopPointer} onClick={openExternally}>
              <ExternalLink size={14} /> 在 YouTube 打开
            </button>
          </div>
        ) : (
          <iframe
            key={`${elementId}:${src}:${refreshRevision}`}
            className="atlas-web-embed__frame"
            src={src}
            title={`嵌入网页：${hostname(url) || url}`}
            scrolling="auto"
            referrerPolicy="strict-origin-when-cross-origin"
            allow={WEB_EMBED_ALLOW}
            loading="eager"
            onLoad={() => setLoading(false)}
          />
        )}

        {!active && !embedIssue && (
          <div className="atlas-web-embed__interaction-hint" aria-hidden="true">
            点击中央进入网页交互
          </div>
        )}
      </div>
    </div>
  );
}

export function resolveWebEmbedUrl(link: string): string {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      if (videoId) return youtubeEmbedUrl(videoId, url);
    }

    if (isYoutubeHost(host)) {
      const segments = url.pathname.split('/').filter(Boolean);
      const videoId = url.searchParams.get('v')
        ?? (['shorts', 'embed', 'live'].includes(segments[0] ?? '') ? segments[1] : undefined);
      const playlistId = url.searchParams.get('list');
      if (videoId) return youtubeEmbedUrl(videoId, url);
      if (playlistId) return `https://www.youtube.com/embed?listType=playlist&list=${encodeURIComponent(playlistId)}&playsinline=1&widget_referrer=${encodeURIComponent(YOUTUBE_CLIENT_IDENTITY)}`;
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const videoId = url.pathname.split('/').filter(Boolean).find((segment) => /^\d+$/.test(segment));
      if (videoId) return `https://player.vimeo.com/video/${videoId}?api=1`;
    }

    if (host === 'figma.com') {
      return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url.toString())}`;
    }

    if (host === 'val.town' && url.pathname.startsWith('/v/')) {
      url.pathname = url.pathname.replace(/^\/v\//, '/embed/');
      return url.toString();
    }

    return url.toString();
  } catch {
    return link;
  }
}

export function getWebEmbedIssue(link: string): { title: string; description: string } | null {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!isYoutubeHost(host) && host !== 'youtu.be') return null;
    if (resolveWebEmbedUrl(link) !== url.toString()) return null;

    return {
      title: 'YouTube 首页不能直接嵌入',
      description: 'YouTube 只开放具体内容的 iframe 播放器。请把这个元素的链接改成具体视频、Shorts、直播或播放列表地址。',
    };
  } catch {
    return null;
  }
}

export function shouldUseNativeExcalidrawEmbed(link: string): boolean {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'gist.github.com') return true;
    if ((host === 'twitter.com' || host === 'x.com') && /\/status\/\d+/.test(url.pathname)) return true;
    return host === 'reddit.com' && /\/comments\//.test(url.pathname);
  } catch {
    return false;
  }
}

function youtubeEmbedUrl(videoId: string, source: URL): string {
  const start = source.searchParams.get('start') ?? source.searchParams.get('t');
  const query = new URLSearchParams({ playsinline: '1', widget_referrer: YOUTUBE_CLIENT_IDENTITY });
  const playlistId = source.searchParams.get('list');
  if (start) query.set('start', String(parseYoutubeTime(start)));
  if (playlistId) query.set('list', playlistId);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${query.toString()}`;
}

export const YOUTUBE_CLIENT_IDENTITY = 'https://bookmark-atlas.invalid/';

function parseYoutubeTime(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.toLowerCase().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function isYoutubeHost(host: string) {
  return host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com';
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
