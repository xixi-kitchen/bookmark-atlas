export type BookmarkId = string;

export type BookmarkReadonlyReason = 'root' | 'system' | 'managed';

export type BookmarkNodeType = 'bookmark' | 'folder';

export type ChromeBookmarkTreeNode = {
  id: BookmarkId;
  title: string;
  url?: string;
  children?: ChromeBookmarkTreeNode[];
  parentId?: BookmarkId;
  index?: number;
  dateAdded?: number;
  dateGroupModified?: number;
  unmodifiable?: string;
  folderType?: string;
};

export type BookmarkNode = {
  id: BookmarkId;
  title: string;
  url?: string;
  children?: BookmarkNode[];
  parentId?: BookmarkId;
  index?: number;
  dateAdded?: number;
  dateGroupModified?: number;
  unmodifiable?: ChromeBookmarkTreeNode['unmodifiable'];
  folderType?: ChromeBookmarkTreeNode['folderType'];
  readonly?: boolean;
  readonlyReason?: BookmarkReadonlyReason;
  type?: BookmarkNodeType;
  childIds?: BookmarkId[];
  depth?: number;
};

export type BookmarkTree = {
  rootIds: BookmarkId[];
  nodes: Record<BookmarkId, BookmarkNode>;
  orderedIds: BookmarkId[];
};

export type BookmarkCreateInput = {
  parentId?: BookmarkId;
  index?: number;
  title: string;
  url?: string;
};

export type BookmarkUpdateInput = {
  title?: string;
  url?: string;
};

export type BookmarkMoveInput = {
  parentId?: BookmarkId;
  index?: number;
};

export type BookmarkEventName = 'created' | 'changed' | 'moved' | 'removed' | 'childrenReordered';

export type DeleteSnapshot = {
  node: BookmarkNode;
  parentId?: BookmarkId;
  index?: number;
  deletedAt: number;
  subtree: BookmarkNode[];
};

export type RestoreResult = {
  node: BookmarkNode;
  idMap: Record<BookmarkId, BookmarkId>;
};

export type BookmarkEvent =
  | { name: 'created'; id: BookmarkId }
  | { name: 'changed'; id: BookmarkId }
  | { name: 'moved'; id: BookmarkId }
  | { name: 'removed'; id: BookmarkId }
  | { name: 'childrenReordered'; id: BookmarkId };

export type BookmarkEventUnsubscribe = () => void;

export type BookmarkAdapter = {
  getTree(): Promise<BookmarkTree>;
  create(input: BookmarkCreateInput): Promise<BookmarkNode>;
  update(id: BookmarkId, input: BookmarkUpdateInput): Promise<BookmarkNode>;
  move(id: BookmarkId, input: BookmarkMoveInput): Promise<BookmarkNode>;
  removeTree(id: BookmarkId): Promise<DeleteSnapshot>;
  restore(snapshot: DeleteSnapshot): Promise<RestoreResult>;
  subscribe(listener: (event: BookmarkEvent) => void): BookmarkEventUnsubscribe;
};
