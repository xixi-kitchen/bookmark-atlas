import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWebEmbedIssue,
  resolveWebEmbedUrl,
  shouldUseNativeExcalidrawEmbed,
  WEB_EMBED_ALLOW,
  WebEmbed,
} from './WebEmbed';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WebEmbed', () => {
  it('uses a scrollable, unsandboxed iframe with broad browser feature delegation', () => {
    render(<WebEmbed elementId="web-1" url="https://www.bilibili.com/" active />);

    const frame = screen.getByTitle('嵌入网页：bilibili.com');
    expect(frame).toHaveAttribute('src', 'https://www.bilibili.com/');
    expect(frame).toHaveAttribute('scrolling', 'auto');
    expect(frame).not.toHaveAttribute('sandbox');
    expect(frame).toHaveAttribute('allow', WEB_EMBED_ALLOW);
    expect(WEB_EMBED_ALLOW.split('; ')).toContain('fullscreen');
    expect(frame).not.toHaveAttribute('allowfullscreen');
    const toolbar = screen.getByRole('toolbar', { name: '嵌入网页操作' });
    const viewport = frame.closest('.atlas-web-embed__viewport');
    expect(toolbar).toBeInTheDocument();
    expect(viewport).toBeInTheDocument();
    expect(viewport).not.toContainElement(toolbar);
    expect(toolbar.nextElementSibling).toBe(viewport);
  });

  it('refreshes only its own iframe and can open or leave the active embed', () => {
    const onExitInteraction = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WebEmbed elementId="web-2" url="https://example.com/page" active onExitInteraction={onExitInteraction} />);
    const originalFrame = screen.getByTitle('嵌入网页：example.com');

    fireEvent.click(screen.getByRole('button', { name: '刷新这个嵌入网页' }));
    expect(screen.getByTitle('嵌入网页：example.com')).not.toBe(originalFrame);

    fireEvent.click(screen.getByRole('button', { name: '在新标签页打开' }));
    expect(open).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener,noreferrer');

    fireEvent.click(screen.getByRole('button', { name: '退出网页交互' }));
    expect(onExitInteraction).toHaveBeenCalledOnce();
  });

  it('keeps generic pages unchanged and preserves Excalidraw provider URL conversions', () => {
    expect(resolveWebEmbedUrl('https://www.bilibili.com/video/BV1xx')).toBe('https://www.bilibili.com/video/BV1xx');
    expect(resolveWebEmbedUrl('https://youtu.be/abc123?t=1m42s')).toBe('https://www.youtube.com/embed/abc123?playsinline=1&widget_referrer=https%3A%2F%2Fbookmark-atlas.invalid%2F&start=102');
    expect(resolveWebEmbedUrl('https://www.youtube.com/live/live123')).toBe('https://www.youtube.com/embed/live123?playsinline=1&widget_referrer=https%3A%2F%2Fbookmark-atlas.invalid%2F');
    expect(resolveWebEmbedUrl('https://www.youtube.com/playlist?list=PL123')).toBe('https://www.youtube.com/embed?listType=playlist&list=PL123&playsinline=1&widget_referrer=https%3A%2F%2Fbookmark-atlas.invalid%2F');
    expect(resolveWebEmbedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456?api=1');
    expect(resolveWebEmbedUrl('https://www.figma.com/design/abc/file')).toContain('https://www.figma.com/embed?embed_host=share&url=');
  });

  it('replaces an unembeddable YouTube homepage with actionable guidance', () => {
    render(<WebEmbed elementId="youtube-home" url="https://www.youtube.com/" active />);

    expect(screen.getByRole('note', { name: 'YouTube 首页不能直接嵌入' })).toBeInTheDocument();
    expect(screen.getByText(/具体视频、Shorts、直播或播放列表/)).toBeInTheDocument();
    expect(screen.queryByTitle('嵌入网页：youtube.com')).not.toBeInTheDocument();
    expect(getWebEmbedIssue('https://www.youtube.com/')).not.toBeNull();
    expect(getWebEmbedIssue('https://www.youtube.com/watch?v=abc123')).toBeNull();
  });

  it('leaves script-based provider embeds on Excalidraw native rendering', () => {
    expect(shouldUseNativeExcalidrawEmbed('https://x.com/excalidraw/status/12345')).toBe(true);
    expect(shouldUseNativeExcalidrawEmbed('https://www.reddit.com/r/test/comments/abc/title/')).toBe(true);
    expect(shouldUseNativeExcalidrawEmbed('https://gist.github.com/user/abcdef')).toBe(true);
    expect(shouldUseNativeExcalidrawEmbed('https://www.bilibili.com/')).toBe(false);
  });
});
