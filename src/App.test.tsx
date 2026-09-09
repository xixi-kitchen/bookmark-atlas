import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createMemoryBookmarkAdapter } from './bookmarks/adapter';
import { readOnboardingState, recordInstallationEvent } from './onboarding/onboardingState';
import { configureBookmarkAdapterForTests } from './store/bookmarkStore';
import { usePreferencesStore } from './store/preferencesStore';

vi.mock('./excalidraw/ExcalidrawCanvas', () => ({
  ExcalidrawCanvas: () => <div data-testid="excalidraw-canvas" />,
}));

describe('App integration', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('bookmark-atlas:preferences:v1', JSON.stringify({ viewMode: 'grid' }));
    configureBookmarkAdapterForTests(createMemoryBookmarkAdapter());
    usePreferencesStore.setState({
      viewMode: 'grid',
      cardSize: 'md',
      themeId: 'swiss',
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
    expect(screen.getByRole('button', { name: 'Card size: Medium cards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'UI style: Swiss International' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Chrome Extensions Docs')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'New browser bookmark' })).toBeInTheDocument();
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
    await recordInstallationEvent({ reason: 'update', previousVersion: '0.9.2', version: '0.9.3' });

    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'Bookmark Atlas v0.9.3' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Make the new tab useful' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(async () => expect((await readOnboardingState()).seenWhatsNewVersion).toBe('0.9.3'));
  });

  it('replays the guide from the fixed help menu without a pending install marker', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const menu = screen.getByRole('menu', { name: 'Help' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Quick guide/ }));

    expect(await screen.findByRole('dialog', { name: 'Make the new tab useful' })).toBeInTheDocument();
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
