import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapturePopup } from './CapturePopup';
import { captureActiveTab } from './captureQueue';
import { CAPTURE_OPEN_AFTER_SAVE_KEY, CAPTURE_OPTIONS_KEY } from './capturePreferences';
import { EmbedCaptureError, captureEmbedActiveTab, retryEmbedCapture, openEmbedCaptureCanvas, loadPendingEmbedCaptures, cancelEmbedCapture, getEmbedCaptureStatus } from './embedCaptureQueue';
import { readLearningProgress, startLearning } from '../onboarding/learningState';
import { t } from '../i18n';

vi.mock('./captureQueue', async (original) => ({ ...await original<typeof import('./captureQueue')>(), captureActiveTab: vi.fn() }));
vi.mock('./embedCaptureQueue', async (original) => ({
  ...await original<typeof import('./embedCaptureQueue')>(), captureEmbedActiveTab: vi.fn(), retryEmbedCapture: vi.fn(), openEmbedCaptureCanvas: vi.fn(), loadPendingEmbedCaptures: vi.fn(), cancelEmbedCapture: vi.fn(), getEmbedCaptureStatus: vi.fn(),
}));
const intent = { id: 'e629684f-df6a-470e-9f5b-a2124c1bac93', kind: 'embed' as const, url: 'https://example.com/?private=1#page', title: 'Page', createdAt: 1000, saveBookmark: true, phase: 'ready' as const };
let values: Record<string, unknown>;
beforeEach(() => {
  values = { [CAPTURE_OPEN_AFTER_SAVE_KEY]: false };
  vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 7, active: true, title: 'Example page', url: intent.url }]) }, storage: { local: {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })), set: vi.fn(async (next: Record<string, unknown>) => { Object.assign(values, next); }),
  } } });
  vi.spyOn(window, 'close').mockImplementation(() => {});
  vi.mocked(captureEmbedActiveTab).mockImplementation(async (input) => ({ ...intent, id: input.id, saveBookmark: input.saveBookmark }));
  vi.mocked(retryEmbedCapture).mockImplementation(async (id) => ({ ...intent, id }));
  vi.mocked(openEmbedCaptureCanvas).mockResolvedValue();
  vi.mocked(loadPendingEmbedCaptures).mockResolvedValue([]);
  vi.mocked(cancelEmbedCapture).mockResolvedValue();
  vi.mocked(getEmbedCaptureStatus).mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function embedMode() {
  render(<CapturePopup />);
  const radio = screen.getByRole('radio', { name: 'Webpage embed' });
  await waitFor(() => expect(radio).toBeEnabled());
  fireEvent.click(radio);
  return screen.getByRole('button');
}

describe('toolbar webpage embed', () => {
  it('queues only explicit embed action with preview identity and optional bookmark false; saves successful local choices', async () => {
    const button = await embedMode();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' }));
    expect(values[CAPTURE_OPTIONS_KEY]).toBeUndefined();
    fireEvent.click(button);
    await screen.findByText(t('captureEmbedQueued'));
    expect(captureEmbedActiveTab).toHaveBeenCalledWith({ id: expect.any(String), tabId: 7, expectedUrl: intent.url, saveBookmark: false });
    expect(captureActiveTab).not.toHaveBeenCalled();
    expect(openEmbedCaptureCanvas).not.toHaveBeenCalled();
    expect(values[CAPTURE_OPTIONS_KEY]).toEqual({ mode: 'embed', saveBookmark: false });
    expect(document.body.textContent).not.toContain('private=1');
    expect(button).toBeDisabled();
  });

  it('remembers mode and checkbox only after success across popup mounts', async () => {
    const button = await embedMode();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' }));
    fireEvent.click(button);
    await screen.findByText(t('captureEmbedQueued'));
    cleanup();
    render(<CapturePopup />);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Webpage embed' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).not.toBeChecked();
  });

  it('retries one issued ID without saving failed choices or duplicating a capture', async () => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('failed'));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    const id = vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id;
    expect(values[CAPTURE_OPTIONS_KEY]).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenCalledWith(id);
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
  });

  it('never recreates expired or unknown retries automatically', async () => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('failed'));
    vi.mocked(retryEmbedCapture).mockRejectedValueOnce(new EmbedCaptureError('request_ended'));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await screen.findByText(t('captureEmbedRequestEnded'));
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedReadd') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(captureEmbedActiveTab).toHaveBeenCalledTimes(2);
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id).not.toBe(vi.mocked(captureEmbedActiveTab).mock.calls[1]![0].id);
  });

  it('retains partial bookmark success evidence while retrying the same request', async () => {
    const failure = new EmbedCaptureError('failed');
    Object.assign(failure, { bookmarkSaved: true });
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(failure);
    const button = await embedMode();
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureEmbedPartial'));
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenCalledWith(vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id);
  });

  it.each([false, true])('can uncheck bookmark after a confirmed preparing failure (partial=%s), requiring a fresh submit', async (partial) => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError(partial ? 'failed' : 'bookmark_failed', partial));
    vi.mocked(getEmbedCaptureStatus).mockImplementation(async (id) => ({ ...intent, id, phase: 'preparing', ...(partial ? { bookmarkId: 'saved-bookmark' } : {}) }));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    const checkbox = screen.getByRole('checkbox', { name: 'Also save a browser bookmark' });
    await waitFor(() => expect(checkbox).toBeEnabled());
    const previousId = vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id;
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(cancelEmbedCapture).toHaveBeenCalledWith(previousId);
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    expect(retryEmbedCapture).not.toHaveBeenCalled();
    expect(values[CAPTURE_OPTIONS_KEY]).toBeUndefined();
    if (partial) expect(screen.getByRole('status')).toHaveTextContent(t('captureEmbedBookmarkRetained'));
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedSubmit') }));
    await waitFor(() => expect(captureEmbedActiveTab).toHaveBeenCalledTimes(2));
    await screen.findByText(t('captureEmbedQueued'), { exact: false });
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[1]![0]).toMatchObject({ saveBookmark: false });
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[1]![0].id).not.toBe(previousId);
  });

  it('retains the original request and bookmark choice if preparing cancellation fails', async () => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('bookmark_failed'));
    vi.mocked(getEmbedCaptureStatus).mockImplementation(async (id) => ({ ...intent, id, phase: 'preparing' }));
    vi.mocked(cancelEmbedCapture).mockRejectedValueOnce(new EmbedCaptureError('failed'));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    const checkbox = screen.getByRole('checkbox', { name: 'Also save a browser bookmark' });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(cancelEmbedCapture).toHaveBeenCalledOnce());
    await waitFor(() => expect(button).toBeEnabled());
    expect(checkbox).toBeChecked();
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenCalledWith(vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id);
  });

  it('rechecks preparing status before cancellation and preserves choices if it became ready', async () => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('bookmark_failed'));
    vi.mocked(getEmbedCaptureStatus).mockImplementationOnce(async (id) => ({ ...intent, id, phase: 'preparing' })).mockResolvedValueOnce(intent);
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    const checkbox = screen.getByRole('checkbox', { name: 'Also save a browser bookmark' });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(getEmbedCaptureStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(checkbox).toBeChecked();
    expect(cancelEmbedCapture).not.toHaveBeenCalled();
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
  });

  it.each(['ready', 'planned', 'unknown'] as const)('does not unlock capture choices when failed response status is %s', async (phase) => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('failed', true));
    vi.mocked(getEmbedCaptureStatus).mockResolvedValue(phase === 'unknown' ? null : { ...intent, phase, ...(phase === 'planned' ? { target: { elementId: 'target', mode: 'create' as const } } : {}) });
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    await waitFor(() => expect(getEmbedCaptureStatus).toHaveBeenCalledOnce());
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).toBeDisabled();
    expect(cancelEmbedCapture).not.toHaveBeenCalled();
  });

  it('retries navigation only after successful queueing and keeps embed identity', async () => {
    values[CAPTURE_OPEN_AFTER_SAVE_KEY] = true;
    vi.mocked(openEmbedCaptureCanvas).mockRejectedValueOnce(new Error('private error'));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    expect(retryEmbedCapture).not.toHaveBeenCalled();
    expect(openEmbedCaptureCanvas).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain('private error');
  });

  it('allows explicit new capture after a successful request expires before navigation retry', async () => {
    values[CAPTURE_OPEN_AFTER_SAVE_KEY] = true;
    vi.mocked(openEmbedCaptureCanvas).mockRejectedValueOnce(new EmbedCaptureError('request_ended'));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByText(t('captureEmbedRequestEnded'));
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedReadd') }));
    await waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(captureEmbedActiveTab).toHaveBeenCalledTimes(2);
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id).not.toBe(vi.mocked(captureEmbedActiveTab).mock.calls[1]![0].id);
  });

  it('does not turn a choice-save failure into capture failure or navigation retry', async () => {
    vi.mocked(chrome.storage.local.set).mockImplementation(async (next) => {
      if (CAPTURE_OPTIONS_KEY in next) throw new Error('private preference error');
      Object.assign(values, next);
    });
    const button = await embedMode();
    fireEvent.click(button);
    const status = await screen.findByRole('alert');
    expect(status).toHaveTextContent(t('captureEmbedQueued'));
    expect(status).toHaveTextContent(t('captureOptionsSaveFailed'));
    expect(button).toBeDisabled();
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
  });

  it('refreshes a changed active page and requires a fresh click and fresh ID', async () => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('page_changed'));
    const button = await embedMode();
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([{ id: 7, active: true, title: 'New page', url: 'https://other.example/#new' } as chrome.tabs.Tab]);
    fireEvent.click(button);
    await screen.findByText('New page');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('capturePageChanged'));
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText(t('captureEmbedQueued'));
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[1]![0]).toMatchObject({ expectedUrl: 'https://other.example/#new' });
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id).not.toBe(vi.mocked(captureEmbedActiveTab).mock.calls[1]![0].id);
  });

  it.each(['http://changed.example/', 'chrome://settings/'])('refreshes an unsupported changed source %s and unlocks mode instead of retrying an unissued request', async (url) => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('unsupported_page'));
    const button = await embedMode();
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([{ id: 7, active: true, title: 'Changed unsupported page', url } as chrome.tabs.Tab]);
    fireEvent.click(button);
    await screen.findByText('Changed unsupported page');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('capturePageChanged'));
    expect(screen.getByRole('radio', { name: 'Bookmark card' })).toBeEnabled();
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Bookmark card' }));
    if (url.startsWith('http:')) expect(button).toBeEnabled();
    else expect(button).toBeDisabled();
    expect(retryEmbedCapture).not.toHaveBeenCalled();
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
  });

  it.each(['unavailable', 'unsupported_page', 'page_changed'] as const)('reports saved request and opening-only retry after late navigation failure %s', async (code) => {
    values[CAPTURE_OPEN_AFTER_SAVE_KEY] = true;
    vi.mocked(openEmbedCaptureCanvas).mockRejectedValueOnce(new EmbedCaptureError(code));
    const button = await embedMode();
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureEmbedOpenFailed'));
    expect(screen.getByRole('radio', { name: 'Bookmark card' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    expect(retryEmbedCapture).not.toHaveBeenCalled();
    expect(chrome.tabs.query).toHaveBeenCalledOnce();
  });

  it('surfaces persisted preparing after popup restart and only resumes the same ID on explicit click', async () => {
    let journal: Awaited<ReturnType<typeof loadPendingEmbedCaptures>> = [];
    vi.mocked(loadPendingEmbedCaptures).mockImplementation(async () => journal);
    vi.mocked(captureEmbedActiveTab).mockImplementationOnce(async (input) => {
      journal = [{ ...intent, id: input.id, phase: 'preparing', saveBookmark: input.saveBookmark }];
      throw new EmbedCaptureError('bookmark_failed');
    });
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByRole('alert');
    const originalId = vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id;
    cleanup();
    await embedMode();
    await screen.findByText(t('captureEmbedPreparing'));
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    expect(retryEmbedCapture).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedResume') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenCalledWith(originalId);
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
  });

  it('recovers multiple preparing requests one by one in journal order without URL merging', async () => {
    let journal: Awaited<ReturnType<typeof loadPendingEmbedCaptures>> = [
      { ...intent, id: 'e629684f-df6a-470e-9f5b-a2124c1bac91', phase: 'preparing', saveBookmark: true },
      { ...intent, id: 'e629684f-df6a-470e-9f5b-a2124c1bac92', phase: 'preparing', saveBookmark: false },
    ];
    vi.mocked(loadPendingEmbedCaptures).mockImplementation(async () => journal);
    vi.mocked(retryEmbedCapture).mockImplementation(async (id) => {
      const original = journal.find((item) => item.id === id)!;
      journal = journal.filter((item) => item.id !== id);
      return { ...original, phase: 'ready' };
    });
    await embedMode();
    await screen.findByText(t('captureEmbedPreparing'));
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedResume') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenLastCalledWith('e629684f-df6a-470e-9f5b-a2124c1bac91');
    cleanup();
    await embedMode();
    await screen.findByText(t('captureEmbedPreparing'));
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).not.toBeChecked();
    expect(journal).toHaveLength(1);
    expect(captureEmbedActiveTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedResume') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenLastCalledWith('e629684f-df6a-470e-9f5b-a2124c1bac92');
  });

  it('keeps restored preparing identity and choice when explicitly changing it cannot cancel', async () => {
    vi.mocked(loadPendingEmbedCaptures).mockResolvedValue([{ ...intent, phase: 'preparing' }]);
    vi.mocked(getEmbedCaptureStatus).mockResolvedValue({ ...intent, phase: 'preparing' });
    vi.mocked(cancelEmbedCapture).mockRejectedValueOnce(new EmbedCaptureError('failed'));
    await embedMode();
    await screen.findByText(t('captureEmbedPreparing'));
    const checkbox = screen.getByRole('checkbox', { name: 'Also save a browser bookmark' });
    fireEvent.click(checkbox);
    await waitFor(() => expect(cancelEmbedCapture).toHaveBeenCalledWith(intent.id));
    expect(checkbox).toBeChecked();
    expect(captureEmbedActiveTab).not.toHaveBeenCalled();
    expect(retryEmbedCapture).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText(t('captureEmbedQueued'));
    expect(retryEmbedCapture).toHaveBeenCalledWith(intent.id);
  });

  it('requires explicit recovery of a matching uncertain request before creating a new one', async () => {
    vi.mocked(loadPendingEmbedCaptures).mockResolvedValue([{ ...intent, phase: 'needs-review', target: { elementId: 'missing', mode: 'reuse' } }]);
    await embedMode();
    await screen.findByText(t('captureEmbedNeedsReview'));
    expect(captureEmbedActiveTab).not.toHaveBeenCalled();
    expect(cancelEmbedCapture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('captureEmbedReadd') }));
    await screen.findByText(t('captureEmbedQueued'));
    expect(cancelEmbedCapture).toHaveBeenCalledWith(intent.id);
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
    expect(vi.mocked(captureEmbedActiveTab).mock.calls[0]![0].id).not.toBe(intent.id);
  });

  it('shows review recovery rather than unfinished preparation when the bookmark was already saved', async () => {
    vi.mocked(captureEmbedActiveTab).mockRejectedValueOnce(new EmbedCaptureError('needs_review', true));
    const button = await embedMode();
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('captureEmbedNeedsReview'));
    expect(screen.getByRole('button', { name: t('captureEmbedReadd') })).toBeEnabled();
  });

  it('ignores uncertain requests for a different exact URL hash', async () => {
    vi.mocked(loadPendingEmbedCaptures).mockResolvedValue([{ ...intent, url: 'https://example.com/?private=1#other', phase: 'needs-review' }]);
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByText(t('captureEmbedQueued'));
    expect(cancelEmbedCapture).not.toHaveBeenCalled();
  });

  it('does not let a late preview lookup replace the result of a successful submission', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof loadPendingEmbedCaptures>>) => void;
    vi.mocked(loadPendingEmbedCaptures).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByText(t('captureEmbedQueued'));
    await act(async () => resolve([{ ...intent, phase: 'needs-review' }]));
    expect(screen.getByRole('status')).toHaveTextContent(t('captureEmbedQueued'));
    expect(screen.queryByText(t('captureEmbedNeedsReview'))).not.toBeInTheDocument();
  });

  it('never completes the bookmark learning course for an embed submission', async () => {
    await startLearning('capture');
    const button = await embedMode();
    fireEvent.click(button);
    await screen.findByText(t('captureEmbedQueued'));
    expect((await readLearningProgress())?.status).not.toBe('completed');
  });

  it('rejects plain HTTP embeds while preserving bookmark mode support', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([{ id: 7, active: true, url: 'http://example.com/' } as chrome.tabs.Tab]);
    const button = await embedMode();
    expect(button).toBeDisabled();
    expect(screen.getByText(t('captureEmbedUnsupported'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Bookmark card' }));
    expect(button).toBeEnabled();
  });

  it('keeps controls and duplicate clicks locked during an in-flight embed', async () => {
    let finish!: (value: typeof intent) => void;
    vi.mocked(captureEmbedActiveTab).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const button = await embedMode();
    fireEvent.click(button);
    await waitFor(() => expect(captureEmbedActiveTab).toHaveBeenCalledOnce());
    expect(screen.getByRole('radio', { name: 'Bookmark card' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Also save a browser bookmark' })).toBeDisabled();
    fireEvent.click(button);
    await act(async () => finish(intent));
    expect(captureEmbedActiveTab).toHaveBeenCalledOnce();
  });
});
