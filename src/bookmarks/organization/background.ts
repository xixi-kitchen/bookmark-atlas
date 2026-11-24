import { createBookmarkAdapter } from '../adapter';
import { createOrganizationExecutor, type OrganizationRuntime } from './executor';
import { loadJournalRecords, saveJournalRecords, NATIVE_ORGANIZATION_KEY } from './journal';
import { adoptHistoricalOrigins, markOriginsOrganized, loadCaptureOrigins } from './provenance';
import { retainCanvasPathChanges } from './canvasChangeStorage';
import { NativeOrganizationError, NATIVE_ORGANIZATION_CHANNEL } from './types';
export { NATIVE_ORGANIZATION_CHANNEL };
export type NativeOrganizationSender = {
    id?: string;
    url?: string;
    tab?: {
        id?: number;
    };
};
function permittedSender(sender: NativeOrganizationSender, extensionId: string, getURL: (path: string) => string): boolean {
    if (sender.id !== extensionId || !sender.url)
        return false;
    try {
        const url = new URL(sender.url);
        const base = new URL(getURL(''));
        return url.protocol === base.protocol && url.host === base.host && ['newtab.html', 'popup.html'].some(path => url.pathname === new URL(getURL(path)).pathname);
    }
    catch {
        return false;
    }
}
export function createNativeOrganizationHandler(runtime: OrganizationRuntime, extensionId: string, getURL: (path: string) => string, adopt: typeof adoptHistoricalOrigins = adoptHistoricalOrigins) {
    const executor = createOrganizationExecutor(runtime);
    let pending: Promise<unknown> = Promise.resolve();
    return (message: unknown, sender: NativeOrganizationSender): Promise<unknown> => {
        const handle = async () => {
            if (!permittedSender(sender, extensionId, getURL) || !message || typeof message !== 'object')
                throw new NativeOrganizationError('invalid_request');
            const input = message as Record<string, unknown>;
            if (input.channel !== NATIVE_ORGANIZATION_CHANNEL || !['list', 'start', 'resume', 'restore', 'adopt', 'review-step', 'forget'].includes(String(input.action)))
                throw new NativeOrganizationError('invalid_request');
            const fields = input.action === 'start' ? ['channel', 'action', 'plan'] : input.action === 'adopt' ? ['channel', 'action', 'ids'] : input.action === 'list' ? ['channel', 'action'] : input.action === 'review-step' ? ['channel', 'action', 'id', 'key'] : input.action === 'forget' ? ['channel', 'action', 'id', 'confirmed'] : ['channel', 'action', 'id'];
            if (Object.keys(input).some(key => !fields.includes(key)))
                throw new NativeOrganizationError('invalid_request');
            if (input.action === 'list')
                return { ok: true, result: await runtime.load() };
            if (input.action === 'start')
                return { ok: true, result: await executor.start(input.plan as Parameters<typeof executor.start>[0]) };
            if (input.action === 'adopt') {
                if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 20000 || input.ids.some(id => typeof id !== 'string'))
                    throw new NativeOrganizationError('invalid_request');
                const tree = await runtime.adapter.getTree();
                // Historical adoption is explicitly limited to the actual capture inbox.
                const historical = input.ids.map(id => tree.nodes[id as string]);
                if (historical.some(node => !node?.parentId || tree.nodes[node.parentId]?.title !== 'Bookmark Atlas'
                    || !['other', '2'].includes(tree.nodes[tree.nodes[node.parentId]!.parentId!]?.folderType ?? tree.nodes[node.parentId]!.parentId ?? '')))
                    throw new NativeOrganizationError('invalid_origin');
                await adopt(input.ids as string[], tree);
                return { ok: true, result: null };
            }
            if (typeof input.id !== 'string' || !input.id || input.id.length > 160)
                throw new NativeOrganizationError('invalid_request');
            if (input.action === 'forget') {
                if (input.confirmed !== true)
                    throw new NativeOrganizationError('confirmation_required');
                const records = await runtime.load();
                const record = records.find(item => item.id === input.id);
                if (!record)
                    throw new NativeOrganizationError('record_missing');
                if (!['completed', 'restored'].includes(record.status))
                    throw new NativeOrganizationError('record_unresolved');
                await runtime.save(records.filter(item => item.id !== input.id));
                return { ok: true, result: null };
            }
            if (input.action === 'review-step') {
                if (typeof input.key !== 'string' || !input.key || input.key.length > 160)
                    throw new NativeOrganizationError('invalid_request');
                return { ok: true, result: await executor.acknowledge(input.id, input.key) };
            }
            return { ok: true, result: await (input.action === 'resume' ? executor.resume(input.id) : executor.restore(input.id)) };
        };
        const readOnly = Boolean(message && typeof message === 'object' && (message as Record<string, unknown>).action === 'list');
        const operation = readOnly ? handle() : pending.then(handle);
        if (!readOnly)
            pending = operation.catch(() => { });
        return operation.catch(error => ({ ok: false, error: error instanceof NativeOrganizationError ? error.code : 'failed' }));
    };
}
export function installNativeOrganizationListener(): void {
    const runtime: OrganizationRuntime = {
        adapter: createBookmarkAdapter(), load: loadJournalRecords, save: saveJournalRecords, now: () => Date.now(),
        removeEmptyFolder: async (id) => { await chrome.bookmarks.remove(id); },
        captureOrigins: loadCaptureOrigins,
        afterChange: async (ids, tree, changes, restoring, origins) => { await markOriginsOrganized(ids, tree, restoring, origins); await retainCanvasPathChanges(changes); },
    };
    const handle = createNativeOrganizationHandler(runtime, chrome.runtime.id, path => chrome.runtime.getURL(path));
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!message || message.channel !== NATIVE_ORGANIZATION_CHANNEL)
            return false;
        void handle(message, sender).then(respond);
        return true;
    });
}
export { NATIVE_ORGANIZATION_KEY };
