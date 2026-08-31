import type { BookmarkNode } from '../../bookmarks/types';

export type FolderCount = {
  direct: number;
  total: number;
};

export function isFolderNode(node: BookmarkNode): boolean {
  return !node.url;
}

export function countFolderItems(folder: Pick<BookmarkNode, 'children'>): FolderCount {
  const children = folder.children ?? [];

  return {
    direct: children.length,
    total: children.reduce((count, child) => count + 1 + countDescendants(child), 0),
  };
}

export function countRootItems(roots: BookmarkNode[]): FolderCount {
  return {
    direct: roots.length,
    total: roots.reduce((count, child) => count + 1 + countDescendants(child), 0),
  };
}

export function countNodeMapTopItems(nodes: Record<string, BookmarkNode>): FolderCount {
  const topNodes = Object.values(nodes).filter((node) => !node.parentId || !nodes[node.parentId]);
  return countRootItems(topNodes);
}

export function collectFolderIds(nodes: BookmarkNode[]): string[] {
  return nodes.flatMap((node) => {
    if (!isFolderNode(node)) return [];
    return [node.id, ...collectFolderIds(node.children ?? [])];
  });
}

export function folderMatchesQuery(node: BookmarkNode, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const ownText = [node.title, node.url].filter(Boolean).join(' ').toLocaleLowerCase();
  return ownText.includes(normalizedQuery)
    || (node.children ?? []).some((child) => folderMatchesQuery(child, normalizedQuery));
}

export function buildBreadcrumbPath(
  nodes: Record<string, BookmarkNode>,
  currentFolderId?: string,
): BookmarkNode[] {
  if (!currentFolderId) return [];

  const path: BookmarkNode[] = [];
  const visited = new Set<string>();
  let node = nodes[currentFolderId];

  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    path.unshift(node);
    node = node.parentId ? nodes[node.parentId] : undefined;
  }

  return path;
}

function countDescendants(node: BookmarkNode): number {
  return (node.children ?? []).reduce((count, child) => count + 1 + countDescendants(child), 0);
}
