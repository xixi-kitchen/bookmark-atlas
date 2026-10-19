import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIOrganizer } from './AIOrganizer';
import { AIError } from './plan';

const config = { baseUrl: 'https://model.example/v1', model: 'my-model', apiKey: 'test-only-key' };
const client = vi.hoisted(() => ({ load: vi.fn(), permission: vi.fn(), request: vi.fn() }));
vi.mock('./client', async (original) => ({
  ...await original<typeof import('./client')>(), loadLocalAISettings: client.load,
  requestAIOriginPermission: client.permission, requestOrganization: client.request,
}));
const items = [{ id: 'one', title: 'Example', domain: 'example.com', description: 'My note' }];
const plan = { groups: [{ title: 'Tools', items: [{ id: 'one' }] }] };
let storageListener: (changes: Record<string, unknown>, area: string) => void;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.clearAllMocks(); client.load.mockResolvedValue(config); client.permission.mockResolvedValue(true); client.request.mockResolvedValue(plan);
  vi.stubGlobal('chrome', { storage: { onChanged: { addListener: vi.fn((callback) => { storageListener = callback; }), removeListener: vi.fn() } } });
});

function fill() {
  fireEvent.change(screen.getByLabelText('How should these bookmarks be organized?'), { target: { value: 'Group by purpose' } });
}
async function loaded() { await waitFor(() => expect(screen.getByText(/Using my-model/)).toBeInTheDocument()); }

describe('saved AI organizer consent and lifecycle', () => {
  it('reports an unreadable encrypted credential instead of silently generating or rejecting unhandled', async () => {
    client.load.mockRejectedValue(new AIError('storage_unavailable'));
    render(<AIOrganizer items={items} onPlan={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Encrypted local settings');
    expect(screen.getByRole('button', { name: 'Connect & generate preview' })).toBeDisabled();
    expect(client.request).not.toHaveBeenCalled();
  });
  it('sends nothing on mount, shows no secret inputs, then reuses saved local config with explicit scope consent', async () => {
    const onPlan = vi.fn();
    render(<AIOrganizer items={items} onPlan={onPlan} onClose={vi.fn()} />);
    await loaded();
    expect(client.request).not.toHaveBeenCalled(); expect(client.permission).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('test-only-key');
    fill();
    const generate = screen.getByRole('button', { name: 'Connect & generate preview' });
    expect(generate).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(generate);
    await waitFor(() => expect(onPlan).toHaveBeenCalledWith(plan));
    expect(client.request).toHaveBeenCalledWith(config, 'test-only-key', { items, instruction: 'Group by purpose' }, expect.any(AbortSignal));
  });

  it('provides a settings entry and prevents generation without saved credentials', async () => {
    client.load.mockResolvedValue({ ...config, apiKey: '' });
    const onOpenSettings = vi.fn();
    render(<AIOrganizer items={items} onPlan={vi.fn()} onClose={vi.fn()} onOpenSettings={onOpenSettings} />);
    await act(async () => {}); fill(); fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Connect & generate preview' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'AI settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('does not request a model response when host permission is denied', async () => {
    client.permission.mockResolvedValue(false);
    render(<AIOrganizer items={items} onPlan={vi.fn()} onClose={vi.fn()} />);
    await loaded(); fill(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Connect & generate preview' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Website access was not granted'));
    expect(client.request).not.toHaveBeenCalled();
  });

  it('clears consent after local configuration or selected scope changes', async () => {
    const view = render(<AIOrganizer items={items} onPlan={vi.fn()} onClose={vi.fn()} />);
    await loaded(); fireEvent.click(screen.getByRole('checkbox'));
    client.load.mockResolvedValue({ ...config, baseUrl: 'https://other.example/v1' });
    await act(async () => storageListener({ 'bookmarkAtlas.ai.config.v1': {} }, 'local'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    view.rerender(<AIOrganizer items={[{ ...items[0]!, title: 'Changed title' }]} onPlan={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('handles a timeout without an applied plan', async () => {
    client.request.mockRejectedValue(new AIError('timeout'));
    const onPlan = vi.fn(); render(<AIOrganizer items={items} onPlan={onPlan} onClose={vi.fn()} />);
    await loaded(); fill(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Connect & generate preview' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('timed out')); expect(onPlan).not.toHaveBeenCalled();
  });

  it('aborts and ignores an old endpoint response when saved credentials change', async () => {
    let finish!: (value: typeof plan) => void;
    client.request.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const onPlan = vi.fn(); render(<AIOrganizer items={items} onPlan={onPlan} onClose={vi.fn()} />);
    await loaded(); fill(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Connect & generate preview' }));
    await waitFor(() => expect(client.request).toHaveBeenCalledOnce());
    const signal = client.request.mock.calls[0]![3] as AbortSignal;
    client.load.mockResolvedValue({ ...config, baseUrl: 'https://other.example/v1', apiKey: 'replacement' });
    await act(async () => storageListener({ 'bookmarkAtlas.ai.credentials.local.v1': {} }, 'local'));
    expect(signal.aborted).toBe(true); expect(screen.getByRole('checkbox')).not.toBeChecked();
    await act(async () => finish(plan)); expect(onPlan).not.toHaveBeenCalled();
  });

  it('aborts on close and ignores a late provider response', async () => {
    let finish!: (value: typeof plan) => void;
    client.request.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const onPlan = vi.fn(), onClose = vi.fn();
    const view = render(<AIOrganizer items={items} onPlan={onPlan} onClose={onClose} />);
    await loaded(); fill(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Connect & generate preview' }));
    await waitFor(() => expect(client.request).toHaveBeenCalledOnce());
    const signal = client.request.mock.calls[0]![3] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal.aborted).toBe(true); expect(onClose).toHaveBeenCalledOnce(); view.unmount();
    await act(async () => finish(plan)); expect(onPlan).not.toHaveBeenCalled();
  });
});
