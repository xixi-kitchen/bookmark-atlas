import { NativeOrganizationError, type NativeJournal } from './types';
import { validateNativePlan } from './tree';
export const NATIVE_ORGANIZATION_KEY = 'bookmark-atlas:native-organization:v1';
export const MAX_COMPLETED_ORGANIZATIONS = 10;
const DATABASE = 'bookmark-atlas-native-organization';
const STORE = 'journal';
const RECORD = 'history';
type HistoryValue = {
    version: 1;
    records: NativeJournal[];
};
function parse(value: unknown): NativeJournal[] {
    if (value === undefined)
        return [];
    const input = value as Partial<HistoryValue>;
    if (!input || input.version !== 1 || !Array.isArray(input.records))
        throw new NativeOrganizationError('invalid_history');
    for (const record of input.records) {
        if (!record || typeof record.id !== 'string' || !record.plan || !Array.isArray(record.steps) || !record.idMap || !Array.isArray(record.pathChanges)
            || !['running', 'completed', 'partial', 'restoring', 'restored', 'needs-review'].includes(record.status)
            || record.id !== record.plan.id || record.steps.length !== record.plan.operations.length)
            throw new NativeOrganizationError('invalid_history');
        validateNativePlan(record.plan);
        if (record.steps.some((step, index) => JSON.stringify(step.operation) !== JSON.stringify(record.plan.operations[index])
            || !['pending', 'running', 'done', 'conflict', 'failed', 'restored'].includes(step.status)))
            throw new NativeOrganizationError('invalid_history');
    }
    return input.records;
}
async function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE))
            request.result.createObjectStore(STORE); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new NativeOrganizationError('storage_unavailable'));
        request.onblocked = () => reject(new NativeOrganizationError('storage_unavailable'));
    });
}
async function transact(mode: IDBTransactionMode, value?: HistoryValue): Promise<unknown> {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE, mode);
            const request = value ? transaction.objectStore(STORE).put(value, RECORD) : transaction.objectStore(STORE).get(RECORD);
            transaction.oncomplete = () => resolve(value ?? request.result);
            transaction.onerror = () => reject(new NativeOrganizationError('storage_unavailable'));
            transaction.onabort = () => reject(new NativeOrganizationError('storage_unavailable'));
        });
    }
    finally {
        db.close();
    }
}
export async function loadJournalRecords(): Promise<NativeJournal[]> {
    const storage = globalThis.chrome?.storage?.local;
    if (!storage)
        throw new NativeOrganizationError('storage_unavailable');
    if (globalThis.indexedDB) {
        const value = await transact('readonly');
        if (value !== undefined)
            return parse(value);
    }
    const value = (await storage.get(NATIVE_ORGANIZATION_KEY))[NATIVE_ORGANIZATION_KEY];
    if (value?.backend === 'indexeddb')
        throw new NativeOrganizationError('storage_unavailable');
    return parse(value);
}
export async function saveJournalRecords(records: NativeJournal[]): Promise<void> {
    const storage = globalThis.chrome?.storage?.local;
    if (!storage)
        throw new NativeOrganizationError('storage_unavailable');
    const completed = records.filter(record => ['completed', 'restored'].includes(record.status)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_COMPLETED_ORGANIZATIONS);
    const keep = new Set(completed.map(record => record.id));
    const retained = records.filter(record => keep.has(record.id) || !['completed', 'restored'].includes(record.status));
    // The normalized map is sufficient for recovery; nested children duplicate whole subtrees.
    const compact = structuredClone(retained);
    for (const record of compact) {
        for (const tree of [record.plan.baseline, record.restoreBaseline]) {
            if (tree)
                for (const node of Object.values(tree.nodes))
                    delete node.children;
        }
    }
    const value: HistoryValue = { version: 1, records: compact };
    parse(value);
    if (globalThis.indexedDB) {
        await transact('readwrite', value);
        // The journal is already durable. A notification failure never erases that saved state.
        await storage.set({ [NATIVE_ORGANIZATION_KEY]: { version: 1, backend: 'indexeddb', notification: crypto.randomUUID() } }).catch(() => undefined);
    }
    else
        await storage.set({ [NATIVE_ORGANIZATION_KEY]: value });
}
