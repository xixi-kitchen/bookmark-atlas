import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseInvitation, ReleaseNotes } from './ReleaseNotes';
import { setLanguagePreference } from '../i18n/languagePreference';
import * as catalogue from './releaseCatalog';

beforeEach(async () => { await setLanguagePreference('en'); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await setLanguagePreference('auto'); });

describe('versioned release notes', () => {
  it('gives a small release its own dated, categorized introduction and starting instructions', () => {
    render(<ReleaseNotes version="0.9.5" onClose={vi.fn()} />);
    const notes = screen.getByRole('dialog', { name: 'Bookmark Atlas v0.9.5' });
    expect(notes.querySelector('time')).toHaveAttribute('dateTime', '2026-10-20');
    for (const heading of ['Added', 'Changed', 'Fixed', 'Security', 'Get started', 'Before you update']) {
      expect(within(notes).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(within(notes).getByRole('link', { name: 'Full release notes' })).toHaveAttribute('href', 'https://github.com/xixi-kitchen/bookmark-atlas/releases/tag/v0.9.5');
    expect(within(notes).queryByRole('button', { name: 'Try the new workflow' })).not.toBeInTheDocument();
  });

  it('never disguises another version’s highlights as an unknown installed version', () => {
    render(<ReleaseNotes version="0.9.999" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Bookmark Atlas v0.9.999' })).toBeInTheDocument();
    expect(screen.getByText('Detailed notes for this version are not bundled. See the release archive.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Added' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full release notes' })).toHaveAttribute('href', 'https://github.com/xixi-kitchen/bookmark-atlas/releases');
  });

  it('offers the version introduction alongside, not instead of, a major-feature invitation', () => {
    const read = vi.fn(); const start = vi.fn(); const defer = vi.fn();
    render(<ReleaseInvitation onReadNotes={read} onStart={start} onDefer={defer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read the version introduction' }));
    expect(read).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled(); expect(defer).not.toHaveBeenCalled();
  });

  it('adds optional chapter learning to a major release without removing its complete introduction', () => {
    const existing = catalogue.getReleaseNotes('0.9.5')!;
    vi.spyOn(catalogue, 'getReleaseNotes').mockReturnValue({ ...existing, version: '1.0.0', education: { level: 'feature-tour', chapters: ['ai'] } });
    const close = vi.fn(); const learn = vi.fn();
    render(<ReleaseNotes version="1.0.0" onClose={close} onStartGuide={learn} />);
    expect(screen.getByRole('heading', { name: 'Added' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Before you update' })).toBeInTheDocument();
    expect(learn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try the new workflow' }));
    expect(close).toHaveBeenCalledOnce(); expect(learn).toHaveBeenCalledOnce(); expect(learn).toHaveBeenCalledWith('ai');
  });

  it('updates the full introduction in place when the language changes', async () => {
    render(<ReleaseNotes version="0.9.5" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeInTheDocument();
    await setLanguagePreference('zh-CN');
    expect(await screen.findByRole('heading', { name: '开始使用' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument();
  });

  it('localizes the complete introduction and keeps close and Escape independent of learning', async () => {
    await setLanguagePreference('zh-CN');
    const close = vi.fn();
    render(<ReleaseNotes version="0.9.5" onClose={close} />);
    expect(screen.getByRole('heading', { name: '新增' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '开始使用' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '更新须知' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(2);
  });
});
