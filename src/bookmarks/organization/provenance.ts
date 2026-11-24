import type { BookmarkTree } from '../types';
import { folderPath } from './tree';
import { NativeOrganizationError } from './types';
export const CAPTURE_ORIGINS_KEY = 'bookmark-atlas:capture-origins:v1';
export type CaptureOrigin = {
    bookmarkId: string;
    url: string;
    title: string;
    parentId: string;
    folderPath: string;
    created: boolean;
    organized: boolean;
    adopted?: boolean;
    requestId?: string;
    createdAt: number;
};
export type CapturedBookmarkInput = Omit<CaptureOrigin, 'createdAt'>;
async function readOrigins(): Promise<CaptureOrigin[]> {
    const storage = globalThis.chrome?.storage?.local;
    if (!storage)
        throw new NativeOrganizationError('storage_unavailable');
    const value = (await storage.get(CAPTURE_ORIGINS_KEY))[CAPTURE_ORIGINS_KEY];
    if (value === undefined)
        return [];
    if (!value || value.version !== 1 || !Array.isArray(value.items) || value.items.some((item: CaptureOrigin) => !item
        || ['bookmarkId', 'url', 'title', 'parentId', 'folderPath'].some(key => typeof item[key as keyof CaptureOrigin] !== 'string')
        || typeof item.created !== 'boolean' || typeof item.organized !== 'boolean' || (item.adopted !== undefined && typeof item.adopted !== 'boolean') || !Number.isFinite(item.createdAt))) {
        throw new NativeOrganizationError('invalid_origins');
    }
    return value.items;
}
export async function loadCaptureOrigins(): Promise<CaptureOrigin[]> { return readOrigins(); }
async function mutateOrigins(update: (items: CaptureOrigin[]) => CaptureOrigin[]): Promise<void> {
    const mutate = async () => {
        const items = update(await readOrigins());
        await chrome.storage.local.set({ [CAPTURE_ORIGINS_KEY]: { version: 1, items } });
    };
    const locks = (globalThis.navigator as (Navigator & {
        locks?: LockManager;
    }) | undefined)?.locks;
    if (locks)
        await locks.request(CAPTURE_ORIGINS_KEY, mutate);
    else
        await mutate();
}
export async function recordCapturedBookmark(input: CapturedBookmarkInput): Promise<void> {
    if (!input.bookmarkId || !input.url || !input.parentId)
        throw new NativeOrganizationError('invalid_origin');
    await mutateOrigins(items => {
        const previous = items.find(item => item.bookmarkId === input.bookmarkId && item.url === input.url);
        const item: CaptureOrigin = {
            ...input, ...(previous?.adopted ? { adopted: true } : {}), created: input.created || previous?.created === true,
            organized: input.organized || previous?.organized === true,
            ...(previous?.adopted ? { adopted: true } : {}),
            createdAt: previous?.createdAt ?? Date.now(),
        };
        return [...items.filter(item => item.bookmarkId !== input.bookmarkId), item];
    });
}
export async function adoptHistoricalOrigins(ids: string[], tree: BookmarkTree): Promise<void> {
    const nodes = ids.map(id => tree.nodes[id]);
    if (nodes.some(node => !node?.url || node.readonlyReason === 'managed' || node.unmodifiable))
        throw new NativeOrganizationError('invalid_origin');
    await mutateOrigins(items => {
        const added = nodes.filter(node => !items.some(item => item.bookmarkId === node!.id && item.url === node!.url)).map(node => ({
            bookmarkId: node!.id, url: node!.url!, title: node!.title, parentId: node!.parentId!, folderPath: folderPath(tree, node!.parentId!),
            created: false, organized: false, adopted: true, createdAt: Date.now(),
        }));
        return [...items, ...added];
    });
}
export async function markOriginsOrganized(ids: string[], tree: BookmarkTree, restoring = false, previous: CaptureOrigin[] = []): Promise<void> {
    const affected = new Set(ids);
    await mutateOrigins(items => items.map(item => {
        const node = tree.nodes[item.bookmarkId];
        if (!affected.has(item.bookmarkId) || !node?.url || node.url !== item.url || !node.parentId)
            return item;
        const prior = previous.find(candidate => candidate.bookmarkId === item.bookmarkId && candidate.url === item.url);
        const parent = tree.nodes[node.parentId];
        const root = parent?.parentId ? tree.nodes[parent.parentId] : undefined;
        const inbox = parent?.title === 'Bookmark Atlas' && (root?.folderType === 'other' || root?.id === '2');
        return { ...item, title: node.title, parentId: node.parentId, folderPath: folderPath(tree, node.parentId), organized: restoring ? prior?.organized ?? !inbox : true };
    }));
}
