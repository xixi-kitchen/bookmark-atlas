import { describe, expect, it, vi } from 'vitest';
import { createDemoBookmarkTree } from '../../src/bookmarks/demoData';
import { createMemoryBookmarkAdapter } from '../../src/bookmarks/adapter';

describe('createMemoryBookmarkAdapter', () => {
  it('supports create, update, move, delete snapshot, and restore', async () => {
    const adapter = createMemoryBookmarkAdapter(createDemoBookmarkTree());

    const created = await adapter.create({
      parentId: '10',
      title: 'MDN',
      url: 'https://developer.mozilla.org',
    });
    expect(created).toMatchObject({ parentId: '10', title: 'MDN', readonly: false });

    const renamed = await adapter.update(created.id, { title: 'MDN Web Docs' });
    expect(renamed.title).toBe('MDN Web Docs');

    const moved = await adapter.move(created.id, { parentId: '2', index: 0 });
    expect(moved).toMatchObject({ parentId: '2', index: 0 });

    const snapshot = await adapter.removeTree(moved.id);
    expect(snapshot.node.title).toBe('MDN Web Docs');
    expect(snapshot.subtree).toHaveLength(1);

    const afterRemove = await adapter.getTree();
    expect(afterRemove.nodes[moved.id]).toBeUndefined();

    const restored = await adapter.restore(snapshot);
    const afterRestore = await adapter.getTree();
    expect(restored.node.id).not.toBe(moved.id);
    expect(restored.idMap[moved.id]).toBe(restored.node.id);
    expect(afterRestore.nodes[restored.node.id]).toMatchObject({
      title: 'MDN Web Docs',
      parentId: '2',
      index: 0,
    });
  });

  it('rejects mutations against readonly system nodes', async () => {
    const adapter = createMemoryBookmarkAdapter(createDemoBookmarkTree());

    await expect(adapter.update('1', { title: 'Pinned' })).rejects.toThrow('readonly');
    await expect(adapter.move('1', { parentId: '2' })).rejects.toThrow('readonly');
    await expect(adapter.removeTree('1')).rejects.toThrow('readonly');
  });

  it('persists a new order when moving inside the same folder', async () => {
    const adapter = createMemoryBookmarkAdapter(createDemoBookmarkTree());

    await adapter.move('100', { parentId: '10', index: 1 });
    const tree = await adapter.getTree();

    expect(tree.nodes['10']?.children?.map((node) => node.id)).toEqual(['101', '100']);
    expect(tree.nodes['100']).toMatchObject({ parentId: '10', index: 1 });
  });

  it('emits events for external subscriptions', async () => {
    const adapter = createMemoryBookmarkAdapter(createDemoBookmarkTree());
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    const created = await adapter.create({ parentId: '10', title: 'Example', url: 'https://example.com' });
    await adapter.update(created.id, { title: 'Example Updated' });
    await adapter.move(created.id, { parentId: '2' });
    await adapter.removeTree(created.id);

    unsubscribe();

    expect(listener).toHaveBeenCalledWith({ name: 'created', id: created.id });
    expect(listener).toHaveBeenCalledWith({ name: 'changed', id: created.id });
    expect(listener).toHaveBeenCalledWith({ name: 'moved', id: created.id });
    expect(listener).toHaveBeenCalledWith({ name: 'removed', id: created.id });
  });
});
