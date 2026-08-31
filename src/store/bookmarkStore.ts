import { create as createZustandStore } from 'zustand';
import { createBookmarkAdapter } from '../bookmarks/adapter';
import { remapCanvasLayoutIds } from '../canvas/layoutStorage';
import type {
  BookmarkAdapter,
  BookmarkCreateInput,
  BookmarkId,
  BookmarkMoveInput,
  BookmarkNode,
  BookmarkTree,
  BookmarkUpdateInput,
  DeleteSnapshot,
} from '../bookmarks/types';

type BookmarkStoreActions = {
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  create(details: BookmarkCreateInput): Promise<BookmarkNode>;
  update(id: BookmarkId, changes: BookmarkUpdateInput): Promise<BookmarkNode>;
  move(id: BookmarkId, parentId: BookmarkId, index?: number): Promise<BookmarkNode>;
  remove(id: BookmarkId): Promise<DeleteSnapshot>;
  undoDelete(): Promise<BookmarkNode | undefined>;
  setSelected(ids: BookmarkId[]): void;
};

export type BookmarkStoreState = {
  roots: BookmarkNode[];
  loading: boolean;
  error: string | null;
  nodes: Record<BookmarkId, BookmarkNode>;
  tree: BookmarkTree | null;
  selectedIds: BookmarkId[];
  lastDeleteSnapshot: DeleteSnapshot | null;
  initialized: boolean;
} & BookmarkStoreActions;

let adapter: BookmarkAdapter = createBookmarkAdapter();
let unsubscribeFromBookmarkEvents: (() => void) | undefined;

function getRoots(tree: BookmarkTree): BookmarkNode[] {
  return tree.rootIds.map((id) => tree.nodes[id]).filter((node): node is BookmarkNode => Boolean(node));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function refreshFromAdapter(set: (state: Partial<BookmarkStoreState>) => void): Promise<BookmarkTree> {
  set({ loading: true, error: null });
  try {
    const tree = await adapter.getTree();
    set({
      tree,
      nodes: tree.nodes,
      roots: getRoots(tree),
      loading: false,
      error: null,
    });
    return tree;
  } catch (error) {
    set({ loading: false, error: toErrorMessage(error) });
    throw error;
  }
}

export const useBookmarkStore = createZustandStore<BookmarkStoreState>((set, get) => ({
  roots: [],
  loading: false,
  error: null,
  nodes: {},
  tree: null,
  selectedIds: [],
  lastDeleteSnapshot: null,
  initialized: false,

  async initialize() {
    if (!get().initialized) {
      unsubscribeFromBookmarkEvents?.();
      unsubscribeFromBookmarkEvents = adapter.subscribe(() => {
        void get().refresh();
      });
      set({ initialized: true });
    }
    await get().refresh();
  },

  async refresh() {
    await refreshFromAdapter(set);
  },

  async create(details) {
    set({ loading: true, error: null });
    try {
      const node = await adapter.create(details);
      await refreshFromAdapter(set);
      return node;
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  async update(id, changes) {
    set({ loading: true, error: null });
    try {
      const node = await adapter.update(id, changes);
      await refreshFromAdapter(set);
      return node;
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  async move(id, parentId, index) {
    const input: BookmarkMoveInput = { parentId, index };
    set({ loading: true, error: null });
    try {
      const node = await adapter.move(id, input);
      await refreshFromAdapter(set);
      return node;
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  async remove(id) {
    set({ loading: true, error: null });
    try {
      const snapshot = await adapter.removeTree(id);
      await refreshFromAdapter(set);
      set((state) => ({
        lastDeleteSnapshot: snapshot,
        selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
      }));
      return snapshot;
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  async undoDelete() {
    const snapshot = get().lastDeleteSnapshot;
    if (!snapshot) return undefined;

    set({ loading: true, error: null });
    try {
      const restored = await adapter.restore(snapshot);
      await remapCanvasLayoutIds(restored.idMap);
      await refreshFromAdapter(set);
      set({ lastDeleteSnapshot: null, selectedIds: [restored.node.id] });
      return restored.node;
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  setSelected(ids) {
    set({ selectedIds: Array.from(new Set(ids)) });
  },
}));

export function configureBookmarkAdapterForTests(nextAdapter: BookmarkAdapter): void {
  unsubscribeFromBookmarkEvents?.();
  unsubscribeFromBookmarkEvents = undefined;
  adapter = nextAdapter;
  useBookmarkStore.setState({
    roots: [],
    loading: false,
    error: null,
    nodes: {},
    tree: null,
    selectedIds: [],
    lastDeleteSnapshot: null,
    initialized: false,
  });
}
