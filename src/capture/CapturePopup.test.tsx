import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalAISettings, requestAIOriginPermission } from '../ai/client';
import { recommendNativeFolders } from '../bookmarks/organization/ai';
import { CapturePopup } from './CapturePopup';
import { CaptureError, ackCapture, captureActiveTab, openCaptureCanvas } from './captureQueue';
import { t } from '../i18n';
import { CAPTURE_OPEN_AFTER_SAVE_KEY } from './capturePreferences';
import { LEARNING_PROGRESS_STORAGE_KEY, readLearningProgress, startLearning } from '../onboarding/learningState';
import { readReleaseNotice, recordReleaseEducation } from '../onboarding/releaseEducation';

// The feature-notice scenario below explicitly records version 0.9.6.
vi.mock('../../package.json', () => ({ default: { version: '0.9.6' } }));

vi.mock('./captureQueue', async (original) => ({
  ...await original<typeof import('./captureQueue')>(), captureActiveTab: vi.fn(), openCaptureCanvas: vi.fn(), ackCapture: vi.fn(),
}));
vi.mock('../ai/client', async (original) => ({ ...await original<typeof import('../ai/client')>(), loadLocalAISettings: vi.fn(), requestAIOriginPermission: vi.fn() }));
vi.mock('../bookmarks/organization/ai', async (original) => ({ ...await original<typeof import('../bookmarks/organization/ai')>(), recommendNativeFolders: vi.fn() }));
const intent = { id: 'capture1', bookmarkId: 'bookmark1', title: 'Example', url: 'https://example.com/?private=1', folderPath: 'Other bookmarks / Bookmark Atlas', createdAt: 1_000 };
let localValues: Record<string, unknown>;

beforeEach(() => {
  localValues = {};
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn(async () => [{ id: 7, active: true, title: 'Example page', url: intent.url }]) },
    storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: localValues[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(localValues, values); }),
    } },
  });
  vi.spyOn(window, 'close').mockImplementation(() => {});
  vi.mocked(captureActiveTab).mockResolvedValue(intent);
  vi.mocked(openCaptureCanvas).mockResolvedValue();
  vi.mocked(loadLocalAISettings).mockResolvedValue({ baseUrl: 'https://model.example/v1', model: 'test', apiKey: 'local-key' });
  vi.mocked(requestAIOriginPermission).mockResolvedValue(true);
  vi.mocked(recommendNativeFolders).mockResolvedValue([{ folderId: 'work', reason: 'Related to work', confidence: 'high' }]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('toolbar capture popup', () => {
  it('offers two labeled native radio modes and optional independent bookmark saving', async () => {
    render(<CapturePopup />);
    const bookmarkMode = await screen.findByRole('radio', { name: 'Bookmark card' });
    await waitFor(() => expect(bookmarkMode).toBeEnabled());
    expect(bookmarkMode).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Also save a browser bookmark' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Webpage embed' }));
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Embed in canvas' })).toBeEnabled();
  });

  it('waits for local learning completion before navigating away and closing the popup', async () => {
    await startLearning('capture');
    let finish!: () => void;
    const stored = new Promise<void>((resolve) => { finish = resolve; });
    const waiting = vi.fn();
    vi.mocked(chrome.storage.local.set).mockImplementation(async (values) => {
      if (LEARNING_PROGRESS_STORAGE_KEY in values) { waiting(); await stored; }
      Object.assign(localValues, values);
    });
    render(<CapturePopup />);
    const button = await screen.findByRole('button', { name: t('captureAddToCanvas') });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(waiting).toHaveBeenCalledOnce());
    try {
      expect(openCaptureCanvas).not.toHaveBeenCalled();
      expect(window.close).not.toHaveBeenCalled();
    } finally { await act(async () => finish()); }
    await waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect((await readLearningProgress())?.status).toBe('completed');
  });

  it('only captures after a clear user action and never displays private URL parameters', async () => {
    render(<CapturePopup />);
    const button = await screen.findByRole('button', { name: t('captureAddToCanvas') });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByText('Example page')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private=1');
    expect(captureActiveTab).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(openCaptureCanvas).toHaveBeenCalledWith('capture1'));
    expect(captureActiveTab).toHaveBeenCalledTimes(1);
    expect(captureActiveTab).toHaveBeenCalledWith(7);
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it('allows choosing a real bookmark folder and forwards that destination on capture', async () => {
    Object.assign(chrome, { bookmarks: { getTree: vi.fn(async () => [{ id: '0', title: '', children: [
      { id: '1', parentId: '0', title: 'Bookmarks bar', children: [{ id: 'work', parentId: '1', title: 'Work', children: [] }] },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ] }]) } });
    render(<CapturePopup />);
    const destination = await screen.findByRole('combobox', { name: 'Save to' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bookmarks bar / Work' })).toBeInTheDocument());
    fireEvent.change(destination, { target: { value: 'work' } });
    fireEvent.click(screen.getByRole('button', { name: t('captureAddToCanvas') }));
    await waitFor(() => expect(captureActiveTab).toHaveBeenCalledWith(7, 'work'));
  });

  it('keeps the default inbox automatic when its existing native folder is deleted', async () => {
    let removed: (() => void) | undefined;
    const rawTree = [{ id: '0', title: '', children: [
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [{ id: 'inbox', parentId: '2', title: 'Bookmark Atlas', children: [] }] },
    ] }];
    Object.assign(chrome, { bookmarks: {
      getTree: vi.fn(async () => structuredClone(rawTree)),
      onRemoved: { addListener: (listener: () => void) => { removed = listener; }, removeListener: vi.fn() },
    } });
    render(<CapturePopup />);
    const destination = await screen.findByRole('combobox', { name: 'Save to' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Other bookmarks / Bookmark Atlas' })).toBeInTheDocument());
    expect(destination).toHaveValue('');
    expect(captureActiveTab).not.toHaveBeenCalled();
    rawTree[0]!.children[0]!.children = [];
    await act(async () => { removed?.(); });
    const save = screen.getByRole('button', { name: t('captureAddToCanvas') });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(captureActiveTab).toHaveBeenCalledWith(7));
  });

  it('requires a new choice when a selected custom folder disappears, while default inbox remains usable', async () => {
    let removed: (() => void) | undefined;
    const rawTree = [{ id: '0', title: '', children: [
      { id: '1', parentId: '0', title: 'Bookmarks bar', children: [{ id: 'work', parentId: '1', title: 'Work', children: [] }] },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ] }];
    Object.assign(chrome, { bookmarks: {
      getTree: vi.fn(async () => structuredClone(rawTree)),
      onRemoved: { addListener: (listener: () => void) => { removed = listener; }, removeListener: vi.fn() },
    } });
    render(<CapturePopup />);
    const destination = await screen.findByRole('combobox', { name: 'Save to' });
    await screen.findByRole('option', { name: 'Bookmarks bar / Work' });
    fireEvent.change(destination, { target: { value: 'work' } });
    rawTree[0]!.children[0]!.children = [];
    await act(async () => { removed?.(); });
    await waitFor(() => expect(screen.getByRole('button', { name: t('captureAddToCanvas') })).toBeDisabled());
    expect(screen.getByRole('alert')).toHaveTextContent('Choose another folder or the default inbox');
    expect(captureActiveTab).not.toHaveBeenCalled();
    fireEvent.change(destination, { target: { value: '' } });
    await waitFor(() => expect(screen.getByRole('button', { name: t('captureAddToCanvas') })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: t('captureAddToCanvas') }));
    await waitFor(() => expect(captureActiveTab).toHaveBeenCalledWith(7));
  });

  it('requires consent for displayed folder metadata and applies a chosen AI recommendation', async () => {
    Object.assign(chrome, { bookmarks: { getTree: vi.fn(async () => [{ id: '0', title: '', children: [
      { id: '1', parentId: '0', title: 'Bookmarks bar', children: [{ id: 'work', parentId: '1', title: 'Work', children: [] }] },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ] }]) } });
    render(<CapturePopup />);
    const recommendations = await screen.findByRole('button', { name: 'AI recommendations' });
    await waitFor(() => expect(recommendations).toBeEnabled());
    fireEvent.click(recommendations);
    const generate = await screen.findByRole('button', { name: 'Get folder suggestions' });
    await waitFor(() => expect(loadLocalAISettings).toHaveBeenCalledOnce());
    expect(generate).toBeDisabled();
    expect(recommendNativeFolders).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('private=1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow sending the listed data' }));
    fireEvent.click(generate);
    await waitFor(() => expect(recommendNativeFolders).toHaveBeenCalledOnce());
    const sent = vi.mocked(recommendNativeFolders).mock.calls[0]![1];
    expect(sent).toMatchObject({ title: 'Example page', domain: 'example.com', folders: expect.arrayContaining([{ id: 'work', title: 'Work', path: 'Bookmarks bar / Work' }]) });
    expect(JSON.stringify(sent)).not.toContain('private=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Bookmarks bar / Work Related to work' }));
    expect(screen.getByRole('combobox', { name: 'Save to' })).toHaveValue('work');
    expect(screen.queryByRole('checkbox', { name: 'Allow sending the listed data' })).not.toBeInTheDocument();
  });

  it('disables internal browser pages and provides an explanation', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([{ id: 7, active: true, url: 'chrome://settings/' } as chrome.tabs.Tab]);
    render(<CapturePopup />);
    await screen.findByText(t('captureUnsupportedPage'));
    expect(screen.getByRole('button')).toBeDisabled();
    expect(captureActiveTab).not.toHaveBeenCalled();
  });

  it('keeps duplicate clicks out while the background operation is pending', async () => {
    let resolve!: (value: typeof intent) => void;
    vi.mocked(captureActiveTab).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<CapturePopup />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(captureActiveTab).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolve(intent));
  });

  it('can retry an open failure without exposing the original error and waits for navigation before closing', async () => {
    vi.mocked(openCaptureCanvas).mockRejectedValueOnce(new Error('secret private URL'));
    render(<CapturePopup />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureFailed'));
    expect(document.body.textContent).not.toContain('secret');
    expect(window.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
    expect(captureActiveTab).toHaveBeenCalledOnce();
  });

  it('explains a full queue instead of silently creating more bookmarks', async () => {
    vi.mocked(captureActiveTab).mockRejectedValueOnce(new CaptureError('queue_full'));
    render(<CapturePopup />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureQueueFull'));
    expect(openCaptureCanvas).not.toHaveBeenCalled();
  });

  it('remembers no-open locally across popup mounts and saves without navigation or closing', async () => {
    const first = render(<CapturePopup />);
    const checkbox = screen.getByRole('checkbox');
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledWith({ [CAPTURE_OPEN_AFTER_SAVE_KEY]: false }));
    await waitFor(() => expect(checkbox).toBeEnabled());
    first.unmount();
    render(<CapturePopup />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(button);
    await screen.findByText(t('captureSavedWithoutOpening'));
    expect(captureActiveTab).toHaveBeenCalledOnce();
    expect(openCaptureCanvas).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
    expect(ackCapture).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(captureActiveTab).toHaveBeenCalledOnce();
  });

  it('can enable opening again and persist the new choice', async () => {
    localValues[CAPTURE_OPEN_AFTER_SAVE_KEY] = false;
    render(<CapturePopup />);
    const checkbox = screen.getByRole('checkbox');
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(localValues[CAPTURE_OPEN_AFTER_SAVE_KEY]).toBe(true);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(openCaptureCanvas).toHaveBeenCalledWith(intent.id));
    expect(window.close).toHaveBeenCalledOnce();
    expect(ackCapture).not.toHaveBeenCalled();
  });

  it('waits for a saved preference before enabling collection and never reads a default too early', async () => {
    let resolve!: (value: Record<string, unknown>) => void;
    vi.mocked(chrome.storage.local.get).mockImplementation((key) => key === CAPTURE_OPEN_AFTER_SAVE_KEY
      ? new Promise((done) => { resolve = done; }) : Promise.resolve({ [String(key)]: localValues[String(key)] }));
    render(<CapturePopup />);
    await screen.findByText('Example page');
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.click(button);
    expect(captureActiveTab).not.toHaveBeenCalled();
    await act(async () => resolve({ [CAPTURE_OPEN_AFTER_SAVE_KEY]: false }));
    fireEvent.click(button);
    await screen.findByText(t('captureSavedWithoutOpening'));
    expect(openCaptureCanvas).not.toHaveBeenCalled();
  });

  it('blocks submission while saving and rolls back on preference failure', async () => {
    localValues[CAPTURE_OPEN_AFTER_SAVE_KEY] = false;
    let reject!: (reason: Error) => void;
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }) as never);
    render(<CapturePopup />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(captureActiveTab).not.toHaveBeenCalled();
    await act(async () => reject(new Error('private failure')));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureOpenPreferenceFailed'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(document.body.textContent).not.toContain('private failure');
    fireEvent.click(button);
    await screen.findByText(t('captureSavedWithoutOpening'));
    expect(openCaptureCanvas).not.toHaveBeenCalled();
  });

  it('can collect safely without navigating when local preference retrieval fails', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(async (key) => {
      if (key === CAPTURE_OPEN_AFTER_SAVE_KEY) throw new Error('secret');
      return { [String(key)]: localValues[String(key)] };
    });
    render(<CapturePopup />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureOpenPreferenceLoadFailed'));
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(button);
    await screen.findByText(t('captureSavedWithoutOpening'));
    expect(captureActiveTab).toHaveBeenCalledOnce();
    expect(openCaptureCanvas).not.toHaveBeenCalled();
  });

  it('keeps a no-open choice through capture failure and retry without navigating', async () => {
    localValues[CAPTURE_OPEN_AFTER_SAVE_KEY] = false;
    vi.mocked(captureActiveTab).mockRejectedValueOnce(new CaptureError('failed'));
    render(<CapturePopup />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await screen.findByText(t('captureSavedWithoutOpening'));
    expect(openCaptureCanvas).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('clears a used capture feature marker without pretending update notes were read', async () => {
    await recordReleaseEducation({ version: '0.9.6', level: 'notes', chapters: ['capture'] });
    render(<CapturePopup />);
    expect(await screen.findByText('NEW')).toBeInTheDocument();
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(await readReleaseNotice('0.9.6')).toMatchObject({ unread: true });
    expect((await readReleaseNotice('0.9.6')).featureChapters).toBeUndefined();
    expect(await readLearningProgress()).toBeNull();
  });
});
