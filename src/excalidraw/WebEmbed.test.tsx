import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BILIBILI_VIDEO_ALLOW,
  getWebEmbedIssue,
  resolveWebEmbedUrl,
  shouldUseNativeExcalidrawEmbed,
  WEB_EMBED_ALLOW,
  WEB_EMBED_SANDBOX,
  WebEmbed,
} from './WebEmbed';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WebEmbed', () => {
  it('renders ordinary third-party pages immediately', () => {
    render(<WebEmbed elementId="web-1" url="https://example.com/page" active={false} />);

    expect(screen.getByTitle('Embedded page: example.com')).toHaveAttribute('src', 'https://example.com/page');
    expect(screen.getByText('Click the center to interact with this page')).toBeInTheDocument();
  });

  it('keeps broad iframe features while preventing top navigation and popup escape', () => {
    render(<WebEmbed elementId="web-1" url="https://example.com/page" active />);

    const frame = screen.getByTitle('Embedded page: example.com');
    expect(frame).toHaveAttribute('src', 'https://example.com/page');
    expect(frame).toHaveAttribute('scrolling', 'auto');
    expect(frame).toHaveAttribute('sandbox', WEB_EMBED_SANDBOX);
    expect(frame).toHaveAttribute('allow', WEB_EMBED_ALLOW);
    expect(WEB_EMBED_ALLOW).toMatch(/autoplay|camera|clipboard-write|fullscreen|geolocation|microphone|payment|usb|web-share/);
    expect(WEB_EMBED_SANDBOX).toContain('allow-popups');
    expect(WEB_EMBED_SANDBOX).not.toMatch(/allow-popups-to-escape-sandbox|allow-top-navigation/);
    expect(frame).not.toHaveAttribute('allowfullscreen');
    const toolbar = screen.getByRole('toolbar', { name: 'Embedded web page actions' });
    const viewport = frame.closest('.atlas-web-embed__viewport');
    expect(toolbar).toBeInTheDocument();
    expect(viewport).toBeInTheDocument();
    expect(viewport).not.toContainElement(toolbar);
    expect(toolbar.nextElementSibling).toBe(viewport);
  });

  it('refreshes its own iframe and can open or leave interaction without unloading the page', () => {
    const onExitInteraction = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WebEmbed elementId="web-2" url="https://example.com/page" active onExitInteraction={onExitInteraction} />);
    const originalFrame = screen.getByTitle('Embedded page: example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh this embedded page' }));
    expect(screen.getByTitle('Embedded page: example.com')).not.toBe(originalFrame);

    fireEvent.click(screen.getByRole('button', { name: 'Open in new tab' }));
    expect(open).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener,noreferrer');

    fireEvent.click(screen.getByRole('button', { name: 'Exit page interaction' }));
    expect(onExitInteraction).toHaveBeenCalledOnce();
    expect(screen.getByTitle('Embedded page: example.com')).toBeInTheDocument();
  });

  it('keeps an embedded page visible when interaction is no longer active', () => {
    const { rerender } = render(<WebEmbed elementId="web-3" url="https://example.com/page" active />);
    expect(screen.getByTitle('Embedded page: example.com')).toBeInTheDocument();

    rerender(<WebEmbed elementId="web-3" url="https://example.com/page" active={false} />);

    expect(screen.getByTitle('Embedded page: example.com')).toBeInTheDocument();
    expect(screen.getByText('Click the center to interact with this page')).toBeInTheDocument();
  });

  it('keeps generic pages unchanged and preserves Excalidraw provider URL conversions', () => {
    expect(resolveWebEmbedUrl('https://www.bilibili.com/video/BV1xx?t=42&p=2')).toBe('https://player.bilibili.com/player.html?autoplay=0&poster=1&bvid=BV1xx&p=2&t=42');
    expect(resolveWebEmbedUrl('https://www.bilibili.com/list/watchlater/?bvid=BV1watchlater')).toBe('https://player.bilibili.com/player.html?autoplay=0&poster=1&bvid=BV1watchlater');
    expect(resolveWebEmbedUrl('https://player.bilibili.com/player.html?bvid=BV1xx&cid=123&autoplay=1')).toBe('https://player.bilibili.com/player.html?autoplay=0&poster=1&bvid=BV1xx&cid=123');
    expect(resolveWebEmbedUrl('https://www.bilibili.com/video/av12345')).toBe('https://player.bilibili.com/player.html?autoplay=0&poster=1&aid=12345');
    expect(resolveWebEmbedUrl('https://youtu.be/abc123?t=1m42s')).toBe('https://www.youtube.com/embed/abc123?playsinline=1&widget_referrer=https%3A%2F%2Fbookmark-atlas.invalid%2F&start=102');
    expect(resolveWebEmbedUrl('https://www.youtube.com/live/live123')).toBe('https://www.youtube.com/embed/live123?playsinline=1&widget_referrer=https%3A%2F%2Fbookmark-atlas.invalid%2F');
    expect(resolveWebEmbedUrl('https://www.youtube.com/playlist?list=PL123')).toBe('https://www.youtube.com/embed?listType=playlist&list=PL123&playsinline=1&widget_referrer=https%3A%2F%2Fbookmark-atlas.invalid%2F');
    expect(resolveWebEmbedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456?api=1');
    expect(resolveWebEmbedUrl('https://www.figma.com/design/abc/file')).toContain('https://www.figma.com/embed?embed_host=share&url=');
  });

  it('shows the Bilibili homepage directly inside the canvas', () => {
    render(<WebEmbed elementId="bilibili-home" url="https://www.bilibili.com/" active={false} />);

    expect(screen.getByTitle('Embedded page: bilibili.com')).toHaveAttribute('src', 'https://www.bilibili.com/');
    expect(getWebEmbedIssue('https://www.bilibili.com/')).toBeNull();
  });

  it('plays Bilibili videos inside the official player without delegating autoplay', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WebEmbed elementId="bilibili-video" url="https://www.bilibili.com/video/BV1xx?p=2" active />);

    const frame = screen.getByTitle('Embedded page: bilibili.com');
    expect(frame).toHaveAttribute('src', 'https://player.bilibili.com/player.html?autoplay=0&poster=1&bvid=BV1xx&p=2');
    expect(frame).toHaveAttribute('allow', BILIBILI_VIDEO_ALLOW);
    expect(BILIBILI_VIDEO_ALLOW).not.toContain('autoplay');
    expect(frame).not.toHaveClass('is-bilibili-video-preview');
    expect(screen.queryByRole('button', { name: 'Play Bilibili video in a new tab' })).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it('switches a Bilibili video between the official player and the complete page without opening a tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WebEmbed elementId="bilibili-video" url="https://www.bilibili.com/video/BV1xx?p=2" active />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the full Bilibili video page' }));
    expect(screen.getByTitle('Embedded page: bilibili.com')).toHaveAttribute('src', 'https://www.bilibili.com/video/BV1xx?p=2');
    expect(screen.getByText('Full video page')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the Bilibili official player' }));
    expect(screen.getByTitle('Embedded page: bilibili.com')).toHaveAttribute('src', 'https://player.bilibili.com/player.html?autoplay=0&poster=1&bvid=BV1xx&p=2');
    expect(screen.getByText('Official player')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it('replaces an unembeddable YouTube homepage with actionable guidance', () => {
    render(<WebEmbed elementId="youtube-home" url="https://www.youtube.com/" active />);

    expect(screen.getByRole('note', { name: 'YouTube home pages cannot be embedded directly' })).toBeInTheDocument();
    expect(screen.getByText(/video, Shorts, live, or playlist URL/)).toBeInTheDocument();
    expect(screen.queryByTitle('Embedded page: youtube.com')).not.toBeInTheDocument();
    expect(getWebEmbedIssue('https://www.youtube.com/')).not.toBeNull();
    expect(getWebEmbedIssue('https://www.youtube.com/watch?v=abc123')).toBeNull();
  });

  it('keeps unresolved Bilibili short links behind an explicit external-open action', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WebEmbed elementId="bilibili-short" url="https://b23.tv/abc123" active />);

    expect(screen.getByRole('note', { name: 'Open Bilibili short links in a new tab' })).toBeInTheDocument();
    expect(screen.queryByTitle('Embedded page: b23.tv')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(getWebEmbedIssue('https://b23.tv/abc123')).not.toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open in new tab' }).at(-1)!);
    expect(open).toHaveBeenCalledWith('https://b23.tv/abc123', '_blank', 'noopener,noreferrer');
  });

  it('preserves Excalidraw native rendering for its script-based providers', () => {
    expect(shouldUseNativeExcalidrawEmbed('https://x.com/excalidraw/status/12345')).toBe(true);
    expect(shouldUseNativeExcalidrawEmbed('https://www.reddit.com/r/test/comments/abc/title/')).toBe(true);
    expect(shouldUseNativeExcalidrawEmbed('https://gist.github.com/user/abcdef')).toBe(true);
    expect(shouldUseNativeExcalidrawEmbed('https://www.bilibili.com/')).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///tmp/private.html',
    'http://example.com/insecure',
  ])('blocks unsafe legacy links in both iframe and external-open paths: %s', (url) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WebEmbed elementId="unsafe" url={url} active />);

    expect(screen.getByRole('note', { name: 'This address cannot open on the canvas' })).toBeInTheDocument();
    expect(screen.queryByTitle(/Embedded page/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open in new tab' })).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
