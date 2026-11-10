import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createMemoryBookmarkAdapter } from './bookmarks/adapter';
import { readOnboardingState, recordInstallationEvent } from './onboarding/onboardingState';
import { configureBookmarkAdapterForTests } from './store/bookmarkStore';
import { usePreferencesStore } from './store/preferencesStore';
import { setLanguagePreference } from './i18n/languagePreference';
import { advanceLearning, pauseLearning, readLearningProgress, startLearning } from './onboarding/learningState';
import { recordReleaseEducation } from './onboarding/releaseEducation';

// Exercise the recorded 0.9.6 install/update scenarios independently of the next candidate version.
vi.mock('../package.json', () => ({ default: { version: '0.9.6' } }));

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

  it('offers hands-on learning without completing onboarding from passive reading', async () => {
    await recordInstallationEvent({ reason: 'install', version: '0.9.2' });

    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'Learning guide' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect((await readOnboardingState()).onboardingCompleted).not.toBe(true);
  });

  it('observes an install marker written after the new-tab page has started', async () => {
    render(<App />);
    expect(screen.queryByRole('dialog', { name: 'Learning guide' })).not.toBeInTheDocument();

    await recordInstallationEvent({ reason: 'install', version: '0.9.3' });

    expect(await screen.findByRole('dialog', { name: 'Learning guide' })).toBeInTheDocument();
  });

  it('keeps minor updates quiet and clears their marker when notes are read', async () => {
    await recordInstallationEvent({ reason: 'update', previousVersion: '0.9.5', version: '0.9.6' });

    render(<App />);

    await screen.findByText('Chrome Extensions Docs');
    expect(screen.queryByRole('dialog', { name: 'Bookmark Atlas v0.9.6' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Learning guide' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-unread-update', 'true'));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'What is new' }));
    expect(await screen.findByRole('dialog', { name: 'Bookmark Atlas v0.9.6' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(async () => expect((await readOnboardingState()).seenWhatsNewVersion).toBe('0.9.6'));
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-unread-update', 'false');
  });

  it('replays the guide from settings without a pending install marker', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const menu = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Learning guide' }));

    expect(await screen.findByRole('dialog', { name: 'Learning guide' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('returns to the canvas when resuming a paused course from the grid', async () => {
    await startLearning('basics');
    await advanceLearning({ type: 'bookmark-added' });
    await advanceLearning({ type: 'bookmark-opened' });
    await pauseLearning();
    render(<App />);
    await screen.findByText('Chrome Extensions Docs');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Learning guide' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume learning' }));
    await screen.findByTestId('excalidraw-canvas');
    expect((await readLearningProgress())?.step).toBe('move');
    expect((await readLearningProgress())?.status).toBe('active');
    expect((await readOnboardingState()).onboardingCompleted).not.toBe(true);
  });

  it('keeps settings above the guide without pausing or completing the course', async () => {
    await startLearning('basics');
    render(<App />);
    await screen.findByRole('dialog', { name: 'Learning guide' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const panel = screen.getByRole('dialog', { name: 'Settings' });
    expect(screen.queryByRole('dialog', { name: 'Learning guide' })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await screen.findByRole('dialog', { name: 'Learning guide' });
    expect((await readLearningProgress())?.status).toBe('active');
    expect((await readLearningProgress())?.step).toBe('import');
  });

  it('invites only the explicit major-update chapter once and keeps unread notes separate', async () => {
    await recordInstallationEvent({ reason: 'update', previousVersion: '0.9.5', version: '0.9.6' });
    await recordReleaseEducation({ version: '0.9.6', level: 'feature-tour', chapters: ['ai'] });
    const view = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog', { name: 'Try what changed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-unread-update', 'true');
    view.unmount();
    render(<App />);
    await screen.findByText('Chrome Extensions Docs');
    expect(screen.queryByRole('dialog', { name: 'Try what changed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Learning guide' })).not.toBeInTheDocument();
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

    const guide = await screen.findByRole('dialog', { name: 'Learning guide' });
    fireEvent.keyDown(guide, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Learning guide' })).not.toBeInTheDocument();
    await waitFor(async () => expect((await readOnboardingState()).pendingOnboarding).toBe(false));
    expect((await readOnboardingState()).onboardingSkipped).toBe(true);
  });
});
