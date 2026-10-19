import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapturePopup } from './CapturePopup';
import { CaptureError, ackCapture, captureActiveTab, openCaptureCanvas } from './captureQueue';
import { t } from '../i18n';
import { CAPTURE_OPEN_AFTER_SAVE_KEY } from './capturePreferences';

vi.mock('./captureQueue', async (original) => ({
  ...await original<typeof import('./captureQueue')>(), captureActiveTab: vi.fn(), openCaptureCanvas: vi.fn(), ackCapture: vi.fn(),
}));
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
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('toolbar capture popup', () => {
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
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(() => new Promise((done) => { resolve = done; }) as never);
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
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('secret'));
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
});
