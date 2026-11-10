import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguagePreference } from '../i18n/languagePreference';
import { WebEmbed } from './WebEmbed';
import { useWebEmbedLoadState } from './useWebEmbedLoadState';

beforeEach(async () => { await setLanguagePreference('en'); });
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await setLanguagePreference('en'); });

describe('embedded page lifecycle and loading help', () => {
  it.each(['https://example.com/page', 'https://www.youtube.com/watch?v=abc123', 'https://www.bilibili.com/video/BV1xx'])('retains the same iframe when interaction changes: %s', (url) => {
    const { container, rerender } = render(<WebEmbed elementId="stable" url={url} active={false} />);
    const frame = container.querySelector('iframe');
    rerender(<WebEmbed elementId="stable" url={url} active />);
    rerender(<WebEmbed elementId="stable" url={url} active={false} />);
    expect(container.querySelector('iframe')).toBe(frame);
    expect(frame).toHaveAttribute('loading', 'eager');
  });

  it('commits only the new official player after changing a Bilibili URL from full-page mode', () => {
    const { container, rerender } = render(<WebEmbed elementId="bili" url="https://www.bilibili.com/video/BV1xx" active />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the full Bilibili video page' }));
    const frames: HTMLIFrameElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((name, options) => {
      const node = create(name, options);
      if (name === 'iframe') frames.push(node as HTMLIFrameElement);
      return node;
    });
    rerender(<WebEmbed elementId="bili" url="https://www.bilibili.com/video/BV2yy?p=3" active />);
    expect(frames.map((frame) => frame.getAttribute('src'))).toEqual([
      'https://player.bilibili.com/player.html?autoplay=0&poster=1&bvid=BV2yy&p=3',
    ]);
    expect(container.querySelector('iframe')).toBe(frames[0]);
  });

  it('does not reload an equivalent normalized request', () => {
    const { container, rerender } = render(<WebEmbed elementId="same-request" url="https://example.com" active />);
    const frame = container.querySelector('iframe')!;
    fireEvent.load(frame);
    rerender(<WebEmbed elementId="same-request" url="https://example.com/" active />);
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('reports a slow signal without replacing, refreshing or navigating the webpage', () => {
    vi.useFakeTimers();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<WebEmbed elementId="slow" url="https://example.com/slow" active />);
    const frame = container.querySelector('iframe');
    act(() => vi.advanceTimersByTime(20_001));
    expect(screen.getByText('Taking longer')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBe(frame);
    expect(frame).toHaveAttribute('src', 'https://example.com/slow');
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Embedded page loading help' }));
    expect(screen.getByRole('note', { name: 'About embedded page loading' })).toHaveTextContent('It is still loading');
    expect(container.querySelector('iframe')).toBe(frame);
    fireEvent.load(frame!);
    expect(screen.queryByText('Taking longer')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('does not claim a load event proves success, and help is explicit and dismissible', () => {
    const { container } = render(<WebEmbed elementId="help" url="https://example.com/denied" active />);
    const frame = container.querySelector('iframe')!;
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    fireEvent.load(frame);
    fireEvent.click(screen.getByRole('button', { name: 'Embedded page loading help' }));
    expect(screen.getByRole('note')).toHaveTextContent('does not confirm that embedding or playback succeeded');
    expect(screen.getByRole('note')).toHaveTextContent('sign-in');
    fireEvent.click(screen.getByRole('button', { name: 'Close loading help' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Embedded page loading help' })).toHaveFocus();
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('ignores stale load signals from a replaced request', () => {
    const { result, rerender } = renderHook(({ requestKey }) => useWebEmbedLoadState(requestKey), { initialProps: { requestKey: 'old-request' } });
    const oldLoad = result.current.onLoad;
    rerender({ requestKey: 'new-request' });
    act(oldLoad);
    expect(result.current.phase).toBe('waiting');
    act(result.current.onLoad);
    expect(result.current.phase).toBe('loaded');
  });

  it('closes explicit help with Escape and keeps the media frame', () => {
    const { container } = render(<WebEmbed elementId="escape" url="https://example.com/player" active />);
    const frame = container.querySelector('iframe');
    const help = screen.getByRole('button', { name: 'Embedded page loading help' });
    fireEvent.click(help);
    fireEvent.keyDown(screen.getByRole('note'), { key: 'Escape' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(help).toHaveFocus();
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('refreshes only the requested frame and restarts its loading status', () => {
    vi.useFakeTimers();
    const { container } = render(<><WebEmbed elementId="a" url="https://example.com/a" active /><WebEmbed elementId="b" url="https://example.com/b" active={false} /></>);
    const a = container.querySelector('[data-web-embed-id="a"]')!;
    const b = container.querySelector('[data-web-embed-id="b"] iframe');
    const oldFrame = a.querySelector('iframe');
    act(() => vi.advanceTimersByTime(20_001));
    fireEvent.click(within(a as HTMLElement).getByRole('button', { name: 'Refresh this embedded page' }));
    expect(a.querySelector('iframe')).not.toBe(oldFrame);
    expect(container.querySelector('[data-web-embed-id="b"] iframe')).toBe(b);
    expect(within(a as HTMLElement).queryByText('Taking longer')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(19_999));
    expect(within(a as HTMLElement).queryByText('Taking longer')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2));
    expect(within(a as HTMLElement).getByText('Taking longer')).toBeInTheDocument();
  });

  it('cleans its one-shot loading timer on load, URL replacement and unmount', () => {
    vi.useFakeTimers();
    const { container, rerender, unmount } = render(<WebEmbed elementId="timer" url="https://example.com/one" active />);
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.load(container.querySelector('iframe')!);
    expect(vi.getTimerCount()).toBe(0);
    rerender(<WebEmbed elementId="timer" url="https://example.com/two" active />);
    expect(vi.getTimerCount()).toBe(1);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps translation and callback updates working without replacing the iframe', async () => {
    const first = vi.fn(), second = vi.fn();
    const { container, rerender } = render(<WebEmbed elementId="language" url="https://example.com/page" active onExitInteraction={first} {...{ uiLanguage: 'en' as const }} />);
    const frame = container.querySelector('iframe');
    await act(async () => { await setLanguagePreference('zh-CN'); });
    rerender(<WebEmbed elementId="language" url="https://example.com/page" active onExitInteraction={second} {...{ uiLanguage: 'zh-CN' as const }} />);
    expect(screen.getByRole('button', { name: '网页加载帮助' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出网页交互' }));
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('skips unchanged URL work for 32 embeds during 30 parent updates without resetting frames', () => {
    const NativeURL = URL;
    let parses = 0;
    class CountedURL extends NativeURL {
      constructor(value: string | URL, base?: string | URL) { super(value, base); if (String(value).startsWith('https://example.com/probe/')) parses += 1; }
    }
    vi.stubGlobal('URL', CountedURL);
    const exit = () => undefined;
    const tree = (tick: number) => <div data-tick={tick}>{Array.from({ length: 32 }, (_, index) => <WebEmbed key={index} elementId={`probe-${index}`} url={`https://example.com/probe/${index}`} active={false} onExitInteraction={exit} {...{ uiLanguage: 'en' as const }} />)}</div>;
    const { container, rerender } = render(tree(0));
    const frames = [...container.querySelectorAll('iframe')];
    expect(parses).toBeGreaterThan(0);
    parses = 0;
    for (let tick = 1; tick <= 30; tick += 1) rerender(tree(tick));
    expect(parses).toBe(0);
    expect([...container.querySelectorAll('iframe')]).toEqual(frames);
  });
});
