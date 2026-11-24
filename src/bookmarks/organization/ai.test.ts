import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode, BookmarkTree } from '../types';
import { requestAICompletion } from '../../ai/client';
import { generateNativeOrganization, nativeFolderChoices, prepareNativeOrganization, recommendNativeFolders, type NativeFolderChoice } from './ai';

vi.mock('../../ai/client', () => ({ requestAICompletion: vi.fn() }));
const settings = { baseUrl: 'https://model.example/v1', model: 'model', apiKey: 'fake-local-key' };
const call = vi.mocked(requestAICompletion);
function tree(bookmarks = 2): BookmarkTree {
  const nodes: Record<string, BookmarkNode> = {
    root: { id: 'root', title: 'Root', readonly: true, readonlyReason: 'root' },
    bar: { id: 'bar', title: 'Bookmarks bar', parentId: 'root', readonly: true, readonlyReason: 'system' },
    inbox: { id: 'inbox', title: 'Inbox', parentId: 'bar' },
    target: { id: 'target', title: 'Research', parentId: 'bar' },
    secret: { id: 'secret', title: 'Private folder', parentId: 'bar' },
    nested: { id: 'nested', title: 'Private nested', parentId: 'secret' },
    hidden: { id: 'hidden', title: 'Hidden title', url: 'https://secret.example/private', parentId: 'nested' },
    managed: { id: 'managed', title: 'Managed folder', parentId: 'bar', unmodifiable: 'managed', readonly: true, readonlyReason: 'managed' },
    managedChild: { id: 'managedChild', title: 'Managed descendant', parentId: 'managed' },
  };
  for (let i = 0; i < bookmarks; i++) nodes[`real-bookmark-${i}`] = { id: `real-bookmark-${i}`, title: `Article ${i}`, url: `https://example.com/article/${i}?token=PRIVATE#secret`, parentId: 'inbox', index: i };
  return { nodes, rootIds: ['root'], orderedIds: Object.keys(nodes) };
}
function prepare(overrides: Record<string, unknown> = {}) {
  return prepareNativeOrganization({ tree: tree(), scopeIds: ['inbox'], excludedIds: ['secret'], mode: 'daily', instruction: 'Organize for research', ...overrides });
}
function assignments(payload: unknown) {
  const input = payload as { items: { id: string }[]; folders: { id: string; title: string }[] };
  const target = input.folders.find(folder => folder.title === 'Research')!;
  return JSON.stringify({ assignments: input.items.map(item => ({ id: item.id, folderId: target.id, reason: 'Research subject', confidence: 'high' })) });
}

beforeEach(() => { call.mockReset(); });

describe('native organization metadata boundary', () => {
  it('projects only approved metadata and excludes locked subtrees and managed descendants', () => {
    const prepared = prepare({ scopeIds: ['bar'] });
    const sent = JSON.stringify(prepared.outgoing);
    for (const value of ['PRIVATE', '#secret', '/article/', 'real-bookmark-', 'Private folder', 'Private nested', 'Hidden title', 'Managed folder', 'Managed descendant', settings.apiKey]) expect(sent).not.toContain(value);
    expect(prepared.outgoing.items).toHaveLength(2);
    expect(prepared.outgoing.items[0]).toEqual({ id: 'b1', title: 'Article 0', domain: 'example.com' });
    expect(nativeFolderChoices(prepared.tree, ['secret']).map(item => item.id)).toEqual(['bar', 'inbox', 'target']);
    expect(call).not.toHaveBeenCalled();
  });

  it('freezes the captured tree and metadata against later caller mutation', () => {
    const original = tree();
    const prepared = prepare({ tree: original });
    original.nodes.target!.title = 'Changed';
    original.nodes['real-bookmark-0']!.url = 'https://other.example/';
    expect(prepared.outgoing.folders.find(folder => folder.title === 'Research')).toBeTruthy();
    expect(prepared.tree.nodes['real-bookmark-0']!.url).toContain('example.com');
  });

  it('enforces explicitly selected candidate folders', () => {
    expect(prepare({ candidateFolderIds: ['target'] }).outgoing.folders.map(folder => folder.title)).toEqual(['Research']);
  });

  it('redacts an address used as a title before the metadata leaves the device', () => {
    const original = tree();
    original.nodes['real-bookmark-0']!.title = 'https://example.com/private?token=TITLE_SECRET#personal';
    expect(JSON.stringify(prepare({ tree: original }).outgoing)).not.toContain('TITLE_SECRET');
  });

  it('rejects an empty selection and an oversized model context before any call', () => {
    expect(() => prepare({ scopeIds: ['secret'] })).toThrow();
    const large = tree();
    large.nodes.target!.title = 'x'.repeat(120_000);
    expect(() => prepare({ tree: large })).toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('daily native organization', () => {
  it('maps temporary references locally and produces an unexecuted move plan', async () => {
    call.mockImplementation(async (_config, _key, request) => assignments(request.payload));
    const prepared = prepare();
    const result = await generateNativeOrganization(settings, prepared);
    expect(result.mode).toBe('daily');
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]).toMatchObject({ type: 'move', id: 'real-bookmark-0', parentId: 'target', confidence: 'high' });
    expect(call.mock.calls[0]![2].payload).toEqual(prepared.outgoing);
  });

  it('uses batches of 200 with the same folders and reports cumulative progress', async () => {
    call.mockImplementation(async (_config, _key, request) => assignments(request.payload));
    const progress = vi.fn();
    const result = await generateNativeOrganization(settings, prepare({ tree: tree(401) }), { onProgress: progress });
    expect(result.operations).toHaveLength(401);
    expect(call.mock.calls.map(args => (args[2].payload as { items: unknown[] }).items.length)).toEqual([200, 200, 1]);
    expect(call.mock.calls[0]![2].payload).toMatchObject({ folders: (call.mock.calls[2]![2].payload as { folders: unknown[] }).folders });
    expect(progress).toHaveBeenLastCalledWith(401, 401);
  });

  it.each([
    { assignments: [{ id: 'b1', folderId: 'invented', reason: 'x', confidence: 'high' }] },
    { assignments: [{ id: 'real-bookmark-0', folderId: 'f1', reason: 'x', confidence: 'high' }] },
    { assignments: [{ id: 'b1', folderId: 'f1', reason: 'x', confidence: 'high', url: 'https://extra.example' }] },
    { assignments: [{ id: 'b1', folderId: 'f1', reason: 'x', confidence: 'high' }, { id: 'b1', folderId: 'f1', reason: 'x', confidence: 'high' }] },
    { assignments: [], extra: true },
  ])('rejects foreign IDs, duplicates and unapproved result fields', async result => {
    call.mockResolvedValue(JSON.stringify(result));
    await expect(generateNativeOrganization(settings, prepare())).rejects.toThrow();
  });

  it('retains low confidence and allows no suggestion without inventing a destination', async () => {
    call.mockResolvedValue(JSON.stringify({ assignments: [{ id: 'b1', folderId: 'f3', reason: 'Possible match', confidence: 'low' }, { id: 'b2', folderId: null, reason: 'Unclear', confidence: 'low' }] }));
    const result = await generateNativeOrganization(settings, prepare());
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.confidence).toBe('low');
  });

  it('discards the unfinished aggregate when cancelled between batches', async () => {
    call.mockImplementation(async (_config, _key, request) => assignments(request.payload));
    const controller = new AbortController();
    await expect(generateNativeOrganization(settings, prepare({ tree: tree(201) }), {
      signal: controller.signal,
      onProgress: done => { if (done === 200) controller.abort(); },
    })).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('rejects an aborted request before sending any metadata', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(generateNativeOrganization(settings, prepare(), { signal: controller.signal })).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('advanced fixed directory planning', () => {
  it('creates the taxonomy once and classifies every batch into the same generated folder', async () => {
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: { id: string }[]; folders: { id: string; title: string }[] };
      if (!input.items) return JSON.stringify({ folders: [{ type: 'create-folder', id: 'n1', parentId: input.folders.find(f => f.title === 'Inbox')!.id, title: 'Development', reason: 'Topic grouping', confidence: 'high' }] });
      const folderId = input.folders.find(f => f.title === 'Development')!.id;
      return JSON.stringify({ assignments: input.items.map(item => ({ id: item.id, folderId, reason: 'Development', confidence: 'high' })) });
    });
    const result = await generateNativeOrganization(settings, prepare({ mode: 'advanced', tree: tree(201) }));
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls[0]![2].payload).toMatchObject({ itemCount: 201, sampleItems: expect.any(Array) });
    expect((call.mock.calls[0]![2].payload as { sampleItems: unknown[] }).sampleItems).toHaveLength(200);
    expect(result.operations[0]).toMatchObject({ type: 'create-folder', id: 'new:n1', parentId: 'inbox', title: 'Development' });
    expect(result.operations.filter(op => op.type === 'move').every(op => op.parentId === 'new:n1')).toBe(true);
  });

  it('keeps low-confidence directory proposals available for manual review', async () => {
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: unknown[]; folders: { id: string; title: string }[] };
      if (input.items) return JSON.stringify({ assignments: [] });
      return JSON.stringify({ folders: [{ type: 'merge-folder', id: input.folders.find(f => f.title === 'Inbox')!.id, parentId: input.folders.find(f => f.title === 'Research')!.id, reason: 'Possible match', confidence: 'low' }] });
    });
    const result = await generateNativeOrganization(settings, prepare({ mode: 'advanced' }));
    expect(result.operations).toHaveLength(2);
    expect(result.operations.every(operation => operation.confidence === 'low')).toBe(true);
  });

  it('rejects a folder rename outside the selected source scope', async () => {
    call.mockResolvedValue(JSON.stringify({ folders: [{ type: 'rename-folder', id: 'f3', title: 'Unexpected', reason: 'x', confidence: 'high' }] }));
    await expect(generateNativeOrganization(settings, prepare({ mode: 'advanced' }))).rejects.toThrow();
  });

  it('rejects cycles and changing a folder containing a locked descendant', async () => {
    call.mockImplementation(async (_config, _key, request) => {
      const folders = (request.payload as { folders: { id: string; title: string }[] }).folders;
      return JSON.stringify({ folders: [{ type: 'move-folder', id: folders.find(f => f.title === 'Inbox')!.id, parentId: folders.find(f => f.title === 'Inbox')!.id, reason: 'x', confidence: 'high' }] });
    });
    await expect(generateNativeOrganization(settings, prepare({ mode: 'advanced' }))).rejects.toThrow();
  });

  it('rejects moving a selected ancestor that contains an excluded child', async () => {
    const original = tree();
    original.nodes.secret!.parentId = 'inbox';
    call.mockImplementation(async (_config, _key, request) => {
      const folders = (request.payload as { folders: { id: string; title: string }[] }).folders;
      return JSON.stringify({ folders: [{ type: 'move-folder', id: folders.find(f => f.title === 'Inbox')!.id, parentId: folders.find(f => f.title === 'Research')!.id, reason: 'Topic', confidence: 'high' }] });
    });
    await expect(generateNativeOrganization(settings, prepare({ tree: original, mode: 'advanced' }))).rejects.toThrow();
    expect(JSON.stringify(call.mock.calls[0]![2].payload)).not.toContain('Private folder');
  });

  it('expands a merge into child moves and only adds empty-folder removal on explicit request', async () => {
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: { id: string }[]; folders: { id: string; title: string }[] };
      if (input.items) return JSON.stringify({ assignments: [] });
      return JSON.stringify({ folders: [{ type: 'merge-folder', id: input.folders.find(f => f.title === 'Inbox')!.id, parentId: input.folders.find(f => f.title === 'Research')!.id, reason: 'Related category', confidence: 'high' }] });
    });
    const retained = await generateNativeOrganization(settings, prepare({ mode: 'advanced' }));
    expect(retained.operations.filter(op => op.type === 'move')).toHaveLength(2);
    expect(retained.operations.some(op => op.type === 'remove-empty-folder')).toBe(false);
    const cleaned = await generateNativeOrganization(settings, prepare({ mode: 'advanced' }), { cleanupEmptyFolders: true });
    expect(cleaned.operations.at(-1)).toMatchObject({ type: 'remove-empty-folder', id: 'inbox' });
  });
});

describe('pending captures advanced planning', () => {
  function captureTree(count = 8): BookmarkTree {
    const value = tree(count);
    value.nodes['2'] = { id: '2', title: 'Other Bookmarks', parentId: 'root', readonly: true, readonlyReason: 'system', folderType: 'other' };
    value.nodes.inbox!.title = 'Bookmark Atlas';
    value.nodes.inbox!.parentId = '2';
    value.nodes.target!.parentId = '2';
    value.orderedIds = Object.keys(value.nodes);
    return value;
  }
  function pending(input: Record<string, unknown> = {}) {
    const value = input.tree as BookmarkTree | undefined ?? captureTree();
    return prepareNativeOrganization({ tree: value, scopeIds: value.orderedIds.filter(id => Boolean(value.nodes[id]?.url) && id !== 'hidden'), excludedIds: ['secret'], mode: 'advanced', instruction: 'Create categories for development, design, reading, and video', ...input });
  }
  it('creates topic folders under the approved root even when only pending leaf bookmarks are selected', async () => {
    const prepared = pending();
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: { id: string }[]; folders: NativeFolderChoice[]; organizationRootId?: string; editableFolderIds?: string[] };
      if (!input.items) {
        expect(input.editableFolderIds).toEqual([]);
        expect(input.organizationRootId).toBe(prepared.outgoing.folders.find(folder => folder.title === 'Other Bookmarks')!.id);
        return JSON.stringify({ folders: [{ type: 'create-folder', id: 'n1', parentId: input.organizationRootId, title: 'Development', reason: 'Topic', confidence: 'high' }] });
      }
      expect(input.folders.some(folder => folder.title === 'Bookmark Atlas')).toBe(false);
      const destination = input.folders.find(folder => folder.title === 'Development')!.id;
      return JSON.stringify({ assignments: input.items.map(item => ({ id: item.id, folderId: destination, reason: 'Topic match', confidence: 'high' })) });
    });
    const result = await generateNativeOrganization(settings, prepared);
    expect(result.operations[0]).toMatchObject({ type: 'create-folder', parentId: '2', title: 'Development' });
    expect(result.operations.filter(op => op.type === 'move')).toHaveLength(8);
    expect(result.operations.filter(op => op.type === 'move').every(op => op.parentId === 'new:n1')).toBe(true);
    expect(JSON.stringify(call.mock.calls.map(args => args[2].payload))).not.toContain('real-bookmark-');
  });
  it('keeps one approved root and taxonomy across pending-capture batches', async () => {
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: { id: string }[]; folders: NativeFolderChoice[]; organizationRootId?: string };
      if (!input.items) return JSON.stringify({ folders: [{ type: 'create-folder', id: 'n1', parentId: input.organizationRootId, title: 'Development', reason: 'Topic', confidence: 'high' }] });
      const destination = input.folders.find(folder => folder.title === 'Development')!.id;
      return JSON.stringify({ assignments: input.items.map(item => ({ id: item.id, folderId: destination, reason: 'Topic', confidence: 'high' })) });
    });
    const result = await generateNativeOrganization(settings, pending({ tree: captureTree(201) }));
    expect(call).toHaveBeenCalledTimes(3);
    expect(result.operations.filter(operation => operation.type === 'create-folder')).toHaveLength(1);
    expect(result.operations.filter(operation => operation.type === 'move')).toHaveLength(201);
    const first = call.mock.calls[1]![2].payload as { folders: unknown[]; items: unknown[] };
    const second = call.mock.calls[2]![2].payload as { folders: unknown[]; items: unknown[] };
    expect(first.items).toHaveLength(200);
    expect(second.items).toHaveLength(1);
    expect(second.folders).toEqual(first.folders);
  });
  it('uses an explicitly chosen destination root and rejects new folders outside it', async () => {
    const prepared = pending({ organizationRootId: 'target' });
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: unknown[]; organizationRootId?: string; folders: NativeFolderChoice[] };
      if (input.items) return JSON.stringify({ assignments: [] });
      expect(input.organizationRootId).toBe(input.folders.find(folder => folder.title === 'Research')!.id);
      return JSON.stringify({ folders: [{ type: 'create-folder', id: 'n1', parentId: input.folders.find(folder => folder.title === 'Other Bookmarks')!.id, title: 'Outside', reason: 'x', confidence: 'high' }] });
    });
    await expect(generateNativeOrganization(settings, prepared)).rejects.toThrow();
  });
  it('rejects a locked or unavailable destination root before calling a model', () => {
    expect(() => pending({ organizationRootId: 'secret' })).toThrow();
    expect(() => pending({ organizationRootId: 'missing' })).toThrow();
    expect(() => pending({ organizationRootId: 'managed' })).toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it('keeps a zero-change response empty instead of fabricating moves back to the inbox', async () => {
    call.mockImplementation(async (_config, _key, request) => {
      const input = request.payload as { items?: unknown[]; folders: NativeFolderChoice[] };
      if (!input.items) return JSON.stringify({ folders: [] });
      expect(input.folders.some(folder => folder.title === 'Bookmark Atlas')).toBe(false);
      return JSON.stringify({ assignments: [] });
    });
    expect((await generateNativeOrganization(settings, pending())).operations).toEqual([]);
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe('toolbar folder recommendations', () => {
  it('sends temporary directory refs, then maps at most three unique recommendations back locally', async () => {
    call.mockResolvedValue(JSON.stringify({ recommendations: [{ folderId: 'f2', reason: 'Topic', confidence: 'high' }] }));
    const folders = nativeFolderChoices(tree(), ['secret']);
    const result = await recommendNativeFolders(settings, { title: 'Article', domain: 'example.com', folders });
    expect(result).toEqual([{ folderId: 'inbox', reason: 'Topic', confidence: 'high' }]);
    expect(JSON.stringify(call.mock.calls[0]![2].payload)).not.toContain('"id":"inbox"');
  });

  it('rejects an unknown recommendation instead of creating a folder', async () => {
    call.mockResolvedValue(JSON.stringify({ recommendations: [{ folderId: 'unknown', reason: 'x', confidence: 'high' }] }));
    await expect(recommendNativeFolders(settings, { title: 'Article', domain: 'example.com', folders: nativeFolderChoices(tree()) })).rejects.toThrow();
  });
});
