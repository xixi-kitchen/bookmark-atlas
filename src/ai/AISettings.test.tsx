import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AISettings } from './AISettings';
import { AIError } from './plan';

const saved = { baseUrl: 'https://model.example/v1', model: 'my-model', apiKey: 'mock-only-key' };
const client = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), clear: vi.fn(), permission: vi.fn(), models: vi.fn(), test: vi.fn() }));
vi.mock('./client', async (original) => ({
  ...await original<typeof import('./client')>(), loadLocalAISettings: client.load, saveLocalAISettings: client.save,
  clearLocalAISettings: client.clear, requestAIOriginPermission: client.permission, listAIModels: client.models, testAIConnection: client.test,
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); client.load.mockResolvedValue(saved); client.save.mockResolvedValue(undefined); client.clear.mockResolvedValue(undefined);
  client.permission.mockResolvedValue(true); client.models.mockResolvedValue(['alpha', 'beta']); client.test.mockResolvedValue(undefined);
});
async function loaded() { await waitFor(() => expect(screen.getByLabelText('Model name')).toHaveValue('my-model')); }

describe('central local AI settings', () => {
  it('loads without any network activity, masks the key, discloses encrypted local limits, and saves only explicitly', async () => {
    render(<AISettings onClose={vi.fn()} />); await loaded();
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/encrypted on this device/)).toBeInTheDocument();
    expect(client.permission).not.toHaveBeenCalled(); expect(client.models).not.toHaveBeenCalled(); expect(client.test).not.toHaveBeenCalled(); expect(client.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save on this device' }));
    await waitFor(() => expect(client.save).toHaveBeenCalledWith(saved));
    expect(await screen.findByRole('status')).toHaveTextContent('saved on this device');
  });
  it('reports encrypted-storage failure and still allows clearing unusable settings', async () => {
    client.load.mockRejectedValue(new AIError('storage_unavailable'));
    render(<AISettings onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Encrypted local settings');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear local AI settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Clear local AI settings' }));
    await waitFor(() => expect(client.clear).toHaveBeenCalledOnce());
    expect(client.test).not.toHaveBeenCalled();
  });

  it('fetches a model list explicitly, keeps manual choice, and separately tests the selected model', async () => {
    render(<AISettings onClose={vi.fn()} />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 models loaded'));
    expect(client.models).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: saved.baseUrl }), saved.apiKey, expect.any(AbortSignal));
    expect(client.test).not.toHaveBeenCalled(); expect(client.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Model name')).toHaveValue('my-model');
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'manually-selected' } });
    expect(document.querySelectorAll('datalist option')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Test selected model' }));
    await waitFor(() => expect(client.test).toHaveBeenCalledWith(expect.objectContaining({ model: 'manually-selected' }), saved.apiKey, expect.any(AbortSignal)));
    expect(await screen.findByRole('status')).toHaveTextContent('responded successfully');
    expect(client.save).not.toHaveBeenCalled();
  });

  it('clears the old key on an endpoint change and ignores a stale model response', async () => {
    let finish!: (models: string[]) => void;
    client.models.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AISettings onClose={vi.fn()} />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    await waitFor(() => expect(client.models).toHaveBeenCalledOnce());
    const signal = client.models.mock.calls[0]![2] as AbortSignal;
    fireEvent.change(screen.getByLabelText('Chat Completions-compatible Base URL'), { target: { value: 'https://other.example/v1' } });
    expect(signal.aborted).toBe(true); expect(screen.getByLabelText('API Key')).toHaveValue('');
    await act(async () => finish(['stale-secret-model']));
    expect(document.querySelectorAll('datalist option')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Test selected model' })).toBeDisabled();
    expect(client.test).not.toHaveBeenCalled();
  });

  it('does not mistake list success for generation success and shows a stable test error', async () => {
    client.test.mockRejectedValue(new AIError('unauthorized'));
    render(<AISettings onClose={vi.fn()} />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Test selected model' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/API key/i);
    expect(screen.queryByText('The selected model responded successfully.')).not.toBeInTheDocument();
  });

  it('clears configuration and cancels inflight testing when closed', async () => {
    const onClose = vi.fn(); render(<AISettings onClose={onClose} />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Clear local AI settings' }));
    await waitFor(() => expect(client.clear).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('API Key')).toHaveValue(''); expect(screen.getByLabelText('Model name')).toHaveValue('');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
  });

  it('aborts a pending generation test on close and does not display its late result', async () => {
    let finish!: () => void;
    client.test.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onClose = vi.fn();
    const view = render(<AISettings onClose={onClose} />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Test selected model' }));
    await waitFor(() => expect(client.test).toHaveBeenCalledOnce());
    const signal = client.test.mock.calls[0]![2] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(signal.aborted).toBe(true); expect(onClose).toHaveBeenCalledOnce();
    view.unmount(); await act(async () => finish());
    expect(screen.queryByText('The selected model responded successfully.')).not.toBeInTheDocument();
  });

  it('invalidates a generation test when the selected model changes', async () => {
    let finish!: () => void;
    client.test.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AISettings onClose={vi.fn()} />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Test selected model' }));
    await waitFor(() => expect(client.test).toHaveBeenCalledOnce());
    const signal = client.test.mock.calls[0]![2] as AbortSignal;
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'another-model' } });
    expect(signal.aborted).toBe(true); await act(async () => finish());
    expect(screen.queryByText('The selected model responded successfully.')).not.toBeInTheDocument();
  });
});
