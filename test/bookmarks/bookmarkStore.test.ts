import { afterEach, describe, expect, it } from 'vitest';
import { createDemoBookmarkTree } from '../../src/bookmarks/demoData';
import { createMemoryBookmarkAdapter } from '../../src/bookmarks/adapter';
import { configureBookmarkAdapterForTests, useBookmarkStore } from '../../src/store/bookmarkStore';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useBookmarkStore', () => {
  afterEach(() => {
    configureBookmarkAdapterForTests(createMemoryBookmarkAdapter(createDemoBookmarkTree()));
  });

  it('loads roots and exposes normalized nodes', async () => {
    configureBookmarkAdapterForTests(createMemoryBookmarkAdapter(createDemoBookmarkTree()));

    await useBookmarkStore.getState().initialize();

    const state = useBookmarkStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.roots.map((node) => node.id)).toEqual(['0']);
    expect(state.nodes['100']).toMatchObject({ title: 'Chrome Extensions Docs', type: 'bookmark' });
  });

  it('refreshes after store mutations and supports undo delete', async () => {
    configureBookmarkAdapterForTests(createMemoryBookmarkAdapter(createDemoBookmarkTree()));
    await useBookmarkStore.getState().initialize();

    const created = await useBookmarkStore.getState().create({
      parentId: '10',
      title: 'New Link',
      url: 'https://example.com/new',
    });
    expect(useBookmarkStore.getState().nodes[created.id]).toMatchObject({ title: 'New Link' });

    await useBookmarkStore.getState().remove(created.id);
    expect(useBookmarkStore.getState().nodes[created.id]).toBeUndefined();
    expect(useBookmarkStore.getState().lastDeleteSnapshot?.node.title).toBe('New Link');

    const restored = await useBookmarkStore.getState().undoDelete();
    expect(restored).toBeDefined();
    expect(useBookmarkStore.getState().lastDeleteSnapshot).toBeNull();
    expect(useBookmarkStore.getState().selectedIds).toEqual([restored!.id]);
  });

  it('refreshes when the adapter receives external bookmark events', async () => {
    const adapter = createMemoryBookmarkAdapter(createDemoBookmarkTree());
    configureBookmarkAdapterForTests(adapter);
    await useBookmarkStore.getState().initialize();

    const created = await adapter.create({
      parentId: '10',
      title: 'External',
      url: 'https://example.com/external',
    });
    await tick();

    expect(useBookmarkStore.getState().nodes[created.id]).toMatchObject({ title: 'External' });
  });

  it('deduplicates selection ids', () => {
    useBookmarkStore.getState().setSelected(['100', '100', '101']);

    expect(useBookmarkStore.getState().selectedIds).toEqual(['100', '101']);
  });
});
