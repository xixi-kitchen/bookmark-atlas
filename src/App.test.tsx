import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createMemoryBookmarkAdapter } from './bookmarks/adapter';
import { readOnboardingState, recordInstallationEvent } from './onboarding/onboardingState';
import { configureBookmarkAdapterForTests } from './store/bookmarkStore';
import { usePreferencesStore } from './store/preferencesStore';
import { setLanguagePreference } from './i18n/languagePreference';

const languageHost = vi.hoisted(() => ({ canvasMounted: vi.fn() }));
vi.mock('./excalidraw/ExcalidrawCanvas', async () => {
  const { useEffect } = await import('react');
  return { ExcalidrawCanvas: () => {
    useEffect(() => { languageHost.canvasMounted(); }, []);
    return <div data-testid="excalidraw-canvas" />;
  } };
});

describe('App integration', () => {
  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await setLanguagePreference('auto');
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('bookmark-atlas:preferences:v1', JSON.stringify({ viewMode: 'grid' }));
    configureBookmarkAdapterForTests(createMemoryBookmarkAdapter());
    usePreferencesStore.setState({
      viewMode: 'grid',
      cardSize: 'md',
      themeId: 'excalidraw',
      activeEngineId: 'baidu',
      hydrated: true,
    });
  });

  it('loads demo bookmarks and exposes all primary controls', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Bookmark Atlas' })).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excalidraw canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Card size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'UI style' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card size: Medium cards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'UI style: Excalidraw' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Chrome Extensions Docs')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'New browser bookmark' })).toBeInTheDocument();
  });

  it('switches language in settings without remounting the current canvas', async () => {
    languageHost.canvasMounted.mockClear();
    render(<App />);
    await waitFor(() => expect(screen.getByText('Chrome Extensions Docs')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Excalidraw canvas' }));
    await screen.findByTestId('excalidraw-canvas');
    expect(languageHost.canvasMounted).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'zh-CN' } });
    expect(await screen.findByRole('button', { name: '新建浏览器书签' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(languageHost.canvasMounted).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'en' } });
    expect(await screen.findByRole('button', { name: 'New browser bookmark' })).toBeInTheDocument();
    expect(languageHost.canvasMounted).toHaveBeenCalledOnce();
  });

  it('navigates folders and filters the managed view without leaving the page', async () => {
    render(<App />);

    const bookmarksBar = await screen.findByRole('treeitem', { name: /Bookmarks Bar/ });
    fireEvent.click(bookmarksBar);

    const breadcrumb = screen.getByRole('navigation', { name: 'Current location' });
    expect(within(breadcrumb).getByRole('button', { name: 'Bookmarks Bar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Bookmark: OpenAI' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bookmark: Figma' })).not.toBeInTheDocument();
  });

  it('shows the first-run guide from the install marker and lets users finish it', async () => {
    await recordInstallationEvent({ reason: 'install', version: '0.9.2' });

    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'Make the new tab useful' })).toBeInTheDocument();
    expect(screen.getByText('Search where you already work')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try search' }));
    expect(screen.getByRole('combobox', { name: 'Search content' })).toHaveFocus();
    expect(screen.getByText('Switch to the canvas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    expect(screen.getByText('Keep control of sync')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start using Atlas' }));

    await waitFor(async () => expect((await readOnboardingState()).onboardingCompleted).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'Make the new tab useful' })).not.toBeInTheDocument();
  });

  it('observes an install marker written after the new-tab page has started', async () => {
    render(<App />);
    expect(screen.queryByRole('dialog', { name: 'Make the new tab useful' })).not.toBeInTheDocument();

    await recordInstallationEvent({ reason: 'install', version: '0.9.3' });

    expect(await screen.findByRole('dialog', { name: 'Make the new tab useful' })).toBeInTheDocument();
  });

  it('shows update notes for existing installs instead of forcing onboarding', async () => {
    await recordInstallationEvent({ reason: 'update', previousVersion: '0.9.4', version: '0.9.5' });

    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'Bookmark Atlas v0.9.5' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Make the new tab useful' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(async () => expect((await readOnboardingState()).seenWhatsNewVersion).toBe('0.9.5'));
  });

  it('replays the guide from settings without a pending install marker', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const menu = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Quick guide' }));

    expect(await screen.findByRole('dialog', { name: 'Make the new tab useful' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('keeps appearance and engine management reachable from settings', async () => {
    render(<App />);
    await screen.findByText('Chrome Extensions Docs');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const panel = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(panel).getByRole('button', { name: 'UI style: Excalidraw' }));
    fireEvent.click(screen.getByRole('option', { name: 'Swiss International' }));
    expect(document.documentElement.dataset.theme).toBe('swiss');
    fireEvent.click(within(panel).getByRole('button', { name: 'Use default Excalidraw theme' }));
    expect(document.documentElement.dataset.theme).toBe('excalidraw');
    fireEvent.click(within(panel).getByRole('button', { name: 'Manage search engines' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Search engines' })).toBeInTheDocument();
  });

  it('closes the nested picker before settings with Escape and restores focus', async () => {
    render(<App />);
    await screen.findByText('Chrome Extensions Docs');
    const trigger = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(trigger);
    const themeTrigger = screen.getByRole('button', { name: 'UI style: Excalidraw' });
    fireEvent.click(themeTrigger);
    fireEvent.keyDown(screen.getByRole('option', { name: 'Swiss International' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Choose UI style' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(themeTrigger).toHaveFocus();
    fireEvent.keyDown(themeTrigger, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps onboarding optional and respects an explicit skip', async () => {
    await recordInstallationEvent({ reason: 'install', version: '0.9.2' });

    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'Make the new tab useful' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(screen.queryByRole('dialog', { name: 'Make the new tab useful' })).not.toBeInTheDocument();
    await waitFor(async () => expect((await readOnboardingState()).pendingOnboarding).toBe(false));
    expect((await readOnboardingState()).onboardingSkipped).toBe(true);
  });
});
