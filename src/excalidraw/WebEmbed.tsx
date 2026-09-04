import { ExternalLink, Link2, MousePointer2, Play, RefreshCw, ShieldAlert, Youtube } from 'lucide-react';
import { useEffect, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';
import { isSafeEmbeddableUrl } from './bookmarkElements';

const WEB_EMBED_FEATURES = [
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
] as const;

export const WEB_EMBED_ALLOW = WEB_EMBED_FEATURES.join('; ');
export const BILIBILI_VIDEO_ALLOW = WEB_EMBED_FEATURES.filter((feature) => feature !== 'autoplay').join('; ');

export const WEB_EMBED_SANDBOX = [
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
].join(' ');

type Props = {
  elementId: string;
  url: string;
  active: boolean;
  onExitInteraction?: () => void;
};

export function WebEmbed({ elementId, url, active, onExitInteraction }: Props) {
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bilibiliView, setBilibiliView] = useState<'player' | 'page'>('player');
  const resolvedSrc = resolveWebEmbedUrl(url);
  const embedIssue = getWebEmbedIssue(url);
  const safeUrl = isSafeEmbeddableUrl(url);
  const bilibiliVideo = isBilibiliVideoEmbedUrl(resolvedSrc);
  const showingBilibiliPage = bilibiliVideo && bilibiliView === 'page';
  const src = showingBilibiliPage ? url : resolvedSrc;
  const frameAllow = bilibiliVideo ? BILIBILI_VIDEO_ALLOW : WEB_EMBED_ALLOW;
  const IssueIcon = embedIssue?.provider === 'youtube'
    ? Youtube
    : embedIssue?.provider === 'unsafe'
      ? ShieldAlert
      : Link2;
  const stopPointer = (event: PointerEvent | MouseEvent) => event.stopPropagation();

  useEffect(() => {
    setBilibiliView('player');
    setLoading(true);
  }, [url]);

  const refresh = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    setLoading(true);
    setRefreshRevision((revision) => revision + 1);
  };

  const openExternally = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    if (!safeUrl) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const exitInteraction = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    onExitInteraction?.();
  };

  const toggleBilibiliView = (event: MouseEvent<HTMLButtonElement>) => {
    stopPointer(event);
    setLoading(true);
    setBilibiliView((current) => current === 'player' ? 'page' : 'player');
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
          <span className="atlas-web-embed__status">
            {bilibiliVideo ? showingBilibiliPage ? '完整视频页' : '官方播放器' : '网页交互中'}
          </span>
          {!embedIssue && (
            <button type="button" onPointerDown={stopPointer} onClick={refresh} aria-label="刷新这个嵌入网页" title="刷新这个嵌入网页">
              <RefreshCw size={14} className={loading ? 'is-spinning' : ''} />
            </button>
          )}
          {safeUrl && (
            <button type="button" onPointerDown={stopPointer} onClick={openExternally} aria-label="在新标签页打开" title="在新标签页打开">
              <ExternalLink size={14} />
            </button>
          )}
          {bilibiliVideo && (
            <button
              type="button"
              onPointerDown={stopPointer}
              onClick={toggleBilibiliView}
              aria-label={showingBilibiliPage ? '切换到 Bilibili 官方播放器' : '切换到完整 Bilibili 视频页面'}
              title={showingBilibiliPage ? '切换到官方播放器' : '切换到完整视频页面'}
            >
              {showingBilibiliPage ? <Play size={14} /> : <Link2 size={14} />}
            </button>
          )}
          <button type="button" onPointerDown={stopPointer} onClick={exitInteraction} aria-label="退出网页交互" title="退出网页交互（也可按 Esc）">
            <MousePointer2 size={14} />
          </button>
        </div>
      )}

      <div className="atlas-web-embed__viewport">
        {embedIssue ? (
          <div className={`atlas-web-embed__provider-note is-${embedIssue.provider}-issue`} data-provider={embedIssue.provider} role="note" aria-label={embedIssue.title}>
            <div className="atlas-web-embed__provider-icon"><IssueIcon size={34} strokeWidth={2.2} /></div>
            <div className="atlas-web-embed__provider-copy">
              <span>{embedIssue.provider === 'youtube' ? 'YouTube iframe' : embedIssue.provider === 'bilibili' ? 'Bilibili short link' : 'Blocked link'}</span>
              <strong>{embedIssue.title}</strong>
              <p>{embedIssue.description}</p>
            </div>
            <div className="atlas-web-embed__provider-formats" aria-label="支持的链接类型">
              {embedIssue.provider === 'youtube' ? (
                <>
                  <span><Link2 size={12} /> 视频</span>
                  <span><Link2 size={12} /> Shorts</span>
                  <span><Link2 size={12} /> 直播</span>
                  <span><Link2 size={12} /> 播放列表</span>
                </>
              ) : embedIssue.provider === 'bilibili' ? (
                <>
                  <span><Link2 size={12} /> BV 视频</span>
                  <span><Link2 size={12} /> av 视频</span>
                  <span><Link2 size={12} /> 播放器链接</span>
                </>
              ) : (
                <span><ShieldAlert size={12} /> 仅允许 HTTPS 与本地开发地址</span>
              )}
            </div>
            {safeUrl && (
              <button type="button" onPointerDown={stopPointer} onClick={openExternally}>
                <ExternalLink size={14} /> 在新标签页打开
              </button>
            )}
          </div>
        ) : (
          <>
            <iframe
              key={`${elementId}:${src}:${refreshRevision}`}
              className="atlas-web-embed__frame"
              src={src}
              title={`嵌入网页：${hostname(url) || url}`}
              scrolling="auto"
              referrerPolicy="strict-origin-when-cross-origin"
              allow={frameAllow}
              sandbox={WEB_EMBED_SANDBOX}
              loading="eager"
              onLoad={() => setLoading(false)}
            />
          </>
        )}

        {!active && (
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

    if (isBilibiliHost(host)) {
      const bilibili = bilibiliEmbedUrl(url);
      if (bilibili) return bilibili;
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

type WebEmbedIssue = {
  provider: 'youtube' | 'bilibili' | 'unsafe';
  title: string;
  description: string;
};

export function getWebEmbedIssue(link: string): WebEmbedIssue | null {
  if (!isSafeEmbeddableUrl(link)) {
    return {
      provider: 'unsafe',
      title: '这个地址不能在画布中打开',
      description: '为保护扩展和本机数据，Bookmark Atlas 只允许 HTTPS 网页以及 localhost、127.0.0.1 和 [::1] 的本地开发地址。',
    };
  }

  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const resolved = resolveWebEmbedUrl(link);

    if (host === 'b23.tv') {
      return {
        provider: 'bilibili',
        title: 'Bilibili 短链需要在新标签页打开',
        description: '短链在跳转前无法确认具体视频编号。请使用原始 BV/av 视频地址获得暂停预览，或直接在新标签页打开这条短链。',
      };
    }

    if (!isYoutubeHost(host) && host !== 'youtu.be') return null;
    if (resolved !== url.toString()) return null;

    return {
      provider: 'youtube',
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

function isBilibiliHost(host: string) {
  return host === 'b23.tv' || host === 'bilibili.com' || host.endsWith('.bilibili.com');
}

function isBilibiliVideoEmbedUrl(link: string) {
  try {
    const url = new URL(link);
    return url.hostname === 'player.bilibili.com'
      && url.pathname === '/player.html'
      && ['bvid', 'aid', 'episodeId'].some((key) => url.searchParams.has(key));
  } catch {
    return false;
  }
}

function bilibiliEmbedUrl(source: URL): string | null {
  const pathname = source.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams({ autoplay: '0', poster: '1' });
  const bvid = source.searchParams.get('bvid') ?? segments.find((segment) => /^BV[a-zA-Z0-9]+$/.test(segment));
  const aidFromQuery = source.searchParams.get('aid');
  const aidFromPath = segments.find((segment) => /^av\d+$/i.test(segment))?.replace(/^av/i, '');
  const aid = aidFromQuery ?? aidFromPath;
  const episodeId = segments.find((segment) => /^ep\d+$/i.test(segment))?.replace(/^ep/i, '');
  const page = source.searchParams.get('p') ?? source.searchParams.get('page');
  const time = source.searchParams.get('t');
  const cid = source.searchParams.get('cid');

  if (episodeId) query.set('episodeId', episodeId);
  else if (bvid) query.set('bvid', bvid);
  else if (aid) query.set('aid', aid);
  else return null;

  if (cid) query.set('cid', cid);
  if (page) query.set('p', page);
  if (time) query.set('t', time);

  return `https://player.bilibili.com/player.html?${query.toString()}`;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
