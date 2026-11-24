import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeBookmarkTree } from '../normalize';
import { BookmarkOrganizer } from './BookmarkOrganizer';

const calls = vi.hoisted(() => ({ execute: vi.fn(), generate: vi.fn(), adopt: vi.fn() }));
vi.mock('./client', () => ({
  loadOrganizationHistory: async () => [], subscribeOrganizationHistory: () => () => {},
  executeOrganization: calls.execute, resumeOrganization: vi.fn(), restoreOrganization: vi.fn(),
  adoptHistoricalBookmarks: calls.adopt, acknowledgeOrganizationStep: vi.fn(), forgetOrganizationHistory: vi.fn(),
}));
vi.mock('./provenance', () => ({ loadCaptureOrigins: async () => [] }));
vi.mock('./ai', () => ({
  nativeFolderChoices: () => [{ id: '2', title: 'Other bookmarks', path: 'Other bookmarks' }, { id: 'f', title: 'Work', path: 'Other bookmarks / Work' }],
  prepareNativeOrganization: (input: { scopeIds: string[]; organizationRootId?: string }) => ({ outgoing: { items: input.scopeIds.map(id => ({ id, title: 'Article', domain: 'example.com' })), folders: [], organizationRootId: input.organizationRootId } }),
  generateNativeOrganization: calls.generate,
}));
vi.mock('../../ai/client', () => ({ loadLocalAISettings: async () => ({ baseUrl: 'https://ai.example/v1', model: 'model', apiKey: 'local-secret' }), requestAIOriginPermission: async () => true }));
vi.mock('../../i18n', () => ({ getUiLanguage: () => 'en' }));
const tree = normalizeBookmarkTree([{ id: '0', title: '', children: [{ id: '2', parentId: '0', title: 'Other bookmarks', children: [
  { id: 'a', parentId: '2', title: 'Article', url: 'https://example.com/private?token=secret', index: 0 },
  { id: 'f', parentId: '2', title: 'Work', index: 1, children: [] },
] }] }]);
function renderSelected(onClose = () => {}, onChanged?: () => void) {
  const rendered = render(<BookmarkOrganizer tree={tree} selectedIds={['a']} onClose={onClose} onChanged={onChanged} onOpenAISettings={() => {}} />);
  fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'selected' } });
  return rendered;
}
async function advanceToAI() {
  fireEvent.click(screen.getByRole('button', { name: 'Next: choose how to organize' }));
  fireEvent.click(screen.getByLabelText('Allow this displayed scope to be sent to my AI provider.'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate suggestions' })).toBeEnabled());
}

describe('native bookmark organizer ordered flow', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    calls.execute.mockImplementation(async plan => ({ id: plan.id, plan, status: 'completed', steps: [], createdAt: 1, updatedAt: 1, idMap: {}, pathChanges: [] }));
  });
  it('separates selecting scope, choosing manual moves, and reviewing before applying', async () => {
    renderSelected();
    expect(screen.queryByLabelText('Move selected bookmarks to')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next: choose how to organize' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Move manually' }));
    fireEvent.change(screen.getByLabelText('Move selected bookmarks to'), { target: { value: 'f' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview moves' }));
    expect(calls.execute).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review and apply' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply selected/ }));
    await waitFor(() => expect(calls.execute).toHaveBeenCalledOnce());
    expect(calls.execute.mock.calls[0]![0].operations).toEqual([expect.objectContaining({ type: 'move', id: 'a', parentId: 'f' })]);
  });
  it('explains a zero-change manual preview without attributing it to AI', () => {
    renderSelected();
    fireEvent.click(screen.getByRole('button', { name: 'Next: choose how to organize' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Move manually' }));
    fireEvent.change(screen.getByLabelText('Move selected bookmarks to'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview moves' }));
    expect(screen.getByRole('heading', { name: 'Already in the selected folder' })).toBeInTheDocument();
    expect(screen.queryByText(/AI did not propose/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply selected/ })).toBeDisabled();
  });
  it('shows an empty AI plan as zero changes and puts the source bookmark into unassigned review', async () => {
    calls.generate.mockResolvedValue({ id: 'empty', mode: 'daily', baseline: tree, scopeIds: ['a'], excludedIds: [], operations: [] });
    renderSelected(); await advanceToAI();
    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));
    await screen.findByRole('heading', { name: 'No changes generated' });
    expect(screen.getByText('Unassigned bookmarks (1)')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Move · Article/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply selected/ })).toBeDisabled();
    expect(calls.execute).not.toHaveBeenCalled();
  });
  it.each(['completed', 'partial', 'needs-review'] as const)(
    'closes only after an applied plan reaches completed status (%s)',
    async status => {
      const onClose = vi.fn();
      const onChanged = vi.fn();
      let finish!: () => void;
      calls.execute.mockImplementationOnce(plan => new Promise(resolve => {
        finish = () => resolve({ id: plan.id, status });
      }));
      calls.generate.mockResolvedValueOnce({
        id: 'result', mode: 'daily', baseline: tree, scopeIds: ['a'], excludedIds: [],
        operations: [{ key: 'move', type: 'move', id: 'a', parentId: 'f', reason: 'Relevant' }],
      });
      renderSelected(onClose, onChanged);
      await advanceToAI();
      fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Apply selected (1)' }));
      expect(onClose).not.toHaveBeenCalled();

      finish();
      await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
      if (status === 'completed') {
        expect(onClose).toHaveBeenCalledOnce();
      } else {
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'View organization history' })).toBeInTheDocument();
      }
    },
  );
  it('keeps low-confidence creation unchecked and requires visible dependency selection', async () => {
    calls.generate.mockResolvedValue({ id: 'plan-low', mode: 'advanced', baseline: tree, scopeIds: ['a', 'f'], excludedIds: [], operations: [
      { key: 'create', type: 'create-folder', id: 'new:topic', parentId: 'f', title: 'New topic', confidence: 'low', reason: 'Possible topic' },
      { key: 'move', type: 'move', id: 'a', parentId: 'new:topic', confidence: 'high', reason: 'Relevant' },
    ] });
    renderSelected();
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'advanced' } });
    await advanceToAI();
    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));
    await screen.findByText(/Select the required new folder/);
    expect(screen.getByRole('button', { name: /Apply selected/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /New folder · New topic/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /New folder · New topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apply selected/ }));
    await waitFor(() => expect(calls.execute).toHaveBeenCalledOnce());
    expect(calls.execute.mock.calls[0]![0].operations.map((op: { key: string }) => op.key)).toEqual(['create', 'move']);
  });
  it('requires renewed consent after an external tree update expands the scope', async () => {
    const props = { selectedIds: ['a'], onClose: () => {}, onOpenAISettings: () => {} };
    const rendered = render(<BookmarkOrganizer tree={tree} {...props} />);
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'all' } });
    await advanceToAI();
    const expanded = structuredClone(tree); expanded.nodes.b = { id: 'b', parentId: '2', title: 'New item', url: 'https://new.example/' }; expanded.orderedIds.push('b');
    rendered.rerender(<BookmarkOrganizer tree={expanded} {...props} />);
    expect(screen.getByRole('button', { name: 'Generate suggestions' })).toBeDisabled();
    expect(screen.getByLabelText('Allow this displayed scope to be sent to my AI provider.')).not.toBeChecked();
  });
  it('gates AI generation on explicit consent and keeps the credential out of view', async () => {
    renderSelected();
    fireEvent.click(screen.getByRole('button', { name: 'Next: choose how to organize' }));
    expect(screen.getByRole('button', { name: 'Generate suggestions' })).toBeDisabled();
    expect(screen.queryByText('local-secret')).not.toBeInTheDocument();
    expect(calls.generate).not.toHaveBeenCalled();
  });
});
