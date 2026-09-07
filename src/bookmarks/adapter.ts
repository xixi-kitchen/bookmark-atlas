import { createDemoBookmarkTree } from './demoData';
import { flattenSubtree, normalizeBookmarkTree } from './normalize';
import { t } from '../i18n';
import type {
  BookmarkAdapter,
  BookmarkCreateInput,
  BookmarkEvent,
  BookmarkEventUnsubscribe,
  BookmarkId,
  BookmarkMoveInput,
  BookmarkNode,
  BookmarkTree,
  BookmarkUpdateInput,
  ChromeBookmarkTreeNode,
  DeleteSnapshot,
  RestoreResult,
} from './types';

type Listener = (event: BookmarkEvent) => void;

type ChromeEvent<T extends unknown[]> = {
  addListener(listener: (...args: T) => void): void;
  removeListener(listener: (...args: T) => void): void;
};

type ChromeBookmarksRuntime = {
  getTree(callback: (nodes: ChromeBookmarkTreeNode[]) => void): void;
  create(input: BookmarkCreateInput, callback: (node: ChromeBookmarkTreeNode) => void): void;
  update(id: string, input: BookmarkUpdateInput, callback: (node: ChromeBookmarkTreeNode) => void): void;
  move(id: string, input: BookmarkMoveInput, callback: (node: ChromeBookmarkTreeNode) => void): void;
  remove?(id: string, callback: () => void): void;
  removeTree(id: string, callback: () => void): void;
  onCreated?: ChromeEvent<[string, ChromeBookmarkTreeNode]>;
  onChanged?: ChromeEvent<[string, BookmarkUpdateInput]>;
  onMoved?: ChromeEvent<
    [
      string,
      {
        parentId: string;
        index: number;
        oldParentId: string;
        oldIndex: number;
      },
    ]
  >;
  onRemoved?: ChromeEvent<
    [
      string,
      {
        parentId: string;
        index: number;
        node: ChromeBookmarkTreeNode;
      },
    ]
  >;
  onChildrenReordered?: ChromeEvent<
    [
      string,
      {
        childIds: string[];
      },
    ]
  >;
};

const DEFAULT_PARENT_ID = '1';

function getChromeBookmarksApi(): ChromeBookmarksRuntime | undefined {
  const runtime = globalThis as typeof globalThis & {
    chrome?: {
      bookmarks?: ChromeBookmarksRuntime;
      runtime?: { lastError?: { message?: string } };
    };
  };

  if (!runtime.chrome?.bookmarks?.getTree) return undefined;
  return runtime.chrome.bookmarks;
}

function getChromeLastError(): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { runtime?: { lastError?: { message?: string } } };
  };
  return runtime.chrome?.runtime?.lastError?.message;
}

function cloneTree<T>(value: T): T {
  return structuredClone(value);
}

function findNode(tree: ChromeBookmarkTreeNode[], id: BookmarkId): ChromeBookmarkTreeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const child = node.children ? findNode(node.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

function containsRawNode(node: ChromeBookmarkTreeNode, id: BookmarkId): boolean {
  return (node.children ?? []).some((child) => child.id === id || containsRawNode(child, id));
}

function findParent(
  tree: ChromeBookmarkTreeNode[],
  id: BookmarkId,
): { parent: ChromeBookmarkTreeNode; index: number } | undefined {
  for (const node of tree) {
    const index = node.children?.findIndex((child) => child.id === id) ?? -1;
    if (index >= 0) return { parent: node, index };
    const found = node.children ? findParent(node.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

function assertMutable(node: BookmarkNode): void {
  if (node.readonly) {
    throw new Error(`Bookmark "${node.title || node.id}" is readonly.`);
  }
}

function assertFolder(node: ChromeBookmarkTreeNode): void {
  if (node.url) {
    throw new Error(`Bookmark "${node.title || node.id}" is not a folder.`);
  }
}

function getNodeFromTree(tree: BookmarkTree, id: BookmarkId): BookmarkNode {
  const node = tree.nodes[id];
  if (!node) throw new Error(`Bookmark "${id}" was not found.`);
  return node;
}

function toSnapshot(tree: BookmarkTree, id: BookmarkId): DeleteSnapshot {
  const node = getNodeFromTree(tree, id);
  return {
    node,
    parentId: node.parentId,
    index: node.index,
    deletedAt: Date.now(),
    subtree: flattenSubtree(node),
  };
}

function compactInput<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

export function createChromeBookmarkAdapter(bookmarks: ChromeBookmarksRuntime): BookmarkAdapter {
  const readTree = (): Promise<ChromeBookmarkTreeNode[]> =>
    new Promise((resolve, reject) => {
      bookmarks.getTree((nodes) => {
        const error = getChromeLastError();
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(nodes);
      });
    });

  const readNormalizedTree = async (): Promise<BookmarkTree> => normalizeBookmarkTree(await readTree());

  const getNodeForMutation = async (id: BookmarkId): Promise<BookmarkNode> => {
    const tree = await readNormalizedTree();
    const node = getNodeFromTree(tree, id);
    assertMutable(node);
    return node;
  };

  const adapter: BookmarkAdapter = {
    getTree: readNormalizedTree,
    create(input) {
      return new Promise((resolve, reject) => {
        bookmarks.create(compactInput(input), (rawNode) => {
          const error = getChromeLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve(normalizeBookmarkTree([rawNode]).nodes[rawNode.id]!);
        });
      });
    },
    async update(id, input) {
      await getNodeForMutation(id);
      return new Promise((resolve, reject) => {
        bookmarks.update(id, compactInput(input), (rawNode) => {
          const error = getChromeLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve(normalizeBookmarkTree([rawNode]).nodes[rawNode.id]!);
        });
      });
    },
    async move(id, input) {
      await getNodeForMutation(id);
      return new Promise((resolve, reject) => {
        bookmarks.move(id, compactInput(input), (rawNode) => {
          const error = getChromeLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve(normalizeBookmarkTree([rawNode]).nodes[rawNode.id]!);
        });
      });
    },
    async removeTree(id) {
      const tree = await readNormalizedTree();
      const snapshot = toSnapshot(tree, id);
      assertMutable(snapshot.node);

      return new Promise((resolve, reject) => {
        const remove = snapshot.node.type === 'folder' || !bookmarks.remove ? bookmarks.removeTree : bookmarks.remove;
        remove.call(bookmarks, id, () => {
          const error = getChromeLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve(snapshot);
        });
      });
    },
    async restore(snapshot) {
      const idMap: Record<BookmarkId, BookmarkId> = {};
      const restoreNode = async (node: BookmarkNode, parentId?: BookmarkId, index?: number): Promise<BookmarkNode> => {
        const created = await adapter.create({
          parentId,
          index,
          title: node.title,
          url: node.url,
        });
        idMap[node.id] = created.id;

        for (const [childIndex, child] of (node.children ?? []).entries()) {
          await restoreNode(child, created.id, childIndex);
        }

        return created;
      };

      const node = await restoreNode(snapshot.node, snapshot.parentId, snapshot.index);
      return { node, idMap } satisfies RestoreResult;
    },
    subscribe(listener) {
      const cleanups: BookmarkEventUnsubscribe[] = [];
      const add = <T extends unknown[]>(event: ChromeEvent<T> | undefined, handler: (...args: T) => BookmarkEvent): void => {
        if (!event) return;
        const wrapped = (...args: T) => listener(handler(...args));
        event.addListener(wrapped);
        cleanups.push(() => event.removeListener(wrapped));
      };

      add(bookmarks.onCreated, (id) => ({ name: 'created', id }));
      add(bookmarks.onChanged, (id) => ({ name: 'changed', id }));
      add(bookmarks.onMoved, (id) => ({ name: 'moved', id }));
      add(bookmarks.onRemoved, (id) => ({ name: 'removed', id }));
      add(bookmarks.onChildrenReordered, (id) => ({ name: 'childrenReordered', id }));

      return () => cleanups.forEach((cleanup) => cleanup());
    },
  };

  return adapter;
}

export function createMemoryBookmarkAdapter(initialTree = createDemoBookmarkTree()): BookmarkAdapter {
  let tree = cloneTree(initialTree);
  let nextId =
    Math.max(
      0,
      ...normalizeBookmarkTree(tree).orderedIds.map((id) => {
        const parsed = Number(id);
        return Number.isFinite(parsed) ? parsed : 0;
      }),
    ) + 1;
  const listeners = new Set<Listener>();

  const emit = (event: BookmarkEvent): void => {
    listeners.forEach((listener) => listener(event));
  };

  const getNormalizedTree = (): BookmarkTree => normalizeBookmarkTree(cloneTree(tree));

  const createRawNode = (input: BookmarkCreateInput): ChromeBookmarkTreeNode => ({
    id: String(nextId++),
    parentId: input.parentId ?? DEFAULT_PARENT_ID,
    title: input.title,
    url: input.url,
    dateAdded: input.url ? Date.now() : undefined,
    children: input.url ? undefined : [],
  });

  const createUnderParent = (input: BookmarkCreateInput): ChromeBookmarkTreeNode => {
    const parent = findNode(tree, input.parentId ?? DEFAULT_PARENT_ID);
    if (!parent) throw new Error(`Parent bookmark "${input.parentId ?? DEFAULT_PARENT_ID}" was not found.`);
    assertFolder(parent);

    const node = createRawNode(input);
    const children = (parent.children ??= []);
    const index = input.index ?? children.length;
    children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
    children.forEach((child, childIndex) => {
      child.index = childIndex;
      child.parentId = parent.id;
    });
    return node;
  };

  const adapter: BookmarkAdapter = {
    async getTree() {
      return getNormalizedTree();
    },
    async create(input) {
      const rawNode = createUnderParent(input);
      emit({ name: 'created', id: rawNode.id });
      return getNodeFromTree(getNormalizedTree(), rawNode.id);
    },
    async update(id, input) {
      const normalized = getNormalizedTree();
      assertMutable(getNodeFromTree(normalized, id));
      const node = findNode(tree, id);
      if (!node) throw new Error(`Bookmark "${id}" was not found.`);

      if (input.title !== undefined) node.title = input.title;
      if (input.url !== undefined) node.url = input.url;
      emit({ name: 'changed', id });
      return getNodeFromTree(getNormalizedTree(), id);
    },
    async move(id, input) {
      const normalized = getNormalizedTree();
      assertMutable(getNodeFromTree(normalized, id));
      const currentParent = findParent(tree, id);
      if (!currentParent) throw new Error(`Bookmark "${id}" was not found.`);

      const sourceNode = currentParent.parent.children?.[currentParent.index];
      const requestedParentId = input.parentId ?? currentParent.parent.id;
      if (!sourceNode) throw new Error(`Bookmark "${id}" was not found.`);
      if (sourceNode.id === requestedParentId || containsRawNode(sourceNode, requestedParentId)) {
        throw new Error('A bookmark folder cannot be moved into itself or one of its descendants.');
      }

      const [node] = currentParent.parent.children!.splice(currentParent.index, 1);
      if (!node) throw new Error(`Bookmark "${id}" was not found.`);

      const nextParent = findNode(tree, input.parentId ?? currentParent.parent.id);
      if (!nextParent) throw new Error(`Parent bookmark "${input.parentId}" was not found.`);
      assertFolder(nextParent);

      const targetChildren = (nextParent.children ??= []);
      const targetIndex = input.index ?? targetChildren.length;
      node.parentId = nextParent.id;
      targetChildren.splice(Math.max(0, Math.min(targetIndex, targetChildren.length)), 0, node);

      currentParent.parent.children?.forEach((child, childIndex) => {
        child.index = childIndex;
      });
      targetChildren.forEach((child, childIndex) => {
        child.index = childIndex;
        child.parentId = nextParent.id;
      });

      emit({ name: 'moved', id });
      emit({ name: 'childrenReordered', id: nextParent.id });
      return getNodeFromTree(getNormalizedTree(), id);
    },
    async removeTree(id) {
      const normalized = getNormalizedTree();
      const snapshot = toSnapshot(normalized, id);
      assertMutable(snapshot.node);
      const parent = findParent(tree, id);
      if (!parent) throw new Error(`Bookmark "${id}" was not found.`);

      parent.parent.children!.splice(parent.index, 1);
      parent.parent.children?.forEach((child, childIndex) => {
        child.index = childIndex;
      });
      emit({ name: 'removed', id });
      return snapshot;
    },
    async restore(snapshot) {
      const idMap: Record<BookmarkId, BookmarkId> = {};
      const createRestoredNode = (node: BookmarkNode, parentId?: BookmarkId, index?: number): ChromeBookmarkTreeNode => {
        const rawNode = createUnderParent({
          parentId,
          index,
          title: node.title,
          url: node.url,
        });
        idMap[node.id] = rawNode.id;

        for (const [childIndex, child] of (node.children ?? []).entries()) {
          createRestoredNode(child, rawNode.id, childIndex);
        }

        return rawNode;
      };

      const restored = createRestoredNode(snapshot.node, snapshot.parentId, snapshot.index);
      emit({ name: 'created', id: restored.id });
      return { node: getNodeFromTree(getNormalizedTree(), restored.id), idMap };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return adapter;
}

export function createBookmarkAdapter(): BookmarkAdapter {
  const chromeBookmarks = getChromeBookmarksApi();
  if (chromeBookmarks) return createChromeBookmarkAdapter(chromeBookmarks);
  if (globalThis.location?.protocol === 'chrome-extension:') return createUnavailableBookmarkAdapter();
  return createMemoryBookmarkAdapter();
}

function createUnavailableBookmarkAdapter(): BookmarkAdapter {
  const failure = () => Promise.reject(new Error(t('chromeBookmarksUnavailable')));
  return {
    getTree: failure,
    create: failure,
    update: failure,
    move: failure,
    removeTree: failure,
    restore: failure,
    subscribe: () => () => undefined,
  };
}
