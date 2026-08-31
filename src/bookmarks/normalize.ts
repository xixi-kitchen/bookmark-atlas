import type {
  BookmarkId,
  BookmarkNode,
  BookmarkReadonlyReason,
  BookmarkTree,
  ChromeBookmarkTreeNode,
} from './types';

const SYSTEM_PARENT_ID = '0';

function getReadonlyReason(node: ChromeBookmarkTreeNode): BookmarkReadonlyReason | undefined {
  if (node.unmodifiable) return 'managed';
  if (!node.parentId) return 'root';
  if (node.parentId === SYSTEM_PARENT_ID) return 'system';
  return undefined;
}

export function isEditableBookmarkNode(node: Pick<BookmarkNode, 'readonly'>): boolean {
  return !node.readonly;
}

export function normalizeBookmarkTree(tree: ChromeBookmarkTreeNode[]): BookmarkTree {
  const nodes: Record<BookmarkId, BookmarkNode> = {};
  const orderedIds: BookmarkId[] = [];
  const rootIds = tree.map((node) => node.id);

  const visit = (rawNode: ChromeBookmarkTreeNode, depth: number): BookmarkNode => {
    const childIds = rawNode.children?.map((child) => child.id) ?? [];
    const readonlyReason = getReadonlyReason(rawNode);
    const node: BookmarkNode = {
      id: rawNode.id,
      title: rawNode.title,
      url: rawNode.url,
      parentId: rawNode.parentId,
      index: rawNode.index,
      children: undefined,
      dateAdded: rawNode.dateAdded,
      dateGroupModified: rawNode.dateGroupModified,
      unmodifiable: rawNode.unmodifiable,
      folderType: rawNode.folderType,
      readonly: Boolean(readonlyReason),
      readonlyReason,
      type: rawNode.url ? 'bookmark' : 'folder',
      childIds,
      depth,
    };

    nodes[node.id] = node;
    orderedIds.push(node.id);

    const children = rawNode.children?.map((child) => visit(child, depth + 1));
    if (children && children.length > 0) {
      node.children = children;
    }

    return node;
  };

  tree.forEach((node) => visit(node, 0));

  return { rootIds, nodes, orderedIds };
}

export function flattenSubtree(node: BookmarkNode): BookmarkNode[] {
  return [node, ...(node.children ?? []).flatMap((child) => flattenSubtree(child))];
}
